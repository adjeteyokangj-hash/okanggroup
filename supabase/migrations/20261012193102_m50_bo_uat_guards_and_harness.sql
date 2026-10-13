-- M50: BO UAT defect fixes — payment overpay guard + mandatory handover before closure

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

  v_outstanding := GREATEST(
    COALESCE(v_inv.total, 0) - COALESCE(v_inv.amount_paid, 0) - COALESCE(v_inv.amount_credited, 0),
    0
  );
  IF p_amount > v_outstanding THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds outstanding balance (%)', p_amount, v_outstanding;
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

INSERT INTO public.settings (key, value_json) VALUES
  ('handover_required_items', '["credentials","documentation","training","signoff"]'::jsonb)
ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now();

CREATE OR REPLACE FUNCTION private.enforce_project_handover_before_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_required jsonb;
  v_item text;
  v_have jsonb;
BEGIN
  IF NEW.status = 'closed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'closed') THEN
    SELECT value_json INTO v_required
    FROM public.settings
    WHERE key = 'handover_required_items';
    v_required := COALESCE(v_required, '["credentials","documentation","training","signoff"]'::jsonb);
    v_have := COALESCE(NEW.handover_checklist_json, '[]'::jsonb);

    FOR v_item IN SELECT jsonb_array_elements_text(v_required)
    LOOP
      IF NOT (v_have ? v_item) THEN
        RAISE EXCEPTION
          'Project cannot be closed until mandatory handover item "%" is complete',
          v_item;
      END IF;
    END LOOP;

    NEW.closed_at := COALESCE(NEW.closed_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS projects_enforce_handover_close ON public.projects;
CREATE TRIGGER projects_enforce_handover_close
  BEFORE INSERT OR UPDATE OF status, handover_checklist_json, closed_at
  ON public.projects
  FOR EACH ROW EXECUTE FUNCTION private.enforce_project_handover_before_close();

-- Actor helper for SECURITY DEFINER RPC UAT (sets jwt claim for auth.uid())
CREATE OR REPLACE FUNCTION private.uat_set_actor(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION private.uat_set_actor(uuid) FROM PUBLIC;
