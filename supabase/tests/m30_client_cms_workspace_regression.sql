-- M30: Client CMS workspace regression (dev)
-- Daniel draft → submit → Owner publish; unauthorised denied; no new permission codes.

DO $$
DECLARE
  v_owner uuid;
  v_daniel uuid;
  v_inst uuid := 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf';
  v_mod uuid;
  v_doc uuid;
  v_status text;
  v_denied boolean;
  v_fake uuid := gen_random_uuid();
  v_count int;
BEGIN
  SELECT id INTO v_owner FROM public.profiles WHERE email = 'okanggroup@gmail.com';
  SELECT id INTO v_daniel FROM public.profiles WHERE email = 'daniel.uat@okangroup.test';
  SELECT id INTO v_mod FROM public.cms_modules WHERE cms_instance_id = v_inst AND module_code = 'homepage';
  IF v_owner IS NULL OR v_daniel IS NULL OR v_mod IS NULL THEN
    RAISE EXCEPTION 'Missing fixtures';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);

  v_doc := public.save_client_cms_document(
    v_inst, v_mod, 'home-regression', 'Homepage regression',
    jsonb_build_object('content', 'Regression draft'),
    NULL, false
  );

  v_denied := false;
  BEGIN
    PERFORM public.decide_client_cms_document(v_doc, true, 'nope');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL daniel published without grant'; END IF;

  PERFORM public.submit_client_cms_document(v_doc, 'Ready');
  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status <> 'in_review' THEN RAISE EXCEPTION 'FAIL expected in_review'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.decide_client_cms_document(v_doc, true, 'OK');
  SELECT status INTO v_status FROM public.client_cms_documents WHERE id = v_doc;
  IF v_status <> 'published' THEN RAISE EXCEPTION 'FAIL expected published'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_fake::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fake::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.save_client_cms_document(v_inst, v_mod, 'x', 'Nope', '{}'::jsonb, NULL, false);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL unauth edit'; END IF;

  SELECT count(*) INTO v_count FROM public.permissions;
  IF v_count < 21 THEN RAISE EXCEPTION 'FAIL permissions missing'; END IF;

  RAISE NOTICE 'M30 PASS';
END;
$$;
