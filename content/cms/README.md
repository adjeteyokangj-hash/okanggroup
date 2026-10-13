# Company CMS → Vite publish artefacts

Release 1 controlled publish path (cost plan §3.1):

1. Editors draft/approve pages in the admin SPA (`admin/`).
2. Operators run `node scripts/cms-publish-export.mjs` with a **service role** key to export published content into this folder.
3. The marketing Vite site imports `current.json` at build time (`js/main.js`) and overlays matching `[data-cms-page]` / `[data-cms-field]` regions when pages exist.
4. **Production deploy of the public website requires separate Owner approval** and is never performed by the export script.

Supported page slugs for overlay (optional): `home`, `about`, `services`, `products`, `work`, `process`, `contact`.  
When `pages` is empty, the static HTML copy shipped with the site is used unchanged.

## Rollback

- `previous.json` is the last good bundle before the latest export.
- Restore by copying `previous.json` over `current.json` (or redeploying the prior artefact under `artefacts/`).

## Files

| Path | Purpose |
| --- | --- |
| `current.json` | Active content bundle for the next authorised site build |
| `previous.json` | Immediate rollback target |
| `artefacts/` | Timestamped immutable bundles |
| `manifest.json` | Pointers written by the export script |
