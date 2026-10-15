# OpsWatch Managed Website registration (Phase 1)

Navigation: **Owner Administration → CMS Management → Managed Websites → OpsWatch**

## What this connects

| Side | Role |
|------|------|
| OkangGroup | Central CMS controller (edit, preview, publish, rollback) |
| OpsWatch `/api/cms` | Marketing-content-only HTTP adapter |

OpsWatch Command Center, customer data, monitoring operations, and billing records are **out of scope** for the CMS API key.

## Prerequisites (local)

1. OpsWatch API running with additive migration `20261013150000_marketing_cms_content` applied.
2. Set `OPSWATCH_CMS_API_KEY` in OpsWatch API env (dev default exists when unset in non-production).
3. Apply OkangGroup migration `20261013160000_m43_opswatch_marketing_adapter`.

## Register OpsWatch

1. Open **Managed Websites** (`/cms-systems`).
2. Create a CMS instance named **OpsWatch** (Generic or Hybrid) under the OkangGroup client/project.
3. Configure connection:
   - Adapter: `opswatch_marketing`
   - Base URL: `http://localhost:4000/api/cms` (local) or `https://opswatch.okanggroup.com/api/cms` (production later)
   - Credential ref: `dev/opswatch-marketing-cms`
4. Store vault secret via `store_cms_credential('dev/opswatch-marketing-cms', '<same as OPSWATCH_CMS_API_KEY>')`.
5. Run gateway health / capabilities from the dashboard.

## Module codes

Match OpsWatch `content/marketing` cmsKeys:

- `opswatch.site.chrome`
- `opswatch.page.home` … `opswatch.page.contact`

Pricing **amounts** are not editable through CMS. Prose/CTAs on the pricing page are allowed.

## Owner editing journey

1. Managed Websites → create/select **OpsWatch** instance → **Attach OpsWatch marketing**.
2. Store vault credential `dev/opswatch-marketing-cms` (same value as OpsWatch `OPSWATCH_CMS_API_KEY`).
3. Gateway health.
4. Open instance from **My Client CMS** (`/my-cms/:id`) → OpsWatch marketing editor.
5. Edit homepage hero → **Save draft** (not public) → **Preview** → **Publish** → confirm `http://localhost:3000/` → **Rollback**.

Staff without `can_publish` / `clients.manage` see Save/Preview only.

## Website Registry connection (Connect / Reconnect)

Registry **Connected** requires evidence: `cms_connections.status=healthy`, `last_healthy_at`, and a non-empty `base_url`. Configure alone never shows Connected.

1. OpsWatch API must be reachable from **hosted Edge** (not bare `localhost` — use a tunnel for local API, or a public `/api/cms` URL).
2. Vault credential `dev/opswatch-marketing-cms` must match `OPSWATCH_CMS_API_KEY` (secrets stay server-side).
3. Managed Websites → Website registry → **Connect** / **Reconnect** on the OpsWatch row.
4. That runs `configure_cms_connection` then gateway `health` → OpsWatch `GET /api/cms/health` (capabilities fallback).
5. Probe without flipping registry status: `node scripts/opswatch-cms-connection-probe.mjs [baseUrl]`.

Publishing and Visual Studio stay separate from API connection status.

## Verification checklist

- [ ] Gateway health returns `adapter: opswatch_marketing`
- [ ] Capabilities list modules and `customer_data: false`
- [ ] Registry shows **Connected** only after successful gateway health
- [ ] Failed health shows **Connection failed** / diagnostics; Reconnect works
- [ ] Put homepage draft → preview token → publish → public `/` reflects change
- [ ] Rollback restores prior published revision
- [ ] CMS API key cannot call `/api/billing` or authenticated Command Center routes
- [ ] Owner UI editor loads for `opswatch_marketing` instances
