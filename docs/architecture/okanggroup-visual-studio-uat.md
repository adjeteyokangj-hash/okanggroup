# OkangGroup Visual Studio — Owner acceptance programme

Local / non-production only. No GitHub push or production publish required for this checklist.

## Phase 0 — OpsWatch Visual CMS UX gate

1. Edit a selected card title → middle draft canvas updates immediately (no Save).
2. Select another card → left, canvas outline, and right fields all change.
3. Switch module (e.g. Homepage → AI Intelligence) → selection resets; path matches module.
4. Desktop / tablet / mobile viewport widths change the canvas frame.
5. **Expand canvas** hides rails; **Show panels** restores them.
6. Status line and helper text remain readable on the dark shell.
7. **Save draft** does not publish (published revision unchanged).
8. **Rollback** (with publish permission) restores previous published revision.

## Phase A–G — Visual Studio shell (canvas-first)

1. Website canvas stays full-width; tools **overlay** and do not squeeze the canvas into a narrow column.
2. Compact icon toolbar is draggable (handle), collapsible to a FAB, and sits **bottom-centre** by default (`translateX(-50%)`).
3. Every toolbar icon has a descriptive tooltip; active/open tools are highlighted; unsupported tools stay disabled.
4. Content preset opens only Layers + Properties; other tools open on demand.
5. No duplicate Layers/Properties rails inside the OpsWatch embed (inspector portals into Properties).
6. Dock left / right / bottom / float; minimise to chip, restore, close; snap-to-edge on drag end; semi-transparent while dragging; clamp on-screen; Reset Workspace.
7. Layout persists in `okang.visualStudio.layout.v3.*` (v1/v2 keys discarded).
8. Expand canvas (shell) hides overlays and enlarges the editing surface.
9. **Single primary canvas:** Edit mode shows the draft canvas only; Preview mode shows the live site iframe (preview token). No stacked draft + site preview.
10. Switching Edit ↔ Preview preserves selection and unsaved draft state (Preview saves dirty draft first via gateway).
11. Text / Image / Layout tools edit supported OpsWatch fields live; Colour / Effects / Animation stay disabled when unsupported.
12. Selecting a canvas element opens Properties; Layers and Properties stay synchronised.
13. Save / Preview / Publish / Rollback remain permission-gated on the existing gateway.
14. Verify at 1280 / 1440 / 1920 desktop widths.

## Professional editing tools

1. Select a hero or card → Typography Studio: change font size → draft canvas updates before Save.
2. Colour Studio: set background HEX → canvas updates; Save draft; reload module → style still present.
3. Image Studio: set alt text / fit → canvas updates; upload when media permission is granted.
4. Layout Studio: section columns 2↔3 and padding → canvas updates; tablet/mobile viewport still frames.
5. Effects Studio: shadow Soft → canvas updates; Animation remains disabled for OpsWatch.
6. Undo / Redo reverse the last edit session steps without discarding the whole draft.
7. Save Draft → Preview (token) → supported styles match the draft canvas on the OpsWatch site (local).
8. Publish/rollback only in isolated local OpsWatch — never production.
9. Unsupported tools stay disabled with an explanation (see capability matrix).
10. Confirm one Managed Website instance cannot write another instance’s draft.
11. Floating toolbar defaults to bottom-centre and stays clear of Layers/Properties docks.

## Professional tool completion (post-`d54e5cb`)

### Native CMS

1. Select an **image** node → Image Studio opens automatically; upload/replace uses media library; preview resolves signed URL; fit/max-width update canvas.
2. Select text/heading/section → Typography / Layout / Colour / Effects open as recommended; Animation Studio toggles hover/scroll interactions and canvas shows `cms-ix-*` behaviour.
3. Undo/Redo/Save Draft still work after Image and Animation edits.
4. Content / Design / Preview modes remain consistent with OpsWatch shell behaviour.

### Treasure House (shadow)

1. Layers select a module section → canvas nav and floating Text/Image tools target that module.
2. Open/edit a draft record → Text Studio edits title + text fields; Save draft record keeps status `draft`.
3. Image fields: upload via existing `uploadClientCmsImage`; path stored on record; preview via signed URL when path-like.
4. Colour / Layout / Effects / Animation remain **disabled** (no no-op buttons).
5. Publishing workflow still draft → in_review → published on records only; no production TH writes.
6. Existing TH content, galleries, and animations on the real site are untouched (shadow only).

### Cross-client Owner UAT

1. Run Phases above on three isolated local instances (OpsWatch, native CMS, TH shadow).
2. Confirm capability matrix rows match observed behaviour.
3. No database migrations/resets, no GitHub push, no production deploy.

## Treasure House UX refinement (CMS Management vs Visual Studio)

1. Open Treasure House shadow → default is **CMS Management** (dashboard / forms / media), not Visual Studio.
2. Switch to **Visual Studio** → module button strip is gone; Layers lists website modules → pages → fields.
3. Select **Pages → About** (or any shadow page) → centre shows a **simulated page canvas** with yellow banner: not the live church website.
4. Click a heading on the canvas → Properties + Text Studio update; Layers selection matches.
5. Edit text → Save Draft → record remains `draft` in shadow CMS; CMS Management still lists the same record.
6. Preview mode hides tools and shows the simulated page without inline editors.
7. Colour / Layout / Effects / Animation remain disabled with tooltips.
8. **Back to CMS Management** returns to administration without losing the instance.
9. Floating toolbar shows labeled, grouped tools; Layers/Properties are dockable and do not replace the canvas.

## Security reminders

- Vault credentials never enter the browser.
- OpsWatch deny flags (billing, monitoring, customer data) remain outside this studio.
- Floating tools must not bypass gateway or platform RPC permission checks.
- See `okanggroup-visual-studio-capability-matrix.md` for adapter-truthful tool status.
