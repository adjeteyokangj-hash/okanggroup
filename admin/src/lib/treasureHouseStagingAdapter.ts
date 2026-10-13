/**
 * Treasure House staging adapter contract (prepared, not connected).
 *
 * Reuses the OkangGroup gateway HTTP protocol already proven by `okang_dev_client`:
 *   GET  /health
 *   GET  /v1/capabilities
 *   GET  /v1/modules/:code/content
 *   PUT  /v1/modules/:code/content
 *   POST /v1/modules/:code/publish
 *   POST /v1/modules/:code/rollback
 *
 * Do not configure cms_connections.base_url until an isolated TH staging host
 * exists and C3-01 authorises Pilot 2 staging work. Production remains HOLD.
 */

export const TH_STAGING_ADAPTER_CODE = 'treasure_house_staging' as const;

/** Vault credential_ref prefix required for non-production secrets. */
export const TH_STAGING_CREDENTIAL_REF_PREFIX = 'dev/treasure-house-staging';

/** Minimum modules for the first staging integration test (Test B). */
export const TH_STAGING_FIRST_WAVE_MODULES = [
  'ministries',
  'homepage',
  'quick_cards',
  'leadership',
] as const;

export type ThStagingFirstWaveModule = (typeof TH_STAGING_FIRST_WAVE_MODULES)[number];

/** Full public website module catalogue expected on a TH staging bridge. */
export const TH_STAGING_MODULE_CATALOGUE = [
  ...TH_STAGING_FIRST_WAVE_MODULES,
  'hero',
  'collage',
  'live_stream',
  'pages',
  'navigation',
  'settings',
  'media',
] as const;

/**
 * Hostnames that must never be used as cms_connections.base_url for staging.
 * Device UAT / production frontends that share the live Supabase project are excluded.
 */
export const TH_PRODUCTION_HOST_DENYLIST = [
  'thbci.org',
  'www.thbci.org',
  'treasurehousebci.org',
  'www.treasurehousebci.org',
  'gmyhzxxqiokklybebzpf.supabase.co',
] as const;

export type ThStagingEndpointGap = {
  endpoint: string;
  status: 'missing_on_th_app' | 'exists_unrelated' | 'gateway_ready';
  notes: string;
};

/** Gaps between gateway protocol and the current Treasure House application. */
export const TH_STAGING_ENDPOINT_GAPS: ThStagingEndpointGap[] = [
  {
    endpoint: 'GET /health',
    status: 'missing_on_th_app',
    notes:
      'Live TH app has no route. Prepared in OkangGroup package staging/treasure-house (not connected).',
  },
  {
    endpoint: 'GET /v1/capabilities',
    status: 'missing_on_th_app',
    notes: 'Prepared in staging/treasure-house bridge; live TH app unchanged.',
  },
  {
    endpoint: 'GET|PUT /v1/modules/:code/content',
    status: 'missing_on_th_app',
    notes:
      'Prepared in staging/treasure-house bridge. Live TH still uses server actions only.',
  },
  {
    endpoint: 'POST /v1/modules/:code/publish',
    status: 'missing_on_th_app',
    notes: 'Prepared in staging/treasure-house bridge; not activated.',
  },
  {
    endpoint: 'POST /v1/modules/:code/rollback',
    status: 'missing_on_th_app',
    notes: 'Prepared in staging/treasure-house bridge; not activated.',
  },
  {
    endpoint: 'GET /api/youtube/live',
    status: 'exists_unrelated',
    notes: 'Public YouTube live status only — not a CMS content integration endpoint.',
  },
  {
    endpoint: 'cms-integration-gateway',
    status: 'gateway_ready',
    notes: 'OkangGroup Edge gateway already speaks the protocol above for HTTP adapters.',
  },
];

export type ThMinistryPayload = {
  slug: string;
  name: string;
  summary: string;
  body: string;
  featured_asset_id: string | null;
  image_alt: string;
  object_position: string;
  sort_order: number;
  is_published: boolean;
};

export type ThLeaderPayload = {
  slug: string;
  display_name: string;
  role_title: string;
  summary: string;
  bio: string;
  photo_asset_id: string | null;
  sort_order: number;
  draft_status: 'draft' | 'ready' | 'archived';
};

/** Map OkangGroup shadow custom-record data → TH ministries row shape. */
export function mapShadowMinistryToTh(data: Record<string, unknown>): ThMinistryPayload {
  const featured =
    (typeof data.featured_asset_id === 'string' && data.featured_asset_id) ||
    (typeof data.image_url === 'string' && data.image_url.startsWith('asset:')
      ? data.image_url.slice('asset:'.length)
      : null);

  return {
    slug: String(data.slug ?? ''),
    name: String(data.name ?? data.title ?? ''),
    summary: String(data.summary ?? ''),
    body: String(data.body ?? ''),
    featured_asset_id: featured,
    image_alt: String(data.image_alt ?? ''),
    object_position: String(data.object_position ?? 'center center'),
    sort_order: Number(data.sort_order ?? 100),
    is_published: Boolean(data.is_published ?? false),
  };
}

/** Map shadow leadership record → website_leaders shape. */
export function mapShadowLeadershipToTh(data: Record<string, unknown>): ThLeaderPayload {
  return {
    slug: String(data.slug ?? ''),
    display_name: String(data.display_name ?? data.name ?? ''),
    role_title: String(data.role_title ?? ''),
    summary: String(data.summary ?? ''),
    bio: String(data.bio ?? data.body ?? ''),
    photo_asset_id:
      typeof data.photo_asset_id === 'string'
        ? data.photo_asset_id
        : typeof data.image_url === 'string' && data.image_url.startsWith('asset:')
          ? data.image_url.slice('asset:'.length)
          : null,
    sort_order: Number(data.sort_order ?? 100),
    draft_status:
      data.draft_status === 'ready' || data.draft_status === 'archived'
        ? data.draft_status
        : 'draft',
  };
}

/**
 * Reject production / shared-live hosts. Staging base_url must be an isolated host
 * with its own database credentials (never the live Supabase project ref).
 */
export function isDeniedThStagingBaseUrl(baseUrl: string): boolean {
  let host = '';
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return true;
  }
  return TH_PRODUCTION_HOST_DENYLIST.some(
    (denied) => host === denied || host.endsWith(`.${denied}`),
  );
}

export function assertSafeThStagingBaseUrl(baseUrl: string): void {
  if (!baseUrl || isDeniedThStagingBaseUrl(baseUrl)) {
    throw new Error(
      'Refused: base_url is missing, invalid, or matches a production / shared-live Treasure House host.',
    );
  }
}

export function isThStagingCredentialRef(ref: string): boolean {
  const normalised = ref.trim().toLowerCase();
  return (
    normalised === TH_STAGING_CREDENTIAL_REF_PREFIX ||
    normalised.startsWith(`${TH_STAGING_CREDENTIAL_REF_PREFIX}/`)
  );
}
