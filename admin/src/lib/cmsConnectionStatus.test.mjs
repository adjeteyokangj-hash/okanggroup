/**
 * Connection Status must reflect gateway health evidence, not a hardcoded "Connected".
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const modPath = path.join(here, 'cmsConnectionStatus.ts');

const {
  deriveCmsConnectionStatus,
  shortCmsConnectionStatus,
  labelCmsConnectionStatus,
  isEphemeralCmsEndpoint,
  isProductionCmsBaseUrl,
  explainCmsConnectionError,
} = await import(pathToFileURL(modPath).href);

assert.equal(deriveCmsConnectionStatus(null), 'configuration_required');
assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'opswatch_marketing',
    status: 'configured',
    base_url: 'http://localhost:4000/api/cms',
    integration_mode: 'external',
    capability_json: { external_live: true },
  }),
  'configuration_required',
  'configured without health must not be Connected',
);

assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'opswatch_marketing',
    status: 'healthy',
    base_url: 'http://localhost:4000/api/cms',
    last_healthy_at: new Date().toISOString(),
    integration_mode: 'external',
    capability_json: { external_live: true },
  }),
  'connected_development',
);

assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'opswatch_marketing',
    status: 'healthy',
    base_url: 'https://example.trycloudflare.com/api/cms',
    last_healthy_at: new Date().toISOString(),
    integration_mode: 'external',
    capability_json: { external_live: true },
  }),
    'temporary_tunnel',
  'a healthy quick tunnel is not shown as Connected',
);

assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'opswatch_marketing',
    status: 'error',
    base_url: 'https://example.trycloudflare.com/api/cms',
    last_healthy_at: new Date().toISOString(),
    last_error: 'Name or service not known',
    integration_mode: 'external',
    capability_json: { external_live: true },
  }),
  'connection_failed',
);

assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'opswatch_marketing',
    status: 'healthy',
    base_url: 'https://opswatch.okanggroup.com/api/cms',
    last_healthy_at: new Date().toISOString(),
    integration_mode: 'external',
    capability_json: { external_live: true },
  }),
  'connected_production',
);

assert.equal(shortCmsConnectionStatus('connected_development'), 'Connected');
assert.equal(shortCmsConnectionStatus('temporary_tunnel'), 'Temporary tunnel');
assert.notEqual(shortCmsConnectionStatus('temporary_tunnel'), 'Connected');
assert.equal(shortCmsConnectionStatus('configuration_required'), 'Not connected');

assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'manual_only',
    status: 'configured',
    notes: 'Shadow CMS',
    capability_json: { external_live: false, shadow: true },
  }),
  'standalone',
);

assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'okang_native',
    status: 'configured',
    integration_mode: 'platform',
    capability_json: { external_live: false },
  }),
  'standalone',
);

assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'opswatch_marketing',
    status: 'error',
    base_url: 'http://localhost:4000/api/cms',
    last_error: 'upstream down',
    capability_json: { external_live: true },
  }),
  'connection_failed',
);

assert.match(labelCmsConnectionStatus('connected_production'), /Production/);
assert.equal(isEphemeralCmsEndpoint('https://example.trycloudflare.com/api/cms'), true);
assert.equal(isEphemeralCmsEndpoint('https://opswatch.okanggroup.com/api/cms'), false);
assert.equal(isProductionCmsBaseUrl('https://opswatch.okanggroup.com/api/cms'), true);
assert.equal(isProductionCmsBaseUrl('http://localhost:4000/api/cms'), false);
assert.equal(isProductionCmsBaseUrl('https://example.trycloudflare.com/api/cms'), false);
assert.match(explainCmsConnectionError('failed to lookup address information: Name or service not known'), /no longer valid/);
console.log('cmsConnectionStatus.test.mjs OK');
