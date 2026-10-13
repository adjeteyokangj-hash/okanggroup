-- M39: Real client CMS integration regression (development)
-- Vault + approval gate + isolation. No live client apps. Production HOLD.

DO $$
DECLARE
  v_owner uuid := 'a7bce15a-566a-43df-aa93-4f23da8bb35f';
  v_daniel uuid := '928646aa-759b-42b5-a346-19aa71ead822';
  v_inst uuid;
  v_mod uuid;
  v_doc uuid;
  v_result jsonb;
  v_denied boolean;
BEGIN
  SELECT id INTO v_inst FROM public.cms_instances WHERE slug = 'uat-custom-sandbox' LIMIT 1;
  IF v_inst IS NULL THEN
    RAISE EXCEPTION 'FAIL missing uat-custom-sandbox instance (run m38 first)';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  -- Store vault credential (dev/ only)
  v_result := public.store_cms_credential(
    'dev/okang-client-cms',
    'okang-dev-client-cms-key-not-for-production',
    'M39 e2e vault'
  );
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL store credential: %', v_result;
  END IF;
  -- Response must not echo secret
  IF v_result::text ILIKE '%okang-dev-client-cms-key-not-for-production%' THEN
    RAISE EXCEPTION 'FAIL credential leaked in RPC response';
  END IF;

  -- Production-looking ref rejected
  v_denied := false;
  BEGIN
    PERFORM public.store_cms_credential('production/client-x', 'x', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL production credential_ref accepted'; END IF;

  IF NOT public.cms_credential_ref_exists('dev/okang-client-cms') THEN
    RAISE EXCEPTION 'FAIL credential_ref_exists false';
  END IF;

  -- Authenticated/anon must not have EXECUTE on secret reader (ACL enforcement)
  IF has_function_privilege('authenticated', 'public.cms_gateway_read_secret(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL gateway_read_secret EXECUTE granted to authenticated';
  END IF;
  IF has_function_privilege('anon', 'public.cms_gateway_read_secret(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL gateway_read_secret EXECUTE granted to anon';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.cms_gateway_read_secret(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL gateway_read_secret EXECUTE missing for service_role';
  END IF;

  v_result := public.configure_cms_connection(
    v_inst,
    'okang_dev_client',
    'http://127.0.0.1:8791',
    'dev/okang-client-cms',
    'M39 dedicated stub',
    'external'
  );
  IF (v_result->>'adapter') IS DISTINCT FROM 'okang_dev_client' THEN
    RAISE EXCEPTION 'FAIL configure adapter %', v_result;
  END IF;

  v_result := public.cms_gateway_connection_snapshot(v_inst);
  IF COALESCE((v_result->>'credential_present')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL credential_present expected';
  END IF;
  IF v_result::text ILIKE '%okang-dev-client-cms-key%' THEN
    RAISE EXCEPTION 'FAIL secret in connection snapshot';
  END IF;

  -- Module ensure
  SELECT id INTO v_mod FROM public.cms_modules WHERE cms_instance_id = v_inst LIMIT 1;
  IF v_mod IS NULL THEN
    INSERT INTO public.cms_modules (
      cms_instance_id, client_id, module_code, module_name, sort_order, hosted_in, status
    )
    SELECT v_inst, client_id, 'announcements', 'Announcements', 10, 'external_cms', 'active'
    FROM public.cms_instances WHERE id = v_inst
    RETURNING id INTO v_mod;
  END IF;

  -- Approval gate: require client approval path must block external publish until approved
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_doc := public.save_client_cms_document(
    'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf',
    '1bf60faa-bc75-46cd-8182-20899ea6b78e',
    'm39-gate-' || to_char(now(), 'YYYYMMDDHH24MISS'),
    'M39 Gate Doc',
    jsonb_build_object('version', 2, 'tree', '[]'::jsonb, 'breakpoints', '{}'::jsonb, 'tokens', '{}'::jsonb, 'brand', '{}'::jsonb, 'navigation', '{}'::jsonb, 'styles', '[]'::jsonb, 'interactions', '[]'::jsonb),
    NULL,
    true
  );
  PERFORM public.submit_client_cms_document(v_doc, 'm39');
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM public.decide_client_cms_document(v_doc, true, 'mgmt');
  v_denied := false;
  BEGIN
    PERFORM public.assert_cms_external_publish_allowed(v_doc);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL external publish allowed before client approval'; END IF;

  -- Published doc on hybrid instance may allow external publish
  SELECT id INTO v_doc FROM public.client_cms_documents
  WHERE cms_instance_id = 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf' AND status = 'published'
  ORDER BY published_at DESC NULLS LAST LIMIT 1;
  IF v_doc IS NOT NULL THEN
    v_result := public.assert_cms_external_publish_allowed(v_doc);
    IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION 'FAIL published doc should allow external publish: %', v_result;
    END IF;
  END IF;

  -- Daniel cannot store credentials
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.store_cms_credential('dev/daniel-attempt', 'x', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL Daniel stored credential'; END IF;

  RAISE NOTICE 'M39_REAL_CLIENT_CMS_INTEGRATION_PASS';
END;
$$;

SELECT 'm39_real_client_cms_integration_regression OK' AS result;
