# OkangGroup — V2.1 Final Technical Readiness Report

| Field | Value |
| --- | --- |
| Report date | 2026-10-11 |
| Architecture baseline | [okanggroup-database-v2.1.md](./okanggroup-database-v2.1.md) **V2.1.7** |
| Checklist source | §16.8 (ten design-only checks; formerly referred to as §16.7 in earlier drafts) |
| Review type | **Design-only** — no migrations, no live schema application, no application code |
| OD-04 | **OPEN** — not marked complete |
| Supabase MCP | **Not assumed fixed** — verified still wrong account during this review |
| Architecture freeze | **NOT authorised by this report** |
| Coding | **HOLD** |

---

## 1. Executive verdict

| Verdict | Detail |
| --- | --- |
| Design direction | Sound; suitable as working technical specification |
| Ready to freeze V2.1? | **No** — blockers remain (see §3) |
| Ready to implement? | **No** — coding HOLD; blockers + amendments |
| OD-04 | Remains open; legal verification not completed |

**Summary counts**

| Result | Count |
| --- | --- |
| PASS | 5 |
| AMENDMENT REQUIRED | 3 |
| BLOCKED | 2 |

---

## 2. Ten design-only checks

### Check 1 — Table relationships and foreign keys

| Result | **AMENDMENT REQUIRED** |
| --- | --- |

**Evidence**

- Domain map (§2) and Domain 1–15 contracts define primary entities, actor FKs, and many parent/child links.
- §3.3.1 mandates composite tenant FKs and `UNIQUE (client_id, id)` on client-scoped parents.
- Explicit `UNIQUE (client_id, id)` is only restated on `projects` and `cms_instances` in domain sections; **not** restated on `contracts`, `invoices`, `subscriptions`, `tickets`, `quotations`, etc., even though §3.3.1 lists them as requiring the pattern.
- M4 text says `UNIQUE (client_id, id)` pattern “begins” on `clients` — incorrect: `clients` is the tenant root (`id` PK); the composite uniqueness pattern applies to **children of** `clients`, not to `clients` itself.
- Retention/governance tables named in §16 (`retention_policies`, `legal_holds`, `deletion_requests`, tax profiles implied by OD-03) are **not** yet inventoried in Domain 15’s core table list.

**Required amendment (design doc, not code)**

1. Exhaustive list of every client-scoped parent that must declare `UNIQUE (client_id, id)`.  
2. Correct M4 wording.  
3. Add Domain 15 (or Security) inventory rows for retention/tax supporting tables before freeze.

---

### Check 2 — Tenant-isolation constraints

| Result | **PASS** (with follow-on from Check 1) |
| --- | --- |

**Evidence**

- §3.3 / §3.3.1 / §3.3.2: `client_id`, composite FKs, nullable parents, `is_internal` CHECKs, immutable `client_id`.
- OD-06 R1 internal tasks without fictional client.
- OD-08 A + §6.5 contractual non-override for sensitive CMS.

**Note:** PASS on **rules**. Completeness of per-table restatement tracked under Check 1 (AMENDMENT).

---

### Check 3 — RLS policies and private helper permissions

| Result | **PASS** (design contract) |
| --- | --- |

**Evidence**

- §3.10 security-with-table law; §5.1–§5.1.2 privilege model (schema REVOKE, selective EXECUTE, Data API non-exposure, `SECURITY DEFINER` + `search_path`, FORCE RLS).
- §10 co-locates RLS with each migration; M16 hardening-only.
- Policy families in §5.2.

**Limitation (not a silent PASS of runtime):** Actual SQL policies are not written or applied. This check passes the **design** only. Runtime proof remains future work after coding authorisation.

---

### Check 4 — MFA and invitation security

| Result | **PASS** (design) / infrastructure dependency noted |
| --- | --- |

**Evidence**

- OD-11 A: MFA mandatory for Owner, Platform Admin, finance, sensitive permissions; fail-closed language on `profiles`.
- OD-12 A: email invite + hashed token + password setup; magic link later.
- Invitations table with expiry/revoke/accept.

**Dependency (not silently approved):** OD-15 R1 (`@okanggroup.com` verified sending) is recorded but **not configured** in this review. That blocks **production invitation delivery**, not the soundness of the invitation schema design. Listed as freeze/infra blocker in §3.

---

### Check 5 — Audit preservation and retention

| Result | **AMENDMENT REQUIRED** (retention freeze dependency) |
| --- | --- |

**Evidence**

- §3.9 / §3.9.1: SET NULL + actor snapshots; no CASCADE destroying audit/finance history; prefer offboarding.
- §16 retention framework (V2.1.7): record-types, governance, deletion irreversibility, backup controls — **proposed**.
- OD-04 **open**; §16.9 legal verification **not completed**.

**Required before treating retention as approved**

- Complete legal verification (§16.9); Owner records OD-04 approval.  
Until then: **do not** treat deletion schedules as legally approved (per Owner instruction).

**Design amendment:** Ensure Domain inventory includes retention control tables before freeze (ties to Check 1).

---

### Check 6 — CMS integration boundaries

| Result | **PASS** (for V2.1 scope) |
| --- | --- |

**Evidence**

- §6 / §6.5: platform permissions ≠ external CMS AuthZ; credential isolation; contractual restrictions; no sensitive-module ingestion by default.
- OD-08 A Owner temporary grant cannot override client contractual denial.
- OD-13 R1 company CMS first, then one client CMS — V2.3 for protocol detail.

**Note:** Deeper protocol/token design is correctly deferred to V2.3; not a silent approval of integration code.

---

### Check 7 — Migration dependencies

| Result | **PASS** |
| --- | --- |

**Evidence**

- §10 M0–M16 dependency order; security co-located; M2 helpers before later RLS; M16 not first RLS enablement.
- Maps to V2.0 phases.

**Minor:** Fix M4 wording (Check 1) when amending.

---

### Check 8 — Supabase Free-tier limitations

| Result | **PASS** (guidance adequate; numbers not re-verified live) |
| --- | --- |

**Evidence**

- §9 capacity watchpoints: DB size, high-churn tables, Auth MAU, egress, cron/probes, connections.
- §16.6 notes Free-tier backup/PITR may force upgrade.

**Limitation:** Current numeric Free-tier quotas were not re-fetched from Supabase docs in this review. Treat §9 as planning triggers; confirm quotas before go-live (not a design-structure failure).

---

### Check 9 — Correct Supabase project access

| Result | **BLOCKED** |
| --- | --- |

**Evidence (this review session)**

- MCP `list_projects` returned only `vzgfvzzbgrlxvixejmdt` (“adjeteyokangj-hash's Project”, `eu-west-1`).
- Designated target remains `prbgsnxpwyepdggdysnt` (`okanggroup-platform`, London) — **not visible / permission denied previously**.
- No mutations performed; wrong project not used.

**Blocker:** Cannot confirm empty schema, migrations list, or project health on the designated Free-tier London project until MCP authenticates as `okanggroup@gmail.com`.

---

### Check 10 — Compatibility with existing Vite website

| Result | **PASS** |
| --- | --- |

**Evidence**

- Repo remains Vite static site: `package.json` scripts `dev`/`build`/`preview`; Vite dependency only; `index.html` / `css` / `js` structure.
- OD-14 A: separate admin app + same-domain routing; public site must work if admin unavailable (§1.3, §14.3).
- Company CMS must adapt to existing design, not replace it (§ Domain 7).

**Note:** Vercel rewrite configuration is not implemented (correct under coding HOLD). Design compatibility PASS.

---

## 3. Consolidated blockers to freezing V2.1

These must **not** be silently approved. Each blocks freeze (and therefore implementation authorisation).

| ID | Blocker | Type | Resolution needed |
| --- | --- | --- | --- |
| B1 | **OD-04 open** — legal verification (§16.9) not completed; periods UNVERIFIED | Legal / policy | Counsel + Owner approve OD-04 |
| B2 | **Supabase MCP** authenticated to wrong account; cannot verify `prbgsnxpwyepdggdysnt` | Infrastructure | Re-auth as `okanggroup@gmail.com`; read-only confirm project empty/healthy |
| B3 | **Design completeness amendments** from Checks 1 & 5 (composite uniqueness restated on all parents; M4 wording; retention/tax tables in domain inventory) | Documentation | Publish V2.1.x amendment commit on review branch |
| B4 | **OD-15** verified `@okanggroup.com` sending not evidenced as configured | Infrastructure / ops | Configure DNS + provider; does not block schema freeze if Owner accepts freeze without prod mail, but blocks invitation go-live |
| B5 | **No Owner freeze decision** yet | Governance | Explicit freeze after B1–B3 (and Owner call on B4) |

**Not blockers to design freeze (explicitly out of scope / deferred correctly)**

- Writing actual RLS SQL / applying migrations  
- V2.2 workflow matrices / V2.3 CMS protocols  
- Live payment provider (OD-01 R1 manual)  
- Framework rewrite of Vite site  

---

## 4. Amendment backlog (design-only)

| ID | Amendment | Priority |
| --- | --- | --- |
| A1 | Exhaustive `UNIQUE (client_id, id)` + composite FK checklist for all client-scoped parents | Before freeze |
| A2 | Correct §10 M4 wording (`clients` is tenant root; pattern applies to children) | Before freeze |
| A3 | Add Domain 15/Security inventory: `retention_policies`, `retention_policy_versions`, `retention_record_types`, `legal_holds`, `deletion_requests`, `deletion_approvals`; tax profile tables for OD-03 | Before freeze |
| A4 | Clarify staff invitation CHECK wording (“forbid `client_id`” vs “NULL only”) | Nice-to-have |
| A5 | After OD-04 approval: mark categories VERIFIED/AMENDED in §16.2 | After legal |

---

## 5. What this report does **not** do

- Does **not** mark OD-04 complete or approved  
- Does **not** claim legal verification  
- Does **not** claim Supabase MCP access is fixed  
- Does **not** create migrations, apply SQL, write application code, merge to `main`, or deploy  
- Does **not** freeze V2.1  

---

## 6. Recommended Owner sequence

1. Keep legal verification of OD-04 progressing in parallel (§16.9).  
2. Authorise a short **V2.1.8 design amendment** commit for A1–A3 (documentation only).  
3. Fix Supabase MCP access; Cursor re-runs read-only project verification.  
4. Close OD-04 when legal answers land.  
5. Explicitly freeze V2.1.  
6. Only then authorise coding (Phase 1 / M0+).  

---

**End of readiness report. Architecture NOT FROZEN. Coding HOLD.**
