# OkangGroup — Client CMS Integration UAT (M30)

| Field | Value |
| ----- | ----- |
| Status | **DEV — Visual Editor Foundation (M32) on okang_native; production HOLD** |
| Direction | Locked in `okanggroup-visual-client-cms-direction.md` |
| Baseline | W3/W4 registry + grants preserved; Company CMS unchanged |
| Owner permissions | Still **22** catalogue codes (includes `tasks.execute`) — no new Owner codes |
| Stage 2 overlays | HOLD |

## What genuinely works on development

| Capability | Evidence |
| --- | --- |
| **Visual Editor Foundation (Stage 1)** | Preview frame, click-to-edit sections, add/remove/reorder, desktop/tablet/mobile, brand colours, image upload to `client-cms-media` |
| Seeded visual homepage | `Homepage (visual)` draft on Test Client homepage module |
| Configurable modules per CMS instance | homepage, about, services, news, contact |
| Staff workspace (edit draft → submit → Owner publish) | Existing workflow retained under visual editor |
| My Client CMS → **Open workspace** | `/my-cms/:instanceId` |
| Client portal shell | `client_user` → Client Portal only |
| Create client portal user | Edge function + Website CMS panel |
| External adapter registry stub | Test Client `okang_native`; WordPress live adapter = Stage 2 |

Published content for the UAT homepage document is stored in `client_cms_documents` (platform-hosted OkangGroup-managed CMS). It is **visible in the workspace** as Published — not automatically pushed to a public marketing site deploy pipeline (public website deploy remains HOLD).

## What requires an external CMS connection

| Item | Status |
| --- | --- |
| WordPress / existing Treasure House public CMS live edit | **Not connected** — register as `wordpress_rest` / `custom_webhook` + vault `credential_ref`, then implement adapter calls |
| Noble Express / other hosted CMS migration | Assessment only — use `cms_connections` + `cms_modules.hosted_in=external_cms` |
| Sensitive modules (finance, membership, bookings) | Blocked from platform content tables by design (`is_sensitive` / `hosted_in`) |
| Live publish to client public URL | Okang_native publishes inside OkangGroup content store; external publish adapters **not yet implemented** |

## What remains incomplete

1. Browser UAT of **Create client portal user** → client login → portal edit (edge function ready; Owner should run once on Test Client).
2. Module admin UI (add/reorder modules) beyond SQL seed — Owner can insert via SQL/API; panel UI not fully expanded.
3. Rollback UI (revision table exists; restore RPC not yet exposed).
4. Email notifications for CMS events (in-app only).
5. Production deploy — **HOLD**.

## Presentation fixes (M31)

| Issue | Fix |
| --- | --- |
| Daniel saw Client/Project as empty selects | Read-only labels via `task_display_context` (client/project names for task readers) |
| Conversation showed **Someone** | `author_display_name` on messages + participant map; Owner role labelled **Owner** |

## CMS capability check (Test Client)

| Person | view | edit | submit | publish |
| --- | --- | --- | --- | --- |
| Owner | ✅ | ✅ | ✅ | ✅ |
| Daniel | ✅ | ✅ | ✅ | ❌ |

API check: Daniel saved **About Us draft by Daniel** and submitted → `in_review`; publish as Daniel **denied**.

## Recommended Owner browser check

1. Refresh admin; open Daniel’s homepage task — Client/Project names and **Owner** / **Daniel Mensah** on messages.
2. As Daniel: **My Client CMS → Open workspace** → edit a module → Save draft → Submit (no Approve & publish buttons).
3. As Owner: open same workspace → Approve & publish **About Us draft by Daniel**.
4. Create a client portal user from Website CMS; sign in — **Client Portal** only.
5. Confirm Company CMS remains Owner-gated for Daniel.

## Security notes preserved

- Staff CMS access still via `cms_instance_grants` (revocable without wiping task history).
- Client users are `account_kind=client_user` with membership + CMS grant only.
- No database credentials or hosting secrets in UI — `credential_ref` labels only.
- Task execute vs manage (Stage 1.1) untouched.
- MFA gate for Owner/staff privileges unchanged.
