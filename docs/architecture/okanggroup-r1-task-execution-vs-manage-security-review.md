# OkangGroup — Task Permission Security Review (Report Only)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Status | **REMEDIATED in dev (M25) — see corrective-release UAT; production HOLD** |
| Priority | HIGH |
| Stage 1 | PASS / FROZEN baseline (open defect recorded) |
| Corrective plan | `okanggroup-r1-task-access-corrective-release-plan.md` |
| Stage 2 | Design approved; **implementation HOLD** until task corrective release sequenced |
| Subject | Daniel Mensah (`tasks.manage` on project-scoped Staff) |

---

## 1. Executive verdict

**Confirmed access-control design concern.**  

`tasks.manage` on the Staff role is **too broad** for ordinary assigned workers. Combined with current UI and RLS, Daniel can **redefine** client-scoped tasks (title, description, priority, due date, client/project linkage, status including `done`), not only report progress.

He is **not** Owner (still 4 effective codes; no Owner role; Owner 21 + MFA preserved). The issue is **permission packaging + lack of field-level enforcement**, not accidental Owner elevation.

**Immediate precaution (operational):** Until remediation is approved, Daniel should avoid **Save task** on existing assignments. Database **will accept** management-field updates if he saves.

---

## 2. What `tasks.manage` means today

| Layer | Behaviour |
| --- | --- |
| Seed (M2) | Permission: “Create and update tasks”. **Staff** role includes `tasks.read` + `tasks.manage` (not `tasks.assign`, not `approvals.decide`). |
| Frontend `TaskDetailPage` | Almost all fields enabled when `can('tasks.manage')`. Save updates title, description, status, priority, due_at, internal flag, client_id, project_id. Assignee control requires `tasks.assign` (Daniel lacks → dropdown disabled). |
| Frontend `TasksPage` | Create task + quick status changes also gated only by `tasks.manage`. |
| RLS `tasks_manage` | `FOR ALL` if platform `tasks.manage` **or** `has_permission_on_client('tasks.manage', client_id)`. **No column whitelist.** Any permitted UPDATE can change any column. |
| Assignments | Insert/reassign WITH CHECK allows `tasks.assign` **or** `tasks.manage` — but UI does not offer assign without `tasks.assign`. |

---

## 3. Fields Daniel can modify (assigned / same-client tasks)

| Field | UI (with `tasks.manage`) | API / RLS |
| --- | --- | --- |
| Title | Editable | **Accepted** (UAT sim) |
| Description | Editable | Accepted (same policy) |
| Priority | Editable | Accepted |
| Due date | Editable | Accepted |
| Client / Project | Editable | Accepted (within scoped clients he can write) |
| Assigned to | Disabled (no `tasks.assign`) | Assign insert not exposed in UI; WITH CHECK would allow via `tasks.manage` if called directly |
| Status (incl. `done`) | Editable | **Accepted** (UAT sim: status→`done`) |
| Progress notes / attachments / submit-for-review | **Not implemented** in current UI | N/A |

**UAT simulation (Daniel JWT + `authenticated` role):**

- `title_update_allowed`: **true** (reverted after test)  
- `status_done_allowed`: **true** (reverted after test)  
- Cross-client UPDATE rowcount: **0** (scope holds)

---

## 4. Answers to Owner review questions

| # | Question | Finding |
| --- | --- | --- |
| 1 | Inspect `tasks.manage` | Intent = create/update tasks; Staff seed includes it → ordinary staff get manager-grade writes in scope. |
| 2 | Fields Daniel can modify | All management fields above except Assignee UI; status including completion. |
| 3 | Frontend / API / RLS | Aligned on breadth: UI and RLS both treat manage as full-row write. No RPC/trigger field guard. |
| 4 | Change another person’s tasks? | **Yes, within same authorised client** — manage is client-scoped, not assignee-scoped. Assignee-only SELECT path does not limit UPDATE. |
| 5 | Approve own completed work? | No `approvals.decide`. But he can set `status = 'done'` directly, which bypasses a real approval workflow if `requires_approval` is unused in UI. |
| 6 | Separate manage vs execute? | **Required** — see §5. |
| 7 | Direct API bypass? | Disabling UI fields alone is insufficient; RLS currently allows full-row UPDATE. Remediation must be server-side. |
| 8 | Preserve records/history | Remediation must not delete tasks/assignments; use migrations + RPCs/triggers. |
| 9 | Owner 21 + MFA | **Intact** after review probes. |

---

## 5. Recommended remediation (for later Owner approval)

### 5.1 Permission split

| Permission (proposed) | Who | Allowed actions |
| --- | --- | --- |
| `tasks.read` | Staff / managers | View in scope or assigned |
| `tasks.execute` (new) | Assigned staff | Update **allowed progress fields only** on **tasks assigned to self**; add notes/evidence; request review |
| `tasks.manage` | Owner / authorised managers | Create tasks; edit title/description/priority/due/client/project; reassign; cancel |
| `tasks.assign` | Managers | Assignment changes |
| `approvals.decide` | Authorised approvers | Approve/reject; staff must not self-approve Owner decisions |

**Principle:** Owner (or authorised manager) **defines** the work; staff **execute** and **report**.

### 5.2 Enforcement (backend first)

1. **Remove `tasks.manage` from default Staff template** (role-definition change — needs Owner approval; Stage 1 freeze means this waits for an authorised remediationslice).  
2. Replace broad RLS UPDATE with either:  
   - **RPC** `update_task_progress(...)` (SECURITY DEFINER, assignee-only, whitelist columns/status transitions), or  
   - **BEFORE UPDATE trigger** rejecting changes to protected columns unless `tasks.manage` (or equivalent).  
3. Forbid assignee setting terminal “approved/done” if `requires_approval` without `approvals.decide`.  
4. Frontend: read-only management fields for execute-only users; separate “Update progress” actions.  
5. Regression: assignee cannot PATCH title via API; manager can; cross-client still denied.

### 5.3 Suggested status model (execution)

Assignee-allowed examples: `in_progress`, `blocked`, `in_review` (submit for review).  
Manager/approver-only: create, reassignment, priority/due/description edits, `done` / formal approve, cancel.

---

## 6. Relation to Stage 1 / Stage 2

| Item | Status |
| --- | --- |
| Stage 1 freeze | Do **not** silently change Staff seeds or Daniel’s grants in this review |
| Stage 2 overlays | Can later **deny `tasks.manage`** for an individual without changing the template — useful bridge, but **field-level RLS/RPC still required** so deny of manage + grant of execute is enforceable |
| Implementation | **HOLD** until Owner approves a dedicated remediation (may be a Stage 1.1 security fix or Stage 2 slice) |

---

## 7. Owner decisions requested

| # | Decision | Recommendation |
| --- | --- | --- |
| T1 | Accept this review (concern is real)? | **Yes** |
| T2 | Authorise remediation design/build? | Await: `APPROVED — remediate task manage vs execute permissions` |
| T3 | Interim: remove `tasks.manage` from Staff seed vs overlay-deny for Daniel only? | Prefer **template fix + execute permission** for all staff; overlay-deny as emergency only |
| T4 | Keep Stage 1 frozen until T2? | **Yes** |

---

## 8. Verdict

Daniel does **not** have Owner privileges, but **`tasks.manage` + full-row RLS** lets him act as a **task manager within his client scope**, including editing instructions and marking work done. That violates “staff carry out work; Owner controls the work.”

**No application code, schema, role definitions, or production deployments were changed by this review.**

**End of report**
