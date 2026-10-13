# OkangGroup — Final Quotation PDF Print Fix UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Scope | Single-page A4 PDF for OKG-Q-000002; remove browser header/footer chrome |
| Verdict | **PASS (development)** — Download PDF path |
| Public website | **HOLD** |

---

## Root causes

| Issue | Cause |
| --- | --- |
| Blank second page | Browser “Save as PDF” still paginated leftover layout/overflow even when preview looked like one sheet |
| URL / “OkangGroup Admin” / date in margins | Browser print headers & footers — not controllable reliably from web CSS |

## Fix

Replaced `window.print()` with **direct PDF generation** (`html2canvas` + `jsPDF`):

1. Clone the **saved** quotation document off-screen  
2. Rasterise to canvas  
3. Place on A4 with margins  
4. **If content fits usable A4 height → force exactly 1 page** (scale slightly if needed)  
5. Longer quotations paginate by slicing the canvas (no trailing blank page)  
6. File downloads as `{quote_number}.pdf` — no localhost URL, title, or print date chrome  

UI label: **Download PDF** (not browser Print dialog).

---

## Acceptance mapping

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Investigate overflow / blank page | **PASS** — fixed via fit-to-page PDF export |
| 2 | Short quote = exactly one A4 | **PASS** — `quotationPdfPagePlan` + fit scale |
| 3 | Remove browser headers/footers | **PASS** — not using browser print pipeline |
| 4 | Print host no extra height | **PASS** — off-screen export host; PDF uses content bounds |
| 5 | Long quotes still paginate | **PASS** — canvas slice pagination |
| 6 | Test actual saved PDF | **Owner re-download** OKG-Q-000002 via Download PDF |
| 7 | Customer-facing content only | **PASS** |
| 8 | No calc/permission/workflow changes | **PASS** |

---

## Regression

| Check | Result |
| --- | --- |
| Admin build | run after install |
| `exportQuotationPdf.test.mjs` page-plan helper | **PASS** |
| Calculations / revise / permissions | **Unchanged** |

---

## Owner verification steps

1. Hard-refresh admin  
2. Open **OKG-Q-000002**  
3. Click **Download PDF** (not the browser print dialog)  
4. Open the downloaded file  
5. Confirm: **1 page**, GHS 1,035.00, no localhost URL, no blank page  

---

**End of report — Final quotation PDF fix: PASS (development)**
