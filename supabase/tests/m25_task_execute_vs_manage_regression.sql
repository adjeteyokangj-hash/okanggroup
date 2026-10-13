-- M25 regression: tasks.execute vs manage
-- Impersonates Daniel via request.jwt.claims + SET LOCAL ROLE authenticated for RLS/trigger checks.
-- SECURITY DEFINER RPCs use JWT claims only.
-- Safe to re-run; creates a temporary test task then deletes it. Preserves historical tasks.

DO $$
DECLARE
  v_daniel uuid;
  v_owner uuid;
  v_client uuid := 'dedbd3bd-1a58-4162-b090-3e7d9f52a46e';
  v_project uuid := '6671ff83-9146-46ef-96df-fd4f4a0766b0';
  v_other uuid;
  v_task uuid;
  v_other_task uuid;
  v_priority text;
  v_title text;
  v_status text;
  v_cnt int;
  v_owner_perms int;
  v_mgr_missing text;
BEGIN
  SELECT id INTO v_daniel FROM public.profiles WHERE email = 'daniel.uat@okangroup.test';
  SELECT id INTO v_owner FROM public.profiles WHERE email = 'okanggroup@gmail.com';
  SELECT id INTO v_other FROM public.clients WHERE id <> v_client LIMIT 1;
  IF v_daniel IS NULL OR v_owner IS NULL THEN
    RAISE EXCEPTION 'FAIL: Daniel or Owner profile missing';
  END IF;

  SELECT string_agg(r.code, ',') INTO v_mgr_missing
  FROM public.roles r
  WHERE r.code IN ('owner','platform_admin','operations_manager','department_manager','team_manager')
    AND NOT EXISTS (
      SELECT 1 FROM public.role_permissions rp
      JOIN public.permissions p ON p.id = rp.permission_id AND p.code = 'tasks.manage'
      WHERE rp.role_id = r.id
    );
  IF v_mgr_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: tasks.manage missing on %', v_mgr_missing;
  END IF;

  IF EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id AND r.code = 'staff'
    JOIN permissions p ON p.id = rp.permission_id AND p.code = 'tasks.manage'
  ) THEN
    RAISE EXCEPTION 'FAIL: staff still has tasks.manage';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id AND r.code = 'staff'
    JOIN permissions p ON p.id = rp.permission_id AND p.code = 'tasks.execute'
  ) THEN
    RAISE EXCEPTION 'FAIL: staff missing tasks.execute';
  END IF;

  SELECT count(*) INTO v_owner_perms
  FROM role_permissions rp JOIN roles r ON r.id = rp.role_id AND r.code = 'owner';
  IF v_owner_perms <> 21 THEN
    RAISE EXCEPTION 'FAIL N10: Owner perms=%', v_owner_perms;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = v_owner AND mfa_required = true
  ) THEN
    RAISE EXCEPTION 'FAIL N10b: Owner mfa_required cleared';
  END IF;

  INSERT INTO tasks (title, description, client_id, project_id, is_internal, status, priority, created_by, requires_approval)
  VALUES ('M25 N-pack', 'Keep me', v_client, v_project, false, 'assigned', 'normal', v_owner, true)
  RETURNING id INTO v_task;
  INSERT INTO task_assignments (task_id, assignee_profile_id, assigned_by, assignment_type, status)
  VALUES (v_task, v_daniel, v_owner, 'manual', 'active');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  BEGIN
    UPDATE tasks SET title = 'HACKED' WHERE id = v_task;
    RAISE EXCEPTION 'FAIL N1';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL N1' THEN RAISE; END IF;
  END;

  BEGIN
    UPDATE tasks SET priority = 'urgent' WHERE id = v_task;
    RAISE EXCEPTION 'FAIL N2';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL N2' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO tasks (title, client_id, is_internal, status, created_by)
    VALUES ('nope', v_client, false, 'backlog', v_daniel);
    RAISE EXCEPTION 'FAIL N9';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL N9' THEN RAISE; END IF;
  END;

  UPDATE tasks SET status = 'in_progress', updated_by = v_daniel WHERE id = v_task;

  BEGIN
    UPDATE tasks SET status = 'done', completed_at = now() WHERE id = v_task;
    RAISE EXCEPTION 'FAIL N4';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL N4' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM decide_task_completion(v_task, true, 'self');
    RAISE EXCEPTION 'FAIL N5';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FAIL N5' THEN RAISE; END IF;
  END;

  PERFORM add_task_progress_note(v_task, 'Work evidence note');
  PERFORM submit_task_for_review(v_task, 'Please review');

  RESET ROLE;
  SELECT title, priority, status INTO v_title, v_priority, v_status FROM tasks WHERE id = v_task;
  IF v_title <> 'M25 N-pack' OR v_priority <> 'normal' OR v_status <> 'in_review' THEN
    RAISE EXCEPTION 'FAIL post-daniel state title=% pri=% status=%', v_title, v_priority, v_status;
  END IF;

  IF v_other IS NOT NULL THEN
    INSERT INTO tasks (title, client_id, is_internal, status, created_by, requires_approval)
    VALUES ('M25 other', v_other, false, 'assigned', v_owner, true) RETURNING id INTO v_other_task;
    INSERT INTO task_assignments (task_id, assignee_profile_id, assigned_by, assignment_type, status)
    VALUES (v_other_task, v_daniel, v_owner, 'manual', 'active');

    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE tasks SET status = 'in_progress' WHERE id = v_other_task;
    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    RESET ROLE;
    SELECT status INTO v_status FROM tasks WHERE id = v_other_task;
    IF v_status <> 'assigned' THEN
      RAISE EXCEPTION 'FAIL N7 status=% rows=%', v_status, v_cnt;
    END IF;
    DELETE FROM tasks WHERE id = v_other_task;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM decide_task_completion(v_task, false, 'Needs fixes');
  SELECT status INTO v_status FROM tasks WHERE id = v_task;
  IF v_status <> 'in_progress' THEN RAISE EXCEPTION 'FAIL reject %', v_status; END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_daniel::text, 'role', 'authenticated')::text, true);
  PERFORM submit_task_for_review(v_task, 'Fixed');

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner::text, 'role', 'authenticated')::text, true);
  PERFORM decide_task_completion(v_task, true, 'Approved');
  SELECT status INTO v_status FROM tasks WHERE id = v_task;
  IF v_status <> 'done' THEN RAISE EXCEPTION 'FAIL N6 %', v_status; END IF;

  IF EXISTS (
    SELECT 1 FROM tasks WHERE id = '18c9c9a1-8626-469f-a374-6af6266c12e9'
  ) AND NOT EXISTS (
    SELECT 1 FROM tasks
    WHERE id = '18c9c9a1-8626-469f-a374-6af6266c12e9'
      AND status = 'done'
      AND requires_approval = false
  ) THEN
    RAISE EXCEPTION 'FAIL history: pre-existing done task altered';
  END IF;

  DELETE FROM tasks WHERE id = v_task;
  RAISE NOTICE 'PASS M25 N1–N10 regression';
END $$;
