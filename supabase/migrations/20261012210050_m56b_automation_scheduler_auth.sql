-- M56b: Allow scheduler session to invoke automation RPCs via GUC okang.ba_scheduler=1
-- (Applied on remote via patch; kept here for repo parity.)

CREATE OR REPLACE FUNCTION private.automation_invoke_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT current_setting('okang.ba_scheduler', true) = '1'
    OR private.has_permission('automation.run')
    OR private.has_permission('automation.manage');
$$;
