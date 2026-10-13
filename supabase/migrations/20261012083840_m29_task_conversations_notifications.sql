-- M29: Task conversations + in-app notifications (file handoff messaging)
-- Does not change task status automatically. Owner permission count unchanged.

CREATE TABLE public.task_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks (id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients (id),
  author_id uuid NOT NULL REFERENCES public.profiles (id),
  body text NOT NULL CHECK (length(trim(body)) > 0),
  -- Optional linked task_attachments ids (already uploaded; message does not require files)
  attachment_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX task_messages_task_id_idx ON public.task_messages (task_id, created_at);

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN (
    'task_message',
    'task_files',
    'task_assigned',
    'task_decision',
    'task_submitted'
  )),
  title text NOT NULL,
  body text,
  task_id uuid REFERENCES public.tasks (id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.task_messages (id) ON DELETE SET NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_recipient_unread_idx
  ON public.notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.task_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

CREATE POLICY task_messages_select ON public.task_messages
  FOR SELECT TO authenticated
  USING (private.can_read_task(task_id));

CREATE POLICY task_messages_insert ON public.task_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND private.can_read_task(task_id)
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id
        AND (
          private.can_manage_task(t.is_internal, t.client_id)
          OR (
            private.can_execute_task(t.is_internal, t.client_id)
            AND private.is_active_task_assignee(t.id)
          )
        )
        AND (client_id IS NOT DISTINCT FROM t.client_id)
    )
  );

CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Inserts only via SECURITY DEFINER RPC
GRANT SELECT, INSERT ON public.task_messages TO authenticated;
GRANT SELECT, UPDATE ON public.notifications TO authenticated;

CREATE OR REPLACE FUNCTION public.post_task_message(
  p_task_id uuid,
  p_body text,
  p_attachment_ids uuid[] DEFAULT '{}',
  p_kind text DEFAULT 'task_message'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_msg_id uuid;
  v_body text := NULLIF(trim(COALESCE(p_body, '')), '');
  v_kind text := COALESCE(NULLIF(trim(p_kind), ''), 'task_message');
  v_title text;
  v_actor_name text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_body IS NULL THEN
    RAISE EXCEPTION 'Message body required';
  END IF;
  IF v_kind NOT IN ('task_message', 'task_files') THEN
    RAISE EXCEPTION 'Invalid message kind';
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
    RAISE EXCEPTION 'Not allowed to post on this task' USING ERRCODE = '42501';
  END IF;

  -- Validate attachments belong to this task (optional)
  IF p_attachment_ids IS NOT NULL AND array_length(p_attachment_ids, 1) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(p_attachment_ids) AS aid(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.task_attachments ta
        WHERE ta.id = aid.id
          AND ta.task_id = p_task_id
          AND ta.deleted_at IS NULL
      )
    ) THEN
      RAISE EXCEPTION 'One or more attachments are invalid for this task';
    END IF;
  END IF;

  INSERT INTO public.task_messages (task_id, client_id, author_id, body, attachment_ids)
  VALUES (
    p_task_id,
    v_task.client_id,
    auth.uid(),
    v_body,
    COALESCE(p_attachment_ids, '{}')
  )
  RETURNING id INTO v_msg_id;

  SELECT COALESCE(full_name, email, 'Someone') INTO v_actor_name
  FROM public.profiles WHERE id = auth.uid();

  v_title := CASE
    WHEN v_kind = 'task_files' THEN 'New files on task'
    ELSE 'New task message'
  END;

  -- Notify active assignees (except sender)
  FOR r IN
    SELECT ta.assignee_profile_id AS uid
    FROM public.task_assignments ta
    WHERE ta.task_id = p_task_id
      AND ta.status = 'active'
      AND ta.assignee_profile_id IS NOT NULL
      AND ta.assignee_profile_id <> auth.uid()
  LOOP
    INSERT INTO public.notifications (
      recipient_id, actor_id, kind, title, body, task_id, message_id
    ) VALUES (
      r.uid, auth.uid(), v_kind, v_title,
      left(v_actor_name || ': ' || v_body, 500),
      p_task_id, v_msg_id
    );
  END LOOP;

  -- If sender is assignee, also notify task creator (Owner/manager) when different
  IF private.is_active_task_assignee(p_task_id)
     AND v_task.created_by IS NOT NULL
     AND v_task.created_by <> auth.uid()
     AND NOT private.can_manage_task(v_task.is_internal, v_task.client_id)
  THEN
    INSERT INTO public.notifications (
      recipient_id, actor_id, kind, title, body, task_id, message_id
    ) VALUES (
      v_task.created_by, auth.uid(), v_kind, v_title,
      left(v_actor_name || ': ' || v_body, 500),
      p_task_id, v_msg_id
    );
  END IF;

  RETURN v_msg_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE id = p_id AND recipient_id = auth.uid() AND read_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE recipient_id = auth.uid() AND read_at IS NULL;
END;
$$;

-- Notify assignee on submit / decision (extend existing RPCs lightly)
CREATE OR REPLACE FUNCTION public.submit_task_for_review(p_task_id uuid, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_body text;
  v_actor text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
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
  SET status = 'in_review', updated_by = auth.uid()
  WHERE id = p_task_id;

  v_body := NULLIF(trim(COALESCE(p_note, '')), '');
  IF v_body IS NULL THEN v_body := 'Submitted for review'; END IF;

  INSERT INTO public.task_progress_notes (task_id, author_id, body, progress_status)
  VALUES (p_task_id, auth.uid(), v_body, 'in_review');

  UPDATE public.approvals
  SET status = 'cancelled', updated_at = now()
  WHERE entity_type = 'task' AND entity_id = p_task_id AND status = 'pending';

  INSERT INTO public.approvals (
    entity_type, entity_id, client_id, is_internal, requested_by, status
  ) VALUES (
    'task', p_task_id, v_task.client_id, v_task.is_internal, auth.uid(), 'pending'
  );

  SELECT COALESCE(full_name, email, 'Staff') INTO v_actor FROM public.profiles WHERE id = auth.uid();
  IF v_task.created_by IS NOT NULL AND v_task.created_by <> auth.uid() THEN
    INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, task_id)
    VALUES (
      v_task.created_by, auth.uid(), 'task_submitted',
      'Task submitted for review',
      left(v_actor || ' submitted: ' || v_task.title, 500),
      p_task_id
    );
  END IF;
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
  v_actor text;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;

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
  IF private.is_active_task_assignee(p_task_id) AND NOT v_can_manage THEN
    RAISE EXCEPTION 'Cannot approve or reject your own assigned task' USING ERRCODE = '42501';
  END IF;
  IF v_task.status NOT IN ('in_review', 'in_progress', 'assigned', 'blocked') THEN
    RAISE EXCEPTION 'Task is not awaiting a completion decision (status=%)', v_task.status;
  END IF;

  IF p_approve THEN
    UPDATE public.tasks
    SET status = 'done', completed_at = now(), updated_by = auth.uid()
    WHERE id = p_task_id;
  ELSE
    UPDATE public.tasks
    SET status = 'in_progress', completed_at = null, updated_by = auth.uid()
    WHERE id = p_task_id;
  END IF;

  UPDATE public.approvals
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      decided_at = now(),
      decision_note = NULLIF(trim(COALESCE(p_note, '')), ''),
      approver_profile_id = auth.uid(),
      updated_at = now()
  WHERE entity_type = 'task' AND entity_id = p_task_id AND status = 'pending';

  IF p_note IS NOT NULL AND length(trim(p_note)) > 0 THEN
    PERFORM public.add_task_progress_note(
      p_task_id,
      CASE WHEN p_approve THEN 'Approved: ' ELSE 'Rejected: ' END || trim(p_note)
    );
  END IF;

  SELECT COALESCE(full_name, email, 'Manager') INTO v_actor FROM public.profiles WHERE id = auth.uid();
  FOR r IN
    SELECT ta.assignee_profile_id AS uid
    FROM public.task_assignments ta
    WHERE ta.task_id = p_task_id AND ta.status = 'active'
      AND ta.assignee_profile_id IS NOT NULL AND ta.assignee_profile_id <> auth.uid()
  LOOP
    INSERT INTO public.notifications (recipient_id, actor_id, kind, title, body, task_id)
    VALUES (
      r.uid, auth.uid(), 'task_decision',
      CASE WHEN p_approve THEN 'Task approved' ELSE 'Task returned with feedback' END,
      left(v_actor || ': ' || COALESCE(NULLIF(trim(p_note), ''), v_task.title), 500),
      p_task_id
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.post_task_message(uuid, text, uuid[], text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_task_message(uuid, text, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
