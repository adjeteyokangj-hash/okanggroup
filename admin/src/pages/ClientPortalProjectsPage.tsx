import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { labelStatus } from '../lib/projectOps';
import { supabase } from '../lib/supabase';

type Project = {
  id: string;
  code: string;
  name: string;
  stage: string;
  status: string;
  target_end_on: string | null;
  summary: string | null;
};

type Deliverable = {
  id: string;
  name: string;
  status: string;
  project_id: string;
  due_on: string | null;
};

type ChangeRequest = {
  id: string;
  title: string;
  status: string;
  project_id: string;
  description: string;
};

export function ClientPortalProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [crTitle, setCrTitle] = useState('');
  const [crDesc, setCrDesc] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [{ data: p, error: pErr }, { data: d }, { data: cr }] = await Promise.all([
      supabase
        .from('projects')
        .select('id, code, name, stage, status, target_end_on, summary')
        .order('name'),
      supabase
        .from('project_deliverables')
        .select('id, name, status, project_id, due_on')
        .order('name'),
      supabase
        .from('change_requests')
        .select('id, title, status, project_id, description')
        .order('created_at', { ascending: false }),
    ]);
    if (pErr) setError(pErr.message);
    else {
      const list = (p as Project[]) ?? [];
      setProjects(list);
      if (!selectedProjectId && list[0]) setSelectedProjectId(list[0].id);
    }
    setDeliverables((d as Deliverable[]) ?? []);
    setChangeRequests((cr as ChangeRequest[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function decide(deliverableId: string, approve: boolean) {
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('client_decide_deliverable', {
      p_deliverable_id: deliverableId,
      p_approve: approve,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(approve ? 'Deliverable approved.' : 'Deliverable returned for rework.');
      setNote('');
      await load();
    }
  }

  async function submitCr(e: FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('client_submit_change_request', {
      p_project_id: selectedProjectId,
      p_title: crTitle.trim(),
      p_description: crDesc,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setCrTitle('');
      setCrDesc('');
      setMessage('Change request submitted to OkangGroup.');
      await load();
    }
  }

  const projectDeliverables = deliverables.filter((d) =>
    selectedProjectId ? d.project_id === selectedProjectId : true,
  );
  const projectCrs = changeRequests.filter((c) =>
    selectedProjectId ? c.project_id === selectedProjectId : true,
  );
  const awaiting = projectDeliverables.filter((d) => d.status === 'ready_for_review');

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Progress, deliverable acceptance and change requests for your organisation.</p>
        </div>
        <div className="page-head-actions">
          <Link to="/portal/documents">
            <button type="button" className="secondary">
              Documents
            </button>
          </Link>
          <Link to="/portal/invoices">
            <button type="button" className="secondary">
              Invoices
            </button>
          </Link>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {projects.length > 1 ? (
        <label className="form-compact" style={{ display: 'block', marginBottom: '1rem' }}>
          Focus project
          <select value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Target</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr
              key={p.id}
              style={{ cursor: 'pointer' }}
              className={p.id === selectedProjectId ? 'is-selected' : undefined}
              onClick={() => setSelectedProjectId(p.id)}
            >
              <td>{p.code}</td>
              <td>{p.name}</td>
              <td>{labelStatus(p.stage)}</td>
              <td>{labelStatus(p.status)}</td>
              <td>{p.target_end_on ?? '—'}</td>
            </tr>
          ))}
          {projects.length === 0 ? (
            <tr>
              <td colSpan={5}>No projects visible yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {awaiting.length > 0 ? (
        <div className="panel" style={{ marginTop: '1rem' }}>
          <h2>Awaiting your acceptance</h2>
          <label>
            Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <table>
            <thead>
              <tr>
                <th>Deliverable</th>
                <th>Due</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {awaiting.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.due_on ?? '—'}</td>
                  <td className="actions">
                    <button type="button" disabled={busy} onClick={() => void decide(d.id, true)}>
                      Approve
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void decide(d.id, false)}
                    >
                      Request changes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h2>Deliverables</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {projectDeliverables.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{labelStatus(d.status)}</td>
                <td>{d.due_on ?? '—'}</td>
              </tr>
            ))}
            {projectDeliverables.length === 0 ? (
              <tr>
                <td colSpan={3}>No deliverables yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: '1rem' }}>
        <h2>Change requests</h2>
        {selectedProjectId ? (
          <form className="form-compact" onSubmit={(e) => void submitCr(e)}>
            <label>
              Title
              <input value={crTitle} onChange={(e) => setCrTitle(e.target.value)} required />
            </label>
            <label>
              Details
              <textarea rows={3} value={crDesc} onChange={(e) => setCrDesc(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>
              Submit change request
            </button>
          </form>
        ) : null}
        <table style={{ marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th>Title</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {projectCrs.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.title}
                  {c.description ? <div className="muted-sm">{c.description}</div> : null}
                </td>
                <td>{labelStatus(c.status)}</td>
              </tr>
            ))}
            {projectCrs.length === 0 ? (
              <tr>
                <td colSpan={2}>No change requests yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="muted-sm">
        <Link to="/portal">Back to portal home</Link>
        {' · '}
        <Link to="/portal/documents">Approve documents</Link>
      </p>
    </section>
  );
}
