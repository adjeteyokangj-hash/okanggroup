# OkangGroup — Stage 2 Proposal: Advanced Staff Access Management

| Field | Value |
| --- | --- |
| Status | **Design decisions APPROVED in principle — implementation HOLD** |
| Date | 2026-10-12 |
| Depends on | Stage 1 security UAT **PASS / FROZEN** |
| Target | `prbgsnxpwyepdggdysnt` |
| Public website deploy | HOLD |
| Owner MFA / 21 permissions | Must remain unchanged |
| Stage 1 freeze | Daniel 4 codes; CMS Editor revoked; Owner 21 + MFA intact |
| D2 | **APPROVED** — C UI + A overlays |
| D3 | **APPROVED** — retain platform-scoped CMS; improve empty-state UX only |
| D5 | **HOLD** — no Stage 2 coding until separate approval + readiness sign-off |

---

## 1. Why Stage 2

Stage 1 proved least-privilege grants, revoke, MFA, and RLS. Access today is mostly **role packages** (`staff`, `cms_editor`, …) plus **client/project scopes**.

Owner observation after Daniel UAT:

- Staff includes `company_cms.read`, so Company CMS stays in the nav even when CMS Editor is revoked.
- Project-scoped Staff can see an empty CMS page (UI permission vs platform-scoped CMS RLS) — secure but confusing.
- Changing access currently means adjusting role grants (or asking for role-definition changes).

**Principle:** Staff should receive capabilities based on responsibilities, not solely because they are employees/contractors/freelancers. The Owner should select modules and scopes per person in the admin UI without Cursor editing role seeds each time.

---

## 2. Goals (read-only proposal)

1. **Per-staff module visibility** — Owner can enable/disable modules for one person (e.g. Tasks on, Company CMS off) without changing the default Staff role for everyone.
2. **Project/client access management** — Clear UI to grant/revoke scopes (platform / client / project) already modeled by `access_scopes` + `role_grants`.
3. **Backend enforcement** — Every UI toggle must map to server-checked permission predicates + RLS (no frontend-only hiding).
4. **Auditability** — Who changed whose access, when, and from/to what.
5. **No weaken Stage 1** — Frozen Daniel/Owner configuration stays until an authorised Stage 2 build; Owner MFA hard-gate and 21 permissions preserved.

---

## 3. Non-goals (this Stage 2 proposal)

- Production website deploy  
- Inviting David or other real production staff without separate approval  
- Redesigning the full RBAC matrix from scratch  
- Finance / client portal / AI Work Inbox  
- Automatically deleting verified MFA factors  

---

## 4. Recommended product model

### 4.1 Keep roles as templates

Roles remain **starting templates** (Staff, CMS Editor, Operations Manager, …). Owner applies a template, then **customises**.

### 4.2 Add per-profile capability overlays (design options)

Present three options for Owner decision before coding:

| Option | Idea | Pros | Cons |
| --- | --- | --- | --- |
| **A — Deny / allow overlays** | Keep role grants; add profile-level allow/deny permission codes | Minimal change to seeds; easy “CMS off for Daniel” | Need clear precedence (deny wins) |
| **B — Explicit capability grants only** | Drop reliance on broad packages for day-to-day; Owner picks modules + scopes | Clearest least privilege | More clicks; migration of existing grants |
| **C — Module packs + scopes** | UI modules (Dashboard, Tasks, CMS, Clients, Projects, Staff admin) map to fixed permission sets; Owner toggles modules per staff + assigns scopes | Best UX for Owner | Must keep pack→permission map versioned and RLS-aligned |

**Recommendation:** **C for UI**, implemented as **A under the hood** (templates + overlays), so Stage 1 grants stay compatible.

### 4.3 Module map (illustrative — not frozen)

| Module (Owner toggle) | Typical permission codes |
| --- | --- |
| Dashboard | `dashboard.read` |
| Tasks | `tasks.read`, optional `tasks.manage` |
| Company CMS (view) | `company_cms.read` |
| Company CMS (edit) | `company_cms.edit` |
| Company CMS (publish) | `company_cms.publish` |
| Clients | `clients.read` / `clients.manage` |
| Projects | `projects.read` / `projects.manage` |
| Staff admin | `org.staff.read` / `invite` / `manage`, `platform.roles.manage` |

Scopes (client/project) continue to constrain data via `has_permission_on_client` (and future project helpers). Platform-only capabilities (CMS today, staff admin) must be documented so Owner understands when a **platform** grant is required vs project grant.

### 4.4 UX sketch (Staff detail)

1. **Access summary** — effective modules + scopes (computed, read-only strip).  
2. **Modules** — toggles with edit/publish sub-options where needed.  
3. **Scopes** — list/add/revoke client & project access (reuse current grant UI, clearer labels).  
4. **Apply** — single save → RPCs update grants/overlays → staff session refreshes permissions on next `my_permission_codes`.  
5. **Empty states** — if a module is on in UI but RLS cannot return data (e.g. CMS without platform scope), show an Owner-facing warning and a staff-facing “no access to content” message (UX fix; no security weaken).

---

## 5. Five Owner safeguards (mandatory design constraints)

These are **acceptance gates** for any future Stage 2 implementation approval. Stage 2 must satisfy all five; UI-only toggles are not enough.

| # | Safeguard | How Stage 2 will meet it |
| --- | --- | --- |
| **S1** | **Individual permissions** without editing role templates | Role grants stay as templates. Per-profile **overlays** (`allow` / `deny` on permission codes, or module packs that write overlays) customise one staff member. Changing Staff for Daniel does **not** change Staff for everyone. |
| **S2** | **Client/project restrictions** remain enforced | Overlays only affect *which codes* are effective. Data still requires matching `access_scopes` via `private.has_permission_on_client` (and related helpers). No overlay may invent platform-wide data access without an explicit scope grant. |
| **S3** | **Immediate revocation** for existing sessions | Effective permissions are computed in Postgres on every `has_permission*` / `my_permission_codes` call (not baked into JWT). Revoke/deny overlay must be visible on the **next API request**. Admin UI must call `refreshProfile` / re-fetch codes after save; optional short note to staff “access updated — reload if menus look stale.” |
| **S4** | **Audit history** | Every Apply writes an immutable audit row: actor, target profile, before/after effective codes (or overlay diff), scopes touched, timestamp. Prefer `audit_events` (existing M14) with a dedicated `action` (e.g. `staff.access.update`). Owner can review history from Staff detail. |
| **S5** | **Owner protection / no self-elevation** | RPCs: caller must have `platform.roles.manage` or `org.staff.manage`; **cannot** target self for privilege changes; **cannot** modify profiles that hold active platform `owner` grants; cannot grant `owner` via overlays. Staff RLS already blocks self-update of privileged profile fields — retain and extend checks to overlays. |

---

## 6. How overlays interact with role grants and RLS

### 6.1 Effective permission formula (proposed)

```text
base_codes     = permission codes from active role_grants (any scope), excluding revoked grants
allow_overlay  = codes explicitly allowed for this profile
deny_overlay   = codes explicitly denied for this profile

effective_codes = (base_codes ∪ allow_overlay) − deny_overlay
```

**Precedence:** **deny wins**. Example: Staff template includes `company_cms.read`; Owner sets deny on `company_cms.read` for Daniel → CMS nav and CMS RLS both treat him as without read (after `my_permission_codes` / `has_permission` incorporate overlays).

### 6.2 Scope still gates rows

```text
may_use(code, client_id) =
  code ∈ effective_codes
  AND (
    private.has_permission(code)           -- platform-scoped grant path
    OR private.has_permission_on_client(code, client_id)  -- client/project grant path
  )
```

Overlays **never** bypass scope. Turning on “Clients” without a client/project scope grant must not list other tenants’ clients.

### 6.3 Alignment work (Stage 2 build, only if approved)

Today Stage 1 behaviour (frozen):

- `my_permission_codes` returns codes from **any** scoped role grant.
- `private.has_permission(code)` only counts **platform** scopes.
- CMS RLS uses `has_permission('company_cms.*')` → project-scoped Staff with CMS-read in the package see **empty** CMS data.

Stage 2 implementation must either:

1. Document this clearly in the Access UI (“CMS content requires a platform-scoped grant”), **or**  
2. With separate Owner approval, align CMS RLS / predicates so module toggles and data visibility match.

No change to that frozen behaviour until Stage 2 coding is authorised and D3 is decided.

### 6.4 Immediate revoke path (sequence)

1. Owner disables module / adds deny overlay → RPC commits overlay + audit.  
2. Next PostgREST call as that staff runs `has_permission*` with new effective set → RLS denies.  
3. No need to ban Auth session for module revoke (unlike suspend/offboard).  
4. Suspend/offboard remains Stage 1 path (ban + revoke grants) and is unchanged.

---

## 7. Technical alignment (high level)

| Area | Direction |
| --- | --- |
| Data | New overlay table (or equivalent) + reuse `role_grants` / `access_scopes`; no password/MFA storage |
| RPCs | Owner/admin only; no self-target; no Owner-target; no `owner` role via overlay |
| `my_permission_codes` + `has_permission*` | Same effective formula (S1–S3) |
| RLS | Keep FORCE RLS; policies continue to call updated helpers |
| Audit | `audit_events` (or dedicated access_audit) on every Apply (S4) |
| Admin UI | Staff detail **Access** panel; public site untouched |
| Tests | Module deny → API deny; cross-client deny; self-elevation attempt fails; Owner 21 + MFA unchanged |

**Open design question (D3):** Keep `company_cms.*` platform-scoped only (current frozen behaviour + clearer empty state), or allow project-scoped CMS read later?

---

## 8. Delivery slices (after Stage 2 implementation approval)

| Slice | Work | Exit |
| --- | --- | --- |
| S2-0 | Owner decisions (D2–D3); confirm S1–S5 safeguards | Written APPROVED |
| S2-1 | Overlay schema + effective-permission RPCs + audit write | SQL: Owner 21 + MFA; deny wins; no self-elevation |
| S2-2 | Staff detail Access UI (modules + scopes) | Build pass |
| S2-3 | Nav/empty-state consistency with RLS | Disposable staff UAT |
| S2-4 | Negative-access + immediate-revoke + audit UAT | Owner accept before any prod deploy |

---

## 9. Frozen Stage 1 reminder

Until Stage 2 is separately authorised:

- Do **not** change Staff / CMS Editor role definitions  
- Do **not** restore Daniel’s CMS Editor grant  
- Do **not** implement overlays or module toggles in code  
- Do **not** deploy the public website  
- Stage 1 remains **PASS / FROZEN**

---

## 10. Decisions for Owner

| # | Decision | Outcome |
| --- | --- | --- |
| D1 | Accept Stage 2 design for review | Accepted |
| D2 | Implementation shape | **APPROVED — C UI + A overlays** (deny overrides allow; templates unchanged for others) |
| D3 | CMS platform vs project scope | **APPROVED — keep platform-scoped CMS**; empty-state UX only; no project-scoped CMS expansion without separate review |
| D4 | Safeguards S1–S5 mandatory | **Yes** |
| D5 | Authorise Stage 2 coding | **HOLD** — separate approval required after readiness assessment |

**Additional constraint (Owner):** Enabling a capability (e.g. `tasks.manage`) must **never** bypass client/project assignments. Overlays adjust codes only; scopes remain mandatory for row access.

---

## 11. Technical readiness assessment (pre-implementation)

Assessment against Owner safeguards and consistent enforcement. **No code/schema changes performed.**

| Topic | Ready? | Notes |
| --- | --- | --- |
| Permission precedence | **Ready to design** | Documented: `(base ∪ allow) − deny`; deny wins. Must be implemented identically in `my_permission_codes` and `private.has_permission*`. |
| Scope enforcement | **Ready to design** | Overlays must not grant cross-client data. Existing `has_permission_on_client` remains the row gate. **Gap found outside Stage 2:** Staff + `tasks.manage` allows full-row task edits in client scope (see task security review). Stage 2 overlays alone do not fix field-level task abuse — needs separate task execute/manage remediation. |
| Immediate revocation | **Ready to design** | Helpers are live SQL (not JWT-embedded codes). Overlay commit → next request enforces. UI must refresh permission codes after Apply. |
| Audit integrity | **Ready to design** | Use `audit_events` (or dedicated table) with actor, target, before/after, timestamp; RPC-only writes. |
| Owner protection | **Ready to design** | RPC guards: no self-target; no Owner-target; no `owner` via overlay; retain MFA hard-gate and 21 Owner perms as exit criteria. |
| Frontend / backend / RLS consistency | **Conditional** | Stage 2 must wire: UI modules → overlay RPC → helpers → RLS. Today CMS already shows UI/RLS mismatch for project-scoped read (empty page) — Stage 2 empty-state addresses UX without expanding access (D3). |
| Regression testing | **Ready to plan** | Required pack: deny CMS-read → nav/API deny; enable tasks without client scope → no cross-tenant rows; revoke mid-session → next API deny; audit row present; Owner 21 + MFA unchanged. |
| Related blocker | **Open** | Task manage vs execute security review: `docs/architecture/okanggroup-r1-task-execution-vs-manage-security-review.md`. Recommend resolving (or explicitly sequencing) before or with Stage 2 so module “Tasks” does not mean “redefine all client tasks”. |

### Readiness verdict

| Question | Answer |
| --- | --- |
| Is Stage 2 architecture approved to build? | **Not yet (D5 HOLD)** |
| Is design sound for overlays + scopes + audit + Owner protection? | **Yes, in principle** |
| Blockers before implementation approval | (1) Owner sign-off on this readiness section; (2) Decision on task execute/manage remediation timing; (3) Explicit `APPROVED — implement Stage 2…` |

---

## 12. Verdict

Stage 2 **architecture is approved in principle** (D2, D3). **Implementation remains on HOLD (D5).** Stage 1 remains **PASS / FROZEN**.  

**No application code, database schema, role definitions, or production deployments were modified under this update.**

**End of proposal**
