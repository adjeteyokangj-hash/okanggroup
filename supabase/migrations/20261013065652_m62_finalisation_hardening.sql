-- M62: Finalisation hardening — search_path on code generators; revoke UAT actor from authenticated.
-- Does not change product workflows. Production remains HOLD until Owner authorisation.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'next_client_code',
        'next_project_code',
        'next_enquiry_number',
        'next_quote_number',
        'next_contract_number',
        'next_invoice_number',
        'next_credit_number'
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = private, public, pg_temp', r.sig);
  END LOOP;
END;
$$;

ALTER FUNCTION private.freeze_reference_codes() SET search_path = private, public, pg_temp;
ALTER FUNCTION private.storage_task_id_from_path(text) SET search_path = private, public, pg_temp;
ALTER FUNCTION private.storage_client_id_from_path(text) SET search_path = private, public, pg_temp;
ALTER FUNCTION private.contract_can_edit(text) SET search_path = private, public, pg_temp;

REVOKE ALL ON FUNCTION public.uat_set_actor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.uat_set_actor(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.uat_set_actor(uuid) TO service_role;

REVOKE ALL ON FUNCTION private.uat_set_actor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.uat_set_actor(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.uat_set_actor(uuid) TO service_role;
