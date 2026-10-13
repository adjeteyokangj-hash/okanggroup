-- M57: Server-side quotation line totals for the professional quote builder.
-- Preserves existing quotations rows and contractual relationships.

CREATE OR REPLACE FUNCTION public.save_quotation_draft(
  p_client_id uuid,
  p_currency text,
  p_lines jsonb,
  p_tax_rate numeric DEFAULT 0,
  p_discount_amount numeric DEFAULT 0,
  p_valid_until date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_payment_terms text DEFAULT NULL,
  p_quotation_id uuid DEFAULT NULL
)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_subtotal numeric(18, 2) := 0;
  v_tax numeric(18, 2) := 0;
  v_discount numeric(18, 2) := greatest(coalesce(p_discount_amount, 0), 0);
  v_total numeric(18, 2) := 0;
  v_line jsonb;
  v_qty numeric;
  v_unit numeric;
  v_line_total numeric;
  v_norm jsonb := '[]'::jsonb;
  v_row public.quotations;
  v_idx int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT (
    private.has_permission('finance.quotes.manage')
  ) THEN
    RAISE EXCEPTION 'finance.quotes.manage required';
  END IF;
  IF p_client_id IS NULL THEN
    RAISE EXCEPTION 'Client is required';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_idx := v_idx + 1;
    v_qty := greatest(coalesce((v_line->>'quantity')::numeric, 1), 0);
    v_unit := coalesce((v_line->>'unit_amount')::numeric, 0);
    v_line_total := round(v_qty * v_unit, 2);
    v_subtotal := v_subtotal + v_line_total;
    v_norm := v_norm || jsonb_build_array(
      jsonb_build_object(
        'description', coalesce(nullif(btrim(v_line->>'description'), ''), 'Services'),
        'quantity', v_qty,
        'unit_amount', v_unit,
        'line_total', v_line_total,
        'optional', coalesce((v_line->>'optional')::boolean, false)
      )
    );
  END LOOP;

  v_subtotal := round(v_subtotal, 2);
  v_discount := least(v_discount, v_subtotal);
  v_tax := round((v_subtotal - v_discount) * greatest(coalesce(p_tax_rate, 0), 0) / 100.0, 2);
  v_total := round(v_subtotal - v_discount + v_tax, 2);

  IF p_quotation_id IS NOT NULL THEN
    UPDATE public.quotations q
    SET
      currency_code = upper(p_currency),
      subtotal = v_subtotal,
      tax_total = v_tax,
      total = v_total,
      lines_json = v_norm,
      valid_until = p_valid_until,
      notes = nullif(
        concat_ws(
          E'\n---\n',
          nullif(btrim(coalesce(p_notes, '')), ''),
          CASE
            WHEN nullif(btrim(coalesce(p_payment_terms, '')), '') IS NULL THEN NULL
            ELSE 'Payment terms: ' || btrim(p_payment_terms)
          END,
          CASE
            WHEN v_discount > 0 THEN 'Discount: ' || v_discount::text
            ELSE NULL
          END,
          CASE
            WHEN coalesce(p_tax_rate, 0) > 0 THEN 'Tax rate: ' || p_tax_rate::text || '%'
            ELSE NULL
          END
        ),
        ''
      ),
      updated_by = v_uid,
      updated_at = now()
    WHERE q.id = p_quotation_id
      AND q.client_id = p_client_id
      AND q.status = 'draft'
    RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'Draft quotation not found or not editable';
    END IF;
  ELSE
    INSERT INTO public.quotations (
      client_id, currency_code, status, subtotal, tax_total, total,
      lines_json, valid_until, notes, created_by, updated_by
    ) VALUES (
      p_client_id,
      upper(p_currency),
      'draft',
      v_subtotal,
      v_tax,
      v_total,
      v_norm,
      p_valid_until,
      nullif(
        concat_ws(
          E'\n---\n',
          nullif(btrim(coalesce(p_notes, '')), ''),
          CASE
            WHEN nullif(btrim(coalesce(p_payment_terms, '')), '') IS NULL THEN NULL
            ELSE 'Payment terms: ' || btrim(p_payment_terms)
          END,
          CASE WHEN v_discount > 0 THEN 'Discount: ' || v_discount::text ELSE NULL END,
          CASE
            WHEN coalesce(p_tax_rate, 0) > 0 THEN 'Tax rate: ' || p_tax_rate::text || '%'
            ELSE NULL
          END
        ),
        ''
      ),
      v_uid,
      v_uid
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_quotation_draft(uuid, text, jsonb, numeric, numeric, date, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quotation_draft(uuid, text, jsonb, numeric, numeric, date, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revise_quotation(p_quotation_id uuid)
RETURNS public.quotations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_src public.quotations;
  v_new public.quotations;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('finance.quotes.manage') THEN
    RAISE EXCEPTION 'finance.quotes.manage required';
  END IF;
  SELECT * INTO v_src FROM public.quotations WHERE id = p_quotation_id;
  IF v_src.id IS NULL THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;
  IF v_src.status NOT IN ('accepted', 'sent', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Only sent/accepted/rejected/expired quotations can be revised';
  END IF;

  INSERT INTO public.quotations (
    client_id, project_id, currency_code, status, subtotal, tax_total, total,
    lines_json, valid_until, notes, tax_profile_id, created_by, updated_by
  ) VALUES (
    v_src.client_id, v_src.project_id, v_src.currency_code, 'draft',
    v_src.subtotal, v_src.tax_total, v_src.total, v_src.lines_json,
    v_src.valid_until,
    concat_ws(E'\n', 'Revision of ' || v_src.quote_number, v_src.notes),
    v_src.tax_profile_id, auth.uid(), auth.uid()
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.revise_quotation(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revise_quotation(uuid) TO authenticated;
