# OkangGroup CMS — Complete End-to-End Acceptance UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-12 (updated — client approval gate) |
| Environment | Development (`OKG Test Client Website CMS`) |
| Instance | `f5dfa20e-3c7a-4b89-b77d-ac53339a1edf` (hybrid / okang_native) |
| Production | **HOLD** |
| Method | RPC/JWT acceptance (`m36_cms_e2e_acceptance.sql`, `m37_client_approval_gate_regression.sql`) + m34 security |
| External website publish | **Not claimed** — native managed content store only |

## Evidence artefact

| Artefact | Result |
| --- | --- |
| SQL harness (native path, no client approval) | `m36_e2e_ok` |
| Client approval gate | `m37_part_a_ok` + `m37_part_bcd_ok` |
| Security regression | m34 RLS/FORCE + anon revoke (incl. new RPCs) + template secret scan **OK** |
| Admin TypeScript | `tsc --noEmit` **OK** |
| Migrations (dev) | `m36_client_approval_gate`, `m36b_client_approval_rpcs`, `m36c_client_approval_decide_publish` |
| Browser gestures | Still **Owner verification** — no staff/Owner passwords given to Cursor |

## PASS / FAIL matrix

| # | Test | Result | Notes |
| --- | --- | --- | --- |
| 1–4, 6, 8, 10 | Create / persist / nested / save / reopen | **PASS** | Unchanged native builder persistence |
| 5, 7, 9, 11 | DnD / viewports / close-reopen UI / Undo | **Owner verification** | Not application failures — no authenticated browser session for Cursor |
| 12 | Submit as Daniel | **PASS** | |
| 13 | Daniel cannot approve/publish | **PASS** | Grant + RPC deny; also cannot `client_decide` / `publish_client` |
| 14 | Owner management review | **PASS** | |
| 15 | Client approval (authorised client account) | **PASS** | When `requires_client_approval`: Owner → `awaiting_client_approval` (does **not** publish); client → `approved_for_publish`; authorised publisher → `published`. Cross-client client decide denied. |
| 16–17 | Publish to native store + content match | **PASS** | Via `publish_client_cms_document` after client approval, or Owner `decide` when client approval not required |
| 18–20 | Restore / audit / isolation + MFA | **PASS** | Owner MFA verified; fake user denied |

## Client approval workflow (corrected)

**Required path:** Daniel submits → Owner approves (management) → Client approves → Authorised user publishes.

| Flag | Management approve | Next | Publish |
| --- | --- | --- | --- |
| `requires_client_approval = true` | `awaiting_client_approval` | Client approve → `approved_for_publish` / reject → `draft` | `publish_client_cms_document` only when `approved_for_publish` |
| `requires_client_approval = false` | Publishes immediately (preserved) | — | Via `decide_client_cms_document` |

Additional enforcement:

- Content edit while `in_review` / `awaiting_client_approval` / `approved_for_publish` / `published` → `draft` (approval invalidated; audited).
- Decision history in `client_cms_revisions`: `management_approve`, `client_approve`, `client_reject`, `publish`.
- Backend RPCs + RLS helpers (`private.can_client_decide_cms_instance`); anon execute revoked.
- UI: workspace “Approve for client” / “Client approve|reject” / “Publish”; portal pending list uses `awaiting_client_approval`.

## Defects

| ID | Severity | Defect | Action |
| --- | --- | --- | --- |
| D1 | Medium | Client-approval flag did not gate Owner publish | **Fixed** (m36 / m36b / m36c + m37 regression) |
| D2 | Process | Browser login without passwords | **Open** — Owner verifies DnD / viewports / Undo while signed in |

## Recommendation

| Area | Status |
| --- | --- |
| Native CMS persistence / submit / Daniel deny / restore / audit | **PASS** |
| Owner publish when client approval **not** required | **PASS** |
| Client approval enforcement | **PASS** (RPC layer) |
| Visual editor gesture UAT | **Owner interactive confirmation still required** |
| External website integration | **Not yet tested** |
| Production | **HOLD** |

## Freeze decision (2026-10-12)

Generic CMS feature development is **PASS/FROZEN** on development pending Owner residual browser confirmation of DnD/Undo. Further platform work focuses on **centralised multi-client CMS integration** (see `okanggroup-central-cms-next-development-uat.md`).

## Production

**HOLD.**

