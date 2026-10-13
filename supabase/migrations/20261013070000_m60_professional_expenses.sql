-- m60: Professional expenses — categories, vendors, receipts, approval, recurring, audit.
-- Preserves existing expenses rows. Currency totals remain separate (no FX roll-up).
-- Production remains HOLD.

-- ---------------------------------------------------------------------------
-- 1) Categories (Owner-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.expense_categories (code, name, description, sort_order) VALUES
  ('general', 'General', 'Uncategorised business expense', 10),
  ('software', 'Software & subscriptions', 'SaaS, licences, tools', 20),
  ('hosting', 'Hosting & domains', 'Cloud hosting, domains, DNS', 30),
  ('travel', 'Travel', 'Travel and transport', 40),
  ('office', 'Office & equipment', 'Hardware, supplies, workspace', 50),
  ('marketing', 'Marketing', 'Advertising and promotion', 60),
  ('professional', 'Professional services', 'Legal, accounting, contractors', 70),
  ('utilities', 'Utilities', 'Phone, internet, power', 80)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2) Vendors / suppliers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  reference_code text,
  email text,
  phone text,
  notes text,
  default_currency char(3) NOT NULL DEFAULT 'GBP',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_vendors_name_uidx
  ON public.expense_vendors (lower(btrim(name)));

-- ---------------------------------------------------------------------------
-- 3) Expand expenses
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_status_check;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'submitted'::text,
    'approved'::text,
    'rejected'::text,
    'recorded'::text,
    'paid'::text,
    'reimbursed'::text,
    'cancelled'::text,
    'void'::text
  ]));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS reference_number text,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.expense_categories (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.expense_vendors (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS net_amount numeric(18, 2),
  ADD COLUMN IF NOT EXISTS tax_rate numeric(8, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY[
      'bank_transfer'::text, 'card'::text, 'cash'::text, 'mobile_money'::text, 'direct_debit'::text, 'other'::text
    ])),
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'partial'::text, 'paid'::text])),
  ADD COLUMN IF NOT EXISTS paid_on date,
  ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurring_schedule_id uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL;

-- Backfill net/tax from amount for legacy rows
UPDATE public.expenses
SET net_amount = COALESCE(net_amount, amount),
    tax_amount = COALESCE(tax_amount, 0)
WHERE net_amount IS NULL;

-- Link free-text category to seeded categories where possible
UPDATE public.expenses e
SET category_id = c.id
FROM public.expense_categories c
WHERE e.category_id IS NULL
  AND lower(btrim(e.category)) = lower(c.code);

UPDATE public.expenses e
SET category_id = c.id
FROM public.expense_categories c
WHERE e.category_id IS NULL
  AND lower(btrim(e.category)) = lower(c.name);

UPDATE public.expenses
SET category_id = (SELECT id FROM public.expense_categories WHERE code = 'general')
WHERE category_id IS NULL;

UPDATE public.expenses
SET title = COALESCE(nullif(btrim(title), ''), nullif(btrim(category), ''), 'Expense')
WHERE title IS NULL OR btrim(title) = '';

-- ---------------------------------------------------------------------------
-- 4) Recurring schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_recurring_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.expense_categories (id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.expense_vendors (id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients (id) ON DELETE SET NULL,
  project_id uuid,
  title text NOT NULL,
  description text,
  amount numeric(18, 2) NOT NULL CHECK (amount >= 0),
  currency_code char(3) NOT NULL DEFAULT 'GBP',
  tax_rate numeric(8, 4) NOT NULL DEFAULT 0,
  payment_method text,
  interval_unit text NOT NULL DEFAULT 'month'
    CHECK (interval_unit IN ('week', 'month', 'year')),
  interval_count int NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  next_due_on date NOT NULL,
  ends_on date,
  is_active boolean NOT NULL DEFAULT true,
  last_generated_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expense_recurring_project_tenant_fk') THEN
    ALTER TABLE public.expense_recurring_schedules
      ADD CONSTRAINT expense_recurring_project_tenant_fk
      FOREIGN KEY (client_id, project_id)
      REFERENCES public.projects (client_id, id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_recurring_schedule_fk') THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_recurring_schedule_fk
      FOREIGN KEY (recurring_schedule_id)
      REFERENCES public.expense_recurring_schedules (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5) Attachments (receipts)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses (id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL DEFAULT 'application/octet-stream',
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  storage_path text NOT NULL UNIQUE,
  uploaded_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_attachments_expense_idx ON public.expense_attachments (expense_id);

-- ---------------------------------------------------------------------------
-- 6) Audit events
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expense_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.expenses (id) ON DELETE CASCADE,
  event_type text NOT NULL,
  detail_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_events_expense_idx ON public.expense_events (expense_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 7) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_vendors FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_recurring_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_recurring_schedules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.expense_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expense_categories_select ON public.expense_categories;
CREATE POLICY expense_categories_select ON public.expense_categories
  FOR SELECT TO authenticated
  USING (
    private.has_permission('finance.expenses.read')
    OR private.has_permission('finance.expenses.manage')
  );
DROP POLICY IF EXISTS expense_categories_write ON public.expense_categories;
CREATE POLICY expense_categories_write ON public.expense_categories
  FOR ALL TO authenticated
  USING (private.has_permission('finance.expenses.manage'))
  WITH CHECK (private.has_permission('finance.expenses.manage'));

DROP POLICY IF EXISTS expense_vendors_select ON public.expense_vendors;
CREATE POLICY expense_vendors_select ON public.expense_vendors
  FOR SELECT TO authenticated
  USING (
    private.has_permission('finance.expenses.read')
    OR private.has_permission('finance.expenses.manage')
  );
DROP POLICY IF EXISTS expense_vendors_write ON public.expense_vendors;
CREATE POLICY expense_vendors_write ON public.expense_vendors
  FOR ALL TO authenticated
  USING (private.has_permission('finance.expenses.manage'))
  WITH CHECK (private.has_permission('finance.expenses.manage'));

DROP POLICY IF EXISTS expense_recurring_select ON public.expense_recurring_schedules;
CREATE POLICY expense_recurring_select ON public.expense_recurring_schedules
  FOR SELECT TO authenticated
  USING (
    private.has_permission('finance.expenses.read')
    OR private.has_permission('finance.expenses.manage')
  );
DROP POLICY IF EXISTS expense_recurring_write ON public.expense_recurring_schedules;
CREATE POLICY expense_recurring_write ON public.expense_recurring_schedules
  FOR ALL TO authenticated
  USING (private.has_permission('finance.expenses.manage'))
  WITH CHECK (private.has_permission('finance.expenses.manage'));

DROP POLICY IF EXISTS expense_attachments_select ON public.expense_attachments;
CREATE POLICY expense_attachments_select ON public.expense_attachments
  FOR SELECT TO authenticated
  USING (
    private.has_permission('finance.expenses.read')
    OR private.has_permission('finance.expenses.manage')
  );
DROP POLICY IF EXISTS expense_attachments_write ON public.expense_attachments;
CREATE POLICY expense_attachments_write ON public.expense_attachments
  FOR ALL TO authenticated
  USING (private.has_permission('finance.expenses.manage'))
  WITH CHECK (private.has_permission('finance.expenses.manage'));

DROP POLICY IF EXISTS expense_events_select ON public.expense_events;
CREATE POLICY expense_events_select ON public.expense_events
  FOR SELECT TO authenticated
  USING (
    private.has_permission('finance.expenses.read')
    OR private.has_permission('finance.expenses.manage')
  );
DROP POLICY IF EXISTS expense_events_insert ON public.expense_events;
CREATE POLICY expense_events_insert ON public.expense_events
  FOR INSERT TO authenticated
  WITH CHECK (private.has_permission('finance.expenses.manage'));

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.expense_categories,
  public.expense_vendors,
  public.expense_recurring_schedules,
  public.expense_attachments
TO authenticated;
GRANT SELECT, INSERT ON public.expense_events TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Storage bucket for receipts
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  26214400,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = false;

-- Path: {expense_id}/{uuid_filename}
DROP POLICY IF EXISTS expense_receipts_select ON storage.objects;
CREATE POLICY expense_receipts_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND (
      private.has_permission('finance.expenses.read')
      OR private.has_permission('finance.expenses.manage')
    )
  );

DROP POLICY IF EXISTS expense_receipts_insert ON storage.objects;
CREATE POLICY expense_receipts_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts'
    AND private.has_permission('finance.expenses.manage')
  );

DROP POLICY IF EXISTS expense_receipts_update ON storage.objects;
CREATE POLICY expense_receipts_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND private.has_permission('finance.expenses.manage')
  );

DROP POLICY IF EXISTS expense_receipts_delete ON storage.objects;
CREATE POLICY expense_receipts_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-receipts'
    AND private.has_permission('finance.expenses.manage')
  );

-- ---------------------------------------------------------------------------
-- 9) Helpers + RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.log_expense_event(
  p_expense_id uuid,
  p_event_type text,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  INSERT INTO public.expense_events (expense_id, event_type, detail_json, actor_id)
  VALUES (p_expense_id, p_event_type, COALESCE(p_detail, '{}'::jsonb), auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.save_expense(
  p_title text,
  p_amount numeric,
  p_currency text,
  p_category_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_vendor_name text DEFAULT NULL,
  p_spent_on date DEFAULT CURRENT_DATE,
  p_description text DEFAULT NULL,
  p_reference_number text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_tax_rate numeric DEFAULT 0,
  p_payment_method text DEFAULT NULL,
  p_payment_status text DEFAULT 'unpaid',
  p_notes text DEFAULT NULL,
  p_expense_id uuid DEFAULT NULL,
  p_submit boolean DEFAULT false
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.expenses%ROWTYPE;
  v_cat public.expense_categories%ROWTYPE;
  v_net numeric(18, 2);
  v_tax numeric(18, 2);
  v_total numeric(18, 2);
  v_rate numeric(8, 4);
  v_status text;
  v_vendor_name text;
  v_category_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.expenses.manage') THEN
    RAISE EXCEPTION 'finance.expenses.manage required';
  END IF;
  IF btrim(COALESCE(p_title, '')) = '' THEN RAISE EXCEPTION 'Title is required'; END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Amount must be >= 0'; END IF;

  v_rate := GREATEST(COALESCE(p_tax_rate, 0), 0);
  -- p_amount is treated as net (ex-tax); tax added on top
  v_net := round(p_amount, 2);
  v_tax := CASE WHEN v_rate > 0 THEN round(v_net * v_rate / 100.0, 2) ELSE 0 END;
  v_total := round(v_net + v_tax, 2);

  IF p_category_id IS NOT NULL THEN
    SELECT * INTO v_cat FROM public.expense_categories WHERE id = p_category_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Category not found'; END IF;
    v_category_code := v_cat.code;
  ELSE
    SELECT * INTO v_cat FROM public.expense_categories WHERE code = 'general';
    v_category_code := COALESCE(v_cat.code, 'general');
    p_category_id := v_cat.id;
  END IF;

  IF p_vendor_id IS NOT NULL THEN
    SELECT name INTO v_vendor_name FROM public.expense_vendors WHERE id = p_vendor_id;
  ELSE
    v_vendor_name := nullif(btrim(COALESCE(p_vendor_name, '')), '');
  END IF;

  v_status := CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END;

  IF p_expense_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
    IF v_row.status NOT IN ('draft', 'rejected', 'recorded') THEN
      RAISE EXCEPTION 'Only draft/rejected/recorded expenses can be edited (status=%)', v_row.status;
    END IF;

    UPDATE public.expenses SET
      title = btrim(p_title),
      description = nullif(btrim(COALESCE(p_description, '')), ''),
      reference_number = nullif(btrim(COALESCE(p_reference_number, '')), ''),
      category = v_category_code,
      category_id = p_category_id,
      vendor_id = p_vendor_id,
      vendor_name = v_vendor_name,
      amount = v_total,
      net_amount = v_net,
      tax_rate = v_rate,
      tax_amount = v_tax,
      currency_code = upper(left(p_currency, 3)),
      spent_on = COALESCE(p_spent_on, spent_on, CURRENT_DATE),
      client_id = p_client_id,
      project_id = p_project_id,
      payment_method = nullif(btrim(COALESCE(p_payment_method, '')), ''),
      payment_status = COALESCE(nullif(btrim(COALESCE(p_payment_status, '')), ''), payment_status, 'unpaid'),
      notes = nullif(btrim(COALESCE(p_notes, '')), ''),
      status = CASE WHEN p_submit THEN 'submitted' ELSE status END,
      submitted_at = CASE WHEN p_submit THEN now() ELSE submitted_at END,
      submitted_by = CASE WHEN p_submit THEN auth.uid() ELSE submitted_by END,
      updated_by = auth.uid(),
      updated_at = now()
    WHERE id = p_expense_id
    RETURNING * INTO v_row;

    PERFORM private.log_expense_event(v_row.id, CASE WHEN p_submit THEN 'submitted' ELSE 'updated' END,
      jsonb_build_object('amount', v_total, 'currency', v_row.currency_code));
  ELSE
    INSERT INTO public.expenses (
      title, description, reference_number, category, category_id, vendor_id, vendor_name,
      amount, net_amount, tax_rate, tax_amount, currency_code, spent_on,
      client_id, project_id, payment_method, payment_status, notes, status,
      submitted_at, submitted_by, created_by, updated_by
    ) VALUES (
      btrim(p_title),
      nullif(btrim(COALESCE(p_description, '')), ''),
      nullif(btrim(COALESCE(p_reference_number, '')), ''),
      v_category_code, p_category_id, p_vendor_id, v_vendor_name,
      v_total, v_net, v_rate, v_tax, upper(left(p_currency, 3)), COALESCE(p_spent_on, CURRENT_DATE),
      p_client_id, p_project_id,
      nullif(btrim(COALESCE(p_payment_method, '')), ''),
      COALESCE(nullif(btrim(COALESCE(p_payment_status, '')), ''), 'unpaid'),
      nullif(btrim(COALESCE(p_notes, '')), ''),
      v_status,
      CASE WHEN p_submit THEN now() ELSE NULL END,
      CASE WHEN p_submit THEN auth.uid() ELSE NULL END,
      auth.uid(), auth.uid()
    )
    RETURNING * INTO v_row;

    PERFORM private.log_expense_event(v_row.id, CASE WHEN p_submit THEN 'submitted' ELSE 'created' END,
      jsonb_build_object('amount', v_total, 'currency', v_row.currency_code));
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_expense(
  text, numeric, text, uuid, uuid, text, date, text, text, uuid, uuid, numeric, text, text, text, uuid, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_expense(
  text, numeric, text, uuid, uuid, text, date, text, text, uuid, uuid, numeric, text, text, text, uuid, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_expense_status(
  p_expense_id uuid,
  p_to_status text,
  p_reason text DEFAULT NULL
)
RETURNS public.expenses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.expenses%ROWTYPE;
  v_from text;
  v_ok boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.expenses.manage') THEN
    RAISE EXCEPTION 'finance.expenses.manage required';
  END IF;

  SELECT * INTO v_row FROM public.expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expense not found'; END IF;
  v_from := v_row.status;

  v_ok :=
    (v_from = 'draft' AND p_to_status IN ('submitted', 'recorded', 'cancelled'))
    OR (v_from = 'submitted' AND p_to_status IN ('approved', 'rejected', 'cancelled'))
    OR (v_from = 'approved' AND p_to_status IN ('paid', 'reimbursed', 'cancelled'))
    OR (v_from = 'recorded' AND p_to_status IN ('paid', 'reimbursed', 'cancelled', 'void'))
    OR (v_from = 'rejected' AND p_to_status IN ('draft', 'cancelled'))
    OR (v_from = 'paid' AND p_to_status IN ('reimbursed'))
    OR (v_from IN ('draft', 'submitted', 'approved', 'recorded') AND p_to_status = 'void');

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Invalid expense transition % → %', v_from, p_to_status;
  END IF;

  UPDATE public.expenses SET
    status = p_to_status,
    approved_at = CASE WHEN p_to_status = 'approved' THEN now() ELSE approved_at END,
    approved_by = CASE WHEN p_to_status = 'approved' THEN auth.uid() ELSE approved_by END,
    rejection_reason = CASE WHEN p_to_status = 'rejected' THEN nullif(btrim(COALESCE(p_reason, '')), '') ELSE rejection_reason END,
    cancelled_at = CASE WHEN p_to_status IN ('cancelled', 'void') THEN now() ELSE cancelled_at END,
    cancel_reason = CASE WHEN p_to_status IN ('cancelled', 'void') THEN nullif(btrim(COALESCE(p_reason, '')), '') ELSE cancel_reason END,
    payment_status = CASE
      WHEN p_to_status IN ('paid', 'reimbursed') THEN 'paid'
      ELSE payment_status
    END,
    paid_on = CASE
      WHEN p_to_status IN ('paid', 'reimbursed') THEN COALESCE(paid_on, CURRENT_DATE)
      ELSE paid_on
    END,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_expense_id
  RETURNING * INTO v_row;

  PERFORM private.log_expense_event(
    v_row.id,
    'status_' || p_to_status,
    jsonb_build_object('from', v_from, 'to', p_to_status, 'reason', p_reason)
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_expense_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_expense_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_expense_vendor(
  p_name text,
  p_reference_code text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_default_currency text DEFAULT 'GBP',
  p_vendor_id uuid DEFAULT NULL
)
RETURNS public.expense_vendors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.expense_vendors%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.expenses.manage') THEN
    RAISE EXCEPTION 'finance.expenses.manage required';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' THEN RAISE EXCEPTION 'Vendor name is required'; END IF;

  IF p_vendor_id IS NULL THEN
    INSERT INTO public.expense_vendors (
      name, reference_code, email, phone, notes, default_currency, created_by
    ) VALUES (
      btrim(p_name),
      nullif(btrim(COALESCE(p_reference_code, '')), ''),
      nullif(btrim(COALESCE(p_email, '')), ''),
      nullif(btrim(COALESCE(p_phone, '')), ''),
      nullif(btrim(COALESCE(p_notes, '')), ''),
      upper(left(COALESCE(p_default_currency, 'GBP'), 3)),
      auth.uid()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.expense_vendors SET
      name = btrim(p_name),
      reference_code = nullif(btrim(COALESCE(p_reference_code, '')), ''),
      email = nullif(btrim(COALESCE(p_email, '')), ''),
      phone = nullif(btrim(COALESCE(p_phone, '')), ''),
      notes = nullif(btrim(COALESCE(p_notes, '')), ''),
      default_currency = upper(left(COALESCE(p_default_currency, default_currency), 3)),
      updated_at = now()
    WHERE id = p_vendor_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vendor not found'; END IF;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_expense_vendor(text, text, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_expense_vendor(text, text, text, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_expense_category(
  p_code text,
  p_name text,
  p_description text DEFAULT NULL,
  p_sort_order int DEFAULT 100,
  p_category_id uuid DEFAULT NULL
)
RETURNS public.expense_categories
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.expense_categories%ROWTYPE;
  v_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.expenses.manage') THEN
    RAISE EXCEPTION 'finance.expenses.manage required';
  END IF;
  v_code := lower(regexp_replace(btrim(COALESCE(p_code, p_name, '')), '[^a-z0-9]+', '_', 'g'));
  v_code := trim(both '_' from v_code);
  IF v_code = '' OR btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'Category code and name are required';
  END IF;

  IF p_category_id IS NULL THEN
    INSERT INTO public.expense_categories (code, name, description, sort_order)
    VALUES (v_code, btrim(p_name), nullif(btrim(COALESCE(p_description, '')), ''), COALESCE(p_sort_order, 100))
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.expense_categories SET
      code = v_code,
      name = btrim(p_name),
      description = nullif(btrim(COALESCE(p_description, '')), ''),
      sort_order = COALESCE(p_sort_order, sort_order),
      updated_at = now()
    WHERE id = p_category_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Category not found'; END IF;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_expense_category(text, text, text, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_expense_category(text, text, text, int, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_recurring_expense(
  p_name text,
  p_title text,
  p_amount numeric,
  p_currency text,
  p_next_due_on date,
  p_interval_unit text DEFAULT 'month',
  p_interval_count int DEFAULT 1,
  p_category_id uuid DEFAULT NULL,
  p_vendor_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_tax_rate numeric DEFAULT 0,
  p_payment_method text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_ends_on date DEFAULT NULL,
  p_schedule_id uuid DEFAULT NULL
)
RETURNS public.expense_recurring_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.expense_recurring_schedules%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.expenses.manage') THEN
    RAISE EXCEPTION 'finance.expenses.manage required';
  END IF;
  IF btrim(COALESCE(p_name, '')) = '' OR btrim(COALESCE(p_title, '')) = '' THEN
    RAISE EXCEPTION 'Schedule name and expense title are required';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN RAISE EXCEPTION 'Amount must be >= 0'; END IF;
  IF p_interval_unit NOT IN ('week', 'month', 'year') THEN
    RAISE EXCEPTION 'interval_unit must be week, month or year';
  END IF;

  IF p_schedule_id IS NULL THEN
    INSERT INTO public.expense_recurring_schedules (
      name, title, description, amount, currency_code, tax_rate, payment_method,
      category_id, vendor_id, client_id, project_id,
      interval_unit, interval_count, next_due_on, ends_on, created_by
    ) VALUES (
      btrim(p_name), btrim(p_title), nullif(btrim(COALESCE(p_description, '')), ''),
      round(p_amount, 2), upper(left(p_currency, 3)), GREATEST(COALESCE(p_tax_rate, 0), 0),
      nullif(btrim(COALESCE(p_payment_method, '')), ''),
      p_category_id, p_vendor_id, p_client_id, p_project_id,
      p_interval_unit, GREATEST(COALESCE(p_interval_count, 1), 1),
      p_next_due_on, p_ends_on, auth.uid()
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.expense_recurring_schedules SET
      name = btrim(p_name),
      title = btrim(p_title),
      description = nullif(btrim(COALESCE(p_description, '')), ''),
      amount = round(p_amount, 2),
      currency_code = upper(left(p_currency, 3)),
      tax_rate = GREATEST(COALESCE(p_tax_rate, 0), 0),
      payment_method = nullif(btrim(COALESCE(p_payment_method, '')), ''),
      category_id = p_category_id,
      vendor_id = p_vendor_id,
      client_id = p_client_id,
      project_id = p_project_id,
      interval_unit = p_interval_unit,
      interval_count = GREATEST(COALESCE(p_interval_count, 1), 1),
      next_due_on = p_next_due_on,
      ends_on = p_ends_on,
      updated_at = now()
    WHERE id = p_schedule_id
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RAISE EXCEPTION 'Recurring schedule not found'; END IF;
  END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_recurring_expense(
  text, text, numeric, text, date, text, int, uuid, uuid, uuid, uuid, numeric, text, text, date, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_recurring_expense(
  text, text, numeric, text, date, text, int, uuid, uuid, uuid, uuid, numeric, text, text, date, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_due_recurring_expenses(p_as_of date DEFAULT CURRENT_DATE)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_sched public.expense_recurring_schedules%ROWTYPE;
  v_created int := 0;
  v_expense_id uuid;
  v_net numeric(18, 2);
  v_tax numeric(18, 2);
  v_total numeric(18, 2);
  v_cat_code text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.expenses.manage') THEN
    RAISE EXCEPTION 'finance.expenses.manage required';
  END IF;

  FOR v_sched IN
    SELECT * FROM public.expense_recurring_schedules
    WHERE is_active
      AND next_due_on <= p_as_of
      AND (ends_on IS NULL OR next_due_on <= ends_on)
  LOOP
    v_net := round(v_sched.amount, 2);
    v_tax := CASE WHEN v_sched.tax_rate > 0 THEN round(v_net * v_sched.tax_rate / 100.0, 2) ELSE 0 END;
    v_total := round(v_net + v_tax, 2);
    SELECT code INTO v_cat_code FROM public.expense_categories WHERE id = v_sched.category_id;

    INSERT INTO public.expenses (
      title, description, category, category_id, vendor_id,
      amount, net_amount, tax_rate, tax_amount, currency_code, spent_on,
      client_id, project_id, payment_method, payment_status, status,
      is_recurring, recurring_schedule_id, created_by, updated_by
    ) VALUES (
      v_sched.title, v_sched.description,
      COALESCE(v_cat_code, 'general'), v_sched.category_id, v_sched.vendor_id,
      v_total, v_net, v_sched.tax_rate, v_tax, v_sched.currency_code, v_sched.next_due_on,
      v_sched.client_id, v_sched.project_id, v_sched.payment_method, 'unpaid', 'draft',
      true, v_sched.id, auth.uid(), auth.uid()
    )
    RETURNING id INTO v_expense_id;

    PERFORM private.log_expense_event(v_expense_id, 'generated_from_recurring',
      jsonb_build_object('schedule_id', v_sched.id));

    UPDATE public.expense_recurring_schedules SET
      last_generated_on = v_sched.next_due_on,
      next_due_on = CASE v_sched.interval_unit
        WHEN 'week' THEN v_sched.next_due_on + (v_sched.interval_count * 7)
        WHEN 'year' THEN (v_sched.next_due_on + (v_sched.interval_count || ' years')::interval)::date
        ELSE (v_sched.next_due_on + (v_sched.interval_count || ' months')::interval)::date
      END,
      updated_at = now()
    WHERE id = v_sched.id;

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created, 'as_of', p_as_of);
END;
$$;

REVOKE ALL ON FUNCTION public.generate_due_recurring_expenses(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_due_recurring_expenses(date) TO authenticated;
