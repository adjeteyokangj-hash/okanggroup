# OkangGroup — Direct Staff Creation Workflow UAT Report

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Change | Invitation-first → **Create Staff** then optional **Send Account Setup** |
| Project | `prbgsnxpwyepdggdysnt` |
| Public website deploy | HOLD |
| Real staff (David, etc.) | Not invited |
| **Owner acceptance** | **APPROVED — PASS / FROZEN** (2026-10-12) |

---

## Workflow (implemented)

1. **Create Staff** — saves profile, employment, membership, role/scope grants. **No email.**
2. Person appears in Staff Directory with Employment status + Login = Setup pending.
3. **Send Account Setup** (from staff detail) — emails secure password link when Owner is ready.
4. Staff sets their own password → login activates → grants become usable.
5. **Departments & Job Titles** managed at Staff → Settings (Owner-editable).

**Status split**

| Field | Meaning |
| --- | --- |
| `employment_status` | Active / Inactive (directory employment) |
| `account_status` | `pending_setup` / `active` / `suspended` / `offboarded` (login) |

Grants may exist while `pending_setup`, but `has_permission*` requires `account_status = 'active'`, so they cannot be used before activation.

---

## Verification evidence

| Check | Result |
| --- | --- |
| Owner permissions | **21** |
| Owner MFA | Required / login active |
| `employment_status` column | Present |
| RPC `finalize_staff_record` | Present |
| Edge Function `invite-staff` | **ACTIVE v5** (create_staff / send_setup / verify / temp password) |
| Admin `npm run build` | Pass |
| Migration file | `supabase/migrations/20261012051749_m22_direct_staff_creation.sql` |

### Bug fix — “Staff profile not found” on Daniel detail (2026-10-12)

| Item | Detail |
| --- | --- |
| Symptom | Staff detail showed Daniel’s profile **and** red **Staff profile not found** |
| Root cause | M16 `REVOKE ALL … FROM PUBLIC` removed Data API privileges `service_role` relied on. Edge `admin.from('profiles')` returned empty/denied; handler mapped that to HTTP 404 `Staff profile not found`. Client profile load used Owner JWT (still worked) → inconsistent UI. |
| Daniel record | Kept — profile `928646aa-…`, Auth linked, **2** active grants, `pending_setup` |
| Fix | M24 restore `service_role` SELECT/DML; Edge v5 accurate errors + `verify_staff_account`; UI blocks generate when verify fails |
| Regression | `supabase/tests/m24_staff_pending_setup_regression.sql` — PASS |
| Owner security after fix | 21 perms, MFA required |

### Bug fix — temporary password not displayed (2026-10-12)

| Item | Detail |
| --- | --- |
| Symptom | Generate Password activated Daniel (Login active + must change) but **no password shown** |
| Root cause | Frontend set `oneTimePassword` then called `load()`, which always ran `setOneTimePassword(null)` and wiped it from memory |
| Edge / Auth | Working — HTTP 200; Auth password applied; plaintext returned once in the response |
| Fix | `load({ clearOneTimePassword: false })` after generate; confirmation panel with Copy + Close; busy lock while generating |
| Regression | `npm run test:temp-password` — PASS; admin build — PASS |
| Daniel | Roles/grants unchanged (2); Owner 21 perms + MFA intact |
| Owner action | Hard-refresh admin → Generate **once** → copy from panel → test Daniel login |

### Bug fix — MFA enrolment lifecycle (2026-10-12)

| Item | Detail |
| --- | --- |
| Symptom A | Friendly name `OkangGroup Admin` already exists |
| Symptom B | **Factor not found** + auto message that incomplete setup was cleared / new QR |
| Root cause | Enrolment used a hardcoded Admin label; then auto-restart on every remount (incl. React Strict Mode) deleted the factor the user had just scanned |
| Fix | Stable resume of unverified factors; QR + **manual setup key**; explicit **Restart MFA Setup** only; in-memory enroll dedupe; verify factor exists before challenge |
| Daniel | Exposed unverified factors cleared once; grants unchanged (2) |
| Owner | Verified MFA **untouched**; 21 permissions |
| Regression | `npm run test:mfa` — PASS; admin build — PASS |
| Next UAT | Hard-refresh → Daniel MFA → leave page open → scan QR **or** paste setup key → verify → dashboard. Refresh must **not** change the factor unless Restart is clicked. |

### Security check — Daniel AAL2 session wording + least privilege (2026-10-12)

| Item | Result |
| --- | --- |
| Dashboard banner | Was hardcoded “Owner session MFA verified”; now **“MFA verified (AAL2).”** (copy only — not a privilege grant) |
| Daniel roles | `staff` active on project `OKG-PR-000001`; `cms_editor` **revoked** |
| Daniel permissions (4) | `dashboard.read`, `tasks.read`, `tasks.manage`, `company_cms.read` |
| Owner / platform_admin role on Daniel | **No** |
| Owner | **21** permissions; MFA verified factor intact |

### Final negative-access UAT — CMS + project scope (2026-10-12)

| Test | Result |
| --- | --- |
| Retain Staff role (incl. `company_cms.read`) | **APPROVED** — no role-definition change |
| CMS Editor grant restored | **No** — remains revoked |
| Frontend: Create / Edit / Publish | Gated on `company_cms.edit` / `company_cms.publish` — Daniel lacks both |
| API: `INSERT cms_pages` as Daniel | **DENIED** (RLS) |
| API: `INSERT cms_publish_events` as Daniel | **DENIED** (RLS) |
| API: CMS read via `has_permission('company_cms.*')` | Platform-scope check → **false** for project-scoped Staff (empty CMS data under RLS) |
| Tasks on assigned client | `has_permission_on_client(tasks.*)` → **true**; 2 tasks visible |
| Tasks on unknown client | **false** |
| Clients / Projects tables as Daniel | **0** rows (no `clients.read` / `projects.read`) |
| Staff directory profiles | Self only (1), not full staff list |
| Owner MFA + 21 perms after UAT | **Intact** |
| Production deploy | **Not performed** |

---

## Owner local UAT checklist

1. `cd admin && npm run dev` → Staff.
2. **Departments & Job Titles** → add e.g. Software Development + Senior Developer.
3. **Create Staff** with a disposable email you control — confirm directory row, no email received.
4. Open staff → confirm Employment vs Login columns; grants listed.
5. **Send Account Setup** → set password via link → confirm login works with scoped access only.
6. Suspend → confirm access removed; history retained.
7. Confirm Owner MFA / full permissions unchanged.

Do not create David or production staff until you approve.

---

## Owner acceptance — Stage 1 security UAT (2026-10-12)

**Status: PASS / FROZEN**

| Security requirement | Result |
| --- | --- |
| Daniel MFA (AAL2) | PASS |
| Staff role active | PASS |
| CMS Editor revoked | PASS |
| Four effective permissions | PASS |
| Unauthorised CMS create / edit / publish | DENIED |
| Cross-client task access | DENIED |
| Staff profile restrictions | PASS |
| Owner 21 permissions + MFA | PRESERVED |
| Production deployment | Not authorised |

### Frozen configuration (do not change without separate Owner approval)

- Daniel Mensah (`928646aa-…`): active `staff` on project `OKG-PR-000001` / client `OKG-CL-000002`; `cms_editor` remains **revoked**
- Effective codes: `dashboard.read`, `tasks.read`, `tasks.manage`, `company_cms.read`
- Owner: 21 permissions, mandatory MFA, verified authenticator intact
- Role definitions, RLS, and backend permission predicates: **frozen** as tested
- No per-user permission toggles, no Stage 2 implementation, no production website deploy until separately approved

**Next (planning only):** Stage 2 proposal — Owner-controlled individual staff permissions / module visibility / scoped access. See `okanggroup-r1-stage2-staff-access-management-proposal.md`.

### Open security defect (post-acceptance)

| Item | Detail |
| --- | --- |
| Defect | Staff role `tasks.manage` allows full-row task redefinition + `done` without approval |
| Severity | HIGH — access-control design defect |
| Review | `okanggroup-r1-task-execution-vs-manage-security-review.md` — **Owner accepted** |
| Corrective release | M25 applied (dev); UAT: `okanggroup-r1-task-access-corrective-release-uat.md` |
| Stage 1 baseline | Remains **PASS / FROZEN**; Stage 1.1 corrective work ready for Owner accept |
| Production | HOLD until Owner release decision |

---

**End of report**
