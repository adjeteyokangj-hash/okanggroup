-- M46 BO-4: Payments, credit notes, refunds, expenses, FX rates

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency char(3) NOT NULL,
  quote_currency char(3) NOT NULL,
  rate numeric(18, 8) NOT NULL CHECK (rate > 0),
  as_of_date date NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (base_currency, quote_currency, as_of_date, source)
);

CREATE TABLE IF NOT EXISTS public.payment_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  invoice_id uuid,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('bank_transfer', 'cash', 'card', 'other')),
  provider text,
  provider_ref text,
  status text NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'reversed')),
  funds_class text NOT NULL DEFAULT 'okanggroup_income',
  fx_rate numeric(18, 8),
  fx_rate_as_of date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, invoice_id) REFERENCES public.invoices (client_id, id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  credit_number text NOT NULL UNIQUE,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'applied', 'void')),
  requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, invoice_id) REFERENCES public.invoices (client_id, id) ON DELETE RESTRICT,
  CHECK (requested_by IS DISTINCT FROM approved_by OR approved_by IS NULL)
);

CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  payment_id uuid,
  invoice_id uuid,
  amount numeric(18, 2) NOT NULL CHECK (amount > 0),
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'paid', 'void')),
  requested_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, payment_id) REFERENCES public.payment_records (client_id, id) ON DELETE SET NULL,
  FOREIGN KEY (client_id, invoice_id) REFERENCES public.invoices (client_id, id) ON DELETE SET NULL,
  CHECK (requested_by IS DISTINCT FROM approved_by OR approved_by IS NULL)
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount numeric(18, 2) NOT NULL CHECK (amount >= 0),
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  spent_on date NOT NULL DEFAULT CURRENT_DATE,
  vendor_name text,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  project_id uuid,
  status text NOT NULL DEFAULT 'recorded'
    CHECK (status IN ('recorded', 'reimbursed', 'void')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_project_tenant_fk') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_project_tenant_fk
      FOREIGN KEY (client_id, project_id)
      REFERENCES public.projects (client_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.credit_number_seq START 1;
CREATE OR REPLACE FUNCTION public.next_credit_number()
RETURNS text LANGUAGE sql AS $$
  SELECT 'OKG-CN-' || lpad(nextval('public.credit_number_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION private.assign_credit_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public, pg_temp AS $$
BEGIN
  IF NEW.credit_number IS NULL OR btrim(NEW.credit_number) = '' OR NEW.credit_number = 'AUTO' THEN
    NEW.credit_number := public.next_credit_number();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS credit_notes_assign_number ON public.credit_notes;
CREATE TRIGGER credit_notes_assign_number BEFORE INSERT ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION private.assign_credit_number();
ALTER TABLE public.credit_notes ALTER COLUMN credit_number SET DEFAULT 'AUTO';

DROP TRIGGER IF EXISTS expenses_set_updated_at ON public.expenses;
CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_notes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses FORCE ROW LEVEL SECURITY;

CREATE POLICY fx_rates_select ON public.fx_rates FOR SELECT TO authenticated
  USING (private.has_permission('finance.reports.read') OR private.has_permission('finance.payments.record'));
CREATE POLICY fx_rates_write ON public.fx_rates FOR ALL TO authenticated
  USING (private.has_permission('finance.tax.manage') OR private.has_permission('finance.payments.record'))
  WITH CHECK (private.has_permission('finance.tax.manage') OR private.has_permission('finance.payments.record'));

CREATE POLICY payment_records_select ON public.payment_records FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.invoices.read', client_id) OR private.has_permission('finance.payments.record'));
CREATE POLICY payment_records_write ON public.payment_records FOR ALL TO authenticated
  USING (private.has_permission('finance.payments.record'))
  WITH CHECK (private.has_permission('finance.payments.record'));

CREATE POLICY credit_notes_select ON public.credit_notes FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.invoices.read', client_id) OR private.has_permission('finance.invoices.manage'));
CREATE POLICY credit_notes_write ON public.credit_notes FOR ALL TO authenticated
  USING (private.has_permission('finance.invoices.manage') OR private.has_permission('finance.invoices.issue'))
  WITH CHECK (private.has_permission('finance.invoices.manage') OR private.has_permission('finance.invoices.issue'));

CREATE POLICY refunds_select ON public.refunds FOR SELECT TO authenticated
  USING (private.has_permission_on_client('finance.invoices.read', client_id) OR private.has_permission('finance.payments.record'));
CREATE POLICY refunds_write ON public.refunds FOR ALL TO authenticated
  USING (private.has_permission('finance.payments.record') OR private.has_permission('finance.invoices.issue'))
  WITH CHECK (private.has_permission('finance.payments.record') OR private.has_permission('finance.invoices.issue'));

CREATE POLICY expenses_select ON public.expenses FOR SELECT TO authenticated
  USING (
    private.has_permission('finance.expenses.read')
    OR private.has_permission('finance.expenses.manage')
    OR (client_id IS NOT NULL AND private.has_permission_on_client('finance.expenses.read', client_id))
  );
CREATE POLICY expenses_write ON public.expenses FOR ALL TO authenticated
  USING (private.has_permission('finance.expenses.manage'))
  WITH CHECK (private.has_permission('finance.expenses.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.fx_rates, public.payment_records, public.credit_notes, public.refunds, public.expenses
TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.credit_number_seq TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_on date DEFAULT CURRENT_DATE,
  p_method text DEFAULT 'bank_transfer',
  p_notes text DEFAULT NULL
)
RETURNS public.payment_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_pay public.payment_records%ROWTYPE;
  v_paid numeric(18, 2);
  v_outstanding numeric(18, 2);
BEGIN
  IF NOT private.has_permission('finance.payments.record') THEN
    RAISE EXCEPTION 'Not authorised to record payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status NOT IN ('issued', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'Payments can only be recorded against issued invoices';
  END IF;

  INSERT INTO public.payment_records (
    client_id, invoice_id, amount, currency_code, paid_on, method, notes, created_by
  ) VALUES (
    v_inv.client_id, v_inv.id, p_amount, v_inv.currency_code, COALESCE(p_paid_on, CURRENT_DATE),
    COALESCE(p_method, 'bank_transfer'), p_notes, auth.uid()
  )
  RETURNING * INTO v_pay;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.payment_records
  WHERE invoice_id = v_inv.id AND status = 'recorded';

  v_outstanding := GREATEST(v_inv.total - v_paid - COALESCE(v_inv.amount_credited, 0), 0);

  UPDATE public.invoices
  SET amount_paid = v_paid,
      amount_outstanding = v_outstanding,
      status = CASE
        WHEN v_outstanding <= 0 THEN 'paid'
        WHEN v_paid > 0 THEN 'partially_paid'
        ELSE status
      END,
      updated_by = auth.uid()
  WHERE id = v_inv.id;

  RETURN v_pay;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, date, text, text) TO authenticated;

INSERT INTO public.fx_rates (base_currency, quote_currency, rate, as_of_date, source) VALUES
  ('GBP', 'GHS', 16.00000000, CURRENT_DATE, 'manual'),
  ('GBP', 'USD', 1.27000000, CURRENT_DATE, 'manual'),
  ('GBP', 'EUR', 1.17000000, CURRENT_DATE, 'manual')
ON CONFLICT (base_currency, quote_currency, as_of_date, source) DO NOTHING;
