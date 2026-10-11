-- M2: Permissions domain, seeds, core private predicates + RLS
-- Target: prbgsnxpwyepdggdysnt (Release 1 only)

CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text NOT NULL,
  category text NOT NULL,
  is_sensitive boolean NOT NULL DEFAULT false,
  allows_scope boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles (id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions (id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE public.access_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('platform', 'department', 'team', 'client', 'project', 'cms_instance')),
  department_id uuid,
  team_id uuid,
  client_id uuid,
  project_id uuid,
  cms_instance_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_scopes_shape_chk CHECK (
    (scope_type = 'platform' AND department_id IS NULL AND team_id IS NULL AND client_id IS NULL AND project_id IS NULL AND cms_instance_id IS NULL)
    OR (scope_type = 'department' AND department_id IS NOT NULL AND team_id IS NULL AND client_id IS NULL AND project_id IS NULL AND cms_instance_id IS NULL)
    OR (scope_type = 'team' AND team_id IS NOT NULL AND client_id IS NULL AND project_id IS NULL AND cms_instance_id IS NULL)
    OR (scope_type = 'client' AND client_id IS NOT NULL AND project_id IS NULL AND cms_instance_id IS NULL)
    OR (scope_type = 'project' AND client_id IS NOT NULL AND project_id IS NOT NULL AND cms_instance_id IS NULL)
    OR (scope_type = 'cms_instance' AND client_id IS NOT NULL AND cms_instance_id IS NOT NULL)
  )
);

CREATE TABLE public.role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles (id) ON DELETE RESTRICT,
  access_scope_id uuid NOT NULL REFERENCES public.access_scopes (id),
  granted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX role_grants_active_uniq
  ON public.role_grants (profile_id, role_id, access_scope_id)
  WHERE status = 'active';

CREATE TABLE public.temporary_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  permission_id uuid REFERENCES public.permissions (id),
  role_id uuid REFERENCES public.roles (id),
  access_scope_id uuid NOT NULL REFERENCES public.access_scopes (id),
  reason text NOT NULL,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT temporary_access_subject_chk CHECK (permission_id IS NOT NULL OR role_id IS NOT NULL)
);

-- Seed roles
INSERT INTO public.roles (code, name, description, is_system) VALUES
  ('owner', 'Owner', 'Ultimate platform authority within legal limits', true),
  ('platform_admin', 'Platform Admin', 'Day-to-day platform configuration', true),
  ('operations_manager', 'Operations Manager', 'Cross-team delivery within authorised clients', true),
  ('department_manager', 'Department Manager', 'Department work and staff', true),
  ('team_manager', 'Team Manager', 'Team task assignment', true),
  ('staff', 'Staff', 'Baseline staff access', true),
  ('finance_user', 'Finance User', 'Commercial finance operations', true),
  ('support_agent', 'Support Agent', 'Support tickets', true),
  ('cms_editor', 'CMS Editor', 'Company / authorised CMS content', true),
  ('client_admin', 'Client Admin', 'Own client portal administration', true),
  ('client_user', 'Client User', 'Own client limited portal', true);

-- Seed R1 permission catalogue (subset)
INSERT INTO public.permissions (code, description, category, is_sensitive) VALUES
  ('platform.settings.manage', 'Manage platform settings', 'platform', true),
  ('platform.roles.manage', 'Manage roles and grants', 'platform', true),
  ('platform.audit.read', 'Read audit logs', 'platform', true),
  ('org.departments.read', 'Read departments', 'org', false),
  ('org.departments.manage', 'Manage departments and teams', 'org', false),
  ('org.staff.read', 'Read staff directory', 'org', false),
  ('org.staff.manage', 'Manage staff memberships', 'org', false),
  ('org.staff.invite', 'Invite staff', 'org', true),
  ('clients.read', 'Read clients in scope', 'clients', false),
  ('clients.manage', 'Manage clients in scope', 'clients', false),
  ('projects.read', 'Read projects in scope', 'projects', false),
  ('projects.manage', 'Manage projects in scope', 'projects', false),
  ('projects.stage.advance', 'Advance project stage', 'projects', false),
  ('tasks.read', 'Read tasks in scope', 'operations', false),
  ('tasks.manage', 'Create and update tasks', 'operations', false),
  ('tasks.assign', 'Assign tasks', 'operations', false),
  ('approvals.decide', 'Decide routine approvals', 'operations', false),
  ('company_cms.read', 'Read company CMS', 'cms', false),
  ('company_cms.edit', 'Edit company CMS drafts', 'cms', false),
  ('company_cms.publish', 'Publish company CMS', 'cms', true),
  ('dashboard.read', 'Read management dashboard', 'platform', false);

-- Map owner → all R1 permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.code = 'owner';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'platform.settings.manage', 'platform.roles.manage', 'platform.audit.read',
  'org.departments.read', 'org.departments.manage', 'org.staff.read', 'org.staff.manage', 'org.staff.invite',
  'clients.read', 'clients.manage', 'projects.read', 'projects.manage', 'projects.stage.advance',
  'tasks.read', 'tasks.manage', 'tasks.assign', 'approvals.decide',
  'company_cms.read', 'company_cms.edit', 'company_cms.publish', 'dashboard.read'
) WHERE r.code = 'platform_admin';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'org.departments.read', 'org.staff.read',
  'clients.read', 'clients.manage', 'projects.read', 'projects.manage', 'projects.stage.advance',
  'tasks.read', 'tasks.manage', 'tasks.assign', 'approvals.decide',
  'company_cms.read', 'dashboard.read'
) WHERE r.code = 'operations_manager';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'org.departments.read', 'org.staff.read',
  'clients.read', 'projects.read', 'projects.manage',
  'tasks.read', 'tasks.manage', 'tasks.assign', 'approvals.decide',
  'company_cms.read', 'company_cms.edit', 'dashboard.read'
) WHERE r.code IN ('department_manager', 'team_manager');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'tasks.read', 'tasks.manage', 'company_cms.read', 'dashboard.read'
) WHERE r.code = 'staff';

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'company_cms.read', 'company_cms.edit', 'company_cms.publish', 'tasks.read', 'dashboard.read'
) WHERE r.code = 'cms_editor';

-- Platform scope singleton helper row (created on demand in app; seed one)
INSERT INTO public.access_scopes (id, scope_type)
VALUES ('00000000-0000-4000-8000-000000000001', 'platform');

CREATE OR REPLACE FUNCTION private.has_permission(code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id AND p.code = has_permission.code
    JOIN public.access_scopes s ON s.id = rg.access_scope_id
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND s.scope_type = 'platform'
  )
  OR EXISTS (
    SELECT 1
    FROM public.temporary_access ta
    JOIN public.permissions p ON p.id = ta.permission_id AND p.code = has_permission.code
    WHERE ta.profile_id = auth.uid()
      AND ta.revoked_at IS NULL
      AND ta.starts_at <= now()
      AND ta.ends_at > now()
  );
$$;

CREATE OR REPLACE FUNCTION private.has_permission_on_client(code text, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT private.has_permission(code)
  OR EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id AND p.code = has_permission_on_client.code
    JOIN public.access_scopes s ON s.id = rg.access_scope_id
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND (
        s.scope_type = 'platform'
        OR (s.scope_type = 'client' AND s.client_id = p_client_id)
        OR (s.scope_type IN ('project', 'cms_instance') AND s.client_id = p_client_id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.has_platform_role(role_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.code = role_code AND r.status = 'active'
    JOIN public.access_scopes s ON s.id = rg.access_scope_id AND s.scope_type = 'platform'
    WHERE rg.profile_id = auth.uid()
      AND rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
  );
$$;

REVOKE ALL ON FUNCTION private.has_permission(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_permission_on_client(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_platform_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_permission_on_client(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_platform_role(text) TO authenticated;

ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.access_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_scopes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.temporary_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.temporary_access FORCE ROW LEVEL SECURITY;

CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY access_scopes_read ON public.access_scopes FOR SELECT TO authenticated
  USING (
    private.has_permission('platform.roles.manage')
    OR EXISTS (
      SELECT 1 FROM public.role_grants rg
      WHERE rg.access_scope_id = access_scopes.id AND rg.profile_id = auth.uid()
    )
  );

CREATE POLICY role_grants_read ON public.role_grants FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR private.has_permission('platform.roles.manage')
    OR private.has_permission('org.staff.read')
  );

CREATE POLICY role_grants_manage ON public.role_grants FOR ALL TO authenticated
  USING (private.has_permission('platform.roles.manage'))
  WITH CHECK (private.has_permission('platform.roles.manage'));

CREATE POLICY temporary_access_read ON public.temporary_access FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR private.has_permission('platform.roles.manage'));

-- Widen profiles select for staff with org.staff.read
DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self_or_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR private.has_permission('org.staff.read')
    OR private.has_permission('platform.roles.manage')
  );

GRANT SELECT ON public.permissions, public.roles, public.role_permissions, public.access_scopes TO authenticated;
GRANT SELECT ON public.role_grants, public.temporary_access TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.role_grants TO authenticated;
