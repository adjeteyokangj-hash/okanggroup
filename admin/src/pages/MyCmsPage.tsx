import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  cmsConnectionStatusTone,
  deriveCmsConnectionStatus,
  labelCmsConnectionStatus,
  type CmsConnectionEvidence,
} from '../lib/cmsConnectionStatus';
import { looksLikeDevRecord } from '../lib/devRecords';

type CmsInst = {
  id: string;
  display_name: string;
  slug: string;
  status: string;
  cms_config_type: string;
  cms_kind: string;
  external_admin_url: string | null;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

type Conn = CmsConnectionEvidence & { cms_instance_id: string };

type Row = {
  id: string;
  can_view: boolean;
  can_edit: boolean;
  can_submit: boolean;
  can_publish: boolean;
  cms_instances: CmsInst | CmsInst[] | null;
};

export function MyCmsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [connections, setConnections] = useState<Record<string, Conn>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('cms_instance_grants')
        .select(
          'id, can_view, can_edit, can_submit, can_publish, cms_instances(id, display_name, slug, status, cms_config_type, cms_kind, external_admin_url, clients(legal_name))',
        )
        .eq('profile_id', user.id)
        .is('revoked_at', null);
      if (err) {
        setError(err.message);
        return;
      }
      const list = (data as unknown as Row[]) ?? [];
      setRows(list);
      const ids = list
        .map((r) => {
          const cms = Array.isArray(r.cms_instances) ? r.cms_instances[0] : r.cms_instances;
          return cms?.id;
        })
        .filter(Boolean) as string[];
      if (ids.length) {
        const { data: conns } = await supabase
          .from('cms_connections')
          .select(
            'cms_instance_id, adapter_code, status, base_url, integration_mode, last_healthy_at, last_error, notes, capability_json',
          )
          .in('cms_instance_id', ids);
        const map: Record<string, Conn> = {};
        for (const c of (conns as Conn[]) ?? []) map[c.cms_instance_id] = c;
        setConnections(map);
      }
    })();
  }, [user?.id]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>My Client CMS</h1>
          <p>Open the CMS systems assigned to you. Connection status reflects verified configuration.</p>
        </div>
        <div className="page-head-actions">
          <Link to="/cms-systems">
            <button type="button" className="secondary">
              CMS Systems
            </button>
          </Link>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Client CMS</th>
              <th>Type</th>
              <th>Connection</th>
              <th>Your access</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cmsRaw = r.cms_instances;
              const cms = Array.isArray(cmsRaw) ? cmsRaw[0] : cmsRaw;
              if (!cms) return null;
              const client = Array.isArray(cms.clients) ? cms.clients[0] : cms.clients;
              const conn = connections[cms.id];
              const connStatus = deriveCmsConnectionStatus(conn);
              const isDev = looksLikeDevRecord(cms.display_name, client?.legal_name, cms.slug);
              const showExternal =
                Boolean(cms.external_admin_url) &&
                (connStatus === 'connected_development' || connStatus === 'connected_production');
              return (
                <tr key={r.id}>
                  <td>
                    <strong>{cms.display_name}</strong>
                    {isDev ? <span className="dev-badge">Dev</span> : null}
                    <div className="muted-sm">{client?.legal_name ?? 'Client'}</div>
                  </td>
                  <td className="muted-sm">
                    {cms.cms_config_type}
                    <div>{cms.cms_kind}</div>
                  </td>
                  <td>
                    <span className={`status-chip ${cmsConnectionStatusTone(connStatus)}`}>
                      {labelCmsConnectionStatus(connStatus)}
                    </span>
                    {connStatus === 'standalone' ? (
                      <div className="muted-sm">Works inside OkangGroup — no live website linked</div>
                    ) : null}
                  </td>
                  <td className="muted-sm">
                    {[
                      r.can_view ? 'view' : null,
                      r.can_edit ? 'edit' : null,
                      r.can_submit ? 'submit' : null,
                      r.can_publish ? 'publish permission' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'none'}
                    {r.can_publish && connStatus === 'standalone' ? (
                      <div className="muted-sm">Publish permission ≠ external site connected</div>
                    ) : null}
                  </td>
                  <td className="actions">
                    <Link to={`/my-cms/${cms.id}`}>
                      <button type="button">Open workspace</button>
                    </Link>
                    {showExternal ? (
                      <a href={cms.external_admin_url!} target="_blank" rel="noreferrer">
                        External admin
                      </a>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5}>No client CMS access assigned.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
