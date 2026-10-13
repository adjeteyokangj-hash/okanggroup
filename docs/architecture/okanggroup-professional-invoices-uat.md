# OkangGroup — Professional Invoices System (Development UAT)

| Field | Value |
| --- | --- |
| Status | **Development implementation PASS · Owner UAT pending** (not frozen until browser checklist confirmed) |
| Date | 2026-10-13 |
| Production | **HOLD** |
| Scope | Integrated Finance → Invoices + Owner UAT polish (schedule feedback, balance clarity, register visibility) |
| Out of scope | Client email sending, FX combined totals, Contracts redesign, public production deploy |

## Journey enabled

**Quotation → Accepted quotation → Contract → Client acceptance → Invoice → Payment → Currency-separated reporting**

Independent (standalone) invoices remain supported. Internal contract **Approved** alone cannot generate schedule invoices.

## What shipped

### Database (m59 / m59g)

| Item | Detail |
| --- | --- |
| Statuses | `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `void`, `cancelled`, `credited` |
| Columns | `schedule_key`, `payment_instructions`, `discount_total` on `invoices` |
| Payments | `mobile_money` method; unique `(invoice_id, provider_ref)` for recorded payments |
| Reminders | `invoice_reminders` (in-app only, daily dedupe key) |
| RPCs | `save_invoice_draft`, `cancel_invoice`, `record_invoice_payment`, `apply_credit_note`, `create_invoices_from_contract_schedule` (detailed feedback), `refresh_overdue_invoices`, `queue_invoice_reminder` |

### Admin UI

- Currency-separated summary, filters, multi-line builder, live preview, register, issue/cancel, payments, credits, reminders, PDF.
- Branded `InvoiceDocument` with balance banner + account balance table (original / payments / credits / outstanding / status).
- Schedule generation returns an explicit Owner message when zero drafts are created.

### Preserved

- Existing invoices including **OKG-INV-000001** (paid GBP 1,200 · BO UAT Synthetic Ltd).
- Frozen Contracts module (schedule RPC feedback only).
- No automatic client email for reminders.

## Owner final corrections (2026-10-13)

| # | Finding | Fix | Result |
| --- | --- | --- | --- |
| 1 | “Created 0 draft…” with no explanation | RPC returns `message`, `already_invoiced[]`, `schedule_total`, `skipped`; UI surfaces that message | **PASS** (dev) |
| 2 | Balance hard to scan on preview/PDF | Banner + Account balance table: original, payments, credits, outstanding, status | **PASS** (dev) |
| 3 | Payments/credits must refresh display | Actions reopen invoice from server after pay/credit | **PASS** (dev code path) |
| 4 | Issued amounts must stay locked | `save_invoice_draft` rejects non-draft; UI note that corrections use credit notes | **PASS** (RPC + UI) |
| 5 | Paid UAT invoice missing unless Show test records | Client **BO UAT Synthetic Ltd** matches UAT/synthetic filter; empty-state now tells Owner to enable Show test records | **PASS** (dev) |

### Why “Created 0” can be correct

- **OKG-C-000002** is **Approved** — not eligible (must be accepted/active). Generation is refused with a clear error.
- **OKG-C-000001** is **Active** — eligible. If the schedule is empty/missing, or every milestone is already invoiced, generation returns **created: 0** with an explicit message (not a silent failure).

## Development acceptance

| # | Check | Result |
| --- | --- | --- |
| 1 | Manual draft create (`save_invoice_draft`) | **PASS** |
| 2 | Contract schedule generation + feedback feedback | **PASS** |
| 3 | Partial/full payments + overpay / ref dedupe | **PASS** |
| 4 | Credit notes + balance refresh | **PASS** |
| 5 | Overdue refresh | **PASS** |
| 6 | PDF balance fields match server totals | **PASS** (document uses saved model) |
| 7 | Currency separation | **PASS** (`invoiceMath.test.mjs`) |
| 8 | Duplicate prevention | **PASS** |
| 9 | Permissions on write RPCs | **PASS** |
| 10 | Contracts regression + admin `tsc -b` | **PASS** |

## Owner browser checklist (freeze gate)

1. Enable **Show test records** → confirm **OKG-INV-000001** (Paid, GBP 1,200) appears in the register.
2. Open that invoice → preview/PDF show Original / Payments / Credits / Outstanding / Status.
3. Create a small manual draft → Issue → amounts lock → Record partial payment → status/outstanding update → Apply credit → balances update.
4. Generate from **OKG-C-000001** (active): read the result message (created or already-invoiced explanation). Confirm **OKG-C-000002** (approved) is not listed / cannot generate.
5. Queue reminder → Owner in-app only; no client email.
6. Confirm Contracts / Quotations unchanged; production remains HOLD.

## Safeguards (confirmed in RPC)

| Rule | Enforcement |
| --- | --- |
| Outstanding balance never goes negative | `record_invoice_payment` / `apply_credit_note` reject amounts above outstanding; balances use `GREATEST(..., 0)` |
| Same payment reference cannot post twice | Unique index on `(invoice_id, provider_ref)` for recorded payments + RPC duplicate check |
| Issued amounts not silently edited | `save_invoice_draft` only allows `status = draft` |

## Decision

**Development implementation PASS · Owner UAT pending.**  
Do **not** mark **PASS / FROZEN** until the consolidated browser workflow below is confirmed. Then proceed to **Finance → Expenses**, keeping Quotations, Contracts and Invoices frozen. **Production remains HOLD.**

### Freeze gate (Owner browser)

| Test | Expected |
| --- | --- |
| Open OKG-INV-000001 (Show test records) | Paid — GBP 1,200 |
| Create manual invoice | Draft saved |
| Issue invoice | Original amounts locked |
| Record partial payment | Outstanding decreases; overpay rejected |
| Apply credit note | Outstanding recalculates; original total preserved |
| Generate from Active contract | Eligible milestones invoiced once |
| Generate from Approved contract | Blocked until client acceptance |
| Download PDF | Correct amounts; clean layout |
| Reminders | Correct outstanding invoice; in-app only |
