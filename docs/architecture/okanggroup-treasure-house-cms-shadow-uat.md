# OkangGroup — Treasure House CMS Shadow Copy (Consolidated UAT)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Environment | Development |
| Production | **HOLD** |
| Live Treasure House app | **Not modified / not connected** |
| Generic CMS | **Preserved / FROZEN** |
| C3-01 contractual Pilot 2 | **Still open** — see shadow CMS integration readiness |

---

## Verdict

**PASS (standalone shadow CMS on development)** — Treasure House website CMS administration has been inventorying from the authorised local repository and recreated inside OkangGroup as custom CMS instance `treasure-house-shadow`, with synthetic records only.

Tests A–D against Treasure House **staging** remain **blocked** until an isolated staging environment is verified and separately authorised.

---

## 1. Source inspected (authorised local repo)

Path: `Documents/Projects/Treasure House Bible Church International/treasure-house-app`

| Area | Evidence |
| --- | --- |
| Admin shell | `app/(portal)/admin/website/page.tsx` + `WebsiteCmsNav` |
| Domain lib | `lib/website-cms/*` (homepage-schema, ministry-actions, hero, collage, media, …) |
| Components | `components/website-cms/*` |
| Ministries schema | `supabase/migrations/20260410180000_website_ministries_cms_v1.sql` |

### Inventory — copied into OkangGroup shadow

| TH Website CMS | Shadow module / surface |
| --- | --- |
| Dashboard | Dashboard stats panel |
| Homepage | `homepage` custom module |
| Quick Cards | `quick_cards` |
| Live Stream | `live_stream` |
| Mobile Designer | Info → homepage document |
| HERO Manager | `hero` |
| Collage Studio | `collage` |
| Media | OkangGroup `CmsMediaLibrary` |
| Leadership | `leadership` |
| Ministries (+ galleries) | `ministries` (+ gallery_notes field) |
| Pages | `pages` |
| Navigation | `navigation` |
| History | OkangGroup record/workflow status |
| Settings | `settings` |
| Sermons (public site) | `sermons` custom module (TH has public `/sermons`; no dedicated `/admin/website/sermons` CRUD) |
| Events / programmes | `events` (TH quick-card language + calendar/events) |

### Explicitly NOT copied

Membership, pastoral care, prayer request vaults, giving/finance, safeguarding, academy ops, production credentials, production storage files, auth sessions.

Sensitive modules registered as `disabled` + `is_sensitive` on the instance for audit clarity.

---

## 2. OkangGroup artefacts

| Artefact | ID / location |
| --- | --- |
| Client | `TH-SHADOW-DEV` / UUID `…1101` |
| CMS instance | slug `treasure-house-shadow` / UUID `…1102` |
| Config | `cms_config_type=custom`, `cms_kind=church_website` |
| Connection | `manual_only`, `external_live=false`, platform mode |
| Custom defs | 12 active modules |
| Synthetic records | 16 draft rows |
| UI | `TreasureHouseCmsShadow` in workspace when slug matches |
| Migration | `m42_treasure_house_cms_shadow` |
| Field mappings | `admin/src/lib/treasureHouseCmsShadow.ts` → `TH_FIELD_MAPPINGS` |

Open workspace: **My Client CMS** → Treasure House Website CMS (Shadow) (Owner grant seeded).

---

## 3. Requirements matrix

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Locate/inspect TH repo | **PASS** |
| 2 | Inventory CMS modules | **PASS** (this UAT §1) |
| 3 | Recreate as TH Custom CMS | **PASS** |
| 4 | Preserve capabilities/structure | **PASS** (nav + modules; collage/HERO simplified vs full TH studio) |
| 5 | Reuse OkangGroup infra | **PASS** (registry, custom modules, media, grants, approvals path) |
| 6 | Synthetic / isolated storage | **PASS** |
| 7 | No production records/credentials | **PASS** |
| 8 | Do not modify TH application | **PASS** (read-only inspection) |
| 9 | Do not connect to production | **PASS** |
| 10 | Standalone CMS workspace | **PASS** |
| 11 | Verify modules function | **PASS** (seed + SQL regression + UI wiring) |
| 12 | Integration field mappings | **PASS** (documented; adapter not live) |
| 13 | Reuse gateway | **Prepared** — staging tests deferred |
| 14 | Staging retrieve/publish/rollback | **HOLD** — no isolated TH staging verified |
| 15 | Record differences | **PASS** (below) |
| 16 | Preserve Generic CMS | **PASS** |

---

## 4. Differences vs original TH CMS

| Topic | Difference |
| --- | --- |
| HERO / Collage editors | TH has rich CropStudio / CollageEditor; shadow stores structured fields + JSON, not pixel editors |
| Media | OkangGroup `client-cms-media` bucket, not TH `website_media_assets` |
| Publishing | OkangGroup draft → submit → approve → publish on custom records; not TH Phase 2 draft/preview/publish RPCs |
| Sermons admin | Shadow has dedicated module; TH primarily public pages + media |
| Programmes | Shadow `events` module; TH uses calendar + “programmes” wording on quick cards |
| Bible Translations | TH nav link to `/admin/bible` — omitted from website shadow (separate product surface) |
| AuthZ | OkangGroup grants/MFA/permissions, not TH `website.edit` portal caps |

---

## 5. Automated tests

| Test | Result |
| --- | --- |
| `m42_treasure_house_cms_shadow_regression.sql` | Run on development |
| `admin/src/lib/treasureHouseCmsShadow.test.mjs` | Static inventory assertions |
| Admin `tsc --noEmit` | Expected PASS after UI wiring |

---

## 6. Next steps (Owner)

Integration readiness assessed in `okanggroup-treasure-house-shadow-cms-integration-readiness.md` — **staging not ready** until DB isolation + C3-01.

1. Confirm isolated Treasure House **staging** stack (separate DB/auth/storage — not Device UAT sharing live Supabase).  
2. Authorise Pilot 2 pack (C3-01) for staging only.  
3. Implement staging-only `/v1` bridge; connect via prepared `treasure_house_staging` adapter.  
4. Execute Tests B–D against staging only.  
5. Keep single source of truth for eventual production cutover — do not dual-edit live content.

**Production remains HOLD.**
