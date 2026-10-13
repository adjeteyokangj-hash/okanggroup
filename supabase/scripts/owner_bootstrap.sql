-- =============================================================================
-- Owner bootstrap — OkangGroup Release 1
-- =============================================================================
-- TARGET PROJECT ONLY: prbgsnxpwyepdggdysnt (okanggroup-platform)
-- Run via: Supabase Dashboard SQL editor for that project, OR workspace MCP
--           execute_sql against project-0-OKANGGROUP-supabase.
-- Do NOT run against PJ Marketplace, StarLiz, or any other project.
--
-- Prerequisites:
--   1. Create ONE Auth user in prbgsnxpwyepdggdysnt (email/password).
--   2. Confirm a single public.profiles row exists for that email
--      (created by handle_new_user trigger).
--   3. Replace OWNER_EMAIL_HERE below with that exact Auth email.
--
-- Safety properties:
--   - Refuses to run if placeholder email not replaced
--   - Refuses if 0 or >1 matching profiles (no ambiguous grants)
--   - Grants only role code = 'owner' on scope_type = 'platform'
--   - Idempotent: will not duplicate an active owner grant
--   - Contains no passwords, tokens, or service-role credentials
-- =============================================================================

DO $$
DECLARE
  v_email text := lower(trim('OWNER_EMAIL_HERE'));
  v_profile_id uuid;
  v_role_id uuid;
  v_scope_id uuid;
  v_profile_count int;
  v_scope_count int;
  v_inserted int := 0;
BEGIN
  IF v_email IS NULL
     OR v_email = ''
     OR v_email = 'owner_email_here'
     OR position('owner_email_here' in v_email) > 0 THEN
    RAISE EXCEPTION
      'Abort: replace OWNER_EMAIL_HERE with the intended Owner Auth email before execution.';
  END IF;

  SELECT count(*) INTO v_profile_count
  FROM public.profiles
  WHERE email = v_email;

  IF v_profile_count = 0 THEN
    RAISE EXCEPTION
      'Abort: no profile for %. Create the Auth user in project prbgsnxpwyepdggdysnt first.',
      v_email;
  END IF;

  IF v_profile_count > 1 THEN
    RAISE EXCEPTION
      'Abort: % profiles match %. Refusing ambiguous Owner grant.',
      v_profile_count, v_email;
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE email = v_email;

  SELECT id INTO v_role_id
  FROM public.roles
  WHERE code = 'owner' AND status = 'active';

  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Abort: active roles.code = owner not found. Check M2 seeds.';
  END IF;

  SELECT count(*) INTO v_scope_count
  FROM public.access_scopes
  WHERE scope_type = 'platform';

  IF v_scope_count <> 1 THEN
    RAISE EXCEPTION
      'Abort: expected exactly 1 platform access_scope, found %.',
      v_scope_count;
  END IF;

  SELECT id INTO v_scope_id
  FROM public.access_scopes
  WHERE scope_type = 'platform';

  UPDATE public.profiles
  SET account_kind = 'staff',
      account_status = 'active',
      mfa_required = true,
      full_name = COALESCE(NULLIF(full_name, ''), 'Owner'),
      updated_at = now()
  WHERE id = v_profile_id;

  INSERT INTO public.role_grants (profile_id, role_id, access_scope_id, status)
  SELECT v_profile_id, v_role_id, v_scope_id, 'active'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.role_grants rg
    WHERE rg.profile_id = v_profile_id
      AND rg.role_id = v_role_id
      AND rg.access_scope_id = v_scope_id
      AND rg.status = 'active'
  );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RAISE NOTICE
    'Owner bootstrap OK for % (profile %, grant_inserted=%). Complete MFA in admin next.',
    v_email, v_profile_id, v_inserted;
END;
$$;
