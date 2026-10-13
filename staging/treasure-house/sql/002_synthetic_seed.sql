-- Treasure House STAGING — synthetic seed only (no live church records).
-- Apply only after 001_website_cms_schema.sql on an isolated staging project.

INSERT INTO public.website_media_assets (
  id, source_kind, public_path, original_filename, alt_text, mime_type, name, category
) VALUES
  (
    'b1111111-1111-4111-8111-111111111101',
    'public_path',
    '/staging/synthetic-ministry.jpg',
    'synthetic-ministry.jpg',
    'Synthetic ministry image',
    'image/jpeg',
    'Synthetic Ministry',
    'ministry'
  ),
  (
    'b2222222-2222-4222-8222-222222222202',
    'public_path',
    '/staging/synthetic-leader.jpg',
    'synthetic-leader.jpg',
    'Synthetic leader image',
    'image/jpeg',
    'Synthetic Leader',
    'leadership'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.website_ministries (
  slug, name, summary, body, featured_asset_id, sort_order, is_published
) VALUES
  (
    'youth-staging',
    'Youth (Staging)',
    'Synthetic youth ministry for OkangGroup staging tests.',
    'Synthetic body — not live church content.',
    'b1111111-1111-4111-8111-111111111101',
    10,
    false
  ),
  (
    'worship-staging',
    'Worship (Staging)',
    'Synthetic worship ministry record.',
    'Synthetic body only.',
    NULL,
    20,
    false
  )
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  summary = EXCLUDED.summary,
  body = EXCLUDED.body,
  updated_at = now();

INSERT INTO public.website_leaders (
  slug, display_name, role_title, summary, bio, photo_asset_id, sort_order, draft_status
) VALUES
  (
    'pastor-staging',
    'Pastor Staging',
    'Pastor (Synthetic)',
    'Synthetic leadership profile for staging only.',
    'Not a real pastoral record. Sensitive church modules excluded from staging seed.',
    'b2222222-2222-4222-8222-222222222202',
    10,
    'draft'
  )
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role_title = EXCLUDED.role_title,
  summary = EXCLUDED.summary,
  bio = EXCLUDED.bio,
  updated_at = now();

INSERT INTO public.website_documents (
  doc_key, title, draft_document, published_document, seo_title, seo_description
) VALUES
  (
    'homepage',
    'Homepage (Staging)',
    jsonb_build_object(
      'version', 3,
      'welcome_long', 'Synthetic Treasure House staging homepage welcome.',
      'intro_heading', 'Welcome (Staging)',
      'show_quick_cards', true,
      'quick_cards', jsonb_build_array(
        jsonb_build_object(
          'href', '/live',
          'label', 'Live Stream',
          'detail', 'Synthetic card',
          'icon', 'live',
          'visible', true
        ),
        jsonb_build_object(
          'href', '/bible',
          'label', 'Holy Bible',
          'detail', 'Synthetic card',
          'icon', 'bible',
          'visible', true
        )
      ),
      'synthetic', true
    ),
    NULL,
    'Treasure House Staging',
    'Synthetic staging site — not production.'
  ),
  (
    'navigation',
    'Navigation (Staging)',
    jsonb_build_object(
      'items', jsonb_build_array(
        jsonb_build_object('label', 'Home', 'href', '/'),
        jsonb_build_object('label', 'About', 'href', '/about')
      ),
      'synthetic', true
    ),
    NULL,
    NULL,
    NULL
  ),
  (
    'settings',
    'Settings (Staging)',
    jsonb_build_object(
      'site_title', 'Treasure House (Staging)',
      'tagline', 'Isolated staging',
      'show_live_stream_cta', false,
      'youtube_handle', '@thbci-staging-synthetic',
      'synthetic', true
    ),
    NULL,
    NULL,
    NULL
  )
ON CONFLICT (doc_key) DO UPDATE SET
  title = EXCLUDED.title,
  draft_document = EXCLUDED.draft_document,
  draft_updated_at = now();
