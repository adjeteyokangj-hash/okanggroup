-- M23: Temporary password + forced first-login change
-- Passwords remain only in Supabase Auth. profiles.must_change_password gates API access.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'When true, staff may authenticate but has_permission* returns false until forced password change clears the flag (mirrored in Auth app_metadata).';

-- Block self-clear of must_change_password
CREATE OR REPLACE FUNCTION private.prevent_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NEW.id = auth.uid() THEN
    IF NOT (
      private.has_permission('org.staff.manage')
      OR private.has_permission('platform.roles.manage')
    ) THEN
      IF NEW.account_status IS DISTINCT FROM OLD.account_status
         OR NEW.account_kind IS DISTINCT FROM OLD.account_kind
         OR NEW.mfa_required IS DISTINCT FROM OLD.mfa_required
         OR NEW.employment_type IS DISTINCT FROM OLD.employment_type
         OR NEW.employment_status IS DISTINCT FROM OLD.employment_status
         OR NEW.offboarded_at IS DISTINCT FROM OLD.offboarded_at
         OR NEW.must_change_password IS DISTINCT FROM OLD.must_change_password
      THEN
        RAISE EXCEPTION 'Staff cannot change their own account, employment, MFA, or password-change flags';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Permissions unusable while must_change_password
CREATE OR REPLACE FUNCTION private.has_permission(code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id AND p.code = has_permission.code
    JOIN public.access_scopes s ON s.id = rg.access_scope_id
    JOIN public.profiles pr ON pr.id = rg.profile_id
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND s.scope_type = 'platform'
      AND pr.account_status = 'active'
      AND pr.must_change_password = false
  )
  OR EXISTS (
    SELECT 1
    FROM public.temporary_access ta
    JOIN public.permissions p ON p.id = ta.permission_id AND p.code = has_permission.code
    JOIN public.profiles pr ON pr.id = ta.profile_id
    WHERE ta.profile_id = auth.uid()
      AND ta.revoked_at IS NULL
      AND ta.starts_at <= now()
      AND ta.ends_at > now()
      AND pr.account_status = 'active'
      AND pr.must_change_password = false
  );
$$;

CREATE OR REPLACE FUNCTION private.has_permission_on_client(code text, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT private.has_permission(code)
  OR EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id AND p.code = has_permission_on_client.code
    JOIN public.access_scopes s ON s.id = rg.access_scope_id
    JOIN public.profiles pr ON pr.id = rg.profile_id
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND pr.account_status = 'active'
      AND pr.must_change_password = false
      AND (
        s.scope_type = 'platform'
        OR (s.scope_type = 'client' AND s.client_id = p_client_id)
        OR (s.scope_type IN ('project', 'cms_instance') AND s.client_id = p_client_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.has_platform_role(role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.code = role_code AND r.status = 'active'
    JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
    JOIN public.profiles pr ON pr.id = rg.profile_id
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND pr.account_status = 'active'
      AND pr.must_change_password = false
  );
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
    JOIN public.profiles pr ON pr.id = rg.profile_id
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND pr.account_status = 'active'
      AND pr.must_change_password = false
    UNION
    SELECT p.code
    FROM public.temporary_access ta
    JOIN public.permissions p ON p.id = ta.permission_id
    JOIN public.profiles pr ON pr.id = ta.profile_id
    WHERE ta.profile_id = auth.uid()
      AND ta.revoked_at IS NULL
      AND ta.starts_at <= now()
      AND ta.ends_at > now()
      AND pr.account_status = 'active'
      AND pr.must_change_password = false
  ) codes;
$$;

-- Mark profile after Edge issues temp password (caller JWT; Edge also updates Auth)
CREATE OR REPLACE FUNCTION public.mark_staff_temp_password_issued(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_status text;
  v_is_owner boolean;
BEGIN
  IF NOT (
    private.has_permission('org.staff.invite')
    OR private.has_permission('org.staff.manage')
    OR private.has_permission('platform.roles.manage')
  ) THEN
    RAISE EXCEPTION 'org.staff.invite required';
  END IF;

  IF p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot issue temporary password for your own account via this RPC';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.code = 'owner'
    JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
    WHERE rg.profile_id = p_profile_id AND rg.status = 'active'
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RAISE EXCEPTION 'Cannot issue temporary password for the Owner account';
  END IF;

  SELECT account_status INTO v_status
  FROM public.profiles
  WHERE id = p_profile_id AND account_kind = 'staff';

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  IF v_status IN ('suspended', 'offboarded') THEN
    RAISE EXCEPTION 'Cannot issue temporary password for % accounts', v_status;
  END IF;

  UPDATE public.profiles
  SET
    account_status = 'active',
    must_change_password = true,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = p_profile_id;

  INSERT INTO public.account_status_events (profile_id, from_status, to_status, reason, changed_by)
  VALUES (
    p_profile_id,
    v_status,
    'active',
    'Temporary password issued — must change on first login',
    auth.uid()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'profile_id', p_profile_id,
    'account_status', 'active',
    'must_change_password', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_staff_temp_password_issued(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_staff_temp_password_issued(uuid) TO authenticated;

-- Note: profiles.must_change_password is cleared only by Edge Function (service role)
-- after admin.updateUserById sets the new password + app_metadata.must_change_password=false.
-- Staff cannot clear the flag themselves (self-escalation trigger + no public clear RPC).
