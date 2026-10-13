-- M32: Client CMS media storage for visual editor (Stage 1 foundation)
-- Bucket holds images only; access gated by cms_instance grants / clients.manage.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-cms-media',
  'client-cms-media',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE
SET file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.client_cms_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  storage_path text NOT NULL UNIQUE,
  alt_text text,
  uploaded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (client_id, id),
  CONSTRAINT client_cms_media_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS client_cms_media_instance_idx
  ON public.client_cms_media (cms_instance_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.client_cms_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_cms_media FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_cms_media_select ON public.client_cms_media;
CREATE POLICY client_cms_media_select ON public.client_cms_media
  FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));

DROP POLICY IF EXISTS client_cms_media_insert ON public.client_cms_media;
CREATE POLICY client_cms_media_insert ON public.client_cms_media
  FOR INSERT TO authenticated
  WITH CHECK (private.can_edit_cms_instance(cms_instance_id));

DROP POLICY IF EXISTS client_cms_media_update ON public.client_cms_media;
CREATE POLICY client_cms_media_update ON public.client_cms_media
  FOR UPDATE TO authenticated
  USING (private.can_edit_cms_instance(cms_instance_id))
  WITH CHECK (private.can_edit_cms_instance(cms_instance_id));

GRANT SELECT, INSERT, UPDATE ON public.client_cms_media TO authenticated;

-- Storage policies: path = {client_id}/{cms_instance_id}/...
DROP POLICY IF EXISTS client_cms_media_storage_select ON storage.objects;
CREATE POLICY client_cms_media_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'client-cms-media'
    AND private.can_view_cms_instance((storage.foldername(name))[2]::uuid)
  );

DROP POLICY IF EXISTS client_cms_media_storage_insert ON storage.objects;
CREATE POLICY client_cms_media_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'client-cms-media'
    AND private.can_edit_cms_instance((storage.foldername(name))[2]::uuid)
  );

DROP POLICY IF EXISTS client_cms_media_storage_update ON storage.objects;
CREATE POLICY client_cms_media_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'client-cms-media'
    AND private.can_edit_cms_instance((storage.foldername(name))[2]::uuid)
  )
  WITH CHECK (
    bucket_id = 'client-cms-media'
    AND private.can_edit_cms_instance((storage.foldername(name))[2]::uuid)
  );

DROP POLICY IF EXISTS client_cms_media_storage_delete ON storage.objects;
CREATE POLICY client_cms_media_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'client-cms-media'
    AND private.can_edit_cms_instance((storage.foldername(name))[2]::uuid)
  );
