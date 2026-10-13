import { FormEvent, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { labelPriority, labelStatus, TASK_PRIORITY_LABELS, TASK_STATUS_LABELS } from '../lib/labels';

type Client = { id: string; legal_name: string };
type Project = { id: string; name: string; code: string; client_id: string };
type Staff = { id: string; full_name: string; email: string };
type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  is_internal: boolean;
  client_id: string | null;
  project_id: string | null;
};
type LatestProgress = {
  body: string;
  created_at: string;
  author_id: string;
  progress_status: string | null;
};

export function TasksPage() {
  const { can, user } = useAuth();
  const canManage = can('tasks.manage');
  const canExecute = can('tasks.execute');
  const canAssign = can('tasks.assign');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<Task[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [latestProgress, setLatestProgress] = useState<Record<string, LatestProgress>>({});
  const [showForm, setShowForm] = useState(Boolean(params.get('projectId')));
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [internal, setInternal] = useState(!params.get('clientId'));
  const [clientId, setClientId] = useState(params.get('clientId') ?? '');
  const [projectId, setProjectId] = useState(params.get('projectId') ?? '');
  const [assigneeId, setAssigneeId] = useState('');
  const [priority, setPriority] = useState('normal');
  const [status, setStatus] = useState('backlog');
  const [dueAt, setDueAt] = useState('');
  const [filter, setFilter] = useState(params.get('filter') || 'open');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: c }, { data: p }, { data: s }, { data: t, error: err }, { data: a }, { data: notes }] =
      await Promise.all([
        supabase.from('clients').select('id, legal_name').order('legal_name'),
        supabase.from('projects').select('id, name, code, client_id').order('name'),
        supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('account_kind', 'staff')
          .eq('account_status', 'active')
          .order('full_name'),
        supabase
          .from('tasks')
          .select('id, title, status, priority, due_at, is_internal, client_id, project_id')
          .order('created_at', { ascending: false }),
        supabase
          .from('task_assignments')
          .select('task_id, assignee_profile_id, status')
          .eq('status', 'active'),
        supabase
          .from('task_progress_notes')
          .select('task_id, body, created_at, author_id, progress_status')
          .order('created_at', { ascending: false }),
      ]);
    setClients((c as Client[]) ?? []);
    setProjects((p as Project[]) ?? []);
    setStaff((s as Staff[]) ?? []);
    if (err) setError(err.message);
    else setRows((t as Task[]) ?? []);
    const map: Record<string, string> = {};
    for (const row of (a as Array<{ task_id: string; assignee_profile_id: string | null }>) ?? []) {
      if (row.assignee_profile_id) map[row.task_id] = row.assignee_profile_id;
    }
    setAssignments(map);
    const latest: Record<string, LatestProgress> = {};
    for (const row of (notes as Array<LatestProgress & { task_id: string }>) ?? []) {
      if (!latest[row.task_id]) {
        latest[row.task_id] = {
          body: row.body,
          created_at: row.created_at,
          author_id: row.author_id,
          progress_status: row.progress_status,
        };
      }
    }
    setLatestProgress(latest);
  }

  useEffect(() => {
    void load();
  }, []);

  const projectOptions = useMemo(
    () => (internal ? [] : projects.filter((p) => !clientId || p.client_id === clientId)),
    [projects, clientId, internal],
  );

  const visible = useMemo(() => {
    const now = Date.now();
    return rows.filter((r) => {
      if (filter === 'open') return !['done', 'cancelled'].includes(r.status);
      if (filter === 'mine') return assignments[r.id] === user?.id;
      if (filter === 'overdue') {
        return (
          !!r.due_at &&
          new Date(r.due_at).getTime() < now &&
          !['done', 'cancelled'].includes(r.status)
        );
      }
      return true;
    });
  }, [rows, filter, assignments, user?.id]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setError(null);
    if (!internal && !clientId) {
      setError('Select a client for non-internal tasks.');
      return;
    }
    const { data: created, error: err } = await supabase
      .from('tasks')
      .insert({
        title: title.trim(),
        description: description.trim() || null,
        is_internal: internal,
        client_id: internal ? null : clientId,
        project_id: internal ? null : projectId || null,
        status,
        priority,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        created_by: user?.id,
      })
      .select('id')
      .single();
    if (err || !created) {
      setError(err?.message ?? 'Create failed');
      return;
    }
    if (assigneeId && canAssign) {
      await supabase.from('task_assignments').insert({
        task_id: created.id,
        assignee_profile_id: assigneeId,
        assigned_by: user?.id,
        assignment_type: 'manual',
        status: 'active',
      });
      if (status === 'backlog') {
        await supabase.from('tasks').update({ status: 'assigned' }).eq('id', created.id);
      }
    }
    setTitle('');
    setDescription('');
    setDueAt('');
    setAssigneeId('');
    setShowForm(false);
    navigate(`/tasks/${created.id}`);
  }

  async function setTaskStatus(id: string, next: string, e: MouseEvent) {
    e.stopPropagation();
    // Quick Done is manage-only; execute users must submit for review on the detail page.
    if (!canManage) return;
    const { error: err } = await supabase
      .from('tasks')
      .update({
        status: next,
        completed_at: next === 'done' ? new Date().toISOString() : null,
        updated_by: user?.id,
      })
      .eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function startMine(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (!canExecute || canManage) return;
    if (assignments[id] !== user?.id) return;
    const { error: err } = await supabase
      .from('tasks')
      .update({ status: 'in_progress', updated_by: user?.id })
      .eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  const staffName = (id?: string) => staff.find((s) => s.id === id)?.full_name ?? 'Unassigned';

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Tasks</h1>
          <p>Work allocation with staff assignment and optional project links.</p>
        </div>
        {canManage ? (
          <div className="actions">
            <button type="button" onClick={() => setShowForm((v) => !v)}>
              {showForm ? 'Hide form' : '+ Add task'}
            </button>
          </div>
        ) : null}
      </header>

      {canManage && showForm ? (
        <form className="form-grid" onSubmit={onCreate}>
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="row-2">
            <label>
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                {Object.entries(TASK_PRIORITY_LABELS).map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
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
              <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </label>
            <label className="check" style={{ alignSelf: 'end', marginBottom: '0.6rem' }}>
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => {
                  setInternal(e.target.checked);
                  if (e.target.checked) {
                    setClientId('');
                    setProjectId('');
                  }
                }}
              />
              Internal (no client/project)
            </label>
          </div>
          {!internal ? (
            <div className="row-2">
              <label>
                Client
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
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
                <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">None</option>
                  {projectOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          {canAssign ? (
            <label>
              Assigned to
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {error ? <div className="error">{error}</div> : null}
          <button type="submit">Create task</button>
        </form>
      ) : null}

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">Open tasks</option>
          <option value="overdue">Overdue</option>
          <option value="mine">Assigned to me</option>
          <option value="all">All tasks</option>
        </select>
      </div>
      {error && !showForm ? <div className="error">{error}</div> : null}

      <div className="table-scroll">
        <table className="tasks-table">
          <thead>
            <tr>
              <th className="col-title">Title</th>
              <th className="col-scope">Scope</th>
              <th className="col-assignee">Assignee</th>
              <th className="col-priority">Priority</th>
              <th className="col-status">Status</th>
              <th className="col-due">Due</th>
              {canManage || canExecute ? <th className="col-actions">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.id}
                className="task-row is-clickable"
                tabIndex={0}
                role="link"
                aria-label={`Open task ${r.title}`}
                onClick={() => navigate(`/tasks/${r.id}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(`/tasks/${r.id}`);
                  }
                }}
              >
                <td className="col-title">
                  <span className="title-link">
                    {canManage && assignments[r.id]
                      ? `${staffName(assignments[r.id])} — ${r.title}`
                      : r.title}
                  </span>
                  {canManage && latestProgress[r.id] ? (
                    <div className="muted-sm task-latest-progress">
                      Status: {labelStatus(latestProgress[r.id].progress_status ?? r.status)}
                      <br />
                      Note: {latestProgress[r.id].body}
                      <br />
                      Last updated:{' '}
                      {new Date(latestProgress[r.id].created_at).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </div>
                  ) : null}
                </td>
                <td className="col-scope">{r.is_internal ? 'Internal' : 'Client/project'}</td>
                <td className="col-assignee">{staffName(assignments[r.id])}</td>
                <td className="col-priority">{labelPriority(r.priority)}</td>
                <td className="col-status">{labelStatus(r.status)}</td>
                <td className="col-due">
                  {r.due_at ? new Date(r.due_at).toLocaleDateString() : '—'}
                </td>
                {canManage ? (
                  <td className="col-actions actions">
                    {r.status !== 'in_progress' && r.status !== 'done' ? (
                      <button
                        type="button"
                        onClick={(e) => void setTaskStatus(r.id, 'in_progress', e)}
                      >
                        Start
                      </button>
                    ) : null}
                    {r.status !== 'done' && r.status !== 'cancelled' ? (
                      <button type="button" onClick={(e) => void setTaskStatus(r.id, 'done', e)}>
                        Done
                      </button>
                    ) : null}
                  </td>
                ) : canExecute && assignments[r.id] === user?.id && r.status !== 'done' ? (
                  <td className="col-actions actions">
                    {r.status !== 'in_progress' && r.status !== 'in_review' ? (
                      <button type="button" onClick={(e) => void startMine(r.id, e)}>
                        Start
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="secondary"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/tasks/${r.id}`);
                      }}
                    >
                      Progress
                    </button>
                  </td>
                ) : canManage || canExecute ? (
                  <td className="col-actions">—</td>
                ) : null}
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7}>No tasks in this view.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
