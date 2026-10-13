# OkangGroup CMS — Consolidated UI Quality Pass UAT

| Field | Value |
| --- | --- |
| Status | Development |
| Date | 2026-10-12 |
| Production | **HOLD** |
| Scope | Usability / reliability only — no editor rebuild |

## Changes delivered

1. **Single Expand/Exit control** — Expand only on the embedded editor header; Exit only in the expanded toolbar.
2. **Title / slug binding** — Selecting a saved page sets title & slug; docs reload re-hydrates empty fields; editor header shows the active page title.
3. **Preview contrast** — Admin `.panel h2 { color:#fff }` no longer overrides canvas headings; WCAG-style contrast warnings on Page/Design colour controls.
4. **Expanded by default on desktop** (≥1100px), preference stored in `localStorage` (`okang.cmsEditorExpanded`).
5. **Embedded editor** — taller preview stage and rails so non-expanded work remains usable.
6. **Template thumbnails** — browser chrome + hero/cards/footer mock using template brand/tokens (v1 sections or v2 tree counts).
7. **Custom module fields** — richer controls from field defs: richtext/markdown, boolean, select, media upload, email/url/date/number.
8. **Persistence regression** — `npm run test:cms-persist` + `test:cms-contrast`; drafts still save via `save_client_cms_document` with v2 `body_json`.

## Manual UAT

1. Desktop open My Client CMS → editor opens expanded (unless previously collapsed).
2. Exit expanded → one Expand button on the card header; expand again → one Exit control.
3. Click a saved page → Page title and Slug fields match the document; save → reload page → design and title still present.
4. Mobile viewport: Welcome/About headings readable on light backgrounds; force white text on cream → Design/Page shows contrast warning.
5. Templates tab → each card shows a visual thumbnail; Use template applies layout.
6. Custom tab → Sermons (or similar) shows media upload / textarea / typed inputs per field def.
7. Drag reorder + Alt+nest still work; header/footer remain Fixed.
8. Permissions, approvals, MFA, audit unchanged.

## Remaining defects / follow-ups (non-blocking)

- Template thumbnails are stylised previews from brand tokens, not pixel screenshots of live sites.
- Custom “richtext” is a large textarea (not a full WYSIWYG) — intentional until Phase 2 tooling.
- Relationship selectors for custom modules remain future work.

## Production

**HOLD** — development only.
