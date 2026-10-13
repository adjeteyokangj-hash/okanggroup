-- M19: Privileged MFA hard-gate (Owner / platform_admin cannot clear MFA requirement)

CREATE OR REPLACE FUNCTION public.session_requires_mfa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT
    COALESCE((SELECT p.mfa_required FROM public.profiles p WHERE p.id = auth.uid()), false)
    OR private.has_platform_role('owner')
    OR private.has_platform_role('platform_admin');
$$;

REVOKE ALL ON FUNCTION public.session_requires_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.session_requires_mfa() TO authenticated;

CREATE OR REPLACE FUNCTION private.prevent_privileged_mfa_clear()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NEW.mfa_required IS DISTINCT FROM OLD.mfa_required AND NEW.mfa_required = false THEN
    IF EXISTS (
      SELECT 1
      FROM public.role_grants rg
      JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
      JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
      WHERE rg.profile_id = NEW.id
        AND rg.status = 'active'
        AND (rg.ends_at IS NULL OR rg.ends_at > now())
        AND r.code IN ('owner', 'platform_admin')
    ) THEN
      RAISE EXCEPTION 'Cannot clear mfa_required for privileged role (owner/platform_admin)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_mfa_clear ON public.profiles;
CREATE TRIGGER profiles_prevent_privileged_mfa_clear
  BEFORE UPDATE OF mfa_required ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_privileged_mfa_clear();

UPDATE public.profiles p
SET mfa_required = true
WHERE EXISTS (
  SELECT 1
  FROM public.role_grants rg
  JOIN public.roles r ON r.id = rg.role_id AND r.code = 'owner'
  JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
  WHERE rg.profile_id = p.id AND rg.status = 'active'
)
AND p.mfa_required IS DISTINCT FROM true;
