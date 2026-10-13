# OkangGroup — Treasure House Staging Build (Implementation Package)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Package | `staging/treasure-house/` |
| Shadow CMS | Preserved / FROZEN PASS |
| Generic CMS | FROZEN |
| Live Treasure House app | **Not modified** |
| Production | **HOLD** |
| Connection activated | **No** |
| C3-01 | **Still required before connect** |

---

## Verdict

**Staging implementation package delivered. Activation blocked pending Owner infrastructure + C3-01.**

Recommended decision: **create a separate Supabase staging project** for Treasure House (true DB/auth/storage isolation). Device UAT sharing the live project remains unsuitable.

---

## 1. What was prepared (authorised)

| Item | Location |
| --- | --- |
| Staging env template | `staging/treasure-house/.env.example` |
| Production / shared-live denylist + env validation | `staging/treasure-house/lib/guards.mjs` |
| Website CMS schema for isolated project | `staging/treasure-house/sql/001_website_cms_schema.sql` |
| Synthetic seed (no membership/pastoral/giving) | `staging/treasure-house/sql/002_synthetic_seed.sql` |
| Isolated storage bucket SQL | `staging/treasure-house/sql/003_staging_storage.sql` |
| Staging-only `/v1` CMS bridge | `staging/treasure-house/server.mjs` |
| Shadow → TH payload mappers | `staging/treasure-house/lib/mappers.mjs` |
| Automated integration tests | `staging/treasure-house/tests/integration.test.mjs` |
| Owner activation checklist | `staging/treasure-house/OWNER_ACTIVATION.md` |

Bridge protocol matches existing OkangGroup gateway (`okang_dev_client` / `treasure_house_staging`).

Guards refuse:

- `thbci.org` / related production hosts  
- Live Supabase project `gmyhzxxqiokklybebzpf.supabase.co`  
- `TH_STAGING_ENVIRONMENT=production|prod|live`

---

## 2. What was intentionally not done

| Action | Status |
| --- | --- |
| Create paid Supabase staging project | Not authorised |
| Connect OkangGroup shadow → any TH host | Not authorised |
| Deploy into live Treasure House application | Not authorised |
| Bypass / record C3-01 as approved | Not authorised |
| Repeat readiness discovery | Skipped |

---

## 3. Local verification

```bash
npm run th-staging:test
# or: npm --prefix staging/treasure-house test
```

Expected: `th-staging integration.test OK`

---

## 4. Minimum Owner actions to activate

1. **Create separate Supabase staging project** (recommended — required for true isolation).  
2. **Record C3-01** (Pilot 2 = Treasure House staging, contractual permission).  
3. Apply SQL `001` → `002` → `003` on that project only.  
4. Deploy the staging bridge to a non-production URL (not live TH).  
5. Store vault secret `dev/treasure-house-staging`.  
6. Authorise OkangGroup connection config on `treasure-house-shadow`.  
7. Authorise Tests B–D against staging only.

Until then: local bridge rehearsal only; Production **HOLD**.

---

## 5. Architecture after activation (target)

```text
OkangGroup Shadow CMS (treasure-house-shadow)
        │
        │ cms-integration-gateway
        ▼
Treasure House STAGING bridge (/v1)
        │
        ▼
Separate Supabase STAGING project
 (DB + Auth + Storage + synthetic data)
```

Live TH app + live Supabase remain untouched until a later, separately authorised cutover.
