/** Shadow CMS record → Treasure House staging payload shapes (first wave). */

export function mapShadowMinistryToTh(data = {}) {
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

export function mapShadowLeadershipToTh(data = {}) {
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

export function mapShadowHomepageToTh(data = {}) {
  return {
    version: 3,
    welcome_long: String(data.welcome_long ?? ''),
    intro_heading: String(data.intro_heading ?? 'Welcome'),
    show_quick_cards: data.show_quick_cards !== false,
    synthetic: true,
  };
}

export function mapShadowQuickCardsToTh(data = {}) {
  const cards = Array.isArray(data.cards)
    ? data.cards
    : Array.isArray(data.items)
      ? data.items
      : [
          {
            href: String(data.href ?? '/visit'),
            label: String(data.label ?? data.title ?? 'Visit'),
            detail: String(data.detail ?? ''),
            icon: String(data.icon ?? 'church'),
            visible: data.visible !== false,
          },
        ];
  return { quick_cards: cards, synthetic: true };
}
