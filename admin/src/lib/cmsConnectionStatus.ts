/** Derive CMS connection status from verified configuration + gateway health evidence — not free labels. */

export type CmsConnectionStatus =
  | 'standalone'
  | 'configuration_required'
  | 'connected_development'
  | 'temporary_tunnel'
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

const GATEWAY_EXTERNAL_ADAPTERS = new Set([
  'opswatch_marketing',
  'okang_dev_client',
  'treasure_house_staging',
  'wordpress_rest',
  'custom_webhook',
]);

function isDevUrl(url: string | null | undefined): boolean {
  return Boolean(
    url && /dev|staging|localhost|127\.0\.0\.1|trycloudflare\.com|supabase\.co\/functions/i.test(url),
  );
}

/** Quick tunnels expire when the process stops and must not be treated as a production API. */
export function isEphemeralCmsEndpoint(url: string | null | undefined): boolean {
  return Boolean(url && /trycloudflare\.com/i.test(url));
}

/** HTTPS /api/cms host that is neither local nor a temporary tunnel. */
export function isProductionCmsBaseUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:') return false;
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
      return false;
    }
    if (host === 'trycloudflare.com' || host.endsWith('.trycloudflare.com')) return false;
    return parsed.pathname.replace(/\/$/, '').endsWith('/api/cms');
  } catch {
    return false;
  }
}

export function isDevelopmentCmsCredentialRef(ref: string | null | undefined): boolean {
  const value = ref?.trim().toLowerCase() ?? '';
  return value.length === 0 || value.startsWith('dev/');
}

/** Turn gateway/network failures into an owner-facing status. Does not change credentials. */
export function explainCmsConnectionError(message: string): string {
  if (/name or service not known|enotfound|getaddrinfo|failed to lookup|non-existent domain/i.test(message)) {
    return 'The OpsWatch CMS hostname does not resolve. The saved Cloudflare tunnel address is no longer valid. Update the endpoint, then use Reconnect. API credentials were not changed.';
  }
  return message;
}

/**
 * Connection Status for Managed Websites.
 * External/gateway adapters require a successful health probe (`status=healthy` + `last_healthy_at`).
 * Configured-without-health is never shown as Connected.
 */
export function deriveCmsConnectionStatus(conn: CmsConnectionEvidence | null | undefined): CmsConnectionStatus {
  if (!conn?.adapter_code) return 'configuration_required';
  if (conn.status === 'error') return 'connection_failed';
  if (conn.status === 'disabled') return 'standalone';
  if (conn.status === 'not_configured') return 'configuration_required';

  const adapter = conn.adapter_code;
  const notes = (conn.notes ?? '').toLowerCase();
  const caps = conn.capability_json ?? {};
  const externalLive = caps.external_live === true;
  const gatewayExternal =
    GATEWAY_EXTERNAL_ADAPTERS.has(adapter) ||
    conn.integration_mode === 'external' ||
    externalLive === true;

  if (
    STANDALONE_ADAPTERS.has(adapter) ||
    adapter.includes('shadow') ||
    notes.includes('shadow') ||
    caps.standalone === true ||
    (caps.external_live === false && !gatewayExternal)
  ) {
    if (!externalLive && !gatewayExternal) return 'standalone';
  }

  if (gatewayExternal) {
    if (!conn.base_url?.trim()) return 'configuration_required';
    if (conn.status === 'error' || conn.last_error) {
      if (conn.status === 'error') return 'connection_failed';
    }
    // Must have gateway health evidence — never treat "configured" alone as Connected.
    if (conn.status === 'healthy' && conn.last_healthy_at) {
      if (isEphemeralCmsEndpoint(conn.base_url)) return 'temporary_tunnel';
      return isDevUrl(conn.base_url) ? 'connected_development' : 'connected_production';
    }
    return 'configuration_required';
  }

  if (!conn.base_url?.trim() && conn.integration_mode !== 'platform') {
    if (STANDALONE_ADAPTERS.has(adapter)) return 'standalone';
    return 'configuration_required';
  }

  if (STANDALONE_ADAPTERS.has(adapter) || conn.integration_mode === 'platform') {
    return 'standalone';
  }

  if (conn.status === 'healthy' && conn.last_healthy_at) {
    if (isEphemeralCmsEndpoint(conn.base_url)) return 'temporary_tunnel';
    return isDevUrl(conn.base_url) ? 'connected_development' : 'connected_production';
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
    case 'temporary_tunnel':
      return 'Temporary tunnel';
    case 'connected_production':
      return 'Connected — Production';
    case 'connection_failed':
      return 'Connection failed';
    default:
      return status;
  }
}

/** Short registry label — Connected only when gateway health evidence exists. */
export function shortCmsConnectionStatus(status: CmsConnectionStatus): string {
  switch (status) {
    case 'connected_development':
    case 'connected_production':
      return 'Connected';
    case 'temporary_tunnel':
      return 'Temporary tunnel';
    case 'configuration_required':
      return 'Not connected';
    case 'connection_failed':
      return 'Connection failed';
    case 'standalone':
      return 'Standalone';
    default:
      return status;
  }
}

export function cmsConnectionStatusTone(status: CmsConnectionStatus): 'ok' | 'warn' | 'muted' | 'danger' {
  switch (status) {
    case 'connected_production':
    case 'connected_development':
      return 'ok';
    case 'temporary_tunnel':
      return 'warn';
    case 'configuration_required':
      return 'warn';
    case 'connection_failed':
      return 'danger';
    default:
      return 'muted';
  }
}
