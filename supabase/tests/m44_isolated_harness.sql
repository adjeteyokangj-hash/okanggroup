-- Isolated harness for M44 verification (not the hosted project).
-- Minimal stubs only — enough to exercise ownership RPCs safely.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS private;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  account_status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT false
);

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  trading_name text,
  status text NOT NULL DEFAULT 'active',
  notes_internal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE TABLE public.cms_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  project_id uuid,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  cms_kind text NOT NULL DEFAULT 'external_website',
  management_mode text NOT NULL DEFAULT 'okanggroup_managed',
  status text NOT NULL DEFAULT 'active',
  cms_config_type text NOT NULL DEFAULT 'generic',
  public_site_url text,
  notes text,
  activated_at timestamptz,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id)
);

CREATE TABLE public.cms_instance_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  can_submit boolean NOT NULL DEFAULT false,
  can_publish boolean NOT NULL DEFAULT false,
  can_upload_media boolean NOT NULL DEFAULT false,
  can_review boolean NOT NULL DEFAULT false,
  can_manage_content boolean NOT NULL DEFAULT false,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (cms_instance_id, profile_id),
  FOREIGN KEY (client_id, cms_instance_id) REFERENCES public.cms_instances (client_id, id) ON DELETE CASCADE
);

CREATE TABLE public.cms_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL UNIQUE,
  client_id uuid NOT NULL,
  adapter_code text NOT NULL,
  base_url text,
  auth_method text,
  credential_ref text,
  status text NOT NULL DEFAULT 'not_configured',
  notes text,
  capability_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  integration_mode text,
  last_error text,
  last_healthy_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (client_id, cms_instance_id) REFERENCES public.cms_instances (client_id, id) ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION private.has_permission(code text)
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = v_uid AND p.account_status = 'active'
      AND code = 'clients.manage'
      AND COALESCE(current_setting('test.grant_clients_manage', true), '0') = '1'
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.cms_audit(
  p_instance_id uuid, p_client_id uuid, p_action text,
  p_entity_type text, p_entity_id uuid, p_detail jsonb
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  NULL;
END;
$$;

-- Stub configure_cms_connection compatible with m44 call shape
CREATE OR REPLACE FUNCTION public.configure_cms_connection(
  p_instance_id uuid,
  p_adapter_code text,
  p_base_url text DEFAULT NULL,
  p_credential_ref text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_integration_mode text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE
  v_inst public.cms_instances%ROWTYPE;
  v_conn public.cms_connections%ROWTYPE;
BEGIN
  SELECT * INTO v_inst FROM public.cms_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CMS instance not found'; END IF;
  INSERT INTO public.cms_connections (
    cms_instance_id, client_id, adapter_code, base_url, auth_method,
    credential_ref, status, notes, capability_json, integration_mode
  ) VALUES (
    p_instance_id, v_inst.client_id, p_adapter_code,
    NULLIF(trim(COALESCE(p_base_url, '')), ''),
    'service_jwt',
    NULLIF(trim(COALESCE(p_credential_ref, '')), ''),
    'configured',
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    jsonb_build_object('external_live', true, 'edit', true),
    COALESCE(NULLIF(trim(COALESCE(p_integration_mode, '')), ''), 'external')
  )
  ON CONFLICT (cms_instance_id) DO UPDATE SET
    adapter_code = EXCLUDED.adapter_code,
    base_url = EXCLUDED.base_url,
    credential_ref = COALESCE(EXCLUDED.credential_ref, public.cms_connections.credential_ref),
    notes = COALESCE(EXCLUDED.notes, public.cms_connections.notes),
    capability_json = EXCLUDED.capability_json,
    integration_mode = EXCLUDED.integration_mode,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING * INTO v_conn;
  RETURN jsonb_build_object('ok', true, 'adapter', p_adapter_code, 'status', v_conn.status);
END;
$$;

-- Seed Owner + Treasure House customer CMS (pre-m44 shape)
INSERT INTO public.profiles (id) VALUES ('a7bce15a-566a-43df-aa93-4f23da8bb35f');
INSERT INTO public.clients (id, client_code, legal_name, trading_name, status, notes_internal)
VALUES (
  'c8a1b2d3-e4f5-4678-9abc-111111111101',
  'TH-SHADOW-DEV',
  'Treasure House Bible Church International',
  'Treasure House (CMS Shadow — Development)',
  'active',
  'SHADOW CMS ONLY'
);
INSERT INTO public.cms_instances (
  id, client_id, slug, display_name, cms_kind, cms_config_type, management_mode, status, notes
) VALUES (
  'c8a1b2d3-e4f5-4678-9abc-111111111102',
  'c8a1b2d3-e4f5-4678-9abc-111111111101',
  'treasure-house-shadow',
  'Treasure House Website CMS (Shadow)',
  'church_website',
  'custom',
  'okanggroup_managed',
  'active',
  'Shadow copy'
);
INSERT INTO public.cms_connections (
  cms_instance_id, client_id, adapter_code, auth_method, status, notes, capability_json, integration_mode
) VALUES (
  'c8a1b2d3-e4f5-4678-9abc-111111111102',
  'c8a1b2d3-e4f5-4678-9abc-111111111101',
  'manual_only',
  'manual',
  'configured',
  'Shadow CMS',
  '{"external_live":false,"shadow":true}'::jsonb,
  'platform'
);
