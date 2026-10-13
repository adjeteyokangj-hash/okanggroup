import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Page = {
  id: string;
  slug: string;
  title: string;
  status: string;
  published_at: string | null;
  updated_at: string;
};

type PublishEvent = {
  id: string;
  page_id: string | null;
  status: string;
  artefact_path: string | null;
  created_at: string;
  created_by: string | null;
  profiles?: { full_name: string; email: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  published: 'Published',
  archived: 'Archived',
  scheduled: 'Scheduled',
};

export function CmsPage() {
  const { can } = useAuth();
  const canEdit = can('company_cms.edit');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Page[]>([]);
  const [events, setEvents] = useState<PublishEvent[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const [{ data, error: err }, { data: ev }] = await Promise.all([
        supabase
          .from('cms_pages')
          .select('id, slug, title, status, published_at, updated_at')
          .order('updated_at', { ascending: false }),
        supabase
          .from('cms_publish_events')
          .select('id, page_id, status, artefact_path, created_at, created_by, profiles:created_by(full_name, email)')
          .order('created_at', { ascending: false })
          .limit(12),
      ]);
      if (err) setError(err.message);
      else setRows((data as Page[]) ?? []);
      setLoaded(true);
      setEvents(
        ((ev as Array<Omit<PublishEvent, 'profiles'> & { profiles: PublishEvent['profiles'] | PublishEvent['profiles'][] }>) ?? []).map(
          (row) => ({
            ...row,
            profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
          }),
        ),
      );
    })();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status !== 'all' && r.status !== status) return false;
      if (!needle) return true;
      return [r.title, r.slug, r.status].some((v) => v.toLowerCase().includes(needle));
    });
  }, [rows, q, status]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Company CMS</h1>
          <p>
            Draft → review → approve → local export only. Public website deploy needs separate Owner
            approval.
          </p>
        </div>
        <div className="page-head-actions">
          <Link to="/cms-systems">
            <button type="button" className="secondary">
              CMS Systems
            </button>
          </Link>
          {canEdit ? (
            <Link to="/cms/new">
              <button type="button">+ Create content</button>
            </Link>
          ) : null}
        </div>
      </header>

      {rows.length > 0 ? (
      <div className="toolbar">
        <input
          placeholder="Search title or slug…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In review</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <span className="muted-sm">
          {filtered.length} of {rows.length} page{rows.length === 1 ? '' : 's'}
        </span>
      </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}

      {loaded && rows.length === 0 && !error ? (
        <div className="panel empty-state">
          <h2>No company content yet — create a page to begin</h2>
          <p className="muted-sm">
            Company pages go through draft → review → approval before any export. Nothing is published
            automatically.
          </p>
          {canEdit ? (
            <Link to="/cms/new">
              <button type="button">+ Create content</button>
            </Link>
          ) : (
            <p className="muted-sm">Ask an Owner or editor with company_cms.edit access to add content.</p>
          )}
        </div>
      ) : (
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Updated</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.id} onClick={() => navigate(`/cms/${r.id}`)}>
              <td>{r.title}</td>
              <td>{r.slug}</td>
              <td>
                <span className={`status-pill ${r.status}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </td>
              <td>{new Date(r.updated_at).toLocaleString()}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={4}>No content matches.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      )}

      <div className="panel">
        <h2>Publish history</h2>
        <p className="muted-sm">
          Shows queued/exported approvals. Does not deploy the public site. Rollback uses{' '}
          <code>content/cms/previous.json</code> after local export.
        </p>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Approved by</th>
              <th>Status</th>
              <th>Artefact</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.created_at).toLocaleString()}</td>
                <td>{e.profiles?.full_name ?? e.profiles?.email ?? '—'}</td>
                <td>{e.status}</td>
                <td>{e.artefact_path || '—'}</td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan={4}>No publish events yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
