-- M38: Centralised Client CMS integration foundation (development)
-- Safe sandbox_mock adapter + capability assessment + integration operation log.
-- Does NOT call live client applications. Production HOLD.

-- ---------------------------------------------------------------------------
-- 1) Allow sandbox_mock adapter (safe test connections only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cms_connections DROP CONSTRAINT IF EXISTS cms_connections_adapter_code_check;
ALTER TABLE public.cms_connections ADD CONSTRAINT cms_connections_adapter_code_check
  CHECK (adapter_code = ANY (ARRAY[
    'okang_native'::text,
    'wordpress_rest'::text,
    'custom_webhook'::text,
    'manual_only'::text,
    'sandbox_mock'::text
  ]));

ALTER TABLE public.cms_connections
  ADD COLUMN IF NOT EXISTS capability_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_test_json jsonb,
  ADD COLUMN IF NOT EXISTS integration_mode text NOT NULL DEFAULT 'platform'
    CHECK (integration_mode = ANY (ARRAY[
      'platform'::text,
      'external'::text,
      'hybrid'::text,
      'sandbox'::text
    ]));

COMMENT ON COLUMN public.cms_connections.capability_json IS
  'Adapter capability assessment (PA-I03 lite). Never stores secrets.';
COMMENT ON COLUMN public.cms_connections.credential_ref IS
  'Vault/secret-store label only — never raw API keys.';

-- ---------------------------------------------------------------------------
-- 2) Integration operations log (correlation + idempotency)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cms_integration_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  correlation_id text NOT NULL,
  idempotency_key text NOT NULL,
  operation text NOT NULL
    CHECK (operation = ANY (ARRAY[
      'connection_test'::text,
      'publish'::text,
      'rollback'::text,
      'capability_probe'::text
    ])),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'succeeded'::text,
      'failed'::text,
      'skipped'::text
    ])),
  adapter_code text,
  request_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE (cms_instance_id, idempotency_key),
  CONSTRAINT cms_integration_operations_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS cms_integration_operations_instance_idx
  ON public.cms_integration_operations (cms_instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cms_integration_operations_corr_idx
  ON public.cms_integration_operations (correlation_id);

ALTER TABLE public.cms_integration_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_integration_operations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_integration_operations_select ON public.cms_integration_operations;
CREATE POLICY cms_integration_operations_select ON public.cms_integration_operations
  FOR SELECT TO authenticated
  USING (
    private.has_permission('clients.manage')
    OR private.can_view_cms_instance(cms_instance_id)
  );

DROP POLICY IF EXISTS cms_integration_operations_write ON public.cms_integration_operations;
CREATE POLICY cms_integration_operations_write ON public.cms_integration_operations
  FOR ALL TO authenticated
  USING (private.has_permission('clients.manage'))
  WITH CHECK (private.has_permission('clients.manage'));

GRANT SELECT ON public.cms_integration_operations TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Configure connection adapter (no live outbound calls)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.configure_cms_connection(
  p_instance_id uuid,
  p_adapter_code text,
  p_base_url text DEFAULT NULL,
  p_credential_ref text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_integration_mode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_conn public.cms_connections%ROWTYPE;
  v_adapter text := lower(trim(COALESCE(p_adapter_code, '')));
  v_mode text;
  v_caps jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS instance not found'; END IF;

  IF v_adapter NOT IN ('okang_native', 'wordpress_rest', 'custom_webhook', 'manual_only', 'sandbox_mock') THEN
    RAISE EXCEPTION 'Unsupported adapter_code';
  END IF;

  v_mode := COALESCE(
    NULLIF(trim(COALESCE(p_integration_mode, '')), ''),
    CASE
      WHEN v_adapter = 'okang_native' THEN 'platform'
      WHEN v_adapter = 'sandbox_mock' THEN 'sandbox'
      WHEN v_inst.cms_config_type = 'hybrid' THEN 'hybrid'
      ELSE 'external'
    END
  );

  v_caps := CASE v_adapter
    WHEN 'okang_native' THEN jsonb_build_object(
      'edit', true, 'preview', true, 'draft', true, 'submit', true,
      'publish', true, 'rollback', true, 'media', true,
      'external_live', false, 'notes', 'Platform content store'
    )
    WHEN 'sandbox_mock' THEN jsonb_build_object(
      'edit', true, 'preview', true, 'draft', true, 'submit', true,
      'publish', true, 'rollback', false, 'media', false,
      'external_live', false, 'notes', 'Safe development mock — no live client calls'
    )
    WHEN 'manual_only' THEN jsonb_build_object(
      'edit', false, 'preview', false, 'draft', false, 'submit', false,
      'publish', false, 'rollback', false, 'media', false,
      'external_live', false, 'notes', 'Manual / out-of-band publishing only'
    )
    WHEN 'wordpress_rest' THEN jsonb_build_object(
      'edit', true, 'preview', true, 'draft', true, 'submit', true,
      'publish', true, 'rollback', false, 'media', true,
      'external_live', true, 'notes', 'Requires vault credential_ref + reachable WP REST'
    )
    WHEN 'custom_webhook' THEN jsonb_build_object(
      'edit', false, 'preview', false, 'draft', false, 'submit', false,
      'publish', true, 'rollback', false, 'media', false,
      'external_live', true, 'notes', 'Requires vault credential_ref + signed webhook endpoint'
    )
    ELSE '{}'::jsonb
  END;

  INSERT INTO public.cms_connections (
    cms_instance_id, client_id, adapter_code, base_url, auth_method,
    credential_ref, status, notes, capability_json, integration_mode
  ) VALUES (
    p_instance_id, v_inst.client_id, v_adapter,
    NULLIF(trim(COALESCE(p_base_url, '')), ''),
    CASE WHEN v_adapter IN ('okang_native', 'sandbox_mock', 'manual_only') THEN 'manual' ELSE 'signed_webhook' END,
    NULLIF(trim(COALESCE(p_credential_ref, '')), ''),
    CASE
      WHEN v_adapter IN ('okang_native', 'sandbox_mock') THEN 'configured'
      WHEN NULLIF(trim(COALESCE(p_credential_ref, '')), '') IS NULL THEN 'not_configured'
      ELSE 'configured'
    END,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_caps,
    v_mode
  )
  ON CONFLICT (cms_instance_id) DO UPDATE SET
    adapter_code = EXCLUDED.adapter_code,
    base_url = EXCLUDED.base_url,
    credential_ref = EXCLUDED.credential_ref,
    notes = COALESCE(EXCLUDED.notes, public.cms_connections.notes),
    capability_json = EXCLUDED.capability_json,
    integration_mode = EXCLUDED.integration_mode,
    status = EXCLUDED.status,
    last_error = NULL,
    updated_at = now()
  RETURNING * INTO v_conn;

  PERFORM private.cms_audit(
    p_instance_id, v_inst.client_id, 'connection_configure', 'connection', v_conn.id,
    jsonb_build_object('adapter', v_adapter, 'integration_mode', v_mode, 'external_live', v_caps->'external_live')
  );

  RETURN jsonb_build_object(
    'ok', true,
    'connection_id', v_conn.id,
    'adapter', v_adapter,
    'integration_mode', v_mode,
    'capabilities', v_caps,
    'status', v_conn.status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Connection test — sandbox succeeds without live egress
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.test_cms_connection(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_conn public.cms_connections%ROWTYPE;
  v_result jsonb;
  v_corr text := 'cms-test-' || replace(gen_random_uuid()::text, '-', '');
  v_op uuid;
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
    UPDATE public.cms_connections SET
      status = 'healthy', last_healthy_at = now(), last_error = null,
      last_test_json = jsonb_build_object('ok', true, 'at', now()),
      capability_json = COALESCE(NULLIF(capability_json, '{}'::jsonb), jsonb_build_object(
        'edit', true, 'preview', true, 'draft', true, 'submit', true,
        'publish', true, 'rollback', true, 'media', true, 'external_live', false
      ))
    WHERE id = v_conn.id;
    v_result := jsonb_build_object(
      'ok', true, 'adapter', 'okang_native', 'correlation_id', v_corr,
      'capabilities', jsonb_build_array('edit','preview','draft','submit','publish','rollback','media'),
      'message', 'OkangGroup native CMS healthy (platform content store)',
      'external_live', false
    );
  ELSIF v_conn.adapter_code = 'sandbox_mock' THEN
    UPDATE public.cms_connections SET
      status = 'healthy', last_healthy_at = now(), last_error = null,
      last_test_json = jsonb_build_object('ok', true, 'at', now(), 'mode', 'sandbox'),
      capability_json = jsonb_build_object(
        'edit', true, 'preview', true, 'draft', true, 'submit', true,
        'publish', true, 'rollback', false, 'media', false,
        'external_live', false, 'notes', 'Safe development mock — no live client calls'
      ),
      integration_mode = 'sandbox'
    WHERE id = v_conn.id;
    v_result := jsonb_build_object(
      'ok', true, 'adapter', 'sandbox_mock', 'correlation_id', v_corr,
      'capabilities', jsonb_build_array('edit','preview','draft','submit','publish'),
      'message', 'Sandbox mock healthy — no live client application was contacted',
      'external_live', false
    );
  ELSIF v_conn.adapter_code IN ('wordpress_rest', 'custom_webhook', 'manual_only') THEN
    UPDATE public.cms_connections SET
      status = CASE WHEN nullif(credential_ref, '') IS NULL THEN 'not_configured' ELSE 'configured' END,
      last_error = CASE WHEN nullif(credential_ref, '') IS NULL
        THEN 'Credential reference required before live adapter test'
        ELSE 'Live adapter test requires Owner-supplied vault credentials and reachable API (blocked on this environment)'
      END,
      last_test_json = jsonb_build_object('ok', false, 'blocker', 'external_credentials', 'at', now())
    WHERE id = v_conn.id;
    v_result := jsonb_build_object(
      'ok', false,
      'adapter', v_conn.adapter_code,
      'correlation_id', v_corr,
      'message', 'External adapter registered but live API test blocked — Owner must provide vault credentials and a reachable test endpoint',
      'blocker', 'external_credentials',
      'external_live', true
    );
  ELSE
    v_result := jsonb_build_object('ok', false, 'message', 'Unknown adapter', 'correlation_id', v_corr);
  END IF;

  IF v_conn.id IS NOT NULL THEN
    INSERT INTO public.cms_integration_operations (
      cms_instance_id, client_id, correlation_id, idempotency_key, operation, status,
      adapter_code, request_json, result_json, actor_id, finished_at
    ) VALUES (
      p_instance_id, v_inst.client_id, v_corr, v_corr || ':connection_test', 'connection_test',
      CASE WHEN COALESCE((v_result->>'ok')::boolean, false) THEN 'succeeded' ELSE 'failed' END,
      v_conn.adapter_code,
      jsonb_build_object('instance_id', p_instance_id),
      v_result, auth.uid(), now()
    )
    ON CONFLICT (cms_instance_id, idempotency_key) DO UPDATE SET
      result_json = EXCLUDED.result_json,
      status = EXCLUDED.status,
      finished_at = now()
    RETURNING id INTO v_op;
  END IF;

  PERFORM private.cms_audit(p_instance_id, v_inst.client_id, 'connection_test', 'connection', v_conn.id, v_result);
  RETURN v_result;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5) Sandbox publish probe (idempotent; no live egress)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.run_cms_sandbox_publish_probe(
  p_instance_id uuid,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_conn public.cms_connections%ROWTYPE;
  v_key text := COALESCE(NULLIF(trim(COALESCE(p_idempotency_key, '')), ''), 'sandbox-probe-' || gen_random_uuid()::text);
  v_corr text := 'cms-pub-' || replace(gen_random_uuid()::text, '-', '');
  v_existing public.cms_integration_operations%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS instance not found'; END IF;
  SELECT * INTO v_conn FROM public.cms_connections WHERE cms_instance_id = p_instance_id;
  IF v_conn.id IS NULL THEN RAISE EXCEPTION 'No connection configured'; END IF;
  IF v_conn.adapter_code <> 'sandbox_mock' THEN
    RAISE EXCEPTION 'Sandbox publish probe only allowed for sandbox_mock adapter';
  END IF;

  SELECT * INTO v_existing
  FROM public.cms_integration_operations
  WHERE cms_instance_id = p_instance_id AND idempotency_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', v_existing.status = 'succeeded',
      'idempotent_replay', true,
      'correlation_id', v_existing.correlation_id,
      'status', v_existing.status,
      'result', v_existing.result_json,
      'message', 'Idempotent replay — no duplicate sandbox publish'
    );
  END IF;

  v_result := jsonb_build_object(
    'ok', true,
    'adapter', 'sandbox_mock',
    'external_live', false,
    'published_to', 'sandbox_store',
    'message', 'Sandbox publish succeeded — no live client application was modified'
  );

  INSERT INTO public.cms_integration_operations (
    cms_instance_id, client_id, correlation_id, idempotency_key, operation, status,
    adapter_code, request_json, result_json, actor_id, finished_at
  ) VALUES (
    p_instance_id, v_inst.client_id, v_corr, v_key, 'publish', 'succeeded',
    'sandbox_mock',
    jsonb_build_object('mode', 'sandbox_probe'),
    v_result, auth.uid(), now()
  );

  INSERT INTO public.cms_publish_jobs (
    cms_instance_id, client_id, status, adapter_code, attempt_count,
    verification_json, requested_by, finished_at
  ) VALUES (
    p_instance_id, v_inst.client_id, 'succeeded', 'sandbox_mock', 1,
    jsonb_build_object('mode', 'sandbox', 'correlation_id', v_corr, 'verified_at', now()),
    auth.uid(), now()
  );

  PERFORM private.cms_audit(
    p_instance_id, v_inst.client_id, 'sandbox_publish', 'connection', v_conn.id,
    jsonb_build_object('correlation_id', v_corr, 'idempotency_key', v_key)
  );

  RETURN v_result || jsonb_build_object('correlation_id', v_corr, 'idempotency_key', v_key, 'idempotent_replay', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- 6) Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.configure_cms_connection(uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.run_cms_sandbox_publish_probe(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.test_cms_connection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.configure_cms_connection(uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_cms_sandbox_publish_probe(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_cms_connection(uuid) TO authenticated;
