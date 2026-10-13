# OkangGroup — Hosted Client CMS Integration (Consolidated UAT)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Environment | Development only |
| Production | **HOLD** |
| Live client apps | **Not contacted / not modified** |
| Generic CMS | **PASS / FROZEN** (unchanged) |

---

## Verdict

**PASS (hosted development)** — The deployed `cms-integration-gateway` successfully authenticated to a publicly reachable **non-production** client CMS stub, retrieved/edited content, enforced approval gates, published, rolled back, rejected unauthorised staff, and recorded idempotent operations.

Next step (separate Owner authorisation): connect one real non-production client application.

---

## 1. Hosted non-production client application

| Item | Detail |
| --- | --- |
| Application | `dev-client-cms` Edge Function (DB-backed store) |
| URL | `https://prbgsnxpwyepdggdysnt.supabase.co/functions/v1/dev-client-cms` |
| Isolation | Dedicated stub; `live_client: false`; not Treasure House / NiiNai / any live site |
| Auth | Server-side `X-Api-Key` (JWT verify disabled on stub; key required for `/v1/*`) |
| Persistence | `private.dev_client_cms_store` via service-role RPCs (`m40`) |
| Local twin | Still available on `:8791` for offline protocol tests |

---

## 2. Configuration through OkangGroup

| Step | Result |
| --- | --- |
| Vault `store_cms_credential('dev/okang-client-cms', …)` | **PASS** — secret not echoed (`leaked_secret: false`) |
| `configure_cms_connection` → `okang_dev_client` + hosted base URL | **PASS** — status `configured` |
| Credential location | Private vault only — not browser storage |

Connection after UAT: adapter `okang_dev_client`, base URL hosted stub, credential_ref `dev/okang-client-cms`.

---

## 3. Requirements matrix (hosted)

| # | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Deploy dedicated publicly reachable non-prod client CMS | **PASS** | Stub `/health` → 200, `hosted: true` |
| 2 | Protect endpoint with server-side auth | **PASS** | Missing API key → 401 |
| 3 | Configure via CMS Management / RPCs | **PASS** | `configure_connection.ok` |
| 4 | Credentials in private vault only | **PASS** | Vault store; gateway resolves server-side |
| 5 | Hosted gateway connection + auth | **PASS** | `gateway_health` / `gateway_capabilities` 200 |
| 6 | Retrieve test content | **PASS** | `gateway_get_content` |
| 7 | Edit + save through OkangGroup gateway | **PASS** | `gateway_put_content` |
| 8 | Submit for management approval | **PASS** | Platform save → submit → mgmt decide |
| 9 | Client approval where required | **PASS** | Publish blocked at `awaiting_client_approval` (403) |
| 10 | Publish approved content via hosted gateway | **PASS** | Publish with published hybrid doc gate |
| 11 | Changes appear in non-prod client app | **PASS** | `verify_published_in_client_app` title match |
| 12 | Rollback, failures, retries/idempotency, isolation | **PASS** | Rollback 200; bad module 502; idempotent replay; unknown instance 403 |
| 13 | Unauthorised staff cannot bypass | **PASS** | Daniel: vault denied; gateway health **403** (after m41) |
| 14 | Recorded hosted evidence | **PASS** | `supabase/.temp/hosted_uat_result.json` + this report |

---

## 4. Automated evidence

| Harness | Result |
| --- | --- |
| `POST …/functions/v1/cms-hosted-integration-uat` | **PASS** (`verdict: PASS`) |
| `npm run cms:hosted-uat` | Wrapper for the same runner |
| Local protocol (unchanged) | `npm run cms:integration-e2e` still **PASS** |
| Authz fix | `m41_gateway_snapshot_authz_fix` — SECURITY DEFINER no longer skips JWT checks via `current_user=postgres` |

### Critical evidence snippets (hosted run)

- Gateway health upstream: `service=okanggroup-dev-client-cms`, `hosted=true`, `live_client=false`
- Publish blocked: `Document requires management + client approval before external publish` (403)
- Idempotent publish replay: `idempotent_replay: true`
- Published on stub: title `Hosted UAT Announcement`
- Daniel gateway: `403 Forbidden`
- Cross-instance: `403`

---

## 5. Edge functions (development)

| Function | verify_jwt | Role |
| --- | --- | --- |
| `dev-client-cms` | false (API key) | Hosted non-prod client CMS |
| `cms-integration-gateway` | true | Server-side vault + upstream calls |
| `cms-hosted-integration-uat` | false (API key) | Automated hosted UAT runner |

---

## 6. Status after this increment

| Component | Status |
| --- | --- |
| Generic CMS | ✅ PASS / FROZEN |
| Integration foundation (m38/m39) | ✅ PASS |
| Hosted stub + gateway E2E | ✅ **PASS** |
| Real non-production client app (Owner-authorised) | ⏳ Next |
| Live production clients | 🔒 Forbidden without Owner authorisation |
| Production | 🔒 **HOLD** |

---

## 7. How to re-run

```bash
npm run cms:hosted-uat
# writes supabase/.temp/hosted_uat_result.json
```

CMS Management default base URL now points at the hosted stub. Secrets still entered only into the vault RPC (cleared from the UI field after submit).
