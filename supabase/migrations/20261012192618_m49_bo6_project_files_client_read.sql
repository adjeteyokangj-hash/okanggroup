-- M49: Allow client portal members to download client_visible project files

DROP POLICY IF EXISTS project_files_select ON storage.objects;
CREATE POLICY project_files_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (
      private.has_permission_on_client(
        'projects.read',
        private.storage_client_id_from_path(name)::uuid
      )
      OR EXISTS (
        SELECT 1
        FROM public.project_documents d
        WHERE d.storage_path = name
          AND d.deleted_at IS NULL
          AND d.visibility = 'client_visible'
          AND private.is_active_client_member(d.client_id)
      )
    )
  );
