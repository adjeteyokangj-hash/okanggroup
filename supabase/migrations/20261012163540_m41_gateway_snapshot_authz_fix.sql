-- M41: Fix gateway snapshot authz
-- SECURITY DEFINER runs as postgres, so current_user bypass must not skip JWT checks.

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
  -- service_role: Edge gateway after caller authz
  -- authenticated + clients.manage: CMS Management staff
  -- postgres/supabase_admin with NO jwt: maintenance SQL only
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    NULL;
  ELSIF auth.uid() IS NOT NULL THEN
    IF NOT private.has_permission('clients.manage') THEN
      RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF current_user IN ('postgres', 'supabase_admin') THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
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

CREATE OR REPLACE FUNCTION public.cms_gateway_read_secret(p_credential_ref text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    NULL;
  ELSIF current_user IN ('postgres', 'supabase_admin') AND auth.uid() IS NULL THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN private.read_cms_credential(p_credential_ref);
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
  IF COALESCE(auth.role(), '') = 'service_role' THEN
    NULL;
  ELSIF current_user IN ('postgres', 'supabase_admin') AND auth.uid() IS NULL THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT secret_value INTO v_secret
  FROM private.cms_credential_secrets
  WHERE credential_ref = lower(trim(p_credential_ref));
  RETURN v_secret;
END;
$$;
