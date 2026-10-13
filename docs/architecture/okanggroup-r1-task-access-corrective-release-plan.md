# OkangGroup — Stage 1 Corrective Release Plan: Task Execute vs Manage

| Field | Value |
| --- | --- |
| Status | **C1–C4 IMPLEMENTED (dev/test) — production HOLD; awaiting Owner UAT acceptance** |
| UAT report | `okanggroup-r1-task-access-corrective-release-uat.md` |
| Date | 2026-10-12 |
| Priority | HIGH |
| Type | Stage 1 **corrective release** (security defect) |
| Baseline | Stage 1 **PASS / FROZEN** (unchanged as accepted baseline) |
| Finding | `okanggroup-r1-task-execution-vs-manage-security-review.md` — **Owner accepted** |
| Stage 2 | **HOLD** — no Stage 2 implementation |
| Target | `prbgsnxpwyepdggdysnt` (dev/test only; **no production deploy**) |
| Public website | HOLD |
| Gate to start C1 | Exact Owner phrase: `APPROVED — implement task access corrective release` |

---

## 1. Problem statement

Staff role includes `tasks.manage`. RLS allows full-row UPDATE on client-scoped tasks. Assignees can change title, description, priority, due date, client/project, and set `status = done` without management approval.

**Principle:** Owner (or authorised manager) **defines** work; staff **execute** and **report**; final completion requires **authorised approval**.

---

## 2. Goals (corrective release)

1. Introduce `tasks.execute` for assigned staff.  
2. Reserve `tasks.manage` for explicitly authorised managers and Owner.  
3. Block ordinary staff from changing title, description, priority, deadline, client/project, assignments.  
4. Allow progress updates, notes, evidence upload, submit-for-review.  
5. Require authorised approval before final completion (`Submitted for Review → Approved → Completed`).  
6. Enforce via **database functions / triggers / RLS**, not UI alone.  
7. Keep client/project scope enforcement.  
8. Preserve historical tasks, assignments, audit.  
9. No self-elevation of permissions.  
10. Preserve Owner **21** permissions and mandatory MFA.  
11. Negative-access tests (API, cross-client, unauthorised completion).  
12. Migration, rollback, regression plans.

**Out of scope for this corrective release:** Stage 2 overlays UI, production website deploy, David invite, finance.

---

## 3. Target permission matrix

| Capability | Staff (execute) | Manager* | Owner |
| --- | --- | --- | --- |
| View assigned / in-scope tasks | ✅ | ✅ | ✅ |
| Update progress / allowed status | ✅ | ✅ | ✅ |
| Add progress notes | ✅ | ✅ | ✅ |
| Upload work evidence | ✅ | ✅ | ✅ |
| Submit for review | ✅ | ✅ | ✅ |
| Change title / description | ❌ | ✅* | ✅ |
| Change deadline / priority | ❌ | ✅* | ✅ |
| Reassign | ❌ | ✅* (`tasks.assign`) | ✅ |
| Change client/project | ❌ | Restricted* | ✅ |
| Approve completion | ❌ | Separately authorised (`approvals.decide`)* | ✅ |
| Create tasks | ❌ | ✅* (`tasks.manage`) | ✅ |

\*Manager capabilities require **explicit** grants + appropriate client/project scope.

---

## 4. Completion workflow

```text
assigned / in_progress / blocked
        →  in_review   (staff: submit for review)
        →  done        (only approver / tasks.manage — not assignee via execute)
```

| Transition | Who |
| --- | --- |
| → `in_progress`, `blocked` | Assignee with `tasks.execute` (own assignments) or manager |
| → `in_review` | Assignee submit **or** manager |
| → `done` | `approvals.decide` **or** `tasks.manage` (not execute-only assignee) |
| `in_review` → `in_progress` (reject + feedback) | Approver / manager |
| → `cancelled` | `tasks.manage` only |

**Firm (R3):** New tasks default `requires_approval = true`. When `requires_approval` is true, execute-only assignees **cannot** set `status = done` (must go via `in_review` → authorised decide). Managers/Owner with manage may still complete when authorised.

**Historical tasks:** Do **not** retroactively change status of existing `done` (or other) rows. Backfill `requires_approval = true` only for **non-done** tasks if desired; leave already-`done` rows untouched (status, approval flag, audit preserved).

Feedback on reject: store in `approvals.decision_note` and/or a new `task_progress_notes` row (preferred for history).

---

## 5. Proposed technical design

### 5.1 New permission

| Code | Description |
| --- | --- |
| `tasks.execute` | Update allowed progress fields on tasks assigned to self; add notes/evidence; submit for review |

### 5.2 Role seed changes (migration)

| Role | Remove | Add |
| --- | --- | --- |
| `staff` | `tasks.manage` **only** | `tasks.execute` |
| `cms_editor` | — | — |
| `owner`, `platform_admin`, `operations_manager`, `department_manager`, `team_manager` | **none** — keep `tasks.manage` (+ assign/decide) | optionally `tasks.execute` |

**Hard rule:** Migration SQL must delete `tasks.manage` **only** where `roles.code = 'staff'`. Never blanket-delete by permission code alone.

#### Pre-change inventory (live 2026-10-12 — re-run before apply)

**Role templates with `tasks.manage` today:**

| Role | Keep `tasks.manage`? | Action |
| --- | --- | --- |
| `owner` | ✅ Yes | No change |
| `platform_admin` | ✅ Yes | No change |
| `operations_manager` | ✅ Yes | No change |
| `department_manager` | ✅ Yes | No change |
| `team_manager` | ✅ Yes | No change |
| `staff` | ❌ No | Replace with `tasks.execute` |
| `cms_editor` | n/a (no manage) | No change |

**Active users currently receiving `tasks.manage` via role grant:**

| Person | Role | Effect of Staff-only revoke |
| --- | --- | --- |
| Owner (`okanggroup@gmail.com`) | `owner` | **Unaffected** (Owner role retains manage) |
| Daniel Mensah | `staff` | Loses manage; gains execute |

No other active grants currently hold `tasks.manage`. Before apply: re-query `role_permissions` + active `role_grants` and abort if unexpected manager roles would lose manage.

**Existing task rows (sample):** 1× `done` (`requires_approval=false`), 1× `in_progress` (`requires_approval=false`). Do not change `done` status; apply default-approval going forward (and optional backfill only for open tasks).

Daniel’s post-fix effective codes: `dashboard.read`, `tasks.read`, `tasks.execute`, `company_cms.read`. Do **not** revoke entire Staff role.

### 5.3 Server enforcement (mandatory)

**A. Column protection trigger** on `public.tasks` BEFORE UPDATE:

- If caller has `tasks.manage` (platform or on task’s `client_id`): allow full update (subject to RLS).  
- Else if caller has `tasks.execute` **and** is active assignee: allow **only** whitelisted columns (e.g. `status` within allowed transitions, `updated_by`, `updated_at`; later progress fields). Reject changes to `title`, `description`, `priority`, `due_at`, `client_id`, `project_id`, `is_internal`, `created_by`, etc.  
- Else: reject.

**B. RLS tightening:**

- Keep SELECT as today (scope / assignee / creator).  
- Narrow UPDATE/INSERT policies:  
  - INSERT: `tasks.manage` only.  
  - UPDATE: `tasks.manage` on scope **OR** (`tasks.execute` AND assignee) — trigger still enforces columns.  

**C. RPCs (recommended for clarity):**

| RPC | Purpose |
| --- | --- |
| `submit_task_for_review(p_task_id, p_note)` | Assignee → `in_review`; writes note + optional approval request row |
| `decide_task_completion(p_task_id, p_approve, p_note)` | Requires `approvals.decide` or `tasks.manage`; approve → `done`; reject → `in_progress` + feedback |
| `add_task_progress_note(p_task_id, p_body)` | Assignee or manager |
| `add_task_evidence(...)` | Storage path + metadata (if storage ready; else stub table) |

**D. Frontend (after DB is safe):**

- Execute users: read-only management fields; Progress / Submit for review actions only.  
- Hide “Add task” / Save management form without `tasks.manage`.  
- Never rely on `disabled` alone.

### 5.4 Notes & evidence (minimum viable)

| Object | Notes |
| --- | --- |
| `task_progress_notes` | `task_id`, `author_id`, `body`, `created_at` — RLS: read if can read task; insert if execute assignee or manage |
| Evidence | Prefer Storage bucket + `task_evidence` metadata table; if Storage not ready, metadata-only stub with Owner HOLD on public files |

---

## 6. Immediate precaution options (optional Owner authorisation)

Until corrective release is deployed, backend still accepts manage-field updates. Options (**none applied in this plan**):

| Option | Action | Impact |
| --- | --- | --- |
| **P0** | Operational: Daniel must not click Save task | Soft; relies on trust |
| **P1** | Temporary SQL: revoke `tasks.manage` from **Staff role only** (role_permissions), add nothing yet | All Staff lose create/edit until execute ships — may break Owner-created staff workflows that used Save |
| **P2** | Temporary overlay/deny for Daniel only | Needs Stage 2 overlays (not built) |
| **P3** | Emergency BEFORE UPDATE trigger blocking non-manage column changes except status for assignees | Small hot-fix; closest to final design; still needs Owner **APPROVED — emergency task write lock** |

**Recommendation:** Prefer **P0** short-term + fast-track corrective release; if Daniel must keep using the app, authorise **P3** as emergency lock, then full plan.

---

## 7. Migration plan (when implementation approved)

| Step | Work | Exit |
| --- | --- | --- |
| M-T0 | Snapshot role_permissions / sample tasks; confirm Owner 21 + MFA | Baseline recorded |
| M-T1 | Insert `tasks.execute`; grant to `staff`; **revoke `tasks.manage` from `staff`** | Seeds match matrix |
| M-T2 | Trigger + RLS policy updates | API: Daniel cannot UPDATE title; can transition to `in_review` if assignee |
| M-T3 | RPCs submit/decide + notes table | Approval path works |
| M-T4 | Admin UI Task detail/list for execute vs manage | Build pass |
| M-T5 | Negative UAT + Owner 21/MFA verify | Report for Owner accept |
| M-T6 | Document corrective release as Stage 1.1; Stage 1 baseline remains frozen historically | Freeze note |

Suggested migration name: `m25_task_execute_vs_manage` (numbering after M24).

---

## 8. Rollback plan

| Scenario | Action |
| --- | --- |
| Pre-cutover | Do not apply M-T* |
| After M-T1 only | Re-insert Staff ↔ `tasks.manage`; delete `tasks.execute` role link |
| After trigger/RLS | `DROP TRIGGER` / restore prior policies from migration down SQL |
| After UI | Redeploy previous admin build |
| Data | Notes/approvals rows retained; no task deletes in forward or rollback |

Rollback SQL must be written in the same PR as forward migration and tested on a disposable staff account (not production website).

---

## 9. Regression / negative-access test plan

| ID | Test | Expected |
| --- | --- | --- |
| N1 | Assignee UPDATE title via API | **Denied** |
| N2 | Assignee UPDATE due_at / priority / client_id | **Denied** |
| N3 | Assignee UPDATE status → `in_progress` / `in_review` | **Allowed** (if assigned) |
| N4 | Assignee UPDATE status → `done` | **Denied** |
| N5 | Assignee `decide_task_completion(approve)` | **Denied** |
| N6 | Manager/Owner with manage/decide → `done` | **Allowed** |
| N7 | Cross-client task UPDATE | **0 rows / denied** |
| N8 | Non-assignee with only execute | **Cannot** update others’ tasks |
| N9 | Create task without manage | **Denied** |
| N10 | Owner permission count | **21**; MFA required + verified factor intact |
| N11 | Daniel grants history / CMS Editor revoked | Unchanged except manage→execute on Staff template |
| N12 | Direct PostgREST PATCH bypassing UI | Same as N1–N4 |

---

## 10. Delivery slices (after **explicit** Owner implementation approval)

| Slice | Content | Exit |
| --- | --- | --- |
| C0 | Explicit Owner authorisation phrase + P0 interim | Gate cleared |
| C1 | Inventory re-check → M-T1–T2 (permission + trigger/RLS); R3 default approval; no retroactive `done` | N1–N4, N7, N10; managers still have manage |
| C2 | M-T3 workflow RPCs + notes | N4–N6 green |
| C3 | Admin UI execute vs manage | Build + browser UAT |
| C4 | Full N* pack + **fresh security UAT** report | Owner accept Stage 1.1 |
| Deploy | Production / public website | **HOLD** until separate Owner release decision |

---

## 11. Decisions for Owner

### 11.1 Proposed package (advisor recommendation — **not** authorisation)

| # | Decision | Proposed | Conditions |
| --- | --- | --- | --- |
| R1 | Accept corrective plan | ✅ APPROVE | Preserve task records + audit history |
| R2 | Interim precaution | ✅ **P0** | Daniel must not edit tasks until fix verified |
| R3 | Default approval required | ✅ **YES — firm** | Staff-submitted work cannot skip review; no retroactive status change on already-`done` tasks |
| R4 | Authorise implementation | ✅ APPROVE (proposed) | Dev/test only; **no production deploy**; fresh security UAT before release |
| R5 | Stage 2 | ⏸️ **HOLD** | No Stage 2 implementation |

### 11.2 Explicit authorisation gate

The above are **recommendations**. C1 must **not** start until the Owner sends:

`APPROVED — implement task access corrective release`

Until then: no schema/permission/UI changes; P0 operational caution stands.

### 11.3 Non-negotiable implementation checks

1. Daniel can update progress without changing original instructions.  
2. Only authorised managers/Owner modify management fields.  
3. Staff cannot approve their own completed work.  
4. Backend rejects unauthorised changes (API bypass).  
5. Client/project scope remains enforced.  
6. Existing records + audit preserved; already-`done` statuses untouched.  
7. Owner account + MFA protected (21 permissions).  
8. **`tasks.manage` not removed from any authorised management role** — inventory before apply.

---

## 12. Verdict

Design is ready; **implementation remains HOLD** pending the explicit Owner phrase in §11.2. Stage 2 remains HOLD. Production deployment remains HOLD pending fresh security UAT after C1–C4.

**No application code, database schema, role definitions, permissions, or production deployments have been changed under this document.**

**End of plan**
