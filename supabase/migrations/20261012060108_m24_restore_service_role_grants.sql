-- M24: Restore service_role table grants stripped by M16.
-- M16 REVOKE ALL ... FROM PUBLIC removed privileges that service_role relied on.
-- Edge Functions (invite-staff) use the service role Data API for profiles /
-- invitations / role_grants / account_status_events. Without SELECT/DML they
-- return empty rows and the UI shows a misleading "Staff profile not found"
-- even when the staff row and Auth user exist (e.g. Daniel Mensah pending_setup).

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;

-- Regression assertions (fail migration if grants did not stick)
DO $$
BEGIN
  IF NOT has_table_privilege('service_role', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION 'M24 failed: service_role still lacks SELECT on profiles';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.invitations', 'INSERT') THEN
    RAISE EXCEPTION 'M24 failed: service_role still lacks INSERT on invitations';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.role_grants', 'SELECT') THEN
    RAISE EXCEPTION 'M24 failed: service_role still lacks SELECT on role_grants';
  END IF;
  IF NOT has_table_privilege('service_role', 'public.account_status_events', 'INSERT') THEN
    RAISE EXCEPTION 'M24 failed: service_role still lacks INSERT on account_status_events';
  END IF;
END;
$$;
