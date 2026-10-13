-- M30b: Client CMS document workflow RPCs + notification kinds

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'task_message',
  'task_files',
  'task_assigned',
  'task_decision',
  'task_submitted',
  'cms_submitted',
  'cms_decision',
  'cms_published'
));

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS cms_instance_id uuid REFERENCES public.cms_instances (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS document_id uuid;

CREATE OR REPLACE FUNCTION private.next_client_cms_revision(p_document_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(MAX(revision_no), 0) + 1
  FROM public.client_cms_revisions
  WHERE document_id = p_document_id;
$$;

CREATE OR REPLACE FUNCTION public.save_client_cms_document(
  p_instance_id uuid,
  p_module_id uuid,
  p_slug text,
  p_title text,
  p_body_json jsonb,
  p_document_id uuid DEFAULT NULL,
  p_requires_client_approval boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_mod public.cms_modules%ROWTYPE;
  v_id uuid;
  v_slug text := lower(trim(COALESCE(p_slug, '')));
  v_title text := NULLIF(trim(COALESCE(p_title, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.can_edit_cms_instance(p_instance_id) THEN
    RAISE EXCEPTION 'CMS edit not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_title IS NULL OR v_slug = '' THEN
    RAISE EXCEPTION 'Title and slug required';
  END IF;

  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS instance not found'; END IF;
  IF v_inst.management_mode = 'client_managed' AND v_inst.cms_kind = 'external_website' THEN
    -- External-only instances without platform content still may use okang_native docs when management allows
    NULL;
  END IF;

  SELECT * INTO v_mod FROM public.cms_modules
  WHERE id = p_module_id AND cms_instance_id = p_instance_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Module not found on this CMS'; END IF;
  IF v_mod.hosted_in <> 'platform_content' THEN
    RAISE EXCEPTION 'This module is not editable in the OkangGroup workspace (hosted externally)';
  END IF;
  IF v_mod.is_sensitive THEN
    RAISE EXCEPTION 'Sensitive modules cannot be edited in platform content tables';
  END IF;

  IF p_document_id IS NULL THEN
    INSERT INTO public.client_cms_documents (
      cms_instance_id, client_id, module_id, slug, title, body_json, status,
      requires_client_approval, created_by, updated_by
    ) VALUES (
      p_instance_id, v_inst.client_id, p_module_id, v_slug, v_title,
      COALESCE(p_body_json, '{}'::jsonb), 'draft',
      COALESCE(p_requires_client_approval, false), auth.uid(), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.client_cms_documents
    SET
      title = v_title,
      slug = v_slug,
      body_json = COALESCE(p_body_json, '{}'::jsonb),
      requires_client_approval = COALESCE(p_requires_client_approval, requires_client_approval),
      status = CASE WHEN status = 'published' THEN 'draft' ELSE status END,
      updated_by = auth.uid()
    WHERE id = p_document_id
      AND cms_instance_id = p_instance_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;
  END IF;

  INSERT INTO public.client_cms_revisions (
    document_id, client_id, revision_no, action, snapshot_json, created_by
  )
  SELECT
    d.id, d.client_id, private.next_client_cms_revision(d.id), 'save',
    jsonb_build_object(
      'title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status
    ),
    auth.uid()
  FROM public.client_cms_documents d WHERE d.id = v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_client_cms_document(p_document_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_actor text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_submit_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS submit not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_doc.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only draft or rejected documents can be submitted';
  END IF;

  UPDATE public.client_cms_documents
  SET status = 'in_review', updated_by = auth.uid()
  WHERE id = p_document_id;

  INSERT INTO public.client_cms_revisions (
    document_id, client_id, revision_no, action, snapshot_json, note, created_by
  )
  SELECT
    d.id, d.client_id, private.next_client_cms_revision(d.id), 'submit',
    jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
    NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
  FROM public.client_cms_documents d WHERE d.id = p_document_id;

  SELECT COALESCE(full_name, email, 'Editor') INTO v_actor FROM public.profiles WHERE id = auth.uid();

  -- Notify client managers with publish OR clients.manage holders via grants that can publish
  FOR r IN
    SELECT g.profile_id AS uid
    FROM public.cms_instance_grants g
    WHERE g.cms_instance_id = v_doc.cms_instance_id
      AND g.revoked_at IS NULL
      AND g.can_publish
      AND g.profile_id <> auth.uid()
  LOOP
    INSERT INTO public.notifications (
      recipient_id, actor_id, kind, title, body, cms_instance_id, document_id
    ) VALUES (
      r.uid, auth.uid(), 'cms_submitted',
      'CMS content submitted for review',
      left(v_actor || ' submitted: ' || v_doc.title, 500),
      v_doc.cms_instance_id, p_document_id
    );
  END LOOP;

  -- Also notify Owner-like: instance created_by if different
  IF EXISTS (SELECT 1 FROM public.cms_instances i WHERE i.id = v_doc.cms_instance_id AND i.created_by IS NOT NULL AND i.created_by <> auth.uid()) THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, kind, title, body, cms_instance_id, document_id
    )
    SELECT i.created_by, auth.uid(), 'cms_submitted',
      'CMS content submitted for review',
      left(v_actor || ' submitted: ' || v_doc.title, 500),
      v_doc.cms_instance_id, p_document_id
    FROM public.cms_instances i
    WHERE i.id = v_doc.cms_instance_id
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.recipient_id = i.created_by
          AND n.document_id = p_document_id
          AND n.kind = 'cms_submitted'
          AND n.created_at > now() - interval '1 minute'
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_client_cms_document(
  p_document_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_publish_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS review not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_doc.status <> 'in_review' THEN
    RAISE EXCEPTION 'Document is not in review';
  END IF;

  IF p_approve THEN
    UPDATE public.client_cms_documents
    SET status = 'published',
        published_at = now(),
        published_by = auth.uid(),
        updated_by = auth.uid()
    WHERE id = p_document_id;
  ELSE
    UPDATE public.client_cms_documents
    SET status = 'rejected', updated_by = auth.uid()
    WHERE id = p_document_id;
  END IF;

  INSERT INTO public.client_cms_revisions (
    document_id, client_id, revision_no, action, snapshot_json, note, created_by
  )
  SELECT
    d.id, d.client_id, private.next_client_cms_revision(d.id),
    CASE WHEN p_approve THEN 'approve' ELSE 'reject' END,
    jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
    NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
  FROM public.client_cms_documents d WHERE d.id = p_document_id;

  SELECT COALESCE(full_name, email, 'Reviewer') INTO v_actor FROM public.profiles WHERE id = auth.uid();

  IF v_doc.created_by IS NOT NULL AND v_doc.created_by <> auth.uid() THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, kind, title, body, cms_instance_id, document_id
    ) VALUES (
      v_doc.created_by, auth.uid(),
      CASE WHEN p_approve THEN 'cms_published' ELSE 'cms_decision' END,
      CASE WHEN p_approve THEN 'CMS content published' ELSE 'CMS content returned' END,
      left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_doc.title), 500),
      v_doc.cms_instance_id, p_document_id
    );
  END IF;
END;
$$;

-- Client portal users need membership + grant; Owner links via this helper after Auth user exists
CREATE OR REPLACE FUNCTION public.link_client_portal_user(
  p_profile_id uuid,
  p_client_id uuid,
  p_cms_instance_id uuid,
  p_membership_role text DEFAULT 'client_admin',
  p_can_edit boolean DEFAULT true,
  p_can_submit boolean DEFAULT true,
  p_can_publish boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_kind text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', p_client_id)
  ) THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;

  SELECT account_kind INTO v_kind FROM public.profiles WHERE id = p_profile_id;
  IF v_kind IS DISTINCT FROM 'client_user' THEN
    RAISE EXCEPTION 'Profile must be account_kind=client_user';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cms_instances
    WHERE id = p_cms_instance_id AND client_id = p_client_id
  ) THEN
    RAISE EXCEPTION 'CMS instance does not belong to client';
  END IF;

  INSERT INTO public.client_memberships (client_id, profile_id, membership_role, status)
  VALUES (
    p_client_id, p_profile_id,
    CASE WHEN p_membership_role IN ('client_admin', 'client_user') THEN p_membership_role ELSE 'client_user' END,
    'active'
  )
  ON CONFLICT (client_id, profile_id) DO UPDATE
  SET status = 'active',
      membership_role = EXCLUDED.membership_role,
      updated_at = now();

  INSERT INTO public.cms_instance_grants (
    cms_instance_id, client_id, profile_id, can_view, can_edit, can_submit, can_publish, granted_by, revoked_at
  ) VALUES (
    p_cms_instance_id, p_client_id, p_profile_id, true,
    COALESCE(p_can_edit, true), COALESCE(p_can_submit, true), COALESCE(p_can_publish, false),
    auth.uid(), null
  )
  ON CONFLICT (cms_instance_id, profile_id) DO UPDATE
  SET can_view = true,
      can_edit = EXCLUDED.can_edit,
      can_submit = EXCLUDED.can_submit,
      can_publish = EXCLUDED.can_publish,
      revoked_at = null,
      granted_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.save_client_cms_document(uuid, uuid, text, text, jsonb, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_client_cms_document(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_client_cms_document(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_client_portal_user(uuid, uuid, uuid, text, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_client_cms_document(uuid, uuid, text, text, jsonb, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_client_cms_document(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_client_cms_document(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_client_portal_user(uuid, uuid, uuid, text, boolean, boolean, boolean) TO authenticated;

-- Client portal users must read their own client row without staff permissions
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.read', id)
    OR EXISTS (
      SELECT 1 FROM public.client_memberships m
      WHERE m.client_id = clients.id
        AND m.profile_id = auth.uid()
        AND m.status = 'active'
    )
  );
