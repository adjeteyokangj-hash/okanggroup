-- M30: Client CMS workspace (OkangGroup-managed content + modules + external adapter stub)
-- Completes W3/W4 registry — does not replace Company CMS.
-- No new Owner permission catalogue codes (still 21).

-- ---------------------------------------------------------------------------
-- 1) Modules + connections (registry completeness)
-- ---------------------------------------------------------------------------
CREATE TABLE public.cms_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  module_code text NOT NULL,
  module_name text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_sensitive boolean NOT NULL DEFAULT false,
  hosted_in text NOT NULL DEFAULT 'platform_content'
    CHECK (hosted_in IN ('platform_content', 'external_cms', 'registry_only')),
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cms_instance_id, module_code),
  UNIQUE (client_id, id),
  CONSTRAINT cms_modules_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id)
    ON DELETE CASCADE,
  CONSTRAINT cms_modules_sensitive_external_chk CHECK (
    NOT is_sensitive OR hosted_in IN ('external_cms', 'registry_only')
  )
);

CREATE TRIGGER cms_modules_set_updated_at
  BEFORE UPDATE ON public.cms_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.cms_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  adapter_code text NOT NULL DEFAULT 'okang_native'
    CHECK (adapter_code IN (
      'okang_native',
      'wordpress_rest',
      'custom_webhook',
      'manual_only'
    )),
  base_url text,
  auth_method text NOT NULL DEFAULT 'manual'
    CHECK (auth_method IN ('service_jwt', 'm2m_oauth', 'signed_webhook', 'manual')),
  -- Vault / secret-store label only — never raw API keys or DB passwords
  credential_ref text,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('not_configured', 'configured', 'healthy', 'error', 'disabled')),
  last_healthy_at timestamptz,
  last_error text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cms_instance_id),
  CONSTRAINT cms_connections_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id)
    ON DELETE CASCADE
);

CREATE TRIGGER cms_connections_set_updated_at
  BEFORE UPDATE ON public.cms_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2) Platform-hosted client website documents (OkangGroup-managed CMS)
-- ---------------------------------------------------------------------------
CREATE TABLE public.client_cms_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cms_instance_id uuid NOT NULL,
  client_id uuid NOT NULL,
  module_id uuid NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  body_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'published', 'rejected', 'archived')),
  requires_client_approval boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cms_instance_id, module_id, slug),
  UNIQUE (client_id, id),
  CONSTRAINT client_cms_documents_instance_fk
    FOREIGN KEY (client_id, cms_instance_id)
    REFERENCES public.cms_instances (client_id, id)
    ON DELETE CASCADE,
  CONSTRAINT client_cms_documents_module_fk
    FOREIGN KEY (client_id, module_id)
    REFERENCES public.cms_modules (client_id, id)
    ON DELETE RESTRICT
);

CREATE TRIGGER client_cms_documents_set_updated_at
  BEFORE UPDATE ON public.client_cms_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.client_cms_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  client_id uuid NOT NULL,
  revision_no int NOT NULL,
  action text NOT NULL
    CHECK (action IN ('save', 'submit', 'approve', 'reject', 'publish', 'rollback')),
  snapshot_json jsonb NOT NULL,
  note text,
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, revision_no),
  CONSTRAINT client_cms_revisions_doc_fk
    FOREIGN KEY (client_id, document_id)
    REFERENCES public.client_cms_documents (client_id, id)
    ON DELETE CASCADE
);

CREATE INDEX client_cms_documents_instance_idx
  ON public.client_cms_documents (cms_instance_id, status);

-- ---------------------------------------------------------------------------
-- 3) Access helpers (staff grant OR client membership + grant)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.cms_instance_grant_row(p_instance_id uuid)
RETURNS public.cms_instance_grants
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT g.*
  FROM public.cms_instance_grants g
  WHERE g.cms_instance_id = p_instance_id
    AND g.profile_id = auth.uid()
    AND g.revoked_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.can_view_cms_instance(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT
    private.has_permission('clients.manage')
    OR EXISTS (
      SELECT 1 FROM public.cms_instances i
      WHERE i.id = p_instance_id
        AND private.has_permission_on_client('clients.manage', i.client_id)
    )
    OR EXISTS (
      SELECT 1 FROM private.cms_instance_grant_row(p_instance_id) g
      WHERE g.can_view
    );
$$;

CREATE OR REPLACE FUNCTION private.can_edit_cms_instance(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT
    private.has_permission('clients.manage')
    OR EXISTS (
      SELECT 1 FROM public.cms_instances i
      WHERE i.id = p_instance_id
        AND private.has_permission_on_client('clients.manage', i.client_id)
    )
    OR EXISTS (
      SELECT 1 FROM private.cms_instance_grant_row(p_instance_id) g
      WHERE g.can_edit
    );
$$;

CREATE OR REPLACE FUNCTION private.can_submit_cms_instance(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT
    private.has_permission('clients.manage')
    OR EXISTS (
      SELECT 1 FROM public.cms_instances i
      WHERE i.id = p_instance_id
        AND private.has_permission_on_client('clients.manage', i.client_id)
    )
    OR EXISTS (
      SELECT 1 FROM private.cms_instance_grant_row(p_instance_id) g
      WHERE g.can_submit
    );
$$;

CREATE OR REPLACE FUNCTION private.can_publish_cms_instance(p_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT
    private.has_permission('clients.manage')
    OR EXISTS (
      SELECT 1 FROM public.cms_instances i
      WHERE i.id = p_instance_id
        AND private.has_permission_on_client('clients.manage', i.client_id)
    )
    OR EXISTS (
      SELECT 1 FROM private.cms_instance_grant_row(p_instance_id) g
      WHERE g.can_publish
    );
$$;

-- ---------------------------------------------------------------------------
-- 4) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.cms_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_modules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cms_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cms_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_cms_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_cms_documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_cms_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_cms_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY cms_modules_select ON public.cms_modules
  FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));

CREATE POLICY cms_modules_write ON public.cms_modules
  FOR ALL TO authenticated
  USING (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
  )
  WITH CHECK (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
  );

CREATE POLICY cms_connections_select ON public.cms_connections
  FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));

CREATE POLICY cms_connections_write ON public.cms_connections
  FOR ALL TO authenticated
  USING (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
  )
  WITH CHECK (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
  );

CREATE POLICY client_cms_documents_select ON public.client_cms_documents
  FOR SELECT TO authenticated
  USING (private.can_view_cms_instance(cms_instance_id));

-- Writes go through SECURITY DEFINER RPCs (except managers may insert modules via panel)
CREATE POLICY client_cms_documents_insert ON public.client_cms_documents
  FOR INSERT TO authenticated
  WITH CHECK (private.can_edit_cms_instance(cms_instance_id));

CREATE POLICY client_cms_documents_update ON public.client_cms_documents
  FOR UPDATE TO authenticated
  USING (private.can_edit_cms_instance(cms_instance_id))
  WITH CHECK (private.can_edit_cms_instance(cms_instance_id));

CREATE POLICY client_cms_revisions_select ON public.client_cms_revisions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_cms_documents d
      WHERE d.id = document_id
        AND private.can_view_cms_instance(d.cms_instance_id)
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cms_modules, public.cms_connections TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.client_cms_documents TO authenticated;
GRANT SELECT ON public.client_cms_revisions TO authenticated;

-- Client memberships: client_user can read own membership
DROP POLICY IF EXISTS client_memberships_all ON public.client_memberships;
CREATE POLICY client_memberships_select ON public.client_memberships
  FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
    OR private.has_permission('clients.read')
    OR private.has_permission_on_client('clients.read', client_id)
  );
CREATE POLICY client_memberships_write ON public.client_memberships
  FOR ALL TO authenticated
  USING (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
  )
  WITH CHECK (
    private.has_permission('clients.manage')
    OR private.has_permission_on_client('clients.manage', client_id)
  );
