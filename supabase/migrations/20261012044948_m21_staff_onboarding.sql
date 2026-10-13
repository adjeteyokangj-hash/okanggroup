-- M21: Staff onboarding — employment type, invite payload, accept/offboard RPCs,
-- scoped permission codes for UI, self-escalation guards.
-- Does NOT modify Owner role_permissions (remains 21). Privileged MFA (M19) unchanged.

-- ---------------------------------------------------------------------------
-- 1. Profiles: employment type
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employment_type text
  CHECK (employment_type IS NULL OR employment_type IN ('employee', 'contractor', 'freelancer'));

-- ---------------------------------------------------------------------------
-- 2. Invitations: intended access payload (never trust Auth user_metadata for grants)
-- ---------------------------------------------------------------------------
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS invite_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS send_status text NOT NULL DEFAULT 'not_sent'
    CHECK (send_status IN ('not_sent', 'sent', 'failed', 'draft'));

COMMENT ON COLUMN public.invitations.invite_payload IS
  'Intended grants/org fields applied only by accept_staff_invitation. Shape: {employment_type, phone, department_id, job_title_id, mfa_required, grants:[{role_code, scope_type, client_id?, project_id?}]}';

-- Staff managers can list all staff invitations
DROP POLICY IF EXISTS invitations_select_own_or_staff_pending ON public.invitations;
CREATE POLICY invitations_select_own_or_staff_pending ON public.invitations
  FOR SELECT TO authenticated
  USING (
    invited_by = auth.uid()
    OR email = (SELECT p.email FROM public.profiles p WHERE p.id = auth.uid())
    OR private.has_permission('org.staff.read')
    OR private.has_permission('org.staff.manage')
    OR private.has_permission('org.staff.invite')
  );

-- ---------------------------------------------------------------------------
-- 3. Seed common job titles (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.job_titles (title, status)
VALUES
  ('Developer', 'active'),
  ('Designer', 'active'),
  ('Project Manager', 'active'),
  ('Operations Manager', 'active'),
  ('Content Editor', 'active'),
  ('Contractor', 'active'),
  ('Freelancer', 'active')
ON CONFLICT (title) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. New auth users from invites start as invited with NO grants
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending boolean;
  v_full_name text;
  v_kind text;
  v_status text;
  v_employment text;
  v_phone text;
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

  -- Invited staff stay non-active until accept_staff_invitation applies grants.
  -- Bootstrap / manual creates without a pending invite remain active (Owner path).
  v_status := CASE WHEN v_pending THEN 'invited' ELSE 'active' END;

  v_employment := NEW.raw_user_meta_data->>'employment_type';
  IF v_employment IS NOT NULL AND v_employment NOT IN ('employee', 'contractor', 'freelancer') THEN
    v_employment := NULL;
  END IF;
  v_phone := NULLIF(NEW.raw_user_meta_data->>'phone', '');

  INSERT INTO public.profiles (
    id, email, full_name, phone, account_kind, account_status, employment_type, mfa_required
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.email, NEW.id::text || '@unknown.local'),
    v_full_name,
    v_phone,
    v_kind,
    v_status,
    v_employment,
    false
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
-- 5. Block self-escalation on profiles (status / kind / MFA / employment)
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
         OR NEW.offboarded_at IS DISTINCT FROM OLD.offboarded_at
      THEN
        RAISE EXCEPTION 'Staff cannot change their own account status, kind, MFA, or employment type';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_self_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_self_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_profile_self_escalation();

-- ---------------------------------------------------------------------------
-- 6. role_grants: no self-grants (except Owner adjusting own grants); no owner role except by Owner
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS role_grants_manage ON public.role_grants;
CREATE POLICY role_grants_manage ON public.role_grants
  FOR ALL TO authenticated
  USING (private.has_permission('platform.roles.manage'))
  WITH CHECK (
    private.has_permission('platform.roles.manage')
    AND (
      profile_id IS DISTINCT FROM auth.uid()
      OR private.has_platform_role('owner')
    )
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.roles r
        WHERE r.id = role_id AND r.code = 'owner'
      )
      OR private.has_platform_role('owner')
    )
  );

-- ---------------------------------------------------------------------------
-- 7. Access scope helpers (SECURITY DEFINER — no direct INSERT policy on access_scopes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.ensure_access_scope(
  p_scope_type text,
  p_client_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_scope_type = 'platform' THEN
    RETURN '00000000-0000-4000-8000-000000000001'::uuid;
  END IF;

  IF p_scope_type = 'client' THEN
    IF p_client_id IS NULL THEN
      RAISE EXCEPTION 'client_id required for client scope';
    END IF;
    SELECT s.id INTO v_id
    FROM public.access_scopes s
    WHERE s.scope_type = 'client' AND s.client_id = p_client_id
    LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO public.access_scopes (scope_type, client_id)
      VALUES ('client', p_client_id)
      RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
  END IF;

  IF p_scope_type = 'project' THEN
    IF p_client_id IS NULL OR p_project_id IS NULL THEN
      RAISE EXCEPTION 'client_id and project_id required for project scope';
    END IF;
    SELECT s.id INTO v_id
    FROM public.access_scopes s
    WHERE s.scope_type = 'project'
      AND s.client_id = p_client_id
      AND s.project_id = p_project_id
    LIMIT 1;
    IF v_id IS NULL THEN
      INSERT INTO public.access_scopes (scope_type, client_id, project_id)
      VALUES ('project', p_client_id, p_project_id)
      RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
  END IF;

  RAISE EXCEPTION 'Unsupported scope_type %', p_scope_type;
END;
$$;

REVOKE ALL ON FUNCTION private.ensure_access_scope(text, uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ensure_access_scope(
  p_scope_type text,
  p_client_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NOT private.has_permission('platform.roles.manage') THEN
    RAISE EXCEPTION 'platform.roles.manage required';
  END IF;
  RETURN private.ensure_access_scope(p_scope_type, p_client_id, p_project_id);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_access_scope(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_access_scope(text, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Apply invite grants (private) — only from invitation row, never user_metadata
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.apply_invitation_grants(
  p_profile_id uuid,
  p_payload jsonb,
  p_granted_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  g jsonb;
  v_role_id uuid;
  v_role_code text;
  v_scope_type text;
  v_scope_id uuid;
  v_client_id uuid;
  v_project_id uuid;
BEGIN
  FOR g IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'grants', '[]'::jsonb))
  LOOP
    v_role_code := g->>'role_code';
    v_scope_type := COALESCE(g->>'scope_type', 'platform');
    v_client_id := NULLIF(g->>'client_id', '')::uuid;
    v_project_id := NULLIF(g->>'project_id', '')::uuid;

    IF v_role_code IS NULL THEN
      CONTINUE;
    END IF;

    -- Never auto-grant owner from invitations
    IF v_role_code = 'owner' THEN
      RAISE EXCEPTION 'Invitations cannot grant the owner role';
    END IF;

    SELECT r.id INTO v_role_id FROM public.roles r WHERE r.code = v_role_code AND r.status = 'active';
    IF v_role_id IS NULL THEN
      RAISE EXCEPTION 'Unknown role_code %', v_role_code;
    END IF;

    v_scope_id := private.ensure_access_scope(v_scope_type, v_client_id, v_project_id);

    IF NOT EXISTS (
      SELECT 1 FROM public.role_grants rg
      WHERE rg.profile_id = p_profile_id
        AND rg.role_id = v_role_id
        AND rg.access_scope_id = v_scope_id
        AND rg.status = 'active'
    ) THEN
      INSERT INTO public.role_grants (profile_id, role_id, access_scope_id, granted_by, status)
      VALUES (p_profile_id, v_role_id, v_scope_id, p_granted_by, 'active');
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_invitation_grants(uuid, jsonb, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 9. Accept invitation — activates account + applies intended grants + membership
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
  v_dept uuid;
  v_title uuid;
  v_mfa boolean;
  v_employment text;
  v_phone text;
  v_full_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT p.email::text INTO v_email FROM public.profiles p WHERE p.id = v_uid;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
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

  IF v_inv.id IS NULL THEN
    -- Already accepted / no invite: allow active staff with grants to continue
    IF EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid AND p.account_status = 'active'
    ) THEN
      RETURN jsonb_build_object('ok', true, 'status', 'already_active');
    END IF;
    RAISE EXCEPTION 'No pending staff invitation for this account';
  END IF;

  -- Failed / incomplete sends must not activate with grants
  IF v_inv.send_status = 'failed' THEN
    RAISE EXCEPTION 'Invitation send failed; access cannot be activated. Ask an admin to resend.';
  END IF;

  v_payload := COALESCE(v_inv.invite_payload, '{}'::jsonb);
  v_dept := NULLIF(v_payload->>'department_id', '')::uuid;
  v_title := NULLIF(v_payload->>'job_title_id', '')::uuid;
  v_mfa := COALESCE((v_payload->>'mfa_required')::boolean, true);
  v_employment := NULLIF(v_payload->>'employment_type', '');
  v_phone := NULLIF(v_payload->>'phone', '');
  v_full_name := COALESCE(NULLIF(v_inv.full_name, ''), NULLIF(v_payload->>'full_name', ''));

  IF v_employment IS NOT NULL AND v_employment NOT IN ('employee', 'contractor', 'freelancer') THEN
    v_employment := NULL;
  END IF;

  -- Apply grants BEFORE activating (so activated empty grant sets are intentional)
  PERFORM private.apply_invitation_grants(v_uid, v_payload, v_inv.invited_by);

  UPDATE public.profiles p
  SET
    account_status = 'active',
    full_name = COALESCE(v_full_name, p.full_name),
    phone = COALESCE(v_phone, p.phone),
    employment_type = COALESCE(v_employment, p.employment_type),
    mfa_required = CASE
      WHEN private.has_platform_role('owner') OR EXISTS (
        SELECT 1 FROM public.role_grants rg
        JOIN public.roles r ON r.id = rg.role_id AND r.code IN ('owner', 'platform_admin')
        JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
        WHERE rg.profile_id = v_uid AND rg.status = 'active'
      ) THEN true
      ELSE v_mfa
    END,
    updated_at = now()
  WHERE p.id = v_uid;

  IF (v_dept IS NOT NULL OR v_title IS NOT NULL)
     AND NOT EXISTS (
       SELECT 1 FROM public.staff_memberships sm
       WHERE sm.profile_id = v_uid AND sm.status = 'active' AND sm.is_primary
     )
  THEN
    INSERT INTO public.staff_memberships (
      profile_id, department_id, job_title_id, is_primary, started_at, status
    )
    VALUES (v_uid, v_dept, v_title, true, CURRENT_DATE, 'active');
  END IF;

  UPDATE public.invitations
  SET
    status = 'accepted',
    accepted_at = now(),
    auth_user_id = v_uid,
    role_ids = COALESCE(
      (
        SELECT array_agg(DISTINCT r.id)
        FROM jsonb_array_elements(COALESCE(v_payload->'grants', '[]'::jsonb)) g
        JOIN public.roles r ON r.code = g->>'role_code'
      ),
      role_ids
    )
  WHERE id = v_inv.id;

  INSERT INTO public.account_status_events (profile_id, from_status, to_status, reason, changed_by)
  VALUES (v_uid, 'invited', 'active', 'Accepted staff invitation', v_uid);

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'active',
    'invitation_id', v_inv.id,
    'mfa_required', (SELECT p.mfa_required FROM public.profiles p WHERE p.id = v_uid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_staff_invitation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_staff_invitation() TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Suspend / offboard (revokes grants; keeps history). Auth ban via Edge Function.
-- ---------------------------------------------------------------------------
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

  IF p_status NOT IN ('active', 'suspended', 'offboarded', 'invited') THEN
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

REVOKE ALL ON FUNCTION public.set_staff_account_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_staff_account_status(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. my_permission_codes: include scoped grants so UI can gate menus;
--     data access remains enforced by has_permission_on_client / RLS.
-- ---------------------------------------------------------------------------
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
  ) codes;
$$;

-- ---------------------------------------------------------------------------
-- 12. Helper: revoke pending invitation (no grants ever applied)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revoke_staff_invitation(p_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NOT (
    private.has_permission('org.staff.invite')
    OR private.has_permission('org.staff.manage')
  ) THEN
    RAISE EXCEPTION 'org.staff.invite required';
  END IF;

  UPDATE public.invitations
  SET status = 'revoked', revoked_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE id = p_invitation_id
    AND status = 'pending'
    AND account_kind = 'staff';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pending invitation not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', p_invitation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_staff_invitation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_staff_invitation(uuid) TO authenticated;
