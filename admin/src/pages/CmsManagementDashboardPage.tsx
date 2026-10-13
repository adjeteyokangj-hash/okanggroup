import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CMS_ADAPTERS, type CmsAdapterCode } from '../lib/cmsAdapters';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  cmsConnectionStatusTone,
  deriveCmsConnectionStatus,
  labelCmsConnectionStatus,
  type CmsConnectionEvidence,
} from '../lib/cmsConnectionStatus';
import { looksLikeDevRecord } from '../lib/devRecords';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';

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
  clients: { legal_name: string } | { legal_name: string }[] | null;
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

type Client = { id: string; legal_name: string };
type Project = { id: string; name: string; code: string; client_id: string };
type Conn = CmsConnectionEvidence & { cms_instance_id: string };

export function CmsManagementDashboardPage() {
  const { user, can } = useAuth();
  const canManage = can('clients.manage');
  const [rows, setRows] = useState<Instance[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [connections, setConnections] = useState<Record<string, Conn>>({});
  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reviewQ, setReviewQ] = useState('');
  const [reviewStatus, setReviewStatus] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [configType, setConfigType] = useState<'generic' | 'custom' | 'hybrid'>('generic');
  const [pendingDocs, setPendingDocs] = useState<
    { id: string; title: string; status: string; cms_instance_id: string }[]
  >([]);
  const [jobs, setJobs] = useState<
    { id: string; status: string; adapter_code: string | null; last_error: string | null; created_at: string }[]
  >([]);
  const [audit, setAudit] = useState<{ action: string; created_at: string; entity_type: string | null }[]>(
    [],
  );
  const [credRef, setCredRef] = useState('dev/okang-client-cms');
  const [credSecret, setCredSecret] = useState('');
  const [gatewayInstanceId, setGatewayInstanceId] = useState('');
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState(
    'https://prbgsnxpwyepdggdysnt.supabase.co/functions/v1/dev-client-cms',
  );
  const [showDev, setShowDev] = useState(loadShowDevRecords);

  async function load() {
    if (!canManage) return;
    const [{ data: inst }, { data: sum }, { data: c }, { data: p }, { data: docs }, { data: j }, { data: a }, { data: conns }] =
      await Promise.all([
        supabase
          .from('cms_instances')
          .select(
            'id, display_name, slug, cms_config_type, cms_kind, status, client_id, project_id, public_site_url, clients(legal_name)',
          )
          .order('display_name'),
        supabase.rpc('cms_management_summary'),
        supabase.from('clients').select('id, legal_name').order('legal_name'),
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
    setRows((inst as Instance[]) ?? []);
    setSummary((sum as Summary) ?? null);
    setClients((c as Client[]) ?? []);
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      if (!showDev && looksLikeDevRecord(r.display_name, client?.legal_name, r.slug)) return false;
      if (typeFilter !== 'all' && r.cms_config_type !== typeFilter) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!needle) return true;
      return [r.display_name, r.slug, r.cms_config_type, client?.legal_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, typeFilter, statusFilter, showDev]);

  const instanceLookup = useMemo(() => {
    const map: Record<string, { name: string; client: string; slug: string }> = {};
    for (const r of rows) {
      const client = Array.isArray(r.clients) ? r.clients[0] : r.clients;
      map[r.id] = { name: r.display_name, client: client?.legal_name ?? '', slug: r.slug };
    }
    return map;
  }, [rows]);

  const reviewRows = useMemo(() => {
    const needle = reviewQ.trim().toLowerCase();
    return pendingDocs
      .map((d) => {
        const inst = instanceLookup[d.cms_instance_id];
        return {
          ...d,
          instanceName: inst?.name ?? 'Unknown CMS',
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
          <p className="muted-sm">Showing {limit} of {list.length}. Refine the filter to narrow.</p>
        ) : null}
      </>
    );
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !user || !clientId || !name.trim()) return;
    setError(null);
    setMessage(null);
    const slug =
      name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36);
    const { data: created, error: err } = await supabase
      .from('cms_instances')
      .insert({
        client_id: clientId,
        project_id: projectId || null,
        display_name: name.trim(),
        slug,
        cms_kind: 'okang_native',
        cms_config_type: configType,
        management_mode: 'okanggroup_managed',
        status: 'active',
        activated_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select('id, client_id')
      .single();
    if (err || !created) {
      setError(err?.message ?? 'Create failed');
      return;
    }
    await supabase.from('cms_connections').upsert({
      cms_instance_id: created.id,
      client_id: created.client_id,
      adapter_code: 'okang_native',
      auth_method: 'manual',
      status: 'configured',
      notes: 'Created from CMS Management Dashboard',
    });
    if (configType === 'generic' || configType === 'hybrid') {
      const mods = [
        ['homepage', 'Homepage', 10],
        ['about', 'About', 20],
        ['services', 'Services', 30],
        ['contact', 'Contact', 40],
      ] as const;
      await supabase.from('cms_modules').insert(
        mods.map(([code, module_name, sort_order]) => ({
          cms_instance_id: created.id,
          client_id: created.client_id,
          module_code: code,
          module_name,
          sort_order,
          hosted_in: 'platform_content',
        })),
      );
    }
    setMessage('CMS system created.');
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

  async function gatewayHealth(id: string) {
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.functions.invoke('cms-integration-gateway', {
      body: { action: 'health', instance_id: id, idempotency_key: `health-${id}-${Date.now()}` },
    });
    if (err) setError(err.message);
    else {
      const r = data as { ok?: boolean; correlation_id?: string; error?: string; upstream?: unknown };
      setMessage(
        r.ok
          ? `Gateway health OK · ${r.correlation_id ?? ''}`
          : `Gateway: ${r.error ?? 'failed'} · ${r.correlation_id ?? ''}`,
      );
      await load();
    }
  }

  if (!canManage) {
    return <div className="center">clients.manage required to open CMS Management.</div>;
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>CMS Management</h1>
          <p>Register CMS systems, monitor approvals and manage connection settings.</p>
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
              setTypeFilter('all');
              document.getElementById('cms-registry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <h2>{summary.instances}</h2>
            <p>CMS systems</p>
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
              setReviewStatus('awaiting_client_approval');
              document.getElementById('cms-pending-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <h2>{summary.pending_client_approvals}</h2>
            <p>Client approvals</p>
          </button>
          <button
            type="button"
            className="stat-card"
            onClick={() => {
              setReviewStatus('approved_for_publish');
              document.getElementById('cms-pending-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <h2>{summary.ready_to_publish ?? 0}</h2>
            <p>Ready to publish</p>
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
        <form className="panel form-compact cms-mgmt-create" onSubmit={(e) => void onCreate(e)}>
          <h2 style={{ marginTop: 0 }}>Create CMS system</h2>
          <p className="muted-sm">Compact registration for Generic, Custom or Hybrid CMS.</p>
          <div className="row-2">
            <label>
              Display name
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              Configuration
              <select
                value={configType}
                onChange={(e) => setConfigType(e.target.value as typeof configType)}
              >
                <option value="generic">Generic — standard modules</option>
                <option value="custom">Custom — client-specific</option>
                <option value="hybrid">Hybrid — platform + custom</option>
              </select>
            </label>
          </div>
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
                <option value="">Select…</option>
                {clients.map((c) => (
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
          <button type="submit">Create CMS</button>
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
        <input placeholder="Search CMS or client…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          <option value="generic">Generic</option>
          <option value="custom">Custom</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="retired">Retired</option>
        </select>
      </div>

      <div className="panel" id="cms-registry" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>CMS registry</h2>
        <table>
          <thead>
            <tr>
              <th>CMS</th>
              <th>Type</th>
              <th>Connection</th>
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
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{r.display_name}</strong>
                    {isDev ? <span className="dev-badge">Dev</span> : null}
                    <div className="muted-sm">{client?.legal_name ?? r.client_id}</div>
                  </td>
                  <td className="muted-sm">{r.cms_config_type}</td>
                  <td>
                    <span className={`status-chip ${cmsConnectionStatusTone(connStatus)}`}>
                      {labelCmsConnectionStatus(connStatus)}
                    </span>
                  </td>
                  <td>{r.status}</td>
                  <td className="cms-actions-cell">
                    <Link to={`/my-cms/${r.id}`}>Open</Link>
                    <button type="button" className="secondary" onClick={() => void testConnection(r.id)}>
                      Test
                    </button>
                    <select
                      aria-label="Configure adapter"
                      defaultValue=""
                      onChange={(e) => {
                        const v = e.target.value as CmsAdapterCode;
                        if (!v) return;
                        void configureAdapter(r.id, v);
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
                      onClick={() => void sandboxPublishProbe(r.id)}
                    >
                      Sandbox
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
                <td colSpan={5}>No CMS systems match.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <details className="advanced-details" id="cms-connection-settings">
        <summary>Owner connection settings &amp; diagnostics</summary>
        <p className="muted-sm">
          Credentials are stored in the private vault via RPC — never in browser storage. Treasure House
          shadow CMS stays standalone and must not be linked to the live church website.
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
            placeholder="Client CMS base URL"
            aria-label="Base URL"
          />
          <select
            value={gatewayInstanceId}
            onChange={(e) => setGatewayInstanceId(e.target.value)}
            aria-label="CMS instance"
          >
            <option value="">Select CMS instance…</option>
            {rows.map((r) => (
              <option key={r.id} value={r.id}>
                {r.display_name}
              </option>
            ))}
          </select>
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
            disabled={!gatewayInstanceId}
            onClick={() => void gatewayHealth(gatewayInstanceId)}
          >
            Gateway health
          </button>
        </div>
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
