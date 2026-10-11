-- M9: Tasks, assignments, approvals (P2 — no cms_instance_id) + RLS

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients (id),
  project_id uuid,
  is_internal boolean NOT NULL DEFAULT false,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'backlog',
  due_at timestamptz,
  requires_approval boolean NOT NULL DEFAULT false,
  verification_status text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id),
  CONSTRAINT tasks_internal_chk CHECK (
    (is_internal AND client_id IS NULL AND project_id IS NULL)
    OR (NOT is_internal AND client_id IS NOT NULL)
  ),
  CONSTRAINT tasks_project_tenant_chk CHECK (
    project_id IS NULL OR client_id IS NOT NULL
  )
);

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_project_fk
  FOREIGN KEY (client_id, project_id)
  REFERENCES public.projects (client_id, id);

CREATE TABLE public.task_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  assignee_profile_id uuid REFERENCES public.profiles (id),
  assignee_team_id uuid REFERENCES public.teams (id),
  assigned_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  assignment_type text NOT NULL CHECK (assignment_type IN ('manual', 'team', 'reassignment', 'escalation')),
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_assignments_assignee_chk CHECK (
    assignee_profile_id IS NOT NULL OR assignee_team_id IS NOT NULL
  )
);

CREATE TABLE public.task_dependencies (
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE TABLE public.approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  client_id uuid REFERENCES public.clients (id),
  is_internal boolean NOT NULL DEFAULT false,
  requested_by uuid NOT NULL REFERENCES public.profiles (id),
  approver_profile_id uuid REFERENCES public.profiles (id),
  approver_role_id uuid REFERENCES public.roles (id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'escalated')),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id)
);

CREATE TRIGGER tasks_set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_dependencies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals FORCE ROW LEVEL SECURITY;

CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
  USING (
    (is_internal AND private.has_permission('tasks.read'))
    OR (client_id IS NOT NULL AND private.has_permission_on_client('tasks.read', client_id))
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.task_id = tasks.id AND ta.assignee_profile_id = auth.uid()
    )
  );

CREATE POLICY tasks_manage ON public.tasks FOR ALL TO authenticated
  USING (
    (is_internal AND private.has_permission('tasks.manage'))
    OR (client_id IS NOT NULL AND private.has_permission_on_client('tasks.manage', client_id))
  )
  WITH CHECK (
    (is_internal AND private.has_permission('tasks.manage'))
    OR (client_id IS NOT NULL AND private.has_permission_on_client('tasks.manage', client_id))
  );

CREATE POLICY task_assignments_all ON public.task_assignments FOR ALL TO authenticated
  USING (
    private.has_permission('tasks.assign')
    OR assignee_profile_id = auth.uid()
    OR assigned_by = auth.uid()
  )
  WITH CHECK (private.has_permission('tasks.assign') OR private.has_permission('tasks.manage'));

CREATE POLICY task_dependencies_all ON public.task_dependencies FOR ALL TO authenticated
  USING (private.has_permission('tasks.read'))
  WITH CHECK (private.has_permission('tasks.manage'));

CREATE POLICY approvals_select ON public.approvals FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR approver_profile_id = auth.uid()
    OR private.has_permission('approvals.decide')
  );

CREATE POLICY approvals_manage ON public.approvals FOR ALL TO authenticated
  USING (
    requested_by = auth.uid()
    OR private.has_permission('approvals.decide')
  )
  WITH CHECK (
    requested_by = auth.uid()
    OR private.has_permission('approvals.decide')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks, public.task_assignments,
  public.task_dependencies, public.approvals TO authenticated;
