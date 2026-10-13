-- M26: Staff progress statuses + atomic save_task_progress (Stage 1.1 UI improvement)
-- Adds on_hold / awaiting_information for execute users; note required for blocked/hold/awaiting.
-- Does not grant Owner new permissions. Production deploy remains HOLD.

ALTER TABLE public.task_progress_notes
  ADD COLUMN IF NOT EXISTS progress_status text;

COMMENT ON COLUMN public.task_progress_notes.progress_status IS
  'Task status recorded with this progress update (execute Save Progress / submit).';

CREATE OR REPLACE FUNCTION private.tasks_enforce_execute_vs_manage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF private.can_manage_task(OLD.is_internal, OLD.client_id)
     OR private.can_manage_task(NEW.is_internal, NEW.client_id) THEN
    RETURN NEW;
  END IF;

  IF NOT (
    private.can_execute_task(OLD.is_internal, OLD.client_id)
    AND private.is_active_task_assignee(OLD.id)
  ) THEN
    RAISE EXCEPTION 'tasks.execute as assignee (or tasks.manage) required'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.description IS DISTINCT FROM OLD.description
     OR NEW.priority IS DISTINCT FROM OLD.priority
     OR NEW.due_at IS DISTINCT FROM OLD.due_at
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.is_internal IS DISTINCT FROM OLD.is_internal
     OR NEW.requires_approval IS DISTINCT FROM OLD.requires_approval
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
  THEN
    RAISE EXCEPTION 'Execute users cannot modify task definition fields'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Execute users cannot set completed_at'
      USING ERRCODE = '42501';
  END IF;

  IF OLD.status IN ('done', 'cancelled') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Execute users cannot reopen completed or cancelled tasks'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Never allow execute users to complete/approve/cancel
    IF NEW.status IN ('done', 'cancelled') THEN
      RAISE EXCEPTION 'Execute users cannot mark tasks done or cancelled; submit for review'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN (
      'assigned',
      'in_progress',
      'blocked',
      'on_hold',
      'awaiting_information',
      'in_review',
      'backlog'
    ) THEN
      RAISE EXCEPTION 'Invalid status for execute user: %', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Atomic progress save: status + note (+ who/when via author_id / created_at)
CREATE OR REPLACE FUNCTION public.save_task_progress(
  p_task_id uuid,
  p_status text,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
  v_note_id uuid;
  v_requires_note boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN (
    'assigned',
    'in_progress',
    'blocked',
    'on_hold',
    'awaiting_information'
  ) THEN
    RAISE EXCEPTION 'Invalid progress status (Approved/Completed not allowed for staff)'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot update progress on a completed or cancelled task';
  END IF;

  IF NOT (
    private.can_execute_task(v_task.is_internal, v_task.client_id)
    AND private.is_active_task_assignee(p_task_id)
  ) THEN
    -- Managers may also use this helper when assigned; allow manage
    IF NOT private.can_manage_task(v_task.is_internal, v_task.client_id) THEN
      RAISE EXCEPTION 'Not allowed to save progress' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_requires_note := p_status IN ('blocked', 'on_hold', 'awaiting_information');
  IF v_requires_note AND v_note IS NULL THEN
    RAISE EXCEPTION 'A progress note is required for Blocked, On Hold or Awaiting Information';
  END IF;
  IF v_note IS NULL THEN
    v_note := 'Status set to ' || p_status;
  END IF;

  UPDATE public.tasks
  SET status = p_status,
      updated_by = auth.uid()
  WHERE id = p_task_id;

  INSERT INTO public.task_progress_notes (task_id, author_id, body, progress_status)
  VALUES (p_task_id, auth.uid(), v_note, p_status)
  RETURNING id INTO v_note_id;

  RETURN v_note_id;
END;
$$;

-- Keep submit_task_for_review recording status on the note when provided
CREATE OR REPLACE FUNCTION public.submit_task_for_review(p_task_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_body text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.status IN ('done', 'cancelled') THEN
    RAISE EXCEPTION 'Cannot submit a completed or cancelled task';
  END IF;

  IF NOT (
    private.can_manage_task(v_task.is_internal, v_task.client_id)
    OR (
      private.can_execute_task(v_task.is_internal, v_task.client_id)
      AND private.is_active_task_assignee(p_task_id)
    )
  ) THEN
    RAISE EXCEPTION 'Not allowed to submit for review' USING ERRCODE = '42501';
  END IF;

  UPDATE public.tasks
  SET status = 'in_review',
      updated_by = auth.uid()
  WHERE id = p_task_id;

  v_body := NULLIF(trim(COALESCE(p_note, '')), '');
  IF v_body IS NULL THEN
    v_body := 'Submitted for review';
  END IF;

  INSERT INTO public.task_progress_notes (task_id, author_id, body, progress_status)
  VALUES (p_task_id, auth.uid(), v_body, 'in_review');

  UPDATE public.approvals
  SET status = 'cancelled', updated_at = now()
  WHERE entity_type = 'task'
    AND entity_id = p_task_id
    AND status = 'pending';

  INSERT INTO public.approvals (
    entity_type, entity_id, client_id, is_internal, requested_by, status
  ) VALUES (
    'task',
    p_task_id,
    v_task.client_id,
    v_task.is_internal,
    auth.uid(),
    'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_task_progress(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_task_progress(uuid, text, text) TO authenticated;
