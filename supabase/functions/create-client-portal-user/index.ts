import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function strongTempPassword() {
  const raw = randomToken();
  return `Og$${raw.slice(0, 10)}-${raw.slice(10, 18)}!${raw.slice(18, 22)}9A`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

    const { data: canClients } = await caller.rpc("has_permission", {
      code: "clients.manage",
    });
    if (!canClients) return json({ error: "clients.manage required" }, 403);

    const body = await req.json() as {
      email?: string;
      full_name?: string;
      client_id?: string;
      cms_instance_id?: string;
      membership_role?: "client_admin" | "client_user";
      can_edit?: boolean;
      can_submit?: boolean;
      can_publish?: boolean;
    };

    const email = (body.email ?? "").trim().toLowerCase();
    const fullName = (body.full_name ?? "").trim();
    const clientId = body.client_id;
    const cmsInstanceId = body.cms_instance_id;
    if (!email || !fullName || !clientId || !cmsInstanceId) {
      return json({
        error: "full_name, email, client_id and cms_instance_id are required",
      }, 400);
    }

    const { data: inst, error: instErr } = await admin
      .from("cms_instances")
      .select("id, client_id")
      .eq("id", cmsInstanceId)
      .eq("client_id", clientId)
      .maybeSingle();
    if (instErr || !inst) {
      return json({ error: "CMS instance not found for client" }, 400);
    }

    const tempPassword = strongTempPassword();
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        account_kind: "client_user",
        client_id: clientId,
        created_by: userData.user.id,
      },
      app_metadata: {
        account_kind: "client_user",
        client_id: clientId,
      },
    });
    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? "Failed to create Auth user" }, 400);
    }
    const profileId = created.user.id;

    for (let i = 0; i < 8; i++) {
      const { data: prof } = await admin.from("profiles").select("id").eq("id", profileId).maybeSingle();
      if (prof) break;
      await new Promise((r) => setTimeout(r, 150));
    }

    await admin.from("profiles").update({
      account_kind: "client_user",
      account_status: "active",
      full_name: fullName,
      must_change_password: true,
      mfa_required: false,
      employment_status: "inactive",
      employment_type: null,
    }).eq("id", profileId);

    const { error: linkErr } = await caller.rpc("link_client_portal_user", {
      p_profile_id: profileId,
      p_client_id: clientId,
      p_cms_instance_id: cmsInstanceId,
      p_membership_role: body.membership_role ?? "client_admin",
      p_can_edit: body.can_edit ?? true,
      p_can_submit: body.can_submit ?? true,
      p_can_publish: body.can_publish ?? false,
    });
    if (linkErr) {
      return json({
        error: linkErr.message,
        profile_id: profileId,
        temporary_password: tempPassword,
        note: "Auth user created but CMS link failed — call link_client_portal_user.",
      }, 400);
    }

    return json({
      ok: true,
      profile_id: profileId,
      email,
      account_kind: "client_user",
      temporary_password: tempPassword,
      note: "Client portal user created. No OkangGroup staff permissions granted.",
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
