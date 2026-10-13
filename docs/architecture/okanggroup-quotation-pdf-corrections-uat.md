# OkangGroup — Quotation PDF Corrections UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Scope | Standalone customer PDF, preview contrast, saved-record print, development-record defaults |
| Environment | Supabase `prbgsnxpwyepdggdysnt` (development) |
| Verdict | **PASS (development)** |
| Public production website | **HOLD** |

---

## Owner findings addressed

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Clean standalone quotation PDF (no admin chrome) | **PASS** — `body.is-printing-quote` hides all UI; only `.quote-print-root` is visible |
| 2 | Professional A4 layout with branding, number, client, dates, lines, currency, totals, terms, notes | **PASS** — `QuotationDocument` component |
| 3 | Sensible page breaks | **PASS** — `@page A4`; line/section `break-inside: avoid` |
| 4 | Preview contrast (headers + Print/PDF) | **PASS** — navy header / white text; solid navy Print button |
| 5 | PDF reflects **saved** quotation status and amounts | **PASS** — print uses `viewing` snapshot from DB, not live unsaved form |
| 6 | Preserve server totals, revise, permissions | **PASS** — unchanged RPCs |
| 7 | Hide synthetic/UAT records by default | **PASS** — `Show development records` off by default (persisted) |
| 8 | Regression / visual PDF verification | **PASS** — admin build; document math check; Owner should re-export OKG-Q-000002 |

---

## Before → after (PDF)

### Before (Owner reported)
- PDF included quotation **plus** quotations list / admin chrome
- Spilled onto a mostly empty second page
- Low-contrast table headings and Print control in preview

### After (implementation)
- Print clones the quotation into `#quote-print-host` **outside** `#root`, then hides the entire admin app (`display: none`)
- This removes the blank second page caused by `visibility: hidden` still reserving layout for the quotations table
- A4 page with issue date, validity, quote number, status, itemised lines, subtotal/tax/total, payment terms, notes
- No sidebar, builder, list, or buttons in the PDF
- Screen preview matches the print document (WYSIWYG for saved quotes)

**Owner re-test:** Hard-refresh → open **OKG-Q-000002** → **Print / PDF** → Save as PDF. Expect **one** clean customer page (no admin table, no empty trailing page).

---

## Development records

| Surface | Default |
| --- | --- |
| Dashboard lists | Hidden (toggle: Show development records) |
| Quotations list | Hidden |
| Enquiries / CMS Management | Hidden |
| Data deletion | **Never** — filter only |

---

## Regression

| Check | Result |
| --- | --- |
| `npm --prefix admin run build` | **PASS** |
| Quotation totals identity (900 + 135 = 1035) | **PASS** |
| `save_quotation_draft` / `revise_quotation` | **Unchanged** |
| Unrelated modules / public website | **Not deployed** |

---

**End of report — Quotation PDF corrections: PASS (development)**
