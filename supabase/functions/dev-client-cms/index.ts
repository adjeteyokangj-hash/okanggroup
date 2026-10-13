/**
 * Hosted NON-PRODUCTION OkangGroup client CMS stub.
 * Reachable by cms-integration-gateway. Not a live client app.
 * Auth: X-Api-Key (server-side). verify_jwt disabled — API key is the gate.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key, x-correlation-id",
  "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
};

const DEFAULT_KEY = "okang-dev-client-cms-key-not-for-production";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function pathOf(req: Request) {
  const u = new URL(req.url);
  let p = u.pathname;
  // /functions/v1/dev-client-cms/... or /dev-client-cms/...
  p = p.replace(/^\/functions\/v1\/dev-client-cms/, "");
  p = p.replace(/^\/dev-client-cms/, "");
  if (!p.startsWith("/")) p = `/${p}`;
  return p === "/" ? "/" : p.replace(/\/$/, "") || "/";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const path = pathOf(req);
  const correlation =
    req.headers.get("x-correlation-id")?.trim() || crypto.randomUUID();

  if (path === "/health" && req.method === "GET") {
    return json(200, {
      ok: true,
      service: "okanggroup-dev-client-cms",
      environment: "development",
      hosted: true,
      live_client: false,
      correlation_id: correlation,
    });
  }

  const expected = Deno.env.get("DEV_CLIENT_CMS_API_KEY") || DEFAULT_KEY;
  const key = req.headers.get("x-api-key");
  if (key !== expected) {
    return json(401, { ok: false, error: "Unauthorized", correlation_id: correlation });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server misconfigured" });
  }
  const admin = createClient(supabaseUrl, serviceKey);

  if (path === "/v1/capabilities" && req.method === "GET") {
    const { data: modules, error } = await admin.rpc("dev_client_cms_store_list");
    if (error) return json(500, { ok: false, error: error.message, correlation_id: correlation });
    return json(200, {
      ok: true,
      correlation_id: correlation,
      adapter: "okang_dev_client",
      hosted: true,
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
      modules: modules ?? [],
    });
  }

  const contentMatch = path.match(/^\/v1\/modules\/([^/]+)\/content$/);
  if (contentMatch) {
    const code = decodeURIComponent(contentMatch[1]);
    if (req.method === "GET") {
      const { data, error } = await admin.rpc("dev_client_cms_store_get", {
        p_module_code: code,
      });
      if (error) return json(500, { ok: false, error: error.message, correlation_id: correlation });
      if (!data) return json(404, { ok: false, error: "Module not found", correlation_id: correlation });
      const row = data as {
        draft: unknown;
        published: unknown;
        revisions: unknown[];
      };
      return json(200, {
        ok: true,
        correlation_id: correlation,
        module: code,
        draft: row.draft,
        published: row.published,
        revision_count: Array.isArray(row.revisions) ? row.revisions.length : 0,
      });
    }
    if (req.method === "PUT") {
      let body: Record<string, unknown>;
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return json(400, { ok: false, error: "Invalid JSON", correlation_id: correlation });
      }
      const { data, error } = await admin.rpc("dev_client_cms_store_put_draft", {
        p_module_code: code,
        p_draft: body,
      });
      if (error) return json(500, { ok: false, error: error.message, correlation_id: correlation });
      const row = data as { draft: unknown };
      return json(200, {
        ok: true,
        correlation_id: correlation,
        module: code,
        draft: row.draft,
      });
    }
  }

  const publishMatch = path.match(/^\/v1\/modules\/([^/]+)\/publish$/);
  if (publishMatch && req.method === "POST") {
    const code = decodeURIComponent(publishMatch[1]);
    const { data, error } = await admin.rpc("dev_client_cms_store_publish", {
      p_module_code: code,
      p_correlation_id: correlation,
    });
    if (error) {
      const status = error.message.includes("not found") ? 404 : 500;
      return json(status, { ok: false, error: error.message, correlation_id: correlation });
    }
    const row = data as { published: unknown; revision_no: number };
    return json(200, {
      ok: true,
      correlation_id: correlation,
      module: code,
      published: row.published,
      revision_no: row.revision_no,
    });
  }

  const rollbackMatch = path.match(/^\/v1\/modules\/([^/]+)\/rollback$/);
  if (rollbackMatch && req.method === "POST") {
    const code = decodeURIComponent(rollbackMatch[1]);
    let body: { revision_no?: number };
    try {
      body = (await req.json()) as { revision_no?: number };
    } catch {
      return json(400, { ok: false, error: "Invalid JSON", correlation_id: correlation });
    }
    const { data, error } = await admin.rpc("dev_client_cms_store_rollback", {
      p_module_code: code,
      p_revision_no: Number(body.revision_no),
    });
    if (error) {
      const status = error.message.includes("not found") || error.message.includes("Revision")
        ? 404
        : 500;
      return json(status, { ok: false, error: error.message, correlation_id: correlation });
    }
    const row = data as {
      draft: unknown;
      published: unknown;
      restored_revision: number;
    };
    return json(200, {
      ok: true,
      correlation_id: correlation,
      module: code,
      restored_revision: row.restored_revision,
      draft: row.draft,
      published: row.published,
    });
  }

  return json(404, { ok: false, error: "Not found", path, correlation_id: correlation });
});
