import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export function CmsFormPage() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can('company_cms.edit')) {
    return <div className="error">You do not have permission to create CMS content.</div>;
  }

  function slugify(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const finalSlug = (slug.trim() || slugify(title)).replace(/^\/+|\/+$/g, '');
    const { data, error: err } = await supabase
      .from('cms_pages')
      .insert({
        title: title.trim(),
        slug: finalSlug,
        page_type: 'custom',
        status: 'draft',
        created_by: user?.id,
      })
      .select('id')
      .single();
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? 'Create failed');
      return;
    }
    navigate(`/cms/${data.id}`, { replace: true });
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Create content</h1>
          <p>Starts as Draft. Public website is never updated from this screen.</p>
        </div>
        <Link to="/cms">
          <button type="button" className="secondary">
            Cancel
          </button>
        </Link>
      </header>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Title <span className="req">*</span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (!slug) setSlug(slugify(e.target.value));
            }}
            required
          />
        </label>
        <label>
          Slug <span className="req">*</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="about-us"
            required
          />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save draft'}
        </button>
      </form>
    </section>
  );
}
