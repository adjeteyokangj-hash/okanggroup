import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { cmsConnectionPatchForThrownUpstream } from "./connection-status.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id",
};

type Action =
  | "health"
  | "capabilities"
  | "get_content"
  | "put_content"
  | "publish"
  | "rollback"
  | "preview_token";

type Body = {
  action: Action;
  instance_id: string;
  module_code?: string;
  content?: Record<string, unknown>;
  document_id?: string;
  revision_no?: number;
  idempotency_key?: string;
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function newCorrelation(existing?: string | null) {
  return existing && existing.trim() ? existing.trim() : crypto.randomUUID();
}

async function callClientApi(
  baseUrl: string,
  apiKey: string,
  path: string,
  method: string,
  correlationId: string,
  body?: unknown,
) {
  const url = `${baseUrl.replace(/\/$/, "")}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
    "X-Correlation-Id": correlationId,
  };
  // Hosted UAT stubs on the same Supabase Functions host require the project apikey
  // header for the platform gateway (not a client CMS secret).
  try {
    const u = new URL(baseUrl);
    if (u.hostname.endsWith(".supabase.co") && u.pathname.includes("/functions/v1/")) {
      const anon = Deno.env.get("SUPABASE_ANON_KEY");
      if (anon) {
        headers.apikey = anon;
        headers.Authorization = `Bearer ${anon}`;
      }
    }
  } catch {
    /* ignore bad base_url — upstream call will fail clearly */
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "POST required" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { ok: false, error: "Server misconfigured" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(401, { ok: false, error: "Missing Authorization" });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json(401, { ok: false, error: "Invalid session" });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON" });
  }

  if (!body?.action || !body?.instance_id) {
    return json(400, { ok: false, error: "action and instance_id required" });
  }

  const correlationId = newCorrelation(req.headers.get("x-correlation-id"));
  const idempotencyKey =
    body.idempotency_key?.trim() ||
    `${body.action}:${body.instance_id}:${body.module_code ?? ""}:${body.document_id ?? ""}:${correlationId}`;

  // Authorise via caller JWT first (clients.manage) — prevents cross-tenant probing
  const { data: authSnap, error: authSnapErr } = await userClient.rpc(
    "cms_gateway_connection_snapshot",
    { p_instance_id: body.instance_id },
  );
  if (authSnapErr || !authSnap) {
    return json(403, {
      ok: false,
      error: authSnapErr?.message ?? "Not permitted for this CMS instance",
      correlation_id: correlationId,
    });
  }

  // Idempotent replay (service role after authz)
  const { data: existing } = await admin.rpc("get_cms_integration_operation_by_key", {
    p_instance_id: body.instance_id,
    p_idempotency_key: idempotencyKey,
  });
  if (existing && (existing as { status?: string }).status === "succeeded") {
    return json(200, {
      ok: true,
      idempotent_replay: true,
      correlation_id: (existing as { correlation_id?: string }).correlation_id,
      result: (existing as { result_json?: unknown }).result_json,
    });
  }

  const { data: snap, error: snapErr } = await admin.rpc("cms_gateway_connection_snapshot", {
    p_instance_id: body.instance_id,
  });
  if (snapErr || !snap) {
    return json(400, { ok: false, error: snapErr?.message ?? "Connection snapshot failed" });
  }

  const connection = snap as {
    adapter_code: string;
    base_url: string | null;
    credential_ref: string | null;
    credential_present: boolean;
    client_id: string;
  };

  // Authorisation: publish/put need publish or manage; health/capabilities need view via manage check on user client.
  // OpsWatch marketing uses module_code (no platform document_id). Other external adapters may use document_id.
  if (body.action === "publish") {
    if (connection.adapter_code === "opswatch_marketing") {
      if (!body.module_code) {
        return json(400, { ok: false, error: "module_code required for OpsWatch publish" });
      }
    } else {
      if (!body.document_id) {
        return json(400, { ok: false, error: "document_id required for publish" });
      }
      const { error: gateErr } = await userClient.rpc("assert_cms_external_publish_allowed", {
        p_document_id: body.document_id,
      });
      if (gateErr) {
        return json(403, { ok: false, error: gateErr.message, correlation_id: correlationId });
      }
    }
  }

  if (connection.adapter_code === "sandbox_mock") {
    return json(400, {
      ok: false,
      error: "Use sandbox RPCs for sandbox_mock; gateway is for real HTTP adapters",
    });
  }

  if (connection.adapter_code === "okang_native") {
    return json(400, {
      ok: false,
      error: "okang_native uses platform publish RPCs, not the HTTP gateway",
    });
  }

  if (!connection.base_url) {
    return json(400, { ok: false, error: "base_url not configured" });
  }

  // Resolve secret: vault first, then env map for local edge testing
  let apiKey: string | null = null;
  if (connection.credential_ref) {
    const { data: secret, error: secErr } = await admin.rpc("cms_gateway_read_secret", {
      p_credential_ref: connection.credential_ref,
    });
    if (!secErr && typeof secret === "string" && secret) {
      apiKey = secret;
    } else {
      // Fallback env: CMS_CREDENTIAL__dev_okang_client_cms
      const envName =
        "CMS_CREDENTIAL__" +
        connection.credential_ref.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      apiKey = Deno.env.get(envName) ?? Deno.env.get("DEV_CLIENT_CMS_API_KEY") ?? null;
    }
  }

  if (!apiKey) {
    await admin.rpc("record_cms_integration_operation", {
      p_instance_id: body.instance_id,
      p_correlation_id: correlationId,
      p_idempotency_key: idempotencyKey,
      p_operation: body.action === "health" ? "connection_test" : body.action === "publish" ? "publish" : "capability_probe",
      p_status: "failed",
      p_adapter_code: connection.adapter_code,
      p_request_json: { action: body.action },
      p_result_json: { ok: false, error: "Credential not found in vault" },
    });
    return json(400, {
      ok: false,
      error: "Credential not found in private vault (store via store_cms_credential)",
      correlation_id: correlationId,
    });
  }

  // Never include apiKey in logs/responses
  let remote: { status: number; ok: boolean; body: unknown };
  try {
    switch (body.action) {
      case "health":
        remote = await callClientApi(connection.base_url, apiKey, "/health", "GET", correlationId);
        // health endpoint may be unauthenticated on stub — retry with key path capabilities if 401
        if (!remote.ok) {
          remote = await callClientApi(
            connection.base_url,
            apiKey,
            "/v1/capabilities",
            "GET",
            correlationId,
          );
        }
        break;
      case "capabilities":
        remote = await callClientApi(
          connection.base_url,
          apiKey,
          "/v1/capabilities",
          "GET",
          correlationId,
        );
        break;
      case "get_content":
        if (!body.module_code) return json(400, { ok: false, error: "module_code required" });
        remote = await callClientApi(
          connection.base_url,
          apiKey,
          `/v1/modules/${encodeURIComponent(body.module_code)}/content`,
          "GET",
          correlationId,
        );
        break;
      case "put_content":
        if (!body.module_code) return json(400, { ok: false, error: "module_code required" });
        remote = await callClientApi(
          connection.base_url,
          apiKey,
          `/v1/modules/${encodeURIComponent(body.module_code)}/content`,
          "PUT",
          correlationId,
          body.content ?? {},
        );
        break;
      case "publish":
        if (!body.module_code) return json(400, { ok: false, error: "module_code required" });
        remote = await callClientApi(
          connection.base_url,
          apiKey,
          `/v1/modules/${encodeURIComponent(body.module_code)}/publish`,
          "POST",
          correlationId,
          {},
        );
        break;
      case "rollback":
        if (!body.module_code) return json(400, { ok: false, error: "module_code required" });
        remote = await callClientApi(
          connection.base_url,
          apiKey,
          `/v1/modules/${encodeURIComponent(body.module_code)}/rollback`,
          "POST",
          correlationId,
          { revision_no: body.revision_no },
        );
        break;
      case "preview_token":
        remote = await callClientApi(
          connection.base_url,
          apiKey,
          "/v1/preview-token",
          "POST",
          correlationId,
          {},
        );
        break;
      default:
        return json(400, { ok: false, error: "Unknown action" });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upstream call failed";
    await admin.rpc("record_cms_integration_operation", {
      p_instance_id: body.instance_id,
      p_correlation_id: correlationId,
      p_idempotency_key: idempotencyKey,
      p_operation: body.action === "publish" ? "publish" : "connection_test",
      p_status: "failed",
      p_adapter_code: connection.adapter_code,
      p_request_json: { action: body.action, module_code: body.module_code },
      p_result_json: { ok: false, error: msg },
    });
    // Network failures (expired tunnel DNS) must clear a previous healthy flag.
    // Status becomes healthy again only after a later probe returns ok.
    await admin.from("cms_connections").update(
      cmsConnectionPatchForThrownUpstream(msg, correlationId),
    ).eq("cms_instance_id", body.instance_id);
    return json(502, { ok: false, error: msg, correlation_id: correlationId });
  }

  const opStatus = remote.ok ? "succeeded" : "failed";
  const resultPayload = {
    ok: remote.ok,
    upstream_status: remote.status,
    upstream: remote.body,
    correlation_id: correlationId,
    adapter: connection.adapter_code,
    external_live: true,
    live_production_client: false,
  };

  await admin.rpc("record_cms_integration_operation", {
    p_instance_id: body.instance_id,
    p_correlation_id: correlationId,
    p_idempotency_key: idempotencyKey,
    p_operation: body.action === "publish"
      ? "publish"
      : body.action === "rollback"
      ? "rollback"
      : body.action === "health" || body.action === "capabilities"
      ? "connection_test"
      : "capability_probe",
    p_status: opStatus,
    p_adapter_code: connection.adapter_code,
    p_request_json: {
      action: body.action,
      module_code: body.module_code,
      document_id: body.document_id,
    },
    p_result_json: resultPayload,
  });

  if (remote.ok && (body.action === "health" || body.action === "capabilities")) {
    await admin.from("cms_connections").update({
      status: "healthy",
      last_healthy_at: new Date().toISOString(),
      last_error: null,
      last_test_json: resultPayload,
    }).eq("cms_instance_id", body.instance_id);
  }

  if (!remote.ok) {
    await admin.from("cms_connections").update({
      status: "error",
      last_error: `Upstream ${remote.status}`,
      last_test_json: resultPayload,
    }).eq("cms_instance_id", body.instance_id);
  }

  return json(remote.ok ? 200 : 502, resultPayload);
});
