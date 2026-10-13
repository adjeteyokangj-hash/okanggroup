# OkangGroup — Release 1 Build Status

| Field | Value |
| --- | --- |
| Authorisation | **Complete Release 1 build authorised** 2026-10-11 |
| Design baseline | V2.1.9 + frozen acceptance criteria (Option A) |
| Supabase target | `prbgsnxpwyepdggdysnt` / `okanggroup-platform` only |
| Public website deploy | **HOLD** — separate Owner approval required |
| Document version | **1.4.0** |

---

## Migration reconciliation (V2.1.9 §10.1.1) — 2026-10-11

Frozen R1 order: `M0 → M1 → M2 → M3 → M4 → M6 → M8 → M9 → M14 (core) → M15 (minimal)`.  
**Not in R1:** M5 (finance/commercial), M7 (client CMS registry), M10–M13.

| Applied remote name | Maps to V2.1.9 | In R1 scope? |
| --- | --- | --- |
| m0_extensions_private | M0 | Yes |
| m1_identity | M1 | Yes |
| m2a_rbac_tables_seeds + m2b_rbac_helpers_rls | M2 (split for apply safety) | Yes |
| m3_organisation | M3 | Yes |
| m4_clients | M4 | Yes |
| m6_projects | M6 (no `contract_id`) | Yes |
| m8_company_cms | M8 | Yes |
| m9_operations | M9 (no `cms_instance_id`) | Yes |
| m14_audit | M14 **core** only (`audit_events`, `security_incidents`) — retention/purge tables deferred (OD-04 open) | Yes |
| m15_lookups_workflows | M15 **minimal** (`lookup_values`, `workflow_definitions`, `settings`) | Yes |
| m16_security_hardening | M16 hardening (privileges / search_path / DEFINER exposure) | Yes |
| m17_permission_rpcs | Post-M16 admin RBAC RPCs (no new domain tables) | Yes — support only |
| m18_profiles_staff_manage_policy | Post-M16 RLS policy for staff management | Yes — support only |
| m19_privileged_mfa_hardgate | Owner/platform_admin MFA cannot be cleared; `session_requires_mfa` RPC | Yes — security |

**Out-of-scope schema check (live DB):** finance/external-CMS table count = **0**.  
Columns `contract_id`, `cms_instance_id`, `invoice_id` = **absent**.  
No `contracts`, `invoices`, `cms_instances`, payments, tickets, or notifications tables.

**Verdict:** Numbering M16–M18 is post-tranche hardening/support, not R2/R3 product schema. No unauthorised finance or external CMS schema detected. Further DB changes should stay within this reconciled boundary until Owner expands scope.

---

## Progress

| Workstream | Status |
| --- | --- |
| R1 SQL migrations M0–M15 | **Applied** on `prbgsnxpwyepdggdysnt` |
| M16 security hardening | **Applied** |
| M17 permission RPCs | **Applied** (`has_permission`, `my_permission_codes`) — intentional authenticated DEFINER |
| M18 profiles staff-manage policy | **Applied** |
| Admin app build | **Pass** — `npm run build` in `admin/` succeeds |
| Auth + MFA gate | **Implemented** — login, TOTP enroll/verify, AAL2 gate, `mfa_enforced_at` |
| RBAC in admin UI | **Implemented** — permission-gated nav + routes + mutation controls |
| Staff / clients / projects / tasks | **Implemented** (R1 scope) |
| Company CMS + publish path | **Implemented** — approve records event; `npm run cms:export` builds local artefact; **no prod deploy** |
| Security advisors | **Pass with intentional WARN** on permission RPCs (required for admin) |
| Owner bootstrap | **Ready for Owner** — script reviewed/hardened; steps in `supabase/scripts/OWNER_SETUP.md` |
| Supabase CLI remote link | **Non-blocking** — use OkangGroup access token via `SUPABASE_ACCESS_TOKEN` (see OWNER_SETUP.md §D). Do not unlink PJ Marketplace. |
| Production Vite deploy | **Not authorised** |

---

## Target controls

| Control | Detail |
| --- | --- |
| Config pin | `supabase/config.toml` `project_id = prbgsnxpwyepdggdysnt` |
| Assert script | `npm run supabase:assert` |
| Temp ref file | `supabase/.temp/project-ref` |
| Write path | Workspace MCP `project-0-OKANGGROUP-supabase` |

---

## Acceptance checklist (R1)

| # | Check | Result |
| --- | --- | --- |
| 1 | Migrations only on OkangGroup project | Pass (MCP) |
| 2 | All public tables RLS + FORCE | Pass |
| 3 | Anon cannot SELECT/TRUNCATE business tables | Pass |
| 4 | Admin production build | Pass |
| 5 | MFA gate for `mfa_required` profiles | Pass (code) |
| 6 | Permission-gated admin surfaces | Pass (code) |
| 7 | CMS export without public deploy | Pass (script refuses `CMS_PUBLISH_DEPLOY=1`) |
| 8 | Owner can sign in with MFA end-to-end | Pending Owner bootstrap |
| 9 | CLI usable for OkangGroup without touching PJ Marketplace | Guided (access token); optional |

---

## Safeguards in force

- No M5/M7 finance/client-CMS product.  
- Continuous R1 implementation; report blockers, do not re-ask per feature.  
- Public website untouched until separate Owner deploy approval.  
- PJ Marketplace / StarLiz not modified.

**End of build status 1.3.0**
