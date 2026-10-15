import assert from 'node:assert/strict';
import { isOpsWatchMarketingCms } from './okanggroupProducts.ts';

assert.equal(isOpsWatchMarketingCms({ adapterCode: 'opswatch_marketing' }), true);
assert.equal(isOpsWatchMarketingCms({ productCode: 'opswatch' }), true);
assert.equal(isOpsWatchMarketingCms({ slug: 'opswatch' }), true);
assert.equal(isOpsWatchMarketingCms({ displayName: 'OpsWatch Marketing' }), true);
assert.equal(isOpsWatchMarketingCms({ adapterCode: 'okang_native', slug: 'client-a' }), false);
assert.equal(isOpsWatchMarketingCms({ displayName: 'Other Watch' }), false);
console.log('okanggroupProducts.test.mjs OK');
