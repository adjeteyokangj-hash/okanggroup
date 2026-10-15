-- M43: OpsWatch marketing website adapter for Managed Websites.
-- Additive only. Reuses cms_instances / cms_connections / gateway.
-- Does not grant OpsWatch customer, monitoring, or billing access.

ALTER TABLE public.cms_connections DROP CONSTRAINT IF EXISTS cms_connections_adapter_code_check;
ALTER TABLE public.cms_connections ADD CONSTRAINT cms_connections_adapter_code_check
  CHECK (adapter_code = ANY (ARRAY[
    'okang_native'::text,
    'wordpress_rest'::text,
    'custom_webhook'::text,
    'manual_only'::text,
    'sandbox_mock'::text,
    'okang_dev_client'::text,
    'treasure_house_staging'::text,
    'opswatch_marketing'::text
  ]));

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
  IF v_adapter NOT IN (
    'okang_native', 'wordpress_rest', 'custom_webhook', 'manual_only',
    'sandbox_mock', 'okang_dev_client', 'treasure_house_staging', 'opswatch_marketing'
  ) THEN
    RAISE EXCEPTION 'Unsupported adapter_code';
  END IF;
  IF v_ref IS NOT NULL AND v_ref ~ '(production|prod/|live/)' AND v_ref !~ '^dev/' THEN
    RAISE EXCEPTION 'Production credential refs require separate Owner authorisation';
  END IF;

  v_mode := COALESCE(NULLIF(trim(COALESCE(p_integration_mode, '')), ''),
    CASE WHEN v_adapter = 'okang_native' THEN 'platform'
         WHEN v_adapter IN ('sandbox_mock') THEN 'sandbox'
         WHEN v_adapter IN ('okang_dev_client', 'opswatch_marketing', 'treasure_house_staging') THEN 'external'
         WHEN v_inst.cms_config_type = 'hybrid' THEN 'hybrid'
         ELSE 'external' END);

  v_caps := CASE v_adapter
    WHEN 'okang_native' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', true, 'media', true, 'external_live', false)
    WHEN 'sandbox_mock' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', false, 'media', false, 'external_live', false)
    WHEN 'okang_dev_client' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', true, 'media', false, 'external_live', true, 'notes', 'Dedicated non-production client stub')
    WHEN 'opswatch_marketing' THEN jsonb_build_object(
      'edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', true,
      'media', false, 'external_live', true, 'pricing_amounts', false, 'customer_data', false,
      'billing_records', false, 'monitoring_operations', false,
      'notes', 'OpsWatch public marketing website only — no Command Center or billing access'
    )
    WHEN 'treasure_house_staging' THEN jsonb_build_object('edit', true, 'preview', true, 'draft', true, 'submit', true, 'publish', true, 'rollback', true, 'media', false, 'external_live', true, 'notes', 'Treasure House staging bridge')
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
         WHEN v_adapter IN ('okang_dev_client', 'opswatch_marketing', 'treasure_house_staging') THEN 'service_jwt'
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

GRANT EXECUTE ON FUNCTION public.configure_cms_connection(uuid, text, text, text, text, text) TO authenticated;
