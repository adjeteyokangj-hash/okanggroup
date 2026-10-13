# OkangGroup — Pro Visual Builder Phase 1 UAT

| Field | Value |
| --- | --- |
| Status | Development |
| Date | 2026-10-12 |
| Production | **HOLD** |
| Scope | Phase 1 foundation (node tree, canvas, style inspector, colors) |

## What shipped

- **v2 document model** (`version: 2`) with nested nodes (`frame`, `stack`, `grid`, `text`, `heading`, `image`, `button`, `card`, …).
- **Automatic migration** of existing v1 `sections` drafts when opened.
- **Pro canvas**: select, ↑/↓, drag reorder, Alt+drop to nest into frame/stack/grid/card.
- **Fixed chrome**: header / nav / footer cannot be reordered.
- **Style inspector**: Content / Design / **Page** tabs.
- **Page background** and **default card colour** (Page tab); per-block fill and **card face colour** (Design).
- **Layers tree** mirrors nested structure and selection.
- **Library** inserts real node trees (Hero, Cards, Stack, Grid, etc.).
- **Brand** logo / app icon preserved.
- Draft save still uses `save_client_cms_document` with `body_json` (now v2 after first save).

## UAT checklist

1. Open an existing v1 draft → canvas shows migrated content; Save draft → stored JSON has `"version": 2` and `tree`.
2. Add Hero + Cards from Library → both appear; cards use default card colour.
3. Page tab → change page background → preview frame background updates.
4. Select a card → Design → Card face colour → only card surfaces change (not whole page).
5. Drag a non-chrome block above/below another → order updates; Undo restores.
6. Alt+drop a text block onto a Stack/Frame → it nests (Layers shows indented child).
7. Add Header or Footer → marked Fixed; move controls disabled.
8. Remove a block via × on canvas and via Remove block in inspector.
9. Upload logo under Brand → header preview shows logo.
10. Expand editor / Focus preview / collapse sidebar still work; workflow Save / Submit unchanged.
11. Production remains HOLD — no production deploy in this phase.

## Known Phase 1 limits (later phases)

- No reusable CSS classes / symbols yet (Phase 2).
- No per-breakpoint style overrides yet (Phase 2).
- No interaction timeline yet (Phase 3).
- No HTML/CSS export / live publish renderer yet (Phase 4).
