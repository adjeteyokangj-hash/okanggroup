-- M40: Hosted non-production dev-client-cms store (Edge-reachable stub persistence)
-- Isolated development fixture only. Not a live client application. Production HOLD.

CREATE TABLE IF NOT EXISTS private.dev_client_cms_store (
  module_code text PRIMARY KEY,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  revisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON TABLE private.dev_client_cms_store FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.dev_client_cms_store TO service_role;

INSERT INTO private.dev_client_cms_store (module_code, draft, published, revisions)
VALUES
  (
    'announcements',
    jsonb_build_object(
      'title', 'Welcome',
      'body', 'Development stub content',
      'updated_at', now()
    ),
    NULL,
    '[]'::jsonb
  ),
  (
    'homepage',
    jsonb_build_object(
      'title', 'Home',
      'body', 'Stub homepage',
      'updated_at', now()
    ),
    NULL,
    '[]'::jsonb
  )
ON CONFLICT (module_code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.dev_client_cms_store_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(
    (
      SELECT jsonb_agg(module_code ORDER BY module_code)
      FROM private.dev_client_cms_store
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_client_cms_store_get(p_module_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row private.dev_client_cms_store%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row
  FROM private.dev_client_cms_store
  WHERE module_code = lower(trim(p_module_code));
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'module_code', v_row.module_code,
    'draft', v_row.draft,
    'published', v_row.published,
    'revisions', v_row.revisions,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_client_cms_store_put_draft(p_module_code text, p_draft jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_code text := lower(trim(COALESCE(p_module_code, '')));
  v_draft jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_code = '' THEN RAISE EXCEPTION 'module_code required'; END IF;
  v_draft := COALESCE(p_draft, '{}'::jsonb) || jsonb_build_object('updated_at', now());
  INSERT INTO private.dev_client_cms_store (module_code, draft, published, revisions)
  VALUES (v_code, v_draft, NULL, '[]'::jsonb)
  ON CONFLICT (module_code) DO UPDATE SET
    draft = EXCLUDED.draft,
    updated_at = now();
  RETURN public.dev_client_cms_store_get(v_code);
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_client_cms_store_publish(p_module_code text, p_correlation_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_code text := lower(trim(COALESCE(p_module_code, '')));
  v_row private.dev_client_cms_store%ROWTYPE;
  v_revs jsonb;
  v_rev_no int;
  v_entry jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM private.dev_client_cms_store WHERE module_code = v_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module not found'; END IF;
  v_revs := COALESCE(v_row.revisions, '[]'::jsonb);
  v_rev_no := jsonb_array_length(v_revs) + 1;
  v_entry := jsonb_build_object(
    'revision_no', v_rev_no,
    'snapshot', v_row.draft,
    'published_at', now(),
    'correlation_id', NULLIF(trim(COALESCE(p_correlation_id, '')), '')
  );
  UPDATE private.dev_client_cms_store SET
    published = draft,
    revisions = v_revs || jsonb_build_array(v_entry),
    updated_at = now()
  WHERE module_code = v_code;
  RETURN public.dev_client_cms_store_get(v_code) || jsonb_build_object('revision_no', v_rev_no);
END;
$$;

CREATE OR REPLACE FUNCTION public.dev_client_cms_store_rollback(p_module_code text, p_revision_no int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_code text := lower(trim(COALESCE(p_module_code, '')));
  v_row private.dev_client_cms_store%ROWTYPE;
  v_snap jsonb;
  v_el jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM private.dev_client_cms_store WHERE module_code = v_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Module not found'; END IF;
  FOR v_el IN SELECT * FROM jsonb_array_elements(COALESCE(v_row.revisions, '[]'::jsonb))
  LOOP
    IF (v_el->>'revision_no')::int = p_revision_no THEN
      v_snap := v_el->'snapshot';
      EXIT;
    END IF;
  END LOOP;
  IF v_snap IS NULL THEN RAISE EXCEPTION 'Revision not found'; END IF;
  UPDATE private.dev_client_cms_store SET
    draft = v_snap,
    published = v_snap,
    updated_at = now()
  WHERE module_code = v_code;
  RETURN public.dev_client_cms_store_get(v_code) || jsonb_build_object('restored_revision', p_revision_no);
END;
$$;

REVOKE ALL ON FUNCTION public.dev_client_cms_store_list() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_client_cms_store_get(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_client_cms_store_put_draft(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_client_cms_store_publish(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dev_client_cms_store_rollback(text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dev_client_cms_store_list() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_client_cms_store_get(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_client_cms_store_put_draft(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_client_cms_store_publish(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_client_cms_store_rollback(text, int) TO service_role;
