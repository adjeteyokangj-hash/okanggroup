# OkangGroup — Central CMS Next Development (Consolidated UAT)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Environment | Development only |
| Production | **HOLD** |
| Decision | Freeze Generic CMS feature work after verification; proceed with centralised multi-client CMS integration |

---

## 1. Generic CMS — PASS / FROZEN (development)

| Area | Result | Evidence |
| --- | --- | --- |
| Visual editor + expanded workspace | **PASS** | Prior UAT; preserved |
| Desktop / tablet / mobile previews | **PASS** | Centred frames; mobile 320/375/390/430 |
| Responsive hamburger navigation | **PASS** | Open/close in preview; Properties → Page; persisted `navigation` + `navigationCss` |
| Native publish / rollback / audit | **PASS** | `m36_cms_e2e_acceptance` |
| Client approval gate | **PASS** | `m37_client_approval_gate_regression` |
| Drag-and-drop reorder semantics | **PASS** (automated) | `ops.reorder.test.mjs` — reorder + undo stack; chrome nodes immovable |
| Undo / Redo stack | **PASS** (automated) | Same harness + existing `ProVisualBuilder` history |
| Responsive nav unit | **PASS** | `responsiveNav.test.mjs` |
| Interactive browser DnD / Undo click-through | **OWNER VERIFY** | Admin session not available to Cursor (login wall; no passwords). Owner should confirm once signed in. |

**Freeze rule:** No further Generic CMS feature redesign unless a defect blocks operations or Owner re-opens scope. Generic remains a fully supported option for simple website clients.

---

## 2. Architecture review — what is reusable

| Artefact | Role in central integration |
| --- | --- |
| `cms_instances` + `cms_config_type` (generic / custom / hybrid) | Central registry — different clients keep different CMS shapes |
| `cms_modules` + `hosted_in` / `is_sensitive` | Module map without forcing Generic page tree |
| `cms_connections` + `credential_ref` | Per-instance adapter; secrets stay out of DB |
| `cms_instance_grants` | Staff assignment — only authorised clients/modules |
| Client portal + `client_user` memberships | Restricted client CMS access |
| Draft → submit → management → client approval → publish | Preserved (m36 gate) |
| Revisions / restore / audit / MFA | Preserved |
| V2.3 design (`okanggroup-cms-integrations-v2.3.md`) | Principles C1–C11; Pilot 1 native done; Pilot 2 external still Owner-gated |
| Visual Generic editor | **Option A** only — not required for Custom-only clients |

**Do not force** every client into Generic page structures. Custom modules (`cms_custom_module_defs`) and external adapters remain first-class.

---

## 3. Integration foundation implemented (development)

Migrations: `m38_cms_integration_foundation`, `m38b_cms_integration_rpcs`.

| Deliverable | Detail |
| --- | --- |
| `sandbox_mock` adapter | Safe test connection — **no live client applications contacted** |
| Capability assessment | `cms_connections.capability_json` + `integration_mode` |
| Operation log | `cms_integration_operations` — correlation id + idempotency key (PA-I01/I02 lite) |
| `configure_cms_connection` | Owner/`clients.manage` sets adapter without egress |
| `test_cms_connection` | Native + sandbox healthy; WordPress/webhook remain honest **blocked** without vault credentials |
| `run_cms_sandbox_publish_probe` | Idempotent sandbox publish; writes publish job + audit |
| CMS Management UI | Set adapter · Test connection · Sandbox publish |
| Fixture | Custom CMS `UAT Custom Sandbox CMS` on isolated client (not Generic) |

Regression: `supabase/tests/m38_cms_integration_foundation_regression.sql` → **PASS** (`m38_ok`).

---

## 4. Status matrix (objective alignment)

| Requirement | Status |
| --- | --- |
| 1. Generic available for simple sites | **Done** (FROZEN for feature growth) |
| 2. Custom CMS for individual apps | **Done** (registry + custom modules + sandbox custom instance) |
| 3. Hybrid Generic + custom modules | **Done** (existing hybrid workspace) |
| 4. Central management via OkangGroup | **Done** (CMS Management dashboard) |
| 5. Secure connect to client website/app | **Foundation** — sandbox proven; live adapters **blocked** pending vault credentials + Owner Pilot 2 authorisation |
| 6. Staff only assigned clients | **Done** (grants + RLS) |
| 7. Client restricted portal | **Done** |
| 8. Approvals / publish / history / rollback | **Done** |
| 9. Isolation / permissions / MFA | **Done** (regression + Owner MFA check) |
| 10. Reuse, don’t rebuild | **Done** (extended connections + RPCs; no Generic redesign) |

---

## 5. Explicitly not done (correctly deferred)

- Live WordPress / webhook calls to real client apps  
- Modifying Treasure House, NiiNai, or any live client codebase  
- Pilot 2 client selection (C3-01–C3-05 remain Owner decisions)  
- Production deploy  

---

## 6. Owner residual checks (short)

1. Signed-in: Generic editor — drag one block, Undo, mobile hamburger open/close, Save.  
2. CMS Management — set a non-prod instance to **Sandbox mock**, Test connection, Sandbox publish (expect healthy + idempotent replay on second click).  
3. Confirm Custom sandbox instance appears separately from the Hybrid Test Client Generic/hybrid site.

---

## 7. Recommendation

| Track | Next |
| --- | --- |
| Generic CMS | **PASS/FROZEN** on development after Owner browser residual |
| Central integration | Continue adapter work only with **sandbox** or Owner-authorised Pilot 2 pack; never against live clients without separate authorisation |
| Production | **HOLD** |

**End of consolidated report.**
