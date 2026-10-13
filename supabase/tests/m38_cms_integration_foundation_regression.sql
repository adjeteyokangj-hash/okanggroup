-- M38: Central CMS integration foundation regression (development)
-- JWT impersonation — no passwords. No live client applications. Production HOLD.

DO $$
DECLARE
  v_owner uuid := 'a7bce15a-566a-43df-aa93-4f23da8bb35f';
  v_inst uuid := 'f5dfa20e-3c7a-4b89-b77d-ac53339a1edf';
  v_other_client uuid;
  v_custom uuid;
  v_result jsonb;
  v_replay jsonb;
  v_key text := 'm38-foundation-probe-v1';
  v_ops int;
  v_denied boolean;
BEGIN
  IF (SELECT count(*) FROM auth.mfa_factors WHERE user_id = v_owner AND status = 'verified') < 1 THEN
    RAISE EXCEPTION 'FAIL Owner MFA not verified';
  END IF;

  SELECT id INTO v_other_client FROM public.clients WHERE client_code = 'UAT-OTHER-ISO' LIMIT 1;
  IF v_other_client IS NULL THEN
    v_other_client := gen_random_uuid();
    INSERT INTO public.clients (id, client_code, legal_name, status)
    VALUES (v_other_client, 'UAT-OTHER-ISO', 'UAT Other Client Isolation', 'active');
  END IF;

  -- Custom CMS for other client (not forced into Generic structure)
  SELECT id INTO v_custom FROM public.cms_instances
  WHERE client_id = v_other_client AND slug = 'uat-custom-sandbox' LIMIT 1;
  IF v_custom IS NULL THEN
    v_custom := gen_random_uuid();
    INSERT INTO public.cms_instances (
      id, client_id, display_name, slug, cms_kind, cms_config_type,
      management_mode, status, activated_at, created_by
    ) VALUES (
      v_custom, v_other_client, 'UAT Custom Sandbox CMS', 'uat-custom-sandbox',
      'external_website', 'custom', 'okanggroup_managed', 'active', now(), v_owner
    );
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  -- Configure sandbox on custom instance
  v_result := public.configure_cms_connection(
    v_custom, 'sandbox_mock', NULL, NULL, 'M38 safe sandbox', 'sandbox'
  );
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL configure sandbox: %', v_result;
  END IF;
  IF (v_result->>'adapter') IS DISTINCT FROM 'sandbox_mock' THEN
    RAISE EXCEPTION 'FAIL adapter not sandbox_mock';
  END IF;
  IF COALESCE((v_result->'capabilities'->>'external_live')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL sandbox must not be external_live';
  END IF;

  v_result := public.test_cms_connection(v_custom);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL sandbox test: %', v_result;
  END IF;

  v_result := public.run_cms_sandbox_publish_probe(v_custom, v_key);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL sandbox publish: %', v_result;
  END IF;
  IF COALESCE((v_result->>'idempotent_replay')::boolean, true) IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL first publish should not be replay';
  END IF;

  v_replay := public.run_cms_sandbox_publish_probe(v_custom, v_key);
  IF COALESCE((v_replay->>'idempotent_replay')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL expected idempotent replay';
  END IF;

  -- Native instance remains healthy
  v_result := public.test_cms_connection(v_inst);
  IF COALESCE((v_result->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL native test: %', v_result;
  END IF;

  -- Isolation: unauthenticated cannot configure
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.configure_cms_connection(v_custom, 'sandbox_mock', NULL, NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL unprivileged configure allowed'; END IF;

  SELECT count(*) INTO v_ops FROM public.cms_integration_operations
  WHERE cms_instance_id = v_custom AND created_at > now() - interval '15 minutes';
  IF v_ops < 2 THEN RAISE EXCEPTION 'FAIL expected integration operation rows, got %', v_ops; END IF;

  -- FORCE RLS on new table
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'cms_integration_operations'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'FAIL cms_integration_operations missing FORCE RLS';
  END IF;

  RAISE NOTICE 'M38_INTEGRATION_FOUNDATION_PASS custom=% ops=%', v_custom, v_ops;
END;
$$;

SELECT 'm38_cms_integration_foundation_regression OK' AS result;
