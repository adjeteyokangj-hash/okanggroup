# OkangGroup — Stage 1.1 Task Access Corrective Release UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Status | **FINAL WORKFLOW UAT PASS (API) — Owner visual sign-off optional; production HOLD** |
| Migrations | M25 execute/manage + **M26 progress UI** (applied to `prbgsnxpwyepdggdysnt`) |
| Plan | `okanggroup-r1-task-access-corrective-release-plan.md` |
| Stage 2 | HOLD |
| Production / public website | HOLD |

---

## 1. Verdict

Corrective release C1–C4 implemented in the development project. Backend field locks, Staff `tasks.execute`, approval-before-done, and negative-access tests **PASS**. Owner **21** permissions and `mfa_required` preserved. Historical `done` task unchanged.

**Not authorised:** production deployment, Stage 2 coding.

---

## 2. What changed

| Area | Change |
| --- | --- |
| Permission | New `tasks.execute`; Staff loses `tasks.manage` only |
| Management roles | `owner`, `platform_admin`, `operations_manager`, `department_manager`, `team_manager` **retain** `tasks.manage` |
| Owner catalogue | Still **21** (execute not granted to Owner) |
| Default | `requires_approval` default **true**; open tasks backfilled; existing `done` left as-is |
| Enforcement | BEFORE UPDATE trigger + split RLS (manage insert/update/delete; execute update for assignees) |
| Workflow RPCs | `add_task_progress_note`, `submit_task_for_review`, `decide_task_completion` |
| Admin UI | Execute users: read-only definition fields; progress / submit / notes; managers: review approve/reject |

---

## 3. Post-migration inventory

| Role | `tasks.manage` | `tasks.execute` |
| --- | --- | --- |
| staff | ❌ | ✅ |
| owner | ✅ | ❌ (keeps 21 total) |
| platform_admin | ✅ | ❌ |
| operations_manager | ✅ | ❌ |
| department_manager | ✅ | ❌ |
| team_manager | ✅ | ❌ |
| cms_editor | ❌ | ❌ |

Owner: `mfa_required = true`, account active.

---

## 4. Security regression results

Script: `supabase/tests/m25_task_execute_vs_manage_regression.sql`  
Result: **PASS M25 N1–N10 pack** (Daniel JWT impersonation + Owner decide)

| ID | Test | Result |
| --- | --- | --- |
| N1 | Assignee UPDATE title | **Denied** (instructions preserved) |
| N2 | Assignee UPDATE priority | **Denied** |
| N3 | Assignee → `in_progress` | **Allowed** |
| N4 | Assignee → `done` | **Denied** |
| N5 | Assignee `decide_task_completion` | **Denied** |
| N6 | Owner approve → `done` | **Allowed** |
| N7 | Cross-client progress UPDATE | **No change** (scope held) |
| N9 | Assignee INSERT task | **Denied** |
| N10 | Owner permission count 21 + MFA flag | **PASS** |
| Extra | Reject → `in_progress` → resubmit → approve | **PASS** |
| History | Pre-existing `done` + `requires_approval=false` | **Preserved** |

---

## 5. Progress UI (M26) — implemented

| Change | Detail |
| --- | --- |
| Staff UI | **Progress status** dropdown (Assigned / In Progress / Blocked / On Hold / Awaiting Information) |
| Save | **Save Progress** saves status + note together via `save_task_progress` |
| Notes | Mandatory for Blocked, On Hold, Awaiting Information (UI + backend) |
| History | Chronological **Progress history** with author, status, timestamp |
| Submit | **Submit for Review** remains separate (no Approved/Completed for staff) |
| Owner list / dashboard | Latest progress note shown under task (assignee — title, status, note, date) |
| Regression | `m26_task_progress_ui_regression.sql` — **PASS**; Owner 21 + MFA intact |

## 6. Owner browser UAT checklist (acceptance)

1. Sign in as Owner (MFA) — Tasks create/edit still work; list shows latest staff progress.  
2. Sign in as Daniel — **Your Progress** dropdown + note + **Save Progress**; no Done/Approved.  
3. Set Blocked without a note — must be rejected.  
4. Save Blocked with a note — appears in history and on Owner Tasks/Dashboard.  
5. **Submit for Review** → Owner Approve/Reject.  
6. Confirm instructions / priority / deadline remain read-only for Daniel.

---

## 7. Hold items

| Item | Status |
| --- | --- |
| Production deploy | HOLD |
| Stage 2 implementation | HOLD |
| Public website | HOLD |

---

## 8. Final workflow UAT (2026-10-12)

Executed as Daniel (`daniel.uat@okangroup.test`) and Owner (`okanggroup@gmail.com`) via the same RPCs the admin UI calls (`save_task_progress`, `submit_task_for_review`, `decide_task_completion`), with JWT impersonation + RLS for field protection.

**Sample task retained for Owner inspection:** `M26 Final UAT Homepage Design` (status **done**, 8 history rows).

| Step | Action | Result |
| --- | --- | --- |
| 1 | Daniel: In Progress + note | **PASS** |
| 2 | Daniel: Blocked without note | **PASS** (rejected) |
| 3 | Daniel: Blocked + note | **PASS** |
| 4 | Daniel: Submit for Review | **PASS** (`in_review`) |
| 5 | Owner: Reject with feedback → Daniel resubmit | **PASS** |
| 6 | Owner: Approve | **PASS** (`done` / Completed) |
| 7 | Progress history retained | **PASS** (8 entries, chronological) |
| Protect | Description / priority / title / assignment unchanged by Daniel | **PASS** |
| Owner | Permission count **21**; `mfa_required` true | **PASS** |

### Visual polish (M26 follow-up)

| Item | Status |
| --- | --- |
| Progress `<select>` navy styling (`color-scheme: dark`, option colours) | Applied in `admin/src/styles.css` (browser-dependent for native option list) |

### Interactive browser click-through

Admin login at `http://localhost:5174/admin/login` is reachable. Staff/Owner passwords are not available to Cursor for automated sign-in. Owner may optionally click through the same path in the UI for visual confirmation; backend workflow above already passed.

---

## 9. Acceptance

M26 design previously accepted. Final workflow UAT **PASS** on development. Awaiting Owner Stage 1.1 acceptance decision.

| Hold | Status |
| --- | --- |
| Production deploy | HOLD |
| Stage 2 | HOLD |

**End of report**
