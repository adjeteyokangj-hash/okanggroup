-- M36b: Complete client approval gate RPCs (remainder after partial m36 apply) (development)
-- When requires_client_approval: management approve → awaiting_client_approval
-- (does NOT publish). Client approve → approved_for_publish. Authorised publish
-- then publishes. Client reject → draft for revision. Edit invalidates approval states.
-- Production remains HOLD.

-- ---------------------------------------------------------------------------
-- 1) Status constraint: add awaiting_client_approval + approved_for_publish
-- ---------------------------------------------------------------------------
ALTER TABLE public.client_cms_documents
  DROP CONSTRAINT IF EXISTS client_cms_documents_status_check;

ALTER TABLE public.client_cms_documents
  ADD CONSTRAINT client_cms_documents_status_check CHECK (status = ANY (ARRAY[
    'draft'::text,
    'in_review'::text,
    'awaiting_client_approval'::text,
    'approved_for_publish'::text,
    'published'::text,
    'rejected'::text,
    'archived'::text
  ]));

ALTER TABLE public.client_cms_revisions
  DROP CONSTRAINT IF EXISTS client_cms_revisions_action_check;

ALTER TABLE public.client_cms_revisions
  ADD CONSTRAINT client_cms_revisions_action_check CHECK (action = ANY (ARRAY[
    'save'::text,
    'submit'::text,
    'approve'::text,
    'reject'::text,
    'publish'::text,
    'rollback'::text,
    'restore'::text,
    'archive'::text,
    'duplicate'::text,
    'schedule'::text,
    'management_approve'::text,
    'client_approve'::text,
    'client_reject'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Client-decide capability (own client + grant only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.can_client_decide_cms_instance(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.cms_instances i ON i.id = p_instance_id
    JOIN public.client_memberships m
      ON m.client_id = i.client_id
     AND m.profile_id = p.id
     AND m.status = 'active'
    JOIN private.cms_instance_grant_row(p_instance_id) g ON true
    WHERE p.id = auth.uid()
      AND p.account_kind = 'client_user'
      AND g.can_view
  );
$$;

REVOKE ALL ON FUNCTION private.can_client_decide_cms_instance(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 3) Shared native publish (snapshot + optional publish job)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.publish_cms_document_now(
  p_document_id uuid,
  p_note text DEFAULT NULL,
  p_audit_action text DEFAULT 'publish'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
  v_conn public.cms_connections%ROWTYPE;
  v_job uuid;
  v_actor text;
BEGIN
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;

  UPDATE public.client_cms_documents SET
    status = 'published',
    published_at = now(),
    published_by = auth.uid(),
    updated_by = auth.uid(),
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

  INSERT INTO public.client_cms_revisions (
    document_id, client_id, revision_no, action, snapshot_json, note, created_by
  )
  SELECT
    d.id, d.client_id, private.next_client_cms_revision(d.id), 'publish',
    jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
    NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
  FROM public.client_cms_documents d WHERE d.id = p_document_id;

  SELECT COALESCE(full_name, email, 'Publisher') INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_doc.created_by IS NOT NULL AND v_doc.created_by <> auth.uid() THEN
    INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
    VALUES (
      v_doc.created_by, auth.uid(), 'cms_published',
      'CMS content published',
      left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_doc.title), 500),
      v_doc.cms_instance_id, p_document_id
    );
  END IF;

  PERFORM private.cms_audit(
    v_doc.cms_instance_id, v_doc.client_id, p_audit_action, 'document', p_document_id,
    jsonb_build_object('note', p_note, 'publish_job_id', v_job)
  );
END;
$$;

REVOKE ALL ON FUNCTION private.publish_cms_document_now(uuid, text, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4) Save: invalidate approval / review states on content change
-- ---------------------------------------------------------------------------
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
  v_prev_status text;
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
    SELECT status INTO v_prev_status
    FROM public.client_cms_documents
    WHERE id = p_document_id AND cms_instance_id = p_instance_id
    FOR UPDATE;
    IF v_prev_status IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;

    UPDATE public.client_cms_documents
    SET
      title = v_title,
      slug = v_slug,
      body_json = COALESCE(p_body_json, '{}'::jsonb),
      requires_client_approval = COALESCE(p_requires_client_approval, requires_client_approval),
      -- Content change after review/approval invalidates the affected approval
      status = CASE
        WHEN status IN (
          'published',
          'in_review',
          'awaiting_client_approval',
          'approved_for_publish'
        ) THEN 'draft'
        ELSE status
      END,
      updated_by = auth.uid()
    WHERE id = p_document_id
      AND cms_instance_id = p_instance_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Document not found'; END IF;

    IF v_prev_status IN (
      'in_review', 'awaiting_client_approval', 'approved_for_publish', 'published'
    ) THEN
      PERFORM private.cms_audit(
        p_instance_id, v_inst.client_id, 'approval_invalidated', 'document', v_id,
        jsonb_build_object('previous_status', v_prev_status)
      );
    END IF;
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

-- ---------------------------------------------------------------------------
-- 5) Management decide: Owner approve does NOT publish when client approval required
-- ---------------------------------------------------------------------------
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
  r record;
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

  SELECT COALESCE(full_name, email, 'Reviewer') INTO v_actor FROM public.profiles WHERE id = auth.uid();

  IF NOT p_approve THEN
    UPDATE public.client_cms_documents
    SET status = 'rejected', updated_by = auth.uid()
    WHERE id = p_document_id;

    INSERT INTO public.client_cms_revisions (
      document_id, client_id, revision_no, action, snapshot_json, note, created_by
    )
    SELECT
      d.id, d.client_id, private.next_client_cms_revision(d.id), 'reject',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;

    IF v_doc.created_by IS NOT NULL AND v_doc.created_by <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
      VALUES (
        v_doc.created_by, auth.uid(), 'cms_rejected',
        'CMS content returned',
        left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_doc.title), 500),
        v_doc.cms_instance_id, p_document_id
      );
    END IF;

    PERFORM private.cms_audit(
      v_doc.cms_instance_id, v_doc.client_id, 'reject', 'document', p_document_id,
      jsonb_build_object('note', p_note)
    );
    RETURN;
  END IF;

  -- Approve path
  IF v_doc.requires_client_approval THEN
    UPDATE public.client_cms_documents
    SET status = 'awaiting_client_approval', updated_by = auth.uid()
    WHERE id = p_document_id;

    INSERT INTO public.client_cms_revisions (
      document_id, client_id, revision_no, action, snapshot_json, note, created_by
    )
    SELECT
      d.id, d.client_id, private.next_client_cms_revision(d.id), 'management_approve',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;

    -- Notify client portal users with grants on this instance
    FOR r IN
      SELECT g.profile_id AS uid
      FROM public.cms_instance_grants g
      JOIN public.profiles p ON p.id = g.profile_id
      JOIN public.client_memberships m
        ON m.profile_id = p.id
       AND m.client_id = v_doc.client_id
       AND m.status = 'active'
      WHERE g.cms_instance_id = v_doc.cms_instance_id
        AND g.revoked_at IS NULL
        AND g.can_view
        AND p.account_kind = 'client_user'
        AND g.profile_id <> auth.uid()
    LOOP
      INSERT INTO public.notifications (
        recipient_id, actor_id, kind, title, body, cms_instance_id, document_id
      ) VALUES (
        r.uid, auth.uid(), 'cms_client_approval',
        'CMS content awaiting your approval',
        left(v_actor || ' approved for client review: ' || v_doc.title, 500),
        v_doc.cms_instance_id, p_document_id
      );
    END LOOP;

    PERFORM private.cms_audit(
      v_doc.cms_instance_id, v_doc.client_id, 'management_approve', 'document', p_document_id,
      jsonb_build_object('note', p_note, 'next_status', 'awaiting_client_approval')
    );
    RETURN;
  END IF;

  -- No client approval required: publish immediately (preserved behaviour)
  PERFORM private.publish_cms_document_now(p_document_id, p_note, 'publish');
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Client approve / reject
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_decide_cms_document(
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
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;

  IF NOT private.can_client_decide_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'Client CMS approval not permitted' USING ERRCODE = '42501';
  END IF;
  IF v_doc.client_id IS DISTINCT FROM (
    SELECT i.client_id FROM public.cms_instances i WHERE i.id = v_doc.cms_instance_id
  ) THEN
    RAISE EXCEPTION 'Client CMS approval not permitted' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.client_memberships m
    WHERE m.profile_id = auth.uid()
      AND m.client_id = v_doc.client_id
      AND m.status = 'active'
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
    UPDATE public.client_cms_documents
    SET status = 'approved_for_publish', updated_by = auth.uid()
    WHERE id = p_document_id;

    INSERT INTO public.client_cms_revisions (
      document_id, client_id, revision_no, action, snapshot_json, note, created_by
    )
    SELECT
      d.id, d.client_id, private.next_client_cms_revision(d.id), 'client_approve',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;

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
        r.uid, auth.uid(), 'cms_decision',
        'CMS content approved by client — ready to publish',
        left(v_actor || ' approved: ' || v_doc.title, 500),
        v_doc.cms_instance_id, p_document_id
      );
    END LOOP;

    PERFORM private.cms_audit(
      v_doc.cms_instance_id, v_doc.client_id, 'client_approve', 'document', p_document_id,
      jsonb_build_object('note', p_note, 'next_status', 'approved_for_publish')
    );
  ELSE
    -- Return for revision without publishing
    UPDATE public.client_cms_documents
    SET status = 'draft', updated_by = auth.uid()
    WHERE id = p_document_id;

    INSERT INTO public.client_cms_revisions (
      document_id, client_id, revision_no, action, snapshot_json, note, created_by
    )
    SELECT
      d.id, d.client_id, private.next_client_cms_revision(d.id), 'client_reject',
      jsonb_build_object('title', d.title, 'slug', d.slug, 'body_json', d.body_json, 'status', d.status),
      NULLIF(trim(COALESCE(p_note, '')), ''), auth.uid()
    FROM public.client_cms_documents d WHERE d.id = p_document_id;

    IF v_doc.created_by IS NOT NULL AND v_doc.created_by <> auth.uid() THEN
      INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, cms_instance_id, document_id)
      VALUES (
        v_doc.created_by, auth.uid(), 'cms_rejected',
        'CMS content returned by client',
        left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_doc.title), 500),
        v_doc.cms_instance_id, p_document_id
      );
    END IF;

    PERFORM private.cms_audit(
      v_doc.cms_instance_id, v_doc.client_id, 'client_reject', 'document', p_document_id,
      jsonb_build_object('note', p_note, 'next_status', 'draft')
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7) Authorised publish after client approval
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.publish_client_cms_document(
  p_document_id uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

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
    -- Without client approval, publish happens via decide; block shortcut bypasses
    RAISE EXCEPTION 'Use management approve to publish when client approval is not required';
  END IF;

  PERFORM private.publish_cms_document_now(p_document_id, p_note, 'publish');
END;
$$;

-- ---------------------------------------------------------------------------
-- 8) Management summary: count awaiting client approvals correctly
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cms_management_summary()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
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
    'pending_client_approvals', (
      SELECT count(*) FROM public.client_cms_documents
      WHERE status = 'awaiting_client_approval'
    ),
    'ready_to_publish', (
      SELECT count(*) FROM public.client_cms_documents
      WHERE status = 'approved_for_publish'
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

-- ---------------------------------------------------------------------------
-- 9) Grants
-- ---------------------------------------------------------------------------
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
