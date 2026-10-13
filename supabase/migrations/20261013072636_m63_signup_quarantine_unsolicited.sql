-- M63: Quarantine unsolicited Auth sign-ups — release security remediation.
-- Does not change Supabase Auth dashboard "Allow new users to sign up".
-- Legitimate invite-staff / create-client-portal-user use app_metadata (service role)
-- and/or pending invitations — those paths stay pending_setup or client_user.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pending boolean;
  v_app_provisioned boolean;
  v_app_kind text;
  v_authorized boolean;
  v_full_name text;
  v_kind text;
  v_status text;
  v_employment text;
  v_phone text;
  v_created_by uuid;
  v_emp_status text;
BEGIN
  -- Pending invitation (staff or client) = authorised onboarding
  SELECT EXISTS (
    SELECT 1
    FROM public.invitations i
    WHERE lower(i.email::text) = lower(COALESCE(NEW.email, ''))
      AND i.status = 'pending'
      AND i.account_kind IN ('staff', 'client_user')
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
  ) INTO v_pending;

  -- Trust app_metadata only for provisioning flags (user_metadata is client-spoofable)
  v_app_provisioned := COALESCE(NEW.raw_app_meta_data->>'staff_provisioned', '') = 'true';
  v_app_kind := NULLIF(btrim(COALESCE(NEW.raw_app_meta_data->>'account_kind', '')), '');

  v_authorized := v_pending
    OR v_app_provisioned
    OR v_app_kind IN ('staff', 'client_user', 'system');

  v_full_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    (SELECT i.full_name FROM public.invitations i
      WHERE lower(i.email::text) = lower(COALESCE(NEW.email, ''))
        AND i.status = 'pending'
      ORDER BY i.created_at DESC LIMIT 1),
    split_part(COALESCE(NEW.email, 'user'), '@', 1)
  );

  IF NOT v_authorized THEN
    -- Unsolicited public registration: Auth user may exist, but Operations identity is quarantined.
    v_kind := 'staff';
    v_status := 'suspended';
    v_employment := NULL;
    v_phone := NULL;
    v_created_by := NULL;
    v_emp_status := 'inactive';

    INSERT INTO public.profiles (
      id, email, full_name, phone, account_kind, account_status,
      employment_type, employment_status, mfa_required, created_by
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.email, NEW.id::text || '@unknown.local'),
      v_full_name,
      NULL,
      v_kind,
      v_status,
      NULL,
      v_emp_status,
      false,
      NULL
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
  END IF;

  -- Authorised path: invitation and/or service-role app_metadata
  v_kind := COALESCE(v_app_kind, NEW.raw_user_meta_data->>'account_kind', 'staff');
  IF v_kind NOT IN ('staff', 'client_user', 'system') THEN
    v_kind := 'staff';
  END IF;

  v_status := CASE
    WHEN v_pending OR v_app_provisioned THEN 'pending_setup'
    WHEN v_app_kind = 'client_user' THEN 'active'
    ELSE 'pending_setup'
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

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

COMMENT ON FUNCTION public.handle_new_user() IS
  'M63: Unsolicited sign-ups → profiles.account_status=suspended (no grants). '
  'Authorised: pending invitation or app_metadata staff_provisioned/account_kind (service role).';
