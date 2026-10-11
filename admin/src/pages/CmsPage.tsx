import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Page = {
  id: string;
  slug: string;
  title: string;
  status: string;
  published_at: string | null;
};

export function CmsPage() {
  const [rows, setRows] = useState<Page[]>([]);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase
      .from('cms_pages')
      .select('id, slug, title, status, published_at')
      .order('title');
    if (err) setError(err.message);
    else setRows((data as Page[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('cms_pages').insert({
      slug: slug.trim(),
      title: title.trim(),
      page_type: 'custom',
      status: 'draft',
    });
    if (err) {
      setError(err.message);
      return;
    }
    setSlug('');
    setTitle('');
    await load();
  }

  async function submitForReview(id: string) {
    setError(null);
    const { error: err } = await supabase.from('cms_pages').update({ status: 'in_review' }).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function approveAndRecordPublish(id: string) {
    setError(null);
    setMessage(null);
    const { data: user } = await supabase.auth.getUser();
    const { data: page, error: readErr } = await supabase
      .from('cms_pages')
      .select('id, slug, title, status')
      .eq('id', id)
      .single();
    if (readErr || !page) {
      setError(readErr?.message ?? 'Page not found');
      return;
    }

    const snapshot = { page, recorded_at: new Date().toISOString() };
    const { count } = await supabase
      .from('cms_revisions')
      .select('id', { count: 'exact', head: true })
      .eq('entity_type', 'cms_page')
      .eq('entity_id', id);

    await supabase.from('cms_revisions').insert({
      entity_type: 'cms_page',
      entity_id: id,
      snapshot_json: snapshot,
      revision_no: (count ?? 0) + 1,
      created_by: user.user?.id,
    });

    const { error: pubErr } = await supabase
      .from('cms_pages')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        published_by: user.user?.id,
      })
      .eq('id', id);

    if (pubErr) {
      setError(pubErr.message);
      return;
    }

    await supabase.from('cms_publish_events').insert({
      page_id: id,
      publish_kind: 'site_bundle',
      artefact_path: `pending/${page.slug}.json`,
      previous_artefact_path: null,
      status: 'pending',
      created_by: user.user?.id,
    });

    setMessage(
      'Page approved and publish event recorded. Public website deploy remains Owner-controlled and is not executed automatically.',
    );
    await load();
  }

  return (
    <section>
      <header className="page-head">
        <h1>Company CMS</h1>
        <p>Draft → review → approve. Public Vite deploy requires separate Owner approval.</p>
      </header>
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        <input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <button type="submit">New draft</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Slug</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.title}</td>
              <td>{r.slug}</td>
              <td>{r.status}</td>
              <td className="actions">
                {r.status === 'draft' ? (
                  <button type="button" onClick={() => void submitForReview(r.id)}>
                    Submit
                  </button>
                ) : null}
                {r.status === 'in_review' ? (
                  <button type="button" onClick={() => void approveAndRecordPublish(r.id)}>
                    Approve
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
