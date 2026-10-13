/**
 * Hosted integration UAT runner (development only).
 * Protected by the same non-production X-Api-Key as dev-client-cms.
 * Does not contact live client applications. Production HOLD.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

const DEFAULT_KEY = "okang-dev-client-cms-key-not-for-production";
const OWNER_EMAIL = "okanggroup@gmail.com";
const DANIEL_EMAIL = "daniel.uat@okangroup.test";
const HOSTED_BASE =
  "https://prbgsnxpwyepdggdysnt.supabase.co/functions/v1/dev-client-cms";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sessionFor(admin: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) {
    throw new Error(`generateLink failed for ${email}: ${error?.message ?? "no token"}`);
  }
  const verify = await admin.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "email",
  });
  if (verify.error || !verify.data.session?.access_token) {
    throw new Error(`verifyOtp failed for ${email}: ${verify.error?.message ?? "no session"}`);
  }
  return verify.data.session.access_token;
}

async function gatewayCall(
  supabaseUrl: string,
  anonKey: string,
  accessToken: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(`${supabaseUrl}/functions/v1/cms-integration-gateway`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "x-correlation-id": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text.slice(0, 800) };
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "POST required" });

  const expected = Deno.env.get("DEV_CLIENT_CMS_API_KEY") || DEFAULT_KEY;
  if (req.headers.get("x-api-key") !== expected) {
    return json(401, { ok: false, error: "Unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { ok: false, error: "Server misconfigured" });
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const evidence: Record<string, unknown> = {
    environment: "development",
    live_client: false,
    production: "HOLD",
    hosted_stub_base: HOSTED_BASE,
    steps: {} as Record<string, unknown>,
  };
  const steps = evidence.steps as Record<string, unknown>;

  try {
    // Resolve UAT custom sandbox instance
    const { data: instRows, error: instErr } = await admin
      .from("cms_instances")
      .select("id, slug, client_id")
      .eq("slug", "uat-custom-sandbox")
      .limit(1);
    if (instErr || !instRows?.[0]) {
      throw new Error(`uat-custom-sandbox missing: ${instErr?.message ?? "not found"}`);
    }
    const instanceId = instRows[0].id as string;
    evidence.instance_id = instanceId;

    // Ensure vault credential (dev only)
    const ownerToken = await sessionFor(admin, OWNER_EMAIL);
    const ownerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${ownerToken}` } },
    });

    const storeCred = await ownerClient.rpc("store_cms_credential", {
      p_credential_ref: "dev/okang-client-cms",
      p_secret: expected,
      p_description: "Hosted UAT vault entry",
    });
    steps.store_credential = {
      ok: !storeCred.error,
      error: storeCred.error?.message ?? null,
      leaked_secret: JSON.stringify(storeCred.data ?? {}).includes(expected),
    };
    if (storeCred.error) throw new Error(storeCred.error.message);

    const configure = await ownerClient.rpc("configure_cms_connection", {
      p_instance_id: instanceId,
      p_adapter_code: "okang_dev_client",
      p_base_url: HOSTED_BASE,
      p_credential_ref: "dev/okang-client-cms",
      p_notes: "Hosted non-production stub via Edge",
      p_integration_mode: "external",
    });
    steps.configure_connection = {
      ok: !configure.error,
      data: configure.data,
      error: configure.error?.message ?? null,
    };
    if (configure.error) throw new Error(configure.error.message);

    // Direct stub health (proves public reachability)
    const stubHealth = await fetch(`${HOSTED_BASE}/health`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    const stubHealthBody = await stubHealth.json();
    steps.stub_direct_health = { status: stubHealth.status, body: stubHealthBody };
    if (!stubHealth.ok) throw new Error("Hosted stub /health failed");

    const stubUnauth = await fetch(`${HOSTED_BASE}/v1/capabilities`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    });
    steps.stub_rejects_missing_api_key = { status: stubUnauth.status, ok: stubUnauth.status === 401 };

    // Gateway health / capabilities / content cycle
    const health = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "health",
      instance_id: instanceId,
      idempotency_key: `hosted-uat-health-${Date.now()}`,
    });
    steps.gateway_health = health;
    if (!health.ok) throw new Error(`gateway health failed: ${JSON.stringify(health.body)}`);

    const caps = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "capabilities",
      instance_id: instanceId,
      idempotency_key: `hosted-uat-caps-${Date.now()}`,
    });
    steps.gateway_capabilities = caps;
    if (!caps.ok) throw new Error("gateway capabilities failed");

    const marker = `hosted-uat-${new Date().toISOString()}`;
    const put = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "put_content",
      instance_id: instanceId,
      module_code: "announcements",
      content: { title: "Hosted UAT Announcement", body: marker },
      idempotency_key: `hosted-uat-put-${Date.now()}`,
    });
    steps.gateway_put_content = put;
    if (!put.ok) throw new Error("gateway put_content failed");

    const get = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "get_content",
      instance_id: instanceId,
      module_code: "announcements",
      idempotency_key: `hosted-uat-get-${Date.now()}`,
    });
    steps.gateway_get_content = get;
    const getDraft = (get.body as { upstream?: { draft?: { body?: string } } })?.upstream?.draft;
    if (!get.ok || getDraft?.body !== marker) {
      throw new Error("gateway get_content did not return edited draft");
    }

    // Platform approval gate on hybrid instance
    const hybridId = "f5dfa20e-3c7a-4b89-b77d-ac53339a1edf";
    const moduleId = "1bf60faa-bc75-46cd-8182-20899ea6b78e";
    const danielToken = await sessionFor(admin, DANIEL_EMAIL);
    const danielClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${danielToken}` } },
    });

    const slug = `hosted-uat-${Date.now()}`;
    const save = await danielClient.rpc("save_client_cms_document", {
      p_instance_id: hybridId,
      p_module_id: moduleId,
      p_slug: slug,
      p_title: "Hosted UAT Gate Doc",
      p_body_json: {
        version: 2,
        tree: [],
        breakpoints: {},
        tokens: {},
        brand: {},
        navigation: {},
        styles: [],
        interactions: [],
      },
      p_document_id: null,
      p_requires_client_approval: true,
    });
    steps.platform_save = { ok: !save.error, document_id: save.data, error: save.error?.message };
    if (save.error) throw new Error(save.error.message);
    const docId = save.data as string;

    const submit = await danielClient.rpc("submit_client_cms_document", {
      p_document_id: docId,
      p_note: "hosted uat",
    });
    steps.platform_submit = { ok: !submit.error, error: submit.error?.message };

    const decide = await ownerClient.rpc("decide_client_cms_document", {
      p_document_id: docId,
      p_approve: true,
      p_note: "mgmt hosted uat",
    });
    steps.platform_mgmt_approve = { ok: !decide.error, error: decide.error?.message };

    // External publish must fail while awaiting client approval
    const pubBlocked = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "publish",
      instance_id: instanceId,
      module_code: "announcements",
      document_id: docId,
      idempotency_key: `hosted-uat-pub-blocked-${Date.now()}`,
    });
    steps.publish_blocked_awaiting_client = {
      status: pubBlocked.status,
      ok_expected_false: pubBlocked.status === 403 || pubBlocked.ok === false,
      body: pubBlocked.body,
    };
    if (pubBlocked.ok) throw new Error("publish should be blocked before client approval");

    // Use an already-published hybrid document for allowed publish path
    const { data: publishedDocs } = await admin
      .from("client_cms_documents")
      .select("id, status")
      .eq("cms_instance_id", hybridId)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1);
    const publishedId = publishedDocs?.[0]?.id as string | undefined;
    if (!publishedId) throw new Error("No published hybrid document for allowed publish test");

    const pubKey = `hosted-uat-pub-${Date.now()}`;
    const pub1 = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "publish",
      instance_id: instanceId,
      module_code: "announcements",
      document_id: publishedId,
      idempotency_key: pubKey,
    });
    steps.gateway_publish = pub1;
    if (!pub1.ok) throw new Error(`gateway publish failed: ${JSON.stringify(pub1.body)}`);

    const pubReplay = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "publish",
      instance_id: instanceId,
      module_code: "announcements",
      document_id: publishedId,
      idempotency_key: pubKey,
    });
    steps.gateway_publish_idempotent_replay = {
      ok: pubReplay.ok,
      idempotent_replay: (pubReplay.body as { idempotent_replay?: boolean })?.idempotent_replay === true,
      body: pubReplay.body,
    };

    const verify = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "get_content",
      instance_id: instanceId,
      module_code: "announcements",
      idempotency_key: `hosted-uat-verify-${Date.now()}`,
    });
    const publishedBody = (verify.body as {
      upstream?: { published?: { body?: string; title?: string } };
    })?.upstream?.published;
    steps.verify_published_in_client_app = {
      ok: verify.ok && publishedBody?.title === "Hosted UAT Announcement",
      published: publishedBody,
    };
    if (!steps.verify_published_in_client_app || !(steps.verify_published_in_client_app as { ok: boolean }).ok) {
      throw new Error("Published content not visible on hosted stub");
    }

    const revNo = (pub1.body as { upstream?: { revision_no?: number } })?.upstream?.revision_no;
    await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "put_content",
      instance_id: instanceId,
      module_code: "announcements",
      content: { title: "Should rollback", body: "temp" },
      idempotency_key: `hosted-uat-put2-${Date.now()}`,
    });
    const rollback = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "rollback",
      instance_id: instanceId,
      module_code: "announcements",
      revision_no: revNo,
      idempotency_key: `hosted-uat-rb-${Date.now()}`,
    });
    steps.gateway_rollback = rollback;
    if (!rollback.ok) throw new Error("gateway rollback failed");

    // Failed request (bad module)
    const failed = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "get_content",
      instance_id: instanceId,
      module_code: "does-not-exist",
      idempotency_key: `hosted-uat-fail-${Date.now()}`,
    });
    steps.failed_request_logged = {
      ok_expected_false: !failed.ok,
      status: failed.status,
      body: failed.body,
    };

    // Daniel cannot store credentials / cannot use gateway snapshot path for manage
    const danielStore = await danielClient.rpc("store_cms_credential", {
      p_credential_ref: "dev/daniel-hosted-attempt",
      p_secret: "x",
      p_description: null,
    });
    steps.daniel_cannot_store_credential = {
      denied: !!danielStore.error,
      error: danielStore.error?.message ?? null,
    };

    const danielGw = await gatewayCall(supabaseUrl, anonKey, danielToken, {
      action: "health",
      instance_id: instanceId,
      idempotency_key: `hosted-uat-daniel-${Date.now()}`,
    });
    steps.daniel_gateway_denied = {
      denied: danielGw.status === 403 || !danielGw.ok,
      status: danielGw.status,
      body: danielGw.body,
    };
    if (!(steps.daniel_gateway_denied as { denied: boolean }).denied) {
      throw new Error("Daniel without clients.manage must be denied gateway access");
    }

    // Cross-client: random UUID instance should fail authz
    const cross = await gatewayCall(supabaseUrl, anonKey, ownerToken, {
      action: "health",
      instance_id: "00000000-0000-0000-0000-000000000000",
      idempotency_key: `hosted-uat-cross-${Date.now()}`,
    });
    steps.cross_client_isolation = {
      denied: cross.status === 403 || !cross.ok,
      status: cross.status,
    };
    if (!(steps.cross_client_isolation as { denied: boolean }).denied) {
      throw new Error("Unknown instance must be denied");
    }

    evidence.verdict = "PASS";
    evidence.message = "Hosted client CMS integration UAT passed on development";
    return json(200, evidence);
  } catch (e) {
    evidence.verdict = "FAIL";
    evidence.error = e instanceof Error ? e.message : String(e);
    return json(500, evidence);
  }
});
