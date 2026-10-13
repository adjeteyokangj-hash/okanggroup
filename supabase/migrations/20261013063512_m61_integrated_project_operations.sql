-- M61: Integrated project operations — change-request depth, deliverable/milestone
-- transitions, client acceptance RPCs, portal visibility. Extends m44/m48; no teardown.

-- ---------------------------------------------------------------------------
-- 1) Change request commercial impact (currency never mixed in app layer)
-- ---------------------------------------------------------------------------
ALTER TABLE public.change_requests
  ADD COLUMN IF NOT EXISTS estimated_cost numeric(18, 2),
  ADD COLUMN IF NOT EXISTS currency_code char(3),
  ADD COLUMN IF NOT EXISTS cost_notes text;

-- ---------------------------------------------------------------------------
-- 2) Portal can read change requests for their client
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS change_requests_select ON public.change_requests;
CREATE POLICY change_requests_select ON public.change_requests
  FOR SELECT TO authenticated
  USING (
    private.has_permission_on_client('projects.read', client_id)
    OR private.is_active_client_member(client_id)
  );

-- ---------------------------------------------------------------------------
-- 3) Staff: save / transition change requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_change_request(
  p_project_id uuid,
  p_title text,
  p_description text DEFAULT '',
  p_impact_summary text DEFAULT NULL,
  p_estimated_cost numeric DEFAULT NULL,
  p_currency_code text DEFAULT NULL,
  p_cost_notes text DEFAULT NULL,
  p_change_request_id uuid DEFAULT NULL,
  p_submit boolean DEFAULT false
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_row public.change_requests%ROWTYPE;
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT private.has_permission_on_client('projects.manage', v_project.client_id) THEN
    RAISE EXCEPTION 'projects.manage required';
  END IF;
  IF btrim(COALESCE(p_title, '')) = '' THEN RAISE EXCEPTION 'Title is required'; END IF;

  v_status := CASE WHEN p_submit THEN 'submitted' ELSE 'draft' END;

  IF p_change_request_id IS NULL THEN
    INSERT INTO public.change_requests (
      project_id, client_id, title, description, impact_summary,
      estimated_cost, currency_code, cost_notes, status, requested_by
    ) VALUES (
      v_project.id, v_project.client_id, btrim(p_title),
      COALESCE(p_description, ''),
      nullif(btrim(COALESCE(p_impact_summary, '')), ''),
      CASE WHEN p_estimated_cost IS NULL THEN NULL ELSE round(p_estimated_cost, 2) END,
      CASE WHEN p_currency_code IS NULL OR btrim(p_currency_code) = '' THEN NULL
           ELSE upper(left(p_currency_code, 3)) END,
      nullif(btrim(COALESCE(p_cost_notes, '')), ''),
      v_status, auth.uid()
    )
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.change_requests WHERE id = p_change_request_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
    IF v_row.project_id <> p_project_id THEN RAISE EXCEPTION 'Project mismatch'; END IF;
    IF v_row.status NOT IN ('draft', 'rejected') THEN
      RAISE EXCEPTION 'Only draft/rejected change requests can be edited (status=%)', v_row.status;
    END IF;

    UPDATE public.change_requests SET
      title = btrim(p_title),
      description = COALESCE(p_description, ''),
      impact_summary = nullif(btrim(COALESCE(p_impact_summary, '')), ''),
      estimated_cost = CASE WHEN p_estimated_cost IS NULL THEN NULL ELSE round(p_estimated_cost, 2) END,
      currency_code = CASE WHEN p_currency_code IS NULL OR btrim(p_currency_code) = '' THEN NULL
                           ELSE upper(left(p_currency_code, 3)) END,
      cost_notes = nullif(btrim(COALESCE(p_cost_notes, '')), ''),
      status = CASE WHEN p_submit THEN 'submitted' ELSE status END,
      requested_by = COALESCE(requested_by, auth.uid()),
      updated_at = now()
    WHERE id = p_change_request_id
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.save_change_request(
  uuid, text, text, text, numeric, text, text, uuid, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_change_request(
  uuid, text, text, text, numeric, text, text, uuid, boolean
) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_change_request(
  p_change_request_id uuid,
  p_to_status text,
  p_decision_note text DEFAULT NULL
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.change_requests%ROWTYPE;
  v_from text;
  v_ok boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.change_requests WHERE id = p_change_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF NOT private.has_permission_on_client('projects.manage', v_row.client_id) THEN
    RAISE EXCEPTION 'projects.manage required';
  END IF;

  v_from := v_row.status;
  v_ok :=
    (v_from = 'draft' AND p_to_status IN ('submitted', 'cancelled'))
    OR (v_from = 'submitted' AND p_to_status IN ('approved', 'rejected', 'cancelled'))
    OR (v_from = 'approved' AND p_to_status IN ('implemented', 'cancelled'))
    OR (v_from = 'rejected' AND p_to_status IN ('draft', 'cancelled'));

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Invalid change-request transition % → %', v_from, p_to_status;
  END IF;

  UPDATE public.change_requests SET
    status = p_to_status,
    decided_by = CASE WHEN p_to_status IN ('approved', 'rejected') THEN auth.uid() ELSE decided_by END,
    decided_at = CASE WHEN p_to_status IN ('approved', 'rejected') THEN now() ELSE decided_at END,
    decision_note = CASE
      WHEN p_to_status IN ('approved', 'rejected', 'cancelled')
        THEN nullif(btrim(COALESCE(p_decision_note, '')), '')
      ELSE decision_note
    END,
    updated_at = now()
  WHERE id = p_change_request_id
  RETURNING * INTO v_row;

  IF p_to_status IN ('approved', 'rejected', 'cancelled') THEN
    INSERT INTO public.approvals (
      entity_type, entity_id, client_id, requested_by, approver_profile_id, status, decided_at, decision_note
    ) VALUES (
      'change_request', v_row.id, v_row.client_id, COALESCE(v_row.requested_by, auth.uid()),
      auth.uid(), p_to_status, now(), p_decision_note
    );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_change_request(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_change_request(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Deliverable + milestone status transitions (staff)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_deliverable_status(
  p_deliverable_id uuid,
  p_to_status text,
  p_notes text DEFAULT NULL
)
RETURNS public.project_deliverables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.project_deliverables%ROWTYPE;
  v_from text;
  v_ok boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.project_deliverables WHERE id = p_deliverable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deliverable not found'; END IF;
  IF NOT private.has_permission_on_client('projects.manage', v_row.client_id) THEN
    RAISE EXCEPTION 'projects.manage required';
  END IF;

  v_from := v_row.status;
  v_ok :=
    (v_from = 'pending' AND p_to_status IN ('in_progress', 'cancelled'))
    OR (v_from = 'in_progress' AND p_to_status IN ('ready_for_review', 'cancelled'))
    OR (v_from = 'ready_for_review' AND p_to_status IN ('client_approved', 'in_progress', 'cancelled'))
    OR (v_from = 'client_approved' AND p_to_status IN ('delivered', 'cancelled'))
    OR (v_from = 'delivered' AND p_to_status IN ('cancelled'));

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Invalid deliverable transition % → %', v_from, p_to_status;
  END IF;

  UPDATE public.project_deliverables SET
    status = p_to_status,
    accepted_at = CASE WHEN p_to_status = 'client_approved' THEN COALESCE(accepted_at, now()) ELSE accepted_at END,
    notes = CASE WHEN p_notes IS NULL THEN notes ELSE nullif(btrim(p_notes), '') END,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_deliverable_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_deliverable_status(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_deliverable_status(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_milestone_status(
  p_milestone_id uuid,
  p_to_status text
)
RETURNS public.milestones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.milestones%ROWTYPE;
  v_from text;
  v_ok boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.milestones WHERE id = p_milestone_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Milestone not found'; END IF;
  IF NOT private.has_permission_on_client('projects.manage', v_row.client_id) THEN
    RAISE EXCEPTION 'projects.manage required';
  END IF;

  IF p_to_status NOT IN ('open', 'in_progress', 'done', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid milestone status %', p_to_status;
  END IF;

  v_from := v_row.status;
  v_ok :=
    (v_from = 'open' AND p_to_status IN ('in_progress', 'done', 'cancelled'))
    OR (v_from = 'in_progress' AND p_to_status IN ('done', 'open', 'cancelled'))
    OR (v_from = 'done' AND p_to_status IN ('open', 'in_progress'))
    OR (v_from = 'cancelled' AND p_to_status IN ('open'));

  IF NOT v_ok THEN
    RAISE EXCEPTION 'Invalid milestone transition % → %', v_from, p_to_status;
  END IF;

  UPDATE public.milestones SET
    status = p_to_status,
    completed_at = CASE WHEN p_to_status = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END,
    updated_at = now()
  WHERE id = p_milestone_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_milestone_status(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_milestone_status(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Client portal: accept/reject deliverable awaiting review
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_decide_deliverable(
  p_deliverable_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS public.project_deliverables
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_row public.project_deliverables%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_row FROM public.project_deliverables WHERE id = p_deliverable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Deliverable not found'; END IF;
  IF NOT private.is_active_client_member(v_row.client_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF v_row.status <> 'ready_for_review' THEN
    RAISE EXCEPTION 'Deliverable is not awaiting client review (status=%)', v_row.status;
  END IF;

  UPDATE public.project_deliverables SET
    status = CASE WHEN p_approve THEN 'client_approved' ELSE 'in_progress' END,
    accepted_at = CASE WHEN p_approve THEN now() ELSE NULL END,
    notes = CASE
      WHEN p_note IS NULL THEN notes
      ELSE nullif(btrim(p_note), '')
    END,
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = p_deliverable_id
  RETURNING * INTO v_row;

  INSERT INTO public.approvals (
    entity_type, entity_id, client_id, requested_by, approver_profile_id, status, decided_at, decision_note
  ) VALUES (
    'project_deliverable', p_deliverable_id, v_row.client_id, COALESCE(v_row.created_by, auth.uid()),
    auth.uid(), CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, now(), p_note
  );

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.client_decide_deliverable(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_decide_deliverable(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6) Client portal: submit a change request
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.client_submit_change_request(
  p_project_id uuid,
  p_title text,
  p_description text DEFAULT '',
  p_impact_summary text DEFAULT NULL
)
RETURNS public.change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_row public.change_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Project not found'; END IF;
  IF NOT private.is_active_client_member(v_project.client_id) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF v_project.status NOT IN ('open', 'on_hold') THEN
    RAISE EXCEPTION 'Project is not open for change requests';
  END IF;
  IF btrim(COALESCE(p_title, '')) = '' THEN RAISE EXCEPTION 'Title is required'; END IF;

  INSERT INTO public.change_requests (
    project_id, client_id, title, description, impact_summary, status, requested_by
  ) VALUES (
    v_project.id, v_project.client_id, btrim(p_title),
    COALESCE(p_description, ''),
    nullif(btrim(COALESCE(p_impact_summary, '')), ''),
    'submitted', auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.client_submit_change_request(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.client_submit_change_request(uuid, text, text, text) TO authenticated;
