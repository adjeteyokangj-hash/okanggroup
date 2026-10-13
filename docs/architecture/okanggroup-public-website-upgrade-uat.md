# OkangGroup — Public Website Upgrade UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-13 |
| Assignment | Public website upgrade (existing Vite site — not a rebuild) |
| Development | **Authorised** for this upgrade |
| Production deploy | **HOLD** — Gate 3.4 / Gate 4 unchanged; no public deploy performed |
| Operations modules | **Not reopened** (enquiry intake RPC only) |

## Scope delivered

Upgrade of the existing company site (`index.html`, `css/styles.css`, `js/main.js`) into a clearer technology / digital-solutions presentation, with Operations enquiry intake and Company CMS consumption hooks.

| Requirement | Result | Evidence |
| --- | --- | --- |
| 1. Preserve logo, navy / blue / orange brand | **PASS** | Same CSS variables, logo paths, Syne/Manrope |
| 2. Homepage, nav, content, responsive | **PASS** | Hero + why / about / services / products / work / process / contact / portal; mobile nav retained |
| 3. Present services & capabilities | **PASS** | Services section reframed for customer outcomes |
| 4. Separate products vs client work | **PASS** | “OkangGroup product” vs “Client project” badges; ownership lines kept |
| 5. Portfolio without confidential detail | **PASS** | Existing approved high-level client descriptions only; no invented metrics/testimonials |
| 6. Contact → Operations enquiry workflow | **PASS** | `submit_website_enquiry` → `business_enquiries` (`source=website`) + CMS mirror |
| 7. Company CMS where supported | **PASS** | Build-time import of `content/cms/current.json`; `[data-cms-page]` / `[data-cms-field]` overlays |
| 8. Secure Client Portal access | **PASS** | Links to `/admin/login` (existing Auth / portal app) |
| 9. SEO, a11y, performance, mobile | **PASS** | Meta/OG/JSON-LD, `robots.txt`, `sitemap.xml`, skip link, form labels, Vite build |
| 10. Preserve URLs | **PASS** | Existing hashes retained (`#home` `#about` `#products` `#client-work` `#services` `#how-we-work` `#contact`) |
| 11. Test website + integrations | **PASS** | See tests below |

## Server-side enquiry integration (m64)

| Item | Detail |
| --- | --- |
| Migration | `supabase/migrations/20261013083100_m64_website_enquiry_submit.sql` (applied) |
| RPC | `public.submit_website_enquiry(...)` **SECURITY DEFINER** |
| Grants | `EXECUTE` to `anon`, `authenticated` only — **no** anon INSERT on `business_enquiries` |
| Behaviour | Validates fields; rate-limits 3/hour/email; inserts `business_enquiries` with `source=website`, `status=new`; mirrors `contact_enquiries` |
| Auth dashboard | **Unchanged** (per Owner instruction) |

### Regression test

```text
npm run test:website-enquiry
→ pass: true
→ enquiry_number: OKG-ENQ-000002
→ validation_rejected: true
```

Live row confirmed: `source=website`, `status` marked `lost` after UAT probe cleanup.

### Marketing build

```text
npm run build
→ dist/index.html + CSS/JS OK
→ dist/okanggroup-logo.jpg present (29,201 bytes)
```

---

## Final deployment preparation (2026-10-13) — no deploy performed

| Check | Result | Evidence |
| --- | --- | --- |
| 1. Official logo in production build | **PASS** | `public/okanggroup-logo.jpg` and `assets/okanggroup-logo.jpg` (tracked); `npm run build` copies to `dist/okanggroup-logo.jpg` (29,201 bytes). Visual inspection: official OkangGroup mark (navy / blue / orange “G”, wordmark, tagline) renders correctly from both `public/` and `dist/`. |
| 2. `VITE_SUPABASE_ANON_KEY` → correct project | **PASS** (local build artefact) | Local `.env` (gitignored): URL `https://prbgsnxpwyepdggdysnt.supabase.co`; JWT `ref=prbgsnxpwyepdggdysnt`, `role=anon` (not `service_role`). Built `dist/assets/*.js` embeds project URL + anon JWT + `submit_website_enquiry`; **no** `service_role` string in browser bundle. |
| Enquiry regression against that project | **PASS** | `npm run test:website-enquiry` → `pass: true`, `enquiry_number: OKG-ENQ-000003`, validation rejection OK |
| Production / Vercel deploy | **HOLD** | Not executed |
| Hosting-platform env vars (Vercel dashboard) | **Owner confirm at deploy time** | Local build env verified. When Owner authorises deploy, set the same publishable anon key (and URL) on the hosting project so CI/build injects them — do not put service-role keys in browser/build. |

### Genuine blockers

**None** for logo packaging or local publishable-key / enquiry connectivity to `prbgsnxpwyepdggdysnt`.

Residual Owner action (not a code blocker): confirm the same `VITE_SUPABASE_*` publishable values exist on the hosting provider **when** production deploy is authorised.

## What was intentionally not done

- No production / Vercel deploy (HOLD)
- No invented email, testimonials, or achievement claims
- No Supabase Auth setting changes
- No rebuild of admin / finance / CMS modules
- No website redesign in this preparation pass
- Official `@okanggroup.com` email still pending (README) — phone/WhatsApp retained as documented

## Owner follow-ups

1. ~~Confirm logo asset is present in the deploy package~~ — **PASS** (see above).
2. ~~Verify publishable anon key for build → correct Supabase project~~ — **PASS** locally; confirm identical values on host at deploy time.
3. When Company CMS pages are published, run `npm run cms:export` then rebuild — overlays apply for slugs `home`, `about`, `services`, `products`, `work`, `process`, `contact`.
4. Authorise public website production deploy separately (Gate 3.4 / Gate 4) — then visual approval.

## Visual refinement (2026-10-13) — Owner feedback pass

One consolidated presentation update after Owner review (structure/functionality unchanged):

| Owner note | Change |
| --- | --- |
| Hero too understated | Two-column hero with larger wordmark + prominent official logo panel |
| Empty space / cramped cards | Tighter section rhythm; larger service/product/work cards; visual headers on portfolio cards |
| Small text | Raised body/card type scale; darker-theme readable muted text |
| Nav mid-page in screenshot | Header switched to **fixed** top bar; body offset; duplicate Client Portal button removed |
| Contact white / cramped | Unified navy contact + enquiry panels; larger fields; autofill stays dark |
| Client project engagement | Branded visual bands (initials) — no invented screenshots |
| Header/content cramped centre | Full-width header + widened content container |

Full-page Owner review capture: [`okanggroup-website-visual-refinement-fullpage.png`](./okanggroup-website-visual-refinement-fullpage.png)  
Local preview: `http://127.0.0.1:4173/`

Enquiry / CMS / SEO / Operations modules: **unchanged**.

### Owner visual approval (2026-10-13)

| Area | Status |
| --- | --- |
| Website design / layout / branding | **Approved** |
| Contact + Client Portal | **Visually approved** |
| Navigation | **Confirmed OK** — fixed header is intentional; full-page captures can show it over mid-page sections. Scroll check: `position:fixed`, `scroll-padding-top:96px`, Our Work heading clears header (`headingClearOfHeader: true`). Does not obstruct section titles in normal browsing. |
| Mobile (≤900px) | **Included in approved package** — hamburger menu, stacked hero/CTAs, scaled title, overflow clipped; no separate redesign |
| Visual refinement work | **CLOSED** — no further redesign |
| Production deploy | **HOLD** |

## Verdict

**Website upgrade DEV PASS.**  
**Deployment preparation checks PASS** (logo + anon key / enquiry).  
**Visual design APPROVED by Owner. Refinement CLOSED.**  
**Production remains HOLD** until explicit Owner authorisation.
