import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Row = {
  id: string;
  can_view: boolean;
  can_edit: boolean;
  can_submit: boolean;
  can_publish: boolean;
  cms_instances: {
    id: string;
    display_name: string;
    status: string;
    cms_config_type: string;
    clients: { legal_name: string } | { legal_name: string }[] | null;
  } | null;
};

type PendingDoc = {
  id: string;
  title: string;
  status: string;
  cms_instance_id: string;
  updated_at: string;
};

export function ClientPortalHomePage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [published, setPublished] = useState<PendingDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    const [{ data, error: err }, { data: docs }] = await Promise.all([
      supabase
        .from('cms_instance_grants')
        .select(
          'id, can_view, can_edit, can_submit, can_publish, cms_instances(id, display_name, status, cms_config_type, clients(legal_name))',
        )
        .eq('profile_id', user.id)
        .is('revoked_at', null),
      supabase
        .from('client_cms_documents')
        .select('id, title, status, cms_instance_id, updated_at')
        .order('updated_at', { ascending: false })
        .limit(40),
    ]);
    if (err) setError(err.message);
    else setRows((data as unknown as Row[]) ?? []);
    const list = (docs as PendingDoc[]) ?? [];
    setPending(list.filter((d) => d.status === 'awaiting_client_approval'));
    setPublished(list.filter((d) => d.status === 'published').slice(0, 8));
  }

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user?.id]);

  async function clientDecide(docId: string, approve: boolean) {
    setBusyId(docId);
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.rpc('client_decide_cms_document', {
      p_document_id: docId,
      p_approve: approve,
      p_note: null,
    });
    setBusyId(null);
    if (err) setError(err.message);
    else {
      setMessage(approve ? 'Approved — awaiting authorised publish.' : 'Returned for revision.');
      await load();
    }
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Client portal</h1>
          <p>Your authorised website CMS systems only — not OkangGroup internal operations.</p>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="success">{message}</div> : null}

      <div className="stat-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat">
          <div className="stat-label">CMS systems</div>
          <div className="stat-value">{rows.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Pending approvals</div>
          <div className="stat-value">{pending.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Recently published</div>
          <div className="stat-value">{published.length}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>My Website</h2>
        <table>
          <thead>
            <tr>
              <th>Website</th>
              <th>Type</th>
              <th>Access</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cms = Array.isArray(r.cms_instances) ? r.cms_instances[0] : r.cms_instances;
              if (!cms) return null;
              const client = Array.isArray(cms.clients) ? cms.clients[0] : cms.clients;
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{cms.display_name}</strong>
                    <div className="muted-sm">{client?.legal_name ?? 'Your organisation'}</div>
                  </td>
                  <td className="muted-sm">{cms.cms_config_type}</td>
                  <td className="muted-sm">
                    view
                    {r.can_edit ? ' · edit' : ''}
                    {r.can_submit ? ' · submit' : ''}
                    {r.can_publish ? ' · publish' : ''}
                  </td>
                  <td>
                    <Link to={`/portal/cms/${cms.id}`}>Open workspace</Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>No website CMS access has been granted yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Pending approvals</h2>
          <ul className="file-list">
            {pending.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{d.title}</strong>
                  <div className="muted-sm">{new Date(d.updated_at).toLocaleString()}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    disabled={busyId === d.id}
                    onClick={() => void clientDecide(d.id, true)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={busyId === d.id}
                    onClick={() => void clientDecide(d.id, false)}
                  >
                    Reject
                  </button>
                  <Link to={`/portal/cms/${d.cms_instance_id}`}>Review</Link>
                </div>
              </li>
            ))}
            {pending.length === 0 ? <li className="muted-sm">Nothing waiting for your approval.</li> : null}
          </ul>
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Published content</h2>
          <ul className="file-list">
            {published.map((d) => (
              <li key={d.id}>
                <div>
                  <strong>{d.title}</strong>
                  <div className="muted-sm">{new Date(d.updated_at).toLocaleString()}</div>
                </div>
                <Link to={`/portal/cms/${d.cms_instance_id}`}>Open</Link>
              </li>
            ))}
            {published.length === 0 ? <li className="muted-sm">No published pages yet.</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
}
