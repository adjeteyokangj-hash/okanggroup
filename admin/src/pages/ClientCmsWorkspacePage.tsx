import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CmsCustomModulePanel } from '../components/CmsCustomModulePanel';
import { CmsMediaLibrary } from '../components/CmsMediaLibrary';
import { OpsWatchVisualStudio } from '../visual-studio/OpsWatchVisualStudio';
import { NativeVisualStudio } from '../visual-studio/NativeVisualStudio';
import { TreasureHouseWorkspace } from '../components/TreasureHouseWorkspace';
import { useAuth } from '../lib/auth';
import {
  cmsConnectionStatusTone,
  deriveCmsConnectionStatus,
  explainCmsConnectionError,
  labelCmsConnectionStatus,
} from '../lib/cmsConnectionStatus';
import { CmsBuilderDoc, normalizeBuilderDoc } from '../lib/cmsBuilder';
import { isOpsWatchMarketingCms } from '../lib/okanggroupProducts';
import { TH_SHADOW_SLUG } from '../lib/treasureHouseCmsShadow';
import { supabase } from '../lib/supabase';

type Instance = {
  id: string;
  display_name: string;
  slug: string;
  cms_kind: string;
  cms_config_type: string;
  management_mode: string;
  status: string;
  client_id: string;
  external_admin_url: string | null;
  public_site_url?: string | null;
  ownership_kind?: string | null;
  product_code?: string | null;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

type Module = {
  id: string;
  module_code: string;
  module_name: string;
  description: string | null;
  hosted_in: string;
  is_sensitive: boolean;
  sort_order: number;
};

type Doc = {
  id: string;
  module_id: string;
  slug: string;
  title: string;
  body_json: Record<string, unknown>;
  status: string;
  requires_client_approval: boolean;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
  visibility: string;
  nav_order: number;
};

type Grant = {
  can_view: boolean;
  can_edit: boolean;
  can_submit: boolean;
  can_publish: boolean;
  can_upload_media?: boolean;
  can_review?: boolean;
  can_manage_content?: boolean;
};

type Connection = {
  adapter_code: string;
  status: string;
  notes: string | null;
  last_error: string | null;
  base_url?: string | null;
  integration_mode?: string | null;
  last_healthy_at?: string | null;
};

type Revision = {
  id: string;
  revision_no: number;
  action: string;
  note: string | null;
  created_at: string;
  created_by: string | null;
  snapshot_json: Record<string, unknown>;
};

type Template = {
  id: string;
  code: string;
  name: string;
  category: string;
  description: string | null;
  body_json: unknown;
};

function templatePreviewColors(body: unknown): {
  primary: string;
  accent: string;
  bg: string;
  text: string;
  card: string;
} {
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const brand = (obj.brand as Record<string, string> | undefined) ?? {};
  const tokens = (obj.tokens as Record<string, string> | undefined) ?? {};
  return {
    primary: tokens.primary ?? brand.primaryColor ?? '#0b3d2e',
    accent: tokens.accent ?? brand.accentColor ?? '#c4a35a',
    bg: tokens.pageBackground ?? brand.backgroundColor ?? '#f7f4ef',
    text: tokens.text ?? brand.textColor ?? '#1a1a1a',
    card: tokens.cardSurface ?? brand.surfaceColor ?? '#ffffff',
  };
}

function templateSectionCount(body: unknown): number {
  if (!body || typeof body !== 'object') return 0;
  const obj = body as { tree?: unknown[]; sections?: unknown[] };
  if (Array.isArray(obj.tree)) return obj.tree.length;
  if (Array.isArray(obj.sections)) return obj.sections.length;
  return 0;
}

type WorkspaceTab = 'pages' | 'media' | 'custom' | 'history' | 'templates';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  in_review: 'In review',
  awaiting_client_approval: 'Awaiting client approval',
  approved_for_publish: 'Approved — ready to publish',
  published: 'Published',
  rejected: 'Rejected',
  archived: 'Archived',
};

export function ClientCmsWorkspacePage() {
  const { instanceId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, can, profile } = useAuth();
  const isClientUser = profile?.account_kind === 'client_user';
  const workspaceView = searchParams.get('view') === 'media' ? 'media' : 'studio';
  const [instance, setInstance] = useState<Instance | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [moduleId, setModuleId] = useState('');
  const [docId, setDocId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [pageBody, setPageBody] = useState<CmsBuilderDoc | null>(null);
  const [requiresClientApproval, setRequiresClientApproval] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<WorkspaceTab>('pages');
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [comments, setComments] = useState<{ id: string; body: string; created_at: string }[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [editorExpanded, setEditorExpanded] = useState(() => {
    try {
      const saved = localStorage.getItem('okang.cmsEditorExpanded');
      if (saved === '0') return false;
      if (saved === '1') return true;
    } catch {
      /* ignore */
    }
    return typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches;
  });
  const [editorEpoch, setEditorEpoch] = useState(0);

  const manager = can('clients.manage');
  const canEdit = manager || Boolean(grant?.can_edit);
  const canSubmit = manager || Boolean(grant?.can_submit);
  const canPublish = manager || Boolean(grant?.can_publish) || Boolean(grant?.can_review);
  const canUpload = manager || Boolean(grant?.can_upload_media) || canEdit;
  const canManageContent = manager || Boolean(grant?.can_manage_content) || canPublish;

  async function load() {
    if (!instanceId || !user) return;
    setError(null);
    let instRes = await supabase
      .from('cms_instances')
      .select(
        'id, display_name, slug, cms_kind, cms_config_type, management_mode, status, client_id, external_admin_url, public_site_url, ownership_kind, product_code, clients(legal_name)',
      )
      .eq('id', instanceId)
      .maybeSingle();
    if (instRes.error) {
      instRes = await supabase
        .from('cms_instances')
        .select(
          'id, display_name, slug, cms_kind, cms_config_type, management_mode, status, client_id, external_admin_url, public_site_url, clients(legal_name)',
        )
        .eq('id', instanceId)
        .maybeSingle();
    }
    const [
      { data: mods },
      { data: documents },
      { data: g },
      { data: conn },
      { data: tpl },
    ] = await Promise.all([
      supabase
        .from('cms_modules')
        .select('id, module_code, module_name, description, hosted_in, is_sensitive, sort_order')
        .eq('cms_instance_id', instanceId)
        .eq('status', 'active')
        .order('sort_order'),
      supabase
        .from('client_cms_documents')
        .select(
          'id, module_id, slug, title, body_json, status, requires_client_approval, updated_at, published_at, archived_at, visibility, nav_order',
        )
        .eq('cms_instance_id', instanceId)
        .order('nav_order', { ascending: true })
        .order('updated_at', { ascending: false }),
      supabase
        .from('cms_instance_grants')
        .select(
          'can_view, can_edit, can_submit, can_publish, can_upload_media, can_review, can_manage_content',
        )
        .eq('cms_instance_id', instanceId)
        .eq('profile_id', user.id)
        .is('revoked_at', null)
        .maybeSingle(),
      supabase
        .from('cms_connections')
        .select('adapter_code, status, notes, last_error, base_url, integration_mode, last_healthy_at')
        .eq('cms_instance_id', instanceId)
        .maybeSingle(),
      supabase
        .from('cms_templates')
        .select('id, code, name, category, description, body_json')
        .order('category')
        .order('name'),
    ]);
    const inst = instRes.data;
    const iErr = instRes.error;
    if (iErr || !inst) {
      setError(iErr?.message ?? 'CMS instance not found or not authorised.');
      setInstance(null);
      return;
    }
    setInstance(inst as Instance);
    const modList = (mods as Module[]) ?? [];
    setModules(modList);
    setDocs((documents as Doc[]) ?? []);
    setGrant(
      (g as Grant) ??
        (manager
          ? {
              can_view: true,
              can_edit: true,
              can_submit: true,
              can_publish: true,
              can_upload_media: true,
              can_review: true,
              can_manage_content: true,
            }
          : null),
    );
    setConnection((conn as Connection) ?? null);
    setTemplates((tpl as Template[]) ?? []);
    if (!moduleId && modList[0]) setModuleId(modList[0].id);

    const cfg = (inst as Instance).cms_config_type;
    if (cfg === 'custom' && tab === 'pages') setTab('custom');
  }

  async function loadRevisions(documentId: string) {
    const { data } = await supabase
      .from('client_cms_revisions')
      .select('id, revision_no, action, note, created_at, created_by, snapshot_json')
      .eq('document_id', documentId)
      .order('revision_no', { ascending: false })
      .limit(40);
    setRevisions((data as Revision[]) ?? []);
  }

  async function loadComments(documentId: string) {
    const { data } = await supabase
      .from('cms_content_comments')
      .select('id, body, created_at')
      .eq('document_id', documentId)
      .order('created_at', { ascending: true });
    setComments((data as typeof comments) ?? []);
  }

  useEffect(() => {
    void load();
  }, [instanceId, user?.id]);

  useEffect(() => {
    if (instance && moduleId && !docId && !pageBody && instance.cms_config_type !== 'custom') {
      startNew();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance?.id, moduleId]);

  useEffect(() => {
    if (docId) {
      void loadRevisions(docId);
      void loadComments(docId);
    } else {
      setRevisions([]);
      setComments([]);
    }
  }, [docId]);

  useEffect(() => {
    document.body.classList.toggle('cms-editor-workspace-expanded', editorExpanded);
    try {
      localStorage.setItem('okang.cmsEditorExpanded', editorExpanded ? '1' : '0');
    } catch {
      /* ignore */
    }
    return () => document.body.classList.remove('cms-editor-workspace-expanded');
  }, [editorExpanded]);

  useEffect(() => {
    if (tab !== 'pages' && editorExpanded) setEditorExpanded(false);
  }, [tab, editorExpanded]);

  useEffect(() => {
    if (!docId) return;
    const d = docs.find((x) => x.id === docId);
    if (!d) return;
    if (!title.trim() && d.title) setTitle(d.title);
    if (!slug.trim() && d.slug) setSlug(d.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, docId]);

  function selectDoc(d: Doc) {
    const client = Array.isArray(instance?.clients) ? instance?.clients[0] : instance?.clients;
    setDocId(d.id);
    setModuleId(d.module_id);
    setTitle(d.title || '');
    setSlug(d.slug || '');
    setPageBody(normalizeBuilderDoc(d.body_json, client?.legal_name ?? instance?.display_name));
    setRequiresClientApproval(d.requires_client_approval);
    setEditorEpoch((n) => n + 1);
    setError(null);
    setMessage(null);
    setTab('pages');
  }

  function startNew() {
    const client = Array.isArray(instance?.clients) ? instance?.clients[0] : instance?.clients;
    setDocId(null);
    setTitle('');
    setSlug('');
    setPageBody(normalizeBuilderDoc(null, client?.legal_name ?? instance?.display_name));
    setRequiresClientApproval(false);
    setNote('');
    setMessage(null);
  }

  function applyTemplate(t: Template) {
    const client = Array.isArray(instance?.clients) ? instance?.clients[0] : instance?.clients;
    setPageBody(normalizeBuilderDoc(t.body_json, client?.legal_name ?? instance?.display_name));
    setEditorEpoch((n) => n + 1);
    if (!title.trim()) setTitle(t.name);
    setTab('pages');
    setMessage(`Template “${t.name}” applied — save draft to keep.`);
  }

  async function saveDraft() {
    if (!instanceId || !canEdit || !moduleId || !pageBody || !title.trim()) {
      setError('Title is required before saving a draft.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('save_client_cms_document', {
      p_instance_id: instanceId,
      p_module_id: moduleId,
      p_slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      p_title: title,
      p_body_json: pageBody,
      p_document_id: docId,
      p_requires_client_approval: requiresClientApproval,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDocId(data as string);
    setMessage('Draft saved — live website unchanged.');
    await load();
  }

  async function submit() {
    if (!docId || !canSubmit) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('submit_client_cms_document', {
      p_document_id: docId,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage('Submitted for review.');
      setNote('');
      await load();
    }
  }

  async function decide(approve: boolean) {
    if (!docId || !canPublish) return;
    setBusy(true);
    setError(null);
    const needsClient = Boolean(docs.find((d) => d.id === docId)?.requires_client_approval);
    const { error: err } = await supabase.rpc('decide_client_cms_document', {
      p_document_id: docId,
      p_approve: approve,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(
        approve
          ? needsClient
            ? 'Management approved — awaiting client approval.'
            : 'Published to managed content store.'
          : 'Returned to editor.',
      );
      setNote('');
      await load();
      if (docId) await loadRevisions(docId);
    }
  }

  async function clientDecide(approve: boolean) {
    if (!docId || !isClientUser) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('client_decide_cms_document', {
      p_document_id: docId,
      p_approve: approve,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(approve ? 'Client approved — ready for authorised publish.' : 'Returned for revision.');
      setNote('');
      await load();
      if (docId) await loadRevisions(docId);
    }
  }

  async function publishApproved() {
    if (!docId || !canPublish) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('publish_client_cms_document', {
      p_document_id: docId,
      p_note: note.trim() || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage('Published to managed content store.');
      setNote('');
      await load();
      if (docId) await loadRevisions(docId);
    }
  }

  async function duplicateDoc() {
    if (!docId || !canEdit) return;
    setBusy(true);
    const { data, error: err } = await supabase.rpc('duplicate_client_cms_document', {
      p_document_id: docId,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage('Page duplicated as draft.');
      await load();
      if (data) {
        const copy = docs.find((d) => d.id === data) ?? null;
        if (copy) selectDoc(copy);
      }
    }
  }

  async function archiveDoc() {
    if (!docId || !canManageContent) return;
    if (!window.confirm('Archive this page? It can be restored later.')) return;
    setBusy(true);
    const { error: err } = await supabase.rpc('archive_client_cms_document', {
      p_document_id: docId,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage('Page archived.');
      startNew();
      await load();
    }
  }

  async function restoreRevision(revisionNo: number) {
    if (!docId || !canManageContent) return;
    if (!window.confirm(`Restore revision ${revisionNo}? Current content becomes a new history entry.`)) {
      return;
    }
    setBusy(true);
    const { error: err } = await supabase.rpc('restore_client_cms_document', {
      p_document_id: docId,
      p_revision_no: revisionNo,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(`Restored revision ${revisionNo}.`);
      await load();
      const { data } = await supabase
        .from('client_cms_documents')
        .select(
          'id, module_id, slug, title, body_json, status, requires_client_approval, updated_at, published_at, archived_at, visibility, nav_order',
        )
        .eq('id', docId)
        .maybeSingle();
      if (data) selectDoc(data as Doc);
      await loadRevisions(docId);
    }
  }

  async function saveAsTemplate() {
    if (!pageBody || !manager || !title.trim()) return;
    const code =
      'user-' +
      title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 40) +
      '-' +
      Date.now().toString(36);
    const { error: err } = await supabase.from('cms_templates').insert({
      code,
      name: title.trim(),
      category: 'saved',
      description: 'Saved from CMS workspace (no client secrets)',
      body_json: {
        ...pageBody,
        brand: {
          ...pageBody.brand,
          siteName: 'Website',
        },
      },
      is_system: false,
      created_by: user?.id ?? null,
    });
    if (err) setError(err.message);
    else {
      setMessage('Design saved as reusable template.');
      await load();
      setTab('templates');
    }
  }

  async function postComment() {
    if (!docId || !instance || !commentBody.trim() || !user) return;
    const { error: err } = await supabase.from('cms_content_comments').insert({
      cms_instance_id: instance.id,
      client_id: instance.client_id,
      document_id: docId,
      author_id: user.id,
      body: commentBody.trim(),
    });
    if (err) setError(err.message);
    else {
      setCommentBody('');
      await loadComments(docId);
    }
  }

  async function testConnection() {
    if (!instanceId) return;
    const external =
      connection?.adapter_code === 'opswatch_marketing' || instance?.product_code === 'opswatch';
    if (external) {
      const { data, error: err } = await supabase.functions.invoke('cms-integration-gateway', {
        body: {
          action: 'health',
          instance_id: instanceId,
          idempotency_key: `health-${instanceId}-${Date.now()}`,
        },
      });
      await load();
      if (err) {
        const fromData =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error?: string }).error ?? '')
            : '';
        setError(explainCmsConnectionError(fromData || err.message));
      } else {
        const r = data as { ok?: boolean; error?: string };
        if (r.ok) setMessage('Authenticated OpsWatch health check succeeded.');
        else setError(explainCmsConnectionError(r.error ?? 'OpsWatch health check failed'));
      }
      return;
    }
    const { data, error: err } = await supabase.rpc('test_cms_connection', {
      p_instance_id: instanceId,
    });
    await load();
    if (err) setError(err.message);
    else {
      const r = data as { ok?: boolean; message?: string };
      setMessage(r.message ?? (r.ok ? 'Connection OK' : 'Connection issue'));
    }
  }

  if (!instance) {
    return <div className="center">{error ?? 'Loading…'}</div>;
  }

  const client = Array.isArray(instance.clients) ? instance.clients[0] : instance.clients;

  if (instance.slug === TH_SHADOW_SLUG) {
    return (
      <TreasureHouseWorkspace
        instance={instance}
        clientName={client?.legal_name ?? 'Client'}
        error={error}
        message={message}
        canEdit={canEdit}
        canSubmit={canSubmit}
        canPublish={canPublish}
        canUpload={canUpload}
      />
    );
  }

  const isOpsWatchMarketing = isOpsWatchMarketingCms({
    adapterCode: connection?.adapter_code,
    productCode: instance.product_code,
    slug: instance.slug,
    displayName: instance.display_name,
  });

  if (isOpsWatchMarketing) {
    const connStatus = deriveCmsConnectionStatus(connection);
    return (
      <section className="cms-workspace cms-workspace-opswatch">
        <header className="page-head">
          <div>
            <h1>{instance.display_name}</h1>
            <p>
              {instance.ownership_kind === 'okanggroup_product'
                ? 'OkangGroup Product'
                : (client?.legal_name ?? 'OkangGroup')}{' '}
              · Managed Website · OpsWatch marketing website only
            </p>
          </div>
          <div className="page-head-actions">
            <Link to="/my-cms" className="button-link secondary">
              Back to My Client CMS
            </Link>
            <Link to="/cms-systems" className="button-link secondary">
              Managed Websites
            </Link>
          </div>
        </header>
        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="ok">{message}</div> : null}
        {connection ? (
          <div className="cms-conn-banner">
            <div>
              <span
                className={`cms-conn-dot ${cmsConnectionStatusTone(connStatus) === 'ok' ? 'ok' : 'warn'}`}
              />
              <strong>{connection.adapter_code}</strong>
              <span className="muted-sm">· {labelCmsConnectionStatus(connStatus)}</span>
              {connection.last_error ? (
                <span className="cms-conn-err">· {explainCmsConnectionError(connection.last_error)}</span>
              ) : null}
            </div>
            <p className="muted-sm">
              Edits apply only to the OpsWatch public marketing website. Customer dashboards,
              monitoring, billing and OpsWatch administration stay out of this CMS.
            </p>
          </div>
        ) : null}
        <nav className="cms-tab-bar" aria-label="OpsWatch website workspace">
          <button
            type="button"
            className={workspaceView === 'studio' ? 'active' : ''}
            onClick={() => setSearchParams({})}
          >
            <span>Edit Website</span>
            <em>Visual Studio</em>
          </button>
          <button
            type="button"
            className={workspaceView === 'media' ? 'active' : ''}
            onClick={() => setSearchParams({ view: 'media' })}
          >
            <span>Media</span>
            <em>Library</em>
          </button>
        </nav>
        {connection?.adapter_code !== 'opswatch_marketing' ? (
          <div className="error">
            Attach the OpsWatch marketing adapter from Managed Websites before editing. Expected
            adapter code: opswatch_marketing.
          </div>
        ) : workspaceView === 'media' ? (
          <CmsMediaLibrary clientId={instance.client_id} instanceId={instance.id} canUpload={canUpload} />
        ) : (
          <OpsWatchVisualStudio
            instanceId={instance.id}
            clientId={instance.client_id}
            canEdit={canEdit}
            canPublish={canPublish}
            canUploadMedia={canUpload}
            publicSiteUrl={instance.public_site_url ?? instance.external_admin_url}
          />
        )}
      </section>
    );
  }

  const selectedMod = modules.find((m) => m.id === moduleId);
  const platformEditable = selectedMod?.hosted_in === 'platform_content' && !selectedMod.is_sensitive;
  const current = docs.find((d) => d.id === docId);
  const isNativeVisual =
    connection?.adapter_code === 'okang_native' || instance.cms_kind === 'okang_native';
  const showPages = instance.cms_config_type === 'generic' || instance.cms_config_type === 'hybrid';
  const showCustom = instance.cms_config_type === 'custom' || instance.cms_config_type === 'hybrid';

  const workflowActions =
    docId && current ? (
      <>
        {canSubmit && ['draft', 'rejected'].includes(current.status) ? (
          <button type="button" disabled={busy} onClick={() => void submit()}>
            Submit for review
          </button>
        ) : null}
        {canPublish && current.status === 'in_review' ? (
          <>
            <button type="button" disabled={busy} onClick={() => void decide(true)}>
              {current.requires_client_approval ? 'Approve for client' : 'Approve & publish'}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void decide(false)}>
              Reject
            </button>
          </>
        ) : null}
        {isClientUser && current.status === 'awaiting_client_approval' ? (
          <>
            <button type="button" disabled={busy} onClick={() => void clientDecide(true)}>
              Client approve
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={() => void clientDecide(false)}>
              Client reject
            </button>
          </>
        ) : null}
        {canPublish && current.status === 'approved_for_publish' ? (
          <button type="button" disabled={busy} onClick={() => void publishApproved()}>
            Publish
          </button>
        ) : null}
        {!isClientUser && current.status === 'awaiting_client_approval' ? (
          <span className="muted-sm">Waiting for client approval before publish.</span>
        ) : null}
      </>
    ) : null;

  return (
    <section className={`cms-workspace ${editorExpanded ? 'editor-expanded' : ''}`}>
      {!editorExpanded ? (
        <header className="page-head">
          <div>
            <h1>{instance.display_name}</h1>
            <p>
              {client?.legal_name ?? 'Client'} · {instance.cms_config_type} CMS
              {isClientUser ? ' · Client portal' : ''}
            </p>
          </div>
          <div className="actions">
            {manager ? (
              <button type="button" className="secondary" onClick={() => void testConnection()}>
                Test connection
              </button>
            ) : null}
            <Link to={isClientUser ? '/portal' : '/my-cms'} className="button-link secondary">
              Back
            </Link>
          </div>
        </header>
      ) : null}

      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {!editorExpanded && connection ? (
        <div className="cms-conn-banner">
          <div>
            <span className={`cms-conn-dot ${cmsConnectionStatusTone(deriveCmsConnectionStatus(connection)) === 'ok' ? 'ok' : 'warn'}`} />
            <strong>{connection.adapter_code}</strong>
            <span className="muted-sm">· {labelCmsConnectionStatus(deriveCmsConnectionStatus(connection))}</span>
            {connection.notes ? <span className="muted-sm">· {connection.notes}</span> : null}
            {connection.last_error ? (
              <span className="cms-conn-err">· {explainCmsConnectionError(connection.last_error)}</span>
            ) : null}
          </div>
          {instance.external_admin_url && connection.adapter_code !== 'okang_native' ? (
            <a href={instance.external_admin_url} target="_blank" rel="noreferrer">
              External site
            </a>
          ) : null}
          {!isNativeVisual ? (
            <p className="muted-sm">
              Live publish limited to capabilities this adapter actually supports.
            </p>
          ) : null}
        </div>
      ) : null}

      {!editorExpanded ? (
        <nav className="cms-tab-bar" aria-label="CMS workspace">
          {showPages ? (
            <button type="button" className={tab === 'pages' ? 'active' : ''} onClick={() => setTab('pages')}>
              <span>Pages</span>
              <em>Visual editor</em>
            </button>
          ) : null}
          <button type="button" className={tab === 'media' ? 'active' : ''} onClick={() => setTab('media')}>
            <span>Media</span>
            <em>Library</em>
          </button>
          {showCustom ? (
            <button type="button" className={tab === 'custom' ? 'active' : ''} onClick={() => setTab('custom')}>
              <span>Custom</span>
              <em>Modules</em>
            </button>
          ) : null}
          <button
            type="button"
            className={tab === 'history' ? 'active' : ''}
            onClick={() => setTab('history')}
            disabled={!docId}
          >
            <span>History</span>
            <em>Rollback</em>
          </button>
          {showPages ? (
            <button
              type="button"
              className={tab === 'templates' ? 'active' : ''}
              onClick={() => setTab('templates')}
            >
              <span>Templates</span>
              <em>Starter layouts</em>
            </button>
          ) : null}
        </nav>
      ) : null}

      {tab === 'media' ? (
        <CmsMediaLibrary clientId={instance.client_id} instanceId={instance.id} canUpload={canUpload} />
      ) : null}

      {tab === 'custom' && showCustom ? (
        <CmsCustomModulePanel
          instanceId={instance.id}
          clientId={instance.client_id}
          canEdit={canEdit}
          canSubmit={canSubmit}
          canPublish={canPublish}
        />
      ) : null}

      {tab === 'templates' && showPages ? (
        <div className="cms-surface">
          <header className="cms-surface-head">
            <div>
              <h2>Website templates</h2>
              <p>Apply a starter layout to the current draft. Templates never include client secrets.</p>
            </div>
            {manager && pageBody ? (
              <button type="button" className="cms-primary-action" onClick={() => void saveAsTemplate()}>
                Save current design as template
              </button>
            ) : null}
          </header>
          <div className="template-grid">
            {templates.map((t) => {
              const colors = templatePreviewColors(t.body_json);
              const sections = templateSectionCount(t.body_json);
              return (
                <article key={t.id} className="template-card">
                  <div
                    className="template-preview"
                    style={{
                      ['--tpl-primary' as string]: colors.primary,
                      ['--tpl-accent' as string]: colors.accent,
                      ['--tpl-bg' as string]: colors.bg,
                      ['--tpl-text' as string]: colors.text,
                      ['--tpl-card' as string]: colors.card,
                    }}
                    aria-hidden
                  >
                    <div className="tpl-browser">
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="tpl-nav" />
                    <div className="tpl-hero">
                      <em style={{ color: '#fff' }}>Hero</em>
                    </div>
                    <div className="tpl-rows">
                      <i />
                      <i />
                      <i />
                    </div>
                    <div className="tpl-footer" />
                  </div>
                  <div className="template-body">
                    <span className="cms-chip">{t.category}</span>
                    <strong>{t.name}</strong>
                    <p>{t.description ?? `${sections} building blocks`}</p>
                    <div className="template-foot">
                      <span className="muted-sm">{sections} blocks</span>
                      {canEdit ? (
                        <button type="button" onClick={() => applyTemplate(t)}>
                          Use template
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })}
            {templates.length === 0 ? (
              <div className="cms-empty-state">
                <div className="cms-empty-icon">▤</div>
                <h3>No templates yet</h3>
                <p>System templates will appear here once seeded.</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'history' ? (
        <div className="cms-surface">
          <header className="cms-surface-head">
            <div>
              <h2>History &amp; rollback</h2>
              <p>Restore a known revision without deleting audit history.</p>
            </div>
          </header>
          <div className="cms-history-layout">
            <div className="panel">
              <h3>Version history</h3>
              {!docId ? (
                <div className="cms-empty-state compact">
                  <p>Open a page in the editor first, then return here to review revisions.</p>
                </div>
              ) : (
                <ul className="cms-timeline">
                  {revisions.map((r) => (
                    <li key={r.id}>
                      <div className="cms-timeline-dot" />
                      <div>
                        <strong>
                          Rev {r.revision_no} · {r.action}
                        </strong>
                        <div className="muted-sm">
                          {new Date(r.created_at).toLocaleString()}
                          {r.note ? ` · ${r.note}` : ''}
                        </div>
                      </div>
                      {canManageContent ? (
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          onClick={() => void restoreRevision(r.revision_no)}
                        >
                          Restore
                        </button>
                      ) : null}
                    </li>
                  ))}
                  {revisions.length === 0 ? <li className="muted-sm">No revisions yet.</li> : null}
                </ul>
              )}
            </div>
            <div className="panel">
              <h3>Review discussion</h3>
              <ul className="cms-comment-thread">
                {comments.map((c) => (
                  <li key={c.id}>
                    <div className="muted-sm">{new Date(c.created_at).toLocaleString()}</div>
                    <p>{c.body}</p>
                  </li>
                ))}
                {comments.length === 0 ? <li className="muted-sm">No comments yet.</li> : null}
              </ul>
              {docId ? (
                <div className="cms-comment-compose">
                  <label>
                    Comment
                    <textarea rows={3} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} />
                  </label>
                  <button type="button" disabled={!commentBody.trim()} onClick={() => void postComment()}>
                    Post comment
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'pages' && showPages ? (
        <div className={`panel-grid cms-workspace-grid ${editorExpanded ? 'is-editor-expanded' : ''}`}>
          {!editorExpanded ? (
            <div className="panel cms-pages-rail">
              <h2 style={{ marginTop: 0 }}>Pages &amp; modules</h2>
              <ul className="conversation-list">
                {modules.map((m) => (
                  <li key={m.id} className={m.id === moduleId ? 'mine' : ''}>
                    <button
                      type="button"
                      className="linkish"
                      style={{ textAlign: 'left', width: '100%' }}
                      onClick={() => {
                        setModuleId(m.id);
                        startNew();
                      }}
                    >
                      <strong>{m.module_name}</strong>
                      <div className="muted-sm">
                        {m.module_code}
                        {m.hosted_in !== 'platform_content' ? ` · ${m.hosted_in}` : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              <h3>Saved pages</h3>
              <ul className="file-list">
                {docs
                  .filter((d) => !moduleId || d.module_id === moduleId)
                  .filter((d) => !d.archived_at)
                  .map((d) => (
                    <li key={d.id} className={d.id === docId ? 'selected' : undefined}>
                      <div>
                        <button type="button" className="linkish" onClick={() => selectDoc(d)}>
                          <strong>{d.title}</strong>
                        </button>
                        <div className="muted-sm">
                          {STATUS_LABEL[d.status] ?? d.status} · {d.visibility} ·{' '}
                          {new Date(d.updated_at).toLocaleString()}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
              {canEdit && platformEditable ? (
                <button type="button" className="secondary" onClick={startNew}>
                  New page in this module
                </button>
              ) : null}
            </div>
          ) : null}

          <div className={`panel cms-editor-card ${editorExpanded ? 'is-expanded' : ''}`}>
            {!editorExpanded ? (
              <div className="cms-editor-card-head">
                <div>
                  <h2 style={{ margin: 0 }}>Editor</h2>
                  {title.trim() ? (
                    <p className="muted-sm" style={{ margin: '0.25rem 0 0' }}>
                      {title}
                      {slug ? ` · /${slug}` : ''}
                    </p>
                  ) : (
                    <p className="muted-sm" style={{ margin: '0.25rem 0 0' }}>
                      Select a saved page or enter a title below
                    </p>
                  )}
                </div>
                {platformEditable && isNativeVisual && pageBody ? (
                  <button type="button" className="cms-primary-action" onClick={() => setEditorExpanded(true)}>
                    Expand Editor ⛶
                  </button>
                ) : null}
              </div>
            ) : null}
            {!platformEditable ? (
              <p className="muted-sm">
                This module is not editable in the OkangGroup visual workspace
                {selectedMod?.is_sensitive ? ' (sensitive / external).' : '.'}
              </p>
            ) : isNativeVisual && pageBody ? (
              <NativeVisualStudio
                clientId={instance.client_id}
                instanceId={instance.id}
                documentKey={`${docId ?? `new-${moduleId}`}:${editorEpoch}`}
                siteName={client?.legal_name ?? instance.display_name}
                title={title}
                slug={slug}
                bodyJson={pageBody}
                canEdit={canEdit}
                canPublish={canPublish}
                busy={busy}
                expanded={editorExpanded}
                onExpandedChange={setEditorExpanded}
                onTitleChange={setTitle}
                onSlugChange={setSlug}
                onBodyChange={setPageBody}
                onSaveDraft={() => void saveDraft()}
                workflowActions={workflowActions}
              />
            ) : (
              <p className="muted-sm">Select or create a page to open the visual editor.</p>
            )}

            {!editorExpanded && canEdit && platformEditable ? (
              <label className="check" style={{ marginTop: '0.75rem' }}>
                <input
                  type="checkbox"
                  checked={requiresClientApproval}
                  onChange={(e) => setRequiresClientApproval(e.target.checked)}
                />
                Requires client approval before publish
              </label>
            ) : null}

            {!editorExpanded && docId && current ? (
              <div style={{ marginTop: '1rem', display: 'grid', gap: '0.65rem' }}>
                <p className="muted-sm">
                  Status: <strong>{STATUS_LABEL[current.status] ?? current.status}</strong>
                  {current.published_at
                    ? ` · Published ${new Date(current.published_at).toLocaleString()}`
                    : ' · Unpublished draft'}
                </p>
                <label>
                  Review note (optional)
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
                </label>
                <div className="actions">
                  {canEdit ? (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void duplicateDoc()}>
                      Duplicate page
                    </button>
                  ) : null}
                  {canManageContent ? (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void archiveDoc()}>
                      Archive
                    </button>
                  ) : null}
                  {workflowActions}
                </div>
                {!canPublish && current.status === 'in_review' ? (
                  <p className="muted-sm">Waiting for an authorised publisher.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
