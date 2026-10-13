-- M48 BO-6: Client portal access to projects, deliverables, invoices, shared docs

CREATE OR REPLACE FUNCTION private.is_active_client_member(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.client_memberships m
    JOIN public.profiles p ON p.id = m.profile_id
    WHERE m.client_id = p_client_id
      AND m.profile_id = auth.uid()
      AND m.status = 'active'
      AND p.account_kind = 'client_user'
      AND p.account_status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION private.is_active_client_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_active_client_member(uuid) TO authenticated;

-- Clients: portal members can read their own client row (no internal notes via view optional — column still RLS-gated by select)
DROP POLICY IF EXISTS clients_select ON public.clients;
CREATE POLICY clients_select ON public.clients
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('clients.read', id)
    OR private.has_permission('clients.manage')
    OR private.is_active_client_member(id)
  );

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('projects.read', client_id)
    OR private.is_active_client_member(client_id)
  );

DROP POLICY IF EXISTS milestones_all ON public.milestones;
CREATE POLICY milestones_select ON public.milestones
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('projects.read', client_id)
    OR private.is_active_client_member(client_id)
  );
CREATE POLICY milestones_write ON public.milestones
  FOR ALL TO authenticated
  USING (private.has_permission_on_client('projects.manage', client_id))
  WITH CHECK (private.has_permission_on_client('projects.manage', client_id));

DROP POLICY IF EXISTS project_deliverables_select ON public.project_deliverables;
CREATE POLICY project_deliverables_select ON public.project_deliverables
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('projects.read', client_id)
    OR private.is_active_client_member(client_id)
  );

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('finance.invoices.read', client_id)
    OR private.has_permission('finance.invoices.manage')
    OR (
      private.is_active_client_member(client_id)
      AND status IN ('issued', 'paid', 'partially_paid', 'overdue')
    )
  );

DROP POLICY IF EXISTS invoice_lines_select ON public.invoice_lines;
CREATE POLICY invoice_lines_select ON public.invoice_lines
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('finance.invoices.read', client_id)
    OR private.has_permission('finance.invoices.manage')
    OR private.is_active_client_member(client_id)
  );

DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('finance.contracts.read', client_id)
    OR private.has_permission('finance.contracts.manage')
    OR (
      private.is_active_client_member(client_id)
      AND status IN ('sent', 'active', 'completed')
    )
  );

DROP POLICY IF EXISTS quotations_select ON public.quotations;
CREATE POLICY quotations_select ON public.quotations
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('finance.quotes.read', client_id)
    OR private.has_permission('finance.quotes.manage')
    OR (
      private.is_active_client_member(client_id)
      AND status IN ('sent', 'accepted')
    )
  );

-- Wire client_admin / client_user role placeholders for documentation (portal uses membership RLS)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'dashboard.read'
WHERE r.code IN ('client_admin', 'client_user')
ON CONFLICT DO NOTHING;
