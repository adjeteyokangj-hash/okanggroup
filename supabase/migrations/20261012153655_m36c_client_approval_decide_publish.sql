-- M36c: decide / client_decide / publish RPCs for client approval gate
-- (Development apply mirrored from MCP; idempotent CREATE OR REPLACE.)
-- Canonical full gate also lives in 20261012153256_m36_client_approval_gate.sql.

CREATE OR REPLACE FUNCTION public.decide_client_cms_document(
  p_document_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_actor text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_publish_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS review not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_doc.status <> 'in_review' THEN RAISE EXCEPTION 'Document is not in review'; END IF;
  SELECT COALESCE(full_name, email, 'Reviewer') INTO v_actor FROM public.profiles WHERE id = auth.uid();

  IF NOT p_approve THEN
    UPDATE public.client_cms_documents SET status = 'rejected', updated_by = auth.uid() WHERE id = p_document_id;
    INSERT INTO public.client_cms_revisions (document_id, client_id, revision_no, action, snapshot_json, note, created_by)
    SELECT d.id, d.client_id, private.next_client_cms_revision(d.id), 'reject',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;
    IF v_doc.created_by IS NOT NULL AND v_doc.created_by <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
      VALUES (v_doc.created_by, auth.uid(), 'cms_rejected', 'CMS content returned',
        left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_doc.title), 500),
        v_doc.cms_instance_id, p_document_id);
    END IF;
    PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id, 'reject', 'document', p_document_id,
      jsonb_build_object('note', p_note));
    RETURN;
  END IF;

  IF v_doc.requires_client_approval THEN
    UPDATE public.client_cms_documents SET status = 'awaiting_client_approval', updated_by = auth.uid()
    WHERE id = p_document_id;
    INSERT INTO public.client_cms_revisions (document_id, client_id, revision_no, action, snapshot_json, note, created_by)
    SELECT d.id, d.client_id, private.next_client_cms_revision(d.id), 'management_approve',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;
    FOR r IN
      SELECT g.profile_id AS uid FROM public.cms_instance_grants g
      JOIN public.profiles p ON p.id = g.profile_id
      JOIN public.client_memberships m ON m.profile_id = p.id AND m.client_id = v_doc.client_id AND m.status = 'active'
      WHERE g.cms_instance_id = v_doc.cms_instance_id AND g.revoked_at IS NULL AND g.can_view
        AND p.account_kind = 'client_user' AND g.profile_id <> auth.uid()
    LOOP
      INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
      VALUES (r.uid, auth.uid(), 'cms_client_approval', 'CMS content awaiting your approval',
        left(v_actor || ' approved for client review: ' || v_doc.title, 500),
        v_doc.cms_instance_id, p_document_id);
    END LOOP;
    PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id, 'management_approve', 'document', p_document_id,
      jsonb_build_object('note', p_note, 'next_status', 'awaiting_client_approval'));
    RETURN;
  END IF;

  PERFORM private.publish_cms_document_now(p_document_id, p_note, 'publish');
END;
$$;

CREATE OR REPLACE FUNCTION public.client_decide_cms_document(
  p_document_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_actor text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_client_decide_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'Client CMS approval not permitted' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_memberships m
    WHERE m.profile_id = auth.uid() AND m.client_id = v_doc.client_id AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Client CMS approval not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_doc.status <> 'awaiting_client_approval' THEN
    RAISE EXCEPTION 'Document is not awaiting client approval';
  END IF;
  IF NOT v_doc.requires_client_approval THEN
    RAISE EXCEPTION 'Document does not require client approval';
  END IF;
  SELECT COALESCE(full_name, email, 'Client') INTO v_actor FROM public.profiles WHERE id = auth.uid();

  IF p_approve THEN
    UPDATE public.client_cms_documents SET status = 'approved_for_publish', updated_by = auth.uid()
    WHERE id = p_document_id;
    INSERT INTO public.client_cms_revisions (document_id, client_id, revision_no, action, snapshot_json, note, created_by)
    SELECT d.id, d.client_id, private.next_client_cms_revision(d.id), 'client_approve',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;
    FOR r IN
      SELECT g.profile_id AS uid FROM public.cms_instance_grants g
      WHERE g.cms_instance_id = v_doc.cms_instance_id AND g.revoked_at IS NULL
        AND g.can_publish AND g.profile_id <> auth.uid()
    LOOP
      INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
      VALUES (r.uid, auth.uid(), 'cms_decision', 'CMS content approved by client — ready to publish',
        left(v_actor || ' approved: ' || v_doc.title, 500), v_doc.cms_instance_id, p_document_id);
    END LOOP;
    PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id, 'client_approve', 'document', p_document_id,
      jsonb_build_object('note', p_note, 'next_status', 'approved_for_publish'));
  ELSE
    UPDATE public.client_cms_documents SET status = 'draft', updated_by = auth.uid() WHERE id = p_document_id;
    INSERT INTO public.client_cms_revisions (document_id, client_id, revision_no, action, snapshot_json, note, created_by)
    SELECT d.id, d.client_id, private.next_client_cms_revision(d.id), 'client_reject',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;
    IF v_doc.created_by IS NOT NULL AND v_doc.created_by <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
      VALUES (v_doc.created_by, auth.uid(), 'cms_rejected', 'CMS content returned by client',
        left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_doc.title), 500),
        v_doc.cms_instance_id, p_document_id);
    END IF;
    PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id, 'client_reject', 'document', p_document_id,
      jsonb_build_object('note', p_note, 'next_status', 'draft'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_client_cms_document(p_document_id uuid, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE v_doc public.client_cms_documents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_publish_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS publish not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_doc.requires_client_approval THEN
    IF v_doc.status <> 'approved_for_publish' THEN
      RAISE EXCEPTION 'Document requires client approval before publish';
    END IF;
  ELSE
    RAISE EXCEPTION 'Use management approve to publish when client approval is not required';
  END IF;
  PERFORM private.publish_cms_document_now(p_document_id, p_note, 'publish');
END;
$$;

CREATE OR REPLACE FUNCTION public.cms_management_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'instances', (SELECT count(*) FROM public.cms_instances),
    'active', (SELECT count(*) FROM public.cms_instances WHERE status = 'active'),
    'pending_reviews', (SELECT count(*) FROM public.client_cms_documents WHERE status = 'in_review'),
    'pending_client_approvals', (
      SELECT count(*) FROM public.client_cms_documents WHERE status = 'awaiting_client_approval'
    ),
    'ready_to_publish', (
      SELECT count(*) FROM public.client_cms_documents WHERE status = 'approved_for_publish'
    ),
    'published_7d', (
      SELECT count(*) FROM public.client_cms_documents
      WHERE status = 'published' AND published_at > now() - interval '7 days'
    ),
    'failed_jobs', (SELECT count(*) FROM public.cms_publish_jobs WHERE status = 'failed'),
    'grants', (SELECT count(*) FROM public.cms_instance_grants WHERE revoked_at IS NULL)
  ) INTO v_out;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.client_decide_cms_document(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_client_cms_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.client_decide_cms_document(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_client_cms_document(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_client_cms_document(uuid, uuid, text, text, jsonb, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_client_cms_document(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cms_management_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_client_cms_document(uuid, uuid, text, text, jsonb, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_client_cms_document(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cms_management_summary() TO authenticated;
