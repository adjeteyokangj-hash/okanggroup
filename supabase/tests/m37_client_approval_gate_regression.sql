-- M37: Client approval gate regression (development)
-- JWT claim impersonation — no passwords. Production HOLD.

DO $$
DECLARE
  v_owner uuid := 'a7bce15a-566a-43df-aa93-4f23da8bb35f';
  v_daniel uuid := '928646aa-759b-42b5-a346-19aa71ead822';
  v_inst uuid := 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf';
  v_mod uuid := '1bf60faa-bc75-46cd-8182-20899ea6b78e';
  v_client uuid := 'dedbd3bd-1a58-4162-b090-3e7d9f52a46e';
  v_client_user uuid := 'c1111111-1111-4111-8111-111111111111';
  v_other_client uuid;
  v_other_user uuid := 'c2222222-2222-4222-8222-222222222222';
  v_doc uuid;
  v_doc2 uuid;
  v_status text;
  v_denied boolean;
  v_actions text[];
  v_slug text := 'gate-' || to_char(now(), 'YYYYMMDDHH24MISS');
  v_body jsonb := jsonb_build_object(
    'version', 2,
    'brand', jsonb_build_object('siteName', 'Gate Test'),
    'tokens', '{}'::jsonb,
    'tree', jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'type', 'heading', 'props', jsonb_build_object('text', 'Gate'))
    )
  );
BEGIN
  -- Ensure owner MFA still required/present (do not weaken)
  IF (SELECT count(*) FROM auth.mfa_factors WHERE user_id = v_owner AND status = 'verified') < 1 THEN
    RAISE EXCEPTION 'FAIL Owner MFA not verified';
  END IF;

  -- Ephemeral client portal user for primary client
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_client_user, 'authenticated', 'authenticated',
    'uat.client.gate@okangroup.test',
    crypt('not-a-real-login-' || gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('account_kind', 'client_user', 'full_name', 'UAT Client Gate'),
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET account_kind = 'client_user', account_status = 'active', full_name = 'UAT Client Gate'
  WHERE id = v_client_user;

  INSERT INTO public.client_memberships (client_id, profile_id, membership_role, status)
  VALUES (v_client, v_client_user, 'client_admin', 'active')
  ON CONFLICT (client_id, profile_id) DO UPDATE SET status = 'active', membership_role = 'client_admin';

  INSERT INTO public.cms_instance_grants (
    cms_instance_id, client_id, profile_id, can_view, can_edit, can_submit, can_publish, can_review, granted_by
  ) VALUES (
    v_inst, v_client, v_client_user, true, true, true, false, false, v_owner
  )
  ON CONFLICT (cms_instance_id, profile_id) DO UPDATE SET
    can_view = true, can_edit = true, can_submit = true, can_publish = false, revoked_at = NULL;

  -- Second client + user for cross-client isolation
  SELECT id INTO v_other_client FROM public.clients WHERE client_code = 'UAT-OTHER-ISO' LIMIT 1;
  IF v_other_client IS NULL THEN
    v_other_client := gen_random_uuid();
    INSERT INTO public.clients (id, client_code, legal_name, status)
    VALUES (v_other_client, 'UAT-OTHER-ISO', 'UAT Other Client Isolation', 'active');
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_other_user, 'authenticated', 'authenticated',
    'uat.other.client.gate@okangroup.test',
    crypt('not-a-real-login-' || gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('account_kind', 'client_user', 'full_name', 'UAT Other Client'),
    now(), now()
  ) ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET account_kind = 'client_user', account_status = 'active'
  WHERE id = v_other_user;

  INSERT INTO public.client_memberships (client_id, profile_id, membership_role, status)
  VALUES (v_other_client, v_other_user, 'client_admin', 'active')
  ON CONFLICT (client_id, profile_id) DO UPDATE SET status = 'active';

  -- -------------------------------------------------------------------------
  -- A) requires_client_approval = true: Owner approve must NOT publish
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);

  v_doc := public.save_client_cms_document(
    v_inst, v_mod, v_slug || '-a', 'Gate A Client Required', v_body, NULL, true
  );
  PERFORM public.submit_client_cms_document(v_doc, 'submit A');

  -- Daniel cannot management-decide
  v_denied := false;
  BEGIN
    PERFORM public.decide_client_cms_document(v_doc, true, 'daniel bypass');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL Daniel management approve allowed'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.decide_client_cms_document(v_doc, true, 'Owner management approve');

  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status IS DISTINCT FROM 'awaiting_client_approval' THEN
    RAISE EXCEPTION 'FAIL expected awaiting_client_approval, got %', v_status;
  END IF;

  -- Owner cannot publish while awaiting client
  v_denied := false;
  BEGIN
    PERFORM public.publish_client_cms_document(v_doc, 'premature');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL Owner published before client approval'; END IF;

  -- Daniel cannot client-decide
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.client_decide_cms_document(v_doc, true, 'daniel client');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL Daniel client_decide allowed'; END IF;

  -- Other client user cannot approve
  PERFORM set_config('request.jwt.claim.sub', v_other_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_user::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.client_decide_cms_document(v_doc, true, 'cross client');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL cross-client client_decide allowed'; END IF;

  -- Authorised client approves
  PERFORM set_config('request.jwt.claim.sub', v_client_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_client_user::text, 'role', 'authenticated')::text, true);
  PERFORM public.client_decide_cms_document(v_doc, true, 'Client OK');

  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status IS DISTINCT FROM 'approved_for_publish' THEN
    RAISE EXCEPTION 'FAIL expected approved_for_publish, got %', v_status;
  END IF;

  -- Daniel still cannot publish
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.publish_client_cms_document(v_doc, 'daniel publish');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL Daniel publish after client approve'; END IF;

  -- Owner publishes
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.publish_client_cms_document(v_doc, 'Owner publish');

  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL expected published after authorised publish, got %', v_status;
  END IF;

  SELECT array_agg(action ORDER BY revision_no)
  INTO v_actions
  FROM public.client_cms_revisions WHERE document_id = v_doc;
  IF NOT ('management_approve' = ANY (v_actions) AND 'client_approve' = ANY (v_actions) AND 'publish' = ANY (v_actions)) THEN
    RAISE EXCEPTION 'FAIL missing decision history actions: %', v_actions;
  END IF;

  -- -------------------------------------------------------------------------
  -- B) Client rejection returns for revision (no publish)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_doc2 := public.save_client_cms_document(
    v_inst, v_mod, v_slug || '-b', 'Gate B Reject', v_body, NULL, true
  );
  PERFORM public.submit_client_cms_document(v_doc2, 'submit B');

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.decide_client_cms_document(v_doc2, true, 'mgmt B');

  PERFORM set_config('request.jwt.claim.sub', v_client_user::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_client_user::text, 'role', 'authenticated')::text, true);
  PERFORM public.client_decide_cms_document(v_doc2, false, 'needs changes');

  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc2;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'FAIL client reject should return draft, got %', v_status;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.client_cms_revisions
    WHERE document_id = v_doc2 AND action = 'publish'
  ) THEN
    RAISE EXCEPTION 'FAIL rejection published content';
  END IF;

  -- -------------------------------------------------------------------------
  -- C) Edit invalidates awaiting_client_approval
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_doc2 := public.save_client_cms_document(
    v_inst, v_mod, v_slug || '-c', 'Gate C Invalidate', v_body, NULL, true
  );
  PERFORM public.submit_client_cms_document(v_doc2, 'submit C');
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.decide_client_cms_document(v_doc2, true, 'mgmt C');
  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc2;
  IF v_status IS DISTINCT FROM 'awaiting_client_approval' THEN
    RAISE EXCEPTION 'FAIL C setup status %', v_status;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_body := jsonb_set(v_body, '{tree,0,props,text}', '"Edited after approval"'::jsonb);
  v_doc2 := public.save_client_cms_document(
    v_inst, v_mod, v_slug || '-c', 'Gate C Invalidate', v_body, v_doc2, true
  );
  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc2;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'FAIL edit should invalidate to draft, got %', v_status;
  END IF;

  -- -------------------------------------------------------------------------
  -- D) No client approval: Owner approve still publishes (preserved)
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_doc2 := public.save_client_cms_document(
    v_inst, v_mod, v_slug || '-d', 'Gate D No Client', v_body, NULL, false
  );
  PERFORM public.submit_client_cms_document(v_doc2, 'submit D');
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.decide_client_cms_document(v_doc2, true, 'direct publish');
  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc2;
  IF v_status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'FAIL no-client-approval path should publish, got %', v_status;
  END IF;

  -- Status constraint includes new states
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'client_cms_documents_status_check'
      AND pg_get_constraintdef(oid) LIKE '%awaiting_client_approval%'
      AND pg_get_constraintdef(oid) LIKE '%approved_for_publish%'
  ) THEN
    RAISE EXCEPTION 'FAIL status check missing new states';
  END IF;

  RAISE NOTICE 'M37_CLIENT_APPROVAL_GATE_PASS docs=% / %', v_doc, v_doc2;
END;
$$;

SELECT 'm37_client_approval_gate_regression OK' AS result;
