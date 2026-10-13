-- M28: Client CMS registry + staff capability grants (separate from Company CMS)
-- No new permission catalogue codes — Owner stays at 21.
-- Registry managed via clients.manage; staff access via cms_instance_grants only.
-- credential_ref is a vault/label reference — never store raw secrets here.

CREATE TABLE public.cms_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  project_id uuid,
  slug text NOT NULL,
  display_name text NOT NULL,
  cms_kind text NOT NULL DEFAULT 'external_website',
  management_mode text NOT NULL DEFAULT 'okanggroup_managed'
    CHECK (management_mode IN ('okanggroup_managed', 'client_managed', 'hybrid')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'retired', 'disconnected')),
  external_admin_url text,
  notes text,
  -- Opaque reference / label only — never raw hosting passwords, DB URLs, or API secrets
  credential_ref text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  UNIQUE (slug),
  CONSTRAINT cms_instances_project_fk FOREIGN KEY (client_id, project_id)
    REFERENCES public.projects (client_id, id) ON DELETE SET NULL
);

CREATE TRIGGER cms_instances_set_updated_at
  BEFORE UPDATE ON public.cms_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cms_instance_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT false,
  can_submit boolean NOT NULL DEFAULT false,
  can_publish boolean NOT NULL DEFAULT false,
  granted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (cms_instance_id, profile_id),
  CONSTRAINT cms_instance_grants_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id)
    ON DELETE CASCADE,
  CONSTRAINT cms_instance_grants_caps_chk CHECK (
    can_view OR can_edit OR can_submit OR can_publish
  )
);

CREATE INDEX cms_instance_grants_profile_idx
  ON public.cms_instance_grants (profile_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.cms_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_instances FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_instance_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_instance_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_instances_select ON public.cms_instances
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('clients.read', client_id)
    OR private.has_permission_on_client('clients.manage', client_id)
    OR EXISTS (
      SELECT 1 FROM public.cms_instance_grants g
      WHERE g.cms_instance_id = cms_instances.id
        AND g.profile_id = auth.uid()
        AND g.revoked_at IS NULL
        AND g.can_view
    )
  );

CREATE POLICY cms_instances_insert ON public.cms_instances
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission_on_client('clients.manage', client_id));

CREATE POLICY cms_instances_update ON public.cms_instances
  FOR UPDATE TO authenticated
  USING (private.has_permission_on_client('clients.manage', client_id))
  WITH CHECK (private.has_permission_on_client('clients.manage', client_id));

CREATE POLICY cms_instances_delete ON public.cms_instances
  FOR DELETE TO authenticated
  USING (private.has_permission_on_client('clients.manage', client_id));

CREATE POLICY cms_instance_grants_select ON public.cms_instance_grants
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission_on_client('org.staff.read', client_id)
    OR private.has_permission('org.staff.read')
    OR private.has_permission('clients.manage')
  );

CREATE POLICY cms_instance_grants_insert ON public.cms_instance_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission('clients.manage')
  );

CREATE POLICY cms_instance_grants_update ON public.cms_instance_grants
  FOR UPDATE TO authenticated
  USING (
    private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission('clients.manage')
  )
  WITH CHECK (
    private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission('clients.manage')
  );

CREATE POLICY cms_instance_grants_delete ON public.cms_instance_grants
  FOR DELETE TO authenticated
  USING (
    private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission('clients.manage')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_instances, public.cms_instance_grants TO authenticated;

-- Optional link from tasks to a CMS instance (composite tenant-safe when set)
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS cms_instance_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_cms_instance_fk'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_cms_instance_fk
      FOREIGN KEY (client_id, cms_instance_id)
      REFERENCES public.cms_instances (client_id, id);
  END IF;
END $$;
