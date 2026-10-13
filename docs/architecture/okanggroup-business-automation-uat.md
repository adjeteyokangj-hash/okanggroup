# OkangGroup — Business Automation & Notifications UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Scope | In-app notification centre, configurable automation rules, outbox/retry, recurring billing, Owner controls |
| Environment | Supabase `prbgsnxpwyepdggdysnt` (development) |
| Verdict | **PASS (development)** |
| Depends on | BO-1…BO-7 E2E PASS + m50/m50b/m51 guards |
| CMS / Treasure House Shadow | **Unchanged** |
| Public production website | **HOLD** |
| Email delivery | **Disabled** until provider verified |

---

## Verdict

Business Automation & Notifications is **PASS on development**. Core BO modules were preserved. Email remains off by default with outbox rows marked `skipped`. Owner browser walkthrough remains recommended before daily operational use.

---

## Delivered

### Database (m52–m54)

| Migration | Purpose |
| --- | --- |
| **m52** `m52_ba1_automation_schema` | Permissions, settings, extended `notifications`, `automation_rules`, `automation_runs`, `notification_outbox`, `recurring_billing_*`, seed rules |
| **m53 helpers / emit / outbox** | `emit_notification` (dedupe), recipient resolution, `process_notification_outbox` |
| **m53b** | Recurring invoice generation + settings RPCs |
| **m53c** | `run_business_automation` sweep |
| **m54** | `client_private_notes` hard-guard; invoice issued + document shared events |
| **m55** | `task_assigned` emit on `task_assignments` insert/update (was kind-only before) |

### Admin / portal UI

- **Notification centre** (`/notifications`, `/portal/notifications`) — unread filter, kind filter, read status, deep links
- **Alerts menu** — unread badge, open centre link, entity links (task/project/invoice/CMS)
- **Automation** (`/automation`) — rule enable/disable, thresholds, email flag, run history, outbox failures, manual sweep
- **Project files** — “Upload new version” sets `version_of` / `version_no` (m51 supersede applies)
- **Client notes** — staff use `get_client_private_notes` / `set_client_private_notes`; `clients.notes_internal` cleared and redirected

### Default rules (configurable)

Task due soon / overdue · Invoice due soon / overdue · Budget warning · Milestone overdue · Change request pending · Handover incomplete · Document approval pending · Owner daily summary · Recurring billing · Invoice issued (event) · Document shared (event)

---

## Automated evidence (`ba_uat_results`)

| ID | Check | Result |
| --- | --- | --- |
| DEDUP-01 | Duplicate emit returns same notification id | **PASS** |
| DEDUP-02 | Owner daily summary once per day | **PASS** |
| OUTBOX-01 | Email channel skipped when disabled | **PASS** |
| OUTBOX-02 | Outbox processor reports `email_enabled=false` | **PASS** |
| PERM-01 | Staff (Daniel) cannot run automation | **PASS** |
| SWEEP-01 | Owner sweep succeeds (11 rules evaluated) | **PASS** |
| NOTES-01 | `clients.notes_internal` null after migration | **PASS** |
| NOTES-02 | Client portal RPC denied for private notes | **PASS** |
| NOTES-03 | Client RLS sees 0 `client_private_notes` rows | **PASS** (when re-checked under `authenticated` + client actor) |
| RECUR-01 | Recurring billing period key prevents duplicate invoices | **PASS** |
| ASSIGN-01 | Assignment insert emits `task_assigned` to assignee | **PASS** |

Regression script: `supabase/tests/m52_business_automation_regression.sql`  
Admin build: `npm --prefix admin run build` — **PASS**

---

## Requirements mapping

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Reuse clients/projects/tasks/finance/staff/permissions | **PASS** |
| 2 | In-app centre with unread, filter, read status | **PASS** |
| 3 | Configurable rules, recipients, schedules, escalation | **PASS** (rules + settings RPCs; escalation on overdue tasks) |
| 4 | Client isolation + RBAC at DB/API | **PASS** (notification recipient RLS; automation perms; notes RLS) |
| 5 | Prevent duplicate notifications and financial generations | **PASS** (dedupe_key + recurring period unique) |
| 6 | No internal notes / sensitive leakage in client notifications | **PASS** (private notes table + body redaction + client-safe invoice text) |
| 7 | Outbox + retry for external delivery | **PASS** (pending/failed backoff; skipped when email off) |
| 8 | Email disabled until provider verified | **PASS** (`email_delivery_enabled=false`) |
| 9 | Owner controls for settings, history, failures | **PASS** (`/automation`) |
| 10 | Automated tests for schedule/perms/retries/dedupe/audit | **PASS** (suite above; runs stored in `automation_runs`) |
| — | Portal never exposes `notes_internal` | **PASS** |
| — | Document replacement sets `version_of` | **PASS** (UI + upload helper) |

---

## Explicit holds

| Item | Status |
| --- | --- |
| Email provider integration | **HOLD** (outbox ready; no send) |
| Public production website | **HOLD** |
| Owner browser walkthrough | **Recommended next** before daily ops reliance |
| pg_cron scheduling of `run_business_automation` | Optional ops follow-up (manual/Owner sweep available now) |

---

## CMS preservation

No CMS or Treasure House Shadow CMS schema/feature changes in this increment.

---

**End of report — Business Automation & Notifications: PASS (development)**
