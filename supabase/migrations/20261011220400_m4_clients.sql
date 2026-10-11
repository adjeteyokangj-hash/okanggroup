-- M4: Clients directory + RLS (tenant root)

CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code text NOT NULL UNIQUE,
  legal_name text NOT NULL,
  trading_name text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('prospect', 'active', 'suspended', 'archived')),
  primary_email extensions.citext,
  notes_internal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email extensions.citext,
  phone text,
  role_title text,
  is_primary boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id)
);

CREATE TABLE public.client_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  membership_role text NOT NULL CHECK (membership_role IN ('client_admin', 'client_user')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, profile_id),
  UNIQUE (client_id, id)
);

CREATE TABLE public.client_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  service_code text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, service_code),
  UNIQUE (client_id, id)
);

CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_services FORCE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON public.clients FOR SELECT TO authenticated
  USING (private.has_permission_on_client('clients.read', id) OR private.has_permission('clients.manage'));
CREATE POLICY clients_manage ON public.clients FOR ALL TO authenticated
  USING (private.has_permission('clients.manage') OR private.has_permission_on_client('clients.manage', id))
  WITH CHECK (private.has_permission('clients.manage') OR private.has_permission_on_client('clients.manage', id));

CREATE POLICY client_contacts_all ON public.client_contacts FOR ALL TO authenticated
  USING (private.has_permission_on_client('clients.read', client_id))
  WITH CHECK (private.has_permission_on_client('clients.manage', client_id));

CREATE POLICY client_memberships_all ON public.client_memberships FOR ALL TO authenticated
  USING (
    profile_id = auth.uid()
    OR private.has_permission_on_client('clients.read', client_id)
  )
  WITH CHECK (private.has_permission_on_client('clients.manage', client_id));

CREATE POLICY client_services_all ON public.client_services FOR ALL TO authenticated
  USING (private.has_permission_on_client('clients.read', client_id))
  WITH CHECK (private.has_permission_on_client('clients.manage', client_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients, public.client_contacts, public.client_memberships, public.client_services TO authenticated;
