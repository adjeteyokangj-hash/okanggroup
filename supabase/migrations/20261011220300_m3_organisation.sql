-- M3: Organisation — departments, teams, job_titles, staff_memberships + RLS

CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  parent_department_id uuid REFERENCES public.departments (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'merged')),
  merged_into_id uuid REFERENCES public.departments (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments (id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, code)
);

CREATE TABLE public.job_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments (id),
  team_id uuid REFERENCES public.teams (id),
  job_title_id uuid REFERENCES public.job_titles (id),
  is_primary boolean NOT NULL DEFAULT false,
  reports_to_profile_id uuid REFERENCES public.profiles (id),
  started_at date,
  ended_at date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_memberships_team_dept_chk CHECK (
    team_id IS NULL OR department_id IS NOT NULL
  )
);

CREATE TRIGGER departments_set_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER teams_set_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER job_titles_set_updated_at BEFORE UPDATE ON public.job_titles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER staff_memberships_set_updated_at BEFORE UPDATE ON public.staff_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams FORCE ROW LEVEL SECURITY;
ALTER TABLE public.job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_titles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated
  USING (private.has_permission('org.departments.read') OR private.has_permission('org.departments.manage'));
CREATE POLICY departments_manage ON public.departments FOR ALL TO authenticated
  USING (private.has_permission('org.departments.manage'))
  WITH CHECK (private.has_permission('org.departments.manage'));

CREATE POLICY teams_select ON public.teams FOR SELECT TO authenticated
  USING (private.has_permission('org.departments.read') OR private.has_permission('org.departments.manage'));
CREATE POLICY teams_manage ON public.teams FOR ALL TO authenticated
  USING (private.has_permission('org.departments.manage'))
  WITH CHECK (private.has_permission('org.departments.manage'));

CREATE POLICY job_titles_select ON public.job_titles FOR SELECT TO authenticated
  USING (private.has_permission('org.staff.read') OR private.has_permission('org.staff.manage'));
CREATE POLICY job_titles_manage ON public.job_titles FOR ALL TO authenticated
  USING (private.has_permission('org.staff.manage'))
  WITH CHECK (private.has_permission('org.staff.manage'));

CREATE POLICY staff_memberships_select ON public.staff_memberships FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR private.has_permission('org.staff.read')
    OR private.has_permission('org.staff.manage')
  );
CREATE POLICY staff_memberships_manage ON public.staff_memberships FOR ALL TO authenticated
  USING (private.has_permission('org.staff.manage'))
  WITH CHECK (private.has_permission('org.staff.manage'));

GRANT SELECT ON public.departments, public.teams, public.job_titles, public.staff_memberships TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.departments, public.teams, public.job_titles, public.staff_memberships TO authenticated;

INSERT INTO public.departments (code, name, description) VALUES
  ('ops', 'Operations', 'Delivery and client operations'),
  ('cms', 'Content & CMS', 'Company website and content');
