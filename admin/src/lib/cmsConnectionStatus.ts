/** Derive CMS connection status from verified configuration evidence — not free labels. */

export type CmsConnectionStatus =
  | 'standalone'
  | 'configuration_required'
  | 'connected_development'
  | 'connected_production'
  | 'connection_failed';

export type CmsConnectionEvidence = {
  adapter_code?: string | null;
  status?: string | null;
  base_url?: string | null;
  integration_mode?: string | null;
  last_healthy_at?: string | null;
  last_error?: string | null;
  notes?: string | null;
  capability_json?: Record<string, unknown> | null;
};

const STANDALONE_ADAPTERS = new Set([
  'okang_native',
  'sandbox_mock',
  'manual_only',
  'treasure_house_shadow',
]);

export function deriveCmsConnectionStatus(conn: CmsConnectionEvidence | null | undefined): CmsConnectionStatus {
  if (!conn?.adapter_code) return 'configuration_required';
  if (conn.status === 'error') return 'connection_failed';
  if (conn.status === 'disabled' || conn.status === 'not_configured') {
    return conn.status === 'not_configured' ? 'configuration_required' : 'standalone';
  }

  const adapter = conn.adapter_code;
  const notes = (conn.notes ?? '').toLowerCase();
  const caps = conn.capability_json ?? {};
  const externalLive = caps.external_live === true;

  if (
    STANDALONE_ADAPTERS.has(adapter) ||
    adapter.includes('shadow') ||
    notes.includes('shadow') ||
    notes.includes('no live') ||
    caps.standalone === true ||
    caps.external_live === false
  ) {
    // Explicit production claim must never be inferred for shadow/native.
    if (!externalLive) return 'standalone';
  }

  if (!conn.base_url?.trim() && conn.integration_mode !== 'platform') {
    if (STANDALONE_ADAPTERS.has(adapter)) return 'standalone';
    return 'configuration_required';
  }

  if (conn.status === 'configured' && !conn.last_healthy_at && adapter !== 'okang_native') {
    if (adapter === 'okang_dev_client' || (conn.base_url && /dev|staging|localhost/i.test(conn.base_url))) {
      return 'connected_development';
    }
    return 'configuration_required';
  }

  if (externalLive === true && conn.status === 'healthy' && conn.last_healthy_at) {
    return 'connected_production';
  }

  if (
    adapter === 'okang_dev_client' ||
    (conn.base_url && /dev|staging|localhost|supabase\.co\/functions/i.test(conn.base_url)) ||
    conn.status === 'healthy' ||
    conn.status === 'configured'
  ) {
    return 'connected_development';
  }

  return 'configuration_required';
}

export function labelCmsConnectionStatus(status: CmsConnectionStatus): string {
  switch (status) {
    case 'standalone':
      return 'Standalone';
    case 'configuration_required':
      return 'Configuration required';
    case 'connected_development':
      return 'Connected — Development';
    case 'connected_production':
      return 'Connected — Production';
    case 'connection_failed':
      return 'Connection failed';
    default:
      return status;
  }
}

export function cmsConnectionStatusTone(status: CmsConnectionStatus): 'ok' | 'warn' | 'muted' | 'danger' {
  switch (status) {
    case 'connected_production':
    case 'connected_development':
      return 'ok';
    case 'configuration_required':
      return 'warn';
    case 'connection_failed':
      return 'danger';
    default:
      return 'muted';
  }
}
