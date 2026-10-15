-- M44: Managed Websites — OkangGroup product ownership without fake customer clients.
-- Additive only. Preserves existing client CMS rows and permissions.
--
-- Finding: cms_instances.client_id is NOT NULL and is part of composite FKs.
-- Making client_id nullable would be unsafe. Instead:
--   1) Tag clients.record_kind = house | customer
--   2) Ensure one real OkangGroup house client (legal entity, not a fictional customer)
--   3) Tag cms_instances.ownership_kind + product_code for product websites
--
-- Future OkangGroup products: register via product_code + adapter_code through
-- register_managed_website / the Owner catalogue. No further ownership migration required.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS record_kind text NOT NULL DEFAULT 'customer'
    CHECK (record_kind IN ('house', 'customer'));

COMMENT ON COLUMN public.clients.record_kind IS
  'house = OkangGroup legal entity for owned products; customer = external client. Not a fake CRM prospect.';

CREATE UNIQUE INDEX IF NOT EXISTS clients_one_house_idx
  ON public.clients (record_kind)
  WHERE record_kind = 'house';

ALTER TABLE public.cms_instances
  ADD COLUMN IF NOT EXISTS ownership_kind text NOT NULL DEFAULT 'client_website',
  ADD COLUMN IF NOT EXISTS product_code text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cms_instances_ownership_kind_chk'
  ) THEN
    ALTER TABLE public.cms_instances
      ADD CONSTRAINT cms_instances_ownership_kind_chk
      CHECK (ownership_kind IN ('okanggroup_product', 'client_website'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cms_instances_ownership_product_chk'
  ) THEN
    ALTER TABLE public.cms_instances
      ADD CONSTRAINT cms_instances_ownership_product_chk
      CHECK (
        (ownership_kind = 'okanggroup_product' AND product_code IS NOT NULL)
        OR (ownership_kind = 'client_website' AND product_code IS NULL)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.cms_instances.ownership_kind IS
  'okanggroup_product = OkangGroup owned website/app; client_website = customer site.';

CREATE UNIQUE INDEX IF NOT EXISTS cms_instances_product_code_uidx
  ON public.cms_instances (product_code)
  WHERE product_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Ensure OkangGroup house client (idempotent)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_okanggroup_house_client()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id FROM public.clients WHERE record_kind = 'house' LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT id INTO v_id FROM public.clients WHERE client_code = 'OKANGGROUP' LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.clients
    SET record_kind = 'house',
        legal_name = COALESCE(NULLIF(legal_name, ''), 'Okang Group'),
        trading_name = COALESCE(trading_name, 'OkangGroup'),
        status = 'active',
        updated_at = now()
    WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.clients (
    client_code, legal_name, trading_name, status, record_kind, notes_internal, created_by
  ) VALUES (
    'OKANGGROUP',
    'Okang Group',
    'OkangGroup',
    'active',
    'house',
    'System house record for OkangGroup-owned product websites. Not a customer account.',
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_okanggroup_house_client() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_okanggroup_house_client() TO authenticated;

-- ---------------------------------------------------------------------------
-- Register managed website (product or client) — dedupes OpsWatch by product_code
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_managed_website(
  p_ownership_kind text,
  p_display_name text,
  p_product_code text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_public_site_url text DEFAULT NULL,
  p_adapter_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_kind text := lower(trim(COALESCE(p_ownership_kind, '')));
  v_name text := NULLIF(trim(COALESCE(p_display_name, '')), '');
  v_product text := NULLIF(lower(trim(COALESCE(p_product_code, ''))), '');
  v_adapter text := NULLIF(lower(trim(COALESCE(p_adapter_code, ''))), '');
  v_client uuid;
  v_existing public.cms_instances%ROWTYPE;
  v_inst public.cms_instances%ROWTYPE;
  v_slug text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.has_permission('clients.manage') THEN
    RAISE EXCEPTION 'clients.manage required' USING ERRCODE = '42501';
  END IF;
  IF v_kind NOT IN ('okanggroup_product', 'client_website') THEN
    RAISE EXCEPTION 'ownership_kind must be okanggroup_product or client_website';
  END IF;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'display_name required';
  END IF;

  IF v_kind = 'okanggroup_product' THEN
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'product_code required for OkangGroup products';
    END IF;
    SELECT * INTO v_existing
    FROM public.cms_instances
    WHERE product_code = v_product
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'created', false,
        'already_registered', true,
        'instance_id', v_existing.id,
        'slug', v_existing.slug,
        'display_name', v_existing.display_name,
        'ownership_kind', v_existing.ownership_kind,
        'product_code', v_existing.product_code
      );
    END IF;
    v_client := public.ensure_okanggroup_house_client();
    v_slug := v_product;
    v_adapter := COALESCE(v_adapter, CASE WHEN v_product = 'opswatch' THEN 'opswatch_marketing' ELSE 'okang_native' END);
  ELSE
    IF p_client_id IS NULL THEN
      RAISE EXCEPTION 'client_id required for client websites';
    END IF;
    v_client := p_client_id;
    IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = v_client AND c.record_kind = 'customer') THEN
      RAISE EXCEPTION 'Client website must use a customer client record';
    END IF;
    v_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
    v_slug := trim(both '-' from v_slug) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    v_adapter := COALESCE(v_adapter, 'okang_native');
    v_product := NULL;
  END IF;

  INSERT INTO public.cms_instances (
    client_id,
    project_id,
    slug,
    display_name,
    cms_kind,
    cms_config_type,
    management_mode,
    status,
    ownership_kind,
    product_code,
    public_site_url,
    activated_at,
    created_by,
    notes
  ) VALUES (
    v_client,
    CASE WHEN v_kind = 'client_website' THEN p_project_id ELSE NULL END,
    v_slug,
    v_name,
    CASE WHEN v_adapter = 'opswatch_marketing' THEN 'external_website' ELSE 'okang_native' END,
    CASE WHEN v_kind = 'okanggroup_product' THEN 'custom' ELSE 'generic' END,
    'okanggroup_managed',
    'active',
    v_kind,
    v_product,
    NULLIF(trim(COALESCE(p_public_site_url, '')), ''),
    now(),
    auth.uid(),
    CASE WHEN v_kind = 'okanggroup_product'
      THEN 'OkangGroup owned product website'
      ELSE 'Client website'
    END
  )
  RETURNING * INTO v_inst;

  -- Owner grant so Manage Website opens from My Client CMS
  INSERT INTO public.cms_instance_grants (
    cms_instance_id, client_id, profile_id,
    can_view, can_edit, can_submit, can_publish,
    can_upload_media, can_review, can_manage_content,
    granted_by
  ) VALUES (
    v_inst.id, v_client, auth.uid(),
    true, true, true, true,
    true, true, true,
    auth.uid()
  )
  ON CONFLICT (cms_instance_id, profile_id) DO UPDATE SET
    can_view = true,
    can_edit = true,
    can_submit = true,
    can_publish = true,
    can_upload_media = true,
    can_review = true,
    can_manage_content = true,
    revoked_at = NULL;

  IF v_adapter = 'opswatch_marketing' THEN
    -- base_url is the OpsWatch CMS HTTP API, not the public marketing origin.
    PERFORM public.configure_cms_connection(
      v_inst.id,
      'opswatch_marketing',
      'http://localhost:4000/api/cms',
      'dev/opswatch-marketing-cms',
      'OpsWatch public marketing website only',
      'external'
    );
  ELSE
    INSERT INTO public.cms_connections (
      cms_instance_id, client_id, adapter_code, auth_method, status, notes, integration_mode
    ) VALUES (
      v_inst.id, v_client, v_adapter, 'manual', 'configured',
      'Created from Managed Websites',
      CASE WHEN v_adapter = 'okang_native' THEN 'platform' ELSE 'external' END
    )
    ON CONFLICT (cms_instance_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'created', true,
    'already_registered', false,
    'instance_id', v_inst.id,
    'slug', v_inst.slug,
    'display_name', v_inst.display_name,
    'ownership_kind', v_inst.ownership_kind,
    'product_code', v_inst.product_code,
    'adapter', v_adapter,
    'client_id', v_client
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_managed_website(text, text, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_managed_website(text, text, text, uuid, uuid, text, text) TO authenticated;
