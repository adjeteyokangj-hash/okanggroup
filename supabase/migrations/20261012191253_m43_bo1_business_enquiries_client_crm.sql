-- M43 BO-1: Business enquiries → client CRM (services, account manager, activity)

INSERT INTO public.permissions (code, description, category, is_sensitive) VALUES
  ('enquiries.read', 'Read business enquiries', 'clients', false),
  ('enquiries.manage', 'Manage business enquiries and convert to clients', 'clients', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'owner'
  AND p.code IN ('enquiries.read', 'enquiries.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN ('enquiries.read', 'enquiries.manage')
WHERE r.code IN ('platform_admin', 'operations_manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'enquiries.read'
WHERE r.code IN ('department_manager', 'team_manager')
ON CONFLICT DO NOTHING;

INSERT INTO public.lookup_values (lookup_type, code, label, sort_order) VALUES
  ('enquiry_source', 'website', 'Website', 10),
  ('enquiry_source', 'referral', 'Referral', 20),
  ('enquiry_source', 'direct', 'Direct contact', 30),
  ('enquiry_source', 'other', 'Other', 40),
  ('enquiry_type', 'new_website', 'New website', 10),
  ('enquiry_type', 'cms_management', 'CMS management', 20),
  ('enquiry_type', 'support', 'Support', 30),
  ('enquiry_type', 'other', 'Other', 40),
  ('currency', 'GBP', 'British Pound', 10),
  ('currency', 'GHS', 'Ghana Cedi', 20),
  ('currency', 'USD', 'US Dollar', 30),
  ('currency', 'EUR', 'Euro', 40)
ON CONFLICT (lookup_type, code) DO NOTHING;

INSERT INTO public.workflow_definitions (code, name, entity_type, stages_json) VALUES
  ('business_enquiry', 'Business enquiry', 'business_enquiry',
   '["new","qualified","quoted","won","lost","converted"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS account_manager_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.business_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enquiry_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'qualified', 'quoted', 'won', 'lost', 'converted')),
  source text NOT NULL DEFAULT 'direct',
  enquiry_type text NOT NULL DEFAULT 'other',
  organisation_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email extensions.citext NOT NULL,
  contact_phone text,
  summary text NOT NULL DEFAULT '',
  notes_internal text,
  converted_client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  converted_at timestamptz,
  assigned_to uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE SEQUENCE IF NOT EXISTS public.enquiry_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_enquiry_number()
RETURNS text
LANGUAGE sql
AS $$
  SELECT 'OKG-ENQ-' || lpad(nextval('public.enquiry_number_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION private.assign_enquiry_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NEW.enquiry_number IS NULL OR btrim(NEW.enquiry_number) = '' OR NEW.enquiry_number = 'AUTO' THEN
    NEW.enquiry_number := public.next_enquiry_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_enquiries_assign_number ON public.business_enquiries;
CREATE TRIGGER business_enquiries_assign_number
  BEFORE INSERT ON public.business_enquiries
  FOR EACH ROW EXECUTE FUNCTION private.assign_enquiry_number();

DROP TRIGGER IF EXISTS business_enquiries_set_updated_at ON public.business_enquiries;
CREATE TRIGGER business_enquiries_set_updated_at
  BEFORE UPDATE ON public.business_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.business_enquiries ALTER COLUMN enquiry_number SET DEFAULT 'AUTO';

CREATE TABLE IF NOT EXISTS public.client_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  activity_type text NOT NULL DEFAULT 'note'
    CHECK (activity_type IN ('note', 'status_change', 'enquiry_converted', 'assignment', 'system')),
  body text NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id)
);

CREATE INDEX IF NOT EXISTS client_activities_client_idx
  ON public.client_activities (client_id, created_at DESC);

ALTER TABLE public.business_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_enquiries FORCE ROW LEVEL SECURITY;
ALTER TABLE public.client_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_activities FORCE ROW LEVEL SECURITY;

CREATE POLICY business_enquiries_select ON public.business_enquiries
  FOR SELECT TO authenticated
  USING (private.has_permission('enquiries.read') OR private.has_permission('enquiries.manage'));

CREATE POLICY business_enquiries_insert ON public.business_enquiries
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('enquiries.manage'));

CREATE POLICY business_enquiries_update ON public.business_enquiries
  FOR UPDATE TO authenticated
  USING (private.has_permission('enquiries.manage'))
  WITH CHECK (private.has_permission('enquiries.manage'));

CREATE POLICY business_enquiries_delete ON public.business_enquiries
  FOR DELETE TO authenticated
  USING (private.has_permission('enquiries.manage') AND private.has_platform_role('owner'));

CREATE POLICY client_activities_select ON public.client_activities
  FOR SELECT TO authenticated
  USING (private.has_permission_on_client('clients.read', client_id));

CREATE POLICY client_activities_insert ON public.client_activities
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_permission_on_client('clients.manage', client_id)
    AND created_by = auth.uid()
  );

CREATE POLICY client_activities_delete ON public.client_activities
  FOR DELETE TO authenticated
  USING (private.has_permission_on_client('clients.manage', client_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_enquiries TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.client_activities TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.enquiry_number_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.convert_enquiry_to_client(p_enquiry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_enq public.business_enquiries%ROWTYPE;
  v_client_id uuid;
BEGIN
  IF NOT private.has_permission('enquiries.manage') THEN
    RAISE EXCEPTION 'Not authorised to convert enquiries';
  END IF;

  SELECT * INTO v_enq FROM public.business_enquiries WHERE id = p_enquiry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enquiry not found';
  END IF;
  IF v_enq.status = 'converted' OR v_enq.converted_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'Enquiry already converted';
  END IF;
  IF v_enq.status = 'lost' THEN
    RAISE EXCEPTION 'Cannot convert a lost enquiry';
  END IF;

  INSERT INTO public.clients (
    legal_name, trading_name, primary_email, status, notes_internal,
    account_manager_profile_id, created_by, updated_by
  ) VALUES (
    v_enq.organisation_name,
    NULL,
    v_enq.contact_email,
    'prospect',
    COALESCE(v_enq.notes_internal, v_enq.summary),
    v_enq.assigned_to,
    auth.uid(),
    auth.uid()
  )
  RETURNING id INTO v_client_id;

  INSERT INTO public.client_contacts (
    client_id, full_name, email, phone, is_primary, status
  ) VALUES (
    v_client_id, v_enq.contact_name, v_enq.contact_email, v_enq.contact_phone, true, 'active'
  );

  INSERT INTO public.client_activities (client_id, activity_type, body, metadata_json, created_by)
  VALUES (
    v_client_id,
    'enquiry_converted',
    'Converted from enquiry ' || v_enq.enquiry_number,
    jsonb_build_object('enquiry_id', v_enq.id, 'enquiry_number', v_enq.enquiry_number),
    auth.uid()
  );

  UPDATE public.business_enquiries
  SET status = 'converted',
      converted_client_id = v_client_id,
      converted_at = now(),
      updated_by = auth.uid()
  WHERE id = p_enquiry_id;

  RETURN v_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_enquiry_to_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.convert_enquiry_to_client(uuid) TO authenticated;
