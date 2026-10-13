/**
 * End-to-end: dedicated NON-PRODUCTION client CMS stub + vault semantics + approval gate.
 * Does not contact live client applications.
 *
 * Run: node scripts/cms-real-integration-e2e.mjs
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8791;
const API_KEY = 'okang-dev-client-cms-key-not-for-production';
const BASE = `http://127.0.0.1:${PORT}`;

async function call(pathname, method = 'GET', body) {
  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': API_KEY,
      'X-Correlation-Id': crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, ok: res.ok, json };
}

function startStub() {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: path.join(ROOT, 'dev-client-cms'),
    env: { ...process.env, PORT: String(PORT), DEV_CLIENT_CMS_API_KEY: API_KEY },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return child;
}

async function waitHealthy(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error('dev-client-cms failed to become healthy');
}

const stub = startStub();
try {
  await waitHealthy();

  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  assert.equal(health.ok, true);
  assert.equal(health.live_client, false);

  const unauth = await fetch(`${BASE}/v1/capabilities`);
  assert.equal(unauth.status, 401);

  const caps = await call('/v1/capabilities');
  assert.equal(caps.ok, true);
  assert.equal(caps.json.capabilities.publish, true);
  assert.ok(caps.json.modules.includes('announcements'));

  const put = await call('/v1/modules/announcements/content', 'PUT', {
    title: 'E2E Announcement',
    body: 'From OkangGroup integration test',
  });
  assert.equal(put.ok, true);
  assert.equal(put.json.draft.title, 'E2E Announcement');

  const get = await call('/v1/modules/announcements/content');
  assert.equal(get.json.draft.body, 'From OkangGroup integration test');

  const pub = await call('/v1/modules/announcements/publish', 'POST', {});
  assert.equal(pub.ok, true);
  assert.equal(pub.json.published.title, 'E2E Announcement');
  const rev = pub.json.revision_no;
  assert.ok(rev >= 1);

  await call('/v1/modules/announcements/content', 'PUT', {
    title: 'Changed',
    body: 'Should rollback',
  });
  const rb = await call('/v1/modules/announcements/rollback', 'POST', { revision_no: rev });
  assert.equal(rb.ok, true);
  assert.equal(rb.json.draft.title, 'E2E Announcement');

  // Bad key isolation
  const bad = await fetch(`${BASE}/v1/capabilities`, {
    headers: { 'X-Api-Key': 'wrong-key' },
  });
  assert.equal(bad.status, 401);

  console.log('cms-real-integration-e2e OK (dev stub protocol)');
} finally {
  stub.kill('SIGTERM');
}
