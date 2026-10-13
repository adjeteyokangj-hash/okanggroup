# OkangGroup R1 — Stage 1 Staff Onboarding UAT Report

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Project | `prbgsnxpwyepdggdysnt` |
| Stage | **1 — Staff Onboarding and Access Control** |
| Stage 2 | HOLD |
| Real staff invites (David, etc.) | **Not sent** |
| Production website deploy | **Not requested / HOLD** |

---

## 1. Delivered

| Area | Status |
| --- | --- |
| M21 schema (`employment_type`, `invite_payload`, `send_status`, …) | Applied |
| RPCs: `accept_staff_invitation`, `set_staff_account_status`, `ensure_access_scope`, `revoke_staff_invitation` | Applied |
| Edge Function `invite-staff` (JWT + permission checks, service role for Auth only) | Deployed ACTIVE v1 |
| Admin **Create Staff** UI (employee/contractor/freelancer, grants, draft/send) | Built |
| Staff detail (edit, grants, suspend/offboard/reactivate) | Built |
| Activate + password-set accept path | Built |
| Admin production build (`npm run build`) | Pass |

---

## 2. Automated verification results

| Check | Result |
| --- | --- |
| Owner permission count | **21** (unchanged) |
| Owner `mfa_required` | **true** |
| Owner platform `owner` grant | **1 active** |
| Privileged MFA clear trigger | Present |
| Self-escalation profile trigger | Present |
| Columns `employment_type`, `invite_payload`, `send_status`, `full_name`, `auth_user_id` | Present |
| Job titles seeded (Developer/Designer/PM …) | Present |
| `private.ensure_access_scope('client', …)` | Creates/returns scope |
| Draft invite with grants in payload | **0 role_grants** until accept |
| Edge Function `invite-staff` | ACTIVE, `verify_jwt=true` |
| Admin `tsc` + Vite build | Success |

Synthetic draft invite used: `uat-stage1-draft@okanggroup.test` (revoked after verification).  
Failed-send fixture: `uat-stage1-failed@okanggroup.test` (`send_status=failed`) — accept path refuses activation by design.

Security advisor notes SECURITY DEFINER RPCs are callable by `authenticated` (expected; each checks auth + permissions internally). Pre-existing code-gen search_path warnings unchanged.

---

## 3. Owner manual UAT checklist (local admin)

Use `http://localhost:5174/admin/` as Owner. **Do not invite David or real staff yet.**

1. Open **Staff** → confirm **Create Staff** form (not invitation-only).
2. **Save draft** for a disposable address you control (optional) — confirm no Auth user if draft-only.
3. Create & send invite only to a **throwaway mailbox you own** (not David).
4. Open invite email → set password on `/admin/reset-password` → confirm activation.
5. Confirm scoped grants: staff sees only authorised client/project data (RLS).
6. From Staff detail: add/revoke a client-scoped grant.
7. Suspend → confirm login blocked / grants revoked; task history retained.
8. Confirm Owner still has full access + MFA hard-gate.

---

## 4. Security controls (Stage 1)

- Grants apply only from `invitations.invite_payload` via `accept_staff_invitation` — not from Auth `user_metadata`.
- `send_status = failed` blocks accept.
- Incomplete/draft invites create **no** `role_grants` until successful accept.
- Staff cannot self-grant (`role_grants` policy) or self-change status/MFA/employment.
- Owner cannot be suspended/offboarded via RPC.
- Suspend/offboard revokes grants; history retained; Auth ban via Edge Function.
- Service role stays in Edge Function only.

---

## 5. Production approval request

Stage 1 code and migrations are on the OkangGroup platform project for Owner local UAT.

**Not requesting** production website deploy.  
**Not inviting** real staff until Owner completes the checklist above and replies:

> **APPROVED — Stage 1 UAT passed; authorise real staff invites**

Stage 2 (Staff Workspace) remains **HOLD**.

---

**End of report**
