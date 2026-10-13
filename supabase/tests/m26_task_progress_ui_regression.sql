-- M26: save_task_progress + note-required statuses (dev regression)

DO $$
DECLARE
  v_daniel uuid;
  v_owner uuid;
  v_client uuid := 'dedbd3bd-1a58-4162-b090-3e7d9f52a46e';
  v_project uuid := '6671ff83-9146-46ef-96df-fd4f4a0766b0';
  v_task uuid;
  v_status text;
  v_note_count int;
  v_owner_perms int;
BEGIN
  SELECT id INTO v_daniel FROM profiles WHERE email = 'daniel.uat@okangroup.test';
  SELECT id INTO v_owner FROM profiles WHERE email = 'okanggroup@gmail.com';

  INSERT INTO tasks (title, description, client_id, project_id, is_internal, status, priority, created_by, requires_approval)
  VALUES ('M26 progress UI', 'Keep instructions', v_client, v_project, false, 'assigned', 'normal', v_owner, true)
  RETURNING id INTO v_task;
  INSERT INTO task_assignments (task_id, assignee_profile_id, assigned_by, assignment_type, status)
  VALUES (v_task, v_daniel, v_owner, 'manual', 'active');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM save_task_progress(v_task, 'blocked', NULL);
    RAISE EXCEPTION 'FAIL note-required';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL note-required' THEN RAISE; END IF;
  END;

  PERFORM save_task_progress(v_task, 'blocked', 'Waiting for approved homepage images');
  PERFORM save_task_progress(v_task, 'on_hold', 'Paused pending brand pack');
  PERFORM save_task_progress(v_task, 'awaiting_information', 'Need final logo SVG');
  PERFORM save_task_progress(v_task, 'in_progress', 'Resumed design work');

  BEGIN
    PERFORM save_task_progress(v_task, 'done', 'nope');
    RAISE EXCEPTION 'FAIL done';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL done' THEN RAISE; END IF;
  END;

  SELECT count(*) INTO v_note_count FROM task_progress_notes WHERE task_id = v_task;
  IF v_note_count < 4 THEN RAISE EXCEPTION 'FAIL history count %', v_note_count; END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE tasks SET title = 'HACK' WHERE id = v_task;
    RAISE EXCEPTION 'FAIL title';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL title' THEN RAISE; END IF;
  END;
  RESET ROLE;

  SELECT count(*) INTO v_owner_perms FROM role_permissions rp JOIN roles r ON r.id = rp.role_id AND r.code = 'owner';
  IF v_owner_perms <> 21 THEN RAISE EXCEPTION 'FAIL owner perms %', v_owner_perms; END IF;

  DELETE FROM tasks WHERE id = v_task;
  RAISE NOTICE 'PASS M26 progress UI';
END $$;
