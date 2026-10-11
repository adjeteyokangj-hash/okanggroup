# OkangGroup — Release 1 Implementation Readiness Checklist

| Field | Value |
| --- | --- |
| Status | **CHECKLIST — OWNER REVIEW — CODING HOLD** |
| Version | **1.0.0** |
| Based on | Cost Plan **1.1.2** (DR-01–DR-07 approved; DR-06 PASS); V2.1.8A; V2.2.2; V2.3.1 |
| Does not modify | Those baselines or the production Vite site |
| Coding / SQL / migrations / deploy | **HOLD** until separate Owner authorisation |
| Purpose | Short practical gate before freezing Release 1 design and authorising milestone 1 |

Use: mark each item **Ready** / **Gap** / **N/A** during Owner review. This is not a new architecture phase.

---

## 0. Preconditions (already decided)

| # | Item | Expected | Status |
| --- | --- | --- | --- |
| 0.1 | Three-release sequence accepted | DR-01 | ✅ |
| 0.2 | Architecture expansion paused | DR-02 | ✅ |
| 0.3 | Release 1 scope locked (ops + company CMS; no finance / external CMS) | DR-03 | ✅ |
| 0.4 | PA-06 only when scoped invites need it | DR-04 | ✅ |
| 0.5 | PA-03 / PA-I* deferred to Release 3 | DR-05 | ✅ |
| 0.6 | Supabase `okanggroup@gmail.com` / `prbgsnxpwyepdggdysnt` / workspace MCP | DR-06 PASS | ✅ |
| 0.7 | Retain-by-default; no automated purge | DR-07 / OD-04 open | ✅ |
| 0.8 | Explicit Owner coding authorisation | Separate from this checklist | ⬜ Not given |

---

## 1. Database readiness (Release 1 minimum)

Confirm these components are in scope for the **first authorised V2.1 migration set** (empty DB today is correct).

| # | Component | V2.1 anchor | Ready? |
| --- | --- | --- | --- |
| 1.1 | Extensions + `private` helpers privilege baseline | M0 | ⬜ |
| 1.2 | Auth-linked `profiles`, invitations, account status events | M1 | ⬜ |
| 1.3 | Roles, permissions, grants, access_scopes (+ seeds) | M2 | ⬜ |
| 1.4 | Departments, teams, job titles, staff memberships | M3 | ⬜ |
| 1.5 | Clients directory (+ contacts/memberships as needed) | M4 | ⬜ |
| 1.6 | Projects (+ children as needed for R1) | M6 | ⬜ |
| 1.7 | Tasks, assignments, approvals, dependencies | M9 | ⬜ |
| 1.8 | Company CMS tables (pages, sections, media refs, revisions, nav/SEO as needed) | M8 | ⬜ |
| 1.9 | Audit events (append-only privileged actions) | M14 (core) | ⬜ |
| 1.10 | Lookups / workflow definition seeds | M15 (minimal) | ⬜ |
| 1.11 | RLS enabled with table on every `public` table in each migration | §3.10 | ⬜ |
| 1.12 | **Out of R1 DB:** finance M5/M10, client CMS registry M7, support/monitoring productisation | DR-03 / DR-05 | ✅ Excluded |

**Gate:** All of 1.1–1.11 marked Ready (design intent accepted) before coding authorisation. No migrations until then.

---

## 2. Website protection (public Vite site)

| # | Requirement | Ready? |
| --- | --- | --- |
| 2.1 | Existing Vite → Vercel marketing site remains the public surface (OD-14 A) | ⬜ |
| 2.2 | No rewrite of public design, navigation, or framework in Release 1 | ⬜ |
| 2.3 | Admin app introduced via same-domain routing without taking public site down if admin is unavailable | ⬜ |
| 2.4 | Company CMS publish path: draft → approve → controlled publish → **existing Vite site** (Cost Plan §3.1) | ⬜ |
| 2.5 | Publish failure must not take the public site offline | ⬜ |
| 2.6 | Rollback to last good published artefact defined for R1 | ⬜ |
| 2.7 | Exact publish mechanism chosen in implementation planning (not a new architecture version) | ⬜ |
| 2.8 | Production website unchanged until an explicit publish/deploy step is approved | ⬜ |

**Gate:** 2.1–2.8 Ready before any admin or CMS work that could touch production hosting.

---

## 3. Security (before implementation)

| # | Requirement | Source | Ready? |
| --- | --- | --- | --- |
| 3.1 | Owner (and privileged roles) MFA fail-closed | OD-11 / V2.2.2 | ⬜ |
| 3.2 | Effective access = grants + scopes (+ permissions); org chart ≠ privileges | V2.1 / V2.2.2 | ⬜ |
| 3.3 | Dual delegation rule (authority + effective coverage); Ops limits (UD-03) | V2.2.2 §7.4 | ⬜ |
| 3.4 | Client isolation via RLS + composite tenant FKs on client-scoped data | V2.1.8A | ⬜ |
| 3.5 | No `service_role` / secrets in browser clients | V2.1 security rules | ⬜ |
| 3.6 | Audit privileged actions; no Owner disable of audit via config | V2.1 / V2.2.2 | ⬜ |
| 3.7 | Staff invites: Owner/Platform Admin only; no excess privileges on accept | UD-02 / W-E | ⬜ |
| 3.8 | Sensitive/external CMS integration **out of R1** | V2.3.1 / DR-03 | ✅ Excluded |
| 3.9 | Cross-tenant negative tests planned for hardening slice | V2.1 M16 intent | ⬜ |

**Gate:** 3.1–3.7 and 3.9 Ready before milestone 1 coding.

---

## 4. Cost control and delivery

| # | Requirement | Ready? |
| --- | --- | --- |
| 4.1 | Fixed Release 1 scope — no feature adds except defect/security fixes | ⬜ |
| 4.2 | Acceptance criteria (below) agreed by Owner | ⬜ |
| 4.3 | Incremental milestones (auth → RBAC → org/clients → projects/tasks → audit → company CMS → Vite publish) | ⬜ |
| 4.4 | Prefer Free Supabase + existing Vercel; no new SaaS in R1 | ⬜ |
| 4.5 | Engineering cost controlled: complete/test each slice before the next depends on it | ⬜ |
| 4.6 | Thin V2.1 revision only if PA-06 needed; no R3 schema in R1 | ⬜ |

### 4.1 Release 1 acceptance criteria (Owner confirm)

Release 1 is accepted when **all** of the following are true:

1. Owner signs in with MFA.  
2. Small staff set can be managed within RBAC + scopes.  
3. Clients, projects, and tasks can be maintained.  
4. Company CMS content can be drafted and approved.  
5. Controlled publish updates the **existing** Vite public site.  
6. Rollback restores the last good public content without prolonged outage.  
7. Privileged actions appear in audit.  
8. Public site design/navigation remain intact; no finance or external CMS integration shipped.

---

## 5. Explicitly deferred (do not pull into Release 1)

| Deferred | Until |
| --- | --- |
| Finance, subscriptions, credits/refunds | Release 2 |
| Staff availability schema (PA-01) | Release 2 |
| Client CMS gateway, PA-03, PA-I01–I04, C3-* | Release 3 |
| OD-04 automated purge | After legal verification |
| Architecture V2.4+ / further expansion | After R1 locked and delivering (DR-02) |

---

## 6. Recommended Owner decisions after this checklist

| Decision | Meaning |
| --- | --- |
| **A — Freeze Release 1 design intent** | Checklist gates Ready; scope and acceptance criteria locked for build |
| **B — Authorise milestone 1 only** | Typically: Auth + M0–M2 + MFA Owner path — still incremental; not full R1 |
| **C — Keep coding HOLD** | Checklist incomplete or Owner not ready |

This document does **not** by itself freeze architecture or authorise coding.

---

## 7. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0.0 | 2026-10-11 | Initial Release 1 Implementation Readiness Checklist |

**End of checklist 1.0.0 — documentation only. CODING HOLD.**
