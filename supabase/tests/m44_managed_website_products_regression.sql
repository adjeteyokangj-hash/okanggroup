-- M44 regression: OkangGroup product ownership (development / isolated DB).
-- JWT impersonation — no passwords. Does not target hosted production.
-- Verifies: additive columns, house ≠ customer, OpsWatch dedupe, auth denial,
-- existing client CMS rows unchanged.

DO $$
DECLARE
  v_owner uuid := 'a7bce15a-566a-43df-aa93-4f23da8bb35f';
  v_th_client uuid := 'c8a1b2d3-e4f5-4678-9abc-111111111101';
  v_th_inst uuid := 'c8a1b2d3-e4f5-4678-9abc-111111111102';
  v_before_clients int;
  v_before_cms int;
  v_after_clients int;
  v_after_cms int;
  v_th_kind text;
  v_th_product text;
  v_th_client_kind text;
  v_house uuid;
  v1 jsonb;
  v2 jsonb;
  v_future jsonb;
  v_denied boolean;
  v_count int;
  v_house_in_customer_path boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clients' AND column_name = 'record_kind'
  ) THEN
    RAISE EXCEPTION 'FAIL m44 not applied (clients.record_kind missing)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cms_instances' AND column_name = 'ownership_kind'
  ) THEN
    RAISE EXCEPTION 'FAIL m44 not applied (cms_instances.ownership_kind missing)';
  END IF;

  SELECT count(*) INTO v_before_clients FROM public.clients;
  SELECT count(*) INTO v_before_cms FROM public.cms_instances;

  -- Existing Treasure House shadow must remain a customer / client_website
  SELECT ownership_kind, product_code INTO v_th_kind, v_th_product
  FROM public.cms_instances WHERE id = v_th_inst;
  IF v_th_kind IS DISTINCT FROM 'client_website' THEN
    RAISE EXCEPTION 'FAIL Treasure House ownership_kind changed: %', v_th_kind;
  END IF;
  IF v_th_product IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL Treasure House must not have product_code';
  END IF;
  SELECT record_kind INTO v_th_client_kind FROM public.clients WHERE id = v_th_client;
  IF v_th_client_kind IS DISTINCT FROM 'customer' THEN
    RAISE EXCEPTION 'FAIL Treasure House client must remain customer, got %', v_th_client_kind;
  END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  v_house := public.ensure_okanggroup_house_client();
  IF v_house IS NULL THEN RAISE EXCEPTION 'FAIL house client missing'; END IF;
  IF (SELECT record_kind FROM public.clients WHERE id = v_house) IS DISTINCT FROM 'house' THEN
    RAISE EXCEPTION 'FAIL house record_kind expected';
  END IF;
  IF (SELECT client_code FROM public.clients WHERE id = v_house) IS DISTINCT FROM 'OKANGGROUP' THEN
    RAISE EXCEPTION 'FAIL house client_code must be OKANGGROUP';
  END IF;
  IF (SELECT notes_internal FROM public.clients WHERE id = v_house) !~* 'not a customer' THEN
    RAISE EXCEPTION 'FAIL house notes must state not a customer account';
  END IF;

  -- House must be rejected as a client-website owner
  v_house_in_customer_path := false;
  BEGIN
    PERFORM public.register_managed_website(
      'client_website', 'Should Fail', NULL, v_house, NULL, NULL, 'okang_native'
    );
  EXCEPTION WHEN OTHERS THEN
    v_house_in_customer_path := true;
  END;
  IF NOT v_house_in_customer_path THEN
    RAISE EXCEPTION 'FAIL house client accepted as customer website owner';
  END IF;

  v1 := public.register_managed_website(
    'okanggroup_product',
    'OpsWatch',
    'opswatch',
    NULL,
    NULL,
    'http://localhost:3000',
    'opswatch_marketing'
  );
  IF COALESCE((v1->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL first OpsWatch register: %', v1;
  END IF;
  IF (v1->>'ownership_kind') IS DISTINCT FROM 'okanggroup_product' THEN
    RAISE EXCEPTION 'FAIL ownership_kind: %', v1;
  END IF;

  v2 := public.register_managed_website(
    'okanggroup_product',
    'OpsWatch',
    'opswatch',
    NULL,
    NULL,
    'http://localhost:3000',
    'opswatch_marketing'
  );
  IF COALESCE((v2->>'already_registered')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL duplicate OpsWatch not blocked: %', v2;
  END IF;
  IF (v1->>'instance_id') IS DISTINCT FROM (v2->>'instance_id') THEN
    RAISE EXCEPTION 'FAIL dedupe returned different instance ids';
  END IF;

  SELECT count(*) INTO v_count FROM public.cms_instances WHERE product_code = 'opswatch';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'FAIL expected exactly one opswatch product row, got %', v_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.cms_connections c
    JOIN public.cms_instances i ON i.id = c.cms_instance_id
    WHERE i.product_code = 'opswatch'
      AND c.adapter_code = 'opswatch_marketing'
  ) THEN
    RAISE EXCEPTION 'FAIL opswatch_marketing adapter not attached';
  END IF;

  -- Future product path (catalogue-style) without schema change
  v_future := public.register_managed_website(
    'okanggroup_product',
    'Future Product Stub',
    'okang_future_stub',
    NULL,
    NULL,
    NULL,
    'okang_native'
  );
  IF COALESCE((v_future->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL future product register: %', v_future;
  END IF;
  IF (v_future->>'ownership_kind') IS DISTINCT FROM 'okanggroup_product' THEN
    RAISE EXCEPTION 'FAIL future product ownership';
  END IF;

  -- Unauthorised registration denial
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.register_managed_website(
      'okanggroup_product', 'Denied', 'should_deny', NULL, NULL, NULL, 'okang_native'
    );
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FAIL unprivileged register allowed'; END IF;

  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  -- Existing client CMS still present and classified correctly
  IF NOT EXISTS (SELECT 1 FROM public.cms_instances WHERE id = v_th_inst AND ownership_kind = 'client_website') THEN
    RAISE EXCEPTION 'FAIL Treasure House instance missing or reclassified';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.cms_instances
    WHERE id = v_th_inst AND client_id IS DISTINCT FROM v_th_client
  ) THEN
    RAISE EXCEPTION 'FAIL Treasure House client_id changed';
  END IF;

  SELECT count(*) INTO v_after_clients FROM public.clients;
  SELECT count(*) INTO v_after_cms FROM public.cms_instances;
  -- House + OpsWatch + future stub may add rows; never remove.
  IF v_after_clients < v_before_clients THEN
    RAISE EXCEPTION 'FAIL clients deleted (before %, after %)', v_before_clients, v_after_clients;
  END IF;
  IF v_after_cms < v_before_cms THEN
    RAISE EXCEPTION 'FAIL cms_instances deleted (before %, after %)', v_before_cms, v_after_cms;
  END IF;

  -- Cleanup future stub only (leave OpsWatch for Owner UI verification on local)
  DELETE FROM public.cms_instances WHERE product_code = 'okang_future_stub';

  RAISE NOTICE 'M44 managed website products regression OK';
END $$;
