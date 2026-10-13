# OkangGroup — Treasure House Shadow CMS Integration Readiness

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Environment | Development assessment only |
| Shadow CMS | **FROZEN PASS** (`treasure-house-shadow`) — preserved |
| Generic CMS | **FROZEN** |
| Live Treasure House application | **Not modified** |
| Production | **HOLD** |
| Staging connection | **Not started / not authorised** |

---

## Verdict

**Not ready to proceed with staging integration. No connection made.**

Standalone shadow CMS remains a PASS. OkangGroup gateway, vault, approvals and field mappings are prepared. A **genuinely isolated Treasure House staging stack is not evidenced**. Device UAT / Vercel preview concepts exist in the TH app, but the inspected local deployment configuration points at a **single Supabase project** also referenced by production-oriented site URL comments (`thbci.org`). No separate staging database, auth, storage or vault credentials are registered.

**Do not deploy staging infrastructure, configure `cms_connections.base_url`, or run Tests B–D until isolation is proven and C3-01 authorises Pilot 2 staging work.**

### Staging integration gate re-check (2026-10-12)

Re-verified against `treasure-house-app` without repeating shadow CMS work:

| Gate | Confirmed? |
| --- | --- |
| Isolated staging DB / auth / storage / credentials | **No** |
| C3-01 contractual Pilot 2 authorisation recorded | **No** |
| Proceed with gateway connection | **Blocked** |

Precise gaps are listed in §10.

---

## 1. What was inspected (authorised, read-only)

| Source | Finding |
| --- | --- |
| Local repo `treasure-house-app` | Next.js app; Vercel project linked as `treasure-house-app` |
| `.env.example` / local env **key names only** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (no service role in app) |
| Local Supabase host (hostname only) | `gmyhzxxqiokklybebzpf.supabase.co` — same host in `.env.local` and hosted-backup |
| `lib/site-url.ts` | Documents Production → `https://thbci.org` and a “Device UAT Preview” alias via `NEXT_PUBLIC_SITE_URL` |
| `supabase/migrations` | Only `website_ministries_cms_v1.sql` checked into migrations; foundation schema also present in `.cms-migration.json` |
| `lib/website-cms/*` + admin website routes | Full website CMS surface confirmed |
| `app/api/*` | Only `bible/search` and `youtube/live` — **no** OkangGroup `/v1/modules/*` bridge |
| OkangGroup registry | `treasure-house-shadow` → `manual_only`, no `base_url`, `credential_ref=null`, `external_live=false` |

**Explicitly not done:** HTTP calls to live TH sites, production CMS logins, reading secret values, modifying TH code, deploying staging, or storing TH credentials in the OkangGroup vault.

---

## 2. Isolation checklist

| Requirement | Status | Evidence |
| --- | --- | --- |
| Genuinely isolated staging environment | **Not evidenced** | No distinct staging Supabase project / env file / deploy target documented as DB-isolated |
| Separate database | **Fail / unknown** | Local + hosted-backup share one Supabase host; Device UAT appears frontend-oriented |
| Separate authentication | **Not evidenced** | Same `NEXT_PUBLIC_SUPABASE_*` pattern; no staging auth project shown |
| Separate storage | **Not evidenced** | TH uses `website-media` bucket on the app project; no staging bucket project shown |
| Separate environment credentials | **Not evidenced** | No `dev/treasure-house-staging` vault ref; shadow connection has no credential |
| Safe synthetic-only dataset on staging | **Not evidenced** | Cannot confirm staging seed without an isolated DB |
| No production credentials in OkangGroup | **Pass** | Shadow remains `manual_only` / no base_url |
| C3-01 contractual permission | **Open** | Required before Pilot 2 staging connection (see §7) |

**Gate:** Any host that serves or writes the live Supabase project (including Device UAT if it shares that DB) is **not** acceptable as OkangGroup staging `base_url`. The prepared adapter denylist includes `thbci.org` and `gmyhzxxqiokklybebzpf.supabase.co`.

---

## 3. Minimum modules for first integration test

Once isolation exists, first-wave Tests B–C should use only:

| Module | Why first |
| --- | --- |
| `ministries` | Clear table schema (`website_ministries` + gallery); high confidence mappings |
| `homepage` | `website_documents` `doc_key='homepage'` / HomepageDocument v3 |
| `quick_cards` | Embedded in homepage document |
| `leadership` | `website_leaders` + media FK |

Defer until later waves: `hero`, `collage`, `media` asset sync, `live_stream`, `pages`, `navigation`, `settings`.

**Out of scope for first staging test:** `sermons`, `events` / programmes — no dedicated website CMS tables found in the inspected schema; shadow modules remain synthetic-only.

Sensitive modules (membership, pastoral, prayer, giving) remain **excluded**.

---

## 4. `TH_FIELD_MAPPINGS` verification

Mappings in `admin/src/lib/treasureHouseCmsShadow.ts` were re-checked against TH types/actions/migrations.

| Result | Detail |
| --- | --- |
| Verified direct / document paths | Ministries, leadership, homepage, quick cards, hero panels path, collage, navigation, settings, live settings, pages |
| Corrected | Hero target is `website_hero_designs.draft_document.panels` (not `.panels` column); ministries need `name` + `featured_asset_id` resolution |
| Unverified / out of first wave | `events.starts_at`, `sermons.speaker` — no CMS tables evidenced |

Payload helpers: `admin/src/lib/treasureHouseStagingAdapter.ts` (`mapShadowMinistryToTh`, `mapShadowLeadershipToTh`).

---

## 5. Missing integration endpoints

Treasure House today manages CMS via **server actions → Supabase**, not the OkangGroup gateway protocol.

| Endpoint | On TH app today? | Needed for gateway? |
| --- | --- | --- |
| `GET /health` | No | Yes |
| `GET /v1/capabilities` | No | Yes |
| `GET/PUT /v1/modules/:code/content` | No | Yes |
| `POST /v1/modules/:code/publish` | No | Yes |
| `POST /v1/modules/:code/rollback` | No | Yes |
| `GET /api/youtube/live` | Yes | No (unrelated) |

OkangGroup `cms-integration-gateway` already implements the client-side of this protocol (proven against `dev-client-cms`).

**Implication:** Staging integration requires a **staging-only bridge** on an isolated TH staging application (or an equivalent staging sidecar) that speaks `/v1/*` and writes only to the staging database. That work must not modify the live TH application or production DB.

---

## 6. Staging adapter preparation (dormant)

Prepared inside OkangGroup only — **not connected**:

| Artefact | Location |
| --- | --- |
| Adapter catalogue entry | `treasure_house_staging` in `admin/src/lib/cmsAdapters.ts` |
| Protocol + denylist + first-wave catalogue + mappers | `admin/src/lib/treasureHouseStagingAdapter.ts` |
| Automated checks | `admin/src/lib/treasureHouseStagingAdapter.test.mjs` |
| Shadow connection | Remains `manual_only`, no `base_url` |

When Owner authorises after isolation:

1. Deploy **isolated** TH staging (separate Supabase project + storage + auth + synthetic seed).  
2. Add staging-only `/v1` bridge (TH staging code or sidecar — not production).  
3. Vault secret `dev/treasure-house-staging` only.  
4. Configure shadow (or a dedicated staging instance) with adapter `treasure_house_staging` / `okang_dev_client` protocol.  
5. Run Tests B–D against that host only.

---

## 7. Exact outstanding C3-01 requirement

From `okanggroup-cms-integrations-v2.3.md` §14.3 / §17:

> **C3-01 — Pilot 2 client selection:** Select **one** client only after confirming **contractual permission**; **do not** auto-pick Treasure House or NiiNai.

**Outstanding Owner decision:** Formally record that Pilot 2 is Treasure House **staging** (website CMS modules only), with contractual permission confirmed for:

- Registering a non-production connection in OkangGroup  
- Calling the isolated staging host via the gateway  
- Approval-gated publish/rollback drills with synthetic content  

Related still-open items (not waived by this readiness pass): **C3-02** auth method, **C3-03** module catalogue/operations, **C3-04** hybrid mode, **C3-05** gateway/adapter pattern (recommendation: reuse gateway + `treasure_house_staging` / same `/v1` protocol).

Shadow CMS development did **not** satisfy C3-01 for live or staging connection.

---

## 8. Requirements matrix

| # | Requirement | Result |
| --- | --- | --- |
| 1 | Inspect TH deployment configuration | **PASS** (Vercel link, env keys, site-url, single Supabase host) |
| 2 | Determine isolated staging exists | **FAIL** — not evidenced |
| 3 | Confirm separate DB / auth / storage / credentials | **FAIL** — not evidenced |
| 4 | Minimum modules for first test | **PASS** — ministries, homepage, quick_cards, leadership |
| 5 | Verify `TH_FIELD_MAPPINGS` vs schema | **PASS** (updated; events/sermons flagged unverified) |
| 6 | Identify missing integration endpoints | **PASS** — full `/v1` bridge missing on TH |
| 7 | Prepare safe staging adapter for gateway | **PASS** (dormant catalogue + contract + denylist) |
| 8 | Synthetic test content only | **PASS** — no live TH data copied |
| 9 | Preserve original TH app + production DB | **PASS** — read-only inspection |
| 10 | Identify exact C3-01 requirement | **PASS** — §7 |
| — | Connect / deploy staging / modify live TH | **Not done** (forbidden) |

---

## 9. Status summary

| Item | Status |
| --- | --- |
| Treasure House Shadow CMS | ✅ FROZEN PASS |
| Field mappings verified | ✅ Updated |
| Staging adapter prepared (dormant) | ✅ |
| Isolated TH staging proven | ❌ |
| Safe to connect now | ❌ **No** |
| C3-01 | ⏳ Open |
| Production | 🔒 **HOLD** |

### Owner ask

1. Confirm or create a **DB-isolated** Treasure House staging project (not Device UAT sharing live Supabase).  
2. Record C3-01 (and C3-02–C3-05 as needed) for **staging-only** Pilot 2.  
3. Authorise staging bridge implementation on that isolated stack only.  

Until then: keep shadow CMS frozen; keep Generic CMS frozen; do not configure external connection.

---

## 10. Precise gaps blocking staging integration

| Missing item | Detail |
| --- | --- |
| Separate staging Supabase project | Repo has only one real host: `gmyhzxxqiokklybebzpf.supabase.co` (local + hosted-backup). No `.env.staging`. |
| Separate staging auth | No second auth project / staging anon keys evidenced. |
| Separate staging storage | No staging `website-media` (or equivalent) project evidenced. |
| Staging credentials in OkangGroup vault | No `dev/treasure-house-staging` (or similar) credential_ref. |
| Staging base URL for gateway | Shadow connection remains `manual_only` with no `base_url`. |
| OkangGroup `/v1` bridge on TH staging | TH app has no `/health` or `/v1/modules/*` integration routes. |
| C3-01 recorded decision | V2.3 Pilot 2 client selection + contractual permission still **open**. |
| Device UAT ≠ isolated staging | `NEXT_PUBLIC_SITE_URL` preview alias is not proof of a separate database. |

**Connection status:** not attempted. Treasure House application, live website, and production database unchanged. Production **HOLD**.

**Staging build package:** prepared under `staging/treasure-house/` — see `okanggroup-treasure-house-staging-build.md`. Activation still requires separate Supabase staging project + C3-01.
