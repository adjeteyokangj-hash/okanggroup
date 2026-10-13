# OkangGroup Operations — Final System UAT & Status Audit

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Scope | Entire OkangGroup Operations (admin + portal + DB) |
| Environment | Supabase `prbgsnxpwyepdggdysnt` (development) |
| Dev verdict | **PASS (development) — feature-complete for intended Operations scope** |
| Production | **HOLD — not authorised** |
| This document | Single reference for remaining work (supersedes guessing next modules) |

**Evidence classes used below**

| Label | Meaning |
| --- | --- |
| **Implemented** | Code + schema present in repo / applied migrations |
| **Dev-tested** | Automated tests and/or prior development UAT with recorded evidence |
| **Owner-approved** | Explicit Owner browser/UAT closed (PASS/FROZEN or equivalent) |
| **Owner pending** | Implemented + Dev-tested; Owner browser confirmation still open |

---

## 1. Module-by-module status

| Module | Implemented | Dev-tested | Owner-approved | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| Owner dashboard | Yes | Yes (BO e2e DASH) | Partial (admin UI upgrade Dev PASS) | **Complete** | Stage % map corrected 2026-10-13 |
| Enquiries → Client | Yes | Yes (BO e2e) | Yes (via BO e2e Owner path historically) | **Complete** | `convert_enquiry_to_client` |
| Client CRM | Yes | Yes | Yes (BO) | **Complete** | Contacts, notes RPC, AM |
| Quotations | Yes | Yes | Yes (PDF final fix + frozen line) | **Complete / FROZEN** | Professional builder + PDF |
| Contracts | Yes | Yes | **Yes — PASS/FROZEN** | **Complete / FROZEN** | m58*; jurisdiction GH |
| Invoices + payments | Yes | Yes | **Owner pending** | **Complete (dev)** | m59*; schedule feedback |
| Expenses | Yes | Yes (math + tsc) | **Owner pending** | **Complete (dev)** | m60* |
| Financial reports | Yes (new) | Yes (tsc) | **Owner pending** | **Complete (dev)** | `/finance/reports` m62-era UI |
| Projects + delivery | Yes | Yes (BO + m61) | **Owner pending** (ops UI) | **Complete (dev)** | Dashboard + CR/deliverables |
| Tasks / approvals / files | Yes | Yes | Yes (staff work + task UAT) | **Complete** | execute vs manage |
| Documents + portal approve | Yes | Yes (BO) | Yes (BO) | **Complete** | version supersede m51 |
| Project handover / close | Yes | Yes (BO CLOSE) | Yes (BO) | **Complete** | Server gate m50 |
| Change requests | Yes | Yes (RPCs + UI) | **Owner pending** | **Complete (dev)** | m61 |
| Staff / depts / roles / MFA | Yes | Yes | Yes (R1 + MFA tests) | **Complete** | Privileged MFA gate |
| Company CMS | Yes | Yes | Yes (CMS UATs) | **Complete** | Local export only |
| Central CMS / visual builder | Yes | Yes | Yes (phase1 + UI quality) | **Complete** | |
| Client CMS integration | Yes | Yes | Yes (hosted/real UATs) | **Complete (dev)** | Live TH production **HOLD** |
| Treasure House shadow/staging | Yes | Yes | Staging activation UAT | **Staging only** | Not production connect |
| Client portal | Yes | Yes (BO SEC) | Yes (BO) | **Complete (dev)** | + deliverable/CR (m61) |
| Automation | Yes | Yes | Dev PASS; browser soft-pending | **Complete (dev)** | Email delivery **off** |
| Notifications | Yes | Yes | Soft-pending browser | **Complete (dev)** | In-app; email HOLD |
| Permissions / RLS / audit | Yes | Yes (BO SEC) | Yes (BO SEC) | **Complete** | Hardening m62 |
| Reporting / analytics | Yes | tsc | Owner pending | **Complete (dev)** | Currency-separated |

---

## 2. Corrections implemented in this finalisation pass

| ID | Issue | Fix |
| --- | --- | --- |
| F-01 | Broken links to `/cms/management` | Point to `/cms-systems` + redirect alias |
| F-02 | `finance.reports.read` had no dedicated surface | Added `FinanceReportsPage` + nav + route |
| F-03 | Dashboard stage progress used obsolete stage keys | Aligned to real project stages |
| F-04 | Advisor: mutable `search_path` on `next_*` generators | m62 `ALTER FUNCTION … SET search_path` |
| F-05 | `uat_set_actor` executable by `authenticated` | Revoked; `service_role` only (m62) |
| F-06 | Integrated ops gaps (CR, deliverable accept, project P&L strip) | Already delivered in m61 + project dashboard (prior assignment); preserved |

**Not rebuilt:** Quotations, Contracts (frozen), Invoice/Expense engines, CMS architecture, MFA, automation engine.

---

## 3. Genuine remaining gaps (not “next modules to invent”)

These are **external / policy / Owner** items — not missing core product modules:

| Gap | Type | Required for production? |
| --- | --- | --- |
| Owner browser confirm Invoices | Owner UAT | Recommended before freeze |
| Owner browser confirm Expenses | Owner UAT | Recommended before freeze |
| Owner browser confirm Project ops dashboard + portal CR/deliverable | Owner UAT | Recommended before freeze |
| Owner browser confirm Finance Reports | Owner UAT | Recommended |
| Enable Auth leaked-password protection | Platform setting | **Yes** before production |
| External email delivery for automation/reminders | Provider config | Optional; currently prepared/off |
| Live Treasure House / real client CMS production connect | Integration + Owner auth | Separate from Operations core |
| Public website deploy | Explicit Owner authorisation | **HOLD** |
| Auto-provision project from accepted contract | Nice-to-have | No — manual link works |
| Sync contract body milestones ↔ `milestones` table | Nice-to-have | No — dual model documented |
| Portal e-sign contracts | Nice-to-have | No — staff records acceptance |

---

## 4. Duplication / overlap (do not rebuild)

| Overlap | Guidance |
| --- | --- |
| Contract milestones (JSON) vs `public.milestones` | Billing vs delivery tracking — leave dual; do not merge casually |
| CMS Systems vs Company CMS vs My Client CMS | Three intentional surfaces |
| Dashboard currency cards vs Finance Reports | Reports is deeper; dashboard stays operational |
| Multiple CMS UAT docs | Historical; this file is the living status |

---

## 5. Security / defects (honest)

| Finding | Severity | Disposition |
| --- | --- | --- |
| SECURITY DEFINER RPCs callable by authenticated | Advisor WARN | **Expected** — RPCs enforce permission checks inside |
| UAT tables with RLS and no policies | INFO | Harness tables; not product |
| Leaked password protection disabled | WARN | **Owner/platform action** before production |
| Client `notes_internal` column exposure risk | Residual (BO UAT) | UI omits; column-level lock optional later |
| `uat_set_actor` | Was callable | **Fixed** m62 |

No CRITICAL open product defect found that blocks Development PASS.

---

## 6. Test results (this pass)

| Check | Result |
| --- | --- |
| `admin` `tsc -b` | **PASS** |
| `npm test` (temp password, MFA, CMS contrast/persist, expenseMath, projectOps) | **PASS** |
| m62 applied (`uat_set_actor` execute for authenticated = false) | **PASS** |
| Prior BO e2e UAT | **PASS (development)** — evidence retained |
| Contracts Owner UAT | **PASS / FROZEN** |
| Invoices / Expenses / Integrated ops / Reports Owner browser | **Not re-run here** — remain Owner pending |

**Rule followed:** Untested Owner browser paths are **not** marked Owner-approved.

---

## 7. Owner UAT still genuinely necessary

Only these browser confirmations remain useful (do **not** re-UAT frozen Quotations/Contracts or BO e2e matrix unless regression suspected):

1. **Invoices** — create / schedule-from-contract / pay / PDF / currency separation  
2. **Expenses** — create / approve / receipt / recurring generate / PDF  
3. **Project operations** — progress cards, CR approve with cost, portal deliverable accept, handover close  
4. **Finance → Reports** — per-currency cards + project profitability rows  
5. **Optional soft:** Automation “Run monitoring” + Notifications inbox (already Dev PASS)

---

## 8. Production readiness checklist

| Item | State |
| --- | --- |
| Core Operations feature set | Ready (dev) |
| RLS + permission model | Ready (dev UAT SEC PASS) |
| MFA hard-gate for privileged | Ready |
| Currency separation | Ready |
| Auth leaked-password protection | **Not enabled** |
| Email delivery | **Off** (by design until configured) |
| Live client website / TH production | **HOLD** |
| Owner production authorisation | **Required — HOLD** |

---

## 9. What exactly remains to finish OkangGroup Operations?

**Product development for Operations is complete** for the intended integrated scope (Enquiry → Client → Quote → Contract → Project → Tasks → Delivery → Acceptance → Invoice → Payment → Handover, plus Staff, CMS, Portal, Automation, Notifications, Reports).

**What remains is not another development phase:**

1. Owner closes the four browser UAT items in §7 (or consciously waives them).  
2. Platform production prep: enable leaked-password protection; decide email provider; freeze env secrets.  
3. Explicit Owner decision to leave HOLD for public/production website and live CMS connectivity.  
4. Only then: production deploy authorisation.

**Next priority (if any engineering after Owner freeze):** production hardening & go-live checklist — **not** rebuilding modules.

---

## 10. Verdict

| Layer | Verdict |
| --- | --- |
| Development / implementation | **PASS** |
| Owner-approved (full system) | **Incomplete until §7 closed** |
| Production | **HOLD** |

**End of report — OkangGroup Operations Final System UAT & Audit**
