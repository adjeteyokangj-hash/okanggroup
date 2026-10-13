-- M39: Real client CMS integration layer (development)
-- Dedicated non-production client stub + private credential vault + gateway RPCs.
-- Does NOT connect to live client applications. Production HOLD.

-- ---------------------------------------------------------------------------
-- 1) Adapter catalogue: okang_dev_client (dedicated stub protocol)
-- ---------------------------------------------------------------------------
ALTER TABLE public.cms_connections DROP CONSTRAINT IF EXISTS cms_connections_adapter_code_check;
ALTER TABLE public.cms_connections ADD CONSTRAINT cms_connections_adapter_code_check
  CHECK (adapter_code = ANY (ARRAY[
    'okang_native'::text,
    'wordpress_rest'::text,
    'custom_webhook'::text,
    'manual_only'::text,
    'sandbox_mock'::text,
    'okang_dev_client'::text
  ]));

-- ---------------------------------------------------------------------------
-- 2) Private credential vault (never exposed to browser / authenticated SELECT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.cms_credential_secrets (
  credential_ref text PRIMARY KEY,
  secret_value text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.cms_credential_secrets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.cms_credential_secrets TO service_role;

CREATE OR REPLACE FUNCTION public.store_cms_credential(
  p_credential_ref text,
  p_secret text,
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_ref text := lower(trim(COALESCE(p_credential_ref, '')));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;
  IF v_ref = '' OR length(v_ref) > 200 THEN RAISE EXCEPTION 'Invalid credential_ref'; END IF;
  IF NULLIF(p_secret, '') IS NULL OR length(p_secret) > 4000 THEN
    RAISE EXCEPTION 'Invalid secret';
  END IF;
  -- Refuse obvious live-production labels without explicit Owner prefix
  IF v_ref ~ '(production|prod/|live/)' AND v_ref !~ '^dev/' THEN
    RAISE EXCEPTION 'Production credential refs require separate Owner authorisation (use dev/ prefix on development)';
  END IF;

  INSERT INTO private.cms_credential_secrets (credential_ref, secret_value, description, created_by, rotated_at)
  VALUES (v_ref, p_secret, NULLIF(trim(COALESCE(p_description, '')), ''), auth.uid(), now())
  ON CONFLICT (credential_ref) DO UPDATE SET
    secret_value = EXCLUDED.secret_value,
    description = COALESCE(EXCLUDED.description, private.cms_credential_secrets.description),
    rotated_at = now(),
    created_by = auth.uid();

  RETURN jsonb_build_object(
    'ok', true,
    'credential_ref', v_ref,
    'stored', true,
    'message', 'Credential stored in private vault — value never returned to clients'
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.read_cms_credential(p_credential_ref text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_secret text;
BEGIN
  -- Intended for service_role / edge gateway only
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT secret_value INTO v_secret
  FROM private.cms_credential_secrets
  WHERE credential_ref = lower(trim(p_credential_ref));
  RETURN v_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.cms_credential_ref_exists(p_credential_ref text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.cms_credential_secrets
    WHERE credential_ref = lower(trim(p_credential_ref))
  );
$$;

REVOKE ALL ON FUNCTION public.store_cms_credential(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.read_cms_credential(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cms_credential_ref_exists(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_cms_credential(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cms_credential_ref_exists(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.read_cms_credential(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Gateway connection snapshot (service_role) — no secrets in payload
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cms_gateway_connection_snapshot(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_conn public.cms_connections%ROWTYPE;
  v_has_secret boolean;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    -- Allow clients.manage staff to inspect non-secret snapshot
    IF auth.uid() IS NULL OR NOT private.has_permission('clients.manage') THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS instance not found'; END IF;
  SELECT * INTO v_conn FROM public.cms_connections WHERE cms_instance_id = p_instance_id;
  IF v_conn.id IS NULL THEN RAISE EXCEPTION 'No connection configured'; END IF;

  v_has_secret := CASE
    WHEN nullif(v_conn.credential_ref, '') IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM private.cms_credential_secrets s
      WHERE s.credential_ref = lower(v_conn.credential_ref)
    )
  END;

  RETURN jsonb_build_object(
    'instance_id', v_inst.id,
    'client_id', v_inst.client_id,
    'display_name', v_inst.display_name,
    'cms_config_type', v_inst.cms_config_type,
    'connection_id', v_conn.id,
    'adapter_code', v_conn.adapter_code,
    'base_url', v_conn.base_url,
    'auth_method', v_conn.auth_method,
    'credential_ref', v_conn.credential_ref,
    'credential_present', v_has_secret,
    'status', v_conn.status,
    'integration_mode', v_conn.integration_mode,
    'capability_json', v_conn.capability_json
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cms_gateway_connection_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cms_gateway_connection_snapshot(uuid) TO authenticated, service_role;

-- Service-only secret read wrapper used by edge
CREATE OR REPLACE FUNCTION public.cms_gateway_read_secret(p_credential_ref text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN private.read_cms_credential(p_credential_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.cms_gateway_read_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cms_gateway_read_secret(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Record integration operation + assert publish eligibility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assert_cms_external_publish_allowed(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_doc public.client_cms_documents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_doc FROM public.client_cms_documents WHERE id = p_document_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF NOT private.can_publish_cms_instance(v_doc.cms_instance_id) THEN
    RAISE EXCEPTION 'CMS publish not permitted' USING ERRCODE = '42501';
  END IF;

  IF v_doc.requires_client_approval THEN
    IF v_doc.status NOT IN ('approved_for_publish', 'published') THEN
      RAISE EXCEPTION 'Document requires management + client approval before external publish';
    END IF;
  ELSE
    IF v_doc.status NOT IN ('published', 'approved_for_publish', 'in_review') THEN
      -- External publish after management approve: allow published or approved_for_publish;
      -- in_review alone is not enough (must decide first) except we require published/approved
      RAISE EXCEPTION 'Document must be management-approved (and published or ready) before external publish';
    END IF;
    IF v_doc.status = 'in_review' THEN
      RAISE EXCEPTION 'Document must be management-approved before external publish';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'document_id', v_doc.id,
    'cms_instance_id', v_doc.cms_instance_id,
    'client_id', v_doc.client_id,
    'status', v_doc.status,
    'slug', v_doc.slug,
    'title', v_doc.title,
    'requires_client_approval', v_doc.requires_client_approval
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cms_integration_operation(
  p_instance_id uuid,
  p_correlation_id text,
  p_idempotency_key text,
  p_operation text,
  p_status text,
  p_adapter_code text,
  p_request_json jsonb DEFAULT '{}'::jsonb,
  p_result_json jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_id uuid;
  v_existing uuid;
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS instance not found'; END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NOT (private.has_permission('clients.manage') OR private.can_publish_cms_instance(p_instance_id)) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO v_existing
  FROM public.cms_integration_operations
  WHERE cms_instance_id = p_instance_id AND idempotency_key = p_idempotency_key;
  IF v_existing IS NOT NULL THEN
    UPDATE public.cms_integration_operations SET
      status = p_status,
      result_json = COALESCE(p_result_json, result_json),
      finished_at = CASE WHEN p_status IN ('succeeded', 'failed', 'skipped') THEN now() ELSE finished_at END
    WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO public.cms_integration_operations (
    cms_instance_id, client_id, correlation_id, idempotency_key, operation, status,
    adapter_code, request_json, result_json, actor_id, finished_at
  ) VALUES (
    p_instance_id, v_inst.client_id, p_correlation_id, p_idempotency_key, p_operation, p_status,
    p_adapter_code, COALESCE(p_request_json, '{}'::jsonb), COALESCE(p_result_json, '{}'::jsonb),
    auth.uid(),
    CASE WHEN p_status IN ('succeeded', 'failed', 'skipped') THEN now() ELSE NULL END
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cms_integration_operation_by_key(
  p_instance_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.cms_integration_operations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.cms_integration_operations
  WHERE cms_instance_id = p_instance_id AND idempotency_key = p_idempotency_key;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF NOT (private.has_permission('clients.manage') OR private.can_view_cms_instance(p_instance_id)) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'id', v_row.id,
    'correlation_id', v_row.correlation_id,
    'idempotency_key', v_row.idempotency_key,
    'operation', v_row.operation,
    'status', v_row.status,
    'adapter_code', v_row.adapter_code,
    'result_json', v_row.result_json,
    'created_at', v_row.created_at
  );
END;
$$;

-- Update configure_cms_connection capabilities for okang_dev_client
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
  v_ref text := NULLIF(lower(trim(COALESCE(p_credential_ref, ''))), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS instance not found'; END IF;
  IF v_adapter NOT IN ('okang_native', 'wordpress_rest', 'custom_webhook', 'manual_only', 'sandbox_mock', 'okang_dev_client') THEN
    RAISE EXCEPTION 'Unsupported adapter_code';
  END IF;
  IF v_ref IS NOT NULL AND v_ref ~ '(production|prod/|live/)' AND v_ref !~ '^dev/' THEN
    RAISE EXCEPTION 'Production credential refs require separate Owner authorisation';
  END IF;

  v_mode := COALESCE(NULLIF(trim(COALESCE(p_integration_mode, '')), ''),
    CASE WHEN v_adapter = 'okang_native' THEN 'platform'
         WHEN v_adapter IN ('sandbox_mock') THEN 'sandbox'
         WHEN v_adapter = 'okang_dev_client' THEN 'external'
         WHEN v_inst.cms_config_type = 'hybrid' THEN 'hybrid'
         ELSE 'external' END);

  v_caps := CASE v_adapter
    WHEN 'okang_native' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', true, 'media', true, 'external_live', false)
    WHEN 'sandbox_mock' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', false, 'media', false, 'external_live', false)
    WHEN 'okang_dev_client' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', true, 'media', false, 'external_live', true, 'notes', 'Dedicated non-production client stub')
    WHEN 'manual_only' THEN jsonb_build_object('edit', false, 'preview', false, 'draft', false, 'submit', false, 'publish', false, 'rollback', false, 'media', false, 'external_live', false)
    WHEN 'wordpress_rest' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', false, 'media', true, 'external_live', true)
    WHEN 'custom_webhook' THEN jsonb_build_object('edit', false, 'preview', false, 'draft', false, 'submit', false, 'publish', true, 'rollback', false, 'media', false, 'external_live', true)
    ELSE '{}'::jsonb END;

  INSERT INTO public.cms_connections (
    cms_instance_id, client_id, adapter_code, base_url, auth_method,
    credential_ref, status, notes, capability_json, integration_mode
  ) VALUES (
    p_instance_id, v_inst.client_id, v_adapter,
    NULLIF(trim(COALESCE(p_base_url, '')), ''),
    CASE WHEN v_adapter IN ('okang_native', 'sandbox_mock', 'manual_only') THEN 'manual'
         WHEN v_adapter = 'okang_dev_client' THEN 'service_jwt'
         ELSE 'signed_webhook' END,
    v_ref,
    CASE WHEN v_adapter IN ('okang_native', 'sandbox_mock') THEN 'configured'
         WHEN v_ref IS NULL THEN 'not_configured'
         ELSE 'configured' END,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_caps, v_mode
  )
  ON CONFLICT (cms_instance_id) DO UPDATE SET
    adapter_code = EXCLUDED.adapter_code,
    base_url = EXCLUDED.base_url,
    credential_ref = COALESCE(EXCLUDED.credential_ref, public.cms_connections.credential_ref),
    notes = COALESCE(EXCLUDED.notes, public.cms_connections.notes),
    capability_json = EXCLUDED.capability_json,
    integration_mode = EXCLUDED.integration_mode,
    auth_method = EXCLUDED.auth_method,
    status = EXCLUDED.status,
    last_error = NULL,
    updated_at = now()
  RETURNING * INTO v_conn;

  PERFORM private.cms_audit(p_instance_id, v_inst.client_id, 'connection_configure', 'connection', v_conn.id,
    jsonb_build_object('adapter', v_adapter, 'integration_mode', v_mode, 'credential_ref', v_ref));

  RETURN jsonb_build_object(
    'ok', true, 'connection_id', v_conn.id, 'adapter', v_adapter,
    'integration_mode', v_mode, 'capabilities', v_caps, 'status', v_conn.status,
    'credential_ref', v_conn.credential_ref
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_cms_external_publish_allowed(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_cms_integration_operation(uuid, text, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_cms_integration_operation_by_key(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_cms_external_publish_allowed(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_cms_integration_operation(uuid, text, text, text, text, text, jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_cms_integration_operation_by_key(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_cms_credential(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_cms_connection(uuid, text, text, text, text, text) TO authenticated;
