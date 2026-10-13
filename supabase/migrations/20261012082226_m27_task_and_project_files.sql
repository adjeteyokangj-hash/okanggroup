-- M27: Task attachments + project documents + private Storage buckets
-- Reuses tasks.manage / tasks.execute / projects.read|manage. Owner permission count unchanged.

-- ---------------------------------------------------------------------------
-- 1. Metadata: task_attachments
-- ---------------------------------------------------------------------------
CREATE TABLE public.task_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients (id),
  role text NOT NULL CHECK (role IN ('instruction', 'work_upload')),
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  storage_path text NOT NULL UNIQUE,
  version_of uuid REFERENCES public.task_attachments (id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT task_attachments_client_chk CHECK (
    client_id IS NULL OR client_id IS NOT NULL
  )
);

CREATE INDEX task_attachments_task_id_idx ON public.task_attachments (task_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.can_read_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = p_task_id
      AND (
        (t.is_internal AND private.has_permission('tasks.read'))
        OR (t.client_id IS NOT NULL AND private.has_permission_on_client('tasks.read', t.client_id))
        OR t.created_by = auth.uid()
        OR private.is_active_task_assignee(t.id)
      )
  );
$$;

REVOKE ALL ON FUNCTION private.can_read_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_task(uuid) TO authenticated;

CREATE POLICY task_attachments_select ON public.task_attachments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND private.can_read_task(task_id)
  );

CREATE POLICY task_attachments_insert ON public.task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (
          (role = 'instruction' AND private.can_manage_task(t.is_internal, t.client_id))
          OR (
            role = 'work_upload'
            AND (
              private.can_manage_task(t.is_internal, t.client_id)
              OR (
                private.can_execute_task(t.is_internal, t.client_id)
                AND private.is_active_task_assignee(t.id)
              )
            )
          )
        )
        AND (client_id IS NOT DISTINCT FROM t.client_id)
    )
  );

-- Soft-delete / metadata update: manage can touch any; staff only own work_uploads
CREATE POLICY task_attachments_update ON public.task_attachments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (
          private.can_manage_task(t.is_internal, t.client_id)
          OR (
            role = 'work_upload'
            AND uploaded_by = auth.uid()
            AND private.can_execute_task(t.is_internal, t.client_id)
            AND private.is_active_task_assignee(t.id)
          )
        )
    )
  )
  WITH CHECK (
    uploaded_by = uploaded_by
  );

-- Hard delete forbidden for instruction by staff — only manage; staff work_upload own rows
CREATE POLICY task_attachments_delete ON public.task_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_attachments.task_id
        AND private.can_manage_task(t.is_internal, t.client_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_attachments TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Metadata: project_documents
-- ---------------------------------------------------------------------------
CREATE TABLE public.project_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id),
  project_id uuid NOT NULL,
  title text NOT NULL,
  doc_type text NOT NULL DEFAULT 'general',
  file_name text NOT NULL,
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 26214400),
  storage_path text NOT NULL UNIQUE,
  uploaded_by uuid NOT NULL REFERENCES public.profiles (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (client_id, id),
  CONSTRAINT project_documents_project_fk
    FOREIGN KEY (client_id, project_id)
    REFERENCES public.projects (client_id, id)
    ON DELETE CASCADE
);

CREATE INDEX project_documents_project_idx
  ON public.project_documents (project_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY project_documents_select ON public.project_documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND private.has_permission_on_client('projects.read', client_id)
  );

CREATE POLICY project_documents_insert ON public.project_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND private.has_permission_on_client('projects.manage', client_id)
  );

CREATE POLICY project_documents_update ON public.project_documents
  FOR UPDATE TO authenticated
  USING (private.has_permission_on_client('projects.manage', client_id))
  WITH CHECK (private.has_permission_on_client('projects.manage', client_id));

CREATE POLICY project_documents_delete ON public.project_documents
  FOR DELETE TO authenticated
  USING (private.has_permission_on_client('projects.manage', client_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_documents TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage buckets (private)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'task-files',
    'task-files',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-zip-compressed',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'text/plain'
    ]
  ),
  (
    'project-files',
    'project-files',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip',
      'application/x-zip-compressed',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'text/plain'
    ]
  )
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = false;

-- Path: task-files / {client_id|internal} / {task_id} / {role} / {uuid_filename}
-- Access tied to task readability / manage / execute assignee
CREATE OR REPLACE FUNCTION private.storage_task_id_from_name(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 2), '')::uuid;
$$;

-- Actually path is: {client_or_internal}/{task_id}/{role}/{file}
CREATE OR REPLACE FUNCTION private.storage_task_id_from_path(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 2), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION private.storage_project_id_from_path(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(object_name, '/', 2), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION private.storage_client_id_from_path(object_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT split_part(object_name, '/', 1);
$$;

DROP POLICY IF EXISTS task_files_select ON storage.objects;
DROP POLICY IF EXISTS task_files_insert ON storage.objects;
DROP POLICY IF EXISTS task_files_update ON storage.objects;
DROP POLICY IF EXISTS task_files_delete ON storage.objects;

CREATE POLICY task_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'task-files'
    AND private.can_read_task(private.storage_task_id_from_path(name))
  );

CREATE POLICY task_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-files'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = private.storage_task_id_from_path(name)
        AND (
          (
            split_part(name, '/', 3) = 'instruction'
            AND private.can_manage_task(t.is_internal, t.client_id)
          )
          OR (
            split_part(name, '/', 3) = 'work_upload'
            AND (
              private.can_manage_task(t.is_internal, t.client_id)
              OR (
                private.can_execute_task(t.is_internal, t.client_id)
                AND private.is_active_task_assignee(t.id)
              )
            )
          )
        )
    )
  );

CREATE POLICY task_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'task-files'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = private.storage_task_id_from_path(name)
        AND private.can_manage_task(t.is_internal, t.client_id)
    )
  );

CREATE POLICY task_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'task-files'
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = private.storage_task_id_from_path(name)
        AND private.can_manage_task(t.is_internal, t.client_id)
    )
  );

DROP POLICY IF EXISTS project_files_select ON storage.objects;
DROP POLICY IF EXISTS project_files_insert ON storage.objects;
DROP POLICY IF EXISTS project_files_update ON storage.objects;
DROP POLICY IF EXISTS project_files_delete ON storage.objects;

CREATE POLICY project_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND private.has_permission_on_client(
      'projects.read',
      NULLIF(private.storage_client_id_from_path(name), 'internal')::uuid
    )
  );

CREATE POLICY project_files_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND private.has_permission_on_client(
      'projects.manage',
      NULLIF(private.storage_client_id_from_path(name), 'internal')::uuid
    )
  );

CREATE POLICY project_files_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND private.has_permission_on_client(
      'projects.manage',
      NULLIF(private.storage_client_id_from_path(name), 'internal')::uuid
    )
  );

CREATE POLICY project_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-files'
    AND private.has_permission_on_client(
      'projects.manage',
      NULLIF(private.storage_client_id_from_path(name), 'internal')::uuid
    )
  );
