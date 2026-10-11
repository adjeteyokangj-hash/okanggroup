-- M6: Projects (P2 — no contract_id) + RLS

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  stage text NOT NULL DEFAULT 'enquiry',
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'on_hold', 'cancelled', 'closed')),
  budget_amount numeric(18, 2),
  budget_currency char(3),
  starts_on date,
  target_end_on date,
  summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, code),
  UNIQUE (client_id, id)
);

CREATE TABLE public.milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  client_id uuid NOT NULL,
  name text NOT NULL,
  due_on date,
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, project_id) REFERENCES public.projects (client_id, id) ON DELETE CASCADE
);

CREATE TRIGGER projects_set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.milestones FORCE ROW LEVEL SECURITY;

CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
  USING (private.has_permission_on_client('projects.read', client_id));
CREATE POLICY projects_manage ON public.projects FOR ALL TO authenticated
  USING (private.has_permission_on_client('projects.manage', client_id))
  WITH CHECK (private.has_permission_on_client('projects.manage', client_id));

CREATE POLICY milestones_all ON public.milestones FOR ALL TO authenticated
  USING (private.has_permission_on_client('projects.read', client_id))
  WITH CHECK (private.has_permission_on_client('projects.manage', client_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects, public.milestones TO authenticated;
