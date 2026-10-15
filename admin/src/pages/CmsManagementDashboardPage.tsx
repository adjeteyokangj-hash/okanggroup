import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CMS_ADAPTERS, type CmsAdapterCode } from '../lib/cmsAdapters';
import { OKANGGROUP_PRODUCTS } from '../lib/okanggroupProducts';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  cmsConnectionStatusTone,
  deriveCmsConnectionStatus,
  explainCmsConnectionError,
  isDevelopmentCmsCredentialRef,
  isEphemeralCmsEndpoint,
  isProductionCmsBaseUrl,
  labelCmsConnectionStatus,
  shortCmsConnectionStatus,
  type CmsConnectionEvidence,
} from '../lib/cmsConnectionStatus';
import { looksLikeDevRecord } from '../lib/devRecords';
import { modulePublicPath } from '../lib/opswatchCmsSelection';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';
import { studioToolMatrixForAdapter } from '../visual-studio/studioToolMatrix';

type OwnershipKind = 'okanggroup_product' | 'client_website';

type Instance = {
  id: string;
  display_name: string;
  slug: string;
  cms_config_type: string;
  cms_kind: string;
  status: string;
  client_id: string;
  project_id: string | null;
  public_site_url: string | null;
  ownership_kind: OwnershipKind | null;
  product_code: string | null;
  clients: { legal_name: string; record_kind?: string } | { legal_name: string; record_kind?: string }[] | null;
};

type Summary = {
  instances: number;
  active: number;
  pending_reviews: number;
  pending_client_approvals: number;
  ready_to_publish?: number;
  published_7d: number;
  failed_jobs: number;
  grants: number;
};

/** OpsWatch renders drafts on the public page via ?cmsPreview=, not /preview?token=. */
function opswatchDraftPreviewUrl(
  publicSiteUrl: string | null,
  upstream: { preview_path?: string; token?: string } | undefined,
): string | null {
  const site = (publicSiteUrl || 'http://localhost:3000').replace(/\/$/, '');
  const explicit = upstream?.preview_path?.trim();
  if (explicit) {
    return explicit.startsWith('http')
      ? explicit
      : `${site}${explicit.startsWith('/') ? '' : '/'}${explicit}`;
  }
  const token = upstream?.token?.trim();
  if (!token) return null;
  return `${site}${modulePublicPath('opswatch.page.home')}?cmsPreview=${encodeURIComponent(token)}`;
}

type Client = { id: string; legal_name: string; record_kind?: string };
type Project = { id: string; name: string; code: string; client_id: string };
type Conn = CmsConnectionEvidence & { cms_instance_id: string };

export function CmsManagementDashboardPage() {
  const { can } = useAuth();
  const canManage = can('clients.manage');
  const [rows, setRows] = useState<Instance[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [connections, setConnections] = useState<Record<string, Conn>>({});
  const [q, setQ] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | OwnershipKind>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewQ, setReviewQ] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [ownershipKind, setOwnershipKind] = useState<OwnershipKind>('okanggroup_product');
  const [productCode, setProductCode] = useState(OKANGGROUP_PRODUCTS[0]?.code ?? 'opswatch');
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [publicSiteUrl, setPublicSiteUrl] = useState(
    OKANGGROUP_PRODUCTS[0]?.defaultPublicSiteUrl ?? 'http://localhost:3000',
  );
  const [cmsApiUrl, setCmsApiUrl] = useState(
    OKANGGROUP_PRODUCTS[0]?.defaultCmsApiUrl ?? 'http://localhost:4000/api/cms',
  );

  const [pendingDocs, setPendingDocs] = useState<
    { id: string; title: string; status: string; cms_instance_id: string }[]
  >([]);
  const [jobs, setJobs] = useState<
    { id: string; status: string; adapter_code: string | null; last_error: string | null; created_at: string }[]
  >([]);
  const [audit, setAudit] = useState<{ action: string; created_at: string; entity_type: string | null }[]>(
    [],
  );
  const [credRef, setCredRef] = useState('dev/opswatch-marketing-cms');
  const [credSecret, setCredSecret] = useState('');
  const [gatewayInstanceId, setGatewayInstanceId] = useState('');
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState('http://localhost:4000/api/cms');
  const [showDev, setShowDev] = useState(loadShowDevRecords);
  const [busy, setBusy] = useState(false);

  const customerClients = useMemo(
    () => clients.filter((c) => (c.record_kind ?? 'customer') === 'customer'),
    [clients],
  );

  const registeredProductCodes = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      if (r.product_code) set.add(r.product_code);
    }
    return set;
  }, [rows]);

  const selectedProduct = useMemo(
    () => OKANGGROUP_PRODUCTS.find((p) => p.code === productCode),
    [productCode],
  );

  const opswatchRow = useMemo(
    () => rows.find((r) => r.product_code === 'opswatch' || r.slug === 'opswatch'),
    [rows],
  );

  async function load() {
    if (!canManage) return;
    const instRes = await supabase
      .from('cms_instances')
      .select(
        'id, display_name, slug, cms_config_type, cms_kind, status, client_id, project_id, public_site_url, ownership_kind, product_code, clients(legal_name, record_kind)',
      )
      .order('display_name');

    let instances: Instance[] = [];
    if (instRes.error) {
      const legacy = await supabase
        .from('cms_instances')
        .select(
          'id, display_name, slug, cms_config_type, cms_kind, status, client_id, project_id, public_site_url, clients(legal_name)',
        )
        .order('display_name');
      if (legacy.error) setError(legacy.error.message);
      instances = ((legacy.data as Instance[]) ?? []).map((r) => ({
        ...r,
        ownership_kind: 'client_website' as const,
        product_code: null,
      }));
    } else {
      instances = (instRes.data as Instance[]) ?? [];
    }

    const clientsRes = await supabase.from('clients').select('id, legal_name, record_kind').order('legal_name');
    let clientRows: Client[] = [];
    if (clientsRes.error) {
      const legacyClients = await supabase.from('clients').select('id, legal_name').order('legal_name');
      clientRows = ((legacyClients.data as Client[]) ?? []).map((row) => ({
        ...row,
        record_kind: 'customer',
      }));
    } else {
      clientRows = (clientsRes.data as Client[]) ?? [];
    }

    const [{ data: sum }, { data: p }, { data: docs }, { data: j }, { data: a }, { data: conns }] =
      await Promise.all([
        supabase.rpc('cms_management_summary'),
        supabase.from('projects').select('id, name, code, client_id').order('name'),
        supabase
          .from('client_cms_documents')
          .select('id, title, status, cms_instance_id')
          .in('status', ['in_review', 'awaiting_client_approval', 'approved_for_publish'])
          .order('updated_at', { ascending: false })
          .limit(100),
        supabase
          .from('cms_publish_jobs')
          .select('id, status, adapter_code, last_error, created_at')
          .order('created_at', { ascending: false })
          .limit(15),
        supabase
          .from('cms_audit_events')
          .select('action, created_at, entity_type')
          .order('created_at', { ascending: false })
          .limit(40),
        supabase
          .from('cms_connections')
          .select(
            'cms_instance_id, adapter_code, status, base_url, integration_mode, last_healthy_at, last_error, notes, capability_json',
          ),
      ]);

    setRows(instances);
    setSummary((sum as Summary) ?? null);
    setClients(clientRows);
    setProjects((p as Project[]) ?? []);
    setPendingDocs((docs as typeof pendingDocs) ?? []);
    setJobs((j as typeof jobs) ?? []);
    setAudit((a as typeof audit) ?? []);
    const map: Record<string, Conn> = {};
    for (const row of (conns as Conn[]) ?? []) map[row.cms_instance_id] = row;
    setConnections(map);
  }

  useEffect(() => {
    void load();
  }, [canManage]);

  useEffect(() => {
    if (!selectedProduct) return;
    setPublicSiteUrl(selectedProduct.defaultPublicSiteUrl);
    setCmsApiUrl(selectedProduct.defaultCmsApiUrl);
    setCredRef(`dev/${selectedProduct.code}-marketing-cms`);
    setGatewayBaseUrl(selectedProduct.defaultCmsApiUrl);
  }, [selectedProduct]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      const kind = r.ownership_kind ?? 'client_website';
      if (!showDev && looksLikeDevRecord(r.display_name, client?.legal_name, r.slug)) return false;
      if (ownershipFilter !== 'all' && kind !== ownershipFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!needle) return true;
      return [r.display_name, r.slug, kind, r.product_code, client?.legal_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, ownershipFilter, statusFilter, showDev]);

  const instanceLookup = useMemo(() => {
    const map: Record<string, { name: string; client: string; slug: string }> = {};
    for (const r of rows) {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      map[r.id] = { name: r.display_name, client: client?.legal_name ?? '', slug: r.slug };
    }
    return map;
  }, [rows]);

  const studioToolMatrix = useMemo(() => {
    const code = connections[gatewayInstanceId]?.adapter_code;
    if (!code) return [];
    return studioToolMatrixForAdapter(code, { canEdit: true, canPublish: true });
  }, [connections, gatewayInstanceId]);

  const reviewRows = useMemo(() => {
    const needle = reviewQ.trim().toLowerCase();
    return pendingDocs
      .map((d) => {
        const inst = instanceLookup[d.cms_instance_id];
        return {
          ...d,
          instanceName: inst?.name ?? 'Unknown website',
          clientName: inst?.client ?? '',
          isDev: looksLikeDevRecord(d.title, inst?.name, inst?.client, inst?.slug),
        };
      })
      .filter((d) => {
        if (reviewStatus !== 'all' && d.status !== reviewStatus) return false;
        if (!needle) return true;
        return [d.title, d.status, d.instanceName, d.clientName].some((v) =>
          v.toLowerCase().includes(needle),
        );
      });
  }, [pendingDocs, reviewQ, reviewStatus, instanceLookup]);

  const genuineReviews = useMemo(() => reviewRows.filter((d) => !d.isDev), [reviewRows]);
  const devReviews = useMemo(() => reviewRows.filter((d) => d.isDev), [reviewRows]);

  function renderReviewList(list: typeof reviewRows, limit: number, emptyText: string) {
    return (
      <>
        <ul className="file-list cms-review-list">
          {list.slice(0, limit).map((d) => (
            <li key={d.id}>
              <div>
                <strong>{d.title}</strong>
                {d.isDev ? <span className="dev-badge">Dev</span> : null}
                <div className="muted-sm">
                  {d.instanceName}
                  {d.clientName ? ` · ${d.clientName}` : ''} · {d.status.replace(/_/g, ' ')}
                </div>
              </div>
              <Link to={`/my-cms/${d.cms_instance_id}`}>Open</Link>
            </li>
          ))}
          {list.length === 0 ? <li className="muted-sm">{emptyText}</li> : null}
        </ul>
        {list.length > limit ? (
          <p className="muted-sm">
            Showing {limit} of {list.length}. Refine the filter to narrow.
          </p>
        ) : null}
      </>
    );
  }

  async function onAddWebsite(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setError(null);
    setMessage(null);
    setBusy(true);

    const displayName =
      ownershipKind === 'okanggroup_product'
        ? (selectedProduct?.name ?? name.trim())
        : name.trim();

    if (!displayName) {
      setError('Website name is required.');
      setBusy(false);
      return;
    }

    if (ownershipKind === 'okanggroup_product' && registeredProductCodes.has(productCode)) {
      const existing = rows.find((r) => r.product_code === productCode);
      setMessage(
        `${displayName} is already registered. Use Manage Website — no duplicate created.`,
      );
      if (existing) setGatewayInstanceId(existing.id);
      setBusy(false);
      return;
    }

    if (ownershipKind === 'client_website' && !clientId) {
      setError('Select a customer client for Client Website registration.');
      setBusy(false);
      return;
    }

    const { data, error: err } = await supabase.rpc('register_managed_website', {
      p_ownership_kind: ownershipKind,
      p_display_name: displayName,
      p_product_code: ownershipKind === 'okanggroup_product' ? productCode : null,
      p_client_id: ownershipKind === 'client_website' ? clientId : null,
      p_project_id: ownershipKind === 'client_website' && projectId ? projectId : null,
      p_public_site_url:
        ownershipKind === 'okanggroup_product'
          ? publicSiteUrl.trim() || selectedProduct?.defaultPublicSiteUrl || null
          : null,
      p_adapter_code:
        ownershipKind === 'okanggroup_product' ? (selectedProduct?.adapter ?? null) : 'okang_native',
    });

    setBusy(false);

    if (err) {
      if (/register_managed_website|schema cache|Could not find/i.test(err.message)) {
        setError(
          'Product registration is not available yet. Apply migration M44 (managed website products), then retry. No fake client was created.',
        );
      } else {
        setError(err.message);
      }
      return;
    }

    const r = data as {
      ok?: boolean;
      created?: boolean;
      already_registered?: boolean;
      instance_id?: string;
      display_name?: string;
      product_code?: string;
    };

    if (r.already_registered) {
      setMessage(
        `${r.display_name ?? displayName} was already registered. Open Manage Website — no duplicate created.`,
      );
    } else {
      setMessage(
        ownershipKind === 'okanggroup_product'
          ? `${r.display_name ?? displayName} registered as an OkangGroup product. Complete Connection Settings once (vault credential + gateway health), then Manage Website.`
          : `${r.display_name ?? displayName} registered as a client website.`,
      );
    }

    if (r.instance_id) {
      setGatewayInstanceId(r.instance_id);
      if (ownershipKind === 'okanggroup_product' && cmsApiUrl.trim()) {
        await supabase.rpc('configure_cms_connection', {
          p_instance_id: r.instance_id,
          p_adapter_code: selectedProduct?.adapter ?? 'opswatch_marketing',
          p_base_url: cmsApiUrl.trim(),
          p_credential_ref: credRef.trim() || 'dev/opswatch-marketing-cms',
          p_notes:
            'OpsWatch public marketing website only — no Command Center, customer, monitoring, or billing access',
          p_integration_mode: 'external',
        });
        if (publicSiteUrl.trim()) {
          await supabase
            .from('cms_instances')
            .update({ public_site_url: publicSiteUrl.trim() })
            .eq('id', r.instance_id);
        }
      }
    }

    setName('');
    await load();
  }

  async function setStatus(id: string, status: string) {
    const patch: Record<string, unknown> = { status };
    if (status === 'paused') patch.suspended_at = new Date().toISOString();
    if (status === 'active') {
      patch.suspended_at = null;
      patch.activated_at = new Date().toISOString();
    }
    const { error: err } = await supabase.from('cms_instances').update(patch).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function testConnection(id: string) {
    const { data, error: err } = await supabase.rpc('test_cms_connection', { p_instance_id: id });
    if (err) setError(err.message);
    else {
      const r = data as { ok?: boolean; message?: string; adapter?: string; external_live?: boolean };
      setMessage(
        `${r.message ?? (r.ok ? 'Connection OK' : 'Connection issue')}${
          r.external_live ? ' (live external — credentials required)' : ''
        }`,
      );
      await load();
    }
  }

  async function configureAdapter(id: string, adapter: CmsAdapterCode) {
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('configure_cms_connection', {
      p_instance_id: id,
      p_adapter_code: adapter,
      p_notes:
        adapter === 'sandbox_mock'
          ? 'Development sandbox — no live client application'
          : adapter === 'okang_native'
            ? 'OkangGroup platform content store'
            : null,
    });
    if (err) setError(err.message);
    else {
      const r = data as { ok?: boolean; adapter?: string; status?: string };
      setMessage(`Adapter set to ${r.adapter ?? adapter} (${r.status ?? 'updated'}).`);
      await load();
    }
  }

  async function sandboxPublishProbe(id: string) {
    setError(null);
    setMessage(null);
    const key = `uat-sandbox-${id.slice(0, 8)}`;
    const { data, error: err } = await supabase.rpc('run_cms_sandbox_publish_probe', {
      p_instance_id: id,
      p_idempotency_key: key,
    });
    if (err) setError(err.message);
    else {
      const r = data as { message?: string; idempotent_replay?: boolean; correlation_id?: string };
      setMessage(
        `${r.message ?? 'Sandbox probe complete'}${
          r.idempotent_replay ? ' (idempotent replay)' : ''
        }${r.correlation_id ? ` · ${r.correlation_id}` : ''}`,
      );
      await load();
    }
  }

  async function storeCredential(e: FormEvent) {
    e.preventDefault();
    if (!credRef.trim() || !credSecret) return;
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('store_cms_credential', {
      p_credential_ref: credRef.trim(),
      p_secret: credSecret,
      p_description: 'Development vault entry — not for live clients',
    });
    setCredSecret('');
    if (err) setError(err.message);
    else {
      const r = data as { message?: string; credential_ref?: string };
      setMessage(r.message ?? `Stored ${r.credential_ref} (value not returned)`);
    }
  }

  async function configureDevClientHttp(id: string) {
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('configure_cms_connection', {
      p_instance_id: id,
      p_adapter_code: 'okang_dev_client',
      p_base_url:
        gatewayBaseUrl.trim() ||
        'https://prbgsnxpwyepdggdysnt.supabase.co/functions/v1/dev-client-cms',
      p_credential_ref: credRef.trim() || 'dev/okang-client-cms',
      p_notes: 'Dedicated non-production client CMS stub',
      p_integration_mode: 'external',
    });
    if (err) setError(err.message);
    else {
      const r = data as { adapter?: string; status?: string };
      setMessage(`Configured ${r.adapter} (${r.status}). Use Gateway health after stub is running.`);
      await load();
    }
  }

  async function configureOpsWatchMarketing(id: string) {
    setError(null);
    setMessage(null);
    const base = gatewayBaseUrl.trim();
    if (!base) {
      setError('Enter the OpsWatch CMS base URL. An empty field is not saved as localhost.');
      return;
    }
    const credential = credRef.trim();
    if (isProductionCmsBaseUrl(base) && isDevelopmentCmsCredentialRef(credential)) {
      setError(
        'A production CMS endpoint needs an approved credential reference. The development reference was not substituted.',
      );
      return;
    }
    const { data, error: err } = await supabase.rpc('configure_cms_connection', {
      p_instance_id: id,
      p_adapter_code: 'opswatch_marketing',
      p_base_url: base,
      p_credential_ref: credential || 'dev/opswatch-marketing-cms',
      p_notes:
        'OpsWatch public marketing website only — no Command Center, customer, monitoring, or billing access',
      p_integration_mode: 'external',
    });
    if (err) setError(err.message);
    else {
      const r = data as { adapter?: string; status?: string };
      setMessage(
        `Configured ${r.adapter} (${r.status}). Point base URL at OpsWatch /api/cms and run Gateway health.`,
      );
      await load();
    }
  }

  function formatGatewayFailure(r: {
    ok?: boolean;
    correlation_id?: string;
    error?: string;
    upstream?: unknown;
  }): string {
    const upstream =
      r.upstream && typeof r.upstream === 'object'
        ? JSON.stringify(r.upstream)
        : typeof r.upstream === 'string'
          ? r.upstream
          : '';
    const parts = [
      r.error ?? 'Gateway health failed',
      r.correlation_id ? `correlation ${r.correlation_id}` : null,
      upstream ? `upstream ${upstream.slice(0, 240)}` : null,
    ].filter(Boolean);
    return explainCmsConnectionError(parts.join(' · '));
  }

  async function gatewayHealth(id: string): Promise<boolean> {
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.functions.invoke('cms-integration-gateway', {
      body: { action: 'health', instance_id: id, idempotency_key: `health-${id}-${Date.now()}` },
    });
    await load();
    if (err) {
      const fromData =
        data && typeof data === 'object' && 'error' in data
          ? String((data as { error?: string }).error ?? '')
          : '';
      setError(explainCmsConnectionError(fromData || err.message));
      return false;
    }
    const r = data as { ok?: boolean; correlation_id?: string; error?: string; upstream?: unknown };
    if (r.ok) {
      setMessage(`API verification passed · ${r.correlation_id ?? 'gateway health OK'}`);
      return true;
    }
    setError(formatGatewayFailure(r));
    return false;
  }

  /**
   * Configure OpsWatch marketing adapter (if needed) then verify via gateway →
   * OpsWatch GET /api/cms/health (+ capabilities fallback). Status becomes Connected
   * only when the edge probe succeeds — never from configure alone.
   */
  async function connectAndVerifyOpsWatch(id: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const base = gatewayBaseUrl.trim() || 'http://localhost:4000/api/cms';
      const ref = credRef.trim() || 'dev/opswatch-marketing-cms';
      if (!base.includes('/api/cms')) {
        setError('CMS API base URL must end with /api/cms (OpsWatch marketing adapter).');
        return;
      }
      if (/localhost|127\.0\.0\.1/i.test(base)) {
        setMessage(
          'Note: Hosted OkangGroup Edge cannot reach localhost. Use a tunnel URL or a publicly reachable OpsWatch /api/cms base for Gateway health.',
        );
      }
      const { data: cfg, error: cfgErr } = await supabase.rpc('configure_cms_connection', {
        p_instance_id: id,
        p_adapter_code: 'opswatch_marketing',
        p_base_url: base,
        p_credential_ref: ref,
        p_notes:
          'OpsWatch public marketing website only — no Command Center, customer, monitoring, or billing access',
        p_integration_mode: 'external',
      });
      if (cfgErr) {
        setError(cfgErr.message);
        return;
      }
      const cfgRow = cfg as { adapter?: string; status?: string };
      setMessage(
        `Configured ${cfgRow.adapter ?? 'opswatch_marketing'} (${cfgRow.status ?? 'updated'}). Verifying via gateway…`,
      );
      const ok = await gatewayHealth(id);
      if (ok) {
        setMessage(
          `OpsWatch connected. Registry status updates only after successful API verification against ${base}.`,
        );
      }
    } finally {
      setBusy(false);
      await load();
    }
  }

  async function previewWebsite(r: Instance) {
    setError(null);
    setMessage(null);
    const conn = connections[r.id];
    if (conn?.adapter_code === 'opswatch_marketing' || r.product_code === 'opswatch') {
      const { data, error: err } = await supabase.functions.invoke('cms-integration-gateway', {
        body: {
          action: 'preview_token',
          instance_id: r.id,
          module_code: 'opswatch.page.home',
          idempotency_key: `preview-${r.id}-${Date.now()}`,
        },
      });
      if (err) {
        setError(err.message);
        return;
      }
      const payload = data as { ok?: boolean; error?: string; upstream?: { preview_path?: string; token?: string } };
      if (!payload?.ok) {
        setError(payload?.error ?? 'Preview failed — complete Connection Settings first.');
        return;
      }
      const url = opswatchDraftPreviewUrl(r.public_site_url, payload.upstream);
      if (!url) {
        setError('Preview token missing from OpsWatch. Complete Connection Settings, then try again.');
        return;
      }
      const opened = window.open(url, '_blank', 'noopener,noreferrer');
      if (!opened) {
        setError(`Preview was blocked by the browser. Open this address manually: ${url}`);
        return;
      }
      setMessage('Preview opened. Draft content is not public until published.');
      return;
    }
    const site = r.public_site_url;
    if (site) window.open(site, '_blank', 'noopener,noreferrer');
    else setMessage('No public site URL set. Open Manage Website to configure content.');
  }

  if (!canManage) {
    return <div className="center">clients.manage required to open CMS Management.</div>;
  }

  const productAlreadyRegistered =
    ownershipKind === 'okanggroup_product' && registeredProductCodes.has(productCode);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Managed Websites</h1>
          <p>
            Register OkangGroup products (starting with OpsWatch) and client websites. Ownership stays
            separate; both use the same CMS connection infrastructure.
          </p>
        </div>
        <label className="check check-row check-row--inline">
          <input
            type="checkbox"
            checked={showDev}
            onChange={(e) => {
              setShowDev(e.target.checked);
              saveShowDevRecords(e.target.checked);
            }}
          />
          Show development records
        </label>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {summary ? (
        <div className="stat-grid" style={{ marginBottom: '1rem' }}>
          <button
            type="button"
            className="stat-card"
            onClick={() => {
              setStatusFilter('all');
              setOwnershipFilter('all');
              document.getElementById('cms-registry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <h2>{summary.instances}</h2>
            <p>Websites</p>
          </button>
          <button
            type="button"
            className="stat-card"
            onClick={() => {
              setStatusFilter('active');
              document.getElementById('cms-registry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <h2>{summary.active}</h2>
            <p>Active</p>
          </button>
          <button
            type="button"
            className="stat-card"
            onClick={() => {
              setReviewStatus('in_review');
              document.getElementById('cms-pending-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <h2>{summary.pending_reviews}</h2>
            <p>Pending reviews</p>
          </button>
          <button
            type="button"
            className="stat-card"
            onClick={() => {
              const el = document.getElementById('cms-connection-settings') as HTMLDetailsElement | null;
              if (el) el.open = true;
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <h2>{summary.published_7d}</h2>
            <p>Published (7d)</p>
          </button>
        </div>
      ) : null}

      <div className="cms-mgmt-grid" style={{ marginBottom: '1rem' }}>
        <form className="panel form-compact cms-mgmt-create" onSubmit={(e) => void onAddWebsite(e)}>
          <h2 style={{ marginTop: 0 }}>Add Website</h2>
          <p className="muted-sm">
            Choose ownership first. OkangGroup products do not require a customer client record.
          </p>

          <fieldset className="ownership-fieldset">
            <legend className="muted-sm">Ownership</legend>
            <label className="check check-row">
              <input
                type="radio"
                name="ownership"
                checked={ownershipKind === 'okanggroup_product'}
                onChange={() => setOwnershipKind('okanggroup_product')}
              />
              OkangGroup Product
            </label>
            <label className="check check-row">
              <input
                type="radio"
                name="ownership"
                checked={ownershipKind === 'client_website'}
                onChange={() => setOwnershipKind('client_website')}
              />
              Client Website
            </label>
          </fieldset>

          {ownershipKind === 'okanggroup_product' ? (
            <>
              <label>
                Product
                <select
                  value={productCode}
                  onChange={(e) => setProductCode(e.target.value)}
                  required
                >
                  {OKANGGROUP_PRODUCTS.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.name}
                      {registeredProductCodes.has(p.code) ? ' (registered)' : ''}
                    </option>
                  ))}
                </select>
              </label>
              {selectedProduct ? <p className="muted-sm">{selectedProduct.summary}</p> : null}
              <div className="row-2">
                <label>
                  Public site URL
                  <input
                    value={publicSiteUrl}
                    onChange={(e) => setPublicSiteUrl(e.target.value)}
                    placeholder="http://localhost:3000"
                  />
                </label>
                <label>
                  CMS API URL
                  <input
                    value={cmsApiUrl}
                    onChange={(e) => setCmsApiUrl(e.target.value)}
                    placeholder="http://localhost:4000/api/cms"
                  />
                </label>
              </div>
              {productAlreadyRegistered && opswatchRow ? (
                <p className="ok" style={{ marginBottom: '0.75rem' }}>
                  {selectedProduct?.name ?? 'Product'} is already in the registry.{' '}
                  <Link to={`/my-cms/${opswatchRow.id}`}>Manage Website</Link>
                </p>
              ) : null}
            </>
          ) : (
            <>
              <label>
                Display name
                <input value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <div className="row-2">
                <label>
                  Client
                  <select
                    value={clientId}
                    onChange={(e) => {
                      setClientId(e.target.value);
                      setProjectId('');
                    }}
                    required
                  >
                    <option value="">Select customer…</option>
                    {customerClients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Project (optional)
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                    <option value="">None</option>
                    {projects
                      .filter((p) => p.client_id === clientId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code} — {p.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </>
          )}

          <button type="submit" disabled={busy || productAlreadyRegistered}>
            {productAlreadyRegistered ? 'Already registered' : busy ? 'Adding…' : 'Add Website'}
          </button>
        </form>

        <div className="panel" id="cms-pending-reviews">
          <h2 style={{ marginTop: 0 }}>Pending reviews</h2>
          <div className="toolbar" style={{ marginBottom: '0.65rem' }}>
            <input
              placeholder="Search reviews…"
              value={reviewQ}
              onChange={(e) => setReviewQ(e.target.value)}
            />
            <select value={reviewStatus} onChange={(e) => setReviewStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="in_review">In review</option>
              <option value="awaiting_client_approval">Awaiting client</option>
              <option value="approved_for_publish">Approved</option>
            </select>
          </div>
          <h3 className="cms-review-heading">Genuine approvals ({genuineReviews.length})</h3>
          {renderReviewList(genuineReviews, 10, 'No pending client approvals or reviews.')}

          {showDev ? (
            <div className="cms-dev-section">
              <h3 className="cms-review-heading">
                Development / UAT records ({devReviews.length})
                <span className="dev-badge">Dev</span>
              </h3>
              <p className="muted-sm" style={{ margin: '0 0 0.35rem' }}>
                Synthetic documents such as Hosted UAT Gate Doc. Not real client work.
              </p>
              {renderReviewList(devReviews, 8, 'No development approvals.')}
            </div>
          ) : devReviews.length > 0 ? (
            <p className="muted-sm" style={{ marginTop: '0.65rem' }}>
              {devReviews.length} development/UAT approval{devReviews.length === 1 ? '' : 's'} hidden.
              Enable “Show development records” to view.
            </p>
          ) : null}
        </div>
      </div>

      <div className="toolbar">
        <input placeholder="Search websites…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          value={ownershipFilter}
          onChange={(e) => setOwnershipFilter(e.target.value as typeof ownershipFilter)}
        >
          <option value="all">All ownership</option>
          <option value="okanggroup_product">OkangGroup products</option>
          <option value="client_website">Client websites</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      <div className="panel" id="cms-registry" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Website registry</h2>
        <table>
          <thead>
            <tr>
              <th>Website</th>
              <th>Ownership</th>
              <th>Connection Status</th>
              <th>Last verified</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
              const conn = connections[r.id];
              const connStatus = deriveCmsConnectionStatus(conn);
              const isDev = looksLikeDevRecord(r.display_name, client?.legal_name, r.slug);
              const kind = r.ownership_kind ?? 'client_website';
              const isProduct = kind === 'okanggroup_product';
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.display_name}</strong>
                    {isDev ? <span className="dev-badge">Dev</span> : null}
                    <div className="muted-sm">
                      {isProduct
                        ? `OkangGroup · ${r.product_code ?? r.slug}`
                        : (client?.legal_name ?? r.client_id)}
                    </div>
                  </td>
                  <td className="muted-sm">
                    {isProduct ? 'OkangGroup Product' : 'Client Website'}
                  </td>
                  <td>
                    <span
                      className={`status-chip ${cmsConnectionStatusTone(connStatus)}`}
                      title={
                        conn?.last_error
                          ? `${labelCmsConnectionStatus(connStatus)} — ${conn.last_error}`
                          : labelCmsConnectionStatus(connStatus)
                      }
                    >
                      {shortCmsConnectionStatus(connStatus)}
                    </span>
                    {conn?.last_error && connStatus === 'connection_failed' ? (
                      <div className="muted-sm cms-conn-error" title={conn.last_error}>
                        {conn.last_error.slice(0, 120)}
                        {conn.last_error.length > 120 ? '…' : ''}
                      </div>
                    ) : null}
                  </td>
                  <td className="muted-sm">
                    {conn?.last_healthy_at
                      ? new Date(conn.last_healthy_at).toLocaleString()
                      : '—'}
                  </td>
                  <td>{r.status}</td>
                  <td className="cms-actions-cell">
                    <Link to={`/my-cms/${r.id}`}>Manage Website</Link>
                    <button type="button" className="secondary" onClick={() => void previewWebsite(r)}>
                      Preview
                    </button>
                    <Link to={`/my-cms/${r.id}`}>Publish</Link>
                    {r.product_code === 'opswatch' ||
                    conn?.adapter_code === 'opswatch_marketing' ? (
                      <button
                        type="button"
                        disabled={busy}
                        title="Re-run gateway health against the saved endpoint. Does not change the API credential."
                        onClick={() => {
                          setGatewayInstanceId(r.id);
                          if (conn?.base_url) setGatewayBaseUrl(conn.base_url);
                          void gatewayHealth(r.id);
                        }}
                      >
                        Reconnect
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="secondary"
                      title="Open Connection Settings (vault, base URL, gateway tools)"
                      onClick={() => {
                        const el = document.getElementById(
                          'cms-connection-settings',
                        ) as HTMLDetailsElement | null;
                        if (el) el.open = true;
                        setGatewayInstanceId(r.id);
                        if (conn?.base_url) setGatewayBaseUrl(conn.base_url);
                        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    >
                      Settings
                    </button>
                    {r.status === 'active' ? (
                      <button type="button" className="secondary" onClick={() => void setStatus(r.id, 'paused')}>
                        Suspend
                      </button>
                    ) : (
                      <button type="button" className="secondary" onClick={() => void setStatus(r.id, 'active')}>
                        Activate
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6}>No websites match.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <details className="advanced-details" id="cms-connection-settings">
        <summary>Connection Settings</summary>
        <p className="muted-sm">
          Advanced adapter, vault, gateway, and sandbox tools. Credentials are stored in the private
          vault via RPC — never in browser storage. Complete this once per product website after Add
          Website.
        </p>
        <form className="toolbar form-compact" onSubmit={(e) => void storeCredential(e)}>
          <input
            value={credRef}
            onChange={(e) => setCredRef(e.target.value)}
            placeholder="credential_ref (dev/…)"
            aria-label="Credential ref"
          />
          <input
            type="password"
            value={credSecret}
            onChange={(e) => setCredSecret(e.target.value)}
            placeholder="Secret (not retained in UI)"
            aria-label="Credential secret"
            autoComplete="new-password"
          />
          <button type="submit">Store vault credential</button>
        </form>
        <div className="toolbar">
          <input
            value={gatewayBaseUrl}
            onChange={(e) => setGatewayBaseUrl(e.target.value)}
            placeholder="CMS API base URL"
            aria-label="Base URL"
          />
          {isEphemeralCmsEndpoint(gatewayBaseUrl) ? (
            <p className="muted-sm">
              This is a temporary Cloudflare quick-tunnel address. It stops resolving when the tunnel
              process stops. Production should use a stable OpsWatch API host. Reconnect checks the
              saved endpoint and does not replace the API credential.
            </p>
          ) : null}
          <select
            value={gatewayInstanceId}
            onChange={(e) => setGatewayInstanceId(e.target.value)}
            aria-label="Website instance"
          >
            <option value="">Select website…</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name}
                {r.product_code ? ` (${r.product_code})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            disabled={!gatewayInstanceId}
            onClick={() => void configureOpsWatchMarketing(gatewayInstanceId)}
          >
            Attach OpsWatch marketing
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!gatewayInstanceId}
            onClick={() => void configureDevClientHttp(gatewayInstanceId)}
          >
            Attach development client
          </button>
          <button
            type="button"
            disabled={!gatewayInstanceId || busy}
            title="Re-verify OpsWatch: configure adapter then gateway → /api/cms/health"
            onClick={() => void connectAndVerifyOpsWatch(gatewayInstanceId)}
          >
            Connect / verify OpsWatch
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!gatewayInstanceId || busy}
            onClick={() => void gatewayHealth(gatewayInstanceId)}
          >
            Gateway health only
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!gatewayInstanceId}
            title="RPC smoke test — does not verify OpsWatch HTTP; use Connect / verify for live status"
            onClick={() => void testConnection(gatewayInstanceId)}
          >
            RPC test (non-OpsWatch)
          </button>
        </div>
        <div className="toolbar">
          <select
            aria-label="Configure adapter"
            defaultValue=""
            disabled={!gatewayInstanceId}
            onChange={(e) => {
              const v = e.target.value as CmsAdapterCode;
              if (!v || !gatewayInstanceId) return;
              void configureAdapter(gatewayInstanceId, v);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              Adapter…
            </option>
            {CMS_ADAPTERS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            disabled={!gatewayInstanceId}
            onClick={() => void sandboxPublishProbe(gatewayInstanceId)}
          >
            Sandbox publish probe
          </button>
        </div>
        {gatewayInstanceId && studioToolMatrix.length ? (
          <div className="cms-dev-section">
            <h3>Visual Studio tools for this adapter</h3>
            <p className="muted-sm">
              Capability-aware matrix for OkangGroup Visual Studio. Unsupported tools stay hidden or
              show notices in the editor — they never fake unsupported edits.
            </p>
            <ul className="file-list">
              {studioToolMatrix.map((tool) => (
                <li key={tool.id}>
                  <strong>{tool.label}</strong>
                  <div className="muted-sm">{tool.available ? 'Available' : 'Not available for adapter'}</div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <h3>Recent publish jobs</h3>
        <ul className="file-list">
          {jobs.map((j) => (
            <li key={j.id}>
              <div>
                <strong>{j.status}</strong>
                <div className="muted-sm">
                  {j.adapter_code} · {new Date(j.created_at).toLocaleString()}
                  {j.last_error ? ` · ${j.last_error}` : ''}
                </div>
              </div>
            </li>
          ))}
          {jobs.length === 0 ? <li className="muted-sm">No publish jobs.</li> : null}
        </ul>
        <h3>Audit history</h3>
        <ul className="file-list">
          {audit.map((a, i) => (
            <li key={`${a.action}-${a.created_at}-${i}`}>
              <div>
                <strong>{a.action}</strong>
                <div className="muted-sm">
                  {a.entity_type} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
