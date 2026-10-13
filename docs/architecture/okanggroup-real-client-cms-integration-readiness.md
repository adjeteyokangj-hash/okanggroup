# OkangGroup — Real Client CMS Integration Readiness

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Environment | Development assessment only |
| Production | **HOLD** |
| Live client apps | **Not connected / not modified / not accessed** |
| Generic CMS / gateway / vault / approvals | **Preserved** |
| Connection authorised? | **No — readiness findings only** |

---

## Verdict

**Not ready to connect.**  
**Provisional recommended candidate:** Treasure House Bible Church International (`treasure-house`) — *subject to Owner confirmation of an isolated non-production environment and contractual permission (V2.3 C3-01).*

Hosted gateway UAT against `dev-client-cms` remains the only proven external path. No real client staging endpoint, safe credentials, or module API catalogue is available inside this repository or the development registry.

---

## 1. What was inspected (safe sources only)

| Source | Used for | Not used for |
| --- | --- | --- |
| Platform DB `clients` / `cms_instances` / `cms_modules` / `cms_connections` | Registry metadata on development | Production client content |
| `okanggroup-cms-integrations-v2.3.md` | Pilot 2 pack rules (C3-01–C3-05) | Auto-selecting a client |
| `okanggroup-database-v2.1.8A.md` §6.4–6.5 | Illustrative client slugs + AuthZ boundaries | Seed mandates |
| `okanggroup-client-cms-integration-uat.md` | Prior note that Treasure House WP is **not connected** | Live WP calls |
| Adapter catalogue (`cmsAdapters.ts`) | Mapping options | Secrets |
| This repo filesystem | Confirm no Treasure House / NiiNai app code present | — |

**Explicitly not done:** HTTP calls to live client websites, production CMS logins, production database access, or credential discovery against real clients.

---

## 2. Candidates currently visible

### 2.1 On OkangGroup development registry (actual rows)

| Client | CMS instance | Type | Adapter today | Suitable as “real specialised” pilot? |
| --- | --- | --- | --- | --- |
| OkangGroup Test Client Limited | `okg-test-uat-cms` | Hybrid / native | `okang_native` | No — platform-hosted Generic/hybrid, not an independent app |
| UAT Other Client Isolation | `uat-custom-sandbox` | Custom / external | `okang_dev_client` → hosted stub | No — synthetic stub proving gateway only |

No Treasure House, NiiNai, Noble Express, or SparkleValeting **instances** exist on the development platform yet.

### 2.2 Documented future clients (illustrative — V2.1 §6.4)

| Client | Suggested slug | Kind | Notes for Pilot 2 |
| --- | --- | --- | --- |
| Treasure House Bible Church International | `treasure-house` | Church website CMS | Specialised public modules (ministries, sermons, events, programmes); **sensitive pastoral/membership modules must stay excluded** |
| Noble Express Courier | `noble-express` | Courier website CMS | Likely simpler public website; less specialised CMS surface |
| SparkleValeting | `sparkle-valeting` | Valeting website CMS | Similar; lower module diversity |
| NiiNai (referenced elsewhere) | — | Hospitality / ops | Finance-adjacent risk; weaker first external pilot |

V2.3 §7.2 / C3-01: **do not auto-select** Treasure House or NiiNai without Owner + contractual permission.

---

## 3. Isolation checklist (Treasure House — provisional)

| Requirement | Status | Finding |
| --- | --- | --- |
| Isolated development/staging environment | **Unknown / not evidenced** | No staging URL, repo, or deploy target registered in OkangGroup platform or this workspace |
| Safe test data | **Unknown / not evidenced** | No confirmed anonymised seed set; must not use live congregational content |
| No live production credentials | **Pass (so far)** | No production `credential_ref` for Treasure House stored; vault only holds `dev/okang-client-cms` for the stub |
| Identifiable CMS modules & schemas | **Partial (design only)** | Public-facing module *intents* known from product discussion; no authoritative API schema in-repo |
| Compatible auth + publishing interfaces | **Unknown** | Prior UAT assumes possible WordPress REST or custom API; neither validated on a staging host |
| Contractual permission (C3-01) | **Open** | Required before any connection work |
| Registered `cms_instances` row | **Missing** | Must be created only after Owner authorises Pilot 2 prep |

**Gate:** Do not configure `cms_connections.base_url` to any live Treasure House (or other live client) host.

---

## 4. Recommended candidate (for Owner decision)

### Recommendation

**Treasure House** is the strongest *product* candidate for the first real-client integration **if and only if** an isolated non-production stack exists, because:

1. It exercises specialised modules beyond Generic page trees (ministries, sermons, events, programmes).  
2. It forces correct **sensitive-module withhold** (pastoral / membership never enter platform content).  
3. It matches V2.1 example registry intent (`treasure-house`) without requiring NiiNai finance surfaces.  
4. Hosted gateway + vault + approval gate are already proven against an independent host — the missing piece is a **client-shaped staging API**, not another Generic redesign.

### Not recommended as first connection

| Option | Why not first |
| --- | --- |
| Live Treasure House production | Violates isolation; Production HOLD |
| NiiNai | Higher sensitive/finance surface; V2.3 warns against auto-pick |
| Expanding only `dev-client-cms` | Useful rehearsal, but not a real client architecture |
| Connecting WordPress production REST | Same as live client — forbidden without separate Owner auth |

---

## 5. Proposed adapter mappings (draft — no implementation until authorised)

Reuse existing gateway; add a **client-specific adapter code** only when staging API shape is known.

### 5.1 If staging is WordPress (Category B)

| OkangGroup capability | Mapping |
| --- | --- |
| Adapter | `wordpress_rest` (catalogue already exists; runtime calls still to be built for Pilot 2) |
| Auth | Application Password / JWT in **vault** as `dev/treasure-house-staging` (must use `dev/` prefix) |
| Health | WP REST `/wp-json/` or custom health route |
| Modules | Map `cms_modules.module_code` → WP CPT / REST namespaces (e.g. `sermons`, `events`) — **exact map TBD from staging** |
| Publish | Draft → OkangGroup approval → gateway publish → WP status `publish` |
| Rollback | WP revisions if exposed; otherwise withhold rollback capability |
| Sensitive | Pastoral/membership CPTs **omitted** from `cms_modules` allow-list |

### 5.2 If staging is a custom OkangGroup-built app (Category C)

| OkangGroup capability | Mapping |
| --- | --- |
| Adapter | Prefer new `treasure_house_staging` **or** extend protocol compatible with `okang_dev_client` (`/v1/capabilities`, `/v1/modules/:code/content`, publish, rollback) |
| Auth | `service_jwt` or API key in vault (`dev/treasure-house-staging`) — short-lived preferred (V2.3 C-B) |
| Modules | Explicit codes: `ministries`, `sermons`, `events`, `programmes`, plus any public pages — each with JSON schema documented in Pilot 2 pack |
| Correlation | Require `X-Correlation-Id` on client side (already sent by gateway) |
| Idempotency | Client must honour gateway idempotency keys on publish |

### 5.3 Platform-side artefacts (when Owner authorises prep — still not production)

| Artefact | Action |
| --- | --- |
| `clients` + `cms_instances` | Register `treasure-house` against staging only; `public_site_url` must not be production |
| `cms_modules` | Public modules only; `is_sensitive=true` modules registered as **deny / not connected** |
| `cms_connections` | `base_url` = staging host; `credential_ref` = `dev/...`; `integration_mode=external` |
| Gateway | Reuse `cms-integration-gateway`; add adapter branch if WP/custom differs from stub protocol |
| Approvals | Unchanged: `assert_cms_external_publish_allowed` before external publish |
| Generic CMS | Untouched / FROZEN |

### 5.4 Application-specific changes expected on the **client staging** side

(To be confirmed with the client app owner — **not** applied here.)

1. Expose a non-production base URL reachable by Supabase Edge (not localhost-only).  
2. Enforce server-side auth independent of OkangGroup RLS.  
3. Implement module-scoped read/write/publish (and rollback if claimed).  
4. Reject production credentials and production database URLs in staging config.  
5. Support correlation id + idempotency on mutating routes.  
6. Keep pastoral/membership APIs off the integration allow-list.

---

## 6. Pilot 2 pack status (V2.3 §14.2)

| Pack item | Status |
| --- | --- |
| Client identity | **Proposed:** Treasure House / `treasure-house` — **Owner unconfirmed** |
| Contractual permission | **Open** |
| Module catalogue | **Draft intents only** — needs staging schema |
| Contractual access profile | **Open** (must deny pastoral/sensitive) |
| Auth method | **Open** (C3-02) |
| Capability assessment | **Blocked** until staging API is available |
| Management mode | Recommend `okanggroup_managed` or hybrid **per module** only if required (C3-04) |
| Gateway / adapter | Prefer existing gateway + client adapter (C3-05) — **pattern ready; client not connected** |
| Success / rollback tests | Reuse hosted UAT harness against staging once URL exists |

---

## 7. Prerequisites before any connection attempt

Owner / client engineering must confirm **in writing**:

1. Staging (or dedicated non-prod) URL and that it shares **no** production database.  
2. Safe test dataset (or empty seed) with no live personal pastoral data.  
3. Non-production vault credentials only (`dev/…` refs).  
4. Module list with sensitivity flags and permitted operations.  
5. Auth mechanism and whether independent AuthZ can enforce actor + module + operation.  
6. Explicit authorisation to register the instance and run gateway probes against **that staging URL only**.

Until then: **no** `configure_cms_connection` to Treasure House, **no** vault secrets for live hosts, **no** Edge calls to client production.

---

## 8. Suggested rehearsal (optional, still not a real client)

If staging is delayed, extend `dev-client-cms` modules to church-shaped codes (`ministries`, `sermons`, `events`, `programmes`) for adapter/UI rehearsal only. That remains a **fixture**, not Pilot 2.

---

## 9. Status summary

| Item | Status |
| --- | --- |
| Hosted integration architecture | ✅ Proven |
| Real client candidate identified | ✅ **Treasure House (provisional)** |
| Isolated env verified | ❌ Not evidenced |
| Safe to connect now | ❌ **No** |
| Owner C3-01 decision | ⏳ Required |
| Production | 🔒 **HOLD** |

**Ask of Owner:** Confirm whether an isolated Treasure House (or alternate) development/staging CMS exists, and authorise Pilot 2 pack completion before any connection work.
