# OkangGroup — Development Readiness and Cost Plan

| Field | Value |
| --- | --- |
| Status | **DOCUMENTATION ONLY — DR-01–DR-07 APPROVED — R1 DESIGN INTENT FROZEN (Option A) — CODING HOLD** |
| Document version | **1.1.3** |
| Based on | Database **V2.1.8A**; Workflows **V2.2.2**; CMS integrations **V2.3.1** |
| Does not modify | Those three accepted baselines (or the production Vite site) |
| DR-01–DR-07 | **Owner-approved** 2026-10-11 — establishes direction only; **DR-06 verified PASS** |
| Release 1 design intent | **Frozen** (Option A, 2026-10-11) on V2.1.9 + eight acceptance criteria — see Release 1 checklist 1.2.0 |
| Coding / migrations / deploy | **HOLD** — Option A does **not** authorise implementation |
| Full architecture freeze | **Not authorised** |

---

## 1. Purpose

Stop expanding architecture versions for now. Use the three accepted baselines to answer:

1. What is the **smallest affordable release** that makes OkangGroup operational?  
2. What must exist first (dependencies)?  
3. What can wait?  
4. What existing infrastructure can we reuse?  
5. What will drive **recurring** cost?  
6. Which proposed database amendments belong in release 1 vs later?

This is a planning report for Owner review — not a fourth architecture contract and not an implementation plan with dates or vendor quotes.

---

## 2. Architecture inventory (do not expand further yet)

| Baseline | Role | Status |
| --- | --- | --- |
| V2.1.8A | Database, RLS intent, Free-tier constraints, migration order | Accepted technical baseline; **not frozen** |
| V2.2.2 | Workflows, staff, permissions, dashboards | Accepted working baseline; **not frozen** |
| V2.3.1 | Client CMS integration security contracts | Accepted integration baseline; **not frozen** |

**Outstanding blockers (outside this report’s authority):**

| Item | Impact on build |
| --- | --- |
| OD-04 retention | Blocks lawful purge automation; does **not** block building core ops if retain-by-default holds |
| Supabase MCP / correct project auth (`prbgsnxpwyepdggdysnt`) | **Resolved (DR-06 PASS)** — workspace MCP connected; still does **not** authorise migrations/coding |
| C3-01–C3-05 client pilot decisions | Blocks Release 3 only |
| C3-06 token TTL / revocation SLA confirmation | Must be **tested** in pilot; 15-minute TTL alone does **not** guarantee 60-second revoke — external enforce or gateway-controlled access required (V2.3.1) |
| Owner freeze + coding authorisation | Nothing ships without these |

---

## 3. Recommended delivery sequence (cost-aware)

Aligned with the Owner’s three-release recommendation and with V2.1 migration/phase mapping and OD-13 (company CMS before client CMS).

### Release 1 — OkangGroup’s own operations (minimum viable platform)

**Goal:** A usable internal platform for the Owner and early staff — without client CMS integration complexity.

| Include | Why it is “minimum useful” |
| --- | --- |
| Secure login (Supabase Auth) + MFA for privileged accounts | OD-11; no safe admin without this |
| Owner / Platform Admin entry (scoped dashboard MVP) | Assigned tasks, approvals, overdue, workload — V2.2.2 UD-06 subset |
| Identity: profiles, invitations (Owner/Platform Admin only) | Staff onboarding without over-grant (PA-06 if inviting with scopes) |
| RBAC + scopes (platform / department / team / client / project / cms_instance) | V2.1 foundation; dual delegation rules as **app logic** (PA-04) |
| Org: departments, teams, staff memberships | Placement without fake privilege ladder |
| Client register (directory + memberships) | Know who the clients are |
| Projects + tasks + assignments + basic approvals | Day-to-day work |
| **Company CMS only** (Domain 7: pages, sections, media refs, revisions, approve → publish) | OD-13 Pilot 1; see §3.1 publish path to existing Vite site |
| Audit events (append-only) for privileged actions | Non-negotiable accountability |
| Configuration / lookups / workflow definitions (minimal seeds) | Avoid hard-coding statuses |

| Explicitly out of Release 1 |
| --- |
| External client CMS gateway, adapters, Pilot 2 |
| Full finance (invoices, subscriptions, credits, refunds) |
| Advanced availability board / escalation widgets (post-MVP dashboard) |
| Hybrid CMS mode |
| Monitoring fleet / multi-site probes |
| Full support desk productisation (basic internal notes optional) |
| Retention purge automation (OD-04 still open) |
| New third-party SaaS beyond current stack |
| Rewriting the public site’s design, navigation, or framework |

**Fixed scope rule:** Once the Owner locks Release 1, do **not** add features during development unless they fix a genuine defect or security issue. Scope changes require an explicit Owner decision — not ad-hoc expansion.

**Release 1 success test:** Owner can sign in with MFA, manage a small staff set, maintain client/project/task records, approve company CMS content, and complete a **controlled publish** that updates the **existing** Vite public website — with rollback available so a failed publish does not take the public site offline (OD-14 A).

### 3.1 Company CMS → existing Vite website (Release 1 requirement)

Admin save alone is **not** enough. Release 1 must define a low-cost path:

```text
Company CMS (draft) → Approval → Controlled publishing process → Existing Vite website
```

| Requirement | Detail |
| --- | --- |
| Preserve public site | Keep current website design, navigation, and functionality; no React/Next rewrite (OD-14 A) |
| Controlled publish | Only **approved** content enters the publish process |
| Public availability | A failed publish must not take the marketing site offline |
| Rollback | Retain prior published artefact/version so operators can restore the last good public content quickly |
| Mechanism choice | Exact technique (e.g. generate static content into the Vite tree, content JSON consumed at build, or equivalent) is chosen in **Release 1 implementation planning** — **not** a new architecture version |

This closes the gap between “CMS stores rows” and “visitors see updates on okanggroup.com”.

### Release 2 — Business management

| Include | Notes |
| --- | --- |
| Quotations, contracts, subscriptions, invoices, payments (manual) | Commercial Domain 9–10 |
| Credit/refund / financial exception approvals with identity SoD | UD-04 / PA-05 — rules, not new SoD tables |
| Richer staff management + availability (PA-01) | Supports assignment policy UD-01 |
| Dashboard: availability + escalations | V2.2.2 post-MVP widgets |
| Support tickets (client-visible split) | If commercially needed |
| Notification basics | Email via existing domain path when OD-15 ready |

### Release 3 — Client CMS integrations

| Include | Notes |
| --- | --- |
| One authorised client only (C3-01 after contract) | Do not assume Treasure House / NiiNai |
| Integration gateway + client adapter (C3-05 recommendation) | V2.3.1 |
| Module scopes (PA-03), capability withhold, short-lived tokens, revoke SLA tests | C-A–C-D must be **proven**, not only documented |
| Correlation ids, idempotency store (PA-I01–I02) | Required for safe mutate/retry |
| Reuse framework for further clients only after Pilot 2 passes | Avoid N parallel custom builds |

---

## 4. Minimum viable release — dependency chain

Nothing in Release 1 should start until the Owner authorises coding **and** the following are true or explicitly waived:

```text
Supabase project access (prbgsnxpwyepdggdysnt)
        → M0–M2 identity + RBAC + private helpers
        → M3 org + M4 clients
        → M6 projects (+ M9 tasks/approvals)
        → M8 company CMS + publish workflow
        → M14 audit (minimal) + M15 lookups/workflows (seeds)
        → Admin app shell (same-domain routing per OD-14 A)
        → MFA-enforced Owner path
```

Release 1 **skips** M5/M10 (finance), M7 external CMS registry beyond any stub if unused, M11–M13 productisation, and client integration work. M7 registry may wait until Release 3 unless a thin client↔CMS link is needed earlier for directory-only metadata (prefer wait).

| Dependency | Release 1 | Release 2 | Release 3 |
| --- | --- | --- | --- |
| Correct Supabase project + Auth | Required | Required | Required |
| V2.1 migrations M0–M4, M6, M8, M9 (+ audit/config seeds) | Required | + M5/M10 etc. | + M7 + PA-I* |
| OD-04 verified durations | Defer purge only | Prefer before finance archive rules | Prefer before client data delete |
| PA-01 availability schema | Defer | Required for full policy | Nice |
| PA-03 module scopes | Defer | Defer | **Required** |
| PA-06 invitation grant payload | Required if scoped invites in R1; else minimal `role_ids` only with Owner-issued invites | Required | Required |
| PA-I01–I04 | Defer | Defer | **Required** (I01–I02 hard; I03–I04 strongly recommended) |
| C3-01–C3-05 | N/A | N/A | **Required** |
| External CMS revoke/enforce proof | N/A | N/A | **Required** (pilot test) |

---

## 5. Features to defer (save money / risk)

| Defer | Until | Reason |
| --- | --- | --- |
| Client CMS integrations | Release 3 | Highest custom-engineering cost; needs Pilot 1 first |
| Hybrid management mode | After Pilot 2 need proven | V2.3.1 C3-04 recommendation |
| Full Configuration Studio UI | After core screens work | Seeds + limited settings first |
| Materialised workload views | If ever | Queries on `task_assignments` enough (PA-02) |
| Multi-client monitoring / frequent Edge probes | Later / paid tier | Free-tier exhaustion risk (V2.1 §9) |
| Magic-link as primary invite | Optional later | OD-12 A email + password first |
| React rewrite of public marketing site | Never required by contract | Vite + Vercel stays (OD-14 A) |
| Auto billing kill-switch for public sites | Never | Business rule A |
| Retention purge jobs | After OD-04 | Legal risk if guessed |
| Per-grant `may_redelegate` column | Optional forever | PA-04 = permission seeds + app checks |

---

## 6. Reuse existing infrastructure (avoid new spend)

| Already have / planned | Reuse for |
| --- | --- |
| Supabase Free London project `prbgsnxpwyepdggdysnt` | Auth, Postgres, RLS, Storage paths |
| Existing Vite public site → Vercel | Marketing; do **not** rebuild |
| Same-domain admin routing (OD-14 A) | Admin app without new public brand site |
| `@okanggroup.com` email (OD-15) | Invitations/notifications when verified — avoid third-party CRM mail initially |
| V2.1 `lookup_values` / `workflow_definitions` | Statuses and stages without new microservices |
| V2.1 workload-as-query | Skip extra analytics DB |
| Company CMS in platform DB | Pilot 1 without external AuthZ project |
| GitHub review branch docs | Spec source of truth; no extra wiki SaaS |
| Manual finance (no live card processor in V2.1 default) | Avoid Stripe/etc. until Release 2 needs it |

**Avoid for Release 1:** new CMS SaaS, separate auth vendors, paid observability stacks, multi-region DBs, custom Kubernetes, rebuilding the marketing site.

---

## 7. Cost drivers — infrastructure vs development

### 7.1 Important distinction

| Category | Examples | Notes |
| --- | --- | --- |
| **Infrastructure (low if we stay disciplined)** | Supabase Free, existing Vercel Vite deploy | Reduces hosting spend; **does not** make development free |
| **Development (principal cost to control)** | Cursor usage, engineering time, rework from scope churn, permission/RLS test-fix cycles, custom client integrations (R3), future hosting upgrades when Free limits hit | Control via **fixed Release 1 scope**, incremental delivery (§9), pause architecture expansion (DR-02) |

### 7.2 Likely recurring / repeatable cost drivers

Supabase Free is the planning assumption (V2.1). Treat published Free limits as triggers — re-verify before go-live.

| Driver | Why it grows | Cost-control tactic |
| --- | --- | --- |
| Cursor / engineering time | Building, reviewing, fixing | Fixed R1 scope; small complete increments (§9); no parallel feature sprawl |
| Repeated architecture changes | Re-spec after coding starts | Pause V2.x expansion until R1 locked (DR-02) |
| Permissions test-fix | RLS and grant mistakes | Auth + RBAC slice complete before dependent screens |
| Database size | Clients, tasks, audit, CMS revisions | Storage for binaries; no client CMS content ingest in R1 |
| Auth MAU | Staff + later client users | R1 staff-heavy only |
| Storage / egress | Company CMS media | Compress; no heavy proxy; public site on Vercel |
| Edge Functions / cron | Probes, later dunning | Minimal on Free |
| Email | Invites, later invoices | Low-volume transactional only |
| Custom client integrations | Release 3 adapters | One pilot only; withhold if AuthZ weak |
| Paid Supabase / Vercel upgrade | Free ceilings | Defer until metrics justify |
| Legal / OD-04 | Advisor time | Retain-by-default in R1; no automated purge |

**Token TTL note (R3):** A 15-minute token does not deliver a 60-second revoke by itself. Budget pilot test time for gateway re-check + external invalidation.

---

## 8. Proposed database amendments — phase classification

Sources: V2.2.2 §19, V2.3.1 §18. **None are applied to V2.1.8A by this report.**

### 8.1 Needed for Release 1 (or with first scoped staff invites)

| ID | Item | Release 1 stance |
| --- | --- | --- |
| PA-06 | Exact invitation roles **and** scopes/modules payload | **Include** if Release 1 invites staff with anything beyond a single global role; otherwise Owner-only manual grants and add PA-06 before wider invites |
| PA-07 | MFA gate | **No schema change** — use existing `mfa_required` / Auth (implementation) |
| PA-04 | Dual delegation | **No schema change** — permission seeds + app |
| PA-02 | Workload widgets | **No schema change** — queries |
| PA-05 | Finance SoD | **Defer** with finance to Release 2 (rules on existing `approvals`) |

### 8.2 Release 2

| ID | Item | Stance |
| --- | --- | --- |
| PA-01 | Staff availability status + busy override | **Include** for UD-01 policy |
| PA-05 | Identity SoD for finance artefacts | **Include** as enforcement (existing tables) |

### 8.3 Release 3 (client CMS) — do not build early

| ID | Item | Stance |
| --- | --- | --- |
| PA-03 | Module-specific grant scopes | **Required before** external/hybrid module enforcement |
| PA-I01 | Correlation id on integration audit | **Required** |
| PA-I02 | Idempotency key + outcome state | **Required** for mutating calls |
| PA-I03 | Connection capability assessment | **Required** (jsonb or child row) |
| PA-I04 | Revocation/invalidation log | **Strongly recommended** (may start as audit metadata) |

### 8.4 Authorised V2.1 revision timing

| When | Action |
| --- | --- |
| Before Release 1 coding | Optional thin V2.1 revision only if PA-06 (and any R1-critical fix) is approved — **do not** pull in PA-03/PA-I* early |
| Before Release 2 | Add PA-01 if not already present |
| Before Release 3 | Add PA-03 + PA-I01–I04 (and confirm C3 decisions) |

Pulling Release 3 schema into Release 1 increases migration and RLS surface area with no user value yet — avoid.

---

## 9. Release 1 delivery style — fixed scope, small increments (still HOLD)

**Do not** build all Release 1 screens at once. Keep the **overall Release 1 scope fixed**, and implement **small, complete functional sections** that can be tested before the next section depends on them.

Example order (dependency-safe):

1. Supabase project access + Auth + MFA for Owner (must be secure before anything else)  
2. M0–M2 private helpers, profiles, roles/grants — **test permissions** before staff UI depends on them  
3. M3 org + staff memberships (after authz works)  
4. M4 clients directory  
5. M6 projects + M9 tasks/assignments/approvals  
6. M14 audit (core) + M15 lookup/workflow seeds (as needed by above)  
7. Owner dashboard MVP widgets (read from secured data only)  
8. M8 company CMS draft/revise/approve  
9. **Controlled publish → existing Vite site + rollback** (§3.1)  
10. Hardening checklist (RLS on every exposed table; no Storage bucket without policies)

**Not in this list:** client CMS gateway, invoicing, hybrid mode, redesign of the public Vite site.

This is incremental **delivery**, not incremental **scope expansion**.

---

## 10. What “operational” means for cost control

OkangGroup is “operational” for Release 1 when the Owner can run **internal** delivery work and company web content without spreadsheets — not when every V2.1 table exists.

| Metric | Release 1 target |
| --- | --- |
| Paying new SaaS | Prefer **zero** beyond current Free Supabase + Vercel |
| Custom client adapters | **Zero** |
| Architecture docs churn | **Pause** unless a blocker forces an amendment |
| Schema amendments in R1 | **Minimal** (prefer PA-06 only if needed) |

---

## 11. Owner decisions (DR-01–DR-07)

**Owner instruction (2026-10-11):** “Approve DR-01 to DR-07. Keep coding on HOLD.”

| ID | Decision | Status |
| --- | --- | --- |
| DR-01 | Accept three-release sequence (ops → business → one client CMS) | **Approved** |
| DR-02 | Pause further architecture versioning until Release 1 scope locked | **Approved** |
| DR-03 | Release 1 includes company CMS (+ Vite publish path §3.1); excludes finance and external CMS | **Approved** |
| DR-04 | Add PA-06 only when scoped invitations require it | **Approved** |
| DR-05 | Keep PA-03 / PA-I* out of Release 1 | **Approved** |
| DR-06 | Resolve Supabase authentication (`okanggroup@gmail.com` / `prbgsnxpwyepdggdysnt`) before implementation | **Approved — VERIFIED PASS** 2026-10-11 via workspace MCP `project-0-OKANGGROUP-supabase` (API host `prbgsnxpwyepdggdysnt.supabase.co`; name/region per Owner connection: `okanggroup-platform` / `eu-west-2`) |
| DR-07 | Retain-by-default pending legal verification; do not activate automated purging | **Approved** |

These decisions set **development direction** only. They do **not** freeze architecture, authorise migrations, application code, or deployment. Coding remains **HOLD** until a separate Owner implementation authorisation.

---

## 12. Explicit non-goals of this document

- Modifying V2.1.8A, V2.2.2, or V2.3.1  
- Creating V2.3.2 / V2.4  
- Migrations, application code, deployments  
- Freezing architecture  
- Selecting the Pilot 2 client  
- Providing sterling/dollar quotes or contractor bids  

---

## 13. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0.0 | 2026-10-11 | Initial Development Readiness and Cost Plan for Owner review |
| 1.1.0 | 2026-10-11 | CMS→Vite publish + rollback (§3.1); engineering vs infrastructure cost; fixed scope + incremental delivery |
| 1.1.1 | 2026-10-11 | Owner approved DR-01–DR-07; coding remains HOLD |
| 1.1.2 | 2026-10-11 | DR-06 Supabase workspace MCP verification PASS; coding remains HOLD |
| 1.1.3 | 2026-10-11 | Option A: Release 1 design intent frozen; coding remains HOLD |

**End of Development Readiness and Cost Plan 1.1.3 — documentation only. R1 design intent frozen. Does not authorise coding. CODING HOLD.**
