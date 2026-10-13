-- Regression: staff records with Setup pending must remain readable by service_role
-- and retain Auth linkage (no delete/recreate). Run after M24.

DO $$
DECLARE
  v_id uuid;
  v_email text;
  v_status text;
  v_grants int;
BEGIN
  IF NOT has_table_privilege('service_role', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL: service_role lacks SELECT on profiles';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.invitations', 'INSERT') THEN
    RAISE EXCEPTION 'FAIL: service_role lacks INSERT on invitations';
  END IF;

  SELECT p.id, p.email::text, p.account_status
  INTO v_id, v_email, v_status
  FROM public.profiles p
  WHERE p.full_name = 'Daniel Mensah'
    AND p.account_kind = 'staff'
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'FAIL: Daniel Mensah staff profile missing (do not recreate in this test)';
  END IF;

  IF v_status NOT IN ('pending_setup', 'invited', 'active') THEN
    RAISE EXCEPTION 'FAIL: unexpected account_status %', v_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_id) THEN
    RAISE EXCEPTION 'FAIL: Auth user missing for profile %', v_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_id AND lower(u.email) = lower(v_email)
  ) THEN
    RAISE EXCEPTION 'FAIL: Auth email does not match profile email';
  END IF;

  SELECT count(*)::int INTO v_grants
  FROM public.role_grants rg
  WHERE rg.profile_id = v_id AND rg.status = 'active';

  IF v_grants < 1 THEN
    RAISE EXCEPTION 'FAIL: Daniel active grants changed unexpectedly (count=%)', v_grants;
  END IF;

  RAISE NOTICE 'PASS: pending_setup staff % (%) grants=% service_role SELECT ok', v_id, v_status, v_grants;
END;
$$;

-- Owner security unchanged
DO $$
DECLARE
  v_perms int;
  v_mfa boolean;
BEGIN
  SELECT count(*)::int INTO v_perms
  FROM public.role_permissions rp
  JOIN public.roles r ON r.id = rp.role_id
  WHERE r.code = 'owner';

  SELECT mfa_required INTO v_mfa
  FROM public.profiles
  WHERE email = 'okanggroup@gmail.com';

  IF v_perms <> 21 THEN
    RAISE EXCEPTION 'FAIL: Owner permission count=% expected 21', v_perms;
  END IF;
  IF v_mfa IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'FAIL: Owner MFA required flag changed';
  END IF;

  RAISE NOTICE 'PASS: Owner 21 permissions + MFA required';
END;
$$;
