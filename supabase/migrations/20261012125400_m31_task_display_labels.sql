-- M31: Task display labels for assignees (client/project names + participant display names)
-- Fixes empty Client/Project selects and "Someone" in conversations without granting org.staff.read.

ALTER TABLE public.task_messages
  ADD COLUMN IF NOT EXISTS author_display_name text;

-- Backfill from profiles (service / migration context)
UPDATE public.task_messages m
SET author_display_name = COALESCE(NULLIF(trim(p.full_name), ''), p.email, 'Staff')
FROM public.profiles p
WHERE p.id = m.author_id
  AND (m.author_display_name IS NULL OR m.author_display_name = '');

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

  v_actor_name := private.profile_display_name(auth.uid());

  INSERT INTO public.task_messages (task_id, client_id, author_id, author_display_name, body, attachment_ids)
  VALUES (
    p_task_id,
    v_task.client_id,
    auth.uid(),
    v_actor_name,
    v_body,
    COALESCE(p_attachment_ids, '{}')
  )
  RETURNING id INTO v_msg_id;

  v_title := CASE
    WHEN v_kind = 'task_files' THEN 'New files on task'
    ELSE 'New task message'
  END;

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

CREATE OR REPLACE FUNCTION public.task_display_context(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
  v_client_name text;
  v_project_code text;
  v_project_name text;
  v_names jsonb := '{}'::jsonb;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT private.can_read_task(p_task_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;

  IF v_task.client_id IS NOT NULL THEN
    SELECT legal_name INTO v_client_name FROM public.clients WHERE id = v_task.client_id;
  END IF;
  IF v_task.project_id IS NOT NULL THEN
    SELECT code, name INTO v_project_code, v_project_name
    FROM public.projects WHERE id = v_task.project_id;
  END IF;

  FOR r IN
    SELECT DISTINCT x.pid, COALESCE(NULLIF(trim(p.full_name), ''), p.email, 'Staff') AS display_name
    FROM (
      SELECT created_by AS pid FROM public.tasks WHERE id = p_task_id AND created_by IS NOT NULL
      UNION
      SELECT assignee_profile_id FROM public.task_assignments WHERE task_id = p_task_id AND assignee_profile_id IS NOT NULL
      UNION
      SELECT author_id FROM public.task_messages WHERE task_id = p_task_id
      UNION
      SELECT author_id FROM public.task_progress_notes WHERE task_id = p_task_id
      UNION
      SELECT uploaded_by FROM public.task_attachments WHERE task_id = p_task_id AND uploaded_by IS NOT NULL
    ) x
    JOIN public.profiles p ON p.id = x.pid
  LOOP
    v_names := v_names || jsonb_build_object(r.pid::text, r.display_name);
  END LOOP;

  RETURN jsonb_build_object(
    'client_id', v_task.client_id,
    'client_name', v_client_name,
    'project_id', v_task.project_id,
    'project_code', v_project_code,
    'project_name', v_project_name,
    'participant_names', v_names
  );
END;
$$;

REVOKE ALL ON FUNCTION public.task_display_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.task_display_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_task_message(uuid, text, uuid[], text) TO authenticated;
