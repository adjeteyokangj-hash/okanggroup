-- m59: Professional invoices — drafts, schedule lines, payments, credits, reminders, balances.
-- Preserves existing invoice/payment/credit rows. Does not alter frozen contract tables.
-- Production remains HOLD.

-- ---------------------------------------------------------------------------
-- 1) Schema extensions
-- ---------------------------------------------------------------------------
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'issued'::text,
    'partially_paid'::text,
    'paid'::text,
    'overdue'::text,
    'void'::text,
    'cancelled'::text,
    'credited'::text
  ]));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS schedule_key text,
  ADD COLUMN IF NOT EXISTS payment_instructions text,
  ADD COLUMN IF NOT EXISTS discount_total numeric(18, 2) NOT NULL DEFAULT 0
    CHECK (discount_total >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_contract_schedule_key_uidx
  ON public.invoices (contract_id, schedule_key)
  WHERE contract_id IS NOT NULL
    AND schedule_key IS NOT NULL
    AND status NOT IN ('void', 'cancelled');

ALTER TABLE public.payment_records DROP CONSTRAINT IF EXISTS payment_records_method_check;
ALTER TABLE public.payment_records
  ADD CONSTRAINT payment_records_method_check
  CHECK (method = ANY (ARRAY[
    'bank_transfer'::text,
    'cash'::text,
    'card'::text,
    'mobile_money'::text,
    'other'::text
  ]));

CREATE UNIQUE INDEX IF NOT EXISTS payment_records_invoice_provider_ref_uidx
  ON public.payment_records (invoice_id, provider_ref)
  WHERE invoice_id IS NOT NULL
    AND provider_ref IS NOT NULL
    AND btrim(provider_ref) <> ''
    AND status = 'recorded';

CREATE TABLE IF NOT EXISTS public.invoice_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL,
  reminder_type text NOT NULL
    CHECK (reminder_type IN ('due_soon', 'overdue', 'manual')),
  channel text NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('in_app')),
  dedupe_key text NOT NULL UNIQUE,
  message text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  UNIQUE (client_id, id),
  FOREIGN KEY (client_id, invoice_id) REFERENCES public.invoices (client_id, id) ON DELETE CASCADE
);

ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_reminders_select ON public.invoice_reminders;
CREATE POLICY invoice_reminders_select ON public.invoice_reminders
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('finance.invoices.read', client_id)
    OR private.has_permission('finance.invoices.manage')
  );

DROP POLICY IF EXISTS invoice_reminders_write ON public.invoice_reminders;
CREATE POLICY invoice_reminders_write ON public.invoice_reminders
  FOR ALL TO authenticated
  USING (
    private.has_permission('finance.invoices.manage')
    OR private.has_permission('finance.invoices.issue')
  )
  WITH CHECK (
    private.has_permission('finance.invoices.manage')
    OR private.has_permission('finance.invoices.issue')
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reminders TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Balance helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.refresh_invoice_balances(p_invoice_id uuid)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_paid numeric(18, 2);
  v_credited numeric(18, 2);
  v_outstanding numeric(18, 2);
  v_status text;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;

  IF v_inv.status IN ('draft', 'void', 'cancelled') THEN
    RETURN v_inv;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.payment_records
  WHERE invoice_id = v_inv.id AND status = 'recorded';

  SELECT COALESCE(SUM(amount), 0) INTO v_credited
  FROM public.credit_notes
  WHERE invoice_id = v_inv.id AND status IN ('issued', 'applied');

  v_outstanding := GREATEST(COALESCE(v_inv.total, 0) - v_paid - v_credited, 0);

  IF v_credited > 0 AND v_outstanding <= 0 AND v_paid <= 0 THEN
    v_status := 'credited';
  ELSIF v_outstanding <= 0 THEN
    v_status := 'paid';
  ELSIF v_paid > 0 OR v_credited > 0 THEN
    v_status := 'partially_paid';
  ELSIF v_inv.due_date IS NOT NULL AND v_inv.due_date < CURRENT_DATE THEN
    v_status := 'overdue';
  ELSE
    v_status := 'issued';
  END IF;

  UPDATE public.invoices
  SET amount_paid = v_paid,
      amount_credited = v_credited,
      amount_outstanding = v_outstanding,
      status = v_status,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE id = v_inv.id
  RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Save draft (multi-line, tax, discount) — server-authoritative totals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_invoice_draft(
  p_client_id uuid,
  p_currency text,
  p_lines jsonb,
  p_tax_mode text DEFAULT 'percent',
  p_tax_rate numeric DEFAULT 0,
  p_tax_fixed numeric DEFAULT 0,
  p_discount_total numeric DEFAULT 0,
  p_due_date date DEFAULT NULL,
  p_issue_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_instructions text DEFAULT NULL,
  p_contract_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_quotation_id uuid DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_line jsonb;
  v_subtotal numeric(18, 2) := 0;
  v_discount numeric(18, 2);
  v_taxable numeric(18, 2);
  v_tax numeric(18, 2) := 0;
  v_total numeric(18, 2);
  v_qty numeric(18, 4);
  v_unit numeric(18, 2);
  v_line_total numeric(18, 2);
  v_sort int := 0;
  v_mode text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.invoices.manage') THEN
    RAISE EXCEPTION 'finance.invoices.manage required';
  END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'client required'; END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 1 THEN
    RAISE EXCEPTION 'At least one invoice line is required';
  END IF;

  v_mode := CASE WHEN p_tax_mode IN ('percent', 'fixed', 'none') THEN p_tax_mode ELSE 'percent' END;
  v_discount := GREATEST(COALESCE(p_discount_total, 0), 0);

  IF p_invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
    IF v_inv.status <> 'draft' THEN
      RAISE EXCEPTION 'Only draft invoices can be edited (status=%)', v_inv.status;
    END IF;
    IF v_inv.client_id <> p_client_id THEN
      RAISE EXCEPTION 'Cannot change client on an existing draft';
    END IF;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := GREATEST(COALESCE((v_line->>'quantity')::numeric, 0), 0);
    v_unit := GREATEST(COALESCE((v_line->>'unit_amount')::numeric, 0), 0);
    v_line_total := round(v_qty * v_unit, 2);
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;
  v_subtotal := round(v_subtotal, 2);
  IF v_discount > v_subtotal THEN
    RAISE EXCEPTION 'Discount cannot exceed subtotal';
  END IF;
  v_taxable := round(v_subtotal - v_discount, 2);

  IF v_mode = 'fixed' THEN
    v_tax := GREATEST(COALESCE(p_tax_fixed, 0), 0);
  ELSIF v_mode = 'percent' THEN
    IF v_taxable > 0 AND COALESCE(p_tax_rate, 0) > 0 THEN
      v_tax := round(v_taxable * p_tax_rate / 100.0, 2);
    ELSE
      v_tax := 0;
    END IF;
  ELSE
    v_tax := 0;
  END IF;
  v_total := round(v_taxable + v_tax, 2);

  IF p_invoice_id IS NULL THEN
    INSERT INTO public.invoices (
      client_id, contract_id, project_id, quotation_id, status, currency_code,
      issue_date, due_date, subtotal, tax_total, discount_total, total,
      amount_paid, amount_credited, amount_outstanding,
      notes, payment_instructions, tax_snapshot_json, created_by, updated_by
    ) VALUES (
      p_client_id, p_contract_id, p_project_id, p_quotation_id, 'draft', upper(left(p_currency, 3)),
      p_issue_date, COALESCE(p_due_date, CURRENT_DATE + 14),
      v_subtotal, v_tax, v_discount, v_total,
      0, 0, v_total,
      p_notes, p_payment_instructions,
      jsonb_build_object(
        'tax_mode', v_mode,
        'tax_rate', COALESCE(p_tax_rate, 0),
        'tax_fixed', COALESCE(p_tax_fixed, 0),
        'discount_total', v_discount
      ),
      auth.uid(), auth.uid()
    )
    RETURNING * INTO v_inv;
  ELSE
    UPDATE public.invoices
    SET currency_code = upper(left(p_currency, 3)),
        contract_id = p_contract_id,
        project_id = p_project_id,
        quotation_id = p_quotation_id,
        issue_date = p_issue_date,
        due_date = COALESCE(p_due_date, due_date, CURRENT_DATE + 14),
        subtotal = v_subtotal,
        tax_total = v_tax,
        discount_total = v_discount,
        total = v_total,
        amount_outstanding = v_total,
        notes = p_notes,
        payment_instructions = p_payment_instructions,
        tax_snapshot_json = jsonb_build_object(
          'tax_mode', v_mode,
          'tax_rate', COALESCE(p_tax_rate, 0),
          'tax_fixed', COALESCE(p_tax_fixed, 0),
          'discount_total', v_discount
        ),
        updated_by = auth.uid(),
        updated_at = now()
    WHERE id = p_invoice_id
    RETURNING * INTO v_inv;

    DELETE FROM public.invoice_lines WHERE invoice_id = v_inv.id;
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := GREATEST(COALESCE((v_line->>'quantity')::numeric, 0), 0);
    v_unit := GREATEST(COALESCE((v_line->>'unit_amount')::numeric, 0), 0);
    v_line_total := round(v_qty * v_unit, 2);
    v_sort := v_sort + 1;
    INSERT INTO public.invoice_lines (
      client_id, invoice_id, description, quantity, unit_amount, line_total,
      tax_rate, tax_amount, sort_order
    ) VALUES (
      v_inv.client_id, v_inv.id,
      COALESCE(nullif(btrim(v_line->>'description'), ''), 'Services'),
      v_qty, v_unit, v_line_total,
      CASE WHEN v_mode = 'percent' THEN COALESCE(p_tax_rate, 0) ELSE 0 END,
      0,
      v_sort
    );
  END LOOP;

  RETURN v_inv;
END;
$$;

REVOKE ALL ON FUNCTION public.save_invoice_draft(
  uuid, text, jsonb, text, numeric, numeric, numeric, date, date, text, text, uuid, uuid, uuid, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_invoice_draft(
  uuid, text, jsonb, text, numeric, numeric, numeric, date, date, text, text, uuid, uuid, uuid, uuid
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Cancel invoice (issued financials preserved as cancelled/void)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_invoice_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_permission('finance.invoices.issue')
    OR private.has_permission('finance.invoices.manage')
  ) THEN
    RAISE EXCEPTION 'finance.invoices.issue or manage required';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status IN ('paid', 'credited') THEN
    RAISE EXCEPTION 'Cannot cancel a paid/credited invoice — issue a credit note instead';
  END IF;
  IF v_inv.status IN ('void', 'cancelled') THEN
    RETURN v_inv;
  END IF;
  IF COALESCE(v_inv.amount_paid, 0) > 0 THEN
    RAISE EXCEPTION 'Cannot cancel an invoice with recorded payments — credit remaining balance instead';
  END IF;

  UPDATE public.invoices
  SET status = 'cancelled',
      voided_at = now(),
      void_reason = nullif(btrim(COALESCE(p_reason, '')), ''),
      amount_outstanding = 0,
      updated_by = auth.uid(),
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING * INTO v_inv;

  RETURN v_inv;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invoice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Payments — mobile money + provider_ref duplicate guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_on date DEFAULT CURRENT_DATE,
  p_method text DEFAULT 'bank_transfer',
  p_notes text DEFAULT NULL,
  p_provider_ref text DEFAULT NULL
)
RETURNS public.payment_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_pay public.payment_records%ROWTYPE;
  v_outstanding numeric(18, 2);
  v_method text;
  v_ref text;
BEGIN
  IF NOT private.has_permission('finance.payments.record') THEN
    RAISE EXCEPTION 'Not authorised to record payments';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  v_method := COALESCE(nullif(btrim(p_method), ''), 'bank_transfer');
  IF v_method NOT IN ('bank_transfer', 'cash', 'card', 'mobile_money', 'other') THEN
    RAISE EXCEPTION 'Unsupported payment method: %', v_method;
  END IF;
  v_ref := nullif(btrim(COALESCE(p_provider_ref, '')), '');

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status NOT IN ('issued', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'Payments can only be recorded against issued invoices';
  END IF;

  IF v_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_records
    WHERE invoice_id = v_inv.id AND provider_ref = v_ref AND status = 'recorded'
  ) THEN
    RAISE EXCEPTION 'Duplicate payment reference for this invoice: %', v_ref;
  END IF;

  v_outstanding := GREATEST(
    COALESCE(v_inv.total, 0) - COALESCE(v_inv.amount_paid, 0) - COALESCE(v_inv.amount_credited, 0),
    0
  );
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds outstanding balance (%)', p_amount, v_outstanding;
  END IF;

  INSERT INTO public.payment_records (
    client_id, invoice_id, amount, currency_code, paid_on, method, provider_ref, notes, created_by
  ) VALUES (
    v_inv.client_id, v_inv.id, p_amount, v_inv.currency_code, COALESCE(p_paid_on, CURRENT_DATE),
    v_method, v_ref, p_notes, auth.uid()
  )
  RETURNING * INTO v_pay;

  PERFORM private.refresh_invoice_balances(v_inv.id);
  RETURN v_pay;
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, date, text, text, text) TO authenticated;

-- Keep 5-arg overload for existing callers
CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_paid_on date DEFAULT CURRENT_DATE,
  p_method text DEFAULT 'bank_transfer',
  p_notes text DEFAULT NULL
)
RETURNS public.payment_records
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT public.record_invoice_payment(p_invoice_id, p_amount, p_paid_on, p_method, p_notes, NULL::text);
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(uuid, numeric, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(uuid, numeric, date, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Credit notes — issue + apply in one authorised step
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_credit_note(
  p_invoice_id uuid,
  p_amount numeric,
  p_reason text
)
RETURNS public.credit_notes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_cn public.credit_notes%ROWTYPE;
  v_outstanding numeric(18, 2);
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_permission('finance.invoices.issue')
    OR private.has_permission('finance.invoices.manage')
  ) THEN
    RAISE EXCEPTION 'finance.invoices.issue or manage required to apply credits';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Credit reason is required';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status NOT IN ('issued', 'partially_paid', 'overdue', 'paid') THEN
    RAISE EXCEPTION 'Credits can only be applied to issued invoices';
  END IF;

  v_outstanding := GREATEST(
    COALESCE(v_inv.total, 0) - COALESCE(v_inv.amount_paid, 0) - COALESCE(v_inv.amount_credited, 0),
    0
  );
  -- Open invoices: credit ≤ outstanding. Paid invoices: credit ≤ total − already credited (correction).
  IF v_inv.status = 'paid' THEN
    IF p_amount > GREATEST(COALESCE(v_inv.total, 0) - COALESCE(v_inv.amount_credited, 0), 0) THEN
      RAISE EXCEPTION 'Credit amount exceeds invoice total available to credit';
    END IF;
  ELSIF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Credit amount (%) exceeds outstanding balance (%)', p_amount, v_outstanding;
  END IF;

  INSERT INTO public.credit_notes (
    client_id, invoice_id, amount, currency_code, reason, status,
    requested_by, approved_by, approved_at
  ) VALUES (
    v_inv.client_id, v_inv.id, p_amount, v_inv.currency_code, btrim(p_reason), 'applied',
    auth.uid(), NULL, now()
  )
  RETURNING * INTO v_cn;

  PERFORM private.refresh_invoice_balances(v_inv.id);
  RETURN v_cn;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_credit_note(uuid, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_note(uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7) Contract schedule → draft invoices with lines + proportional tax
--     Only accepted/active (never approved-only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoices_from_contract_schedule(p_contract_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_row public.contracts;
  v_item jsonb;
  v_created int := 0;
  v_skipped int := 0;
  v_percent numeric;
  v_label text;
  v_key text;
  v_base_sub numeric(18, 2);
  v_base_tax numeric(18, 2);
  v_base_total numeric(18, 2);
  v_alloc_sub numeric(18, 2) := 0;
  v_alloc_tax numeric(18, 2) := 0;
  v_line_sub numeric(18, 2);
  v_line_tax numeric(18, 2);
  v_line_total numeric(18, 2);
  v_items jsonb;
  v_count int;
  v_idx int := 0;
  v_inv_id uuid;
  v_desc text;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_permission('finance.contracts.manage')
    OR private.has_permission('finance.invoices.manage')
  ) THEN
    RAISE EXCEPTION 'finance.contracts.manage or finance.invoices.manage required';
  END IF;

  SELECT * INTO v_row FROM public.contracts WHERE id = p_contract_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Contract not found'; END IF;
  IF v_row.status NOT IN ('accepted', 'active') THEN
    RAISE EXCEPTION 'Invoices can only be generated from accepted/active contracts (not internal approval alone)';
  END IF;

  v_base_sub := COALESCE(v_row.subtotal, 0);
  v_base_tax := COALESCE(v_row.tax_total, 0);
  v_base_total := COALESCE(v_row.value_amount, v_base_sub + v_base_tax, 0);
  IF v_base_total <= 0 THEN RAISE EXCEPTION 'Contract has no value to invoice'; END IF;
  IF v_base_sub <= 0 AND v_base_total > 0 THEN
    v_base_sub := v_base_total - v_base_tax;
  END IF;

  IF jsonb_typeof(v_row.body_json->'payment_schedule') <> 'array' THEN
    RAISE EXCEPTION 'Contract has no payment schedule';
  END IF;

  v_items := v_row.body_json->'payment_schedule';
  v_count := jsonb_array_length(v_items);

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items)
  LOOP
    v_idx := v_idx + 1;
    v_percent := coalesce((v_item->>'percent')::numeric, 0);
    v_label := coalesce(nullif(btrim(v_item->>'label'), ''), 'Contract instalment');
    v_key := lower(regexp_replace(v_label, '[^a-zA-Z0-9]+', '-', 'g'));
    v_key := trim(both '-' from v_key);
    IF v_key = '' THEN v_key := 'instalment-' || v_idx::text; END IF;

    IF EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.contract_id = v_row.id
        AND i.schedule_key = v_key
        AND i.status NOT IN ('void', 'cancelled')
    ) OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.contract_id = v_row.id
        AND i.status NOT IN ('void', 'cancelled')
        AND i.notes ILIKE '%' || v_label || '%'
        AND i.schedule_key IS NULL
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    IF v_idx = v_count THEN
      v_line_sub := round(v_base_sub - v_alloc_sub, 2);
      v_line_tax := round(v_base_tax - v_alloc_tax, 2);
    ELSE
      v_line_sub := round(v_base_sub * v_percent / 100.0, 2);
      v_line_tax := round(v_base_tax * v_percent / 100.0, 2);
      v_alloc_sub := v_alloc_sub + v_line_sub;
      v_alloc_tax := v_alloc_tax + v_line_tax;
    END IF;
    v_line_total := round(v_line_sub + v_line_tax, 2);
    IF v_line_total <= 0 THEN CONTINUE; END IF;

    v_desc := v_label || ' — ' || coalesce(nullif(btrim(v_row.title), ''), v_row.contract_number);

    INSERT INTO public.invoices (
      client_id, contract_id, quotation_id, project_id, status, currency_code,
      issue_date, due_date, subtotal, tax_total, discount_total, total,
      amount_outstanding, notes, schedule_key, payment_instructions,
      tax_snapshot_json, created_by, updated_by
    ) VALUES (
      v_row.client_id, v_row.id, v_row.quotation_id, v_row.project_id, 'draft', v_row.currency_code,
      CURRENT_DATE, CURRENT_DATE + 14,
      v_line_sub, v_line_tax, 0, v_line_total,
      v_line_total,
      'Generated from contract ' || v_row.contract_number || ' · ' || v_label,
      v_key,
      'Payable per the accepted contract payment schedule.',
      jsonb_build_object(
        'tax_mode', 'fixed',
        'tax_fixed', v_line_tax,
        'from_contract', v_row.contract_number,
        'schedule_label', v_label,
        'schedule_percent', v_percent
      ),
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_inv_id;

    INSERT INTO public.invoice_lines (
      client_id, invoice_id, description, quantity, unit_amount, line_total,
      tax_rate, tax_amount, sort_order
    ) VALUES (
      v_row.client_id, v_inv_id, v_desc, 1, v_line_sub, v_line_sub,
      0, v_line_tax, 1
    );

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_created,
    'skipped', v_skipped,
    'contract_id', v_row.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoices_from_contract_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoices_from_contract_schedule(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8) Overdue refresh + Owner in-app reminders (no client email)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_overdue_invoices()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_permission('finance.invoices.manage')
    OR private.has_permission('finance.invoices.issue')
  ) THEN
    RAISE EXCEPTION 'finance.invoices.manage or issue required';
  END IF;

  UPDATE public.invoices
  SET status = 'overdue',
      updated_at = now()
  WHERE status IN ('issued', 'partially_paid')
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE
    AND amount_outstanding > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'marked_overdue', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_overdue_invoices() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_overdue_invoices() TO authenticated;

CREATE OR REPLACE FUNCTION public.queue_invoice_reminder(
  p_invoice_id uuid,
  p_reminder_type text DEFAULT 'overdue'
)
RETURNS public.invoice_reminders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_rem public.invoice_reminders%ROWTYPE;
  v_type text;
  v_key text;
  v_msg text;
  rid uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    private.has_permission('finance.invoices.manage')
    OR private.has_permission('finance.invoices.issue')
  ) THEN
    RAISE EXCEPTION 'finance.invoices.manage or issue required';
  END IF;

  v_type := CASE
    WHEN p_reminder_type IN ('due_soon', 'overdue', 'manual') THEN p_reminder_type
    ELSE 'manual'
  END;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status NOT IN ('issued', 'partially_paid', 'overdue') THEN
    RAISE EXCEPTION 'Reminders only apply to open invoices';
  END IF;

  -- Dedupe: one reminder of this type per invoice per calendar day
  v_key := v_inv.id::text || ':' || v_type || ':' || CURRENT_DATE::text;

  IF EXISTS (SELECT 1 FROM public.invoice_reminders WHERE dedupe_key = v_key) THEN
    RAISE EXCEPTION 'Reminder already queued for today (%)', v_type;
  END IF;

  v_msg := 'Invoice ' || COALESCE(v_inv.invoice_number, '') || ' · '
    || v_inv.currency_code || ' ' || v_inv.amount_outstanding::text
    || ' outstanding · due ' || COALESCE(v_inv.due_date::text, 'n/a');

  INSERT INTO public.invoice_reminders (
    client_id, invoice_id, reminder_type, channel, dedupe_key, message, created_by
  ) VALUES (
    v_inv.client_id, v_inv.id, v_type, 'in_app', v_key, v_msg, auth.uid()
  )
  RETURNING * INTO v_rem;

  -- Notify staff with finance.invoices.read (in-app only — never auto-email clients)
  FOR rid IN
    SELECT DISTINCT rg.profile_id
    FROM public.role_grants rg
    JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions perm ON perm.id = rp.permission_id AND perm.code = 'finance.invoices.read'
    JOIN public.profiles pr ON pr.id = rg.profile_id
    WHERE rg.status = 'active'
      AND (rg.ends_at IS NULL OR rg.ends_at > now())
      AND pr.account_status = 'active'
  LOOP
    PERFORM public.emit_notification(
      rid,
      'invoice_reminder',
      CASE v_type
        WHEN 'overdue' THEN 'Overdue invoice'
        WHEN 'due_soon' THEN 'Invoice due soon'
        ELSE 'Invoice reminder'
      END,
      v_msg,
      'invoice_reminder:' || v_key || ':' || rid::text,
      'warning',
      NULL,
      v_inv.client_id,
      NULL,
      v_inv.id,
      NULL,
      'invoice',
      v_inv.id,
      '/finance/invoices',
      '["in_app"]'::jsonb,
      auth.uid()
    );
  END LOOP;

  RETURN v_rem;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_invoice_reminder(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.queue_invoice_reminder(uuid, text) TO authenticated;
