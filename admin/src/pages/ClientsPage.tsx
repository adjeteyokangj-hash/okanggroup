import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Client = {
  id: string;
  client_code: string;
  legal_name: string;
  trading_name: string | null;
  primary_email: string | null;
  status: string;
  updated_at: string;
};

export function ClientsPage() {
  const { can } = useAuth();
  const canManage = can('clients.manage');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Client[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('clients')
        .select('id, client_code, legal_name, trading_name, primary_email, status, updated_at')
        .order('legal_name');
      if (err) setError(err.message);
      else setRows((data as Client[]) ?? []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!needle) return true;
      return [r.client_code, r.legal_name, r.trading_name, r.primary_email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, status]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Clients</h1>
          <p>Search the directory, then open a client profile for contacts and projects.</p>
        </div>
        {canManage ? (
          <div className="actions">
            <Link to="/clients/new">
              <button type="button">+ Add client</button>
            </Link>
          </div>
        ) : null}
      </header>
      <div className="toolbar">
        <input
          placeholder="Search code, name, email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="prospect">Prospect</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Legal name</th>
            <th>Trading name</th>
            <th>Email</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} onClick={() => navigate(`/clients/${r.id}`)}>
              <td>{r.client_code}</td>
              <td>{r.legal_name}</td>
              <td>{r.trading_name || '—'}</td>
              <td>{r.primary_email || '—'}</td>
              <td>{r.status}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={5}>No clients match.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
