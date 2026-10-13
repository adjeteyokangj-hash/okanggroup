-- M25: Task execute vs manage — Stage 1 corrective release (C1)
-- Staff loses tasks.manage; gains tasks.execute. Field-level lock + review-before-done.
-- Owner / management roles keep tasks.manage. Owner permission count stays 21 (no execute grant).
-- Historical done/cancelled status rows are not retroactively changed.

-- ---------------------------------------------------------------------------
-- 1. Permission + role seeds (Staff only loses manage)
-- ---------------------------------------------------------------------------
INSERT INTO public.permissions (code, description, category, is_sensitive)
VALUES ('tasks.execute', 'Update progress on assigned tasks; submit for review', 'operations', false)
ON CONFLICT (code) DO NOTHING;

-- Grant execute to Staff
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'staff'
  AND p.code = 'tasks.execute'
ON CONFLICT DO NOTHING;

-- Revoke manage from Staff ONLY (never by permission code alone)
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id
  AND rp.permission_id = p.id
  AND r.code = 'staff'
  AND p.code = 'tasks.manage';

-- Abort if any management role lost tasks.manage
DO $$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(r.code, ', ' ORDER BY r.code)
  INTO v_missing
  FROM public.roles r
  WHERE r.code IN (
      'owner',
      'platform_admin',
      'operations_manager',
      'department_manager',
      'team_manager'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id AND p.code = 'tasks.manage'
      WHERE rp.role_id = r.id
    );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'M25 abort: tasks.manage missing from management roles: %', v_missing;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id AND r.code = 'staff'
    JOIN public.permissions p ON p.id = rp.permission_id AND p.code = 'tasks.execute'
  ) THEN
    RAISE EXCEPTION 'M25 abort: staff missing tasks.execute';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id AND r.code = 'staff'
    JOIN public.permissions p ON p.id = rp.permission_id AND p.code = 'tasks.manage'
  ) THEN
    RAISE EXCEPTION 'M25 abort: staff still has tasks.manage';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Default approval for new / open tasks (do not touch done/cancelled status)
-- ---------------------------------------------------------------------------
ALTER TABLE public.tasks
  ALTER COLUMN requires_approval SET DEFAULT true;

UPDATE public.tasks
SET requires_approval = true
WHERE status NOT IN ('done', 'cancelled');

-- ---------------------------------------------------------------------------
-- 3. Progress notes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_progress_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles (id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_progress_notes_task_id_idx
  ON public.task_progress_notes (task_id, created_at DESC);

ALTER TABLE public.task_progress_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_progress_notes FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.is_active_task_assignee(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.task_assignments ta
    WHERE ta.task_id = p_task_id
      AND ta.assignee_profile_id = auth.uid()
      AND ta.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_task(p_is_internal boolean, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT
    (p_is_internal AND private.has_permission('tasks.manage'))
    OR (p_client_id IS NOT NULL AND private.has_permission_on_client('tasks.manage', p_client_id));
$$;

CREATE OR REPLACE FUNCTION private.can_execute_task(p_is_internal boolean, p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
  SELECT
    (p_is_internal AND private.has_permission('tasks.execute'))
    OR (p_client_id IS NOT NULL AND private.has_permission_on_client('tasks.execute', p_client_id));
$$;

REVOKE ALL ON FUNCTION private.is_active_task_assignee(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_manage_task(boolean, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_execute_task(boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_active_task_assignee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_task(boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_execute_task(boolean, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Column / status enforcement trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.tasks_enforce_execute_vs_manage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- service_role / system (no JWT): allow
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
    IF NEW.status IN ('done', 'cancelled') THEN
      RAISE EXCEPTION 'Execute users cannot mark tasks done or cancelled; submit for review'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status NOT IN ('assigned', 'in_progress', 'blocked', 'in_review', 'backlog') THEN
      RAISE EXCEPTION 'Invalid status for execute user: %', NEW.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_enforce_execute_vs_manage ON public.tasks;
CREATE TRIGGER tasks_enforce_execute_vs_manage
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION private.tasks_enforce_execute_vs_manage();

-- ---------------------------------------------------------------------------
-- 6. RLS: split manage insert/update/delete; add execute update
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tasks_manage ON public.tasks;

CREATE POLICY tasks_insert_manage ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    private.can_manage_task(is_internal, client_id)
  );

CREATE POLICY tasks_update_manage ON public.tasks
  FOR UPDATE TO authenticated
  USING (private.can_manage_task(is_internal, client_id))
  WITH CHECK (private.can_manage_task(is_internal, client_id));

CREATE POLICY tasks_update_execute ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    private.can_execute_task(is_internal, client_id)
    AND private.is_active_task_assignee(id)
  )
  WITH CHECK (
    private.can_execute_task(is_internal, client_id)
    AND private.is_active_task_assignee(id)
  );

CREATE POLICY tasks_delete_manage ON public.tasks
  FOR DELETE TO authenticated
  USING (private.can_manage_task(is_internal, client_id));

-- Progress notes RLS
DROP POLICY IF EXISTS task_progress_notes_select ON public.task_progress_notes;
DROP POLICY IF EXISTS task_progress_notes_insert ON public.task_progress_notes;

CREATE POLICY task_progress_notes_select ON public.task_progress_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_progress_notes.task_id
        AND (
          (t.is_internal AND private.has_permission('tasks.read'))
          OR (t.client_id IS NOT NULL AND private.has_permission_on_client('tasks.read', t.client_id))
          OR t.created_by = auth.uid()
          OR private.is_active_task_assignee(t.id)
        )
    )
  );

CREATE POLICY task_progress_notes_insert ON public.task_progress_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_progress_notes.task_id
        AND (
          private.can_manage_task(t.is_internal, t.client_id)
          OR (
            private.can_execute_task(t.is_internal, t.client_id)
            AND private.is_active_task_assignee(t.id)
          )
        )
    )
  );

GRANT SELECT, INSERT ON public.task_progress_notes TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. RPCs: submit for review / decide completion / add note
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_task_progress_note(p_task_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Note body required';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF NOT (
    private.can_manage_task(v_task.is_internal, v_task.client_id)
    OR (
      private.can_execute_task(v_task.is_internal, v_task.client_id)
      AND private.is_active_task_assignee(p_task_id)
    )
  ) THEN
    RAISE EXCEPTION 'Not allowed to add progress notes' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.task_progress_notes (task_id, author_id, body)
  VALUES (p_task_id, auth.uid(), trim(p_body))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_task_for_review(p_task_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
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

  IF p_note IS NOT NULL AND length(trim(p_note)) > 0 THEN
    PERFORM public.add_task_progress_note(p_task_id, trim(p_note));
  END IF;

  -- Cancel prior pending approvals for this task, then request new
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

CREATE OR REPLACE FUNCTION public.decide_task_completion(
  p_task_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_can_manage boolean;
  v_can_decide boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  v_can_manage := private.can_manage_task(v_task.is_internal, v_task.client_id);
  v_can_decide :=
    private.has_permission('approvals.decide')
    OR (
      v_task.client_id IS NOT NULL
      AND private.has_permission_on_client('approvals.decide', v_task.client_id)
    );

  IF NOT (v_can_manage OR v_can_decide) THEN
    RAISE EXCEPTION 'approvals.decide or tasks.manage required' USING ERRCODE = '42501';
  END IF;

  -- Staff cannot approve their own work (assignee without manage)
  IF private.is_active_task_assignee(p_task_id) AND NOT v_can_manage THEN
    RAISE EXCEPTION 'Cannot approve or reject your own assigned task' USING ERRCODE = '42501';
  END IF;

  IF v_task.status NOT IN ('in_review', 'in_progress', 'assigned', 'blocked') THEN
    RAISE EXCEPTION 'Task is not awaiting a completion decision (status=%)', v_task.status;
  END IF;

  IF p_approve THEN
    UPDATE public.tasks
    SET status = 'done',
        completed_at = now(),
        updated_by = auth.uid()
    WHERE id = p_task_id;
  ELSE
    UPDATE public.tasks
    SET status = 'in_progress',
        completed_at = null,
        updated_by = auth.uid()
    WHERE id = p_task_id;
  END IF;

  UPDATE public.approvals
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_at = now(),
      decision_note = NULLIF(trim(COALESCE(p_note, '')), ''),
      approver_profile_id = auth.uid(),
      updated_at = now()
  WHERE entity_type = 'task'
    AND entity_id = p_task_id
    AND status = 'pending';

  IF p_note IS NOT NULL AND length(trim(p_note)) > 0 THEN
    PERFORM public.add_task_progress_note(
      p_task_id,
      CASE WHEN p_approve THEN 'Approved: ' ELSE 'Rejected: ' END || trim(p_note)
    );
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.add_task_progress_note(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_task_for_review(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decide_task_completion(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_task_progress_note(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_task_for_review(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_task_completion(uuid, boolean, text) TO authenticated;
