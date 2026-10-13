-- Business Automation regression (run as service role / SQL editor)
-- Covers: dedupe, permissions, email disabled outbox, notes isolation, recurring dedupe

DO $$
DECLARE
  v_owner uuid := 'a7bce15a-566a-43df-aa93-4f23da8bb35f';
  v_daniel uuid := '928646aa-759b-42b5-a346-19aa71ead822';
  v_client uuid := 'c3a03d35-b094-4358-a099-61c8d31398a3';
  v_client_user uuid := 'c1111111-1111-4111-8111-111111111111';
  v_n1 uuid;
  v_n2 uuid;
  v_notes text;
  v_out jsonb;
  v_run jsonb;
  v_sched uuid;
  v_period text;
  v_cnt int;
BEGIN
  -- Expect public.ba_uat_results to exist (created by UAT harness) or create it:
  CREATE TABLE IF NOT EXISTS public.ba_uat_results (check_id text PRIMARY KEY, result text, detail text);
  DELETE FROM public.ba_uat_results;

  -- Dedupe
  PERFORM public.uat_set_actor(v_owner);
  v_n1 := public.emit_notification(
    v_owner, 'owner_alert', 'BA dedupe A', 'body', 'ba_dedupe_test_1', 'info', NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, '/', '["in_app"]'::jsonb, NULL
  );
  v_n2 := public.emit_notification(
    v_owner, 'owner_alert', 'BA dedupe A again', 'body2', 'ba_dedupe_test_1', 'info', NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, '/', '["in_app"]'::jsonb, NULL
  );
  INSERT INTO ba_uat_results VALUES (
    'DEDUP-01',
    CASE WHEN v_n1 = v_n2 THEN 'PASS' ELSE 'FAIL' END,
    format('n1=%s n2=%s', v_n1, v_n2)
  );

  -- Email channel skipped when disabled
  PERFORM public.update_automation_settings(false, true, NULL, NULL, NULL);
  v_n1 := public.emit_notification(
    v_owner, 'owner_alert', 'BA email skip', 'x', 'ba_email_skip_1', 'info', NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, '/', '["in_app","email"]'::jsonb, NULL
  );
  SELECT count(*) INTO v_cnt FROM notification_outbox
  WHERE notification_id = v_n1 AND status = 'skipped';
  INSERT INTO ba_uat_results VALUES (
    'OUTBOX-01-email-skipped',
    CASE WHEN v_cnt >= 1 THEN 'PASS' ELSE 'FAIL' END,
    format('skipped_rows=%s', v_cnt)
  );

  v_out := public.process_notification_outbox(20);
  INSERT INTO ba_uat_results VALUES (
    'OUTBOX-02-process',
    CASE WHEN (v_out->>'email_enabled')::boolean = false THEN 'PASS' ELSE 'FAIL' END,
    v_out::text
  );

  -- Daniel cannot run automation
  PERFORM public.uat_set_actor(v_daniel);
  BEGIN
    PERFORM public.run_business_automation(true);
    INSERT INTO ba_uat_results VALUES ('PERM-01-staff-run-denied', 'FAIL', 'allowed');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ba_uat_results VALUES ('PERM-01-staff-run-denied', 'PASS', SQLERRM);
  END;

  -- Owner can run
  PERFORM public.uat_set_actor(v_owner);
  v_run := public.run_business_automation(true);
  INSERT INTO ba_uat_results VALUES (
    'SWEEP-01-owner-run',
    CASE WHEN v_run->>'status' = 'succeeded' THEN 'PASS' ELSE 'FAIL' END,
    v_run::text
  );

  -- notes_internal cleared on clients; private notes staff-only
  SELECT notes_internal INTO v_notes FROM clients WHERE id = v_client;
  INSERT INTO ba_uat_results VALUES (
    'NOTES-01-clients-column-null',
    CASE WHEN v_notes IS NULL THEN 'PASS' ELSE 'FAIL' END,
    coalesce(v_notes, '<null>')
  );

  PERFORM public.set_client_private_notes(v_client, 'secret internal only');
  PERFORM public.uat_set_actor(v_client_user);
  BEGIN
    -- client_user lacks clients.read staff perm; RPC should deny
    v_notes := public.get_client_private_notes(v_client);
    INSERT INTO ba_uat_results VALUES ('NOTES-02-client-rpc-denied', 'FAIL', coalesce(v_notes, '<null>'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO ba_uat_results VALUES ('NOTES-02-client-rpc-denied', 'PASS', SQLERRM);
  END;

  -- Recurring billing period dedupe
  PERFORM public.uat_set_actor(v_owner);
  INSERT INTO recurring_billing_schedules (
    client_id, title, currency_code, subtotal, tax_total, cadence, next_run_on, active, created_by
  ) VALUES (
    v_client, 'BA UAT retainer', 'GBP', 100, 0, 'monthly', CURRENT_DATE, true, v_owner
  ) RETURNING id INTO v_sched;

  v_cnt := private.generate_recurring_invoices(CURRENT_DATE);
  v_period := 'monthly:' || to_char(CURRENT_DATE, 'YYYY-MM-DD');
  -- second call same day must not duplicate
  PERFORM private.generate_recurring_invoices(CURRENT_DATE);
  SELECT count(*) INTO v_cnt FROM recurring_billing_runs WHERE schedule_id = v_sched AND period_key LIKE 'monthly:%';
  INSERT INTO ba_uat_results VALUES (
    'RECUR-01-period-dedupe',
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('runs=%s period=%s', v_cnt, v_period)
  );

  -- Sweep idempotent owner summary dedupe
  SELECT count(*) INTO v_cnt FROM notifications
  WHERE recipient_id = v_owner AND dedupe_key = 'owner_summary:' || CURRENT_DATE::text || ':' || v_owner::text;
  INSERT INTO ba_uat_results VALUES (
    'DEDUP-02-summary-once',
    CASE WHEN v_cnt = 1 THEN 'PASS' ELSE 'FAIL' END,
    format('count=%s', v_cnt)
  );

  RAISE NOTICE 'BA regression complete';
END $$;

SELECT * FROM ba_uat_results ORDER BY check_id;
