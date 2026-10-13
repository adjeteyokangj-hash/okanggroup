import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const migration = readFileSync(
  join(root, 'supabase/migrations/20261012165352_m42_treasure_house_cms_shadow.sql'),
  'utf8',
);
const lib = readFileSync(join(root, 'admin/src/lib/treasureHouseCmsShadow.ts'), 'utf8');

assert.match(migration, /treasure-house-shadow/);
assert.match(migration, /ministries/);
assert.match(migration, /sermons/);
assert.match(migration, /Membership \(EXCLUDED\)/);
assert.match(migration, /external_live":false/);
assert.match(migration, /Synthetic/);
assert.match(lib, /TH_SHADOW_NAV/);
assert.match(lib, /TH_FIELD_MAPPINGS/);
assert.match(lib, /Dashboard/);
assert.match(lib, /HERO Manager/);

console.log('treasureHouseCmsShadow.test OK');
