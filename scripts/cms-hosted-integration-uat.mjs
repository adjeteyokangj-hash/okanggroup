/**
 * Invokes the hosted cms-hosted-integration-uat Edge runner.
 * Requires VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (admin/.env) and the
 * non-production X-Api-Key. Does not contact live client applications.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const envPath = path.join(ROOT, 'admin', '.env');

function loadEnv() {
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv();
const base = (env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const anon = env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const apiKey =
  process.env.DEV_CLIENT_CMS_API_KEY || 'okang-dev-client-cms-key-not-for-production';

if (!base || !anon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in admin/.env');
  process.exit(1);
}

const res = await fetch(`${base}/functions/v1/cms-hosted-integration-uat`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    'X-Api-Key': apiKey,
  },
  body: '{}',
});

const text = await res.text();
const outFile = path.join(ROOT, 'supabase', '.temp', 'hosted_uat_result.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, text);

let json;
try {
  json = JSON.parse(text);
} catch {
  console.error('Non-JSON response', res.status, text.slice(0, 500));
  process.exit(1);
}

console.log('HTTP', res.status);
console.log('verdict', json.verdict);
if (json.error) console.log('error', json.error);
console.log('evidence written to', outFile);

if (json.verdict !== 'PASS' || !res.ok) process.exit(1);
console.log('cms-hosted-integration-uat OK');
