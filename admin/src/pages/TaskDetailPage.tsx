import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  labelPriority,
  labelStatus,
  STAFF_NOTE_REQUIRED_STATUSES,
  STAFF_PROGRESS_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '../lib/labels';
import { TaskFilesPanel } from '../components/TaskFilesPanel';
import { TaskConversationPanel } from '../components/TaskConversationPanel';

type Client = { id: string; legal_name: string };
type Project = { id: string; name: string; code: string; client_id: string };
type Staff = { id: string; full_name: string };
type Note = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  progress_status: string | null;
};
type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  is_internal: boolean;
  client_id: string | null;
  project_id: string | null;
  requires_approval: boolean;
  cms_instance_id: string | null;
};

type CmsLink = { id: string; display_name: string; external_admin_url: string | null };

function defaultProgressStatus(status: string): string {
  if (status in STAFF_PROGRESS_STATUS_LABELS) return status;
  return 'in_progress';
}

export function TaskDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const canManage = can('tasks.manage');
  const canExecute = can('tasks.execute');
  const canAssign = can('tasks.assign');
  const canDecide = can('approvals.decide') || canManage;
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [cmsLink, setCmsLink] = useState<CmsLink | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [isAssignee, setIsAssignee] = useState(false);
  const [progressStatus, setProgressStatus] = useState('in_progress');
  const [progressNote, setProgressNote] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [conversationKey, setConversationKey] = useState(0);
  const [clientLabel, setClientLabel] = useState<string | null>(null);
  const [projectLabel, setProjectLabel] = useState<string | null>(null);
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({});

  const canProgress =
    !canManage &&
    canExecute &&
    isAssignee &&
    task &&
    !['done', 'cancelled'].includes(task.status);

  const progressEditable = Boolean(canProgress && task && task.status !== 'in_review');
  const canUploadWork = Boolean(
    canManage || (canExecute && isAssignee && task && !['done', 'cancelled'].includes(task.status)),
  );
  const canPostMessage = Boolean(
    canManage || (canExecute && isAssignee && task && !['done', 'cancelled'].includes(task.status)),
  );

  async function load() {
    if (!id) return;
    const [{ data, error: err }, { data: c }, { data: p }, { data: s }, { data: a }, { data: n }] =
      await Promise.all([
        supabase
          .from('tasks')
          .select(
            'id, title, description, status, priority, due_at, is_internal, client_id, project_id, requires_approval, cms_instance_id',
          )
          .eq('id', id)
          .maybeSingle(),
        supabase.from('clients').select('id, legal_name').order('legal_name'),
        supabase.from('projects').select('id, name, code, client_id').order('name'),
        supabase
          .from('profiles')
          .select('id, full_name')
          .eq('account_kind', 'staff')
          .eq('account_status', 'active')
          .order('full_name'),
        supabase
          .from('task_assignments')
          .select('assignee_profile_id')
          .eq('task_id', id)
          .eq('status', 'active')
          .maybeSingle(),
        supabase
          .from('task_progress_notes')
          .select('id, body, created_at, author_id, progress_status')
          .eq('task_id', id)
          .order('created_at', { ascending: false }),
      ]);
    if (err || !data) {
      setError(err?.message ?? 'Task not found');
      return;
    }
    const t = data as Task;
    setTask(t);
    setProgressStatus(defaultProgressStatus(t.status));
    setClients((c as Client[]) ?? []);
    setProjects((p as Project[]) ?? []);
    setStaff((s as Staff[]) ?? []);
    setAssigneeId(a?.assignee_profile_id ?? '');
    setIsAssignee(Boolean(a?.assignee_profile_id && a.assignee_profile_id === user?.id));
    setNotes((n as Note[]) ?? []);

    const { data: ctx } = await supabase.rpc('task_display_context', { p_task_id: id });
    const context = ctx as {
      client_name?: string | null;
      project_code?: string | null;
      project_name?: string | null;
      participant_names?: Record<string, string>;
    } | null;
    if (context) {
      setClientLabel(context.client_name ?? null);
      setProjectLabel(
        context.project_code || context.project_name
          ? [context.project_code, context.project_name].filter(Boolean).join(' — ')
          : null,
      );
      setParticipantNames(context.participant_names ?? {});
    } else {
      setClientLabel(null);
      setProjectLabel(null);
      setParticipantNames({});
    }

    if (t.cms_instance_id) {
      const { data: cms } = await supabase
        .from('cms_instances')
        .select('id, display_name, external_admin_url')
        .eq('id', t.cms_instance_id)
        .maybeSingle();
      setCmsLink((cms as CmsLink) ?? null);
    } else {
      setCmsLink(null);
    }
  }

  useEffect(() => {
    void load();
  }, [id, user?.id]);

  const projectOptions = useMemo(() => {
    if (!task || task.is_internal) return [];
    return projects.filter((p) => !task.client_id || p.client_id === task.client_id);
  }, [projects, task]);

  const noteRequired = STAFF_NOTE_REQUIRED_STATUSES.has(progressStatus);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!task || !canManage) return;
    setError(null);
    setMessage(null);
    if (!task.is_internal && !task.client_id) {
      setError('Select a client for non-internal tasks.');
      return;
    }
    const { error: err } = await supabase
      .from('tasks')
      .update({
        title: task.title.trim(),
        description: task.description?.trim() || null,
        status: task.status,
        priority: task.priority,
        due_at: task.due_at,
        is_internal: task.is_internal,
        client_id: task.is_internal ? null : task.client_id,
        project_id: task.is_internal ? null : task.project_id,
        completed_at: task.status === 'done' ? new Date().toISOString() : null,
        updated_by: user?.id,
      })
      .eq('id', task.id);
    if (err) {
      setError(err.message);
      return;
    }

    if (canAssign) {
      await supabase
        .from('task_assignments')
        .update({ status: 'reassigned' })
        .eq('task_id', task.id)
        .eq('status', 'active');
      if (assigneeId) {
        const { error: aErr } = await supabase.from('task_assignments').insert({
          task_id: task.id,
          assignee_profile_id: assigneeId,
          assigned_by: user?.id,
          assignment_type: 'manual',
          status: 'active',
        });
        if (aErr) {
          setError(aErr.message);
          return;
        }
      }
    }

    setMessage('Task updated.');
    await load();
  }

  async function saveProgress(e: FormEvent) {
    e.preventDefault();
    if (!task || !progressEditable) return;
    setError(null);
    setMessage(null);
    if (noteRequired && !progressNote.trim()) {
      setError('A progress note is required for Blocked, On Hold or Awaiting Information.');
      return;
    }
    const { error: err } = await supabase.rpc('save_task_progress', {
      p_task_id: task.id,
      p_status: progressStatus,
      p_note: progressNote.trim() || null,
    });
    if (err) setError(err.message);
    else {
      setProgressNote('');
      setMessage('Progress saved.');
      await load();
    }
  }

  async function submitForReview() {
    if (!task || !canProgress || task.status === 'in_review') return;
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc('submit_task_for_review', {
      p_task_id: task.id,
      p_note: reviewNote.trim() || null,
    });
    if (err) setError(err.message);
    else {
      setReviewNote('');
      setMessage('Submitted for review.');
      await load();
    }
  }

  async function decide(approve: boolean) {
    if (!task || !canDecide) return;
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc('decide_task_completion', {
      p_task_id: task.id,
      p_approve: approve,
      p_note: reviewNote.trim() || null,
    });
    if (err) setError(err.message);
    else {
      setReviewNote('');
      setMessage(approve ? 'Task approved and completed.' : 'Task returned to In Progress.');
      await load();
    }
  }

  if (!task) return <div className="center">{error ?? 'Loading…'}</div>;

  const dueDate = task.due_at ? task.due_at.slice(0, 10) : '';
  const staffNames = {
    ...Object.fromEntries(staff.map((s) => [s.id, s.full_name])),
    ...participantNames,
  };
  const staffName = (sid: string) => staffNames[sid] ?? sid;
  // Chronological history: oldest first for reading; notes loaded newest-first
  const history = [...notes].reverse();

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{task.title}</h1>
          <p>
            {labelStatus(task.status)} · {labelPriority(task.priority)} ·{' '}
            {task.is_internal ? 'Internal' : 'Client/project'}
            {task.requires_approval ? ' · Approval required' : ''}
          </p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => navigate('/tasks')}>
            Back to tasks
          </button>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <form className="form-grid" onSubmit={save}>
        <label>
          Title
          <input
            value={task.title}
            disabled={!canManage}
            onChange={(e) => setTask({ ...task, title: e.target.value })}
            required
          />
        </label>
        <label>
          Description
          <textarea
            value={task.description ?? ''}
            disabled={!canManage}
            onChange={(e) => setTask({ ...task, description: e.target.value || null })}
          />
        </label>
        <div className="row-2">
          <label>
            Priority
            <select
              value={task.priority}
              disabled={!canManage}
              onChange={(e) => setTask({ ...task, priority: e.target.value })}
            >
              {Object.entries(TASK_PRIORITY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={task.status}
              disabled={!canManage}
              onChange={(e) => setTask({ ...task, status: e.target.value })}
            >
              {Object.entries(TASK_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row-2">
          <label>
            Due date
            <input
              type="date"
              value={dueDate}
              disabled={!canManage}
              onChange={(e) =>
                setTask({
                  ...task,
                  due_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </label>
          <label className="check" style={{ alignSelf: 'end', marginBottom: '0.6rem' }}>
            <input
              type="checkbox"
              checked={task.is_internal}
              disabled={!canManage}
              onChange={(e) =>
                setTask({
                  ...task,
                  is_internal: e.target.checked,
                  client_id: e.target.checked ? null : task.client_id,
                  project_id: e.target.checked ? null : task.project_id,
                })
              }
            />
            Internal (no client/project)
          </label>
        </div>
        {!task.is_internal ? (
          <div className="row-2">
            {canManage ? (
              <>
                <label>
                  Client
                  <select
                    value={task.client_id ?? ''}
                    onChange={(e) =>
                      setTask({ ...task, client_id: e.target.value || null, project_id: null })
                    }
                    required
                  >
                    <option value="">Select…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Project
                  <select
                    value={task.project_id ?? ''}
                    onChange={(e) => setTask({ ...task, project_id: e.target.value || null })}
                  >
                    <option value="">None</option>
                    {projectOptions.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Client
                  <input value={clientLabel ?? '—'} readOnly disabled />
                </label>
                <label>
                  Project
                  <input value={projectLabel ?? '—'} readOnly disabled />
                </label>
              </>
            )}
          </div>
        ) : null}
        <label>
          Assigned to
          <select
            value={assigneeId}
            disabled={!canAssign}
            onChange={(e) => setAssigneeId(e.target.value)}
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </label>
        {canManage || canAssign ? <button type="submit">Save task</button> : null}
      </form>

      {task ? (
        <TaskFilesPanel
          taskId={task.id}
          clientId={task.client_id}
          canManage={canManage}
          canUploadWork={canUploadWork}
          staffNames={staffNames}
          onNotifyPosted={() => setConversationKey((k) => k + 1)}
        />
      ) : null}

      {task ? (
        <TaskConversationPanel
          key={conversationKey}
          taskId={task.id}
          canPost={canPostMessage}
          staffNames={staffNames}
        />
      ) : null}

      {cmsLink ? (
        <div className="panel" style={{ marginTop: '1.25rem' }}>
          <h2>Client CMS</h2>
          <p className="muted-sm">{cmsLink.display_name}</p>
          {cmsLink.external_admin_url ? (
            <a href={cmsLink.external_admin_url} target="_blank" rel="noreferrer" className="button-link secondary">
              Open authorised CMS
            </a>
          ) : (
            <p className="muted-sm">CMS registered — admin URL not set yet.</p>
          )}
        </div>
      ) : null}

      {canProgress ? (
        <form className="form-grid" style={{ marginTop: '1.5rem' }} onSubmit={saveProgress}>
          <h2>Your Progress</h2>
          <p>
            Update progress status and add a note. Task instructions stay fixed. Approved and
            Completed are set only after management review.
          </p>
          {task.status === 'in_review' ? (
            <p className="ok">Waiting for management approval. Progress updates are paused.</p>
          ) : null}
          <label>
            Progress status
            <select
              value={progressStatus}
              disabled={!progressEditable}
              onChange={(e) => setProgressStatus(e.target.value)}
            >
              {Object.entries(STAFF_PROGRESS_STATUS_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Progress note
            <textarea
              value={progressNote}
              disabled={!progressEditable}
              onChange={(e) => setProgressNote(e.target.value)}
              placeholder={
                noteRequired
                  ? 'Required: explain why this is blocked, on hold, or what information you need'
                  : 'Describe what you have done'
              }
              required={noteRequired}
            />
          </label>
          {progressEditable ? <button type="submit">Save Progress</button> : null}

          <label>
            Submit note (optional)
            <textarea
              value={reviewNote}
              disabled={task.status === 'in_review'}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Summary for the reviewer when work is finished"
            />
          </label>
          {task.status !== 'in_review' ? (
            <button type="button" onClick={() => void submitForReview()}>
              Submit for Review
            </button>
          ) : null}
        </form>
      ) : null}

      {canDecide && task.status === 'in_review' ? (
        <div className="form-grid" style={{ marginTop: '1.5rem' }}>
          <h2>Review completion</h2>
          <label>
            Decision note
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Approval or rejection feedback"
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void decide(true)}>
              Approve &amp; complete
            </button>
            <button type="button" className="secondary" onClick={() => void decide(false)}>
              Reject (return to In Progress)
            </button>
          </div>
        </div>
      ) : null}

      {history.length > 0 ? (
        <div style={{ marginTop: '1.5rem' }}>
          <h2>Progress history</h2>
          <ul className="progress-history">
            {history.map((n) => (
              <li key={n.id}>
                <div>
                  <strong>{staffName(n.author_id)}</strong>
                  {n.progress_status ? <> · {labelStatus(n.progress_status)}</> : null}
                  <span className="muted-sm"> · {new Date(n.created_at).toLocaleString()}</span>
                </div>
                <div>{n.body}</div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
