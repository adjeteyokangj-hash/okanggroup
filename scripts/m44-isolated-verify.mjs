/**
 * Apply M44 on an isolated Postgres container, run regression, tear down.
 * Does NOT touch hosted OkangGroup Supabase.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const container = 'okanggroup-m44-verify';
const port = '55432';
const backupDir = path.join(root, 'supabase', '.temp', 'm44-verify-backup');
const dbUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with ${r.status}`);
  }
  return r;
}

function psqlFile(file) {
  run('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    '-',
  ], { input: fs.readFileSync(file, 'utf8') });
}

function psql(sql) {
  run('docker', [
    'exec',
    '-i',
    container,
    'psql',
    '-U',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ], { input: sql });
}

function cleanup() {
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8', shell: true });
}

try {
  cleanup();
  fs.mkdirSync(backupDir, { recursive: true });

  console.log('Starting isolated Postgres…');
  run('docker', [
    'run',
    '-d',
    '--name',
    container,
    '-e',
    'POSTGRES_PASSWORD=postgres',
    '-p',
    `${port}:5432`,
    'postgres:15-alpine',
  ]);

  // Wait for ready
  let ready = false;
  for (let i = 0; i < 40; i++) {
    const r = spawnSync(
      'docker',
      ['exec', container, 'pg_isready', '-U', 'postgres'],
      { encoding: 'utf8', shell: true },
    );
    if (r.status === 0) {
      ready = true;
      break;
    }
    spawnSync(process.platform === 'win32' ? 'timeout' : 'sleep', process.platform === 'win32' ? ['/t', '1', '/nobreak'] : ['1'], {
      shell: true,
      stdio: 'ignore',
    });
  }
  if (!ready) throw new Error('Postgres did not become ready');

  const harness = path.join(root, 'supabase', 'tests', 'm44_isolated_harness.sql');
  const migration = path.join(
    root,
    'supabase',
    'migrations',
    '20261013170000_m44_managed_website_products.sql',
  );
  const regression = path.join(
    root,
    'supabase',
    'tests',
    'm44_managed_website_products_regression.sql',
  );

  console.log('Loading harness…');
  psqlFile(harness);

  // Snapshot before m44
  const beforeDump = path.join(backupDir, 'before-m44.sql');
  const dump = spawnSync(
    'docker',
    ['exec', container, 'pg_dump', '-U', 'postgres', '--schema-only'],
    { encoding: 'utf8', shell: true },
  );
  if (dump.status !== 0) throw new Error('pg_dump before failed');
  fs.writeFileSync(beforeDump, dump.stdout);
  console.log(`Backup written: ${beforeDump}`);

  // Pre-m44 counts
  psql(`
    SELECT 'before_clients' AS k, count(*)::text AS v FROM public.clients
    UNION ALL
    SELECT 'before_cms', count(*)::text FROM public.cms_instances;
  `);

  console.log('Applying m44…');
  psqlFile(migration);

  // Snapshot after m44 schema
  const afterDump = path.join(backupDir, 'after-m44-schema.sql');
  const dump2 = spawnSync(
    'docker',
    ['exec', container, 'pg_dump', '-U', 'postgres', '--schema-only'],
    { encoding: 'utf8', shell: true },
  );
  if (dump2.status !== 0) throw new Error('pg_dump after failed');
  fs.writeFileSync(afterDump, dump2.stdout);

  // Confirm existing rows unchanged classification defaults
  psql(`
    DO $$
    DECLARE
      v_kind text;
      v_rk text;
    BEGIN
      SELECT ownership_kind INTO v_kind FROM public.cms_instances
      WHERE id = 'c8a1b2d3-e4f5-4678-9abc-111111111102';
      IF v_kind IS DISTINCT FROM 'client_website' THEN
        RAISE EXCEPTION 'Treasure House ownership default wrong: %', v_kind;
      END IF;
      SELECT record_kind INTO v_rk FROM public.clients
      WHERE id = 'c8a1b2d3-e4f5-4678-9abc-111111111101';
      IF v_rk IS DISTINCT FROM 'customer' THEN
        RAISE EXCEPTION 'Treasure House client record_kind wrong: %', v_rk;
      END IF;
      RAISE NOTICE 'Existing client CMS unchanged after m44 defaults';
    END $$;
  `);

  console.log('Running regression…');
  // Enable owner permission for JWT sub used in regression
  psql(`SELECT set_config('test.grant_clients_manage', '1', false);`);
  // Regression sets JWT per block; reinstate grant flag inside session via wrapper
  const regressionSql = fs.readFileSync(regression, 'utf8');
  psql(`
    SELECT set_config('test.grant_clients_manage', '1', false);
    ${regressionSql}
  `);

  // Extra static checks
  psql(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM public.cms_instances WHERE product_code = 'opswatch' AND ownership_kind = 'okanggroup_product'
      ) THEN
        RAISE EXCEPTION 'OpsWatch product row missing after regression';
      END IF;
      IF (SELECT count(*) FROM public.cms_instances WHERE product_code = 'opswatch') <> 1 THEN
        RAISE EXCEPTION 'OpsWatch duplicate present';
      END IF;
      IF (SELECT record_kind FROM public.clients WHERE client_code = 'OKANGGROUP') IS DISTINCT FROM 'house' THEN
        RAISE EXCEPTION 'OkangGroup house record missing';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.clients
        WHERE record_kind = 'house' AND client_code <> 'OKANGGROUP'
      ) THEN
        RAISE EXCEPTION 'Unexpected non-OKANGGROUP house client';
      END IF;
      RAISE NOTICE 'M44 isolated verification PASSED';
    END $$;
  `);

  console.log('OK: m44 isolated verification passed');
  console.log(`DB URL (torn down next): ${dbUrl}`);
} finally {
  cleanup();
  console.log('Isolated container removed.');
}
