/**
 * Treasure House STAGING CMS bridge — OkangGroup gateway protocol.
 *
 * NON-PRODUCTION. Refuses live TH hosts via guards.
 * Default: in-memory synthetic store (no Supabase required).
 * Do not deploy this into the live Treasure House application.
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { assertStagingEnvironment, TH_STAGING_FIRST_WAVE_MODULES } from './lib/guards.mjs';
import { createStagingStore } from './lib/store.mjs';

assertStagingEnvironment(process.env);

const PORT = Number(process.env.PORT || 8792);
const API_KEY = process.env.TH_STAGING_API_KEY || 'okang-th-staging-key-not-for-production';
const store = createStagingStore();

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, x-api-key, x-correlation-id',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function authorised(req) {
  const key = req.headers['x-api-key'];
  return typeof key === 'string' && key === API_KEY;
}

export function createThStagingServer() {
  return http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return json(res, 204, {});

    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
    const path = url.pathname;
    const correlation =
      (typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id']) ||
      randomUUID();

    if (path === '/health' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        service: 'okanggroup-th-staging-bridge',
        environment: process.env.TH_STAGING_ENVIRONMENT || 'staging',
        live_client: false,
        production: false,
        first_wave: TH_STAGING_FIRST_WAVE_MODULES,
      });
    }

    if (!authorised(req)) {
      return json(res, 401, { ok: false, error: 'Unauthorized', correlation_id: correlation });
    }

    if (path === '/v1/capabilities' && req.method === 'GET') {
      return json(res, 200, {
        ok: true,
        correlation_id: correlation,
        adapter: 'treasure_house_staging',
        environment: process.env.TH_STAGING_ENVIRONMENT || 'staging',
        live_client: false,
        capabilities: {
          edit: true,
          preview: true,
          draft: true,
          submit: true,
          publish: true,
          rollback: true,
          media: false,
          modules: true,
        },
        modules: store.moduleCodes(),
        first_wave: store.firstWave(),
      });
    }

    const contentMatch = path.match(/^\/v1\/modules\/([^/]+)\/content$/);
    if (contentMatch) {
      const code = decodeURIComponent(contentMatch[1]);
      const mod = store.get(code);
      if (!mod) {
        return json(res, 404, { ok: false, error: 'Module not found', correlation_id: correlation });
      }
      if (req.method === 'GET') {
        return json(res, 200, {
          ok: true,
          correlation_id: correlation,
          module: code,
          draft: mod.draft,
          published: mod.published,
          revision_count: mod.revisions.length,
        });
      }
      if (req.method === 'PUT') {
        try {
          const body = await readBody(req);
          const updated = store.put(code, body);
          return json(res, 200, {
            ok: true,
            correlation_id: correlation,
            module: code,
            draft: updated.draft,
          });
        } catch {
          return json(res, 400, { ok: false, error: 'Invalid JSON', correlation_id: correlation });
        }
      }
    }

    const publishMatch = path.match(/^\/v1\/modules\/([^/]+)\/publish$/);
    if (publishMatch && req.method === 'POST') {
      const code = decodeURIComponent(publishMatch[1]);
      const mod = store.publish(code, correlation);
      if (!mod) {
        return json(res, 404, { ok: false, error: 'Module not found', correlation_id: correlation });
      }
      return json(res, 200, {
        ok: true,
        correlation_id: correlation,
        module: code,
        published: mod.published,
        revision_no: mod.revisions.length,
      });
    }

    const rollbackMatch = path.match(/^\/v1\/modules\/([^/]+)\/rollback$/);
    if (rollbackMatch && req.method === 'POST') {
      const code = decodeURIComponent(rollbackMatch[1]);
      try {
        const body = await readBody(req);
        const result = store.rollback(code, body.revision_no);
        if (!result) {
          return json(res, 404, { ok: false, error: 'Module not found', correlation_id: correlation });
        }
        if (result.error) {
          return json(res, 404, { ok: false, error: result.error, correlation_id: correlation });
        }
        return json(res, 200, {
          ok: true,
          correlation_id: correlation,
          module: code,
          restored_revision: result.restored_revision,
          draft: result.mod.draft,
          published: result.mod.published,
        });
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid JSON', correlation_id: correlation });
      }
    }

    return json(res, 404, { ok: false, error: 'Not found', correlation_id: correlation });
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const server = createThStagingServer();
  server.listen(PORT, '127.0.0.1', () => {
    console.log(
      `[th-staging] listening on http://127.0.0.1:${PORT} (staging bridge; live_client=false; production refused)`,
    );
  });
}
