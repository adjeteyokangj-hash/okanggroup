# Owner Auth, bootstrap, and MFA (Release 1)

Target: **`prbgsnxpwyepdggdysnt`** / `https://prbgsnxpwyepdggdysnt.supabase.co` only.  
Do not use PJ Marketplace or StarLiz dashboards for these steps.  
Do not deploy the public website.

## Auth URL Configuration (local admin)

In Dashboard → **Authentication → URL Configuration** for `prbgsnxpwyepdggdysnt` only:

| Setting | Value |
| --- | --- |
| **Site URL** | `http://localhost:5174/admin/` |
| **Redirect URLs** (add) | `http://localhost:5174/admin/**` |
| **Redirect URLs** (add) | `http://localhost:5174/admin/reset-password` |

Remove or do **not** rely on `http://localhost:3000` for OkangGroup — that default is why recovery opened Treasure House’s offline page. Changing these settings does not affect Treasure House’s project.

Recovery emails must be requested from the OkangGroup admin **Forgot password** control (sends `redirectTo` = `http://localhost:5174/admin/reset-password`). Old emails pointing at `:3000` remain invalid; request a new one after the URL config is updated. Admin must be running when you open the link.

## A. Create the Owner Auth user

1. Open Supabase Dashboard → project **okanggroup-platform** (`prbgsnxpwyepdggdysnt`).
2. **Authentication → Users → Add user**.
3. Create with email + password (prefer your Owner email).
4. Leave the user confirmed/active.
5. In **Table Editor → `profiles`**, confirm exactly one row exists for that email (trigger `handle_new_user`).

Do not create a second Auth user for the same Owner email.

## B. Run the reviewed bootstrap script

1. Open `supabase/scripts/owner_bootstrap.sql`.
2. Replace **both** occurrences of the placeholder by editing the single string in the script: `OWNER_EMAIL_HERE` → your Auth email.
3. Run the script only in the SQL editor of **`prbgsnxpwyepdggdysnt`** (or via OkangGroup workspace MCP `execute_sql`).
4. Expected outcome: NOTICE `Owner bootstrap OK…`.
5. Abort cases (safe): placeholder not replaced; 0 or >1 profiles; missing `owner` role; ≠1 platform scope.

The script does not contain passwords, tokens, or service-role keys.

## C. Configure MFA in admin

1. Ensure admin `.env` points at:
   - `VITE_SUPABASE_URL=https://prbgsnxpwyepdggdysnt.supabase.co`
   - anon/publishable key for that project only
2. Start admin: `npm run admin:dev` → http://localhost:5174/admin/
3. Sign in with the Owner email/password.
4. You will be redirected to `/admin/mfa` because `mfa_required = true`.
5. Scan the TOTP QR (or enter secret) in your authenticator app.
6. Verify a code → AAL2 session → dashboard.

If login works but every nav item is empty, the owner grant did not apply — re-check `role_grants` for that profile.

## E. Set Owner password without recovery email

Use when Supabase returns `email rate limit exceeded`.

1. Dashboard → **okanggroup-platform** → **Project Settings → API** → copy **service_role** (do not paste into Cursor chat).
2. In a local terminal (not the AI chat):

```powershell
cd C:\Users\edwar\Documents\Projects\OKANGGROUP
node scripts/set-owner-password.mjs
```

3. When prompted, paste the service_role key, then enter/confirm the new password.
4. Expected success line: `Password updated for okanggroup@gmail.com (Owner).`
5. Sign in at http://localhost:5174/admin/login and complete MFA.

The script only updates Auth user `a7bce15a-566a-43df-aa93-4f23da8bb35f` on `prbgsnxpwyepdggdysnt`. It does not create users, change Owner role grants, or touch other projects. It does not print the password or service-role key.

## D. Supabase CLI as `okanggroup@gmail.com` (optional, non-blocking)

CLI login is **global** on this machine. Do **not** unlink or modify the PJ Marketplace project (`wyvcomvzngwwykswmvna`).

Preferred approach (keeps other projects untouched):

1. Dashboard (okanggroup@gmail.com) → **Account → Access Tokens** → create a token for CLI use.
2. In a shell used only for OkangGroup work:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<token-from-okanggroup-account>"
cd C:\Users\edwar\Documents\Projects\OKANGGROUP
npm run supabase:assert
npx supabase link --project-ref prbgsnxpwyepdggdysnt
```

3. Never pass `--project-ref wyvcomvzngwwykswmvna` from this repo.
4. When finished with OkangGroup CLI work, clear the token from that shell session (`Remove-Item Env:SUPABASE_ACCESS_TOKEN`).

Remote DDL for R1 may continue via workspace MCP if CLI link is deferred.
