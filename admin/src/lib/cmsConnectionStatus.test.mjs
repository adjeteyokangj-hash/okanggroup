import assert from 'node:assert/strict';
import { deriveCmsConnectionStatus, labelCmsConnectionStatus } from './cmsConnectionStatus.ts';

assert.equal(deriveCmsConnectionStatus(null), 'configuration_required');
assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'okang_native',
    status: 'configured',
    capability_json: { external_live: false },
  }),
  'standalone',
);
assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'treasure_house_shadow',
    status: 'configured',
    notes: 'shadow CMS — no live church website',
  }),
  'standalone',
);
assert.equal(
  deriveCmsConnectionStatus({
    adapter_code: 'okang_dev_client',
    status: 'configured',
    base_url: 'https://example.supabase.co/functions/v1/dev-client-cms',
    integration_mode: 'external',
  }),
  'connected_development',
);
assert.equal(
  deriveCmsConnectionStatus({ adapter_code: 'wordpress_rest', status: 'error' }),
  'connection_failed',
);
assert.equal(labelCmsConnectionStatus('standalone'), 'Standalone');

console.log('cmsConnectionStatus.test.mjs PASS');
