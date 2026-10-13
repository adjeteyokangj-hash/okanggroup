-- M33: Centralised CMS platform — extend registry for Generic / Custom / Hybrid
-- Preserves existing cms_instances, documents, media, grants, revisions.
-- No new Owner permission catalogue codes.

-- ---------------------------------------------------------------------------
-- 1) Instance configuration
-- ---------------------------------------------------------------------------
ALTER TABLE public.cms_instances
  ADD COLUMN IF NOT EXISTS cms_config_type text NOT NULL DEFAULT 'generic'
    CHECK (cms_config_type IN ('generic', 'custom', 'hybrid')),
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS public_site_url text,
  ADD COLUMN IF NOT EXISTS brand_json jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.cms_instances
SET cms_config_type = 'generic',
    activated_at = COALESCE(activated_at, created_at)
WHERE id = 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf';

-- ---------------------------------------------------------------------------
-- 2) Expanded staff/client capabilities on grants
-- ---------------------------------------------------------------------------
ALTER TABLE public.cms_instance_grants
  ADD COLUMN IF NOT EXISTS can_upload_media boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_content boolean NOT NULL DEFAULT false;

UPDATE public.cms_instance_grants
SET can_upload_media = can_edit,
    can_review = can_publish,
    can_manage_content = can_publish
WHERE true;

-- ---------------------------------------------------------------------------
-- 3) Document / page management columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_cms_documents
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS nav_order int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'visible'
    CHECK (visibility IN ('visible', 'hidden', 'unlisted')),
  ADD COLUMN IF NOT EXISTS seo_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS template_code text,
  ADD COLUMN IF NOT EXISTS scheduled_publish_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS document_kind text NOT NULL DEFAULT 'page'
    CHECK (document_kind IN ('page', 'custom_record', 'partial'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_cms_documents_parent_fk'
  ) THEN
    ALTER TABLE public.client_cms_documents
      ADD CONSTRAINT client_cms_documents_parent_fk
      FOREIGN KEY (client_id, parent_id)
      REFERENCES public.client_cms_documents (client_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.client_cms_revisions DROP CONSTRAINT IF EXISTS client_cms_revisions_action_check;
ALTER TABLE public.client_cms_revisions
  ADD CONSTRAINT client_cms_revisions_action_check CHECK (action IN (
    'save', 'submit', 'approve', 'reject', 'publish', 'rollback',
    'restore', 'archive', 'duplicate', 'schedule'
  ));

-- ---------------------------------------------------------------------------
-- 4) Media folders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_media_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  parent_id uuid,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cms_instance_id, parent_id, name),
  UNIQUE (client_id, id),
  CONSTRAINT cms_media_folders_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id) ON DELETE CASCADE
);

ALTER TABLE public.client_cms_media
  ADD COLUMN IF NOT EXISTS folder_id uuid,
  ADD COLUMN IF NOT EXISTS meta_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS replaced_by uuid;

-- ---------------------------------------------------------------------------
-- 5) Templates (platform library — no client secrets)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  description text,
  preview_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  body_json jsonb NOT NULL,
  is_system boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 6) Custom module definitions + records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_custom_module_defs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  module_code text NOT NULL,
  module_name text NOT NULL,
  description text,
  fields_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_approval boolean NOT NULL DEFAULT true,
  requires_client_approval boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cms_instance_id, module_code),
  UNIQUE (client_id, id),
  CONSTRAINT cms_custom_module_defs_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.cms_custom_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  module_def_id uuid NOT NULL,
  title text NOT NULL,
  data_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'published', 'rejected', 'archived')),
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  CONSTRAINT cms_custom_records_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id) ON DELETE CASCADE,
  CONSTRAINT cms_custom_records_module_fk
    FOREIGN KEY (client_id, module_def_id)
    REFERENCES public.cms_custom_module_defs (client_id, id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------------
-- 7) Content review comments + publish jobs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_content_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  document_id uuid,
  custom_record_id uuid,
  author_id uuid NOT NULL REFERENCES public.profiles (id),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cms_content_comments_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.cms_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  document_id uuid,
  custom_record_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  adapter_code text,
  attempt_count int NOT NULL DEFAULT 0,
  last_error text,
  verification_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT cms_publish_jobs_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.cms_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cms_audit_events_instance_idx
  ON public.cms_audit_events (cms_instance_id, created_at DESC);
