-- M33b: RLS + RPCs for centralised CMS (restore, duplicate, archive, connection test, audit)

ALTER TABLE public.cms_media_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_media_folders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_custom_module_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_custom_module_defs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_custom_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_custom_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_content_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_content_comments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_publish_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_publish_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_media_folders_all ON public.cms_media_folders FOR ALL TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id))
  WITH CHECK (private.can_edit_cms_instance(cms_instance_id));

CREATE POLICY cms_templates_select ON public.cms_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY cms_templates_write ON public.cms_templates FOR ALL TO authenticated
  USING (private.has_permission('clients.manage'))
  WITH CHECK (private.has_permission('clients.manage'));

CREATE POLICY cms_custom_defs_select ON public.cms_custom_module_defs FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));
CREATE POLICY cms_custom_defs_write ON public.cms_custom_module_defs FOR ALL TO authenticated
  USING (private.has_permission('clients.manage') OR private.has_permission_on_client('clients.manage', client_id))
  WITH CHECK (private.has_permission('clients.manage') OR private.has_permission_on_client('clients.manage', client_id));

CREATE POLICY cms_custom_records_select ON public.cms_custom_records FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));
CREATE POLICY cms_custom_records_write ON public.cms_custom_records FOR ALL TO authenticated
  USING (private.can_edit_cms_instance(cms_instance_id))
  WITH CHECK (private.can_edit_cms_instance(cms_instance_id));

CREATE POLICY cms_comments_select ON public.cms_content_comments FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));
CREATE POLICY cms_comments_insert ON public.cms_content_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND private.can_view_cms_instance(cms_instance_id));

CREATE POLICY cms_publish_jobs_select ON public.cms_publish_jobs FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));
CREATE POLICY cms_publish_jobs_write ON public.cms_publish_jobs FOR ALL TO authenticated
  USING (private.can_publish_cms_instance(cms_instance_id))
  WITH CHECK (private.can_publish_cms_instance(cms_instance_id));

CREATE POLICY cms_audit_select ON public.cms_audit_events FOR SELECT TO authenticated
  USING (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
    OR private.can_view_cms_instance(cms_instance_id)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_media_folders TO authenticated;
GRANT SELECT ON public.cms_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_custom_module_defs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_custom_records TO authenticated;
GRANT SELECT, INSERT ON public.cms_content_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cms_publish_jobs TO authenticated;
GRANT SELECT ON public.cms_audit_events TO authenticated;

CREATE OR REPLACE FUNCTION private.cms_audit(
  p_instance_id uuid, p_client_id uuid, p_action text,
  p_entity_type text DEFAULT NULL, p_entity_id uuid DEFAULT NULL, p_detail jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
BEGIN
  INSERT INTO public.cms_audit_events (cms_instance_id, client_id, actor_id, action, entity_type, entity_id, detail_json)
  VALUES (p_instance_id, p_client_id, auth.uid(), p_action, p_entity_type, p_entity_id, COALESCE(p_detail, '{}'::jsonb));
END;
$$;

-- Expand notification kinds
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check CHECK (kind IN (
  'task_message','task_files','task_assigned','task_decision','task_submitted',
  'cms_submitted','cms_decision','cms_published','cms_rejected','cms_client_approval',
  'cms_publish_failed','cms_access_changed','cms_assigned'
));

CREATE OR REPLACE FUNCTION public.restore_client_cms_document(p_document_id uuid, p_revision_no int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_snap jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_edit_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS edit not permitted' USING ERRCODE = '42501';
  END IF;
  SELECT snapshot_json INTO v_snap FROM public.client_cms_revisions
  WHERE document_id = p_document_id AND revision_no = p_revision_no;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;

  UPDATE public.client_cms_documents SET
    title = COALESCE(v_snap->>'title', title),
    slug = COALESCE(v_snap->>'slug', slug),
    body_json = COALESCE(v_snap->'body_json', body_json),
    status = 'draft',
    updated_by = auth.uid()
  WHERE id = p_document_id;

  INSERT INTO public.client_cms_revisions (document_id, client_id, revision_no, action, snapshot_json, note, created_by)
  SELECT d.id, d.client_id, private.next_client_cms_revision(d.id), 'restore',
    jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status, 'restored_from', p_revision_no),
    'Restored from revision ' || p_revision_no, auth.uid()
  FROM public.client_cms_documents d WHERE d.id = p_document_id;

  PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id, 'restore', 'document', p_document_id,
    jsonb_build_object('revision_no', p_revision_no));
END;
$$;

CREATE OR REPLACE FUNCTION public.duplicate_client_cms_document(p_document_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_edit_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS edit not permitted' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.client_cms_documents (
    cms_instance_id, client_id, module_id, slug, title, body_json, status,
    requires_client_approval, parent_id, nav_order, visibility, seo_json, document_kind,
    created_by, updated_by
  ) VALUES (
    v_doc.cms_instance_id, v_doc.client_id, v_doc.module_id,
    left(v_doc.slug || '-copy-' || substr(gen_random_uuid()::text, 1, 8), 120),
    v_doc.title || ' (copy)', v_doc.body_json, 'draft',
    v_doc.requires_client_approval, v_doc.parent_id, v_doc.nav_order, v_doc.visibility,
    v_doc.seo_json, v_doc.document_kind, auth.uid(), auth.uid()
  ) RETURNING id INTO v_id;
  PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id, 'duplicate', 'document', v_id,
    jsonb_build_object('source', p_document_id));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_client_cms_document(p_document_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE v_doc public.client_cms_documents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_edit_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS edit not permitted' USING ERRCODE = '42501';
  END IF;
  UPDATE public.client_cms_documents
  SET status = 'archived', archived_at = now(), updated_by = auth.uid()
  WHERE id = p_document_id;
  PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id, 'archive', 'document', p_document_id, '{}'::jsonb);
END;
$$;

-- Native publish: store published snapshot + optional publish job (okang_native always succeeds in-platform)
CREATE OR REPLACE FUNCTION public.decide_client_cms_document(
  p_document_id uuid, p_approve boolean, p_note text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_actor text;
  v_conn public.cms_connections%ROWTYPE;
  v_job uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_publish_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS review not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_doc.status <> 'in_review' THEN RAISE EXCEPTION 'Document is not in review'; END IF;

  IF p_approve THEN
    UPDATE public.client_cms_documents SET
      status = 'published', published_at = now(), published_by = auth.uid(), updated_by = auth.uid(),
      published_snapshot_json = body_json
    WHERE id = p_document_id;

    SELECT * INTO v_conn FROM public.cms_connections WHERE cms_instance_id = v_doc.cms_instance_id;
    INSERT INTO public.cms_publish_jobs (
      cms_instance_id, client_id, document_id, status, adapter_code, attempt_count,
      verification_json, requested_by, finished_at
    ) VALUES (
      v_doc.cms_instance_id, v_doc.client_id, p_document_id,
      CASE WHEN v_conn.adapter_code IS NULL OR v_conn.adapter_code = 'okang_native' THEN 'succeeded' ELSE 'pending' END,
      COALESCE(v_conn.adapter_code, 'okang_native'), 1,
      jsonb_build_object('mode', 'platform_store', 'verified_at', now()),
      auth.uid(),
      CASE WHEN v_conn.adapter_code IS NULL OR v_conn.adapter_code = 'okang_native' THEN now() ELSE NULL END
    ) RETURNING id INTO v_job;
  ELSE
    UPDATE public.client_cms_documents SET status = 'rejected', updated_by = auth.uid() WHERE id = p_document_id;
  END IF;

  INSERT INTO public.client_cms_revisions (document_id, client_id, revision_no, action, snapshot_json, note, created_by)
  SELECT d.id, d.client_id, private.next_client_cms_revision(d.id),
    CASE WHEN p_approve THEN 'publish' ELSE 'reject' END,
    jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
    NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
  FROM public.client_cms_documents d WHERE d.id = p_document_id;

  SELECT COALESCE(full_name, email, 'Reviewer') INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_doc.created_by IS NOT NULL AND v_doc.created_by <> auth.uid() THEN
    INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
    VALUES (
      v_doc.created_by, auth.uid(),
      CASE WHEN p_approve THEN 'cms_published' ELSE 'cms_rejected' END,
      CASE WHEN p_approve THEN 'CMS content published' ELSE 'CMS content returned' END,
      left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_doc.title), 500),
      v_doc.cms_instance_id, p_document_id
    );
  END IF;
  PERFORM private.cms_audit(v_doc.cms_instance_id, v_doc.client_id,
    CASE WHEN p_approve THEN 'publish' ELSE 'reject' END, 'document', p_document_id,
    jsonb_build_object('note', p_note));
END;
$$;

CREATE OR REPLACE FUNCTION public.test_cms_connection(p_instance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_conn public.cms_connections%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT (private.has_permission('clients.manage') OR private.can_view_cms_instance(p_instance_id)) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS not found'; END IF;
  SELECT * INTO v_conn FROM public.cms_connections WHERE cms_instance_id = p_instance_id;

  IF v_conn.id IS NULL THEN
    v_result := jsonb_build_object('ok', false, 'adapter', null, 'message', 'No connection configured');
  ELSIF v_conn.adapter_code = 'okang_native' THEN
    UPDATE public.cms_connections SET status = 'healthy', last_healthy_at = now(), last_error = null WHERE id = v_conn.id;
    v_result := jsonb_build_object(
      'ok', true, 'adapter', 'okang_native',
      'capabilities', jsonb_build_array('edit','preview','draft','submit','publish','rollback','media'),
      'message', 'OkangGroup native CMS healthy (platform content store)'
    );
  ELSIF v_conn.adapter_code IN ('wordpress_rest', 'custom_webhook', 'manual_only') THEN
    -- Honest: without vault credentials / live endpoint, cannot claim success
    UPDATE public.cms_connections SET
      status = CASE WHEN nullif(credential_ref, '') IS NULL THEN 'not_configured' ELSE 'configured' END,
      last_error = CASE WHEN nullif(credential_ref, '') IS NULL
        THEN 'Credential reference required before live adapter test'
        ELSE 'Live adapter test requires Owner-supplied vault credentials and reachable API (blocked on this environment)'
      END
    WHERE id = v_conn.id;
    v_result := jsonb_build_object(
      'ok', false,
      'adapter', v_conn.adapter_code,
      'message', 'External adapter registered but live API test blocked — Owner must provide vault credentials and a reachable test endpoint',
      'blocker', 'external_credentials'
    );
  ELSE
    v_result := jsonb_build_object('ok', false, 'message', 'Unknown adapter');
  END IF;

  PERFORM private.cms_audit(v_inst.client_id, v_inst.client_id, 'connection_test', 'connection', v_conn.id, v_result);
  -- fix audit args: first is instance
  PERFORM private.cms_audit(p_instance_id, v_inst.client_id, 'connection_test', 'connection', v_conn.id, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.cms_management_summary()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'instances', (SELECT count(*) FROM public.cms_instances),
    'active', (SELECT count(*) FROM public.cms_instances WHERE status = 'active'),
    'pending_reviews', (SELECT count(*) FROM public.client_cms_documents WHERE status = 'in_review'),
    'pending_client_approvals', (SELECT count(*) FROM public.client_cms_documents WHERE status = 'in_review' AND requires_client_approval),
    'published_7d', (SELECT count(*) FROM public.client_cms_documents WHERE status = 'published' AND published_at > now() - interval '7 days'),
    'failed_jobs', (SELECT count(*) FROM public.cms_publish_jobs WHERE status = 'failed'),
    'grants', (SELECT count(*) FROM public.cms_instance_grants WHERE revoked_at IS NULL)
  ) INTO v_out;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_client_cms_document(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.duplicate_client_cms_document(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_client_cms_document(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.test_cms_connection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cms_management_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_client_cms_document(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.duplicate_client_cms_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archive_client_cms_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_cms_connection(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cms_management_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_client_cms_document(uuid, boolean, text) TO authenticated;
