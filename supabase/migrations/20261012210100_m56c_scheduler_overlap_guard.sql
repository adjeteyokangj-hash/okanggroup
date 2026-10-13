-- M56c: Also skip scheduler when a sweep is already running (same-session advisory locks are re-entrant)

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
      'scheduler', 'succeeded', now(),
      jsonb_build_object('status', 'skipped_overlap', 'reason', 'advisory_lock_held')
    )
    RETURNING id INTO v_run_id;
    RETURN jsonb_build_object('status', 'skipped_overlap', 'run_id', v_run_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.automation_runs
    WHERE status = 'running'
      AND started_at > now() - interval '30 minutes'
  ) THEN
    INSERT INTO public.automation_runs (run_kind, status, finished_at, stats_json)
    VALUES (
      'scheduler', 'succeeded', now(),
      jsonb_build_object('status', 'skipped_overlap', 'reason', 'run_in_progress')
    )
    RETURNING id INTO v_run_id;
    PERFORM pg_advisory_unlock(872314001);
    RETURN jsonb_build_object('status', 'skipped_overlap', 'run_id', v_run_id, 'reason', 'run_in_progress');
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
    VALUES ('scheduler', 'failed', now(), SQLERRM, jsonb_build_object('status', 'failed', 'source', 'pg_cron'));
    RAISE;
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.scheduler_tick() FROM PUBLIC;
