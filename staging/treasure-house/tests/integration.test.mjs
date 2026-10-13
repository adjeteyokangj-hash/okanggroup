/**
 * Automated staging bridge tests using shadow CMS field shapes.
 * Does not connect OkangGroup → live Treasure House.
 * Run: npm test (from staging/treasure-house)
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import {
  assertStagingEnvironment,
  isDeniedHost,
  isThStagingCredentialRef,
  TH_STAGING_FIRST_WAVE_MODULES,
} from '../lib/guards.mjs';
import { createStagingStore } from '../lib/store.mjs';
import { mapShadowMinistryToTh, mapShadowLeadershipToTh } from '../lib/mappers.mjs';
import { createThStagingServer } from '../server.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const shadowLib = readFileSync(
  join(root, 'admin/src/lib/treasureHouseCmsShadow.ts'),
  'utf8',
);
const adapterLib = readFileSync(
  join(root, 'admin/src/lib/treasureHouseStagingAdapter.ts'),
  'utf8',
);

// --- Guards ---
assert.equal(isDeniedHost('https://gmyhzxxqiokklybebzpf.supabase.co'), true);
assert.equal(isDeniedHost('https://thbci.org'), true);
assert.equal(isDeniedHost('https://th-staging.example.test'), false);
assert.throws(() =>
  assertStagingEnvironment({
    TH_STAGING_ENVIRONMENT: 'staging',
    TH_STAGING_SUPABASE_URL: 'https://gmyhzxxqiokklybebzpf.supabase.co',
  }),
);
assert.doesNotThrow(() =>
  assertStagingEnvironment({
    TH_STAGING_ENVIRONMENT: 'staging',
    TH_STAGING_SUPABASE_URL: 'https://abcdxyzstaging.supabase.co',
  }),
);
assert.throws(() => assertStagingEnvironment({ TH_STAGING_ENVIRONMENT: 'production' }));
assert.equal(isThStagingCredentialRef('dev/treasure-house-staging'), true);
assert.equal(isThStagingCredentialRef('prod/treasure-house'), false);

// --- Shadow mappings still present ---
assert.match(shadowLib, /TH_FIELD_MAPPINGS/);
assert.match(shadowLib, /website_ministries\.slug/);
assert.match(adapterLib, /treasure_house_staging/);
assert.match(adapterLib, /TH_STAGING_FIRST_WAVE_MODULES/);

// --- Store + mappers (shadow-shaped writes) ---
const store = createStagingStore();
assert.deepEqual(store.firstWave(), [...TH_STAGING_FIRST_WAVE_MODULES]);

const ministryPayload = mapShadowMinistryToTh({
  slug: 'outreach-staging',
  name: 'Outreach (Staging)',
  summary: 'Synthetic',
  body: 'Synthetic body',
  image_url: 'asset:b1111111-1111-4111-8111-111111111101',
  sort_order: 40,
});
assert.equal(ministryPayload.featured_asset_id, 'b1111111-1111-4111-8111-111111111101');
store.put('ministries', ministryPayload);
assert.equal(store.get('ministries').draft.items[0].slug, 'outreach-staging');

const leaderPayload = mapShadowLeadershipToTh({
  slug: 'elder-staging',
  display_name: 'Elder Staging',
  role_title: 'Elder (Synthetic)',
  draft_status: 'ready',
});
store.put('leadership', leaderPayload);
assert.equal(store.get('leadership').draft.items[0].display_name, 'Elder Staging');

store.put('homepage', { welcome_long: 'Updated synthetic welcome', intro_heading: 'Hello' });
assert.match(store.get('homepage').draft.welcome_long, /Updated synthetic/);

const published = store.publish('ministries', 'corr-test-1');
assert.ok(published.published);
assert.equal(published.revisions.length, 1);
store.put('ministries', {
  slug: 'changed',
  name: 'Changed',
  summary: 'x',
  body: 'y',
});
const rolled = store.rollback('ministries', 1);
assert.equal(rolled.mod.published.items[0].slug, 'outreach-staging');

// --- HTTP bridge (local ephemeral port) ---
const server = createThStagingServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const key = process.env.TH_STAGING_API_KEY || 'okang-th-staging-key-not-for-production';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'x-correlation-id': 'uat-th-staging-1',
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const health = await request('GET', '/health');
// health is unauthenticated — our helper still sends key; ok either way
assert.equal(health.status, 200);
assert.equal(health.body.live_client, false);
assert.equal(health.body.production, false);

const caps = await request('GET', '/v1/capabilities');
assert.equal(caps.status, 200);
assert.equal(caps.body.adapter, 'treasure_house_staging');
for (const code of TH_STAGING_FIRST_WAVE_MODULES) {
  assert.ok(caps.body.modules.includes(code), `missing module ${code}`);
}

const putHome = await request('PUT', '/v1/modules/homepage/content', {
  welcome_long: 'Bridge test welcome',
  intro_heading: 'Bridge',
});
assert.equal(putHome.status, 200);
assert.match(putHome.body.draft.welcome_long, /Bridge test/);

const pub = await request('POST', '/v1/modules/homepage/publish', {});
assert.equal(pub.status, 200);
assert.equal(pub.body.revision_no, 1);

const getHome = await request('GET', '/v1/modules/homepage/content');
assert.equal(getHome.body.published.welcome_long, 'Bridge test welcome');

const rb = await request('POST', '/v1/modules/homepage/rollback', { revision_no: 1 });
assert.equal(rb.status, 200);
assert.equal(rb.body.restored_revision, 1);

await new Promise((resolve) => server.close(resolve));

// --- SQL package present ---
const schema = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../sql/001_website_cms_schema.sql'), 'utf8');
const seed = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../sql/002_synthetic_seed.sql'), 'utf8');
assert.match(schema, /website_ministries/);
assert.match(schema, /th_staging_meta/);
assert.match(schema, /DO NOT run against gmyhzxxqiokklybebzpf/);
assert.match(seed, /Synthetic/);
assert.doesNotMatch(seed, /prayer_request/i);
assert.doesNotMatch(seed, /CREATE TABLE.*membership/i);

console.log('th-staging integration.test OK');
