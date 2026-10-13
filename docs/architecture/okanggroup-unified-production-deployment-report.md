# OkangGroup — Unified Production Deployment Report

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Instruction | Owner-authorised commit, push and production launch |
| Commit SHA | `bf7fbfee59d917b76ba7b03856b9c3b552e69c60` |
| Branch | `main` (also synced `docs/architecture-v2.1-review`) |
| Rollback ref | Previous `main` tip `1db2eaf` · Vercel prior production deployment before this release |
| Database | Supabase `prbgsnxpwyepdggdysnt` — **preserved** (no destructive reset; migrations already at m64) |

---

## Execution summary

| Step | Result |
| --- | --- |
| 1. Commit approved website + Operations package | **DONE** — 273 files |
| 2. Push to GitHub production branch (`main`) | **DONE** |
| 3. Verify hosting / env | **DONE** after remediation (see below) |
| 4. Deploy website + Operations + portal + CMS UI | **DONE** — Vercel production |
| 5. Preserve DB / staff / permissions / clients | **DONE** — no DB wipe; schema unchanged this cut |
| 6. Gate 3: email OFF; live client CMS publish disabled | **PRESERVED** (settings previously verified `email_delivery_enabled=false`, provider `none`; CMS adapters remain staging/dev only) |
| 7. Production smoke tests | **PASS** with notes below |
| 8. Desktop + mobile | Website desktop **PASS**; mobile viewport checked; admin login **PASS** |
| 9. Final URLs / SHA / rollback | Recorded in this report |

---

## Production URLs

| Surface | URL |
| --- | --- |
| Public website | https://okanggroup.com |
| Public (www) | https://www.okanggroup.com |
| Vercel alias | https://okanggroup-two.vercel.app |
| Operations / Client Portal login | https://okanggroup.com/admin/login |
| GitHub commit | https://github.com/adjeteyokangj-hash/okanggroup/commit/bf7fbfee59d917b76ba7b03856b9c3b552e69c60 |

Latest production deploy (Vercel): `okanggroup-p4uu4spev-adjeteyokangj-hashs-projects.vercel.app` → promoted to `okanggroup.com`.

---

## Hosting / environment remediation

Initial GitHub→Vercel production deploy for `bf7fbfe` succeeded, but **Vercel had no `VITE_SUPABASE_*` variables**, so:

- Public enquiry JS lacked a publishable key (form would fail closed).
- Admin app rendered a blank root until env was corrected and redeployed.

**Remediation performed (Owner launch authorisation):**

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on Production / Preview / Development (publishable only; no service_role).
2. Redeployed production so both bundles embed the correct project.

**Post-fix bundle checks:**

| Bundle | Project ref | Enquiry RPC / createClient | `service_role` |
| --- | --- | --- | --- |
| Public `/assets/index-*.js` | Present | `submit_website_enquiry` present | Absent |
| Admin `/admin/assets/index-*.js` | Present | `createClient` present | Absent |

---

## Smoke tests (production)

| Area | Result | Evidence |
| --- | --- | --- |
| Public homepage | **PASS** | https://okanggroup.com loads approved brand / sections |
| Logo | **PASS** | `/okanggroup-logo.jpg` HTTP 200 |
| robots / sitemap | **PASS** | HTTP 200 |
| Website enquiry path | **PASS** | Live RPC created `OKG-ENQ-000004` (smoke) |
| Auth login UI | **PASS** | `/admin/login` shows Email / Password / Sign in |
| Finance / Projects / Staff / CMS routes | **Packaged** in `/admin/` SPA | Full Owner browser sign-in matrix still Gate 1 (not closed in this deploy) |
| Desktop | **PASS** | Homepage + admin login |
| Mobile | **PASS** | Homepage under mobile metrics; hamburger CSS in package |

---

## Security Gate 2 (not closed)

| Item | Status |
| --- | --- |
| Leaked-password protection (HIBP) | **Still unresolved / disabled** |
| Silent security waiver | **Not recorded** |
| Supabase paid upgrade | **Not purchased** |
| Gate 2 marked PASS | **No** — remains **OPEN** |

Production launched under Owner deploy authorisation with Gate 2 **explicitly left open**. Residual risk: breached/reused passwords are not blocked by HIBP until Option B or written Option C.

---

## Rollback

1. **Vercel:** Promote previous production deployment in Vercel dashboard, or redeploy git `1db2eaf`.
2. **Git:** `main` can be reverted with a revert commit (prefer revert over force-push).
3. **Database:** Do not roll back m63/m64 blindly; use forward fix or Owner-approved backup/PITR only.
4. **Env:** Keep publishable `VITE_SUPABASE_*` on Vercel; never add service_role to browser env.

---

## Remaining Owner follow-ups (non-blocking for “code is live”, blocking for security closure)

1. **Gate 1** — Consolidated Owner browser acceptance (Invoices, Expenses, Projects, Finance Reports).
2. **Gate 2** — Option B (Pro ~$25/mo + enable HIBP) or written Option C.
3. Optional: mark smoke enquiry `OKG-ENQ-000004` as lost/closed in Operations.

---

## Verdict

**Commit + push + production deploy: COMPLETE.**  
**Public site, Operations/portal at `/admin`, and publishable Supabase wiring: LIVE.**  
**Gate 2 HIBP: still OPEN (not waived, not PASS).**  
**Gate 3 constraints: preserved.**
