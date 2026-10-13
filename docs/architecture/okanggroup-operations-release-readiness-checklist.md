# OkangGroup Operations — Release-Readiness Checklist

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Last gate review | 2026-10-13 — **Unified production release preparation** complete (no deploy); see [`okanggroup-unified-production-release-readiness.md`](./okanggroup-unified-production-release-readiness.md) |
| Purpose | First production release gate — **not** a new development phase |
| Development | **PASS** (frozen) — see [`okanggroup-final-system-uat.md`](./okanggroup-final-system-uat.md) |
| Production | **HOLD** until every gate below is closed and Owner authorises deploy |
| Unified scope | Public website + Operations + Client Portal + CMS + Finance/Projects/Staff/Automation — one coordinated release |
| Rule | No rebuilding, redesigning, or re-UAT of frozen modules unless a regression is found; **do not deploy while Gate 1 or Gate 2 is open** |

## Gate board (current)

| Gate | Result | Blocker? |
| --- | --- | --- |
| 0 Development freeze | **CLOSED** | No |
| 1 Owner browser acceptance | **OPEN** | **Yes — Owner only** |
| 2 Security (platform) | **OPEN** — Option **A** (pre-prod defer); 2.1 not enabled; interim controls accepted for HOLD-era only | **Yes for production** — Option A does **not** close Gate 2 or waive HIBP for go-live |
| 3 External services | **CLOSED** (Owner 2026-10-13) | No |
| 4 Production authorisation | **HOLD** | **Yes — explicit Owner sign-off** |

**Genuine blockers to production (only):** (1) Owner browser acceptance, (2) Gate 2 Owner decision on leaked-password residual risk (or enable when plan/cost allows), (3) written production authorisation (Gate 4). Gate 3 is closed and is **not** production authorisation.

**Evidence baseline (do not re-run unless regression suspected)**

| Source | What it already proved |
| --- | --- |
| `okanggroup-final-system-uat.md` | Dev PASS; module inventory; corrections F-01…F-06 |
| `okanggroup-business-operations-e2e-uat.md` | Enquiry→handover API/lifecycle + SEC matrix PASS |
| `okanggroup-professional-contracts-uat.md` | Contracts **PASS / FROZEN** |
| Quotation PDF UATs | Quote PDF path closed |
| Staff / CMS / automation UATs | As recorded historically |
| Admin `tsc -b` + `npm test` | PASS at finalisation |

---

## Gate 0 — Development freeze (complete)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| 0.1 | Operations feature set complete for intended scope | ✅ Done | Final system UAT §1 |
| 0.2 | Finance Reports implemented | ✅ Done | `/finance/reports` |
| 0.3 | CMS nav fixed | ✅ Done | `/cms-systems` + alias |
| 0.4 | Dashboard stage map corrected | ✅ Done | Final UAT F-03 |
| 0.5 | DB hardening (search_path / uat_set_actor) | ✅ Done | m62 |
| 0.6 | Automated tests PASS | ✅ Done | Final UAT §6 |
| 0.7 | No further feature development without regression defect | ✅ Policy | This checklist |

**Gate 0: CLOSED** (2026-10-13).

**Freeze instruction:** Treat Quotations, Contracts, and the Operations codebase as **release candidates**. Only bugfixes for confirmed regressions are allowed before go-live.

---

## Gate 1 — Owner acceptance (browser)

**Gate 1: OPEN — Owner only.** Cursor cannot close browser acceptance from evidence alone.

**Consolidated pass (final gates):** Invoices · Expenses · Projects · Finance Reports only — see [`okanggroup-final-release-gates.md`](./okanggroup-final-release-gates.md). Do not reopen Contracts / Quotations / BO e2e / website visual / CMS / Staff.

| # | Area | Owner check (browser) | Pass criteria | Status |
| --- | --- | --- | --- | --- |
| 1.1 | **Invoices** | Create/issue; schedule-from-contract; record payment; Download PDF; confirm GBP vs GHS cards stay separate | Final-gates §1.1 | ☐ |
| 1.2 | **Expenses** | Create with tax; submit/approve; upload receipt; recurring “generate due”; PDF; currency separation | Final-gates §1.2 | ☐ |
| 1.3 | **Projects** | Progress cards; milestone/deliverable transitions; change request with cost; handover checklist; close gate | Final-gates §1.3 | ☐ |
| 1.4 | **Client Portal** | Soft only — isolation already PASS in BO e2e | Optional UX confirm | ☐ / N/A for consolidated pass |
| 1.5 | **Finance → Reports** | Per-currency outstanding/invoiced/paid/expenses; project profitability rows; Show test records toggle | Final-gates §1.4 | ☐ |

**Optional soft checks (Dev already PASS — only if time):**

| # | Area | Note | Status |
| --- | --- | --- | --- |
| 1.6 | Automation “Run monitoring now” | In-app alerts only; email may stay off | ☐ / N/A |
| 1.7 | Notifications inbox | Mark read / category filters | ☐ / N/A |

**Gate 1 exit:** Owner signs below (or waives named items in writing).

| Owner sign-off | Date | Notes / waivers |
| --- | --- | --- |
| _________________ | __________ | |

---

## Gate 2 — Security (platform)

**Gate 2: OPEN — not PASS.** Auth password/security settings were left **unchanged** (Owner: Cancel). Do not upgrade the Supabase plan solely to close this gate without a cost assessment and regression testing of login/recovery.

### 2.1 Leaked-password protection — plan limitation

| Fact | Detail |
| --- | --- |
| Desired control | Supabase Auth **Leaked Password Protection** (HaveIBeenPwned check) |
| Current state | **Disabled** (security advisor WARN, verified 2026-10-13) |
| Attempt outcome | Enabling requires a **higher Supabase plan / paid Auth feature** (dashboard prompts upgrade). Owner cancelled — settings unchanged. |
| Cursor capability | Cannot enable Auth security settings via available MCP tools |
| Policy | **Do not** change password requirements or enable leaked-password protection until: (a) plan/cost assessed, (b) existing-account login + recovery workflows tested against the new requirements, (c) Owner explicitly approves the change |

| # | Item | Status |
| --- | --- | --- |
| 2.1 | Leaked-password protection enabled | ☐ **Not enabled** — deferred |
| 2.2 | MFA for privileged accounts (Owner confirm enrolled) | ☐ Owner confirm |
| 2.3 | Service role / secrets hygiene | ☐ Owner/dev confirm |
| 2.4 | `uat_set_actor` not executable by `authenticated` | ✅ (m62) |

### Interim security controls (acceptable temporary arrangement — assessment only)

These controls are **already in the development system**. They reduce credential-abuse risk but **do not replace** HaveIBeenPwned checking. They support an **interim** posture if the Owner accepts residual risk; they do **not** auto-close Gate 2.

| Control | Present? | Residual risk vs leaked-password |
| --- | --- | --- |
| MFA hard-gate for privileged / required accounts (AAL2 session path) | Yes (m19 + admin MFA flow; unit tests PASS) | Compromised password alone is insufficient when MFA is enforced and enrolled |
| Staff temp-password / force-change / activation flows | Yes (R1 onboarding; temp-password tests PASS) | Does not detect passwords already in breach corpora |
| RLS + permission RPCs; finance/ops SECURITY DEFINER checks | Yes (BO e2e SEC PASS) | Limits blast radius after auth; does not harden password choice |
| `uat_set_actor` revoked from authenticated | Yes (m62) | Harness isolation only |
| Email delivery OFF (Gate 3) | Yes | Reduces outbound phishing surface from Operations; unrelated to password strength |
| Leaked-password / HIBP check | **No** | Users may still set passwords known in public breach dumps |

**Interim recommendation:** Acceptable **only as a temporary HOLD-era arrangement** for continued development/Owner UAT, **if** the Owner explicitly accepts residual risk that weak/reused passwords may remain undetected until HIBP is enabled on a suitable plan.

**Not acceptable as a silent “Gate 2 PASS”** for production without that Owner decision (or without enabling 2.1 after plan upgrade + workflow testing).

### Owner decision required (choose one)

| Option | Meaning | Gate 2 effect |
| --- | --- | --- |
| **A** | Accept interim controls for pre-production work; defer HIBP until plan upgrade + login/recovery test; **production still HOLD** | Gate 2 remains **OPEN** with documented waiver for *pre-prod only* — still blocks Gate 4 until Owner revisits |
| **B** | Upgrade plan (when cost-approved), enable leaked-password protection, test login + password recovery, then close 2.1 | Gate 2 can close after evidence |
| **C** | Explicitly waive 2.1 for first production release (accept residual password risk) | Only Owner may sign; must be written — not inferred |

| Owner Gate 2 decision | Date | Option A / B / C + notes |
| --- | --- | --- |
| **Option A — Pre-production defer** | 2026-10-13 | Accept interim MFA/RLS/onboarding controls for HOLD-era work; do **not** upgrade Supabase solely for HIBP; Auth password settings **unchanged**; Gate 2 remains **OPEN**; **not** a production waiver |
| **Option B — pending cost authorisation** | — | Recommended for unified launch; **not** authorised until Owner explicitly confirms paid upgrade. Runbook: [`okanggroup-final-release-gates.md`](./okanggroup-final-release-gates.md) § Gate 2 |

**Gate 2 exit:** Either 2.1 enabled + tested (Option B), or written Owner waiver for production (Option C). **Option A does not close Gate 2 for production.**

### Public Auth sign-up — remediation evidence (m63)

Owner observation: Supabase **Allow new users to sign up** remains enabled (dashboard **unchanged** — may support recovery/other flows). Operations uses controlled onboarding (`invite-staff` / `create-client-portal-user`).

| Item | Result |
| --- | --- |
| Change | `public.handle_new_user` (m63) — server-side only |
| Unsolicited sign-up | Profile created as `account_status = suspended` (not `active`); no `role_grants` |
| Spoofed `user_metadata.staff_provisioned` / `account_kind` | **Ignored** for authorisation — only `app_metadata` + pending invitation authorise |
| Staff invite / create_staff | Still authorised via `app_metadata.staff_provisioned` → `pending_setup` |
| Client portal user create | Still authorised via `app_metadata.account_kind=client_user` (edge then finalises membership) |
| Pending invitation email | Still → `pending_setup` |
| Auth dashboard “Allow sign-ups” | **Not changed** (Owner approval required to disable) |
| App gate | `Protected` already blocks non-`active` statuses (“Account is suspended”) |
| Tests | `signupQuarantine.test.mjs` PASS; `test:mfa` PASS; `test:temp-password` PASS; live function contains `suspended` + trusts `raw_app_meta_data` |

**Impact review (no Auth toggle):** Password recovery does not create users. MFA unchanged. Invitation + service-role provisioning preserved. Residual: Auth account can still be created if dashboard sign-up stays on, but Operations identity is **quarantined** until Owner/staff provisioning.

**Gate 2 remains OPEN** (Option A / HIBP). This remediation does **not** close Gate 2 or authorise production.

### Public website upgrade — evidence (2026-10-13)

| Item | Status |
| --- | --- |
| Assignment | Upgrade existing Vite marketing site (not a rebuild); Operations modules not reopened |
| UAT | [`okanggroup-public-website-upgrade-uat.md`](./okanggroup-public-website-upgrade-uat.md) — **DEV PASS** |
| Enquiry path | m64 `submit_website_enquiry` → `business_enquiries` (`source=website`); `npm run test:website-enquiry` PASS |
| CMS | Consumes `content/cms/current.json` overlays when published pages exist |
| Client Portal | Links to `/admin/login` |
| Auth dashboard | Unchanged |
| Deploy prep (logo + anon key) | **PASS** — `dist/okanggroup-logo.jpg` verified; local `VITE_SUPABASE_ANON_KEY` → `prbgsnxpwyepdggdysnt` (`role=anon`); no service-role in browser bundle |
| Visual design | **Owner APPROVED** 2026-10-13 — refinement CLOSED; fixed nav scroll behaviour confirmed OK |
| Production deploy | **Still HOLD** (Gate 3.4 / Gate 4) — website visually ready; awaits explicit deploy authorisation |

---

## Gate 3 — External services (explicit decisions)

**Gate 3: CLOSED** (Owner approved 2026-10-13). Config verified against decisions — no activation or deploy performed.

| # | Service | Owner decision | Config match | Status |
| --- | --- | --- | --- | --- |
| 3.1 | **Email delivery** | **OFF** for initial launch | `email_delivery_enabled=false`; `email_provider=none`; `email_provider_configured=false` | ✅ |
| 3.2 | **CMS connectivity** | **Staging only** | Connections present are `manual_only` / `okang_dev_client` (dev/staging adapters); no production Treasure House cutover | ✅ |
| 3.3 | **Live client CMS publishing** | **DISABLED** | No live production publish enablement performed; staging/dev adapters unchanged | ✅ |
| 3.4 | **Public OkangGroup website** | **HOLD** | Upgrade complete in repo (UAT below); **no production deploy** | ✅ |
| 3.5 | **Production deployment** | **HOLD** | Gate 4 remains open — Gate 3 close ≠ production authorisation | ✅ |

| Owner Gate 3 confirmation | Date |
| --- | --- |
| External-service decisions recorded as above | 2026-10-13 |

**Policy:** Cursor will not enable email delivery, live CMS publishing, public website deploy, or Operations production without a later explicit Owner instruction.

---

## Gate 4 — Production authorisation

| # | Item | Status |
| --- | --- | --- |
| 4.1 | Gates 0–3 complete (or waivers recorded) | ☑ Gates 0 + 3 closed; Gates 1–2 still open |
| 4.2 | Target environment named (project ref / URL) | ☑ Prep: Supabase `prbgsnxpwyepdggdysnt`; Vercel `okanggroup` → `okanggroup.com` (+ `/admin/`) — Owner confirms at Gate 4 |
| 4.3 | Backup / rollback plan noted | ☑ Documented in unified release readiness §6 |
| 4.4 | **Explicit Owner written authorisation to deploy** | ☐ — request only after Gates 1–2 close |
| 4.5 | Deploy executed | ☐ — only after 4.4 |

> **Production remains HOLD until 4.4 is signed.**

| Owner production authorisation | Date | Environment |
| --- | --- | --- |
| I authorise production deployment of OkangGroup Operations: _________________ | __________ | __________ |

---

## What we will not do

- Start another development phase  
- Rebuild or redesign completed / frozen modules  
- Repeat Owner UAT for Contracts, Quotation PDF, or BO e2e unless a regression is proven  
- Mark production PASS without Gate 4  

---

## One-line summary

**Unified release prepared (website + Operations); builds PASS; Gate 3 preserved (email OFF, CMS staging/dev, live publish OFF). Gate 1 OPEN (Owner browser). Gate 2 OPEN — Option A is pre-prod only; production needs Owner B (upgrade + HIBP) or C (written exception). Gate 4 HOLD — no deploy requested while Gates 1–2 open. Production remains HOLD.**
