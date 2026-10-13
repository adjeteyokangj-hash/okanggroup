import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type GrantSpec = {
  role_code: string;
  scope_type: "platform" | "client" | "project";
  client_id?: string | null;
  project_id?: string | null;
};

type Body = {
  action:
    | "create_staff"
    | "create_client_portal_user"
    | "send_setup"
    | "resend"
    | "suspend"
    | "offboard"
    | "reactivate_auth"
    | "generate_temp_password"
    | "complete_forced_password_change"
    | "verify_staff_account"
    | "create" // legacy alias → create_staff (no email)
    | "invite"; // legacy alias → send_setup
  email?: string;
  full_name?: string;
  phone?: string | null;
  employment_type?: "employee" | "contractor" | "freelancer";
  employment_status?: "active" | "inactive";
  department_id?: string | null;
  job_title_id?: string | null;
  mfa_required?: boolean;
  grants?: GrantSpec[];
  redirect_to?: string;
  invitation_id?: string;
  profile_id?: string;
  reason?: string;
  /** New password for forced change (never logged) */
  new_password?: string;
  /** @deprecated ignored — Create Staff never emails */
  send_invite?: boolean;
  /** Client portal user provisioning */
  client_id?: string;
  cms_instance_id?: string;
  membership_role?: "client_admin" | "client_user";
  can_edit?: boolean;
  can_submit?: boolean;
  can_publish?: boolean;
};

function safeDbError(err: { message?: string; code?: string } | null, fallback: string) {
  const msg = (err?.message ?? "").toLowerCase();
  // Privilege / schema problems must not look like a missing staff row.
  if (
    msg.includes("permission denied") ||
    msg.includes("row-level security") ||
    err?.code === "42501"
  ) {
    return "Staff lookup failed due to a server configuration issue. Contact Owner.";
  }
  if (!err || msg.includes("0 rows") || err.code === "PGRST116") {
    return fallback;
  }
  return fallback;
}

async function loadStaffProfile(
  admin: ReturnType<typeof createClient>,
  profileId: string,
) {
  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("id, email, full_name, account_status, account_kind, employment_type, phone, mfa_required")
    .eq("id", profileId)
    .eq("account_kind", "staff")
    .maybeSingle();

  if (pErr) {
    return {
      profile: null as null,
      error: safeDbError(pErr, "Staff profile lookup failed"),
      status: 500 as const,
    };
  }
  if (!profile) {
    return {
      profile: null as null,
      error: "Staff profile not found",
      status: 404 as const,
    };
  }
  return { profile, error: null as null, status: 200 as const };
}

function strongTempPassword() {
  const raw = randomToken();
  // Mix classes; Auth stores hash only — plaintext returned once to Owner.
  return `Og$${raw.slice(0, 10)}-${raw.slice(10, 18)}!${raw.slice(18, 22)}9A`;
}

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

function randomPassword() {
  return `Og$${randomToken().slice(0, 24)}!9`;
}

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

export async function handleStaffRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    const { data: canInvite } = await caller.rpc("has_permission", {
      code: "org.staff.invite",
    });
    const { data: canManage } = await caller.rpc("has_permission", {
      code: "org.staff.manage",
    });
    const { data: canRoles } = await caller.rpc("has_permission", {
      code: "platform.roles.manage",
    });

    const body = (await req.json()) as Body;
    let action = body.action;
    if (action === "create") action = "create_staff";
    if (action === "invite") action = "send_setup";

    const redirectTo =
      body.redirect_to ??
      Deno.env.get("STAFF_INVITE_REDIRECT") ??
      "http://localhost:5174/admin/reset-password";

    // -------------------------------------------------------------------------
    // Create Staff — Auth user + profile + grants. NO email.
    // -------------------------------------------------------------------------
    if (action === "create_staff") {
      if (!canInvite && !canManage) {
        return json({ error: "org.staff.invite required" }, 403);
      }
      const email = (body.email ?? "").trim().toLowerCase();
      const fullName = (body.full_name ?? "").trim();
      if (!email || !fullName) {
        return json({ error: "full_name and email are required" }, 400);
      }
      if (!body.employment_type) {
        return json({ error: "employment_type is required" }, 400);
      }

      const grants = body.grants ?? [];
      for (const g of grants) {
        if (g.role_code === "owner") {
          return json({ error: "Cannot assign owner role on create" }, 400);
        }
      }
      if (grants.length > 0 && !canRoles) {
        return json({
          error: "platform.roles.manage required to attach grants",
        }, 403);
      }

      const employmentStatus = body.employment_status ?? "active";
      const payload = {
        full_name: fullName,
        phone: body.phone ?? null,
        employment_type: body.employment_type,
        employment_status: employmentStatus,
        department_id: body.department_id ?? null,
        job_title_id: body.job_title_id ?? null,
        mfa_required: body.mfa_required ?? true,
        grants,
      };

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: randomPassword(),
        email_confirm: false,
        user_metadata: {
          full_name: fullName,
          account_kind: "staff",
          employment_type: body.employment_type,
          employment_status: employmentStatus,
          phone: body.phone ?? "",
          staff_provisioned: true,
          created_by: userData.user.id,
        },
        app_metadata: {
          staff_provisioned: true,
        },
      });

      if (createErr || !created.user) {
        return json({
          error: createErr?.message ?? "Failed to create Auth user",
        }, 400);
      }

      const profileId = created.user.id;

      // Ensure profile row exists (trigger) then finalize via caller JWT (permission checks)
      for (let i = 0; i < 8; i++) {
        const { data: prof } = await admin
          .from("profiles")
          .select("id")
          .eq("id", profileId)
          .maybeSingle();
        if (prof) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      const { data: fin, error: finErr } = await caller.rpc("finalize_staff_record", {
        p_profile_id: profileId,
        p_payload: payload,
      });

      if (finErr) {
        return json({
          error: finErr.message,
          profile_id: profileId,
          note: "Auth user created but finalize failed — fix via Staff detail or retry carefully.",
        }, 400);
      }

      return json({
        ok: true,
        profile_id: profileId,
        email,
        employment_status: employmentStatus,
        account_status: "pending_setup",
        emailed: false,
        finalize: fin,
        note: "Staff record created. No email sent. Use Send Account Setup when ready.",
      });
    }

    // -------------------------------------------------------------------------
    // Create client portal user — separate from staff; CMS grant only
    // -------------------------------------------------------------------------
    if (action === "create_client_portal_user") {
      const { data: canClients } = await caller.rpc("has_permission", {
        code: "clients.manage",
      });
      if (!canClients) {
        return json({ error: "clients.manage required" }, 403);
      }
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
        return json({
          error: createErr?.message ?? "Failed to create Auth user",
        }, 400);
      }
      const profileId = created.user.id;

      for (let i = 0; i < 8; i++) {
        const { data: prof } = await admin
          .from("profiles")
          .select("id, account_kind")
          .eq("id", profileId)
          .maybeSingle();
        if (prof) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      await admin
        .from("profiles")
        .update({
          account_kind: "client_user",
          account_status: "active",
          full_name: fullName,
          must_change_password: true,
          mfa_required: false,
          employment_status: "inactive",
          employment_type: null,
        })
        .eq("id", profileId);

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
        note: "Client portal user created. Share temporary password securely. No staff permissions granted.",
      });
    }

    // -------------------------------------------------------------------------
    // Send / resend Account Setup email
    // -------------------------------------------------------------------------
    if (action === "send_setup" || action === "resend") {
      if (!canInvite && !canManage) {
        return json({ error: "org.staff.invite required" }, 403);
      }

      let profileId = body.profile_id;
      let email = (body.email ?? "").trim().toLowerCase();

      if (action === "resend" && body.invitation_id) {
        const { data: inv, error: invErr } = await admin
          .from("invitations")
          .select("*")
          .eq("id", body.invitation_id)
          .eq("account_kind", "staff")
          .single();
        if (invErr || !inv) return json({ error: "Invitation not found" }, 404);
        if (inv.status !== "pending") {
          return json({ error: `Cannot resend in status ${inv.status}` }, 400);
        }
        email = inv.email;
        profileId = inv.auth_user_id ?? profileId;
      }

      if (!profileId && email) {
        const { data: prof } = await admin
          .from("profiles")
          .select("id, email, full_name, account_status, employment_type, phone")
          .eq("email", email)
          .eq("account_kind", "staff")
          .maybeSingle();
        if (!prof) return json({ error: "Staff profile not found for email" }, 404);
        profileId = prof.id;
      }

      if (!profileId) return json({ error: "profile_id or email required" }, 400);

      const loaded = await loadStaffProfile(admin, profileId);
      if (!loaded.profile) return json({ error: loaded.error }, loaded.status);
      const profile = loaded.profile;
      email = profile.email;

      if (profile.account_status === "offboarded") {
        return json({ error: "Cannot send setup for offboarded staff" }, 400);
      }

      // Track setup as invitation row (history); grants already on profile if provisioned
      const token = randomToken();
      const tokenHash = await sha256Hex(token);
      const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: grants } = await admin
        .from("role_grants")
        .select("roles(code), access_scopes(scope_type, client_id, project_id)")
        .eq("profile_id", profileId)
        .eq("status", "active");

      const grantPayload = ((grants as Array<{
        roles: { code: string } | { code: string }[];
        access_scopes:
          | { scope_type: string; client_id: string | null; project_id: string | null }
          | { scope_type: string; client_id: string | null; project_id: string | null }[];
      }>) ?? []).map((g) => {
        const role = Array.isArray(g.roles) ? g.roles[0] : g.roles;
        const scope = Array.isArray(g.access_scopes) ? g.access_scopes[0] : g.access_scopes;
        return {
          role_code: role?.code,
          scope_type: scope?.scope_type ?? "platform",
          client_id: scope?.client_id ?? null,
          project_id: scope?.project_id ?? null,
        };
      });

      await admin
        .from("invitations")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("email", email)
        .eq("account_kind", "staff")
        .eq("status", "pending");

      const { data: inv, error: invInsErr } = await admin
        .from("invitations")
        .insert({
          email,
          full_name: profile.full_name,
          account_kind: "staff",
          invited_by: userData.user.id,
          token_hash: tokenHash,
          expires_at: expires,
          status: "pending",
          created_by: userData.user.id,
          auth_user_id: profileId,
          send_status: "not_sent",
          invite_payload: {
            full_name: profile.full_name,
            employment_type: profile.employment_type,
            phone: profile.phone,
            mfa_required: profile.mfa_required,
            grants: grantPayload,
          },
        })
        .select("id")
        .single();

      if (invInsErr) return json({ error: invInsErr.message }, 400);

      // Prefer invite email; if Auth user already exists (direct create), send recovery email.
      const { data: invited, error: inviteErr } = await admin.auth.admin
        .inviteUserByEmail(email, {
          data: {
            full_name: profile.full_name,
            account_kind: "staff",
            staff_provisioned: true,
            invitation_id: inv.id,
          },
          redirectTo,
        });

      let emailed = !inviteErr;
      let sendNote =
        "Account setup email sent. Staff sets their own password — Owner never sees it.";

      if (inviteErr) {
        const recoverRes = await fetch(`${supabaseUrl}/auth/v1/recover`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, redirect_to: redirectTo }),
        });
        if (!recoverRes.ok) {
          const recoverText = await recoverRes.text();
          await admin
            .from("invitations")
            .update({ send_status: "failed" })
            .eq("id", inv.id);
          return json({
            error: `Setup email failed: ${inviteErr.message}; recover: ${recoverText}`,
            invitation_id: inv.id,
            emailed: false,
          }, 400);
        }
        emailed = true;
        sendNote =
          "Password setup email sent (recovery). Staff sets their own password — Owner never sees it.";
      }

      await admin
        .from("invitations")
        .update({
          send_status: emailed ? "sent" : "failed",
          auth_user_id: invited?.user?.id ?? profileId,
        })
        .eq("id", inv.id);

      if (profile.account_status !== "active") {
        await admin
          .from("profiles")
          .update({ account_status: "pending_setup" })
          .eq("id", profileId);
      }

      return json({
        ok: true,
        emailed,
        invitation_id: inv.id,
        profile_id: profileId,
        note: sendNote,
      });
    }

    if (action === "suspend" || action === "offboard") {
      if (!canManage && !canRoles) {
        return json({ error: "org.staff.manage required" }, 403);
      }
      if (!body.profile_id) return json({ error: "profile_id required" }, 400);

      const status = action === "suspend" ? "suspended" : "offboarded";
      const { data: rpcData, error: rpcErr } = await caller.rpc(
        "set_staff_account_status",
        {
          p_profile_id: body.profile_id,
          p_status: status,
          p_reason: body.reason ?? status,
        },
      );
      if (rpcErr) return json({ error: rpcErr.message }, 400);

      const { error: banErr } = await admin.auth.admin.updateUserById(
        body.profile_id,
        { ban_duration: "876000h" },
      );

      return json({
        ok: true,
        db: rpcData,
        auth_ban: !banErr,
        warning: banErr?.message,
      });
    }

    if (action === "reactivate_auth") {
      if (!canManage && !canRoles) {
        return json({ error: "org.staff.manage required" }, 403);
      }
      if (!body.profile_id) return json({ error: "profile_id required" }, 400);

      // Restore login to pending_setup — require re-grant + setup if grants were revoked
      const { data: rpcData, error: rpcErr } = await caller.rpc(
        "set_staff_account_status",
        {
          p_profile_id: body.profile_id,
          p_status: "pending_setup",
          p_reason: body.reason ?? "Reactivated — awaiting setup / re-grant",
        },
      );
      if (rpcErr) return json({ error: rpcErr.message }, 400);

      const { error: unbanErr } = await admin.auth.admin.updateUserById(
        body.profile_id,
        { ban_duration: "none" },
      );

      return json({
        ok: true,
        db: rpcData,
        auth_unban: !unbanErr,
        warning: unbanErr?.message,
        note: "Login unbanned as pending_setup. Re-grant roles if revoked, then Send Account Setup.",
      });
    }

    // -------------------------------------------------------------------------
    // Verify staff profile + Auth linkage (Owner/Admin). No password issued.
    // -------------------------------------------------------------------------
    if (action === "verify_staff_account") {
      if (!canInvite && !canManage && !canRoles) {
        return json({ error: "org.staff.read/manage required" }, 403);
      }
      if (!body.profile_id) return json({ error: "profile_id required" }, 400);

      const loaded = await loadStaffProfile(admin, body.profile_id);
      if (!loaded.profile) return json({ error: loaded.error }, loaded.status);
      const profile = loaded.profile;

      const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(
        body.profile_id,
      );
      const authExists = Boolean(authUser?.user) && !getErr;
      const authEmail = authUser?.user?.email ?? null;
      const emailMatch =
        authExists &&
        Boolean(authEmail) &&
        authEmail!.toLowerCase() === profile.email.toLowerCase();

      return json({
        ok: true,
        profile_id: profile.id,
        email: profile.email,
        account_status: profile.account_status,
        auth_user_exists: authExists,
        auth_email_matches: emailMatch,
        credentials_ready:
          authExists &&
          emailMatch &&
          profile.account_status !== "suspended" &&
          profile.account_status !== "offboarded",
        note: authExists
          ? emailMatch
            ? "Staff profile and Auth user are linked."
            : "Auth user exists but email does not match the staff profile."
          : "Staff profile exists; Auth user is missing. Password generation can recreate Auth with the same id.",
      });
    }

    // -------------------------------------------------------------------------
    // Generate temporary password (Owner/Admin). Shown once; Auth hash only.
    // -------------------------------------------------------------------------
    if (action === "generate_temp_password") {
      if (!canInvite && !canManage) {
        return json({ error: "org.staff.invite required" }, 403);
      }
      if (!body.profile_id) return json({ error: "profile_id required" }, 400);
      if (body.profile_id === userData.user.id) {
        return json({ error: "Cannot generate a temporary password for yourself" }, 400);
      }

      const loaded = await loadStaffProfile(admin, body.profile_id);
      if (!loaded.profile) return json({ error: loaded.error }, loaded.status);
      const profile = loaded.profile;

      if (profile.account_status === "suspended" || profile.account_status === "offboarded") {
        return json({
          error: `Cannot issue temporary password while account is ${profile.account_status}`,
        }, 400);
      }

      let { data: authUser, error: getErr } = await admin.auth.admin.getUserById(
        body.profile_id,
      );

      // Staff records may exist before login activation; Auth should already exist
      // from create_staff. If Auth is missing, recreate with the same profile id.
      if (getErr || !authUser?.user) {
        const tempForCreate = strongTempPassword();
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          id: body.profile_id,
          email: profile.email,
          password: tempForCreate,
          email_confirm: true,
          user_metadata: {
            full_name: profile.full_name,
            account_kind: "staff",
            staff_provisioned: true,
          },
          app_metadata: {
            staff_provisioned: true,
            must_change_password: true,
          },
        });
        if (createErr || !created.user) {
          return json({
            error:
              "Staff profile found, but the Auth login account could not be verified or created. Password was not issued.",
          }, 400);
        }
        authUser = created;
        // Password already set on create — still mark profile + return once.
        const { data: marked, error: markErr } = await caller.rpc(
          "mark_staff_temp_password_issued",
          { p_profile_id: body.profile_id },
        );
        if (markErr) {
          return json({
            error: "Temporary password was set in Auth but profile activation failed. Contact Owner before retrying.",
          }, 400);
        }
        return json({
          ok: true,
          profile_id: body.profile_id,
          email: profile.email,
          temporary_password: tempForCreate,
          must_change_password: true,
          auth_recreated: true,
          mark: marked,
          note: "Copy this password now. It will not be shown again. Staff must change it on first login.",
        });
      }

      if (
        authUser.user.email &&
        authUser.user.email.toLowerCase() !== profile.email.toLowerCase()
      ) {
        return json({
          error:
            "Staff profile and Auth account email do not match. Password was not issued.",
        }, 400);
      }

      const tempPassword = strongTempPassword();
      const prevMeta = (authUser.user.app_metadata ?? {}) as Record<string, unknown>;

      const { error: updErr } = await admin.auth.admin.updateUserById(body.profile_id, {
        password: tempPassword,
        email_confirm: true,
        ban_duration: "none",
        app_metadata: {
          ...prevMeta,
          staff_provisioned: true,
          must_change_password: true,
        },
      });

      if (updErr) {
        return json({ error: "Could not update Auth password for this staff account." }, 400);
      }

      const { data: marked, error: markErr } = await caller.rpc(
        "mark_staff_temp_password_issued",
        { p_profile_id: body.profile_id },
      );
      if (markErr) {
        return json({
          error:
            "Temporary password was set in Auth but profile activation failed. Contact Owner before retrying.",
        }, 400);
      }

      // Intentionally no console logging of tempPassword
      return json({
        ok: true,
        profile_id: body.profile_id,
        email: profile.email,
        temporary_password: tempPassword,
        must_change_password: true,
        mark: marked,
        note: "Copy this password now. It will not be shown again. Staff must change it on first login.",
      });
    }

    // -------------------------------------------------------------------------
    // Staff completes forced password change (self). Clears Auth + profile flags.
    // -------------------------------------------------------------------------
    if (action === "complete_forced_password_change") {
      const newPassword = body.new_password ?? "";
      if (newPassword.length < 12) {
        return json({ error: "Password must be at least 12 characters" }, 400);
      }

      const uid = userData.user.id;
      const { data: profile, error: pErr } = await admin
        .from("profiles")
        .select("id, account_status, must_change_password, account_kind")
        .eq("id", uid)
        .single();

      if (pErr || !profile) return json({ error: "Profile not found" }, 404);
      if (profile.account_kind !== "staff") {
        return json({ error: "Only staff accounts use this flow" }, 403);
      }
      if (profile.account_status !== "active") {
        return json({ error: `Account is ${profile.account_status}` }, 403);
      }
      if (!profile.must_change_password) {
        return json({ error: "No forced password change is required" }, 400);
      }

      const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(uid);
      if (getErr || !authUser.user) {
        return json({ error: getErr?.message ?? "Auth user not found" }, 400);
      }

      const prevMeta = (authUser.user.app_metadata ?? {}) as Record<string, unknown>;

      const { error: updErr } = await admin.auth.admin.updateUserById(uid, {
        password: newPassword,
        app_metadata: {
          ...prevMeta,
          must_change_password: false,
        },
      });
      if (updErr) return json({ error: updErr.message }, 400);

      // Service role: auth.uid() null → self-escalation trigger allows clear
      const { error: profErr } = await admin
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", uid);
      if (profErr) {
        return json({
          error: profErr.message,
          note: "Password updated in Auth but profile flag clear failed — contact Owner.",
        }, 400);
      }

      await admin.from("account_status_events").insert({
        profile_id: uid,
        from_status: "active",
        to_status: "active",
        reason: "Forced password change completed",
        changed_by: uid,
      });

      return json({
        ok: true,
        must_change_password: false,
        note: "Password updated. Continue to MFA if required, then the dashboard.",
      });
    }

    return json({ error: `Unknown action: ${body.action}` }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 500);
  }
}
