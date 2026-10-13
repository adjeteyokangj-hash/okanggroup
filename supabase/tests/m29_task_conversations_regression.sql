-- M29: task conversations + notifications regression (dev)

DO $$
DECLARE
  v_owner uuid;
  v_daniel uuid;
  v_client uuid;
  v_other_client uuid;
  v_task uuid;
  v_other_task uuid;
  v_att uuid;
  v_msg uuid;
  v_notif_count int;
  v_status_before text;
  v_status_after text;
  v_denied boolean;
  v_fake uuid := gen_random_uuid();
BEGIN
  SELECT id INTO v_owner FROM public.profiles WHERE email = 'okanggroup@gmail.com';
  SELECT id INTO v_daniel FROM public.profiles WHERE email = 'daniel.uat@okangroup.test';
  SELECT id INTO v_client FROM public.clients ORDER BY created_at NULLS LAST LIMIT 1;
  SELECT id INTO v_other_client FROM public.clients
    WHERE id IS DISTINCT FROM v_client ORDER BY created_at NULLS LAST LIMIT 1;

  IF v_owner IS NULL OR v_daniel IS NULL OR v_client IS NULL THEN
    RAISE EXCEPTION 'Missing owner/daniel/client fixtures';
  END IF;

  SELECT id, status INTO v_task, v_status_before FROM public.tasks
  WHERE title = 'Design OkangGroup Test Homepage' AND status = 'awaiting_information'
  ORDER BY updated_at DESC NULLS LAST LIMIT 1;

  IF v_task IS NULL THEN
    INSERT INTO public.tasks (title, client_id, is_internal, status, created_by, updated_by)
    VALUES ('M29 conversation UAT', v_client, false, 'awaiting_information', v_owner, v_owner)
    RETURNING id INTO v_task;
    v_status_before := 'awaiting_information';
    INSERT INTO public.task_assignments (task_id, assignee_profile_id, assigned_by, assignment_type, status)
    VALUES (v_task, v_daniel, v_owner, 'manual', 'active');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.task_assignments
    WHERE task_id = v_task AND assignee_profile_id = v_daniel AND status = 'active'
  ) THEN
    UPDATE public.task_assignments SET status = 'reassigned'
    WHERE task_id = v_task AND status = 'active';
    INSERT INTO public.task_assignments (task_id, assignee_profile_id, assigned_by, assignment_type, status)
    VALUES (v_task, v_daniel, v_owner, 'manual', 'active');
  END IF;

  SELECT client_id INTO v_client FROM public.tasks WHERE id = v_task;

  INSERT INTO public.task_attachments (
    id, task_id, client_id, role, file_name, mime_type, byte_size, storage_path, uploaded_by
  ) VALUES (
    gen_random_uuid(), v_task, v_client, 'instruction',
    'm29-ref.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    1024, coalesce(v_client::text, 'internal') || '/' || v_task::text || '/instruction/m29-ref.docx', v_owner
  )
  RETURNING id INTO v_att;

  -- Owner: file handoff message
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);

  v_msg := public.post_task_message(
    v_task,
    'Daniel, I have uploaded the documents you requested. Please review and continue.',
    ARRAY[v_att],
    'task_files'
  );

  SELECT status INTO v_status_after FROM public.tasks WHERE id = v_task;
  IF v_status_after IS DISTINCT FROM v_status_before THEN
    RAISE EXCEPTION 'FAIL status changed on message: % -> %', v_status_before, v_status_after;
  END IF;

  SELECT count(*) INTO v_notif_count
  FROM public.notifications
  WHERE recipient_id = v_daniel AND message_id = v_msg AND kind = 'task_files';
  IF v_notif_count < 1 THEN
    RAISE EXCEPTION 'FAIL daniel not notified of file message';
  END IF;

  -- Owner: reply without files
  v_msg := public.post_task_message(
    v_task,
    'No files yet — keep Awaiting Information until they arrive.',
    '{}',
    'task_message'
  );
  SELECT count(*) INTO v_notif_count
  FROM public.notifications
  WHERE recipient_id = v_daniel AND message_id = v_msg AND kind = 'task_message';
  IF v_notif_count < 1 THEN
    RAISE EXCEPTION 'FAIL daniel not notified of plain message';
  END IF;

  -- Daniel replies
  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);

  v_msg := public.post_task_message(
    v_task,
    'Thank you. I have received the files and will continue.',
    '{}',
    'task_message'
  );
  SELECT count(*) INTO v_notif_count
  FROM public.notifications
  WHERE recipient_id = v_owner AND message_id = v_msg;
  IF v_notif_count < 1 THEN
    RAISE EXCEPTION 'FAIL owner not notified of daniel reply';
  END IF;

  PERFORM public.mark_notification_read(
    (SELECT id FROM public.notifications WHERE recipient_id = v_daniel ORDER BY created_at DESC LIMIT 1)
  );

  -- Negative: non-assignee / no-permission principal cannot post
  PERFORM set_config('request.jwt.claim.sub', v_fake::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_fake::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.post_task_message(v_task, 'Unauthorised post', '{}', 'task_message');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL unauthorised principal posted on task';
  END IF;

  -- Negative: Daniel cannot post on other-client task (create ephemeral client if needed)
  IF v_other_client IS NULL THEN
    INSERT INTO public.clients (legal_name, trading_name, status)
    VALUES ('M29 Cross Client Temp', 'M29 Cross', 'active')
    RETURNING id INTO v_other_client;
  END IF;

  INSERT INTO public.tasks (title, client_id, is_internal, status, created_by, updated_by)
  VALUES ('M29 other client', v_other_client, false, 'assigned', v_owner, v_owner)
  RETURNING id INTO v_other_task;

  PERFORM set_config('request.jwt.claim.sub', v_daniel::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  v_denied := false;
  BEGIN
    PERFORM public.post_task_message(v_other_task, 'Cross client', '{}', 'task_message');
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'FAIL daniel posted on other-client task';
  END IF;

  SELECT count(*) INTO v_notif_count
  FROM public.notifications
  WHERE recipient_id = v_daniel AND task_id = v_other_task;
  IF v_notif_count <> 0 THEN
    RAISE EXCEPTION 'FAIL unexpected notification for other-client task';
  END IF;

  DELETE FROM public.tasks WHERE id = v_other_task;
  IF EXISTS (SELECT 1 FROM public.clients WHERE id = v_other_client AND legal_name = 'M29 Cross Client Temp') THEN
    DELETE FROM public.clients WHERE id = v_other_client;
  END IF;

  DELETE FROM public.task_attachments WHERE id = v_att;

  RAISE NOTICE 'M29 PASS task=%', v_task;
END;
$$;
