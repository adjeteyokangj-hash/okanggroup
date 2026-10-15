/** Treasure House website CMS shadow — nav + inventory mirrors (no live TH data). */

export const TH_SHADOW_SLUG = 'treasure-house-shadow';
export const TH_SHADOW_INSTANCE_ID = 'c8a1b2d3-e4f5-4678-9abc-111111111102';

export type ThShadowNavItem = {
  key: string;
  label: string;
  /** Custom module_code when section is record-based */
  moduleCode?: string;
  kind: 'dashboard' | 'module' | 'media' | 'info';
  description: string;
};

/** Mirrors treasure-house-app WebsiteCmsNav (website CMS only). */
export const TH_SHADOW_NAV: ThShadowNavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    kind: 'dashboard',
    description: 'Website management overview — media, HERO, events counts.',
  },
  {
    key: 'homepage',
    label: 'Homepage',
    moduleCode: 'homepage',
    kind: 'module',
    description: 'Welcome text and section headings (HERO controlled separately).',
  },
  {
    key: 'quick_cards',
    label: 'Quick Cards',
    moduleCode: 'quick_cards',
    kind: 'module',
    description: 'Homepage card names, icons, destinations, visibility, order.',
  },
  {
    key: 'live_stream',
    label: 'Live Stream',
    moduleCode: 'live_stream',
    kind: 'module',
    description: 'Public live stream settings.',
  },
  {
    key: 'mobile_designer',
    label: 'Mobile Designer',
    kind: 'info',
    description:
      'Device layout overrides — stored in homepage sections_json / layouts on staging map; edit homepage document for shadow UAT.',
  },
  {
    key: 'hero',
    label: 'HERO Manager',
    moduleCode: 'hero',
    kind: 'module',
    description: 'Flexible HERO designs, panels, CTA, activate one.',
  },
  {
    key: 'collage',
    label: 'Collage Studio',
    moduleCode: 'collage',
    kind: 'module',
    description: 'Animated collage compositions.',
  },
  {
    key: 'media',
    label: 'Media',
    kind: 'media',
    description: 'Images and short videos via OkangGroup client CMS media.',
  },
  {
    key: 'leadership',
    label: 'Leadership',
    moduleCode: 'leadership',
    kind: 'module',
    description: 'Public leadership profiles with photographs.',
  },
  {
    key: 'ministries',
    label: 'Ministries',
    moduleCode: 'ministries',
    kind: 'module',
    description: 'Featured photographs, visibility, gallery notes.',
  },
  {
    key: 'sermons',
    label: 'Sermons',
    moduleCode: 'sermons',
    kind: 'module',
    description: 'Public sermon catalogue (synthetic).',
  },
  {
    key: 'events',
    label: 'Events & Programmes',
    moduleCode: 'events',
    kind: 'module',
    description: 'Scheduling, descriptions, images.',
  },
  {
    key: 'pages',
    label: 'Pages',
    moduleCode: 'pages',
    kind: 'module',
    description: 'About, Ministries, Sermons, Events, Contact page copy.',
  },
  {
    key: 'navigation',
    label: 'Navigation',
    moduleCode: 'navigation',
    kind: 'module',
    description: 'Public menu links.',
  },
  {
    key: 'history',
    label: 'History',
    kind: 'info',
    description: 'Use OkangGroup submit → approve → publish + custom record status for rollback readiness.',
  },
  {
    key: 'settings',
    label: 'Settings',
    moduleCode: 'settings',
    kind: 'module',
    description: 'Client-specific website configuration (non-sensitive).',
  },
];

export const TH_SHADOW_EXCLUDED = [
  'membership',
  'pastoral',
  'prayer_requests',
  'giving',
  'safeguarding',
  'finance',
  'private_vault',
] as const;

/** Administration-only sections — stay in CMS Management, not Visual Studio Layers. */
export const TH_ADMIN_NAV_KEYS = new Set([
  'dashboard',
  'media',
  'history',
  'settings',
  'mobile_designer',
]);

/** Website content modules that Visual Studio can open for shadow page editing. */
export function thVisualNavItems(): ThShadowNavItem[] {
  return TH_SHADOW_NAV.filter((n) => n.kind === 'module' && n.moduleCode && !TH_ADMIN_NAV_KEYS.has(n.key));
}

export function isThVisualModule(key: string): boolean {
  return thVisualNavItems().some((n) => n.key === key);
}

/**
 * Field mapping: OkangGroup shadow → Treasure House application schema.
 * Verified 2026-10-12 against treasure-house-app lib/website-cms + migrations /
 * .cms-migration.json foundation (read-only inspection).
 */
export const TH_FIELD_MAPPINGS: Array<{
  shadowModule: string;
  shadowField: string;
  thSource: string;
  notes: string;
  verified: boolean;
}> = [
  {
    shadowModule: 'ministries',
    shadowField: 'slug',
    thSource: 'website_ministries.slug',
    notes: 'Direct UNIQUE text',
    verified: true,
  },
  {
    shadowModule: 'ministries',
    shadowField: 'name',
    thSource: 'website_ministries.name',
    notes: 'Direct',
    verified: true,
  },
  {
    shadowModule: 'ministries',
    shadowField: 'summary',
    thSource: 'website_ministries.summary',
    notes: 'Direct',
    verified: true,
  },
  {
    shadowModule: 'ministries',
    shadowField: 'body',
    thSource: 'website_ministries.body',
    notes: 'Direct',
    verified: true,
  },
  {
    shadowModule: 'ministries',
    shadowField: 'image_url',
    thSource: 'website_ministries.featured_asset_id → website_media_assets',
    notes: 'Shadow URL/ref must resolve to media asset id on staging',
    verified: true,
  },
  {
    shadowModule: 'ministries',
    shadowField: 'image_alt',
    thSource: 'website_ministries.image_alt',
    notes: 'Direct',
    verified: true,
  },
  {
    shadowModule: 'ministries',
    shadowField: 'gallery_notes',
    thSource: 'website_ministry_gallery_items (caption/alt/sort)',
    notes: 'Shadow stores notes; TH uses relational gallery rows',
    verified: true,
  },
  {
    shadowModule: 'leadership',
    shadowField: 'slug',
    thSource: 'website_leaders.slug',
    notes: 'Direct UNIQUE text',
    verified: true,
  },
  {
    shadowModule: 'leadership',
    shadowField: 'role_title',
    thSource: 'website_leaders.role_title',
    notes: 'Direct',
    verified: true,
  },
  {
    shadowModule: 'leadership',
    shadowField: 'display_name',
    thSource: 'website_leaders.display_name',
    notes: 'Direct',
    verified: true,
  },
  {
    shadowModule: 'leadership',
    shadowField: 'photo_asset_id',
    thSource: 'website_leaders.photo_asset_id',
    notes: 'FK to website_media_assets',
    verified: true,
  },
  {
    shadowModule: 'homepage',
    shadowField: 'welcome_long',
    thSource: "website_documents(doc_key='homepage').draft_document.welcome_long",
    notes: 'HomepageDocument v3 JSON',
    verified: true,
  },
  {
    shadowModule: 'quick_cards',
    shadowField: 'href',
    thSource: "website_documents(doc_key='homepage').draft_document.quick_cards[].href",
    notes: 'Embedded in homepage document, not a separate table',
    verified: true,
  },
  {
    shadowModule: 'hero',
    shadowField: 'panels_json',
    thSource: 'website_hero_designs.draft_document.panels',
    notes: 'HeroDocument.panels[]; activation via website_hero_runtime',
    verified: true,
  },
  {
    shadowModule: 'collage',
    shadowField: 'config_json',
    thSource: 'website_collages.draft_document',
    notes: 'CollageConfig JSON; may link to hero design',
    verified: true,
  },
  {
    shadowModule: 'navigation',
    shadowField: 'href',
    thSource: "website_documents(doc_key='navigation').draft_document.items[].href",
    notes: 'Document JSON items array',
    verified: true,
  },
  {
    shadowModule: 'settings',
    shadowField: 'site_title',
    thSource: "website_documents(doc_key='settings').draft_document / seo fields",
    notes: 'WebsiteSettingsDocument + youtube/podcast flags; site_title may map to seo_title',
    verified: true,
  },
  {
    shadowModule: 'live_stream',
    shadowField: 'stream_url',
    thSource: "website_documents(doc_key='settings') YouTube live fields",
    notes: 'Managed via LiveStreamManager against settings document + /api/youtube/live',
    verified: true,
  },
  {
    shadowModule: 'pages',
    shadowField: 'slug',
    thSource: 'website_documents.doc_key (page:* or slug keys)',
    notes: 'TH pages admin edits website_documents rows',
    verified: true,
  },
  {
    shadowModule: 'events',
    shadowField: 'starts_at',
    thSource: 'No dedicated website_events CMS table in inspected schema',
    notes: 'Public events/programmes surface; portal calendar — first-wave staging OUT OF SCOPE',
    verified: false,
  },
  {
    shadowModule: 'sermons',
    shadowField: 'speaker',
    thSource: 'No dedicated website_sermons CMS table in inspected schema',
    notes: 'No /admin/website/sermons CRUD; first-wave staging OUT OF SCOPE',
    verified: false,
  },
];
