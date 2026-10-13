# OkangGroup — Real Client CMS Integration (Consolidated UAT)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Environment | Development only |
| Production | **HOLD** |
| Scope | Production-capable integration layer for independently hosted client CMS apps |
| Live client apps | **Not contacted / not modified** |

---

## Verdict

**PASS (development)** — Secure adapter + private vault + Edge gateway + dedicated non-production stub + approval-gated publish + automated regressions. Ready for Owner-authorised Pilot 2 against a real non-production client application. **Not** production-ready until that pilot and separate Owner go-live.

Generic CMS remains **PASS / FROZEN**. Staff permissions and MFA unchanged.

---

## 1. What was delivered

| Layer | Artefact | Role |
| --- | --- | --- |
| Dedicated stub | `dev-client-cms/` (`:8791`) | Non-production client CMS API (capabilities, get/put content, publish, rollback) |
| Vault | `private.cms_credential_secrets` + `store_cms_credential` | Secrets never in browser storage or authenticated SELECT |
| Adapter | `okang_dev_client` on `cms_connections` | HTTP adapter for independently hosted apps |
| Gate | `assert_cms_external_publish_allowed` | External publish only after existing management/client approval rules |
| Ops log | `record_cms_integration_operation` / `get_cms_integration_operation_by_key` | Correlation + idempotency |
| Gateway | Edge Function `cms-integration-gateway` (JWT + `verify_jwt`) | Server-side credential resolve; health / content / publish / rollback |
| Admin | CMS Management → “Real client integration (development)” | Store vault ref, attach adapter, gateway health (secret cleared from UI after submit) |
| Tests | `m39_real_client_cms_integration_regression.sql` + `npm run cms:integration-e2e` | DB security + stub protocol |

Migration: `supabase/migrations/20261012161224_m39_real_client_cms_integration.sql` (applied on development).

---

## 2. Requirements matrix

| # | Requirement | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Secure API connections to independently hosted apps | **PASS** | Gateway uses vault API key + HTTPS/HTTP to `base_url`; JWT required |
| 2 | Client apps expose own CMS capabilities (not forced Generic) | **PASS** | Custom instance `uat-custom-sandbox` + module map; Generic untouched |
| 3 | Adapter config, health, auth, credential management | **PASS** | `configure_cms_connection`, vault store, gateway `health`/`capabilities` |
| 4 | Retrieve / edit / preview / publish / rollback per capabilities | **PASS** | Stub protocol e2e; capability_json on connection |
| 5 | Preserve client-specific interfaces / modules | **PASS** | External modules (`announcements`, `homepage`); no Generic redesign |
| 6 | Publishing follows management/client approval | **PASS** | `assert_cms_external_publish_allowed` blocks awaiting_client_approval |
| 7 | Retries, idempotency, errors, audit logging | **PASS** | Idempotency key replay; `cms_integration_operations`; connection last_error |
| 8 | Cross-client access prevented (backend) | **PASS** | Snapshot requires `clients.manage`; gateway authz before secret read |
| 9 | Credentials out of browser / client-side code | **PASS** | Vault RPC returns no secret; UI password field cleared; ACL denies authenticated EXECUTE on `cms_gateway_read_secret` |
| 10 | Test with dedicated dev app + safe credentials | **PASS** | `dev-client-cms` + `dev/okang-client-cms` key |
| 11 | No live client connect/modify without Owner auth | **PASS** | Prod-looking credential refs rejected; stub only; `live_production_client: false` |
| 12 | Preserve frozen Generic + staff permissions | **PASS** | No Generic feature changes; Daniel denied vault store |

---

## 3. Automated test results

| Test | Command / artefact | Result |
| --- | --- | --- |
| Stub protocol E2E | `npm run cms:integration-e2e` | **PASS** — `cms-real-integration-e2e OK (dev stub protocol)` |
| DB regression | `m39_real_client_cms_integration_regression.sql` | **PASS** — `m39_real_client_cms_integration_regression OK` |
| Secret ACL | `has_function_privilege` authenticated/anon = false; service_role = true | **PASS** |
| Admin typecheck | `npx tsc --noEmit` (admin) | **PASS** |
| Edge deploy | `cms-integration-gateway` v1 ACTIVE, `verify_jwt: true` | **PASS** |

### Known environment limit

Hosted Edge Functions **cannot reach** `http://127.0.0.1:8791`. Gateway health against the local stub requires either:

- `supabase functions serve` on a machine that can reach the stub, or  
- a non-production tunnel/`base_url` reachable from Edge (still **not** a live client).

Protocol correctness is proven by the local Node E2E; vault + ACL + approval gate are proven on the development database.

---

## 4. Security notes

- `private.cms_credential_secrets`: REVOKE from anon/authenticated; service_role only for secret read path.
- Production/`prod`/`live` credential refs rejected unless `dev/` prefix (Owner authorisation gate for real Pilot 2).
- Gateway never returns API keys; operation logs store request metadata only.
- Publish path re-checks document status via caller JWT RPC before upstream publish.

---

## 5. How to exercise (development)

```bash
npm run cms:dev-client          # stub on :8791
npm run cms:integration-e2e     # protocol suite
```

In CMS Management (Owner / `clients.manage`):

1. Store vault credential (`dev/…` + secret).
2. Select Custom sandbox instance → Attach `okang_dev_client` → base URL `http://127.0.0.1:8791`.
3. Gateway health when Edge can reach the stub (local functions serve recommended).

---

## 6. Status after this increment

| Component | Status |
| --- | --- |
| Generic CMS | ✅ PASS / FROZEN |
| Central CMS registry | ✅ |
| Sandbox adapter (m38) | ✅ PASS |
| Real integration layer (m39) | ✅ PASS (development) |
| Dedicated non-prod client stub | ✅ PASS |
| Edge gateway + vault | ✅ Deployed / verified (ACL + store) |
| Real non-production client app pilot | ⏳ Next — requires separate Owner authorisation |
| Live production clients | 🔒 Forbidden without Owner authorisation |
| Production | 🔒 **HOLD** |

---

## 7. Next milestone (explicit)

Successful end-to-end connection to a **real, non-production** client application under separate Owner authorisation — not another Generic CMS redesign, and not production cutover.
