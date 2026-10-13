# OkangGroup — Admin workspace: Professional Expenses + Priority-2 polish UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Scope | Priority 1 professional Expenses; Priority 2 polish CMS Management, Company CMS, Staff/Roles, Automation, Notifications |
| Dev verdict | **PASS (development)** |
| Owner UAT | **Pending** |
| Public / production | **HOLD** |
| Currency rule | Totals shown **per currency only** — never combined across codes |

---

## Priority 1 — Professional Expenses

### Delivered

| Area | What shipped |
| --- | --- |
| Schema (m60) | `expense_categories`, `expense_vendors`, expanded `expenses`, `expense_recurring_schedules`, `expense_attachments`, `expense_events`, RLS, `expense-receipts` storage bucket |
| RPCs | `save_expense`, `transition_expense_status`, `save_expense_vendor`, `save_expense_category`, `save_recurring_expense`, `generate_due_recurring_expenses` (+ private `log_expense_event`) |
| Admin workspace | `/finance/expenses` — builder, filters, per-currency summaries, approval transitions, vendors/categories, recurring + generate due, receipt upload, PDF export |
| Helpers | `expenseMath.ts`, `ExpenseDocument`, `exportExpensePdf`, `uploadExpenseReceipt` |

### Status workflow

Draft → Submitted → Approved → Paid / Reimbursed  
Also: Recorded shortcut, Reject → Draft, Cancel / Void as allowed by RPC.

Amount model: **net (ex-tax) + tax % → total** (server recalculates on save).

### Dev acceptance

| # | Requirement | Result |
| --- | --- | --- |
| E1 | Categories & vendors | **PASS** — tables + RPCs + UI forms |
| E2 | Create / edit draft expense | **PASS** — `save_expense` |
| E3 | Submit / approve / reject / pay | **PASS** — `transition_expense_status` |
| E4 | Tax + multi-currency (no FX mix) | **PASS** — summaries per currency |
| E5 | Receipt attachments | **PASS** — storage + `expense_attachments` |
| E6 | Recurring + generate due | **PASS** — explicit “0 created” message when nothing due |
| E7 | PDF document export | **PASS** — shared keep-together PDF engine |
| E8 | Permissions | **PASS** — `finance.expenses.read` / `.manage` |
| E9 | Show test records toggle | **PASS** — same pattern as Invoices |
| E10 | Production deploy | **HOLD** |

### Regression (automated)

| Check | Result |
| --- | --- |
| `admin` `tsc -b` | **PASS** |
| `expenseMath.test.mjs` | **PASS** |
| Existing admin unit tests (`npm test`) | run as part of release check |

---

## Priority 2 — Admin surface polish

| Surface | Change |
| --- | --- |
| CMS Management | Compact create form; pending reviews split into genuine vs Development/UAT (dev badge; hidden unless “Show development records”); richer row + search |
| Company CMS | Empty state when no pages; header actions + CMS Management link; filtered count |
| My Client CMS | Link to CMS Management |
| Staff | Consistent `page-head-actions`; Org settings button |
| Staff org settings | Side-by-side departments/titles; compact create rows; status chips; staff counts; Back to staff |
| Automation | Engine enabled as immediate-save checkbox in status banner; denser activity/outbox lists |
| Notifications | Stack duplicate kind+title; group mark-read; tighter cards; clearer unread copy |
| Shared CSS | Fixed-size checkboxes (`.check` / `.check-row--inline`); layout helpers for the above |

Permissions, CMS architecture, and finance workflows outside Expenses were **not** redesigned. `FinanceExpensesPage` and the CMS visual editor were left to the Expenses track (Priority 1).

---

## Owner verification (Expenses)

1. Open **Finance → Expenses** as Owner.
2. Add a category and a vendor.
3. Create a **GBP** draft expense with tax; confirm live net/tax/total.
4. Create a **GHS** expense; confirm summary cards stay **separate** (no combined total).
5. Submit → Approve → Mark paid; confirm activity log.
6. Upload a receipt; download it; **Download PDF**.
7. Create a recurring schedule due today; **Generate due recurring**; confirm draft created or explicit “nothing created”.
8. Toggle **Show test records** and confirm synthetic rows hide/show.

## Owner verification (polish)

1. Company CMS / My CMS headers navigate to CMS Management.
2. Staff → Org settings → Back to staff.
3. Automation status banner still readable; Run monitoring still available.
4. Notifications mark selected / mark all still work.

---

## Out of scope / HOLD

- Live production cutover
- FX conversion or multi-currency rollup
- Email delivery of expense approvals
- Client portal expense views

---

## Related frozen / pending records

| Area | Status |
| --- | --- |
| Contracts | Owner PASS / FROZEN |
| Invoices | Dev PASS / Owner UAT pending |
| Expenses + admin polish | Dev PASS / Owner UAT pending (this record) |
