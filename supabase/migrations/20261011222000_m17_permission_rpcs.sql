-- M17: Public RPC wrappers for admin RBAC (calls private helpers only)

CREATE OR REPLACE FUNCTION public.has_permission(code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT private.has_permission(code);
$$;

CREATE OR REPLACE FUNCTION public.my_permission_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT COALESCE(array_agg(DISTINCT code ORDER BY code), ARRAY[]::text[])
  FROM (
    SELECT p.code
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.access_scopes s ON s.id = rg.access_scope_id
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND s.scope_type = 'platform'
    UNION
    SELECT p.code
    FROM public.temporary_access ta
    JOIN public.permissions p ON p.id = ta.permission_id
    WHERE ta.profile_id = auth.uid()
      AND ta.revoked_at IS NULL
      AND ta.starts_at <= now()
      AND ta.ends_at > now()
  ) codes;
$$;

REVOKE ALL ON FUNCTION public.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_permission_codes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permission_codes() TO authenticated;
