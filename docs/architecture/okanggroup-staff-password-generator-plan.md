# OkangGroup — Staff Temporary Password Generator (Technical Plan)

| Field | Value |
| --- | --- |
| Status | **Implemented — awaiting Owner local UAT** |
| Date | 2026-10-12 |
| Target | `prbgsnxpwyepdggdysnt` |
| Keeps | Email **Send Account Setup** (unchanged) |
| Adds | **Generate Temporary Password** (+ recommended Owner reset) |

---

## 1. Current state (reviewed)

| Piece | Behaviour today |
| --- | --- |
| Create Staff | Auth user via `createUser` (random internal password, `email_confirm: false`). Profile `pending_setup`. Grants stored; **unusable** until `account_status = active`. |
| Send Account Setup | Email invite/recovery → staff sets password → `accept_staff_invitation` → login active → MFA if required. |
| Login | Existing `/admin/` Login page (`signInWithPassword`). |
| Passwords | Only in Supabase Auth (hashed). Not in `profiles` / invitations / audit. |
| Gap | Owner cannot generate a visible temporary password or force first-login change from Staff UI. |

Daniel/David with **Setup pending** cannot log in until Account Setup (or the new temporary-password path) completes.

---

## 2. Design goals

1. Keep **Method A — Send Account Setup Email**.  
2. Add **Method B — Generate Temporary Password** on Staff detail → **Account Credentials**.  
3. Password only ever written via **Supabase Auth Admin API** (service role, Edge Function).  
4. Show plaintext **once** in the Owner browser; Copy button; never persist in OkangGroup tables, audit, or logs.  
5. **Server-enforced** “must change password” + MFA before normal app/API use.  
6. Suspended/offboarded accounts cannot receive a usable temporary password.  
7. Owner MFA / 21 permissions / RLS scopes unchanged.

---

## 3. Recommended Auth mechanism (Supabase)

Supabase does **not** expose a first-party “temporary password” product flag. The secure pattern is:

1. **Edge Function** (service role): `auth.admin.updateUserById(id, { password, email_confirm: true, app_metadata: { …, must_change_password: true } })`.  
2. Flag lives in **`app_metadata`** (admin-only; **not** `user_metadata`, which users can edit).  
3. Mirror a boolean on `profiles.must_change_password` for Postgres RLS/RPC (JWT `app_metadata` can lag until refresh).  
4. Staff never reads/writes `app_metadata` themselves. Clearing the flag is **admin-only** after a successful forced change.

Password strength: generate in Edge (CSPRNG, ≥16 chars, mixed classes). Do not log the value (Edge response body to Owner only; no `console.log`).

---

## 4. Login & activation flow (Method B)

```text
Owner opens Staff detail → Account Credentials
  → Generate Temporary Password
  → Edge checks: org.staff.manage/invite; not Owner target; not offboarded/suspended
  → Auth: set password + email_confirm + app_metadata.must_change_password=true
  → profiles: must_change_password=true; account_status → active (login allowed)
  → Response: { temporary_password } once (no DB write of plaintext)
Owner copies password and gives it out-of-band (secure channel)

Staff → /admin/ login (existing page) with email + temporary password
  → Session OK
  → Gate: must_change_password → /force-change-password (only allowed route besides MFA enrol if required after)
  → Staff chooses new password
  → Edge complete_forced_password_change: admin sets new password + clears must_change_password (app_metadata + profiles) in one call
  → If mfa_required / privileged → existing /mfa flow (session_requires_mfa)
  → Normal dashboard with RLS-scoped clients/projects/tasks
```

**Where David logs in:** the existing OkangGroup admin login (`http://localhost:5174/admin/` in UAT). After activation he only sees clients/projects/tasks allowed by his grants (already RLS-backed).

### Why activate login before password change?

So Method B matches “log in with temporary password, then change.”  
Data APIs stay blocked while `must_change_password` is true (see §5), so activation does not equal full access.

Method A (email) can keep today’s `pending_setup` → accept → active path.

---

## 5. Backend enforcement (not UI-only)

| Control | Mechanism |
| --- | --- |
| No app shell / data menus | `Protected`: if `must_change_password` → only `/force-change-password` (+ `/mfa` after password cleared if needed). |
| No usable permissions via API | Extend `private.has_permission`, `has_permission_on_client`, `my_permission_codes` to require `profiles.must_change_password = false` (in addition to `account_status = active`). |
| Flag not user-clearable | `app_metadata` + profile column; profile self-update trigger already blocks privileged field changes; extend to block self-clear of `must_change_password`. |
| Clear only with password set | Edge `complete_forced_password_change` uses **one** `updateUserById({ password, app_metadata: { must_change_password: false } })` so flag cannot clear without password write. |
| Suspend / offboard | Existing ban + `account_status`; generate-password action refuses suspended/offboarded; suspended users cannot use permissions even if old session exists (status check). |
| No password in audit | Log only: `temporary_password_issued` / `forced_password_change_completed` (actor, target id, timestamp) — **never** the secret. |

---

## 6. UI (Staff detail — Account Credentials)

```
Account Credentials
Login email: <staff email>   Login status: Setup pending | Active | Suspended | …

Password setup method:
  ○ Send secure setup email          [Send Account Setup] / [Resend Setup]
  ○ Generate temporary password      [Generate Password]

When Generate selected and button pressed:
  • Show password once in a read-only field + [Copy]
  • Checkbox default ON: Require password change on first login (always enforced server-side for Method B; checkbox documents policy)
  • Warning: “This password will not be shown again.”
  • Never offer “Show existing password” / retrieve
```

Permissions: `org.staff.invite` or `org.staff.manage` (same as setup email). Cannot target Owner / privileged self-escalation.

---

## 7. Owner password reset (recommendation: **Yes**)

**Yes — Owner should reset staff passwords from Staff Management without opening Supabase.**

Reuse the same Edge action:

| Action | Behaviour |
| --- | --- |
| Generate Temporary Password (again) | Overwrites Auth password; sets `must_change_password`; shows once. |
| Send password reset email | Existing Auth recovery / current Send Account Setup recovery path. |

Do **not** add “set any password the Owner types” unless separately approved (increases weak-password and shoulder-surfing risk). Prefer generate-only + optional email reset.

Login page already has **Forgot password** for self-service; Owner reset covers locked-out staff when email is slow or unavailable.

---

## 8. Delivery slices (after approval)

| Slice | Work | Exit |
| --- | --- | --- |
| P0 | Schema: `profiles.must_change_password`; permission predicates; self-clear block | SQL verify Owner still 21 perms / MFA |
| P1 | Edge: `generate_temp_password`, `complete_forced_password_change` | No password in logs/DB |
| P2 | UI: Account Credentials + force-change page + Protected gate | Build pass |
| P3 | Local UAT with disposable staff (not David) | UAT report → Owner approve real use |

**No production website deploy** without separate approval. No David invite unless Owner authorises.

---

## 9. Explicit non-goals

- Storing or re-displaying passwords in OkangGroup DB  
- Replacing email setup  
- Letting staff clear `must_change_password` via client `updateUser`  
- Changing Owner MFA hard-gate  

---

## 10. Decisions for Owner

| # | Decision | Recommendation | Outcome |
| --- | --- | --- | --- |
| D1 | Support both email setup and temporary password? | **Yes** | Approved |
| D2 | Owner can reset staff password (generate again / email)? | **Yes** | Approved |
| D3 | Authorise implementation after this plan? | **APPROVED — implement staff password generator** | Implemented |

---

## 11. Implementation status (2026-10-12)

| Check | Result |
| --- | --- |
| M23 migration (`must_change_password`, permission gates, `mark_staff_temp_password_issued`) | Applied |
| Edge `invite-staff` | **v4 ACTIVE** — `generate_temp_password` + `complete_forced_password_change` |
| Admin UI | Account Credentials + `/force-change-password` + Protected gate |
| Owner security | 21 permissions, MFA required, `must_change_password=false` |

### Local UAT (disposable staff — not David)

1. Staff detail → **Account Credentials** → Generate Temporary Password → copy once.
2. Sign out → login as that staff with email + temp password → forced to `/force-change-password`.
3. Set new password (≥12) → if MFA required, complete `/mfa` → dashboard with scoped data only.
4. Confirm plaintext password is not in DB/audit; regenerating overwrites Auth and re-sets the force-change flag.
5. Email **Send Account Setup** still works on a second disposable account.

**No production website deploy. No David invite until separately authorised. Stage 2 HOLD.**

**End of plan**
