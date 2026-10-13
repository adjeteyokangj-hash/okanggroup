# OkangGroup — Final Release Gates

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Package | Unified production release (website + Operations) — **prepared, not deployed** |
| Development | **Complete** — no further development cycle |
| Production | **HOLD** until Gate 1 + Gate 2 close, then explicit Gate 4 |

Companion: [`okanggroup-unified-production-release-readiness.md`](./okanggroup-unified-production-release-readiness.md) · Checklist: [`okanggroup-operations-release-readiness-checklist.md`](./okanggroup-operations-release-readiness-checklist.md)

---

## Gate board

| Gate | Status |
| --- | --- |
| Development and integration | ✅ PASS |
| Website desktop and mobile | ✅ PASS |
| Database migrations m0–m64 | ✅ Applied |
| Gate 1 — Owner acceptance | ⏳ OPEN |
| Gate 2 — Security | ⚠️ OPEN — awaiting Owner **B** or **C** |
| Gate 3 — External services | ✅ CLOSED (email OFF; CMS staging/dev; live publish OFF) |
| Gate 4 — Production deployment | ✅ EXECUTED 2026-10-13 — see [`okanggroup-unified-production-deployment-report.md`](./okanggroup-unified-production-deployment-report.md); Gate 2 remains OPEN |

---

## Gate 1 — Consolidated Owner acceptance

**Scope (this pass only):** Invoices · Expenses · Projects · Finance Reports.  
**Closed — do not re-open:** Contracts, Quotations, website visual, CMS, Staff, BO e2e SEC matrix, Client Portal isolation (soft UX optional).

Sign each row in the browser on the current Operations app (`/admin/`). Use **Show test records** where noted.

### 1.1 Invoices — `/finance/invoices`

| # | Check | Pass if | ☐ |
| --- | --- | --- | --- |
| A | Show test records → open **OKG-INV-000001** | Paid, GBP 1,200; preview shows Original / Payments / Credits / Outstanding / Status | ☐ |
| B | Create manual draft → Issue | Amounts lock after issue | ☐ |
| C | Record partial payment (then try overpay) | Outstanding decreases; overpay rejected | ☐ |
| D | Schedule/generate from **active** contract; confirm **approved-only** contract blocked | Eligible milestones once; approved-without-acceptance blocked | ☐ |
| E | Download PDF | Amounts and layout correct | ☐ |
| F | GBP vs GHS | Cards / totals stay **separate** (no FX rollup) | ☐ |

### 1.2 Expenses — `/finance/expenses`

| # | Check | Pass if | ☐ |
| --- | --- | --- | --- |
| A | Create GBP draft with tax | Live net / tax / total correct | ☐ |
| B | Create GHS expense | Summary cards stay **currency-separated** | ☐ |
| C | Submit → Approve → Mark paid | Status + activity log update | ☐ |
| D | Upload receipt; Download PDF | Receipt and PDF OK | ☐ |
| E | Recurring “Generate due” (if schedule exists) | Draft created or explicit “nothing created” | ☐ |

### 1.3 Projects — `/projects` (+ detail)

| # | Check | Pass if | ☐ |
| --- | --- | --- | --- |
| A | Open a project with progress UI | Progress cards readable / update as expected | ☐ |
| B | Milestone or deliverable transition | Status moves per rules; client-review path visible if used | ☐ |
| C | Change request with cost (or confirm UI path) | CR saves; cost field present | ☐ |
| D | Handover / close awareness | Close gate / checklist visible where project is eligible | ☐ |

### 1.4 Finance Reports — `/finance/reports`

| # | Check | Pass if | ☐ |
| --- | --- | --- | --- |
| A | Outstanding / invoiced / paid / expenses | Shown **per currency** — no mixed FX totals | ☐ |
| B | Project profitability rows | Present; link to project works | ☐ |
| C | Show test records toggle | Synthetic rows hide/show without breaking totals logic | ☐ |

### Gate 1 sign-off

| Result | Date | Owner |
| --- | --- | --- |
| ☐ PASS — all rows above accepted | __________ | _________________ |
| ☐ PASS with written waivers (list items): | __________ | _________________ |

**Cursor cannot tick Gate 1 closed without this sign-off (or written waiver of named items).**

---

## Gate 2 — Security decision

**Recommendation:** **Option B** — upgrade Supabase (paid, if required) and enable leaked-password protection before launching client/financial data.

| Option | Meaning | Status |
| --- | --- | --- |
| **A** | Pre-prod defer only | Recorded 2026-10-13 — **does not** close Gate 2 for production |
| **B** | Paid upgrade (if required) + enable HIBP + test login/recovery | **Awaiting explicit Owner cost authorisation** |
| **C** | Written production security exception | Available alternative — Owner writing only |

**Cursor will not:** upgrade the plan, enable Auth HIBP, or treat silence as Option B/C.

### Option B — cost & billing assessment (2026-10-13)

**No upgrade authorised. No billing change performed.** Sources: [supabase.com/pricing](https://supabase.com/pricing), [Password security docs](https://supabase.com/docs/guides/auth/password-security).

| Fact | Detail |
| --- | --- |
| Feature needed | **Leaked password protection** (HaveIBeenPwned) |
| Minimum plan | **Pro** (also on Team / Enterprise). **Not** on Free |
| Extra fee for HIBP alone | **None** — included in Pro+; not a separate Auth add-on |
| Pro plan list price | **From $25 / month** (organisation subscription) |
| Compute | Pro includes **$10/month compute credits** (covers one **Micro** instance). Additional projects bill their own compute |
| Typical single-project Pro bill | **~$25/month** base if one Micro project is covered by the included credits (usage beyond quotas is extra) |
| Billing model | **Organisation-based** — upgrading the org plan upgrades feature entitlements for projects in that org |
| When billed | Pro charged **up front**, monthly; overages at month end |
| Spend cap | **On by default** on Pro (limits surprise overages; can be changed in dashboard) |
| Also gained on Pro (relevant) | No inactivity pause; 7-day daily backups; higher quotas; email support; session controls available |
| Not required for Gate 2 | Team ($599/mo), Phone MFA add-on, PITR, custom domain — optional later |

**Owner must confirm the live quote** in Supabase Dashboard → Organisation → **Billing** for the org that owns `prbgsnxpwyepdggdysnt` (taxes/VAT by billing address may apply). Cursor cannot change org billing or Auth settings via MCP.

### Option B runbook (execute only after Owner authorises cost)

Owner actions in [Supabase Dashboard](https://supabase.com/dashboard) → org billing for project `prbgsnxpwyepdggdysnt`:

1. **Billing / plan** — Upgrade organisation to **Pro** (or higher). Confirm the dashboard price before paying.
2. **Authentication → Email provider / password settings** — Enable **Prevent use of leaked passwords**.
3. **Regression (same session)**  
   - Owner login + MFA still works  
   - Password change / recovery path still works with a strong password  
   - Optional: attempt a known-breached password on a **test** account — expect rejection  
4. Tell Cursor: “Option B complete — HIBP enabled; login/recovery OK.”  
5. Cursor re-checks security advisor (`auth_leaked_password_protection` should clear) and closes Gate 2.1 in the checklist.

MCP cannot change Auth security settings or organisation billing plans; cost tools available to Cursor are for **new project/branch** creation only — not this upgrade.

### Option C (if Owner declines paid upgrade)

Owner provides written text equivalent to:  
*“I accept a documented security exception for first production release: leaked-password protection remains disabled; residual risk of breached/reused passwords is accepted. Interim MFA/RLS/onboarding controls remain.”*  
Then Cursor records Option C and closes Gate 2 for production **only** under that writing.

---

## Gate 4 — When 1 and 2 are closed

Cursor will request **one** explicit Owner line, e.g.:

> I authorise coordinated production deployment of the OkangGroup unified package (public website + Operations including Client Portal, CMS, Finance, Projects, Staff, Automation) to Vercel `okanggroup` / `okanggroup.com` with Supabase `prbgsnxpwyepdggdysnt`, preserving Gate 3 (email OFF, CMS staging/dev, live client publish OFF).

Until then: **no deploy.**

---

## Current ask of Owner

1. Run **Gate 1** consolidated browser pass (or waive named items in writing) — independent of Gate 2.  
2. Review Option B cost (~**$25/month** Pro list price; HIBP included) in your org Billing page, then either **authorise Option B** in writing or choose **Option C**.  
3. Do **not** authorise Gate 4 deploy until Gates 1 and 2 are closed.
