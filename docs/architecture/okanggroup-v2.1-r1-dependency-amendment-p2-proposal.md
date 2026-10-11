# OkangGroup — Proposed V2.1 Release 1 Dependency Amendment (P2)

| Field | Value |
| --- | --- |
| Status | **PROPOSAL — DOCUMENTATION ONLY — AWAITING OWNER ACCEPTANCE INTO A FUTURE V2.1 REVISION** |
| Version | **1.0.0** |
| Owner instruction | 2026-10-11: “Approve P2 for documentation-only preparation. Keep coding and migrations on HOLD.” |
| Does **not** modify | **V2.1.8A** (accepted baseline remains unchanged until a separate authorised revision) |
| Does not authorise | Coding, SQL, migrations, RLS application, or deployment |
| Related | Release 1 Checklist 1.1.0 blocker B1; Cost Plan 1.1.2 DR-03 / DR-05 |

---

## 1. Purpose

Specify the **exact** V2.1 dependency and schema-timing changes required so Release 1 can ship projects and tasks **without** applying full M5 (finance) or M7 (client CMS registry) feature tables.

This proposal is for Owner review. Applying it means a future authorised V2.1 document revision (e.g. V2.1.9), **not** silently editing V2.1.8A in place without approval.

---

## 2. Problem (as accepted in Checklist 1.1.0)

| Link | V2.1.8A today | Release 1 conflict |
| --- | --- | --- |
| M6 → M5 | M6 depends on M4–M5; `projects.contract_id` FK → `contracts` | Finance product deferred, but contracts table pulled in |
| M9 → M7 | M9 depends on M3–M7; `tasks.cms_instance_id` FK → `cms_instances` | Client CMS integration deferred, but registry pulled in |

P2 defers those relationships until the releases that need them, with a safe add-FK path for existing rows.

---

## 3. Proposed changes to the migration dependency table

Replace only the dependency cells for M6 and M9 (and clarify M5/M7 timing). No change to M0–M4, M8, M14, M15 intent.

| Migration | V2.1.8A depends on | **Proposed (P2)** depends on | Notes |
| --- | --- | --- | --- |
| M5 | M4 | M4 *(unchanged)* | **Deferred until Release 2** (finance product) |
| M6 | M4–**M5** | **M4 only** | Projects without contract FK in R1 |
| M7 | M4 | M4 *(unchanged)* | **Deferred until Release 3** (or earlier if registry-only needed before Pilot 2 — Owner choice) |
| M8 | M2 | M2 *(unchanged)* | Company CMS remains R1 |
| M9 | M3–**M7** | **M3–M4–M6** | Tasks without `cms_instance` FK in R1; company/internal + client/project links only |
| M10 | M5 | M5 *(unchanged)* | Remains with finance |

### 3.1 Proposed Release 1 migration order (after P2 accepted into V2.1)

```text
M0 → M1 → M2 → M3 → M4 → M6 → M8 → M9 → M14 (core) → M15 (minimal)
```

**Not in Release 1:** M5, M7, M10–M13; M16 hardening after R1 tables exist.

---

## 4. Exact column / constraint timing changes

### 4.1 `projects.contract_id` (M6 vs M5)

| Phase | Rule |
| --- | --- |
| **Release 1 (M6 under P2)** | Do **not** create `contract_id` or any FK to `contracts`. Projects stand alone under `client_id`. |
| **Release 2 (with M5)** | Add nullable `contract_id uuid NULL` **without** FK first (or in same migration after `contracts` exists). Then add `FOREIGN KEY (contract_id) REFERENCES contracts(id)` **or** composite `(client_id, contract_id) → contracts(client_id, id)` per V2.1 tenant rules — only when both sides exist. |
| **Data safety** | All existing R1 project rows have `contract_id` NULL after the column is added → FK validate succeeds. No backfill required. |
| **App rule until then** | No UI/API field for linking projects to contracts in R1. |

**Alternative (rejected for P2 default):** Keep `contract_id` column in M6 with no FK — avoided to prevent orphan UUIDs; prefer **omit column until M5**.

### 4.2 `tasks.cms_instance_id` (M9 vs M7)

| Phase | Rule |
| --- | --- |
| **Release 1 (M9 under P2)** | Do **not** create `cms_instance_id` or FK to `cms_instances`. Tasks may use `client_id`, `project_id`, and `is_internal` as already designed. |
| **When M7 is applied (Release 3 default)** | Add nullable `cms_instance_id uuid NULL` (+ denormalised `client_id` already present). Add composite FK `(client_id, cms_instance_id) → cms_instances(client_id, id)` when set. |
| **Data safety** | Existing task rows get `cms_instance_id` NULL → FK OK. |
| **App rule until then** | No assignment of tasks to client CMS instances in R1. Company CMS work uses company CMS domain / internal tasks, not `cms_instances`. |

### 4.3 Optional FKs that remain in R1

| Link | R1 allowed? |
| --- | --- |
| `tasks.client_id` → `clients` | Yes (nullable; internal tasks NULL) |
| `tasks.project_id` + `client_id` → `projects` | Yes when both set (composite per §3.3) |
| Company CMS tables (M8) | Yes — no M5/M7 dependency |

---

## 5. Safe future introduction procedure (mandatory)

When adding a deferred FK in a later migration:

1. **Create parent tables** (M5 or M7) with RLS in the same migration tranche (V2.1 §3.10).  
2. **Add nullable column** on child if not present (`contract_id` / `cms_instance_id`).  
3. **Backfill only if business requires** — default is leave NULL.  
4. **Validate:** `SELECT` children where FK id IS NOT NULL and parent missing → must be zero rows.  
5. **Add FK** (`NOT VALID` then `VALIDATE` optional pattern, or add only when clean).  
6. **Enable app features** that write those columns only after FK exists.  
7. **Audit** the migration; no rewrite of historical `client_id`.

Existing projects/tasks created in R1 remain valid: new columns are NULL, FKs are satisfied.

---

## 6. Text patches proposed for a future V2.1 revision (review wording)

These are the edits a future V2.1.x would apply — **shown here only; not applied to V2.1.8A**.

### 6.1 Migration plan table

- Change M6 Depends on from `M4–M5` to `M4`.  
- Change M9 Depends on from `M3–M7` to `M3–M4–M6`.  
- Add note: “M5 deferred to Release 2 commercial; M7 deferred to Release 3 client CMS registry unless Owner advances registry-only.”

### 6.2 `projects` column list

- Annotate `contract_id`: “**Deferred:** introduced with M5 / Release 2; omitted from Release 1 M6.”

### 6.3 `tasks` column list

- Annotate `cms_instance_id`: “**Deferred:** introduced with M7; omitted from Release 1 M9.”

### 6.4 Phase mapping note

- Phase “4 Clients & projects” = M4 + M6 (not M5).  
- Phase “6 Client CMS framework” = M7 (Release 3).  
- Phase “7 Work allocation” = M9 after M6 (not after M7).  
- Phase “8 Finance” = M5, M10 (Release 2).

---

## 7. What P2 does **not** change

- RLS-with-table law, composite tenant FK rules for links that **do** exist in R1  
- OD-08 / V2.3.1 external AuthZ (still Release 3)  
- Company CMS M8 or Vite publish requirements  
- PA-03 / PA-I* / PA-06 timing (unchanged)  
- Production website  
- Coding HOLD  

---

## 8. Acceptance criteria for adopting this proposal

Owner accepts this proposal into an authorised V2.1 revision when:

1. P2 wording in §3–§6 is approved or amended.  
2. Checklist B1 can be marked resolved.  
3. V2.1.8A is superseded **only** by an explicit revision commit (not this proposal file alone).  
4. Coding/migrations remain HOLD until a further Owner implementation authorisation.

---

## 9. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 1.0.0 | 2026-10-11 | P2 documentation-only preparation per Owner approval |

**End of P2 proposal 1.0.0 — does not modify V2.1.8A. CODING AND MIGRATIONS HOLD.**
