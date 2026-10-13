# OkangGroup — Complete Business Automation UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Scope | Unattended scheduling, delivery verification, email prep, Owner schedule controls |
| Environment | Supabase `prbgsnxpwyepdggdysnt` (development) |
| Verdict | **PASS (development)** — schedule **active** hourly |
| Prior BA UAT | `okanggroup-business-automation-uat.md` (m52–m55) |
| CMS / Treasure House / BO | **Preserved** |
| Public production website | **HOLD** |
| Owner browser walkthrough | **Still required** for UX acceptance |

---

## Verdict

Unattended automation is **operational in development** via `pg_cron` job `okang-business-automation` (hourly), calling the existing `run_business_automation` engine through `private.scheduler_tick()` with overlap protection. Email delivery remains **off**; provider configuration is prepared only. Manual **Run sweep now** is preserved.

---

## Scheduling decision

| Option | Assessment |
| --- | --- |
| **pg_cron (chosen)** | Native Postgres, zero network hop, can call SQL/SECURITY DEFINER directly, inspectable via `cron.job` / `cron.job_run_details`, Owner toggle via RPCs |
| Edge Function + pg_net | Extra auth/secret surface; unnecessary when the engine is already SQL |

Enabled extension: **pg_cron** (`m56a`). Job command: `SELECT private.scheduler_tick();`

---

## Delivered (this increment)

| Item | Detail |
| --- | --- |
| **m56a** | Enable `pg_cron` |
| **m56b** (auth patch) | `private.automation_invoke_allowed()` — scheduler GUC `okang.ba_scheduler=1` |
| **m56** | `scheduler_tick`, `set_automation_schedule`, `get_automation_schedule_status`, `configure_email_provider`, outbox provider gate |
| **m56c** | Overlap: advisory lock + skip when a `running` sweep exists |
| **Admin UI** | `/automation` — enable/disable schedule, cron expression, cron history, email prep panel; manual sweep kept |

---

## Automated evidence (`ba_complete_uat`)

| ID | Check | Result |
| --- | --- | --- |
| SCHED-01 | Schedule status RPC | **PASS** |
| SCHED-02 | Enable schedule (Owner) | **PASS** |
| SCHED-03 | `scheduler_tick` executes engine | **PASS** |
| SCHED-04 | Overlap skipped when run in progress | **PASS** |
| SCHED-05 | Staff cannot manage schedule | **PASS** |
| SCHED-06 | Cron job active in development | **PASS** |
| EMAIL-01 | Cannot enable delivery without configured provider | **PASS** |
| EMAIL-02 | Prep saves provider with delivery still false | **PASS** |
| NOTE-01 | Client notification body redacts `notes_internal` + portal link | **PASS** |
| READ-01 | Mark read as recipient | **PASS** |
| RECUR-01 | Recurring billing period dedupe | **PASS** |
| MANUAL-01 | Owner manual sweep still works | **PASS** |

Admin build: `npm --prefix admin run build` — **PASS**

### Live delivery samples (development DB)

| Audience | Evidence |
| --- | --- |
| Owner | Recent kinds include `recurring_invoice_created` → `/finance/invoices`, `owner_summary` → `/`, `owner_alert` |
| Staff | `task_assigned` present for assignee `928646aa-…` (m55) |
| Client portal | `invoice_due_soon` → `/portal/invoices`, `client_update` → `/portal/notifications`, CMS approval notices |
| Schedule | `cron.job` `okang-business-automation` = `0 * * * *`, **active=true** |
| Email | `email_delivery_enabled=false`; provider prep via `configure_email_provider` only |

---

## Requirements mapping

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Inspect safest scheduling method | **Done** — pg_cron |
| 2 | Unattended server-side execution in development | **Operational** — hourly job active |
| 3 | Configurable, authenticated, idempotent, overlap-safe | **PASS** |
| 4 | Owner enable/disable/inspect | **PASS** (`/automation`) |
| 5 | Preserve manual Run sweep now | **PASS** |
| 6 | Verify Owner/staff/client notifications | **PASS** (RPC/SQL evidence; browser walkthrough still pending) |
| 7 | Assignments, overdue, approvals, invoices, budget | **PASS** (engine + m55 assign + schedule rules) |
| 8 | Read/unread + navigation links | **PASS** (read RPC; `link_path` on emits) |
| 9 | Recurring billing no duplicates | **PASS** |
| 10 | Scheduler failures, retries, audit, recovery | **PASS** (failed runs logged; outbox retry; overlap skip) |
| 11 | Email provider prep without activating send | **PASS** |
| 12 | Internal notes never in client notifications | **PASS** |

---

## Fully operational vs Owner configuration

### Fully operational (development)

- In-app notification centre (staff + portal)
- Automation rules + manual sweep
- **Unattended hourly schedule** (`0 * * * *`)
- Overlap protection and run audit (`automation_runs`, cron history)
- Recurring billing idempotency
- Task assignment notifications (m55)
- Client notes hard-guard + body redaction

### Requires Owner configuration / acceptance

| Item | Needed from Owner |
| --- | --- |
| Cron cadence | Change expression in `/automation` if hourly is not desired |
| Email provider | Choose Resend/SMTP, set From, verify provider, then mark configured — **do not enable delivery until verified** |
| Browser walkthrough | Confirm usability of Automation, Alerts, portal notifications, finance/docs deep links |
| Production go-live | Explicit HOLD — not part of this increment |

---

## Explicit holds

| Item | Status |
| --- | --- |
| External email sending | **HOLD** (outbox skips; transporter not wired) |
| Public production website | **HOLD** |
| Owner browser UX acceptance | **Pending** (recommended next platform milestone) |

---

**End of report — Complete Business Automation: PASS (development)**
