# OkangGroup Visual Studio — capability matrix

Local assessment after **Treasure House Visual Studio UX refinement** (CMS Management vs Visual Studio split, simulated page canvas, shared labeled toolbar). Baseline: `480722e` → TH UX follow-up.

A tool is **fully functional** only when: select → edit → live canvas (or record form) → undo/redo (where the adapter has session history) → save draft → preview parity (where the adapter has a public site) works without inventing unsupported schema fields.

| Capability | OpsWatch marketing | OkangGroup native CMS | Treasure House (staging/shadow) |
|---|---|---|---|
| Shared Visual Studio shell | Fully functional | Fully functional | Fully functional (host) |
| CMS Management vs Visual Studio | N/A (editor-first) | N/A (editor-first) | Fully functional — separate tabs |
| Design / Content / Preview modes | Fully functional | Fully functional | Fully functional (Preview = simulated page) |
| Layers / selection sync | Fully functional | Fully functional | Fully functional — modules → pages → fields ↔ canvas |
| Context-aware tool open | Fully functional | Fully functional | Fully functional (Text / Image from selected field) |
| Typography Studio | Fully functional (allowlisted `style` + copy) | Fully functional (`BuilderNodeStyle`) | Fully functional — selected page text fields |
| Colour Studio | Fully functional (sanitized) | Fully functional | **Unsupported** (disabled) — no page style schema |
| Image Studio | Fully functional | Fully functional — upload/replace/fit via media library | Fully functional — image fields + library upload |
| Layout Studio | Fully functional | Fully functional | **Unsupported** (disabled) — modules are not a page builder |
| Effects Studio | Fully functional (shadow/radius) | Fully functional | **Unsupported** (disabled) |
| Animation Studio | **Unsupported** (disabled) | Fully functional — `interactions` persist + canvas render | **Unsupported** (disabled) |
| Undo / Redo (session) | Fully functional | Fully functional | Unsupported in VS (draft save only) |
| Responsive viewport | Fully functional | Fully functional | Partial — shell only |
| Save Draft | Fully functional (gateway) | Fully functional (platform docs) | Fully functional — custom records stay `draft` |
| Preview parity | Fully functional with OpsWatch `d42415f+` | Partial — canvas preview / interactions | **Simulated shadow preview only** (clearly labelled; live TH deferred) |
| Publish / Rollback | Fully functional (permission-gated) | Fully functional (workflow) | Partial — shadow / staging only |
| Version history | Gateway revisions | Platform document workflow | Record status workflow + platform history when enabled |
| Cross-instance isolation | Per `instance_id` | Per client instance + document | Per instance |

## Features that cannot be safely supported (reported, not faked)

### Treasure House

| Feature | Why unsupported |
|---|---|
| Colour / layout / effects / animation studios | Shadow CMS uses `cms_custom_module_defs.fields_json` + `cms_custom_records` — no page-builder style or interaction model. Persisting invented CSS would not map to production Treasure House (`TH_FIELD_MAPPINGS`) without schema / gateway work. |
| Live public-site Preview parity | Staging gateway deferred (C3-01). Shadow data is synthetic and not wired to production TH. |
| Session Undo/Redo in VS | Custom module panel owns form state; VS does not duplicate a second history stack. |

### OpsWatch

| Feature | Why unsupported |
|---|---|
| Animation Studio | Marketing visual style allowlist has no animation persistence path comparable to native `interactions`. |

## Workspace modes

| Mode | Behaviour |
|---|---|
| **Content** | Opens Layers, Properties, Text, Image — quick copy/media work |
| **Design** | Opens Layers, Properties, Layout, Colour, Text, Effects (capability-gated per adapter) |
| **Preview** | Hides floating tools; shows draft canvas / site preview path |

Panel positions persist per user + instance (`layout.v5`). Selecting a canvas/module target auto-opens adapter-recommended studios (e.g. image → Image Studio).

## Owner UAT (isolated local only)

See `okanggroup-visual-studio-uat.md`. Production publish / GitHub push remain hold.

## Test results (local)

| Check | Result |
|---|---|
| `tsc --noEmit` (admin) | Pass (`480722e`) |
| Unsupported tools disabled via capability registry | Pass by design |
| Native Image uses `uploadClientCmsImage` / media library | Pass |
| TH Text/Image bridge to `CmsCustomModulePanel` | Pass |
| Native Animation renders on canvas | Pass (`cms-ix-*` classes) |
| Auth / MFA / migrations unchanged | Pass — not modified |
