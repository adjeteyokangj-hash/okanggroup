# OkangGroup — Integrated Business & Project Operations UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Scope | Connect existing Enquiry → Handover modules into one project operations workflow |
| Migration | `m61_integrated_project_operations` (+ applied MCP chunks m61a/b/c) |
| Dev verdict | **PASS (development)** |
| Owner UAT | **Pending** |
| Public / production | **HOLD** |
| Currency rule | GBP / GHS (and others) shown **separately** — never combined |

---

## Approach

Reuse existing BO-1…BO-6 tables, finance modules, portal membership RLS, documents and handover gate. **Extend and connect** — do not rebuild Finance or CMS.

Prior baseline: `okanggroup-business-operations-e2e-uat.md` (lifecycle PASS). This phase productises the weak UX links.

---

## What already existed (preserved)

| Module | Status |
| --- | --- |
| Enquiries → convert client | Preserved |
| Client CRM / contacts / notes | Preserved |
| Quotations / contracts / invoices / expenses | Preserved (professional finance) |
| Projects, tasks, files, CMS panel | Preserved |
| Portal documents approve/reject | Preserved |
| Handover checklist + close enforcement (m50) | Preserved |
| Automation budget / CR / handover alerts | Preserved |

---

## What this phase added

### Database (m61)

| Item | Detail |
| --- | --- |
| `change_requests` columns | `estimated_cost`, `currency_code`, `cost_notes` |
| Portal CR read | Membership can SELECT change requests |
| `save_change_request` | Staff draft/submit with cost + currency |
| `transition_change_request` | draft→submitted→approved/rejected→implemented (+ audit on approve/reject/cancel) |
| `transition_deliverable_status` | Controlled delivery pipeline |
| `transition_milestone_status` | open → in_progress → done |
| `client_decide_deliverable` | Portal accept/reject when `ready_for_review` |
| `client_submit_change_request` | Portal-raised scope requests |

### Admin UI

| Surface | Change |
| --- | --- |
| `ProjectDetailPage` | Operations dashboard: lifecycle strip, progress %, per-currency finance, commercial links, CR workflow, deliverable/milestone transitions, clearer handover |
| Helpers | `projectOps.ts` + unit tests |

### Client portal

| Surface | Change |
| --- | --- |
| `ClientPortalProjectsPage` | Focus project, accept deliverables, submit/view change requests, links to documents/invoices |

---

## Dev acceptance matrix

| # | Requirement | Result |
| --- | --- | --- |
| OP-01 | Reuse tables/RPCs/permissions | **PASS** — no finance/CMS teardown |
| OP-02 | Project ↔ client/contract/tasks/docs/finance | **PASS** — dashboard links + project_id queries |
| OP-03 | Progress, milestones, deadlines, budgets | **PASS** — % cards + plan form |
| OP-04 | Staff assignments / client approvals | **PASS** — tasks link + deliverable portal decide |
| OP-05 | Change requests + cost/currency | **PASS** — save/transition + portal submit |
| OP-06 | Project dashboard + handover | **PASS** — UI + existing close gate |
| OP-07 | Currency separation | **PASS** — `summariseProjectFinance` |
| OP-08 | Audit / MFA / server controls | **PASS** — SECURITY DEFINER + approvals rows; MFA unchanged |
| OP-09 | Avoid unnecessary Finance/CMS edits | **PASS** |
| OP-10 | Regression + this UAT | **PASS** (dev) |
| OP-11 | Production deploy | **HOLD** |

---

## Automated regression

| Check | Result |
| --- | --- |
| `admin` `tsc -b` | run in release check |
| `projectOps.test.mjs` | **PASS** |
| Existing `npm test` suite (incl. expense/cms) | run in release check |
| Prior BO e2e harness | Still valid for API lifecycle; UI Owner path below |

---

## Owner verification

1. Open an active project → confirm lifecycle strip, progress cards, finance per currency.
2. Add milestone → advance to Done; add deliverable → Ready for review.
3. As portal client: Approve deliverable; Submit a change request.
4. As staff: Approve CR with cost in **GBP**; create another CR cost in **GHS** — confirm amounts stay separate.
5. Complete handover checklist → Close project (expect success only when checklist complete).
6. Confirm Quotes / Contracts / Invoices / Expenses pages still behave as in their frozen/pending UAT records.
7. Confirm CMS Management / Company CMS unchanged.

---

## Out of scope / HOLD

- Auto-create project from accepted contract
- Sync contract `body_json` milestones ↔ `public.milestones`
- Portal e-sign of contracts
- Production cutover
