-- M16: Post-R1 security hardening (safeguards)
-- Fix mutable search_path; revoke RPC exposure on trigger helpers;
-- strip default table privileges that bypass RLS (TRUNCATE).

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'rls_auto_enable'
  ) THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon, authenticated';
  END IF;
END;
$$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT quote_ident(n.nspname) AS nsp, quote_ident(c.relname) AS rel
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE %s.%s FROM PUBLIC', r.nsp, r.rel);
    EXECUTE format('REVOKE ALL ON TABLE %s.%s FROM anon', r.nsp, r.rel);
    EXECUTE format(
      'REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE %s.%s FROM authenticated',
      r.nsp, r.rel
    );
  END LOOP;
END;
$$;

-- Re-assert intentional grants after privilege strip
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.invitations, public.account_status_events TO authenticated;
GRANT SELECT ON public.permissions, public.roles, public.role_permissions, public.access_scopes TO authenticated;
GRANT SELECT ON public.role_grants, public.temporary_access TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments, public.teams, public.job_titles, public.staff_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients, public.client_contacts, public.client_memberships, public.client_services TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_pages, public.cms_sections, public.cms_revisions,
  public.cms_navigation, public.cms_seo, public.cms_media_assets, public.cms_publish_events TO authenticated;
GRANT SELECT ON public.contact_enquiries TO authenticated;
GRANT INSERT ON public.contact_enquiries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks, public.task_assignments,
  public.task_dependencies, public.approvals TO authenticated;
GRANT SELECT ON public.audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.security_incidents TO authenticated;
GRANT SELECT ON public.lookup_values, public.workflow_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.settings TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
