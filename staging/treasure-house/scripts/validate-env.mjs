import { assertStagingEnvironment, isDeniedHost } from '../lib/guards.mjs';

try {
  assertStagingEnvironment(process.env);
  console.log('th-staging validate-env OK — no production / shared-live hosts in staging env');
  if (process.env.TH_STAGING_SUPABASE_URL) {
    console.log('TH_STAGING_SUPABASE_URL host accepted (not on denylist)');
  } else {
    console.log('TH_STAGING_SUPABASE_URL unset — in-memory bridge mode (allowed until Owner project exists)');
  }
  process.exit(0);
} catch (e) {
  console.error(String(e?.message || e));
  // Demonstrate denylist for operators
  if (isDeniedHost('https://gmyhzxxqiokklybebzpf.supabase.co')) {
    console.error('Hint: live TH Supabase project ref is denied.');
  }
  process.exit(1);
}
