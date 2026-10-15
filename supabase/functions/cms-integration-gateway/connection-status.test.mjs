import assert from 'node:assert/strict';
import { cmsConnectionPatchForThrownUpstream } from './connection-status.ts';

const patch = cmsConnectionPatchForThrownUpstream(
  'getaddrinfo ENOTFOUND wearing-exclusion-award-city.trycloudflare.com',
  'corr-1',
);

assert.equal(patch.status, 'error');
assert.match(patch.last_error, /ENOTFOUND/);
assert.equal(patch.last_test_json.ok, false);
assert.equal(patch.last_test_json.correlation_id, 'corr-1');
assert.equal(patch.last_error.length <= 500, true);
console.log('connection-status.test.mjs OK');
