-- Treasure House STAGING — website CMS schema (isolated project only)
-- Apply ONLY to a separate Supabase staging project created by the Owner.
-- DO NOT run against gmyhzxxqiokklybebzpf (live / shared Device UAT).
-- Synthetic-capable foundation aligned with treasure-house-app website CMS.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.website_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('storage', 'public_path')),
  storage_path text,
  public_path text,
  original_filename text,
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  name text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
  category text NOT NULL DEFAULT 'general',
  description text NOT NULL DEFAULT '',
  alt_text text NOT NULL DEFAULT '',
  duration_seconds numeric,
  thumbnail_path text,
  focal_desktop jsonb NOT NULL DEFAULT '{"x":0.5,"y":0.35}'::jsonb,
  focal_tablet jsonb,
  focal_mobile jsonb,
  zoom_desktop numeric NOT NULL DEFAULT 1,
  zoom_tablet numeric,
  zoom_mobile numeric,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT website_media_source_chk CHECK (
    (source_kind = 'storage' AND storage_path IS NOT NULL)
    OR (source_kind = 'public_path' AND public_path IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.website_leaders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role_title text NOT NULL DEFAULT '',
  summary text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  photo_asset_id uuid REFERENCES public.website_media_assets (id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 100,
  draft_status text NOT NULL DEFAULT 'draft'
    CHECK (draft_status IN ('draft', 'ready', 'archived')),
  published_snapshot jsonb,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key text NOT NULL UNIQUE,
  title text NOT NULL DEFAULT '',
  draft_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_document jsonb,
  seo_title text,
  seo_description text,
  draft_updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.website_ministries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  featured_asset_id uuid REFERENCES public.website_media_assets(id) ON DELETE SET NULL,
  image_alt text NOT NULL DEFAULT '',
  object_position text NOT NULL DEFAULT 'center center',
  sort_order integer NOT NULL DEFAULT 100,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_ministry_gallery_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id uuid NOT NULL REFERENCES public.website_ministries(id) ON DELETE CASCADE,
  media_asset_id uuid NOT NULL REFERENCES public.website_media_assets(id) ON DELETE CASCADE,
  caption text NOT NULL DEFAULT '',
  alt_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  snapshot jsonb,
  previous_snapshot jsonb,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_hero_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  design_kind text NOT NULL DEFAULT 'panels' CHECK (design_kind IN ('panels', 'collage')),
  draft_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_document jsonb,
  is_system_default boolean NOT NULL DEFAULT false,
  draft_status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.website_hero_runtime (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_design_id uuid REFERENCES public.website_hero_designs(id) ON DELETE SET NULL,
  default_design_id uuid REFERENCES public.website_hero_designs(id) ON DELETE SET NULL,
  scheduled_design_id uuid REFERENCES public.website_hero_designs(id) ON DELETE SET NULL,
  schedule_starts_at timestamptz,
  schedule_ends_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.website_collages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  draft_document jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_document jsonb,
  linked_hero_design_id uuid REFERENCES public.website_hero_designs(id) ON DELETE SET NULL,
  draft_status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Staging marker (helps refuse accidental live use in reviews)
CREATE TABLE IF NOT EXISTS public.th_staging_meta (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  environment text NOT NULL DEFAULT 'staging',
  live_production boolean NOT NULL DEFAULT false,
  synthetic_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.th_staging_meta (id, environment, live_production, synthetic_only)
VALUES (1, 'staging', false, true)
ON CONFLICT (id) DO UPDATE SET
  environment = EXCLUDED.environment,
  live_production = false,
  synthetic_only = true;
