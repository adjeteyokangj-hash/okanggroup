import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Page = {
  id: string;
  slug: string;
  title: string;
  status: string;
  published_at: string | null;
  published_by: string | null;
};

type PublishEvent = {
  id: string;
  status: string;
  artefact_path: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
};

export function CmsDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const canEdit = can('company_cms.edit');
  const canPublish = can('company_cms.publish');
  const navigate = useNavigate();
  const [page, setPage] = useState<Page | null>(null);
  const [events, setEvents] = useState<PublishEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const [{ data, error: err }, { data: ev }] = await Promise.all([
      supabase
        .from('cms_pages')
        .select('id, slug, title, status, published_at, published_by')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('cms_publish_events')
        .select('id, status, artefact_path, created_at, profiles:created_by(full_name, email)')
        .eq('page_id', id)
        .order('created_at', { ascending: false }),
    ]);
    if (err || !data) {
      setError(err?.message ?? 'Content not found');
      return;
    }
    setPage(data as Page);
    setEvents(
      ((ev as Array<Omit<PublishEvent, 'profiles'> & { profiles: PublishEvent['profiles'] | PublishEvent['profiles'][] }>) ?? []).map(
        (row) => ({
          ...row,
          profiles: Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles,
        }),
      ),
    );
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!page || !canEdit) return;
    if (page.status === 'published' && !canPublish) {
      setError('Published pages require publish permission to edit.');
      return;
    }
    const { error: err } = await supabase
      .from('cms_pages')
      .update({
        title: page.title,
        slug: page.slug,
        updated_by: user?.id,
        status: page.status === 'published' ? 'draft' : page.status,
      })
      .eq('id', page.id);
    if (err) setError(err.message);
    else {
      setMessage(page.status === 'published' ? 'Saved as draft after edit.' : 'Saved.');
      await load();
    }
  }

  async function submitForReview() {
    if (!page || !canEdit) return;
    const { error: err } = await supabase.from('cms_pages').update({ status: 'in_review' }).eq('id', page.id);
    if (err) setError(err.message);
    else {
      setMessage('Submitted for review.');
      await load();
    }
  }

  async function returnToDraft() {
    if (!page || !canEdit) return;
    const { error: err } = await supabase.from('cms_pages').update({ status: 'draft' }).eq('id', page.id);
    if (err) setError(err.message);
    else {
      setMessage('Returned to draft.');
      await load();
    }
  }

  async function approveAndQueue() {
    if (!page || !canPublish) return;
    setError(null);
    const snapshot = { page, recorded_at: new Date().toISOString() };
    const { count } = await supabase
      .from('cms_revisions')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'cms_page')
      .eq('entity_id', page.id);
    await supabase.from('cms_revisions').insert({
      entity_type: 'cms_page',
      entity_id: page.id,
      snapshot_json: snapshot,
      revision_no: (count ?? 0) + 1,
      created_by: user?.id,
    });
    const { error: pubErr } = await supabase
      .from('cms_pages')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: user?.id,
      })
      .eq('id', page.id);
    if (pubErr) {
      setError(pubErr.message);
      return;
    }
    await supabase.from('cms_publish_events').insert({
      page_id: page.id,
      publish_kind: 'site_bundle',
      artefact_path: `pending/${page.slug}.json`,
      status: 'pending',
      created_by: user?.id,
    });
    setMessage(
      'Approved and queued for local export (`npm run cms:export`). Public website deploy was NOT executed.',
    );
    await load();
  }

  if (!page) return <div className="center">{error ?? 'Loading…'}</div>;

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{page.title}</h1>
          <p>
            Status:{' '}
            <span className={`status-pill ${page.status}`}>{page.status.replace('_', ' ')}</span>
          </p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => navigate('/cms')}>
            Back to directory
          </button>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <form className="form-grid" onSubmit={save}>
        <label>
          Title
          <input
            value={page.title}
            disabled={!canEdit}
            onChange={(e) => setPage({ ...page, title: e.target.value })}
            required
          />
        </label>
        <label>
          Slug
          <input
            value={page.slug}
            disabled={!canEdit}
            onChange={(e) => setPage({ ...page, slug: e.target.value })}
            required
          />
        </label>
        {canEdit ? <button type="submit">Save changes</button> : null}
      </form>

      <div className="panel">
        <h2>Workflow</h2>
        <div className="actions">
          {canEdit && page.status === 'draft' ? (
            <button type="button" onClick={() => void submitForReview()}>
              Submit for review
            </button>
          ) : null}
          {canEdit && page.status === 'in_review' ? (
            <button type="button" className="secondary" onClick={() => void returnToDraft()}>
              Return to draft
            </button>
          ) : null}
          {canPublish && page.status === 'in_review' ? (
            <button type="button" onClick={() => void approveAndQueue()}>
              Approve &amp; queue export
            </button>
          ) : null}
        </div>
        <p className="muted-sm">
          Approval records a publish event for local export only. Production deploy of okanggroup.com
          requires separate Owner approval.
        </p>
      </div>

      <div className="panel">
        <h2>Approval / publish history</h2>
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
                <td colSpan={4}>No history for this page yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
