-- M53 BA-2: emit/dedupe, recipient resolution, scheduled sweep, outbox retry, recurring billing

CREATE OR REPLACE FUNCTION private.owner_profile_ids()
RETURNS TABLE (profile_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT DISTINCT rg.profile_id
  FROM public.role_grants rg
  JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active' AND r.code = 'owner'
  JOIN public.profiles pr ON pr.id = rg.profile_id
  WHERE rg.status = 'active'
    AND (rg.ends_at IS NULL OR rg.ends_at > now())
    AND pr.account_status = 'active'
    AND pr.account_kind = 'staff';
$$;

CREATE OR REPLACE FUNCTION private.profiles_with_permission(p_code text)
RETURNS TABLE (profile_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT DISTINCT rg.profile_id
  FROM public.role_grants rg
  JOIN public.roles r ON r.id = rg.role_id AND r.status = 'active'
  JOIN public.role_permissions rp ON rp.role_id = r.id
  JOIN public.permissions p ON p.id = rp.permission_id AND p.code = p_code
  JOIN public.profiles pr ON pr.id = rg.profile_id
  WHERE rg.status = 'active'
    AND (rg.ends_at IS NULL OR rg.ends_at > now())
    AND pr.account_status = 'active'
    AND pr.account_kind = 'staff'
    AND pr.must_change_password = false;
$$;

CREATE OR REPLACE FUNCTION private.client_member_ids(p_client_id uuid)
RETURNS TABLE (profile_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT m.profile_id
  FROM public.client_memberships m
  JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.client_id = p_client_id
    AND m.status = 'active'
    AND p.account_kind = 'client_user'
    AND p.account_status = 'active';
$$;

CREATE OR REPLACE FUNCTION private.setting_bool(p_key text, p_default boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (value_json #>> '{}')::boolean FROM public.settings WHERE key = p_key),
    p_default
  );
$$;

CREATE OR REPLACE FUNCTION private.setting_num(p_key text, p_default numeric)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT (value_json #>> '{}')::numeric FROM public.settings WHERE key = p_key),
    p_default
  );
$$;

-- Core emitter with dedupe + optional outbox enqueue (email disabled by default)
CREATE OR REPLACE FUNCTION public.emit_notification(
  p_recipient_id uuid,
  p_kind text,
  p_title text,
  p_body text DEFAULT NULL,
  p_dedupe_key text DEFAULT NULL,
  p_severity text DEFAULT 'info',
  p_rule_code text DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_project_id uuid DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_link_path text DEFAULT NULL,
  p_channels jsonb DEFAULT '["in_app"]'::jsonb,
  p_actor_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_body text;
  v_email_enabled boolean;
BEGIN
  IF p_recipient_id IS NULL OR p_title IS NULL OR p_kind IS NULL THEN
    RAISE EXCEPTION 'recipient, kind and title are required';
  END IF;

  -- Never leak internal notes wording into client-facing bodies
  v_body := left(COALESCE(p_body, ''), 500);
  IF v_body ~* 'notes_internal|internal note' THEN
    v_body := regexp_replace(v_body, 'notes_internal|internal note[s]?', '[redacted]', 'gi');
  END IF;

  IF p_dedupe_key IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.notifications
    WHERE recipient_id = p_recipient_id AND dedupe_key = p_dedupe_key
    LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.notifications (
      recipient_id, actor_id, kind, title, body, task_id,
      client_id, project_id, invoice_id, entity_type, entity_id,
      dedupe_key, severity, link_path, rule_code
    ) VALUES (
      p_recipient_id, p_actor_id, p_kind, left(p_title, 200), NULLIF(v_body, ''),
      p_task_id, p_client_id, p_project_id, p_invoice_id, p_entity_type, p_entity_id,
      p_dedupe_key, COALESCE(NULLIF(p_severity, ''), 'info'), p_link_path, p_rule_code
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.notifications
    WHERE recipient_id = p_recipient_id AND dedupe_key = p_dedupe_key LIMIT 1;
    RETURN v_id;
  END;

  v_email_enabled := private.setting_bool('email_delivery_enabled', false);
  IF v_id IS NOT NULL AND p_channels ? 'email' THEN
    INSERT INTO public.notification_outbox (
      notification_id, channel, status, dedupe_key, payload_json, next_attempt_at
    ) VALUES (
      v_id,
      'email',
      CASE WHEN v_email_enabled THEN 'pending' ELSE 'skipped' END,
      CASE WHEN p_dedupe_key IS NULL THEN NULL ELSE 'email:' || p_dedupe_key END,
      jsonb_build_object(
        'recipient_id', p_recipient_id,
        'title', p_title,
        'body', v_body,
        'kind', p_kind
      ),
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_notification(
  uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, text, uuid, text, jsonb, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emit_notification(
  uuid, text, text, text, text, text, text, uuid, uuid, uuid, uuid, text, uuid, text, jsonb, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.resolve_rule_recipients(
  p_rule public.automation_rules,
  p_client_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL
)
RETURNS TABLE (profile_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF p_rule.recipient_mode = 'owners' THEN
    RETURN QUERY SELECT o.profile_id FROM private.owner_profile_ids() o;
  ELSIF p_rule.recipient_mode = 'explicit' THEN
    RETURN QUERY
      SELECT u FROM unnest(p_rule.recipient_profile_ids) AS u;
  ELSIF p_rule.recipient_mode = 'client_members' AND p_client_id IS NOT NULL THEN
    RETURN QUERY SELECT c.profile_id FROM private.client_member_ids(p_client_id) c;
  ELSIF p_rule.recipient_mode = 'assignees' AND p_task_id IS NOT NULL THEN
    RETURN QUERY
      SELECT ta.assignee_profile_id
      FROM public.task_assignments ta
      WHERE ta.task_id = p_task_id AND ta.status = 'active' AND ta.assignee_profile_id IS NOT NULL;
  ELSIF p_rule.recipient_mode = 'permission_holders' AND p_rule.recipient_permission IS NOT NULL THEN
    RETURN QUERY SELECT p.profile_id FROM private.profiles_with_permission(p_rule.recipient_permission) p;
  ELSIF p_rule.recipient_mode = 'account_managers' AND p_client_id IS NOT NULL THEN
    RETURN QUERY
      SELECT c.account_manager_profile_id
      FROM public.clients c
      WHERE c.id = p_client_id AND c.account_manager_profile_id IS NOT NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.escalate_recipients(p_rule public.automation_rules)
RETURNS TABLE (profile_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_to text := p_rule.escalation_json->>'escalate_to';
BEGIN
  IF v_to = 'owners' THEN
    RETURN QUERY SELECT o.profile_id FROM private.owner_profile_ids() o;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_notification_outbox(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  r public.notification_outbox%ROWTYPE;
  v_processed int := 0;
  v_skipped int := 0;
  v_failed int := 0;
  v_email_enabled boolean;
BEGIN
  IF NOT private.has_permission('automation.run')
     AND NOT private.has_permission('automation.manage') THEN
    RAISE EXCEPTION 'Not authorised to process outbox';
  END IF;

  v_email_enabled := private.setting_bool('email_delivery_enabled', false);

  FOR r IN
    SELECT * FROM public.notification_outbox
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= now()
      AND attempts < max_attempts
    ORDER BY next_attempt_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    IF r.channel = 'email' AND NOT v_email_enabled THEN
      UPDATE public.notification_outbox
      SET status = 'skipped', last_error = 'Email delivery disabled until provider verified', attempts = attempts + 1
      WHERE id = r.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Provider not configured: fail with retry backoff (does not send)
    UPDATE public.notification_outbox
    SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
        attempts = attempts + 1,
        last_error = 'Email provider not configured',
        next_attempt_at = now() + make_interval(mins => LEAST(240, POWER(2, attempts)::int * 5))
    WHERE id = r.id;
    v_failed := v_failed + 1;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'failed_or_retry', v_failed,
    'email_enabled', v_email_enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_notification_outbox(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_notification_outbox(int) TO authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.run_business_automation(p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_run_id uuid;
  v_rule public.automation_rules%ROWTYPE;
  v_emitted int := 0;
  v_rules int := 0;
  v_recur int := 0;
  v_outbox jsonb;
  rid uuid;
  r record;
  v_days int;
  v_pct numeric;
  v_required jsonb;
  v_have jsonb;
  v_item text;
  v_missing boolean;
  v_exp numeric;
  v_open_tasks int;
  v_overdue_inv int;
  v_pending_docs int;
BEGIN
  IF NOT private.setting_bool('automation_enabled', true) AND NOT p_force THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;

  IF NOT (
    private.has_permission('automation.run')
    OR private.has_permission('automation.manage')
  ) THEN
    RAISE EXCEPTION 'Not authorised to run automation';
  END IF;

  INSERT INTO public.automation_runs (run_kind, status, triggered_by)
  VALUES ('sweep', 'running', auth.uid())
  RETURNING id INTO v_run_id;

  BEGIN
    -- Tasks due soon
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'task_due_soon' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_days := COALESCE((v_rule.config_json->>'days')::int, private.setting_num('task_due_soon_days', 3)::int);
      FOR r IN
        SELECT t.id, t.title, t.client_id, t.project_id, t.due_at
        FROM public.tasks t
        WHERE t.status NOT IN ('done', 'cancelled')
          AND t.due_at IS NOT NULL
          AND t.due_at::date >= CURRENT_DATE
          AND t.due_at::date <= CURRENT_DATE + v_days
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, r.id)
        LOOP
          IF public.emit_notification(
            rid, 'task_due_soon', 'Task due soon: ' || r.title,
            'Due ' || r.due_at::date::text,
            'task_due_soon:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'warning', v_rule.code, r.client_id, r.project_id, NULL, r.id,
            'task', r.id, '/tasks/' || r.id::text, v_rule.channels_json, NULL
          ) IS NOT NULL THEN
            v_emitted := v_emitted + 1;
          END IF;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Tasks overdue
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'task_overdue' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT t.id, t.title, t.client_id, t.project_id, t.due_at
        FROM public.tasks t
        WHERE t.status NOT IN ('done', 'cancelled')
          AND t.due_at IS NOT NULL
          AND t.due_at < now()
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, r.id)
        LOOP
          PERFORM public.emit_notification(
            rid, 'task_overdue', 'Overdue task: ' || r.title,
            'Was due ' || r.due_at::date::text,
            'task_overdue:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'critical', v_rule.code, r.client_id, r.project_id, NULL, r.id,
            'task', r.id, '/tasks/' || r.id::text, v_rule.channels_json, NULL
          );
          v_emitted := v_emitted + 1;
        END LOOP;
        IF (v_rule.escalation_json ? 'escalate_to') THEN
          FOR rid IN SELECT profile_id FROM private.escalate_recipients(v_rule)
          LOOP
            PERFORM public.emit_notification(
              rid, 'owner_alert', 'Escalation: overdue task ' || r.title,
              'Task overdue',
              'task_overdue_esc:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
              'critical', v_rule.code, r.client_id, r.project_id, NULL, r.id,
              'task', r.id, '/tasks/' || r.id::text, v_rule.channels_json, NULL
            );
            v_emitted := v_emitted + 1;
          END LOOP;
        END IF;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Invoice due soon / overdue
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'invoice_due_soon' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_days := COALESCE((v_rule.config_json->>'days')::int, private.setting_num('invoice_due_soon_days', 7)::int);
      FOR r IN
        SELECT i.id, i.invoice_number, i.client_id, i.due_date, i.amount_outstanding, i.currency_code
        FROM public.invoices i
        WHERE i.status IN ('issued', 'partially_paid', 'overdue')
          AND i.amount_outstanding > 0
          AND i.due_date IS NOT NULL
          AND i.due_date >= CURRENT_DATE
          AND i.due_date <= CURRENT_DATE + v_days
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL)
        LOOP
          PERFORM public.emit_notification(
            rid, 'invoice_due_soon', 'Invoice due soon: ' || COALESCE(r.invoice_number, 'draft'),
            r.currency_code || ' ' || r.amount_outstanding::text || ' due ' || r.due_date::text,
            'inv_due_soon:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'warning', v_rule.code, r.client_id, NULL, r.id, NULL,
            'invoice', r.id, '/finance/invoices', v_rule.channels_json, NULL
          );
          v_emitted := v_emitted + 1;
        END LOOP;
        -- Client-safe reminder (no internal notes)
        FOR rid IN SELECT profile_id FROM private.client_member_ids(r.client_id)
        LOOP
          PERFORM public.emit_notification(
            rid, 'invoice_due_soon', 'Upcoming invoice payment',
            'Invoice ' || COALESCE(r.invoice_number, '') || ' is due on ' || r.due_date::text,
            'inv_due_soon_client:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'info', v_rule.code, r.client_id, NULL, r.id, NULL,
            'invoice', r.id, '/portal/invoices', '["in_app"]'::jsonb, NULL
          );
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'invoice_overdue' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT i.id, i.invoice_number, i.client_id, i.due_date, i.amount_outstanding, i.currency_code
        FROM public.invoices i
        WHERE i.status IN ('issued', 'partially_paid', 'overdue')
          AND i.amount_outstanding > 0
          AND i.due_date IS NOT NULL
          AND i.due_date < CURRENT_DATE
      LOOP
        UPDATE public.invoices SET status = 'overdue' WHERE id = r.id AND status <> 'overdue' AND status <> 'paid';
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL)
        LOOP
          PERFORM public.emit_notification(
            rid, 'invoice_overdue', 'Overdue invoice: ' || COALESCE(r.invoice_number, 'invoice'),
            r.currency_code || ' ' || r.amount_outstanding::text || ' was due ' || r.due_date::text,
            'inv_overdue:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'critical', v_rule.code, r.client_id, NULL, r.id, NULL,
            'invoice', r.id, '/finance/invoices', v_rule.channels_json, NULL
          );
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Budget warning
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'budget_warning' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_pct := COALESCE((v_rule.config_json->>'pct')::numeric, private.setting_num('budget_warning_pct', 80));
      FOR r IN
        SELECT p.id, p.name, p.client_id, p.budget_amount,
               COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.project_id = p.id AND e.status = 'recorded'), 0) AS spent
        FROM public.projects p
        WHERE p.budget_amount IS NOT NULL AND p.budget_amount > 0
          AND p.status NOT IN ('closed', 'cancelled')
      LOOP
        IF r.spent >= (r.budget_amount * v_pct / 100.0) THEN
          FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL)
          LOOP
            PERFORM public.emit_notification(
              rid,
              CASE WHEN r.spent > r.budget_amount THEN 'budget_exceeded' ELSE 'budget_warning' END,
              'Budget alert: ' || r.name,
              'Spent ' || r.spent::text || ' of ' || r.budget_amount::text,
              'budget:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
              CASE WHEN r.spent > r.budget_amount THEN 'critical' ELSE 'warning' END,
              v_rule.code, r.client_id, r.id, NULL, NULL,
              'project', r.id, '/projects/' || r.id::text, v_rule.channels_json, NULL
            );
            v_emitted := v_emitted + 1;
          END LOOP;
        END IF;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Milestone overdue
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'milestone_overdue' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT m.id, m.name, m.client_id, m.project_id, m.due_on
        FROM public.milestones m
        WHERE m.status NOT IN ('done', 'cancelled', 'completed')
          AND m.due_on IS NOT NULL
          AND m.due_on < CURRENT_DATE
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL)
        LOOP
          PERFORM public.emit_notification(
            rid, 'milestone_overdue', 'Overdue milestone: ' || r.name,
            'Due ' || r.due_on::text,
            'ms_overdue:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'warning', v_rule.code, r.client_id, r.project_id, NULL, NULL,
            'milestone', r.id, '/projects/' || r.project_id::text, v_rule.channels_json, NULL
          );
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Change requests pending
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'change_request_pending' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT cr.id, cr.title, cr.client_id, cr.project_id
        FROM public.change_requests cr
        WHERE cr.status IN ('pending', 'submitted', 'open', 'in_review')
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL)
        LOOP
          PERFORM public.emit_notification(
            rid, 'change_request_pending', 'Change request pending',
            left(COALESCE(r.title, 'Change request'), 200),
            'cr_pending:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'info', v_rule.code, r.client_id, r.project_id, NULL, NULL,
            'change_request', r.id, '/projects/' || r.project_id::text, v_rule.channels_json, NULL
          );
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Handover incomplete near target end
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'handover_incomplete' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_days := COALESCE((v_rule.config_json->>'days')::int, 7);
      SELECT value_json INTO v_required FROM public.settings WHERE key = 'handover_required_items';
      v_required := COALESCE(v_required, '["credentials","documentation","training","signoff"]'::jsonb);
      FOR r IN
        SELECT p.id, p.name, p.client_id, p.target_end_on, p.handover_checklist_json
        FROM public.projects p
        WHERE p.status NOT IN ('closed', 'cancelled')
          AND p.target_end_on IS NOT NULL
          AND p.target_end_on <= CURRENT_DATE + v_days
      LOOP
        v_have := COALESCE(r.handover_checklist_json, '[]'::jsonb);
        v_missing := false;
        FOR v_item IN SELECT jsonb_array_elements_text(v_required)
        LOOP
          IF NOT (v_have ? v_item) THEN
            v_missing := true;
            EXIT;
          END IF;
        END LOOP;
        IF v_missing THEN
          FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL)
          LOOP
            PERFORM public.emit_notification(
              rid, 'handover_incomplete', 'Handover incomplete: ' || r.name,
              'Target end ' || r.target_end_on::text,
              'handover:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
              'warning', v_rule.code, r.client_id, r.id, NULL, NULL,
              'project', r.id, '/projects/' || r.id::text, v_rule.channels_json, NULL
            );
            v_emitted := v_emitted + 1;
          END LOOP;
        END IF;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Document approvals pending (client)
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'document_approval_pending' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT d.id, d.title, d.client_id, d.project_id
        FROM public.project_documents d
        WHERE d.deleted_at IS NULL
          AND d.visibility = 'client_visible'
          AND d.approval_status = 'pending'
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL)
        LOOP
          PERFORM public.emit_notification(
            rid, 'document_approval_pending', 'Document awaiting your approval',
            left(COALESCE(r.title, 'Shared document'), 200),
            'doc_pending:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'info', v_rule.code, r.client_id, r.project_id, NULL, NULL,
            'project_document', r.id, '/portal/documents', v_rule.channels_json, NULL
          );
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Owner daily summary
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'owner_daily_summary' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      SELECT count(*) INTO v_open_tasks FROM public.tasks WHERE status NOT IN ('done', 'cancelled');
      SELECT count(*) INTO v_overdue_inv FROM public.invoices
        WHERE amount_outstanding > 0 AND due_date < CURRENT_DATE AND status IN ('issued','partially_paid','overdue');
      SELECT count(*) INTO v_pending_docs FROM public.project_documents
        WHERE deleted_at IS NULL AND visibility = 'client_visible' AND approval_status = 'pending';
      FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, NULL, NULL)
      LOOP
        PERFORM public.emit_notification(
          rid, 'owner_summary', 'Daily business summary',
          format('Open tasks: %s · Overdue invoices: %s · Docs awaiting approval: %s', v_open_tasks, v_overdue_inv, v_pending_docs),
          'owner_summary:' || CURRENT_DATE::text || ':' || rid::text,
          'info', v_rule.code, NULL, NULL, NULL, NULL,
          'report', NULL, '/', v_rule.channels_json, NULL
        );
        v_emitted := v_emitted + 1;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    -- Recurring billing
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'recurring_billing' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_recur := private.generate_recurring_invoices(CURRENT_DATE);
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE code = v_rule.code;
    END IF;

    v_outbox := public.process_notification_outbox(100);

    UPDATE public.automation_runs
    SET status = 'succeeded',
        finished_at = now(),
        stats_json = jsonb_build_object(
          'rules_evaluated', v_rules,
          'notifications_touched', v_emitted,
          'recurring_invoices', v_recur,
          'outbox', v_outbox
        )
    WHERE id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.automation_runs
    SET status = 'failed', finished_at = now(), error_text = SQLERRM
    WHERE id = v_run_id;
    RAISE;
  END;

  RETURN (
    SELECT jsonb_build_object(
      'run_id', v_run_id,
      'status', status,
      'stats', stats_json
    )
    FROM public.automation_runs WHERE id = v_run_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_business_automation(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_business_automation(boolean) TO authenticated, service_role;

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
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json;
  END IF;
  IF p_automation_enabled IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('automation_enabled', to_jsonb(p_automation_enabled))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json;
  END IF;
  IF p_budget_warning_pct IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('budget_warning_pct', to_jsonb(p_budget_warning_pct))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json;
  END IF;
  IF p_task_due_soon_days IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('task_due_soon_days', to_jsonb(p_task_due_soon_days))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json;
  END IF;
  IF p_invoice_due_soon_days IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('invoice_due_soon_days', to_jsonb(p_invoice_due_soon_days))
    ON CONFLICT (key) DO UPDATE SET value_json = EXCLUDED.value_json;
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
