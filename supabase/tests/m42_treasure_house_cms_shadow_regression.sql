-- M42: Treasure House CMS shadow regression (development)
-- Synthetic website CMS only. No production connection.

DO $$
DECLARE
  v_inst uuid := 'c8a1b2d3-e4f5-4678-9abc-111111111102';
  v_defs int;
  v_recs int;
  v_active int;
  v_excluded int;
  v_sensitive_active int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.cms_instances WHERE id = v_inst AND slug = 'treasure-house-shadow') THEN
    RAISE EXCEPTION 'FAIL missing treasure-house-shadow instance';
  END IF;

  SELECT count(*) INTO v_defs FROM public.cms_custom_module_defs WHERE cms_instance_id = v_inst AND status = 'active';
  IF v_defs < 10 THEN RAISE EXCEPTION 'FAIL expected >=10 custom module defs, got %', v_defs; END IF;

  SELECT count(*) INTO v_recs FROM public.cms_custom_records WHERE cms_instance_id = v_inst;
  IF v_recs < 10 THEN RAISE EXCEPTION 'FAIL expected >=10 synthetic records, got %', v_recs; END IF;

  SELECT count(*) INTO v_active FROM public.cms_modules WHERE cms_instance_id = v_inst AND status = 'active' AND is_sensitive = false;
  IF v_active < 12 THEN RAISE EXCEPTION 'FAIL expected website modules, got %', v_active; END IF;

  SELECT count(*) INTO v_excluded FROM public.cms_modules
  WHERE cms_instance_id = v_inst AND module_code IN ('membership','pastoral','prayer_requests','giving') AND status = 'disabled' AND is_sensitive;
  IF v_excluded < 4 THEN RAISE EXCEPTION 'FAIL sensitive modules not withheld'; END IF;

  SELECT count(*) INTO v_sensitive_active FROM public.cms_modules
  WHERE cms_instance_id = v_inst AND is_sensitive AND status = 'active';
  IF v_sensitive_active > 0 THEN RAISE EXCEPTION 'FAIL sensitive module active in shadow'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.cms_custom_records r
    WHERE r.cms_instance_id = v_inst
      AND (r.data_json::text ILIKE '%pastoral%' OR r.title ILIKE '%membership vault%')
  ) THEN
    RAISE EXCEPTION 'FAIL unexpected sensitive content markers in synthetic records';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.cms_connections c
    WHERE c.cms_instance_id = v_inst AND COALESCE((c.capability_json->>'external_live')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'FAIL shadow connection marked external_live';
  END IF;

  RAISE NOTICE 'M42_TREASURE_HOUSE_CMS_SHADOW_PASS defs=% records=%', v_defs, v_recs;
END;
$$;

SELECT 'm42_treasure_house_cms_shadow_regression OK' AS result;
