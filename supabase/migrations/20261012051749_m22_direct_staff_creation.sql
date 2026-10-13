-- M22: Direct staff creation — employment status vs login activation
-- Create Staff saves the record immediately (no email). Login stays pending_setup
-- until Send Account Setup + password activation. Owner perms / MFA unchanged.

-- ---------------------------------------------------------------------------
-- 1. Employment status (directory) separate from account_status (login)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'inactive'));

-- Expand account_status for pending login setup (keep invited for back-compat)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('invited', 'pending_setup', 'active', 'suspended', 'offboarded'));

UPDATE public.profiles
SET account_status = 'pending_setup'
WHERE account_status = 'invited'
  AND account_kind = 'staff';

-- ---------------------------------------------------------------------------
-- 2. Permission predicates: grants unusable until login account_status = active
-- ---------------------------------------------------------------------------
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
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user: provisioned staff start as pending_setup (no login yet)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending boolean;
  v_provisioned boolean;
  v_full_name text;
  v_kind text;
  v_status text;
  v_employment text;
  v_phone text;
  v_created_by uuid;
  v_emp_status text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.invitations i
    WHERE lower(i.email::text) = lower(COALESCE(NEW.email, ''))
      AND i.status = 'pending'
      AND i.account_kind = 'staff'
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
  ) INTO v_pending;

  v_provisioned := COALESCE((NEW.raw_user_meta_data->>'staff_provisioned')::boolean, false)
    OR COALESCE(NEW.raw_app_meta_data->>'staff_provisioned', '') = 'true';

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    (SELECT i.full_name FROM public.invitations i
      WHERE lower(i.email::text) = lower(COALESCE(NEW.email, ''))
        AND i.status = 'pending'
      ORDER BY i.created_at DESC LIMIT 1),
    split_part(COALESCE(NEW.email, 'user'), '@', 1)
  );

  v_kind := COALESCE(NEW.raw_user_meta_data->>'account_kind', 'staff');
  IF v_kind NOT IN ('staff', 'client_user', 'system') THEN
    v_kind := 'staff';
  END IF;

  -- Direct create / invite → no login until activation. Bootstrap Owner stays active.
  v_status := CASE
    WHEN v_pending OR v_provisioned THEN 'pending_setup'
    ELSE 'active'
  END;

  v_employment := NEW.raw_user_meta_data->>'employment_type';
  IF v_employment IS NOT NULL AND v_employment NOT IN ('employee', 'contractor', 'freelancer') THEN
    v_employment := NULL;
  END IF;
  v_phone := NULLIF(NEW.raw_user_meta_data->>'phone', '');
  v_created_by := NULLIF(NEW.raw_user_meta_data->>'created_by', '')::uuid;
  v_emp_status := COALESCE(NULLIF(NEW.raw_user_meta_data->>'employment_status', ''), 'active');
  IF v_emp_status NOT IN ('active', 'inactive') THEN
    v_emp_status := 'active';
  END IF;

  INSERT INTO public.profiles (
    id, email, full_name, phone, account_kind, account_status,
    employment_type, employment_status, mfa_required, created_by
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.id::text || '@unknown.local'),
    v_full_name,
    v_phone,
    v_kind,
    v_status,
    v_employment,
    v_emp_status,
    false,
    v_created_by
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_pending THEN
    UPDATE public.invitations i
    SET auth_user_id = NEW.id
    WHERE lower(i.email::text) = lower(COALESCE(NEW.email, ''))
      AND i.status = 'pending'
      AND i.auth_user_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Self-escalation: also lock employment_status
-- ---------------------------------------------------------------------------
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
      THEN
        RAISE EXCEPTION 'Staff cannot change their own account, employment, or MFA fields';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Finalize staff profile after Auth create (called by Edge with caller JWT via RPC
--    or service role). Applies org fields + grants. Does NOT send email.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_staff_record(
  p_profile_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_dept uuid;
  v_title uuid;
  v_mfa boolean;
  v_employment text;
  v_emp_status text;
  v_phone text;
  v_full_name text;
BEGIN
  IF NOT (
    private.has_permission('org.staff.manage')
    OR private.has_permission('org.staff.invite')
    OR private.has_permission('platform.roles.manage')
  ) THEN
    RAISE EXCEPTION 'org.staff.manage or org.staff.invite required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id AND p.account_kind = 'staff'
  ) THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  v_dept := NULLIF(p_payload->>'department_id', '')::uuid;
  v_title := NULLIF(p_payload->>'job_title_id', '')::uuid;
  v_mfa := COALESCE((p_payload->>'mfa_required')::boolean, true);
  v_employment := NULLIF(p_payload->>'employment_type', '');
  v_emp_status := COALESCE(NULLIF(p_payload->>'employment_status', ''), 'active');
  v_phone := NULLIF(p_payload->>'phone', '');
  v_full_name := NULLIF(p_payload->>'full_name', '');

  IF v_employment IS NOT NULL AND v_employment NOT IN ('employee', 'contractor', 'freelancer') THEN
    RAISE EXCEPTION 'Invalid employment_type';
  END IF;
  IF v_emp_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid employment_status';
  END IF;

  -- Grants may be stored now; they remain unusable until account_status = active
  IF p_payload ? 'grants' AND jsonb_array_length(COALESCE(p_payload->'grants', '[]'::jsonb)) > 0 THEN
    IF NOT private.has_permission('platform.roles.manage') THEN
      RAISE EXCEPTION 'platform.roles.manage required to attach grants';
    END IF;
    PERFORM private.apply_invitation_grants(p_profile_id, p_payload, auth.uid());
  END IF;

  UPDATE public.profiles p
  SET
    full_name = COALESCE(v_full_name, p.full_name),
    phone = COALESCE(v_phone, p.phone),
    employment_type = COALESCE(v_employment, p.employment_type),
    employment_status = v_emp_status,
    account_status = CASE
      WHEN p.account_status IN ('active', 'suspended', 'offboarded') THEN p.account_status
      ELSE 'pending_setup'
    END,
    mfa_required = v_mfa,
    created_by = COALESCE(p.created_by, auth.uid()),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE p.id = p_profile_id;

  IF (v_dept IS NOT NULL OR v_title IS NOT NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.staff_memberships sm
       WHERE sm.profile_id = p_profile_id AND sm.status = 'active' AND sm.is_primary
     )
  THEN
    INSERT INTO public.staff_memberships (
      profile_id, department_id, job_title_id, is_primary, started_at, status
    )
    VALUES (p_profile_id, v_dept, v_title, true, CURRENT_DATE, 'active');
  END IF;

  INSERT INTO public.account_status_events (profile_id, from_status, to_status, reason, changed_by)
  VALUES (
    p_profile_id,
    'pending_setup',
    'pending_setup',
    'Staff record created (login not activated)',
    auth.uid()
  );

  RETURN jsonb_build_object(
    'ok', true,
    'profile_id', p_profile_id,
    'account_status', 'pending_setup',
    'employment_status', v_emp_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_staff_record(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_staff_record(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Accept / activate login (invitation optional — direct-create path supported)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_staff_invitation()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_inv public.invitations%ROWTYPE;
  v_payload jsonb;
  v_status text;
  v_mfa boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.email::text, p.account_status INTO v_email, v_status
  FROM public.profiles p WHERE p.id = v_uid;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_status = 'active' THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_active');
  END IF;

  IF v_status NOT IN ('pending_setup', 'invited') THEN
    RAISE EXCEPTION 'Account cannot be activated from status %', v_status;
  END IF;

  SELECT i.* INTO v_inv
  FROM public.invitations i
  WHERE lower(i.email::text) = lower(v_email)
    AND i.account_kind = 'staff'
    AND i.status = 'pending'
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
  ORDER BY i.created_at DESC
  LIMIT 1;

  IF v_inv.id IS NOT NULL AND v_inv.send_status = 'failed' THEN
    RAISE EXCEPTION 'Account setup send failed; ask an admin to resend setup.';
  END IF;

  -- Optional: apply any grants still only on the invitation payload (idempotent)
  IF v_inv.id IS NOT NULL THEN
    v_payload := COALESCE(v_inv.invite_payload, '{}'::jsonb);
    PERFORM private.apply_invitation_grants(v_uid, v_payload, v_inv.invited_by);

    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), auth_user_id = v_uid
    WHERE id = v_inv.id;
  END IF;

  SELECT COALESCE(p.mfa_required, true) INTO v_mfa FROM public.profiles p WHERE p.id = v_uid;

  UPDATE public.profiles p
  SET
    account_status = 'active',
    mfa_required = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.role_grants rg
        JOIN public.roles r ON r.id = rg.role_id AND r.code IN ('owner', 'platform_admin')
        JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
        WHERE rg.profile_id = v_uid AND rg.status = 'active'
      ) THEN true
      ELSE v_mfa
    END,
    updated_at = now()
  WHERE p.id = v_uid;

  INSERT INTO public.account_status_events (profile_id, from_status, to_status, reason, changed_by)
  VALUES (v_uid, v_status, 'active', 'Staff login activated', v_uid);

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'active',
    'invitation_id', v_inv.id,
    'mfa_required', (SELECT p.mfa_required FROM public.profiles p WHERE p.id = v_uid)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Employment status update (directory Active/Inactive) — not login
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_staff_employment_status(
  p_profile_id uuid,
  p_employment_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NOT (
    private.has_permission('org.staff.manage')
    OR private.has_permission('platform.roles.manage')
  ) THEN
    RAISE EXCEPTION 'org.staff.manage required';
  END IF;

  IF p_employment_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Invalid employment_status';
  END IF;

  IF p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own employment status via this RPC';
  END IF;

  UPDATE public.profiles
  SET employment_status = p_employment_status, updated_at = now(), updated_by = auth.uid()
  WHERE id = p_profile_id AND account_kind = 'staff';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'employment_status', p_employment_status);
END;
$$;

REVOKE ALL ON FUNCTION public.set_staff_employment_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_employment_status(uuid, text) TO authenticated;

-- set_staff_account_status: recognise pending_setup
CREATE OR REPLACE FUNCTION public.set_staff_account_status(
  p_profile_id uuid,
  p_status text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_from text;
  v_is_owner boolean;
BEGIN
  IF NOT (
    private.has_permission('org.staff.manage')
    OR private.has_permission('platform.roles.manage')
  ) THEN
    RAISE EXCEPTION 'org.staff.manage required';
  END IF;

  IF p_status NOT IN ('active', 'suspended', 'offboarded', 'invited', 'pending_setup') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  IF p_profile_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change your own account status via this RPC';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.code = 'owner'
    JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
    WHERE rg.profile_id = p_profile_id AND rg.status = 'active'
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RAISE EXCEPTION 'Cannot suspend or offboard the Owner account';
  END IF;

  SELECT account_status INTO v_from FROM public.profiles WHERE id = p_profile_id AND account_kind = 'staff';
  IF v_from IS NULL THEN
    RAISE EXCEPTION 'Staff profile not found';
  END IF;

  UPDATE public.profiles
  SET
    account_status = p_status,
    offboarded_at = CASE WHEN p_status = 'offboarded' THEN now() ELSE offboarded_at END,
    updated_at = now(),
    updated_by = auth.uid()
  WHERE id = p_profile_id;

  IF p_status IN ('suspended', 'offboarded') THEN
    UPDATE public.role_grants
    SET status = 'revoked', updated_at = now()
    WHERE profile_id = p_profile_id AND status = 'active';

    UPDATE public.staff_memberships
    SET status = 'ended', ended_at = CURRENT_DATE, updated_at = now()
    WHERE profile_id = p_profile_id AND status = 'active';
  END IF;

  INSERT INTO public.account_status_events (profile_id, from_status, to_status, reason, changed_by)
  VALUES (p_profile_id, v_from, p_status, p_reason, auth.uid());

  RETURN jsonb_build_object('ok', true, 'from', v_from, 'to', p_status);
END;
$$;
