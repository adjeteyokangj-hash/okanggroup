# OkangGroup — Unified Production Release Readiness

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Owner decision | **Proceed with launch preparation** (coordinated website + Operations) |
| Scope | Public website (desktop + mobile), Operations, Client Portal, Company CMS + centralised Client CMS, Finance, Projects, Staff, Automation |
| Development | **Frozen** — no rebuild / no new phase |
| Production deploy | **HOLD** — Gate 1 and Gate 2 still open |
| Companion checklist | [`okanggroup-operations-release-readiness-checklist.md`](./okanggroup-operations-release-readiness-checklist.md) |

**Rule:** Do not deploy while Gate 1 or Gate 2 remains open. Gate 4 (final Owner deploy authorisation) is requested only after Gates 0–2 and Gate 3 constraints are satisfied.

---

## 1. Evidence consolidation (no re-work)

Existing UAT / freeze evidence is reused. Automated re-runs were not required unless a regression was suspected (none found in this prep pass).

| Area | Verdict already recorded | Source |
| --- | --- | --- |
| Operations feature set | Dev **PASS** / frozen | `okanggroup-final-system-uat.md` |
| Enquiry → client → projects lifecycle + SEC | **PASS** | `okanggroup-business-operations-e2e-uat.md` |
| Contracts | **PASS / FROZEN** | `okanggroup-professional-contracts-uat.md` |
| Quotation PDF | Closed | Quotation PDF UATs |
| Invoices (dev) | Complete; Owner browser pending | `okanggroup-professional-invoices-uat.md` + final UAT |
| Expenses (dev) | Complete; Owner browser pending | `okanggroup-admin-workspace-expenses-uat.md` + final UAT |
| Projects / CR / deliverables (dev) | Complete; Owner browser pending for ops UI | Integrated ops + m61 UATs |
| Staff / MFA / onboarding | Complete | R1 + MFA / temp-password tests |
| Company CMS / central CMS / visual builder | Complete | CMS UATs |
| Client CMS | Dev complete; **live client publish disabled** | Hosted / real / TH staging UATs |
| Automation | Dev PASS; email OFF | Automation UATs + Gate 3 |
| Public website upgrade | **DEV PASS**; visual **Owner APPROVED**; deploy HOLD | `okanggroup-public-website-upgrade-uat.md` |
| Signup quarantine | Applied (m63); Auth dashboard unchanged | Release checklist §2 |
| Website enquiry RPC | Applied (m64); tests PASS | Website UAT |

**Build verification (this prep pass, 2026-10-13):**

| Build | Result |
| --- | --- |
| `npm run build` (public site → `dist/`) | **PASS** |
| `npm --prefix admin run build` (Operations → `admin/dist/`, base `/admin/`) | **PASS** |

---

## 2. Production configuration verification

### 2.1 Target platform

| Item | Value | Status |
| --- | --- | --- |
| Supabase project | `prbgsnxpwyepdggdysnt` | Confirmed (`get_project_url`) |
| API URL | `https://prbgsnxpwyepdggdysnt.supabase.co` | Confirmed |
| Public hosting | Vercel project `okanggroup` → `okanggroup.com` / `www` (Cloudflare DNS → Vercel) | Documented in root `README.md` |
| Operations path | Admin Vite `base: '/admin/'` — serve `admin/dist` under `/admin/` on same host | Confirmed in `admin/vite.config.ts` |
| Production alias (existing) | `https://okanggroup-two.vercel.app` | Documented |

### 2.2 Environment variables (publishable only)

| Surface | Required vars | Notes |
| --- | --- | --- |
| Public website | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | `.env.example` — anon/publishable only; **never** service_role |
| Operations / portal (`admin/`) | Same `VITE_SUPABASE_*` | `admin/.env.example` |
| Hosting (Vercel) | Same pair for build | Local deploy-prep already PASS for anon key → correct project; **Owner confirms identical values on Vercel at deploy time** |

### 2.3 Authentication

| Item | Status |
| --- | --- |
| MFA hard-gate (privileged) | Present (m19 + admin flow) |
| Staff temp-password / force-change | Present |
| Unsolicited signup quarantine (m63) | Present — suspended profile; Auth “Allow sign-ups” dashboard **unchanged** |
| Leaked-password protection (HIBP) | **Disabled** — security advisor WARN `auth_leaked_password_protection` (re-verified 2026-10-13) |
| Auth dashboard password settings | **Unchanged** (Owner previously cancelled upgrade prompt) |

### 2.4 Database migrations

Remote project has applied migrations **m0 → m64** inclusive, ending with:

- `m63_signup_quarantine_unsolicited`
- `m64_website_enquiry_submit`

Functions `handle_new_user` and `submit_website_enquiry` are present. No pending schema work required for this release package.

### 2.5 Gate 3 constraints — preserved (re-verified)

| Constraint | Live config | Status |
| --- | --- | --- |
| Email delivery **OFF** | `email_delivery_enabled=false`; `email_provider=none`; `email_provider_configured=false` | ✅ |
| Client CMS **staging / dev only** | Connections: `manual_only`, `okang_dev_client` only — no production Treasure House cutover | ✅ |
| Live client CMS publishing **DISABLED** | No live publish enablement; TH staging package remains isolated | ✅ |

---

## 3. Approved website + mobile package

| Check | Result |
| --- | --- |
| Owner visual design | **APPROVED** 2026-10-13 — refinement CLOSED |
| Brand / nav / contact / portal | Included in approved package |
| Mobile layout | Present in `css/styles.css` (≤900px hamburger nav, stacked hero/CTAs, type scale, overflow clip) — part of approved site; no separate redesign |
| Logo in build | `dist/okanggroup-logo.jpg` packaging previously PASS |
| Enquiry + CMS overlays | m64 + `content/cms/current.json` hooks included |

No website redesign in this release-prep pass.

---

## 4. Gate 1 — Owner acceptance (evidence map)

**Gate 1 remains OPEN.** Cursor cannot invent Owner browser sign-off. Where prior Owner / BO evidence already covers an item, credit it below; remaining rows still need a short Owner browser pass (or written waiver of named items).

| # | Area | Existing evidence | Still needs Owner browser? |
| --- | --- | --- | --- |
| 1.1 | Invoices | Dev UAT complete | **Yes** — create/issue/pay/PDF + GBP vs GHS |
| 1.2 | Expenses | Dev UAT complete | **Yes** — tax/approve/receipt/PDF + currency |
| 1.3 | Projects | BO + m61 Dev PASS; handover/close historically covered in BO | **Yes** — progress / CR / deliverable UX on current UI |
| 1.4 | Client Portal | BO SEC + portal business **PASS** (isolation) | Soft confirm only: deliverable approve + CR UX |
| 1.5 | Finance → Reports | Implemented + tsc | **Yes** — currency separation + profitability rows |
| — | Contracts / Quotations | **Owner PASS / FROZEN** | No — do not re-open |
| — | Staff / CMS / Automation core | Historical Owner/Dev PASS; email stays OFF | No full re-UAT |

**Gate 1 exit:** Owner signs the checklist Gate 1 block (or waives named items in writing).

---

## 5. Gate 2 — Security (blocker)

**Gate 2 remains OPEN.** Prior Owner choice was **Option A** (pre-production defer only). Option A **does not** close Gate 2 for production and is **not** a production security waiver.

| Fact | Detail |
| --- | --- |
| HIBP / leaked-password protection | **Disabled** (advisor WARN, 2026-10-13) |
| Enabling path | Supabase Auth feature typically requires a **higher / paid plan** |
| Cursor authority | Cannot enable Auth security settings via MCP; **will not** authorise a paid upgrade or invent a waiver |

### Owner decision required (choose one)

| Option | Meaning | Effect on Gate 2 |
| --- | --- | --- |
| **B** (recommended) | Cost-approve Supabase upgrade (if required), enable leaked-password protection, then test login + password recovery | Gate 2 can **CLOSE** after evidence |
| **C** | Written production security **exception** — accept residual risk that breached/reused passwords may not be blocked at set/change time; interim MFA/RLS/onboarding remain | Gate 2 can **CLOSE** only with explicit written Owner waiver |
| **A** (current) | Pre-prod defer only | Gate 2 stays **OPEN** — blocks deploy |

Interim controls (MFA, RLS, temp-password, m63 quarantine) remain in place either way; they do **not** replace HIBP.

---

## 6. Deploy and rollback procedures (ready — not executed)

Execute **only** after Gates 1–2 close **and** Owner signs Gate 4.

### 6.1 Pre-deploy checklist

1. Gates 0, 1, 2 closed (or written waivers); Gate 3 constraints unchanged.
2. Confirm Vercel env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (publishable) for both root and admin builds.
3. Confirm migrations still at m64 (or newer applied intentionally).
4. Confirm settings still: email OFF; no live client CMS publish.
5. Tag release in git (suggested): `release/unified-prod-YYYYMMDD`.

### 6.2 Deploy sequence (coordinated)

1. **Build**
   - Public: `npm ci && npm run build` → `dist/`
   - Operations: `npm ci --prefix admin && npm run admin:build` → `admin/dist/`
2. **Host**
   - Deploy static site root from `dist/`
   - Mount Operations at `/admin/` from `admin/dist/` (same Vercel project / rewrite as already intended for `/admin/`)
3. **Smoke (post-deploy, non-destructive)**
   - Homepage + mobile nav
   - Contact enquiry (expect `OKG-ENQ-*` in Operations)
   - `/admin/login` → Owner MFA path
   - One Client Portal login (known test client)
   - Confirm Automation does **not** send email
4. **Do not** enable email, live TH publish, or Auth HIBP unless Gate 2 Option B was chosen and tested.

### 6.3 Rollback

| Layer | Rollback action |
| --- | --- |
| Vercel / static | Instant rollback to previous Deployment in Vercel UI (or redeploy prior git tag) |
| DNS | Leave Cloudflare → Vercel CNAMEs unchanged unless the incident is DNS-specific |
| Database | Prefer **forward fix**; do not blindly reverse m63/m64. If a migration caused the incident, restore from Supabase backup / PITR **only** with Owner approval |
| Auth settings | If Option B was applied and breaks login/recovery: disable leaked-password protection in Auth dashboard (Owner) and re-test |
| Feature flags / settings | Keep `email_delivery_enabled=false`; leave CMS adapters on staging/dev |

### 6.4 Abort criteria (during deploy window)

Stop and rollback static deploy if: login broken for Owner, enquiry RPC failing for legitimate traffic, portal data bleed, or unintended email/CMS live publish.

---

## 7. Gate board (unified release)

| Gate | Result | Blocker? |
| --- | --- | --- |
| 0 Development freeze | **CLOSED** | No |
| 1 Owner browser acceptance | **OPEN** | **Yes — Owner** |
| 2 Security (HIBP) | **OPEN** — awaiting **B** or **C** (A is not enough) | **Yes — Owner** |
| 3 External services | **CLOSED** — email OFF; CMS staging/dev; live publish OFF | No |
| 4 Production authorisation | **HOLD** | Yes — request only after 1–2 close |

---

## 8. Genuine blockers requiring Owner action

Only these items block coordinated production deployment:

1. **Gate 1** — Consolidated Owner pass: Invoices, Expenses, Projects, Finance Reports — sheet in [`okanggroup-final-release-gates.md`](./okanggroup-final-release-gates.md). Contracts / Quotations / CMS / Staff / website stay closed.
2. **Gate 2** — Explicit **Option B** cost authorisation (then enable HIBP + test), **or** written **Option C** exception. Recommendation remains **B**. Option A remains pre-prod only. No upgrade assumed until Owner confirms.
3. **Gate 4** — After 1 and 2 are closed: one explicit written authorisation to deploy the **unified** package (website + Operations + portal) to the named environment.

**Not blockers (already handled):** feature development, website visual approval, migration backlog to m64, Gate 3 email/CMS posture, logo/anon-key local packaging.

---

## 9. What was not done (by instruction)

- No production deploy
- No Supabase plan upgrade
- No Auth HIBP enablement
- No security waiver invented
- No email enablement
- No live client CMS publishing
- No rebuild of frozen modules
- No request for final deploy authorisation while Gate 1 or Gate 2 is open

---

## One-line status

**Unified release package is prepared and builds clean; Gate 3 preserved; production remains HOLD pending Owner Gate 1 acceptance, Gate 2 decision B or C, then Gate 4 deploy authorisation.**
