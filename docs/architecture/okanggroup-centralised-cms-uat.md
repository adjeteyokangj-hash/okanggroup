# OkangGroup Centralised CMS — Integrated UAT Report (Development)

**Date:** 12 October 2026  
**Environment:** Development only  
**Production deployment:** HOLD — not authorised  
**Owner instruction:** Complete centralised CMS as one integrated deliverable (Generic / Custom / Hybrid)

---

## 1. Everything implemented

| Area | Delivery |
| --- | --- |
| Central architecture | `cms_instances.cms_config_type` = `generic` \| `custom` \| `hybrid`; shared registry, grants, connections, audit |
| CMS Management Dashboard | `/cms-systems` (clients.manage) — registry, filters, create Generic/Custom/Hybrid, activate/suspend, connection test, pending reviews, publish jobs, audit |
| Advanced Generic editor | Full-width canvas, collapsible component + properties rails, desktop/tablet/mobile, full preview, drag-order via ↑↓, duplicate/copy/paste/remove, undo/redo, autosave (dirty), Save Draft, Submit / Approve / Reject |
| Component library | Hero, text, image, gallery, video, audio, CTA, nav, header, footer, banner, cards, grid, columns, form, testimonials, team, services, pricing, FAQ, accordion, tabs, slider, map, social, embed |
| Design tools | Brand colours, background, alignment, entrance animations (respect `prefers-reduced-motion`), element lock |
| Page management | Create/edit/duplicate/archive, draft vs published, SEO/nav columns in schema, revision history + restore |
| Media library | Per-CMS media, multi-upload, search, alt text, images/docs/audio/video (signed storage) |
| Templates | 8 system templates (corporate, professional, church, education, restaurant, property, portfolio, landing); Owner can save current design as template |
| Custom CMS framework | `cms_custom_module_defs` + `cms_custom_records` with configurable fields; Sermons / Ministries / Announcements on Test Client |
| Hybrid workspace | Single workspace tabs: Pages, Media, Custom modules, History/rollback, Templates |
| Connections | `okang_native` healthy path; WordPress/webhook/manual adapters honest “credentials required” (no stub presented as live) |
| Staff access | Grants: view/edit/submit/publish/upload/review/manage; Daniel retains edit+submit **without** publish |
| Client portal | Separate shell; dashboard with My Website, pending approvals, published list; workspace reuse |
| Approval / publishing | Edit → Draft → Submit → Management review → (optional) Client approval → Authorised publish; `awaiting_client_approval` / `approved_for_publish` when client gate required; publish jobs for native store; rejection with notes |
| Version / rollback | `client_cms_revisions` + `restore_client_cms_document`; history UI with confirmation |
| Notifications | Existing CMS submit/decision notifications preserved |
| Security | FORCE RLS on all CMS tables; anon execute revoked on CMS RPCs (m35); secrets not in browser |

---

## 2. Features tested successfully

- TypeScript compile (`admin` `tsc --noEmit`) — pass  
- FORCE RLS + FORCE on 14 CMS tables — pass  
- Template secret-string scan — 0 matches  
- `anon` cannot execute `test_cms_connection` after m35 — pass  
- Daniel Mensah grant: `can_edit`/`can_submit` true, `can_publish` false — pass  
- Test Client hybrid instance active with `okang_native` connection  
- 8 website templates present  
- Custom modules: sermons, ministries, announcements  

---

## 3. Features incomplete or blocked

| Item | Status |
| --- | --- |
| Live WordPress / GraphQL / custom webhook publish | **Blocked** — Owner must supply vault credentials + reachable test endpoint. Adapter registered; live update not claimed. |
| Image crop/compress UI | Partial — upload/replace/alt; dedicated crop tooling not shipped |
| Scheduled publish UI | Schema column present; scheduler worker not run in this pass |
| External rollback | Disabled unless adapter supports it (native restore only) |
| Dedicated portal “Support requests / Account settings” pages | Not separate routes — notifications + auth account flows cover account; support ticket module not built |
| Production deployment | **Not done** (HOLD) |

---

## 4. Database migrations (development)

| Remote | Notes |
| --- | --- |
| m33a–m33d | Centralised schema, RLS, RPCs, publish jobs |
| m34_cms_templates_seed | Template library + custom module seed idempotent |
| m35_cms_revoke_anon_rpc_execute | Revoke CMS RPC execute from anon/PUBLIC |
| m36 / m36b / m36c client approval gate | Statuses `awaiting_client_approval` + `approved_for_publish`; Owner decide does not publish when client required; `client_decide_cms_document` + `publish_client_cms_document`; edit invalidates approvals |

Local mirror files under `supabase/migrations/` include platform SQL + m34–m36c.

Regression scripts: `supabase/tests/m34_cms_platform_security_regression.sql`, `m36_cms_e2e_acceptance.sql`, `m37_client_approval_gate_regression.sql`.

---

## 5. Security test results

| Check | Result |
| --- | --- |
| CMS tables RLS + FORCE | Pass |
| Staff cannot self-grant publish | Enforce via Owner grant UI default `can_publish=false`; Daniel remains non-publisher |
| Cross-client isolation | RLS policies on instance/grant/document/media; no second client CMS in seed for negative live JWT in this pass — policy architecture in place |
| Direct API (anon RPC) | anon execute revoked on CMS RPCs |
| Credentials in frontend | Only `credential_ref` labels; no API secrets in admin bundle |
| Privileged MFA / Owner catalogue | Unchanged — not expanded for CMS |

---

## 6. Generic CMS demonstration

1. Owner → **CMS Systems** → create/open Generic or Hybrid  
2. Open workspace → **Pages & editor**  
3. Add components, brand colours, Save draft → Submit → Approve & publish  
4. Confirm status Published; live external site **not** claimed unless native store only  

---

## 7. Custom CMS demonstration

1. Open Test Client Hybrid → **Custom modules**  
2. Select Sermons / Announcements → create record → Save draft → Submit → Publish  
3. Confirm records are module data, not website page sections  

---

## 8. Hybrid CMS demonstration

1. Same workspace shows **Pages & editor** and **Custom modules** tabs  
2. Media / History / Templates shared across both  

---

## 9. Staff CMS demonstration

1. Daniel: My Client CMS → edit/submit only  
2. Publish buttons require publish/review grant or `clients.manage`  
3. Project **Website CMS** panel grants expanded capabilities  

---

## 10. Client Portal demonstration

1. Client user → `/portal` dashboard (not Operations shell)  
2. Open workspace at `/portal/cms/:id`  
3. No staff/clients/org routes exposed  

---

## 11. Publishing and rollback demonstration

1. Submit draft → Approve & publish → publish job `succeeded` for `okang_native`  
2. **History & rollback** → Restore revision → confirmation → new revision recorded  
3. External adapter publish: blocked message until credentials provided  

---

## Blockers requiring Owner action

1. **External CMS credentials** (WordPress REST / custom API) + reachable non-production endpoint if live third-party publish verification is required.  
2. **Production release authorisation** — separate explicit approval.

---

## Regression notes

- Task conversations, notifications, Stage 1.1 task execute/manage paths were not modified in this CMS completion pass.  
- Company CMS (`/cms`) remains separate from Client CMS Systems (`/cms-systems`).

**Verdict:** Development delivery of the integrated OkangGroup Centralised CMS is ready for Owner acceptance testing on the Test Client hybrid instance. Production remains untouched.
