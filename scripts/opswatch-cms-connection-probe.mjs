/**
 * Probe OpsWatch marketing CMS endpoints used by OkangGroup cms-integration-gateway.
 * Does not mark the Website Registry Connected (that requires gateway health with Owner auth).
 *
 * Usage:
 *   node scripts/opswatch-cms-connection-probe.mjs
 *   node scripts/opswatch-cms-connection-probe.mjs https://example.trycloudflare.com/api/cms
 *   OPSWATCH_CMS_API_KEY=… node scripts/opswatch-cms-connection-probe.mjs
 */
const base = (process.argv[2] || process.env.OPSWATCH_CMS_BASE_URL || 'http://127.0.0.1:4000/api/cms')
  .replace(/\/$/, '');
const apiKey =
  (process.env.OPSWATCH_CMS_API_KEY || '').trim() ||
  'opswatch-cms-dev-key-not-for-production';

async function probe(path, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(`${base}${path}`, { headers });
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { ok: res.ok, status: res.status, ms: Date.now() - started, body };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      body: { error: e instanceof Error ? e.message : String(e) },
    };
  }
}

const health = await probe('/health');
const capsMissing = await probe('/v1/capabilities');
const caps = await probe('/v1/capabilities', { 'X-Api-Key': apiKey });

const lines = [
  `base_url=${base}`,
  `GET /health → ${health.status} (${health.ms}ms) ok=${health.ok}`,
  `GET /v1/capabilities (no key) → ${capsMissing.status} (expect 401)`,
  `GET /v1/capabilities (key) → ${caps.status} (${caps.ms}ms) ok=${caps.ok}`,
];
console.log(lines.join('\n'));

const pass =
  health.ok &&
  (health.body?.adapter === 'opswatch_marketing' || health.body?.service === 'opswatch-cms-content') &&
  capsMissing.status === 401 &&
  caps.ok &&
  caps.body?.capabilities?.monitoring_operations === false;

if (!pass) {
  console.error('FAIL: OpsWatch CMS probe did not meet gateway expectations');
  process.exit(1);
}
console.log('PASS: OpsWatch CMS endpoints ready for OkangGroup gateway health');
process.exit(0);
