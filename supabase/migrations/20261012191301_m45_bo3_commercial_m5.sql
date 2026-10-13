-- M45 BO-3: Commercial M5 — plans, tax, quotations, contracts, subscriptions, invoices + projects.contract_id

INSERT INTO public.permissions (code, description, category, is_sensitive) VALUES
  ('finance.quotes.read', 'Read quotations', 'finance', false),
  ('finance.quotes.manage', 'Create and edit quotations', 'finance', false),
  ('finance.contracts.read', 'Read contracts', 'finance', false),
  ('finance.contracts.manage', 'Create and edit contracts', 'finance', false),
  ('finance.invoices.read', 'Read invoices', 'finance', false),
  ('finance.invoices.manage', 'Create and edit draft invoices', 'finance', false),
  ('finance.invoices.issue', 'Issue invoices', 'finance', true),
  ('finance.payments.record', 'Record payments', 'finance', true),
  ('finance.expenses.read', 'Read expenses', 'finance', false),
  ('finance.expenses.manage', 'Manage expenses', 'finance', false),
  ('finance.reports.read', 'Read finance reports and dashboard widgets', 'finance', false),
  ('finance.tax.manage', 'Manage tax profiles and service plans', 'finance', true),
  ('finance.plans.manage', 'Manage service plans', 'finance', false)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'owner' AND p.category = 'finance'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'finance.quotes.read', 'finance.quotes.manage',
  'finance.contracts.read', 'finance.contracts.manage',
  'finance.invoices.read', 'finance.invoices.manage', 'finance.invoices.issue',
  'finance.payments.record', 'finance.expenses.read', 'finance.expenses.manage',
  'finance.reports.read', 'finance.tax.manage', 'finance.plans.manage'
)
WHERE r.code IN ('platform_admin', 'finance_user')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code IN (
  'finance.quotes.read', 'finance.contracts.read', 'finance.invoices.read', 'finance.reports.read'
)
WHERE r.code = 'operations_manager'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  billing_model text NOT NULL DEFAULT 'one_time'
    CHECK (billing_model IN ('one_time', 'monthly', 'annual', 'custom')),
  default_amount numeric(18, 2),
  default_currency char(3) NOT NULL DEFAULT 'GBP',
  includes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  jurisdiction_code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  allows_exemptions boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tax_profile_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tax_profile_id uuid NOT NULL REFERENCES public.tax_profiles (id) ON DELETE RESTRICT,
  rate numeric(9, 6) NOT NULL,
  effective_from date NOT NULL,
  effective_to date,
  exemption_codes_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tax_profile_id, effective_from)
);

CREATE TABLE IF NOT EXISTS public.quotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  project_id uuid,
  quote_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'expired', 'cancelled')),
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  subtotal numeric(18, 2) NOT NULL DEFAULT 0,
  tax_total numeric(18, 2) NOT NULL DEFAULT 0,
  total numeric(18, 2) NOT NULL DEFAULT 0,
  valid_until date,
  tax_profile_id uuid REFERENCES public.tax_profiles (id) ON DELETE SET NULL,
  lines_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, project_id) REFERENCES public.projects (client_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  quotation_id uuid,
  contract_number text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'active', 'completed', 'terminated', 'cancelled')),
  effective_on date,
  ends_on date,
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  value_amount numeric(18, 2),
  storage_path text,
  terms_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, quotation_id) REFERENCES public.quotations (client_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  service_plan_id uuid NOT NULL REFERENCES public.service_plans (id) ON DELETE RESTRICT,
  cms_instance_id uuid,
  contract_id uuid,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('trial', 'active', 'past_due', 'paused', 'cancelled', 'expired')),
  billing_interval text NOT NULL DEFAULT 'monthly'
    CHECK (billing_interval IN ('monthly', 'annual', 'custom')),
  amount numeric(18, 2) NOT NULL,
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  current_period_start date NOT NULL,
  current_period_end date NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  grace_period_days int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, contract_id) REFERENCES public.contracts (client_id, id) ON DELETE SET NULL,
  FOREIGN KEY (client_id, cms_instance_id) REFERENCES public.cms_instances (client_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  project_id uuid,
  contract_id uuid,
  subscription_id uuid,
  quotation_id uuid,
  invoice_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'paid', 'partially_paid', 'void', 'overdue')),
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  issue_date date,
  due_date date,
  subtotal numeric(18, 2) NOT NULL DEFAULT 0,
  tax_total numeric(18, 2) NOT NULL DEFAULT 0,
  total numeric(18, 2) NOT NULL DEFAULT 0,
  amount_paid numeric(18, 2) NOT NULL DEFAULT 0,
  amount_credited numeric(18, 2) NOT NULL DEFAULT 0,
  amount_outstanding numeric(18, 2) NOT NULL DEFAULT 0,
  tax_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  funds_class text NOT NULL DEFAULT 'okanggroup_income',
  fx_rate numeric(18, 8),
  fx_rate_as_of date,
  voided_at timestamptz,
  void_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, project_id) REFERENCES public.projects (client_id, id) ON DELETE SET NULL,
  FOREIGN KEY (client_id, contract_id) REFERENCES public.contracts (client_id, id) ON DELETE SET NULL,
  FOREIGN KEY (client_id, subscription_id) REFERENCES public.subscriptions (client_id, id) ON DELETE SET NULL,
  FOREIGN KEY (client_id, quotation_id) REFERENCES public.quotations (client_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  description text NOT NULL,
  quantity numeric(18, 4) NOT NULL DEFAULT 1,
  unit_amount numeric(18, 2) NOT NULL DEFAULT 0,
  line_total numeric(18, 2) NOT NULL DEFAULT 0,
  tax_rate numeric(9, 6) NOT NULL DEFAULT 0,
  tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  service_plan_id uuid REFERENCES public.service_plans (id) ON DELETE SET NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, invoice_id) REFERENCES public.invoices (client_id, id) ON DELETE CASCADE
);

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS contract_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'projects_contract_tenant_fk'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_contract_tenant_fk
      FOREIGN KEY (client_id, contract_id)
      REFERENCES public.contracts (client_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.quote_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.contract_number_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_quote_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'OKG-Q-' || lpad(nextval('public.quote_number_seq')::text, 6, '0');
$$;
CREATE OR REPLACE FUNCTION public.next_contract_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'OKG-C-' || lpad(nextval('public.contract_number_seq')::text, 6, '0');
$$;
CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'OKG-INV-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION private.assign_quote_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
BEGIN
  IF NEW.quote_number IS NULL OR btrim(NEW.quote_number) = '' OR NEW.quote_number = 'AUTO' THEN
    NEW.quote_number := public.next_quote_number();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION private.assign_contract_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
BEGIN
  IF NEW.contract_number IS NULL OR btrim(NEW.contract_number) = '' OR NEW.contract_number = 'AUTO' THEN
    NEW.contract_number := public.next_contract_number();
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION private.assign_invoice_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR btrim(NEW.invoice_number) = '' OR NEW.invoice_number = 'AUTO' THEN
    NEW.invoice_number := public.next_invoice_number();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS quotations_assign_number ON public.quotations;
CREATE TRIGGER quotations_assign_number BEFORE INSERT ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION private.assign_quote_number();
DROP TRIGGER IF EXISTS contracts_assign_number ON public.contracts;
CREATE TRIGGER contracts_assign_number BEFORE INSERT ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION private.assign_contract_number();
DROP TRIGGER IF EXISTS invoices_assign_number ON public.invoices;
CREATE TRIGGER invoices_assign_number BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION private.assign_invoice_number();

ALTER TABLE public.quotations ALTER COLUMN quote_number SET DEFAULT 'AUTO';
ALTER TABLE public.contracts ALTER COLUMN contract_number SET DEFAULT 'AUTO';
ALTER TABLE public.invoices ALTER COLUMN invoice_number SET DEFAULT 'AUTO';

DROP TRIGGER IF EXISTS service_plans_set_updated_at ON public.service_plans;
CREATE TRIGGER service_plans_set_updated_at BEFORE UPDATE ON public.service_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS tax_profiles_set_updated_at ON public.tax_profiles;
CREATE TRIGGER tax_profiles_set_updated_at BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS quotations_set_updated_at ON public.quotations;
CREATE TRIGGER quotations_set_updated_at BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS contracts_set_updated_at ON public.contracts;
CREATE TRIGGER contracts_set_updated_at BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS subscriptions_set_updated_at ON public.subscriptions;
CREATE TRIGGER subscriptions_set_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS invoices_set_updated_at ON public.invoices;
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profile_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_profile_rates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines FORCE ROW LEVEL SECURITY;

CREATE POLICY service_plans_select ON public.service_plans FOR SELECT TO authenticated
  USING (private.has_permission('finance.plans.manage') OR private.has_permission('finance.quotes.read') OR private.has_permission('finance.invoices.read'));
CREATE POLICY service_plans_write ON public.service_plans FOR ALL TO authenticated
  USING (private.has_permission('finance.plans.manage') OR private.has_permission('finance.tax.manage'))
  WITH CHECK (private.has_permission('finance.plans.manage') OR private.has_permission('finance.tax.manage'));

CREATE POLICY tax_profiles_select ON public.tax_profiles FOR SELECT TO authenticated
  USING (private.has_permission('finance.quotes.read') OR private.has_permission('finance.invoices.read') OR private.has_permission('finance.tax.manage'));
CREATE POLICY tax_profiles_write ON public.tax_profiles FOR ALL TO authenticated
  USING (private.has_permission('finance.tax.manage'))
  WITH CHECK (private.has_permission('finance.tax.manage'));
CREATE POLICY tax_profile_rates_select ON public.tax_profile_rates FOR SELECT TO authenticated
  USING (private.has_permission('finance.quotes.read') OR private.has_permission('finance.invoices.read') OR private.has_permission('finance.tax.manage'));
CREATE POLICY tax_profile_rates_write ON public.tax_profile_rates FOR ALL TO authenticated
  USING (private.has_permission('finance.tax.manage'))
  WITH CHECK (private.has_permission('finance.tax.manage'));

CREATE POLICY quotations_select ON public.quotations FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.quotes.read', client_id) OR private.has_permission('finance.quotes.manage'));
CREATE POLICY quotations_write ON public.quotations FOR ALL TO authenticated
  USING (private.has_permission_on_client('finance.quotes.manage', client_id) OR private.has_permission('finance.quotes.manage'))
  WITH CHECK (private.has_permission_on_client('finance.quotes.manage', client_id) OR private.has_permission('finance.quotes.manage'));

CREATE POLICY contracts_select ON public.contracts FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.contracts.read', client_id) OR private.has_permission('finance.contracts.manage'));
CREATE POLICY contracts_write ON public.contracts FOR ALL TO authenticated
  USING (private.has_permission_on_client('finance.contracts.manage', client_id) OR private.has_permission('finance.contracts.manage'))
  WITH CHECK (private.has_permission_on_client('finance.contracts.manage', client_id) OR private.has_permission('finance.contracts.manage'));

CREATE POLICY subscriptions_select ON public.subscriptions FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.contracts.read', client_id) OR private.has_permission('finance.invoices.read'));
CREATE POLICY subscriptions_write ON public.subscriptions FOR ALL TO authenticated
  USING (private.has_permission('finance.contracts.manage'))
  WITH CHECK (private.has_permission('finance.contracts.manage'));

CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.invoices.read', client_id) OR private.has_permission('finance.invoices.manage'));
CREATE POLICY invoices_write ON public.invoices FOR ALL TO authenticated
  USING (private.has_permission_on_client('finance.invoices.manage', client_id) OR private.has_permission('finance.invoices.manage') OR private.has_permission('finance.invoices.issue'))
  WITH CHECK (private.has_permission_on_client('finance.invoices.manage', client_id) OR private.has_permission('finance.invoices.manage') OR private.has_permission('finance.invoices.issue'));

CREATE POLICY invoice_lines_select ON public.invoice_lines FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.invoices.read', client_id) OR private.has_permission('finance.invoices.manage'));
CREATE POLICY invoice_lines_write ON public.invoice_lines FOR ALL TO authenticated
  USING (private.has_permission_on_client('finance.invoices.manage', client_id) OR private.has_permission('finance.invoices.manage'))
  WITH CHECK (private.has_permission_on_client('finance.invoices.manage', client_id) OR private.has_permission('finance.invoices.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.service_plans, public.tax_profiles, public.tax_profile_rates,
  public.quotations, public.contracts, public.subscriptions,
  public.invoices, public.invoice_lines
TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.quote_number_seq, public.contract_number_seq, public.invoice_number_seq TO authenticated, service_role;

INSERT INTO public.tax_profiles (code, jurisdiction_code, name, status) VALUES
  ('GB_STD', 'GB', 'UK standard VAT', 'active'),
  ('GH_STD', 'GH', 'Ghana standard VAT', 'active'),
  ('ZERO', 'XX', 'Zero rated / no tax', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.tax_profile_rates (tax_profile_id, rate, effective_from)
SELECT id, 0.200000, '2020-01-01' FROM public.tax_profiles WHERE code = 'GB_STD'
AND NOT EXISTS (SELECT 1 FROM public.tax_profile_rates r JOIN public.tax_profiles t ON t.id = r.tax_profile_id WHERE t.code = 'GB_STD');

INSERT INTO public.tax_profile_rates (tax_profile_id, rate, effective_from)
SELECT id, 0.150000, '2020-01-01' FROM public.tax_profiles WHERE code = 'GH_STD'
AND NOT EXISTS (SELECT 1 FROM public.tax_profile_rates r JOIN public.tax_profiles t ON t.id = r.tax_profile_id WHERE t.code = 'GH_STD');

INSERT INTO public.tax_profile_rates (tax_profile_id, rate, effective_from)
SELECT id, 0, '2020-01-01' FROM public.tax_profiles WHERE code = 'ZERO'
AND NOT EXISTS (SELECT 1 FROM public.tax_profile_rates r JOIN public.tax_profiles t ON t.id = r.tax_profile_id WHERE t.code = 'ZERO');

INSERT INTO public.service_plans (code, name, billing_model, default_amount, default_currency, status) VALUES
  ('WEB_BUILD', 'Website build', 'one_time', 0, 'GBP', 'active'),
  ('CMS_MGMT', 'CMS management', 'monthly', 0, 'GBP', 'active'),
  ('SUPPORT', 'Support retainer', 'monthly', 0, 'GBP', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.workflow_definitions (code, name, entity_type, stages_json) VALUES
  ('quotation_status', 'Quotation status', 'quotation',
   '["draft","sent","accepted","rejected","expired","cancelled"]'::jsonb),
  ('contract_status', 'Contract status', 'contract',
   '["draft","sent","active","completed","terminated","cancelled"]'::jsonb),
  ('invoice_status', 'Invoice status', 'invoice',
   '["draft","issued","paid","partially_paid","void","overdue"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.issue_invoice(p_invoice_id uuid)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
BEGIN
  IF NOT private.has_permission('finance.invoices.issue') THEN
    RAISE EXCEPTION 'Not authorised to issue invoices';
  END IF;
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status <> 'draft' THEN RAISE EXCEPTION 'Only draft invoices can be issued'; END IF;

  UPDATE public.invoices
  SET status = 'issued',
      issue_date = COALESCE(issue_date, CURRENT_DATE),
      due_date = COALESCE(due_date, CURRENT_DATE + 30),
      amount_outstanding = total - amount_paid - amount_credited,
      updated_by = auth.uid()
  WHERE id = p_invoice_id
  RETURNING * INTO v_inv;
  RETURN v_inv;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_invoice(uuid) TO authenticated;
