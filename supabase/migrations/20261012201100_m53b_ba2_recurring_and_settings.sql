-- M53b: recurring billing + automation settings RPCs

CREATE OR REPLACE FUNCTION private.generate_recurring_invoices(p_as_of date DEFAULT CURRENT_DATE)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  s public.recurring_billing_schedules%ROWTYPE;
  v_period text;
  v_inv uuid;
  v_total numeric(18, 2);
  v_count int := 0;
  v_next date;
  rid uuid;
BEGIN
  FOR s IN
    SELECT * FROM public.recurring_billing_schedules
    WHERE active AND next_run_on <= p_as_of
    FOR UPDATE SKIP LOCKED
  LOOP
    v_period := s.cadence || ':' || to_char(s.next_run_on, 'YYYY-MM-DD');
    IF EXISTS (
      SELECT 1 FROM public.recurring_billing_runs
      WHERE schedule_id = s.id AND period_key = v_period
    ) THEN
      CONTINUE;
    END IF;

    v_total := COALESCE(s.subtotal, 0) + COALESCE(s.tax_total, 0);
    INSERT INTO public.invoices (
      client_id, status, currency_code, subtotal, tax_total, total,
      amount_outstanding, created_by, tax_snapshot_json
    ) VALUES (
      s.client_id, 'draft', s.currency_code, s.subtotal, s.tax_total, v_total,
      v_total, s.created_by, '{}'::jsonb
    )
    RETURNING id INTO v_inv;

    INSERT INTO public.recurring_billing_runs (schedule_id, period_key, invoice_id)
    VALUES (s.id, v_period, v_inv);

    v_next := CASE s.cadence
      WHEN 'monthly' THEN (s.next_run_on + INTERVAL '1 month')::date
      WHEN 'quarterly' THEN (s.next_run_on + INTERVAL '3 months')::date
      WHEN 'yearly' THEN (s.next_run_on + INTERVAL '1 year')::date
    END;

    UPDATE public.recurring_billing_schedules
    SET next_run_on = v_next, last_invoice_id = v_inv, updated_at = now()
    WHERE id = s.id;

    FOR rid IN SELECT profile_id FROM private.profiles_with_permission('finance.invoices.manage')
    LOOP
      PERFORM public.emit_notification(
        rid, 'recurring_invoice_created',
        'Recurring invoice draft created',
        left(s.title || ' (' || s.currency_code || ' ' || v_total::text || ')', 500),
        'recur:' || s.id::text || ':' || v_period || ':' || rid::text,
        'info', 'recurring_billing', s.client_id, NULL, v_inv, NULL,
        'invoice', v_inv, '/finance/invoices', '["in_app"]'::jsonb, NULL
      );
    END LOOP;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_automation_rule_enabled(p_code text, p_enabled boolean)
RETURNS public.automation_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.automation_rules%ROWTYPE;
BEGIN
  IF NOT private.has_permission('automation.manage') THEN
    RAISE EXCEPTION 'Not authorised to manage automation';
  END IF;
  UPDATE public.automation_rules
  SET enabled = p_enabled, updated_at = now()
  WHERE code = p_code
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found'; END IF;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_automation_rule_enabled(text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_automation_rule_enabled(text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_automation_settings(
  p_email_enabled boolean DEFAULT NULL,
  p_automation_enabled boolean DEFAULT NULL,
  p_budget_warning_pct numeric DEFAULT NULL,
  p_task_due_soon_days int DEFAULT NULL,
  p_invoice_due_soon_days int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NOT private.has_permission('automation.manage') THEN
    RAISE EXCEPTION 'Not authorised to manage automation settings';
  END IF;
  IF p_email_enabled IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('email_delivery_enabled', to_jsonb(p_email_enabled))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now();
  END IF;
  IF p_automation_enabled IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('automation_enabled', to_jsonb(p_automation_enabled))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now();
  END IF;
  IF p_budget_warning_pct IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('budget_warning_pct', to_jsonb(p_budget_warning_pct))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now();
  END IF;
  IF p_task_due_soon_days IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('task_due_soon_days', to_jsonb(p_task_due_soon_days))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now();
  END IF;
  IF p_invoice_due_soon_days IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('invoice_due_soon_days', to_jsonb(p_invoice_due_soon_days))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now();
  END IF;
  RETURN jsonb_build_object(
    'email_delivery_enabled', private.setting_bool('email_delivery_enabled', false),
    'automation_enabled', private.setting_bool('automation_enabled', true),
    'budget_warning_pct', private.setting_num('budget_warning_pct', 80),
    'task_due_soon_days', private.setting_num('task_due_soon_days', 3),
    'invoice_due_soon_days', private.setting_num('invoice_due_soon_days', 7)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_automation_settings(boolean, boolean, numeric, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_automation_settings(boolean, boolean, numeric, int, int) TO authenticated;
