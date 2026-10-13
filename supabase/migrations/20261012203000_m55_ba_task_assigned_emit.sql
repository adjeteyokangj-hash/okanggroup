-- M55: Emit in-app task_assigned when a staff member is assigned

CREATE OR REPLACE FUNCTION private.notify_task_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_task public.tasks%ROWTYPE;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' OR NEW.assignee_profile_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.assignee_profile_id IS NOT DISTINCT FROM NEW.assignee_profile_id
     AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Do not notify the actor assigning themselves
  IF NEW.assignee_profile_id = auth.uid() THEN
    RETURN NEW;
  END IF;

  PERFORM public.emit_notification(
    NEW.assignee_profile_id,
    'task_assigned',
    'New task assignment',
    left(COALESCE(v_task.title, 'Task'), 200),
    'task_assigned:' || NEW.task_id::text || ':' || NEW.assignee_profile_id::text,
    'info',
    NULL,
    v_task.client_id,
    v_task.project_id,
    NULL,
    v_task.id,
    'task',
    v_task.id,
    '/tasks/' || v_task.id::text,
    '["in_app"]'::jsonb,
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_assignments_notify ON public.task_assignments;
CREATE TRIGGER trg_task_assignments_notify
  AFTER INSERT OR UPDATE OF assignee_profile_id, status ON public.task_assignments
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_task_assigned();
