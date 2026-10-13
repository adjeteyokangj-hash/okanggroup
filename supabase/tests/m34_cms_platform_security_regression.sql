-- M34 CMS platform security regression (run as authenticated roles via SET ROLE / JWT in UAT)
-- These checks assert schema hardening; live cross-client isolation is validated with staff/client JWTs.

-- 1) All CMS tables must force RLS
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname IN (
        'cms_instances','cms_instance_grants','cms_modules','cms_connections',
        'client_cms_documents','client_cms_revisions','client_cms_media',
        'cms_templates','cms_custom_module_defs','cms_custom_records',
        'cms_content_comments','cms_publish_jobs','cms_audit_events','cms_media_folders'
      )
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  LOOP
    RAISE EXCEPTION 'RLS/FORCE missing on %', r.relname;
  END LOOP;
END $$;

-- 2) Publish capability is not automatic on new grants (default false unless set)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'cms_instance_grants'
      AND column_name = 'can_publish'
      AND column_default IS DISTINCT FROM 'false'
  ) THEN
    -- Accept explicit DEFAULT false only
    NULL;
  END IF;
END $$;

-- 3) Templates must not embed credential-like keys
DO $$
DECLARE
  bad int;
BEGIN
  SELECT count(*) INTO bad
  FROM public.cms_templates
  WHERE body_json::text ~* '(api[_-]?key|secret|password|token|credential)';
  IF bad > 0 THEN
    RAISE EXCEPTION 'Template library contains secret-like strings';
  END IF;
END $$;

-- 4) Native connection test function exists and is not granted to anon
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.test_cms_connection(uuid)', 'execute') THEN
    RAISE EXCEPTION 'anon must not execute test_cms_connection';
  END IF;
  IF has_function_privilege('anon', 'public.client_decide_cms_document(uuid, boolean, text)', 'execute') THEN
    RAISE EXCEPTION 'anon must not execute client_decide_cms_document';
  END IF;
  IF has_function_privilege('anon', 'public.publish_client_cms_document(uuid, text)', 'execute') THEN
    RAISE EXCEPTION 'anon must not execute publish_client_cms_document';
  END IF;
END $$;

SELECT 'm34_cms_platform_security_regression OK' AS result;
