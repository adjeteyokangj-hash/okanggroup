# OkangGroup — Release 1 Build Status

| Field | Value |
| --- | --- |
| Authorisation | **Complete Release 1 build authorised** 2026-10-11 |
| Design baseline | V2.1.9 + frozen acceptance criteria (Option A) |
| Supabase target | `prbgsnxpwyepdggdysnt` / `okanggroup-platform` only |
| Public website deploy | **HOLD** — separate Owner approval required |
| Document version | **1.0.0** |

---

## Progress

| Workstream | Status |
| --- | --- |
| R1 SQL migrations M0–M15 (files) | **Prepared** under `supabase/migrations/` |
| Apply migrations to Supabase | **Blocked** — workspace OkangGroup MCP must be reconnected with write access (not read-only; not StarLiz plugin account) |
| Admin app scaffold (`admin/`) | **Prepared** — auth, MFA gate, dashboard, clients, projects, tasks, CMS, staff |
| Owner bootstrap (first user + owner grant) | Pending after migrations |
| Security advisors / RLS verification | Pending after migrations |
| Production Vite deploy from CMS publish | **Not authorised** |

---

## Owner action required to continue DB apply

1. In Cursor MCP for this workspace, ensure Supabase is connected as **`okanggroup@gmail.com`**.  
2. Use project **`okanggroup-platform` / `prbgsnxpwyepdggdysnt`**.  
3. Prefer write-enabled workspace MCP (`.cursor/mcp.json` no longer sets `read_only=true`).  
4. Reply **“MCP reconnected — continue Release 1 migrations”**.

Do **not** apply migrations through any session that only sees `vzgfvzzbgrlxvixejmdt`.

---

## Safeguards in force

- Only approved R1 migration set (no M5/M7 finance/client-CMS product).  
- No per-feature stop/start approvals inside R1.  
- No automatic production website deployment.

**End of build status 1.0.0**
