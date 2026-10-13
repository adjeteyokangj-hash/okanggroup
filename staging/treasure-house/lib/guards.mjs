/**
 * Production / shared-live host denylist for Treasure House staging.
 * Device UAT that shares the live Supabase project is not isolation.
 */
export const TH_PRODUCTION_HOST_DENYLIST = [
  'thbci.org',
  'www.thbci.org',
  'treasurehousebci.org',
  'www.treasurehousebci.org',
  'gmyhzxxqiokklybebzpf.supabase.co',
];

export const TH_STAGING_CREDENTIAL_REF_PREFIX = 'dev/treasure-house-staging';

export const TH_STAGING_FIRST_WAVE_MODULES = [
  'ministries',
  'homepage',
  'quick_cards',
  'leadership',
];

export function hostnameOf(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    if (value.includes('://')) return new URL(value).hostname.toLowerCase();
    return value.toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  } catch {
    return '';
  }
}

export function isDeniedHost(value) {
  const host = hostnameOf(value);
  if (!host) return true;
  return TH_PRODUCTION_HOST_DENYLIST.some(
    (denied) => host === denied || host.endsWith(`.${denied}`),
  );
}

export function assertSafeStagingUrl(label, value) {
  if (!value) return;
  if (isDeniedHost(value)) {
    throw new Error(
      `[th-staging] Refused ${label}: "${value}" matches a production / shared-live Treasure House host. Use a separate staging project.`,
    );
  }
}

export function assertStagingEnvironment(env = process.env) {
  const environment = String(env.TH_STAGING_ENVIRONMENT || 'staging').toLowerCase();
  if (environment === 'production' || environment === 'prod' || environment === 'live') {
    throw new Error('[th-staging] Refused: TH_STAGING_ENVIRONMENT cannot be production/live.');
  }

  assertSafeStagingUrl('TH_STAGING_SUPABASE_URL', env.TH_STAGING_SUPABASE_URL);
  assertSafeStagingUrl('TH_STAGING_SITE_URL', env.TH_STAGING_SITE_URL);
  assertSafeStagingUrl('NEXT_PUBLIC_SUPABASE_URL', env.NEXT_PUBLIC_SUPABASE_URL);
  assertSafeStagingUrl('NEXT_PUBLIC_SITE_URL', env.NEXT_PUBLIC_SITE_URL);

  // Hard-fail if someone exports the known live project ref into any staging var.
  for (const [key, val] of Object.entries(env)) {
    if (!key || typeof val !== 'string') continue;
    if (!/SUPABASE|SITE_URL|BASE_URL|STAGING/i.test(key)) continue;
    if (val.includes('gmyhzxxqiokklybebzpf') || /thbci\.org/i.test(val)) {
      throw new Error(`[th-staging] Refused env ${key}: contains production / shared-live host.`);
    }
  }

  return { environment };
}

export function isThStagingCredentialRef(ref) {
  const normalised = String(ref || '')
    .trim()
    .toLowerCase();
  return (
    normalised === TH_STAGING_CREDENTIAL_REF_PREFIX ||
    normalised.startsWith(`${TH_STAGING_CREDENTIAL_REF_PREFIX}/`)
  );
}
