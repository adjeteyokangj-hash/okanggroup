# OkangGroup — Release 1 Implementation Readiness Checklist

| Field | Value |
| --- | --- |
| Status | **CHECKLIST REVIEWED — CODING HOLD (Option C)** |
| Version | **1.1.1** |
| Based on | Cost Plan **1.1.2**; V2.1.8A; V2.2.2; V2.3.1 |
| Does not modify | Those baselines or the production Vite site |
| Migration approach | **P2 approved for documentation-only preparation** (2026-10-11) — see `okanggroup-v2.1-r1-dependency-amendment-p2-proposal.md` |
| Coding / SQL / migrations / deploy | **HOLD** |
| Owner decision now | **Option C** — HOLD until P2 is accepted into a V2.1 revision and R1 acceptance criteria frozen (Option A), then consider Option B |

Legend: **Ready** = design sufficient to implement when coding is authorised · **Gap** = must resolve before freeze/coding · **N/A** = not required for current slice

---

## 0. Preconditions

| # | Item | Status | Note |
| --- | --- | --- | --- |
| 0.1 | DR-01 three-release sequence | ✅ Ready | Cost Plan 1.1.2 |
| 0.2 | DR-02 pause architecture expansion | ✅ Ready | Cost Plan 1.1.2 |
| 0.3 | DR-03 Release 1 scope | ✅ Ready | Cost Plan 1.1.2 |
| 0.4 | DR-04 PA-06 when scoped invites need it | ✅ Ready | Policy recorded; see §8 |
| 0.5 | DR-05 R3 schema out of R1 | ✅ Ready | Cost Plan 1.1.2 |
| 0.6 | DR-06 Supabase workspace MCP | ✅ Ready | PASS `prbgsnxpwyepdggdysnt` |
| 0.7 | DR-07 retain-by-default / no purge | ✅ Ready | OD-04 still open for purge later |
| 0.8 | Explicit coding authorisation | ⬜ Gap | Not given — HOLD |

---

## 1. Database readiness (1.1–1.12)

| # | Component | Design ref | Assessment | Supporting note |
| --- | --- | --- | --- | --- |
| 1.1 | Extensions + `private` privilege baseline | V2.1.8A M0, §5.1 | **Ready** | Empty DB; design complete |
| 1.2 | Profiles, invitations, account status | V2.1.8A M1 | **Ready** | `invitations.role_ids` exists; scoped payload = PA-06 (§8) |
| 1.3 | Roles, permissions, grants, scopes | V2.1.8A M2 | **Ready** | Seeds + helpers required with table |
| 1.4 | Departments, teams, memberships | V2.1.8A M3 | **Ready** | Org ≠ privilege ladder (V2.2.2) |
| 1.5 | Clients directory | V2.1.8A M4 | **Ready** | Tenant root rules §3.3 |
| 1.6 | Projects | V2.1.8A M6 | **Gap** | **Written depends on M4–M5**; `projects.contract_id` → `contracts`. Cannot skip M5 under current V2.1.8A text without an authorised dependency amendment or a thin M5 contracts stub |
| 1.7 | Tasks, assignments, approvals | V2.1.8A M9 | **Gap** | **Written depends on M3–M7**; optional `tasks.cms_instance_id` → `cms_instances`. Cannot skip M7 under current text without amendment or thin M7 registry (not external integration) |
| 1.8 | Company CMS | V2.1.8A M8, Domain 7 | **Ready** | M8 depends on **M2 only** — OK for R1; publish path §2 |
| 1.9 | Audit events (core) | V2.1.8A M14 | **Ready** | Core `audit_events` usable; full retention governance tables may ship with M14 but purge stays off (DR-07) |
| 1.10 | Lookups / workflows seeds | V2.1.8A M15 | **Ready** | Minimal seeds |
| 1.11 | RLS-with-table every public table | V2.1.8A §3.10 | **Ready** | Implementation law; not waived |
| 1.12 | Exclude finance UI / external CMS / R3 | DR-03, DR-05 | **N/A** (excluded) | Exclusion of **product features** stands; see migration Gaps 1.6–1.7 |

**Gate status:** Not clear — **1.6 and 1.7 are Gaps** until migration sequence is reconciled (§7).

---

## 2. Website protection (2.1–2.8)

| # | Requirement | Design ref | Assessment | Supporting note |
| --- | --- | --- | --- | --- |
| 2.1 | Vite → Vercel remains public surface | OD-14 A; V2.1 §1.3 | **Ready** | Contract clear |
| 2.2 | No public redesign/framework rewrite | Cost Plan DR-03; Domain 7 constraint | **Ready** | Content model adapts to existing pages |
| 2.3 | Admin via same-domain; public stays up if admin down | OD-14 A | **Ready** | Design intent clear |
| 2.4 | Draft → approve → controlled publish → Vite | Cost Plan §3.1 | **Ready** | Requirements sufficient for implementation planning |
| 2.5 | Failed publish must not take site offline | Cost Plan §3.1 | **Ready** | Acceptance criterion |
| 2.6 | Rollback to last good artefact | Cost Plan §3.1; `cms_revisions` | **Ready** | Requirement defined; mechanism in planning |
| 2.7 | Exact publish mechanism chosen | Cost Plan §3.1 | **Gap** | Intentionally deferred to R1 implementation planning — **must be chosen before CMS publish coding**, not before Milestone 1 auth |
| 2.8 | Production unchanged until approved publish/deploy | HOLD + OD-14 A | **Ready** | No deploy authorised |

**CMS publish/rollback for implementation planning:** Requirements in Cost Plan §3.1 + V2.1 Domain 7 / `cms_revisions` are **sufficient to plan**. Selecting the concrete technique (static emit into Vite tree vs content JSON at build vs equivalent) remains a **Milestone planning Gap (2.7)**, not a new architecture document.

---

## 3. Security (3.1–3.9)

| # | Requirement | Design ref | Assessment | Supporting note |
| --- | --- | --- | --- | --- |
| 3.1 | Privileged MFA fail-closed | OD-11 A; V2.2.2 §6.3; `mfa_required` | **Ready** | |
| 3.2 | Grants + scopes; org ≠ privileges | V2.1 Domain 3; V2.2.2 §5 | **Ready** | |
| 3.3 | Dual delegation + UD-03 Ops limits | V2.2.2 §7.4 | **Ready** | App enforcement; PA-04 seeds |
| 3.4 | Client isolation RLS + composite FKs | V2.1.8A §3.3, §5 | **Ready** | |
| 3.5 | No service_role/secrets in browser | V2.1 security rules | **Ready** | |
| 3.6 | Audit privileged actions; no disable via config | V2.1; V2.2.2 §11 | **Ready** | |
| 3.7 | Staff invites Owner/Platform Admin only; no excess on accept | UD-02; V2.2.2 §12 | **Ready** | See PA-06 §8 for payload depth |
| 3.8 | External/sensitive CMS out of R1 | V2.3.1; DR-03 | **N/A** (excluded) | |
| 3.9 | Cross-tenant negative tests in hardening | V2.1 M16 intent | **Ready** | Plan for later R1 slice; not Milestone 1 blocker |

**Gate status for Milestone 1 (auth/RBAC only):** 3.1–3.7 design **Ready**. Full R1 still blocked by §7 migration Gaps and Option C.

---

## 4. Cost control and delivery (4.1–4.6)

| # | Requirement | Design ref | Assessment | Supporting note |
| --- | --- | --- | --- | --- |
| 4.1 | Fixed R1 scope | Cost Plan; DR-03 | **Ready** | Policy approved |
| 4.2 | Acceptance criteria Owner-agreed | Checklist §4.1 below | **Gap** | Criteria written; Owner has not yet formally frozen them (Option A) |
| 4.3 | Incremental milestones | Cost Plan §9 | **Ready** | Sequence defined |
| 4.4 | Free Supabase + existing Vercel; no new SaaS | Cost Plan §6–7; DR-06 | **Ready** | |
| 4.5 | Complete/test each slice before dependents | Cost Plan §9 | **Ready** | Delivery style approved |
| 4.6 | Thin V2.1 only if PA-06; no R3 schema in R1 | DR-04, DR-05 | **Ready** | Plus possible thin **dependency** amendment for M6/M9 (§7) — not R3 feature schema |

### 4.1 Release 1 acceptance criteria (draft — not frozen)

1. Owner signs in with MFA.  
2. Small staff set managed within RBAC + scopes.  
3. Clients, projects, and tasks can be maintained.  
4. Company CMS content drafted and approved.  
5. Controlled publish updates the **existing** Vite public site.  
6. Rollback restores last good public content without prolonged outage.  
7. Privileged actions appear in audit.  
8. Public design/navigation intact; no finance or external CMS shipped.

**Status:** Documented — freeze under Option A when Owner ready.

---

## 5. Explicitly deferred (Release 2 / 3 — not blockers for HOLD)

| Deferred | Until | Not a R1 coding blocker once §7 cleared |
| --- | --- | --- |
| Finance product (invoices, subscriptions, credits UI) | Release 2 | Yes deferred |
| PA-01 availability | Release 2 | Yes deferred |
| External CMS gateway, PA-03, PA-I*, C3-* | Release 3 | Yes deferred |
| OD-04 automated purge | After legal verification | Yes deferred |
| Full Configuration Studio UI | After core screens | Yes deferred |

---

## 6. Migration dependency verification (Release 1 subset)

### 6.1 As written in V2.1.8A

| Migration | Official depends on | R1 want? | Conflict? |
| --- | --- | --- | --- |
| M0 | — | Yes | No |
| M1 | M0 | Yes | No |
| M2 | M1 | Yes | No |
| M3 | M1–M2 | Yes | No |
| M4 | M2 | Yes | No |
| M5 | M4 | **Feature deferred** | **Conflict with M6** — M6 lists depends M4–**M5**; `projects.contract_id` → `contracts` |
| M6 | M4–M5 | Yes | Blocked unless M5 present or deps amended |
| M7 | M4 | **Integration deferred** | **Conflict with M9** — M9 lists depends M3–**M7**; `tasks.cms_instance_id` → `cms_instances` |
| M8 | M2 | Yes | No — independent of M5/M7 |
| M9 | M3–M7 | Yes | Blocked unless M7 present or deps amended |
| M14 | M1–M2 | Yes (core) | No |
| M15 | M2 | Yes (minimal) | No |
| M10–M13, M16 | later | No / later hardening | N/A for first slices |

### 6.2 Conclusion

**The Cost Plan’s “skip M5 and M7” intent cannot be applied literally under V2.1.8A’s dependency table without one of:**

| Path | Meaning | Cost impact |
| --- | --- | --- |
| **P1 — Thin stubs** | Apply minimal M5 (`contracts` enough for nullable FK) and M7 (registry tables only) with **no finance UI and no external CMS integration** | Small schema cost; stays inside “no R2/R3 product” if UI/integration withheld |
| **P2 — Authorised V2.1 dependency amendment** | Redefine M6 depends on **M4 only** (defer `contract_id` FK or allow without M5); redefine M9 depends on **M3–M4–M6** (and M8 if needed) with `cms_instance_id` deferred until M7 | Cleaner R1; requires Owner-authorised V2.1 revision — **does not** rewrite V2.1.8A in this checklist |

**Owner choice (2026-10-11):** **P2** approved for **documentation-only preparation**. Exact amendment text is in `okanggroup-v2.1-r1-dependency-amendment-p2-proposal.md`. **V2.1.8A is not yet amended.** Release 1 migrations remain unsafe until that proposal is accepted into an authorised V2.1 revision.

---

## 7. Remaining blockers vs deferred features

### 7.1 Blockers (must clear before Option A / coding)

| ID | Blocker | Severity |
| --- | --- | --- |
| B1 | M6↔M5 and M9↔M7 dependency conflict with R1 exclusions (§6) | **High** — P2 docs prepared; **still open** until V2.1 revision accepts the proposal |
| B2 | Owner has not frozen R1 acceptance criteria (4.2) / Option A | **High** for freeze |
| B3 | Coding authorisation not given (0.8) | **High** for any implementation |
| B4 | Publish mechanism not selected (2.7) | **Medium** — blocks CMS publish slice, not Milestone 1 auth |
| B5 | OD-15 email sender for invitations (operational) | **Medium** — blocks email invites; Owner bootstrap may use dashboard create |

### 7.2 Not blockers (deferred)

Finance UI, subscriptions, PA-01, external CMS, PA-03, PA-I*, Pilot 2, OD-04 purge, hybrid mode, monitoring fleet.

---

## 8. PA-06 — scoped staff invitations

| Question | Answer |
| --- | --- |
| Does Milestone 1 (Auth + M0–M2 + Owner MFA) need PA-06? | **No** — Owner bootstrap / Platform Admin can be created without scoped invite payloads |
| Does early R1 staff invite with **only** `role_ids` (scopes granted later by Owner) need PA-06? | **No** — V2.1.8A `invitations.role_ids` sufficient if accept must not invent scopes |
| Does R1 need invites that activate **client/project/cms scopes on accept**? | **Yes → PA-06 required** via authorised V2.1 amendment **before** that invite feature |
| DR-04 stance | Introduce PA-06 **only when** scoped invitations require it |

**Recommendation for HOLD / Milestone 1:** Treat PA-06 as **N/A until scoped invites are scheduled**. Do not block Option A freeze on PA-06 if R1 invites are role-only or staff are granted scopes post-accept by Owner.

---

## 9. Recommended next Owner actions

| Step | Action |
| --- | --- |
| 1 | Keep **Option C — coding HOLD** (current) |
| 2 | Review and accept/amend the **P2 proposal** into an authorised V2.1 revision (clears B1) |
| 3 | Freeze R1 acceptance criteria → **Option A** |
| 4 | Separately → **Option B** authorise Milestone 1 only (Auth + M0–M2 + MFA), not full R1 |

---

## 10. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0.0 | 2026-10-11 | Initial checklist |
| 1.1.0 | 2026-10-11 | Final readiness review; Option C |
| 1.1.1 | 2026-10-11 | Owner approved P2 for docs-only prep; proposal filed; V2.1.8A unchanged |

**End of checklist 1.1.1 — documentation only. Does not modify V2.1.8A / V2.2.2 / V2.3.1. CODING HOLD.**
