-- M20: Auto reference codes + staff invitation insert policy

CREATE SEQUENCE IF NOT EXISTS public.client_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.project_code_seq START 1;

CREATE OR REPLACE FUNCTION public.next_client_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'OKG-CL-' || lpad(nextval('public.client_code_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.next_project_code()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'OKG-PR-' || lpad(nextval('public.project_code_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION private.assign_client_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NEW.client_code IS NULL OR btrim(NEW.client_code) = '' OR NEW.client_code = 'AUTO' THEN
    NEW.client_code := public.next_client_code();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.assign_project_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NEW.code IS NULL OR btrim(NEW.code) = '' OR NEW.code = 'AUTO' THEN
    NEW.code := public.next_project_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_assign_code ON public.clients;
CREATE TRIGGER clients_assign_code
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION private.assign_client_code();

DROP TRIGGER IF EXISTS projects_assign_code ON public.projects;
CREATE TRIGGER projects_assign_code
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.assign_project_code();

CREATE OR REPLACE FUNCTION private.freeze_reference_codes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'clients' AND NEW.client_code IS DISTINCT FROM OLD.client_code THEN
    RAISE EXCEPTION 'client_code is permanent and cannot be changed';
  END IF;
  IF TG_TABLE_NAME = 'projects' AND NEW.code IS DISTINCT FROM OLD.code THEN
    RAISE EXCEPTION 'project code is permanent and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_freeze_code ON public.clients;
CREATE TRIGGER clients_freeze_code
  BEFORE UPDATE OF client_code ON public.clients
  FOR EACH ROW EXECUTE FUNCTION private.freeze_reference_codes();

DROP TRIGGER IF EXISTS projects_freeze_code ON public.projects;
CREATE TRIGGER projects_freeze_code
  BEFORE UPDATE OF code ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.freeze_reference_codes();

ALTER TABLE public.clients ALTER COLUMN client_code SET DEFAULT 'AUTO';
ALTER TABLE public.projects ALTER COLUMN code SET DEFAULT 'AUTO';

GRANT USAGE, SELECT ON SEQUENCE public.client_code_seq TO authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE public.project_code_seq TO authenticated, service_role;

CREATE POLICY invitations_insert_staff ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_permission('org.staff.invite')
    AND invited_by = auth.uid()
    AND account_kind = 'staff'
    AND client_id IS NULL
  );

CREATE POLICY invitations_update_staff ON public.invitations
  FOR UPDATE TO authenticated
  USING (private.has_permission('org.staff.invite') OR private.has_permission('org.staff.manage'))
  WITH CHECK (private.has_permission('org.staff.invite') OR private.has_permission('org.staff.manage'));

GRANT INSERT, UPDATE ON public.invitations TO authenticated;
