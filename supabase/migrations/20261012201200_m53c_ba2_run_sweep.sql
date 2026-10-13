-- M53c: run_business_automation sweep

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
  v_open_tasks int;
  v_overdue_inv int;
  v_pending_docs int;
BEGIN
  IF NOT private.setting_bool('automation_enabled', true) AND NOT p_force THEN
    RETURN jsonb_build_object('status', 'disabled');
  END IF;
  IF NOT private.has_permission('automation.run') AND NOT private.has_permission('automation.manage') THEN
    RAISE EXCEPTION 'Not authorised to run automation';
  END IF;

  INSERT INTO public.automation_runs (run_kind, status, triggered_by)
  VALUES ('sweep', 'running', auth.uid()) RETURNING id INTO v_run_id;

  BEGIN
    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'task_due_soon' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_days := COALESCE((v_rule.config_json->>'days')::int, private.setting_num('task_due_soon_days', 3)::int);
      FOR r IN
        SELECT t.id, t.title, t.client_id, t.project_id, t.due_at
        FROM public.tasks t
        WHERE t.status NOT IN ('done', 'cancelled') AND t.due_at IS NOT NULL
          AND t.due_at::date BETWEEN CURRENT_DATE AND CURRENT_DATE + v_days
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, r.id) LOOP
          PERFORM public.emit_notification(rid, 'task_due_soon', 'Task due soon: ' || r.title,
            'Due ' || r.due_at::date::text,
            'task_due_soon:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'warning', v_rule.code, r.client_id, r.project_id, NULL, r.id, 'task', r.id,
            '/tasks/' || r.id::text, v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'task_overdue' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT t.id, t.title, t.client_id, t.project_id, t.due_at FROM public.tasks t
        WHERE t.status NOT IN ('done', 'cancelled') AND t.due_at IS NOT NULL AND t.due_at < now()
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, r.id) LOOP
          PERFORM public.emit_notification(rid, 'task_overdue', 'Overdue task: ' || r.title,
            'Was due ' || r.due_at::date::text,
            'task_overdue:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'critical', v_rule.code, r.client_id, r.project_id, NULL, r.id, 'task', r.id,
            '/tasks/' || r.id::text, v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
        FOR rid IN SELECT profile_id FROM private.escalate_recipients(v_rule) LOOP
          PERFORM public.emit_notification(rid, 'owner_alert', 'Escalation: overdue task ' || r.title,
            'Task overdue', 'task_overdue_esc:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'critical', v_rule.code, r.client_id, r.project_id, NULL, r.id, 'task', r.id,
            '/tasks/' || r.id::text, v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'invoice_due_soon' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_days := COALESCE((v_rule.config_json->>'days')::int, private.setting_num('invoice_due_soon_days', 7)::int);
      FOR r IN
        SELECT i.id, i.invoice_number, i.client_id, i.due_date, i.amount_outstanding, i.currency_code
        FROM public.invoices i
        WHERE i.status IN ('issued', 'partially_paid', 'overdue') AND i.amount_outstanding > 0
          AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + v_days
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL) LOOP
          PERFORM public.emit_notification(rid, 'invoice_due_soon',
            'Invoice due soon: ' || COALESCE(r.invoice_number, 'invoice'),
            r.currency_code || ' ' || r.amount_outstanding::text || ' due ' || r.due_date::text,
            'inv_due_soon:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'warning', v_rule.code, r.client_id, NULL, r.id, NULL, 'invoice', r.id,
            '/finance/invoices', v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
        FOR rid IN SELECT profile_id FROM private.client_member_ids(r.client_id) LOOP
          PERFORM public.emit_notification(rid, 'invoice_due_soon', 'Upcoming invoice payment',
            'Invoice ' || COALESCE(r.invoice_number, '') || ' is due on ' || r.due_date::text,
            'inv_due_soon_client:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'info', v_rule.code, r.client_id, NULL, r.id, NULL, 'invoice', r.id,
            '/portal/invoices', '["in_app"]'::jsonb, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'invoice_overdue' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT i.id, i.invoice_number, i.client_id, i.due_date, i.amount_outstanding, i.currency_code
        FROM public.invoices i
        WHERE i.status IN ('issued', 'partially_paid', 'overdue') AND i.amount_outstanding > 0
          AND i.due_date < CURRENT_DATE
      LOOP
        UPDATE public.invoices SET status = 'overdue' WHERE id = r.id AND status NOT IN ('paid', 'void', 'overdue');
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL) LOOP
          PERFORM public.emit_notification(rid, 'invoice_overdue',
            'Overdue invoice: ' || COALESCE(r.invoice_number, 'invoice'),
            r.currency_code || ' ' || r.amount_outstanding::text || ' was due ' || r.due_date::text,
            'inv_overdue:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'critical', v_rule.code, r.client_id, NULL, r.id, NULL, 'invoice', r.id,
            '/finance/invoices', v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'budget_warning' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_pct := COALESCE((v_rule.config_json->>'pct')::numeric, private.setting_num('budget_warning_pct', 80));
      FOR r IN
        SELECT p.id, p.name, p.client_id, p.budget_amount,
          COALESCE((SELECT SUM(e.amount) FROM public.expenses e WHERE e.project_id = p.id AND e.status = 'recorded'), 0) AS spent
        FROM public.projects p
        WHERE p.budget_amount > 0 AND p.status NOT IN ('closed', 'cancelled')
      LOOP
        IF r.spent >= (r.budget_amount * v_pct / 100.0) THEN
          FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL) LOOP
            PERFORM public.emit_notification(rid,
              CASE WHEN r.spent > r.budget_amount THEN 'budget_exceeded' ELSE 'budget_warning' END,
              'Budget alert: ' || r.name, 'Spent ' || r.spent::text || ' of ' || r.budget_amount::text,
              'budget:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
              CASE WHEN r.spent > r.budget_amount THEN 'critical' ELSE 'warning' END,
              v_rule.code, r.client_id, r.id, NULL, NULL, 'project', r.id,
              '/projects/' || r.id::text, v_rule.channels_json, NULL);
            v_emitted := v_emitted + 1;
          END LOOP;
        END IF;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'milestone_overdue' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT m.id, m.name, m.client_id, m.project_id, m.due_on FROM public.milestones m
        WHERE COALESCE(m.status, '') NOT IN ('done', 'cancelled', 'completed')
          AND m.due_on IS NOT NULL AND m.due_on < CURRENT_DATE
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL) LOOP
          PERFORM public.emit_notification(rid, 'milestone_overdue', 'Overdue milestone: ' || r.name,
            'Due ' || r.due_on::text,
            'ms_overdue:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'warning', v_rule.code, r.client_id, r.project_id, NULL, NULL, 'milestone', r.id,
            '/projects/' || r.project_id::text, v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'change_request_pending' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT cr.id, cr.title, cr.client_id, cr.project_id FROM public.change_requests cr
        WHERE lower(COALESCE(cr.status, 'pending')) IN ('pending', 'submitted', 'open', 'in_review')
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL) LOOP
          PERFORM public.emit_notification(rid, 'change_request_pending', 'Change request pending',
            left(COALESCE(r.title, 'Change request'), 200),
            'cr_pending:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'info', v_rule.code, r.client_id, r.project_id, NULL, NULL, 'change_request', r.id,
            '/projects/' || r.project_id::text, v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'handover_incomplete' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_days := COALESCE((v_rule.config_json->>'days')::int, 7);
      SELECT value_json INTO v_required FROM public.settings WHERE key = 'handover_required_items';
      v_required := COALESCE(v_required, '["credentials","documentation","training","signoff"]'::jsonb);
      FOR r IN
        SELECT p.id, p.name, p.client_id, p.target_end_on, p.handover_checklist_json
        FROM public.projects p
        WHERE p.status NOT IN ('closed', 'cancelled') AND p.target_end_on IS NOT NULL
          AND p.target_end_on <= CURRENT_DATE + v_days
      LOOP
        v_have := COALESCE(r.handover_checklist_json, '[]'::jsonb);
        v_missing := false;
        FOR v_item IN SELECT jsonb_array_elements_text(v_required) LOOP
          IF NOT (v_have ? v_item) THEN v_missing := true; EXIT; END IF;
        END LOOP;
        IF v_missing THEN
          FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL) LOOP
            PERFORM public.emit_notification(rid, 'handover_incomplete', 'Handover incomplete: ' || r.name,
              'Target end ' || r.target_end_on::text,
              'handover:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
              'warning', v_rule.code, r.client_id, r.id, NULL, NULL, 'project', r.id,
              '/projects/' || r.id::text, v_rule.channels_json, NULL);
            v_emitted := v_emitted + 1;
          END LOOP;
        END IF;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'document_approval_pending' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      FOR r IN
        SELECT d.id, d.title, d.client_id, d.project_id FROM public.project_documents d
        WHERE d.deleted_at IS NULL AND d.visibility = 'client_visible' AND d.approval_status = 'pending'
      LOOP
        FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, r.client_id, NULL) LOOP
          PERFORM public.emit_notification(rid, 'document_approval_pending', 'Document awaiting your approval',
            left(COALESCE(r.title, 'Shared document'), 200),
            'doc_pending:' || r.id::text || ':' || CURRENT_DATE::text || ':' || rid::text,
            'info', v_rule.code, r.client_id, r.project_id, NULL, NULL, 'project_document', r.id,
            '/portal/documents', v_rule.channels_json, NULL);
          v_emitted := v_emitted + 1;
        END LOOP;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'owner_daily_summary' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      SELECT count(*) INTO v_open_tasks FROM public.tasks WHERE status NOT IN ('done', 'cancelled');
      SELECT count(*) INTO v_overdue_inv FROM public.invoices
        WHERE amount_outstanding > 0 AND due_date < CURRENT_DATE
          AND status IN ('issued', 'partially_paid', 'overdue');
      SELECT count(*) INTO v_pending_docs FROM public.project_documents
        WHERE deleted_at IS NULL AND visibility = 'client_visible' AND approval_status = 'pending';
      FOR rid IN SELECT profile_id FROM private.resolve_rule_recipients(v_rule, NULL, NULL) LOOP
        PERFORM public.emit_notification(rid, 'owner_summary', 'Daily business summary',
          format('Open tasks: %s · Overdue invoices: %s · Docs awaiting approval: %s',
            v_open_tasks, v_overdue_inv, v_pending_docs),
          'owner_summary:' || CURRENT_DATE::text || ':' || rid::text,
          'info', v_rule.code, NULL, NULL, NULL, NULL, 'report', NULL, '/', v_rule.channels_json, NULL);
        v_emitted := v_emitted + 1;
      END LOOP;
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    SELECT * INTO v_rule FROM public.automation_rules WHERE code = 'recurring_billing' AND enabled;
    IF FOUND THEN
      v_rules := v_rules + 1;
      v_recur := private.generate_recurring_invoices(CURRENT_DATE);
      UPDATE public.automation_rules SET last_run_at = now(), updated_at = now() WHERE id = v_rule.id;
    END IF;

    v_outbox := public.process_notification_outbox(100);

    UPDATE public.automation_runs
    SET status = 'succeeded', finished_at = now(),
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

  RETURN (SELECT jsonb_build_object('run_id', v_run_id, 'status', status, 'stats', stats_json)
          FROM public.automation_runs WHERE id = v_run_id);
END;
$$;

REVOKE ALL ON FUNCTION public.run_business_automation(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_business_automation(boolean) TO authenticated, service_role;
