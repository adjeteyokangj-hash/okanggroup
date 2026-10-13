-- M56: Unattended BA scheduling via pg_cron + Owner schedule controls + email provider prep (send still off)

INSERT INTO public.settings (key, value_json) VALUES
  ('automation_schedule_enabled', 'false'::jsonb),
  ('automation_schedule_cron', '"0 * * * *"'::jsonb),
  ('email_provider', '"none"'::jsonb),
  ('email_from', '""'::jsonb),
  ('email_provider_configured', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION private.scheduler_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_got boolean;
  v_result jsonb;
  v_run_id uuid;
BEGIN
  v_got := pg_try_advisory_lock(872314001);
  IF NOT v_got THEN
    INSERT INTO public.automation_runs (run_kind, status, finished_at, stats_json)
    VALUES (
      'scheduler',
      'succeeded',
      now(),
      jsonb_build_object('status', 'skipped_overlap', 'reason', 'advisory_lock_held')
    )
    RETURNING id INTO v_run_id;
    RETURN jsonb_build_object('status', 'skipped_overlap', 'run_id', v_run_id);
  END IF;

  BEGIN
    IF NOT private.setting_bool('automation_enabled', true) THEN
      INSERT INTO public.automation_runs (run_kind, status, finished_at, stats_json)
      VALUES ('scheduler', 'succeeded', now(), jsonb_build_object('status', 'disabled'));
      PERFORM pg_advisory_unlock(872314001);
      RETURN jsonb_build_object('status', 'disabled');
    END IF;

    IF NOT private.setting_bool('automation_schedule_enabled', false) THEN
      INSERT INTO public.automation_runs (run_kind, status, finished_at, stats_json)
      VALUES ('scheduler', 'succeeded', now(), jsonb_build_object('status', 'schedule_disabled'));
      PERFORM pg_advisory_unlock(872314001);
      RETURN jsonb_build_object('status', 'schedule_disabled');
    END IF;

    PERFORM set_config('okang.ba_scheduler', '1', true);
    v_result := public.run_business_automation(false);
    -- Tag run_kind if possible
    IF (v_result ? 'run_id') THEN
      UPDATE public.automation_runs
      SET run_kind = 'scheduler',
          stats_json = COALESCE(stats_json, '{}'::jsonb) || jsonb_build_object('source', 'pg_cron')
      WHERE id = (v_result->>'run_id')::uuid;
    END IF;

    PERFORM pg_advisory_unlock(872314001);
    RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object('source', 'scheduler');
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_advisory_unlock(872314001);
    INSERT INTO public.automation_runs (run_kind, status, finished_at, error_text, stats_json)
    VALUES (
      'scheduler',
      'failed',
      now(),
      SQLERRM,
      jsonb_build_object('status', 'failed', 'source', 'pg_cron')
    );
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.scheduler_tick() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_automation_schedule_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_job cron.job%ROWTYPE;
  v_last jsonb;
BEGIN
  IF NOT private.has_permission('automation.read')
     AND NOT private.has_permission('automation.manage') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO v_job FROM cron.job WHERE jobname = 'okang-business-automation';

  SELECT jsonb_agg(x ORDER BY (x->>'start_time') DESC) INTO v_last
  FROM (
    SELECT jsonb_build_object(
      'runid', d.runid,
      'status', d.status,
      'return_message', left(COALESCE(d.return_message, ''), 200),
      'start_time', d.start_time,
      'end_time', d.end_time
    ) AS x
    FROM cron.job_run_details d
    WHERE v_job.jobid IS NOT NULL AND d.jobid = v_job.jobid
    ORDER BY d.start_time DESC
    LIMIT 10
  ) s;

  RETURN jsonb_build_object(
    'schedule_enabled', private.setting_bool('automation_schedule_enabled', false),
    'automation_enabled', private.setting_bool('automation_enabled', true),
    'cron_expression', COALESCE(
      (SELECT value_json #>> '{}' FROM public.settings WHERE key = 'automation_schedule_cron'),
      '0 * * * *'
    ),
    'job_name', 'okang-business-automation',
    'job_active', COALESCE(v_job.active, false),
    'job_schedule', v_job.schedule,
    'job_command', v_job.command,
    'recent_cron_runs', COALESCE(v_last, '[]'::jsonb),
    'email', jsonb_build_object(
      'delivery_enabled', private.setting_bool('email_delivery_enabled', false),
      'provider', COALESCE((SELECT value_json #>> '{}' FROM public.settings WHERE key = 'email_provider'), 'none'),
      'from', COALESCE((SELECT value_json #>> '{}' FROM public.settings WHERE key = 'email_from'), ''),
      'provider_configured', private.setting_bool('email_provider_configured', false)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_automation_schedule_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_automation_schedule_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_automation_schedule(
  p_enabled boolean,
  p_cron text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_cron text;
  v_jobid bigint;
BEGIN
  IF NOT private.has_permission('automation.manage') THEN
    RAISE EXCEPTION 'Not authorised to manage automation schedule';
  END IF;

  v_cron := NULLIF(trim(COALESCE(p_cron, '')), '');
  IF v_cron IS NULL THEN
    SELECT value_json #>> '{}' INTO v_cron FROM public.settings WHERE key = 'automation_schedule_cron';
  END IF;
  v_cron := COALESCE(NULLIF(trim(v_cron), ''), '0 * * * *');

  -- Basic cron validation: 5 fields
  IF array_length(regexp_split_to_array(v_cron, '\\s+'), 1) <> 5 THEN
    RAISE EXCEPTION 'Cron expression must have 5 fields (min hour dom month dow)';
  END IF;

  INSERT INTO public.settings (key, value_json) VALUES ('automation_schedule_cron', to_jsonb(v_cron))
  ON CONFLICT (key) DO UPDATE SET value_json = to_jsonb(v_cron), updated_at = now();

  INSERT INTO public.settings (key, value_json) VALUES ('automation_schedule_enabled', to_jsonb(COALESCE(p_enabled, false)))
  ON CONFLICT (key) DO UPDATE SET value_json = to_jsonb(COALESCE(p_enabled, false)), updated_at = now();

  -- Upsert cron job (always registered; active follows enabled flag)
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'okang-business-automation';
  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'okang-business-automation',
      v_cron,
      $cmd$SELECT private.scheduler_tick();$cmd$
    );
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'okang-business-automation';
  ELSE
    PERFORM cron.alter_job(v_jobid, schedule := v_cron, command := $cmd$SELECT private.scheduler_tick();$cmd$);
  END IF;

  PERFORM cron.alter_job(v_jobid, active := COALESCE(p_enabled, false));

  RETURN public.get_automation_schedule_status();
END;
$$;

REVOKE ALL ON FUNCTION public.set_automation_schedule(boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_automation_schedule(boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.configure_email_provider(
  p_provider text DEFAULT 'none',
  p_from text DEFAULT NULL,
  p_configured boolean DEFAULT false,
  p_enable_delivery boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_provider text := lower(COALESCE(NULLIF(trim(p_provider), ''), 'none'));
BEGIN
  IF NOT private.has_permission('automation.manage') THEN
    RAISE EXCEPTION 'Not authorised to configure email provider';
  END IF;
  IF v_provider NOT IN ('none', 'resend', 'smtp') THEN
    RAISE EXCEPTION 'Unsupported email provider (none|resend|smtp)';
  END IF;

  -- Never auto-enable delivery; Owner must explicitly request and provider must be configured
  IF COALESCE(p_enable_delivery, false) AND NOT COALESCE(p_configured, false) THEN
    RAISE EXCEPTION 'Cannot enable email delivery until provider is marked configured';
  END IF;
  IF COALESCE(p_enable_delivery, false) AND v_provider = 'none' THEN
    RAISE EXCEPTION 'Cannot enable email delivery with provider=none';
  END IF;

  INSERT INTO public.settings (key, value_json) VALUES ('email_provider', to_jsonb(v_provider))
  ON CONFLICT (key) DO UPDATE SET value_json = to_jsonb(v_provider), updated_at = now();
  IF p_from IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('email_from', to_jsonb(trim(p_from)))
    ON CONFLICT (key) DO UPDATE SET value_json = to_jsonb(trim(p_from)), updated_at = now();
  END IF;
  INSERT INTO public.settings (key, value_json) VALUES ('email_provider_configured', to_jsonb(COALESCE(p_configured, false)))
  ON CONFLICT (key) DO UPDATE SET value_json = to_jsonb(COALESCE(p_configured, false)), updated_at = now();

  -- Keep delivery off unless explicitly enabled after configure
  IF p_enable_delivery IS NOT NULL THEN
    INSERT INTO public.settings (key, value_json) VALUES ('email_delivery_enabled', to_jsonb(p_enable_delivery))
    ON CONFLICT (key) DO UPDATE SET value_json = to_jsonb(p_enable_delivery), updated_at = now();
  END IF;

  RETURN (public.get_automation_schedule_status()->'email');
END;
$$;

REVOKE ALL ON FUNCTION public.configure_email_provider(text, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configure_email_provider(text, text, boolean, boolean) TO authenticated;

-- Harden outbox: even if delivery flag flipped, skip unless provider configured
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
  v_provider_ok boolean;
BEGIN
  IF NOT private.automation_invoke_allowed() THEN
    RAISE EXCEPTION 'Not authorised to process outbox';
  END IF;

  v_email_enabled := private.setting_bool('email_delivery_enabled', false);
  v_provider_ok := private.setting_bool('email_provider_configured', false)
    AND COALESCE((SELECT value_json #>> '{}' FROM public.settings WHERE key = 'email_provider'), 'none') <> 'none';

  FOR r IN
    SELECT * FROM public.notification_outbox
    WHERE status IN ('pending', 'failed')
      AND next_attempt_at <= now()
      AND attempts < max_attempts
    ORDER BY next_attempt_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    IF r.channel = 'email' AND (NOT v_email_enabled OR NOT v_provider_ok) THEN
      UPDATE public.notification_outbox
      SET status = 'skipped',
          last_error = CASE
            WHEN NOT v_email_enabled THEN 'Email delivery disabled until provider verified'
            ELSE 'Email provider not configured'
          END,
          attempts = attempts + 1
      WHERE id = r.id;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Provider configured path still does not send in this increment (no transporter wired)
    UPDATE public.notification_outbox
    SET status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
        attempts = attempts + 1,
        last_error = 'Email transporter not wired (prepared only)',
        next_attempt_at = now() + make_interval(mins => LEAST(240, POWER(2, GREATEST(attempts, 0))::int * 5))
    WHERE id = r.id;
    v_failed := v_failed + 1;
    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'skipped', v_skipped,
    'failed_or_retry', v_failed,
    'email_enabled', v_email_enabled,
    'provider_configured', v_provider_ok
  );
END;
$$;

REVOKE ALL ON FUNCTION public.process_notification_outbox(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_notification_outbox(int) TO authenticated, service_role;

-- Register cron job inactive by default (Owner enables via set_automation_schedule)
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'okang-business-automation';
  IF v_jobid IS NULL THEN
    PERFORM cron.schedule(
      'okang-business-automation',
      '0 * * * *',
      $cmd$SELECT private.scheduler_tick();$cmd$
    );
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'okang-business-automation';
  END IF;
  PERFORM cron.alter_job(v_jobid, active := false);
END $$;
