# Owner activation — Treasure House Staging

This package is prepared but **not activated**. Cursor must not create paid infrastructure, connect production, or bypass C3-01.

## Recommended architecture decision

**Yes — create a separate Supabase staging project for Treasure House.**

Device UAT / Vercel preview that shares `gmyhzxxqiokklybebzpf.supabase.co` is **not** isolation.

## Minimum Owner actions to activate

| # | Action | Who |
| --- | --- | --- |
| 1 | Create a **new** Supabase project dedicated to Treasure House staging (separate from live) | Owner |
| 2 | Record **C3-01**: Pilot 2 = Treasure House **staging** website CMS only, with contractual permission | Owner |
| 3 | Apply `sql/001` → `002` → `003` on that staging project only | Owner / authorised operator |
| 4 | Create staging auth (separate project auth is automatic with new Supabase project) | Owner |
| 5 | Deploy this bridge (or a hosted Edge equivalent) to a **non-production** URL — never into live TH app | Owner |
| 6 | Store API key in OkangGroup vault as `dev/treasure-house-staging` | Owner |
| 7 | Authorise configuring `treasure-house-shadow` connection: adapter `treasure_house_staging` (or `okang_dev_client` protocol), `base_url` = staging bridge, `credential_ref` = vault ref | Owner |
| 8 | Authorise Tests B–D (retrieve, approval-gated publish, rollback) against staging only | Owner |

## Explicitly not done until the above

- Paid Supabase project creation  
- OkangGroup `cms_connections.base_url` configuration  
- Live Treasure House app modification / deploy  
- Production connection  

## Local rehearsal (no Owner infra)

```bash
cd staging/treasure-house
npm test
npm start
```

This proves the `/v1` protocol and shadow field mappings without touching Treasure House production.
