-- M47 BO-5: Business document versioning, visibility, approvals on project_documents

INSERT INTO public.permissions (code, description, category, is_sensitive) VALUES
  ('documents.read', 'Read business documents in scope', 'documents', false),
  ('documents.manage', 'Upload and manage business documents', 'documents', false),
  ('documents.client_share', 'Mark documents client-visible', 'documents', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'owner' AND p.category = 'documents'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('documents.read', 'documents.manage', 'documents.client_share')
WHERE r.code IN ('platform_admin', 'operations_manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('documents.read', 'documents.manage')
WHERE r.code IN ('department_manager', 'team_manager')
ON CONFLICT DO NOTHING;

ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS version_of uuid REFERENCES public.project_documents (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS version_no int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'client_visible')),
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'none'
    CHECK (approval_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_documents_contract_tenant_fk') THEN
    ALTER TABLE public.project_documents
      ADD CONSTRAINT project_documents_contract_tenant_fk
      FOREIGN KEY (client_id, contract_id)
      REFERENCES public.contracts (client_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

DROP POLICY IF EXISTS project_documents_select ON public.project_documents;
DROP POLICY IF EXISTS project_documents_insert ON public.project_documents;
DROP POLICY IF EXISTS project_documents_update ON public.project_documents;
DROP POLICY IF EXISTS project_documents_delete ON public.project_documents;

CREATE POLICY project_documents_select ON public.project_documents
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      private.has_permission_on_client('projects.read', client_id)
      OR private.has_permission_on_client('documents.read', client_id)
      OR (
        visibility = 'client_visible'
        AND EXISTS (
          SELECT 1 FROM public.client_memberships m
          WHERE m.client_id = project_documents.client_id
            AND m.profile_id = auth.uid()
            AND m.status = 'active'
        )
      )
    )
  );

CREATE POLICY project_documents_insert ON public.project_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      private.has_permission_on_client('projects.manage', client_id)
      OR private.has_permission_on_client('documents.manage', client_id)
    )
  );

CREATE POLICY project_documents_update ON public.project_documents
  FOR UPDATE TO authenticated
  USING (
    private.has_permission_on_client('projects.manage', client_id)
    OR private.has_permission_on_client('documents.manage', client_id)
    OR private.has_permission_on_client('documents.client_share', client_id)
  )
  WITH CHECK (
    private.has_permission_on_client('projects.manage', client_id)
    OR private.has_permission_on_client('documents.manage', client_id)
    OR private.has_permission_on_client('documents.client_share', client_id)
  );

CREATE POLICY project_documents_delete ON public.project_documents
  FOR DELETE TO authenticated
  USING (
    private.has_permission_on_client('projects.manage', client_id)
    OR private.has_permission_on_client('documents.manage', client_id)
  );

CREATE OR REPLACE FUNCTION public.client_decide_project_document(
  p_document_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS public.project_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_doc public.project_documents%ROWTYPE;
BEGIN
  SELECT * INTO v_doc FROM public.project_documents WHERE id = p_document_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF v_doc.visibility <> 'client_visible' THEN
    RAISE EXCEPTION 'Document is not shared with the client';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_memberships m
    WHERE m.client_id = v_doc.client_id AND m.profile_id = auth.uid() AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF v_doc.approval_status <> 'pending' THEN
    RAISE EXCEPTION 'Document is not awaiting client approval';
  END IF;

  UPDATE public.project_documents
  SET approval_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      approved_at = now(),
      approved_by = auth.uid()
  WHERE id = p_document_id
  RETURNING * INTO v_doc;

  INSERT INTO public.approvals (
    entity_type, entity_id, client_id, requested_by, approver_profile_id, status, decided_at, decision_note
  ) VALUES (
    'project_document', p_document_id, v_doc.client_id, COALESCE(v_doc.uploaded_by, auth.uid()),
    auth.uid(), CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, now(), p_note
  );

  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.client_decide_project_document(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_decide_project_document(uuid, boolean, text) TO authenticated;
