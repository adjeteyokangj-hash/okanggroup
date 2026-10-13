# OkangGroup — Professional Contract Management UAT

| Field | Value |
| --- | --- |
| Status | **PASS / FROZEN (Development)** — Owner final PDF UAT closed |
| Date | 2026-10-12 |
| Production | **HOLD** |
| Scope | Contracts upgrade (builder, templates, quotation snapshot, workflow, PDF, acceptance evidence, invoice linkage) + layout/tax + final PDF/wording/jurisdiction polish |
| Out of scope | Live Treasure House, real client outbound agreements, certified e-signature provider, public production deploy |

## Owner UAT finding addressed

The Contracts module previously offered only basic registration (client, optional quote, title, value). It now supports professional agreement preparation aligned with the Quotations module, with additional protections for binding agreements.

## What shipped

### Database (m58)

- Expanded `contracts.status`: `draft` → `internal_review` → `approved` → `sent` → `accepted` → `active` → `completed` / `terminated` (+ `cancelled`, `rejected`).
- Agreement columns: `body_json`, `quotation_snapshot_json`, `acceptance_json`, `template_code`, `version_no`, `parent_contract_id`, `project_id`, `subtotal`, `tax_total`, `payment_terms`.
- `contract_templates` with Owner-manageable seed: **OkangGroup Service Agreement** (`okang_service_agreement`).
- `contract_versions` immutable history snapshots.
- RPCs (SECURITY DEFINER, `finance.contracts.manage` gated):
  - `save_contract_draft` — create/update drafts; **only `status=accepted` quotations** may be linked; quotation snapshot written once at create and never overwritten.
  - `transition_contract_status` — allowed workflow edges only.
  - `record_contract_acceptance` — evidence (name, email, method, document version, timestamp); `legal_esignature: false`.
  - `revise_contract` — amendment draft preserving original quotation snapshot.
  - `create_invoices_from_contract_schedule` — draft invoices from payment % schedule (accepted/active only).

### Admin UI

- Contract builder: template, client, accepted-quote import, project link, scope, services, deliverables, milestones, payment schedule, responsibilities, T&Cs.
- Register actions: open / edit / view / PDF / workflow transitions / acceptance / amendment / generate invoices / version history.
- Branded OkangGroup agreement preview + A4 PDF (same html2canvas/jsPDF path as quotations — no browser chrome).
- Draft quotations are not listed for import (query filters `status=accepted`); server rejects non-accepted links.

### Preserved

- Existing contract **OKG-C-000001** (active, GBP 1,200).
- Quotation builder unchanged.
- Client isolation / permission model reused (`finance.contracts.read` / `.manage`).
- Public production remains HOLD; no live TH connectivity; no real client sends.

## Development UAT results

| # | Scenario | Result |
| --- | --- | --- |
| 1 | Schema columns + templates + versions table present | **PASS** |
| 2 | Seed template `okang_service_agreement` present with scope + payment schedule | **PASS** |
| 3 | All five contract RPCs deployed as SECURITY DEFINER | **PASS** |
| 4 | `OKG-Q-000002` remains `draft` — not importable / not binding | **PASS** (status=draft; UI lists only accepted; RPC raises on non-accepted) |
| 5 | `OKG-C-000001` preserved (active, GBP 1,200) | **PASS** |
| 6 | `contractBody` unit helpers (quote lines → GHS 1,035 totals; transitions) | **PASS** (`contractBody.test.mjs`) |
| 7 | Admin TypeScript build (`tsc -b`) | **PASS** |
| 8 | Independent contract from template (Owner browser) | **Owner UAT** |
| 9 | Accepted quotation import + immutable snapshot (Owner browser) | **Owner UAT** — requires a quotation marked `accepted` first |
| 10 | Amendment after acceptance creates new draft version | **Owner UAT** |
| 11 | PDF download A4 branded agreement | **Owner UAT** |
| 12 | Record acceptance evidence + activate + generate invoices | **Owner UAT** |
| 13 | Staff without `finance.contracts.manage` cannot approve/activate | **Owner UAT** (RPC enforces) |

## Owner UI checklist

1. Open **Finance → Contracts**. Confirm register shows OKG-C-000001 (enable “Show test records” if hidden).
2. Click the row → preview / Download PDF.
3. **New contract** → template **OkangGroup Service Agreement** loads scope, deliverables, milestones, payment schedule, responsibilities, T&Cs.
4. Select a client; leave quotation empty → save draft → verify number assigned and version history shows “Initial draft”.
5. Attempt to use draft quote **OKG-Q-000002** → it must **not** appear in the Accepted quotation list.
6. Mark a test quotation as **accepted** (not OKG-Q-000002 unless intentionally accepted for UAT) → import → services/tax/currency populate → save → confirm “Quotation snapshot locked”.
7. Workflow: Draft → Internal review → Approved → Sent → **Record acceptance** (name + method) → Active.
8. **Generate invoices** → draft invoices appear under Finance → Invoices with schedule labels.
9. **Create amendment** → new draft with “(Amendment)” title; original snapshot retained; edit services without changing the source quotation.
10. Confirm no agreements were emailed to real clients; production remains HOLD.

## Important note on OKG-Q-000002

Quotation **OKG-Q-000002** (Testing GHS 300 + Update Webpage GHS 600 + tax GHS 135 = **GHS 1,035**) is a **draft**. It must not be treated as accepted or used to create a binding agreement until Owner formally accepts it in Quotations.

## Owner UAT corrections (2026-10-12 follow-up)

| # | Finding | Fix | Result |
| --- | --- | --- | --- |
| A | Builder ~⅓ width, empty space | Two-column `quote-builder-grid` / `contract-builder-grid` (~60% / ~40%), `form-compact` (no 720px cap) | **PASS** (dev) |
| B | Preview collapsed to toolbar only | Preview was rendered inside off-screen `quote-print-host-export`. Now on-screen in `quote-print-root`; PDF clones a separate saved copy | **PASS** (dev) |
| C | Responsive | Existing `@media (max-width: 900px)` stacks `quote-builder-grid` to one column | **PASS** (dev) |
| D | GHS 15 tax with zero services | Tax type: **Percentage of services** vs **Fixed tax amount**. Percent tax = 0 when subtotal = 0 (client + server `m58c`) | **PASS** (unit + RPC) |
| E | PDF vs live totals | Live preview updates while typing; **Download PDF** requires a saved contract and exports **server totals** only | **PASS** (dev) |

### Tax rules (authoritative)

- **Percentage:** `tax = round(subtotal × tax_rate / 100, 2)`; if `subtotal ≤ 0` or `tax_rate ≤ 0` then `tax = 0`.
- **Fixed:** `tax =` entered amount (explicit; not a percentage).
- Server recalculates on `save_contract_draft` (m58c).

### Regression

| Check | Result |
| --- | --- |
| `contractBody.test.mjs` (zero-service percent tax, quote 15% → 1035) | **PASS** |
| `tsc -b` admin | **PASS** (see build log) |
| m58 workflow / templates / snapshots / acceptance / versions | **Preserved** |

## Owner UAT final polish (2026-10-12)

Financials for **OKG-C-000002** already matched (GHS 2,185.00). Remaining items:

| # | Finding | Fix | Result |
| --- | --- | --- | --- |
| F | PDF orphaned “Client” heading at page break | `[data-pdf-keep]` bands + `choosePdfSliceHeight` in shared PDF slicer (`exportQuotationPdf`, contracts enable `keepTogether`) | **PASS** (unit) |
| G | Independent contract still referenced accepted quotation | Adaptive scope/T&Cs (`adaptAgreementCopy`); template + soft migrate independent drafts on legacy text (`m58d`) | **PASS** (DB + unit) |
| H | Hard-coded England & Wales jurisdiction | `governing_jurisdiction` in body_json; UI select; GHS → Ghana / else England & Wales defaults | **PASS** (DB + unit) |

### Preserved on OKG-C-000002 after m58d

- Value **GHS 2,185.00**, tax **GHS 285.00**, status **draft**, version **1**
- Independent wording (no accepted-quotation implication); governing law **Ghana**
- OKG-C-000001 (active, GBP 1,200) unchanged financially

### Regression (final polish)

| Check | Result |
| --- | --- |
| `contractBody.test.mjs` (wording + jurisdiction + tax) | **PASS** |
| `exportQuotationPdf.test.mjs` (one-page plan + keep-together slice) | **PASS** |
| `tsc -b` / admin production build | **PASS** |

## Owner final UAT (OKG-C-000002-3.pdf) — PASS

| Check | Result |
| --- | --- |
| Financials GHS 2,185.00 (tax 15% / 285.00) | **PASS** |
| Independent wording + Governing law Ghana | **PASS** |
| PDF pagination / responsibilities kept together | **PASS** |
| Payment schedule 40% / 40% / 20% | **PASS** |

### Internal approval vs client acceptance (confirmed)

- **Approved** = internal workflow only (shown on PDF as Status).
- **Client acceptance** is a separate step (`record_contract_acceptance` → status `accepted`).
- **Invoice generation** from payment schedule is allowed only for `accepted` / `active` (server + UI). Approved alone cannot activate or generate acceptance-dependent invoices.

## Decision

**CONTRACTS — PASS / FROZEN (Development).** No further Contracts redesign. Next increment: **Finance → Invoices** (creation, contract-linked schedules, partial payments, balances, credit notes, reminders, branded PDFs, currency-separated reporting). **Production remains HOLD.**
