-- M14 core: audit_events (+ minimal security tables) — purge not enabled (DR-07 / OD-04)

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_email_snapshot text,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  client_id uuid,
  correlation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info'
    CHECK (severity IN ('debug', 'info', 'notice', 'warning', 'error', 'critical'))
);

CREATE INDEX audit_events_occurred_at_idx ON public.audit_events (occurred_at DESC);
CREATE INDEX audit_events_actor_idx ON public.audit_events (actor_profile_id);

CREATE TABLE public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  severity text NOT NULL DEFAULT 'medium',
  reported_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_incidents FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated
  USING (private.has_permission('platform.audit.read') OR private.has_platform_role('owner'));

-- Inserts via service role / security definer helper only for ordinary users
CREATE OR REPLACE FUNCTION private.write_audit_event(
  p_action text,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_severity text DEFAULT 'info'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  SELECT email INTO v_email FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.audit_events (
    actor_profile_id, actor_email_snapshot, action, entity_type, entity_id, client_id, metadata, severity
  ) VALUES (
    auth.uid(), v_email, p_action, p_entity_type, p_entity_id, p_client_id, COALESCE(p_metadata, '{}'::jsonb), p_severity
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION private.write_audit_event(text, text, uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.write_audit_event(text, text, uuid, uuid, jsonb, text) TO authenticated;

CREATE POLICY security_incidents_all ON public.security_incidents FOR ALL TO authenticated
  USING (private.has_permission('platform.audit.read') OR private.has_platform_role('owner'))
  WITH CHECK (private.has_permission('platform.audit.read') OR private.has_platform_role('owner'));

GRANT SELECT ON public.audit_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.security_incidents TO authenticated;
