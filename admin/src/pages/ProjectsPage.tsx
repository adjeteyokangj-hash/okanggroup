import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Project = {
  id: string;
  code: string;
  name: string;
  stage: string;
  status: string;
  client_id: string;
  target_end_on: string | null;
  clients?: { legal_name: string } | null;
};

export function ProjectsPage() {
  const { can } = useAuth();
  const canManage = can('projects.manage');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Project[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('projects')
        .select('id, code, name, stage, status, client_id, target_end_on, clients(legal_name)')
        .order('name');
      if (err) setError(err.message);
      else {
        setRows(
          ((data as Array<Omit<Project, 'clients'> & { clients: Project['clients'] | Project['clients'][] }>) ?? []).map(
            (row) => ({
              ...row,
              clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
            }),
          ),
        );
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!needle) return true;
      const clientName = r.clients?.legal_name ?? '';
      return [r.code, r.name, r.stage, clientName].some((v) => v.toLowerCase().includes(needle));
    });
  }, [rows, q, status]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Projects</h1>
          <p>Delivery projects with automatic codes (OKG-PR-######). Open a row for details.</p>
        </div>
        {canManage ? (
          <div className="actions">
            <Link to="/projects/new">
              <button type="button">+ Add project</button>
            </Link>
          </div>
        ) : null}
      </header>
      <div className="toolbar">
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="on_hold">On hold</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Client</th>
            <th>Stage</th>
            <th>Status</th>
            <th>Target end</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} onClick={() => navigate(`/projects/${r.id}`)}>
              <td>{r.code}</td>
              <td>{r.name}</td>
              <td>{r.clients?.legal_name ?? '—'}</td>
              <td>{r.stage}</td>
              <td>{r.status}</td>
              <td>{r.target_end_on ?? '—'}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={6}>No projects match.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
