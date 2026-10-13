import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type CmsInstance = {
  id: string;
  display_name: string;
  slug: string;
  cms_kind: string;
  status: string;
  external_admin_url: string | null;
  credential_ref: string | null;
  notes: string | null;
};

type Grant = {
  id: string;
  profile_id: string;
  can_view: boolean;
  can_edit: boolean;
  can_submit: boolean;
  can_publish: boolean;
  can_upload_media?: boolean;
  can_review?: boolean;
  can_manage_content?: boolean;
  revoked_at: string | null;
};

type Staff = { id: string; full_name: string };

type Props = {
  clientId: string;
  projectId: string;
  canManageClient: boolean;
};

export function ClientCmsPanel({ clientId, projectId, canManageClient }: Props) {
  const { user } = useAuth();
  const [instances, setInstances] = useState<CmsInstance[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [url, setUrl] = useState('');
  const [credRef, setCredRef] = useState('');
  const [grantProfile, setGrantProfile] = useState('');
  const [canEdit, setCanEdit] = useState(true);
  const [canSubmit, setCanSubmit] = useState(true);
  const [canPublish, setCanPublish] = useState(false);
  const [canUploadMedia, setCanUploadMedia] = useState(true);
  const [canReview, setCanReview] = useState(false);
  const [canManageContent, setCanManageContent] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientName, setClientName] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function load() {
    const [{ data: inst, error: iErr }, { data: s }] = await Promise.all([
      supabase
        .from('cms_instances')
        .select(
          'id, display_name, slug, cms_kind, status, external_admin_url, credential_ref, notes',
        )
        .eq('client_id', clientId)
        .eq('project_id', projectId)
        .order('display_name'),
      supabase
        .from('profiles')
        .select('id, full_name')
        .eq('account_kind', 'staff')
        .eq('account_status', 'active')
        .order('full_name'),
    ]);
    if (iErr) {
      setError(iErr.message);
      return;
    }
    const list = (inst as CmsInstance[]) ?? [];
    setInstances(list);
    setStaff((s as Staff[]) ?? []);
    const sid = selectedId && list.some((x) => x.id === selectedId) ? selectedId : list[0]?.id ?? '';
    setSelectedId(sid);
    if (sid) {
      const { data: g } = await supabase
        .from('cms_instance_grants')
        .select(
          'id, profile_id, can_view, can_edit, can_submit, can_publish, can_upload_media, can_review, can_manage_content, revoked_at',
        )
        .eq('cms_instance_id', sid)
        .is('revoked_at', null);
      setGrants((g as Grant[]) ?? []);
    } else {
      setGrants([]);
    }
  }

  useEffect(() => {
    void load();
  }, [clientId, projectId]);

  useEffect(() => {
    if (!selectedId) return;
    void supabase
      .from('cms_instance_grants')
      .select(
        'id, profile_id, can_view, can_edit, can_submit, can_publish, can_upload_media, can_review, can_manage_content, revoked_at',
      )
      .eq('cms_instance_id', selectedId)
      .is('revoked_at', null)
      .then(({ data }) => setGrants((data as Grant[]) ?? []));
  }, [selectedId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManageClient || !user) return;
    setError(null);
    setMessage(null);
    const cleanSlug =
      slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-') ||
      name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    const { error: err } = await supabase.from('cms_instances').insert({
      client_id: clientId,
      project_id: projectId,
      display_name: name.trim(),
      slug: cleanSlug,
      cms_kind: 'external_website',
      external_admin_url: url.trim() || null,
      credential_ref: credRef.trim() || null,
      notes:
        'Connection uses scoped credential_ref only — not hosting root, database or unrelated project access.',
      created_by: user.id,
    });
    if (err) setError(err.message);
    else {
      setMessage('Client CMS registered.');
      setName('');
      setSlug('');
      setUrl('');
      setCredRef('');
      await load();
    }
  }

  async function onGrant(e: FormEvent) {
    e.preventDefault();
    if (!canManageClient || !user || !selectedId || !grantProfile) return;
    setError(null);
    const { error: err } = await supabase.from('cms_instance_grants').upsert(
      {
        cms_instance_id: selectedId,
        client_id: clientId,
        profile_id: grantProfile,
        can_view: true,
        can_edit: canEdit,
        can_submit: canSubmit,
        can_publish: canPublish,
        can_upload_media: canUploadMedia,
        can_review: canReview,
        can_manage_content: canManageContent,
        granted_by: user.id,
        revoked_at: null,
      },
      { onConflict: 'cms_instance_id,profile_id' },
    );
    if (err) setError(err.message);
    else {
      setMessage('Staff CMS access updated.');
      await load();
    }
  }

  async function revoke(grantId: string) {
    if (!canManageClient) return;
    const { error: err } = await supabase
      .from('cms_instance_grants')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', grantId);
    if (err) setError(err.message);
    else await load();
  }

  async function createClientPortalUser(e: FormEvent) {
    e.preventDefault();
    if (!canManageClient || !selectedId || !user) return;
    setError(null);
    setMessage(null);
    setTempPassword(null);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError('Not signed in.');
      return;
    }
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-client-portal-user`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: clientEmail.trim(),
          full_name: clientName.trim(),
          client_id: clientId,
          cms_instance_id: selectedId,
          membership_role: 'client_admin',
          can_edit: true,
          can_submit: true,
          can_publish: false,
        }),
      },
    );
    const payload = (await res.json()) as {
      error?: string;
      temporary_password?: string;
      note?: string;
    };
    if (!res.ok) {
      setError(payload.error ?? 'Failed to create client portal user');
      return;
    }
    setTempPassword(payload.temporary_password ?? null);
    setMessage(payload.note ?? 'Client portal user created.');
    setClientEmail('');
    setClientName('');
    await load();
  }

  const selected = instances.find((i) => i.id === selectedId) ?? null;
  const staffName = (id: string) => staff.find((s) => s.id === id)?.full_name ?? id;

  return (
    <div className="panel">
      <h2>Website CMS</h2>
      <p className="muted-sm">
        Separate from OkangGroup Company CMS. Register this client&apos;s site and grant staff only
        the capabilities they need. Does not grant hosting, database or unrelated project access.
      </p>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {instances.length > 0 ? (
        <label>
          CMS instance
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.display_name} ({i.status})
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="muted-sm">No client CMS registered for this project yet.</p>
      )}

      {selected ? (
        <div className="muted-sm" style={{ margin: '0.75rem 0' }}>
          Kind: {selected.cms_kind}
          {' · '}
          <Link to={`/my-cms/${selected.id}`}>Open workspace</Link>
          {selected.external_admin_url ? (
            <>
              {' '}
              ·{' '}
              <a href={selected.external_admin_url} target="_blank" rel="noreferrer">
                External admin
              </a>
            </>
          ) : null}
          {selected.credential_ref ? <> · Credential ref: {selected.credential_ref}</> : null}
        </div>
      ) : null}

      {canManageClient ? (
        <form className="form-grid" style={{ maxWidth: '100%', boxShadow: 'none', padding: 0 }} onSubmit={onCreate}>
          <h3 style={{ margin: 0, color: '#fff' }}>Register / connect CMS</h3>
          <div className="row-2">
            <label>
              Display name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Slug
              <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from name" />
            </label>
          </div>
          <div className="row-2">
            <label>
              External admin URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
              />
            </label>
            <label>
              Credential reference (label only)
              <input
                value={credRef}
                onChange={(e) => setCredRef(e.target.value)}
                placeholder="vault://client-cms/…"
              />
            </label>
          </div>
          <button type="submit">Save CMS registration</button>
        </form>
      ) : null}

      {canManageClient && selected ? (
        <form className="form-grid" style={{ maxWidth: '100%', boxShadow: 'none', padding: 0, marginTop: '1rem' }} onSubmit={onGrant}>
          <h3 style={{ margin: 0, color: '#fff' }}>Staff access</h3>
          <div className="row-2">
            <label>
              Staff
              <select value={grantProfile} onChange={(e) => setGrantProfile(e.target.value)} required>
                <option value="">Select…</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="check-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.35rem' }}>
              <label className="check">
                <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} />
                Can edit
              </label>
              <label className="check">
                <input type="checkbox" checked={canSubmit} onChange={(e) => setCanSubmit(e.target.checked)} />
                Can submit
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={canPublish}
                  onChange={(e) => setCanPublish(e.target.checked)}
                />
                Can publish (separate control)
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={canUploadMedia}
                  onChange={(e) => setCanUploadMedia(e.target.checked)}
                />
                Can upload media
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={canReview}
                  onChange={(e) => setCanReview(e.target.checked)}
                />
                Can review
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={canManageContent}
                  onChange={(e) => setCanManageContent(e.target.checked)}
                />
                Can manage content
              </label>
            </div>
          </div>
          <button type="submit">Grant / update access</button>
          <ul className="file-list">
            {grants.map((g) => (
              <li key={g.id}>
                <div>
                  <strong>{staffName(g.profile_id)}</strong>
                  <div className="muted-sm">
                    view{g.can_edit ? ' · edit' : ''}
                    {g.can_submit ? ' · submit' : ''}
                    {g.can_publish ? ' · publish' : ''}
                    {g.can_upload_media ? ' · media' : ''}
                    {g.can_review ? ' · review' : ''}
                    {g.can_manage_content ? ' · manage' : ''}
                  </div>
                </div>
                <button type="button" className="secondary" onClick={() => void revoke(g.id)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </form>
      ) : null}

      {canManageClient && selected ? (
        <form
          className="form-grid"
          style={{ maxWidth: '100%', boxShadow: 'none', padding: 0, marginTop: '1rem' }}
          onSubmit={(e) => void createClientPortalUser(e)}
        >
          <h3 style={{ margin: 0, color: '#fff' }}>Client portal user</h3>
          <p className="muted-sm">
            Separate from OkangGroup staff. Client signs in to the Client Portal only — no operations
            dashboard.
          </p>
          <div className="row-2">
            <label>
              Full name
              <input value={clientName} onChange={(e) => setClientName(e.target.value)} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                required
              />
            </label>
          </div>
          <button type="submit">Create client portal user</button>
          {tempPassword ? (
            <div className="password-reveal">
              <p className="ok">Temporary password (shown once)</p>
              <code>{tempPassword}</code>
            </div>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
