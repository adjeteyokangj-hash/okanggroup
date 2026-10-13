/**
 * OkangGroup — dedicated DEVELOPMENT client CMS stub.
 * Safe credentials only. Do NOT point this at live client apps.
 *
 * Auth: X-Api-Key: <DEV_CLIENT_CMS_API_KEY>
 * Default port: 8791
 */
import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8791);
const API_KEY = process.env.DEV_CLIENT_CMS_API_KEY || 'okang-dev-client-cms-key-not-for-production';

/** @type {Map<string, { draft: object, published: object | null, revisions: object[] }>} */
const modules = new Map([
  [
    'announcements',
    {
      draft: {
        title: 'Welcome',
        body: 'Development stub content',
        updated_at: new Date().toISOString(),
      },
      published: null,
      revisions: [],
    },
  ],
  [
    'homepage',
    {
      draft: {
        title: 'Home',
        body: 'Stub homepage',
        updated_at: new Date().toISOString(),
      },
      published: null,
      revisions: [],
    },
  ],
]);

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

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    return json(res, 204, {});
  }

  const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      service: 'okanggroup-dev-client-cms',
      environment: 'development',
      live_client: false,
    });
  }

  if (!authorised(req)) {
    return json(res, 401, { ok: false, error: 'Unauthorized' });
  }

  const correlation =
    (typeof req.headers['x-correlation-id'] === 'string' && req.headers['x-correlation-id']) ||
    randomUUID();

  if (path === '/v1/capabilities' && req.method === 'GET') {
    return json(res, 200, {
      ok: true,
      correlation_id: correlation,
      adapter: 'okang_dev_client',
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
      modules: [...modules.keys()],
    });
  }

  const contentMatch = path.match(/^\/v1\/modules\/([^/]+)\/content$/);
  if (contentMatch) {
    const code = decodeURIComponent(contentMatch[1]);
    const mod = modules.get(code);
    if (!mod) return json(res, 404, { ok: false, error: 'Module not found', correlation_id: correlation });

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
        mod.draft = {
          ...body,
          updated_at: new Date().toISOString(),
        };
        return json(res, 200, {
          ok: true,
          correlation_id: correlation,
          module: code,
          draft: mod.draft,
        });
      } catch {
        return json(res, 400, { ok: false, error: 'Invalid JSON', correlation_id: correlation });
      }
    }
  }

  const publishMatch = path.match(/^\/v1\/modules\/([^/]+)\/publish$/);
  if (publishMatch && req.method === 'POST') {
    const code = decodeURIComponent(publishMatch[1]);
    const mod = modules.get(code);
    if (!mod) return json(res, 404, { ok: false, error: 'Module not found', correlation_id: correlation });
    const snap = structuredClone(mod.draft);
    mod.revisions.push({
      revision_no: mod.revisions.length + 1,
      snapshot: snap,
      published_at: new Date().toISOString(),
      correlation_id: correlation,
    });
    mod.published = snap;
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
    const mod = modules.get(code);
    if (!mod) return json(res, 404, { ok: false, error: 'Module not found', correlation_id: correlation });
    try {
      const body = await readBody(req);
      const revNo = Number(body.revision_no);
      const rev = mod.revisions.find((r) => r.revision_no === revNo);
      if (!rev) return json(res, 404, { ok: false, error: 'Revision not found', correlation_id: correlation });
      mod.draft = structuredClone(rev.snapshot);
      mod.published = structuredClone(rev.snapshot);
      return json(res, 200, {
        ok: true,
        correlation_id: correlation,
        module: code,
        restored_revision: revNo,
        draft: mod.draft,
        published: mod.published,
      });
    } catch {
      return json(res, 400, { ok: false, error: 'Invalid JSON', correlation_id: correlation });
    }
  }

  return json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(
    `[dev-client-cms] listening on http://127.0.0.1:${PORT} (development stub; live_client=false)`,
  );
});
