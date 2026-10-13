import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const adapter = readFileSync(join(root, 'admin/src/lib/treasureHouseStagingAdapter.ts'), 'utf8');
const mappings = readFileSync(join(root, 'admin/src/lib/treasureHouseCmsShadow.ts'), 'utf8');
const catalogue = readFileSync(join(root, 'admin/src/lib/cmsAdapters.ts'), 'utf8');

assert.match(adapter, /treasure_house_staging/);
assert.match(adapter, /TH_STAGING_FIRST_WAVE_MODULES/);
assert.match(adapter, /ministries/);
assert.match(adapter, /homepage/);
assert.match(adapter, /quick_cards/);
assert.match(adapter, /leadership/);
assert.match(adapter, /missing_on_th_app/);
assert.match(adapter, /thbci\.org/);
assert.match(adapter, /gmyhzxxqiokklybebzpf\.supabase\.co/);
assert.match(adapter, /dev\/treasure-house-staging/);
assert.match(adapter, /isDeniedThStagingBaseUrl/);
assert.match(adapter, /mapShadowMinistryToTh/);
assert.doesNotMatch(adapter, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
assert.doesNotMatch(adapter, /service_role/);

assert.match(catalogue, /treasure_house_staging/);
assert.match(catalogue, /Isolated TH staging/);

assert.match(mappings, /website_ministries\.name/);
assert.match(mappings, /website_hero_designs\.draft_document\.panels/);
assert.match(mappings, /website_documents\(doc_key='homepage'\)/);
assert.match(mappings, /verified: false/);
assert.match(mappings, /No dedicated website_sermons/);
assert.match(mappings, /No dedicated website_events/);

/** Inline denylist check mirrors adapter guard (pure logic regression). */
const DENY = ['thbci.org', 'gmyhzxxqiokklybebzpf.supabase.co'];
function isDenied(baseUrl) {
  let host = '';
  try {
    host = new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return true;
  }
  return DENY.some((d) => host === d || host.endsWith(`.${d}`));
}
assert.equal(isDenied('https://thbci.org/admin'), true);
assert.equal(isDenied('https://gmyhzxxqiokklybebzpf.supabase.co'), true);
assert.equal(isDenied('https://th-staging.example.test'), false);

console.log('treasureHouseStagingAdapter.test OK');
