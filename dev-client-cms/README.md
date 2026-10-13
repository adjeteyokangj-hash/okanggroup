# OkangGroup Dev Client CMS (NON-PRODUCTION)

Dedicated stub application for integration testing. It is **not** Treasure House, NiiNai, or any live client.

## Hosted (development)

Deployed as Edge Function `dev-client-cms` (DB-backed):

`https://prbgsnxpwyepdggdysnt.supabase.co/functions/v1/dev-client-cms`

Hosted UAT: `npm run cms:hosted-uat` (from repo root).

## Local run

```bash
cd dev-client-cms
# optional: set DEV_CLIENT_CMS_API_KEY
npm start
```

Default local: `http://127.0.0.1:8791` with API key `okang-dev-client-cms-key-not-for-production`.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Unauthenticated liveness |
| GET | `/v1/capabilities` | Capability discovery |
| GET/PUT | `/v1/modules/:code/content` | Draft retrieve / update |
| POST | `/v1/modules/:code/publish` | Publish draft |
| POST | `/v1/modules/:code/rollback` | Restore revision |

All `/v1/*` routes require header `X-Api-Key`.
