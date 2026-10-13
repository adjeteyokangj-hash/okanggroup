-- M50b: Expose uat_set_actor for authenticated RPC UAT harness (auth.uid() via JWT claims)

CREATE OR REPLACE FUNCTION public.uat_set_actor(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  PERFORM private.uat_set_actor(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.uat_set_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uat_set_actor(uuid) TO authenticated, service_role;
