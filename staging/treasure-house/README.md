# Treasure House Staging Bridge (OkangGroup package)

Isolated **staging-only** CMS bridge for proving OkangGroup Shadow CMS → Treasure House communication.

- **Not** the live Treasure House application  
- **Not** Device UAT (shares live Supabase)  
- **Refuses** production hosts (`thbci.org`, live Supabase project ref)  
- Default mode: in-memory synthetic store (no paid infrastructure required)

## Local

```bash
cd staging/treasure-house
npm test
npm start
```

Default: `http://127.0.0.1:8792`  
API key: `okang-th-staging-key-not-for-production` (override with `TH_STAGING_API_KEY`)

## Endpoints (OkangGroup gateway protocol)

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/health` | No |
| GET | `/v1/capabilities` | `X-Api-Key` |
| GET/PUT | `/v1/modules/:code/content` | `X-Api-Key` |
| POST | `/v1/modules/:code/publish` | `X-Api-Key` |
| POST | `/v1/modules/:code/rollback` | `X-Api-Key` |

First-wave modules: `ministries`, `homepage`, `quick_cards`, `leadership`.

## SQL (Owner staging project only)

1. `sql/001_website_cms_schema.sql`  
2. `sql/002_synthetic_seed.sql`  
3. `sql/003_staging_storage.sql`  

Never apply these to the live Treasure House Supabase project.

## Activation

See `OWNER_ACTIVATION.md` and  
`docs/architecture/okanggroup-treasure-house-staging-build.md`.
