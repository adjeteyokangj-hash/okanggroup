# OkangGroup Platform — Client CMS Integration Architecture V2.3

| Field | Value |
| --- | --- |
| Status | **DESIGN ONLY — UNDER REVIEW — CODING HOLD — NOT FROZEN** |
| Document version | **2.3.1** |
| Depends on | Database **V2.1.8A** (accepted technical baseline); Workflows **V2.2.2** (accepted working baseline) |
| Does not modify | **V2.1.8A** · **V2.2.2** (schema needs recorded in §18 only) |
| Supabase target | `okanggroup-platform` / `prbgsnxpwyepdggdysnt` (implementation later; not altered here) |
| OD-04 | Remains **OPEN** |
| Supabase MCP auth | Remains **BLOCKED** (UD-08) until correct account/project accessible |
| Coding / migrations / deploy | **HOLD** |
| Production website | **Unchanged** by this document |

---

## 1. Purpose

V2.3 defines how OkangGroup securely connects to **individually customised** client applications and the company CMS without exposing private client information beyond authorised, contractual bounds.

It expands V2.1.8A §6.5 (external CMS authorisation boundaries) and realises V2.2.2 module-permission intent (W-D / UD-05) as an integration architecture — not as application code.

### 1.1 In scope

- Client CMS registration and connection management  
- Secure authentication between OkangGroup and client systems  
- Module-level permissions and contractual restrictions  
- Connection monitoring and error handling (including safe retries / idempotency)  
- Client-managed, OkangGroup-managed, and hybrid administration  
- Secure temporary access, revocation, and token invalidation  
- End-to-end audit correlation without copying sensitive client content  
- Integration credential protection (no master-key service credentials)  
- Pilot sequence: **company CMS first**, then **one approved client pilot** (OD-13 R1 / UD-05)  

### 1.2 Out of scope

- Modifying V2.1.8A or V2.2.2 text  
- SQL migrations, RLS implementation, UI coding  
- Closing OD-04 or unblocking Supabase MCP  
- Auto-selecting Treasure House, NiiNai, or any other client as Pilot 2  
- Definitive per-client module catalogues for every client  
- Live payment processors, production deploy, merge to `main`  

---

## 2. Governing principles

| ID | Principle | Meaning |
| --- | --- | --- |
| C1 | **Platform AuthZ ≠ external AuthZ** | OkangGroup RLS/grants are necessary but never sufficient for external CMS data. Every external call must also be accepted by the client CMS (or its gateway). |
| C2 | **Client isolation** | No shared credentials, no cross-tenant proxying, no silent copy of excluded modules into platform tables. |
| C3 | **Contractual supremacy** | `contractual_access_profile` and module exclusions override internal convenience. An Owner temporary grant cannot override an explicit client contractual denial (OD-08 A). |
| C4 | **Least privilege** | Tokens and credentials expose only the minimum external operations required for the authorised modules. |
| C5 | **No privileged fallback** | External AuthZ denial is surfaced to the user; the platform must not silently switch to a break-glass credential without an audited `temporary_access` path. |
| C6 | **Credential hygiene** | Raw secrets never in Postgres rows; only `credential_ref` to a vault/secret store, one per `cms_instance` (or narrower). |
| C7 | **Pilot discipline** | Prove company CMS publish/ops before adding external AuthZ complexity (OD-13 R1). |
| C8 | **Revocation is enforceable** | A revoked principal must lose effective access within a defined maximum delay; unexpired external tokens must not preserve access (C-A). |
| C9 | **No service master keys** | Platform service identity ≠ unrestricted CMS access; each call carries initiating user, module, and operation for independent enforcement (C-B). |
| C10 | **Safe mutation semantics** | Mutating integration calls are idempotent or reconcilable; read-only retries must not be confused with unsafe re-publish (C-C). |
| C11 | **Correlated audit, minimal content** | Every operation has a correlation id on both sides where supported; outcomes are recorded without copying sensitive client content into OkangGroup (C-D). |

These align with V2.2.2 Owner control, delegated management, and client isolation — they do not weaken them.

---

## 3. Relationship to V2.1.8A and V2.2.2

### 3.1 Artefacts reused (no silent schema change)

| V2.1.8A artefact | V2.3 use |
| --- | --- |
| `cms_instances` | Registry identity, `management_mode`, status, contractual profile |
| `cms_modules` | Module map, `is_sensitive`, `hosted_in` |
| `cms_connections` | `auth_method`, `credential_ref`, health fields |
| `cms_migrations` | Controlled discovery/migration state (never ingest excluded modules) |
| `temporary_access` | Time-boxed sensitive / break-glass paths |
| `audit_events` | Who initiated which external action (+ correlation id when PA-I items exist) |
| `monitored_services` / health / alerts | Connection and endpoint monitoring (where registered) |
| Company CMS tables (Domain 7) | Pilot 1 content model (internal; not client tenant DB) |

| V2.2.2 artefact | V2.3 use |
| --- | --- |
| W-D module-specific permissions | External enforcement contract |
| §7.4 dual delegation | Who may grant module/instance access in platform |
| UD-05 | Catalogue deferred here; company CMS → one client pilot |
| UD-03 exclusions | Ops Managers cannot delegate sensitive CMS access |

### 3.2 Visible V2.1 dependencies (must be authorised before implementation)

| ID | Requirement | Source | Notes |
| --- | --- | --- | --- |
| PA-01 | Configurable staff availability | V2.2.2 §19.1 | Ops assignment UX; not a CMS protocol blocker |
| PA-03 | Module-specific CMS permission scopes | V2.2.2 §19.1 | **Blocking** for module-scoped platform grants before hybrid/client pilots |
| PA-06 | Exact approved permissions/scopes in invitations | V2.2.2 §19.1 | Prevent over-privileged CMS editor invites |
| OD-04 | Retention durations | V2.1 | Open; offboarding deletion of integration artefacts |
| UD-08 | Supabase MCP to `prbgsnxpwyepdggdysnt` | V2.2.2 | Blocked |

V2.3 describes how PA-03 is **used** at the integration boundary; it does **not** amend V2.1.8A. Newly discovered integration schema needs are listed only in §18.

---

## 4. Logical architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ OkangGroup Platform (Auth, RLS, tasks, registry, audit)     │
│  /cms/{slug}  →  Integration Gateway (+ per-client adapter) │
│  Checks: session · grants · contract · revoke list · corr-id│
└────────────────────────────┬────────────────────────────────┘
                             │ short-lived, narrowly scoped assertion
                             │ platform identity + actor + module + operation
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Client CMS / Company CMS API (independent AuthZ)            │
│  Enforces module/operation · own data · own audit (+ corr-id)│
└─────────────────────────────────────────────────────────────┘
```

| Plane | Stores | Must not store |
| --- | --- | --- |
| Platform | Instance metadata, module map, connection health, task links, audit of initiations/outcomes, credential **references**, correlation ids | Raw client CMS secrets; sensitive client module **content** |
| Client / company CMS | Content, media, domain business data, own access logs | OkangGroup platform-wide secrets |

Management UI under okanggroup.com is **not** a substitute for external AuthZ (V2.1 §6.1).

**Recommended gateway posture (not an Owner decision yet — see C3-05):** prefer an OkangGroup-side integration gateway with a client-specific adapter where the external API differs. Direct-to-CMS calls without a gateway are discouraged for Pilot 2 unless justified.

---

## 5. Registration and connection lifecycle

### 5.1 States (`cms_instances.status`)

| Status | Meaning |
| --- | --- |
| `pending` | Registered; credentials/modules not yet verified |
| `connected` | Health checks passing; authorised operations allowed per mode/modules |
| `disconnected` | Intentionally offline or credentials revoked |
| `migrating` | Controlled migration/discovery in progress |
| `retired` | End of life; no operational proxy (OD-09 offboarding) |

### 5.2 Registration workflow (design)

1. Platform Admin / Owner creates `cms_instances` for a client (or internal company CMS marker).  
2. Declare `management_mode`, `cms_kind`, domains, `contractual_access_profile`.  
3. Register `cms_modules` (codes, sensitivity, hosted_in).  
4. Create `cms_connections` with `auth_method` and vault `credential_ref` (no plaintext).  
5. **Capability assessment (C-B):** document whether the external CMS can enforce actor + module + operation independently. Withhold capabilities it cannot enforce.  
6. Run connectivity probe → record `last_healthy_at` / `last_error`.  
7. Transition to `connected` only when probe succeeds **and** contractual module map is confirmed **and** capability gaps are recorded.  
8. Audit every step.

### 5.3 Connection management actions

| Action | Who (minimum) | Notes |
| --- | --- | --- |
| Register instance | Platform Admin / Owner | Client isolation from creation |
| Rotate credentials | Platform Admin / Owner | Update vault secret; bump `credential_rotated_at`; invalidate prior service tokens |
| Disconnect | Platform Admin / Owner | Blocks proxy; does not auto-kill public site (business rule A) |
| Retire | Owner / authorised offboarding | OD-09; revoke refs + external sessions where supported |
| Reconnect | Platform Admin / Owner | Re-probe + audit |

Managers do **not** hold integration credential administration under V2.2.2 UD-03 exclusions.

---

## 6. Secure authentication between OkangGroup and client systems

### 6.1 Supported `auth_method` values (V2.1)

| Method | Intent | Design constraints |
| --- | --- | --- |
| `service_jwt` | Platform presents **short-lived** JWT for that instance | Audience/issuer bound to `cms_instance_id`; claims include actor, module, operation (C-B); TTL per §9.3 |
| `m2m_oauth` | Client-credentials (or similar) against client token endpoint | Obtain short-lived access tokens only; cache in secure runtime/vault side-car; never DB rows; still attach actor/module/operation on each call |
| `signed_webhook` | Platform ↔ client signed events | Replay protection (timestamp + nonce); per-instance signing keys; correlation id on events |
| `manual` | Human-operated or break-glass tooling | No standing high privilege; audited; prefer automated method |

### 6.2 Token and secret rules

| Rule | Detail |
| --- | --- |
| Isolation | One credential identity per `cms_instance` (or narrower). **Never** reuse across clients. |
| Storage | Vault/secret store only; Postgres holds `credential_ref` |
| Short-lived | Access tokens / JWTs used for CMS calls must be short-lived (C-A); long-lived secrets stay in vault and are used only to mint short-lived assertions |
| Rotation | Scheduled + on staff/client offboarding + on suspected compromise + on revoke of high-risk access |
| Scope binding | Claims must not include modules that are contractually denied or unmarked in the allow-list |
| Clock skew | Document max skew for JWT/webhook validation |

### 6.3 Four-part call identity (C-B)

Every outbound mutating or privileged read must distinguish:

| Layer | Meaning |
| --- | --- |
| **Platform identity** | The OkangGroup integration principal for this `cms_instance` (proves the call comes from OkangGroup) |
| **Initiating employee** | The `profiles.id` (or opaque external actor id) who triggered the action |
| **Authorised CMS module** | The specific `module_code` in scope for this call |
| **Requested operation** | e.g. `view`, `edit`, `publish`, `list` — not an open-ended admin session |

The **external CMS must independently enforce** the resulting restrictions. The service credential must **not** automatically unlock the entire CMS or any sensitive module.

| If external CMS… | Then |
| --- | --- |
| Can enforce actor + module + operation | Capability enabled for that surface |
| Cannot enforce one or more of the above | Document the limitation in the connection capability record; **withhold** affected integration capabilities until suitable controls exist |
| Can only offer a coarse shared admin token | Treat as **non-compliant** for sensitive modules; do not enable those modules via integration |

### 6.4 Call path (authorisation order)

Every outbound integration call must pass **in order**:

1. Authenticated OkangGroup session with MFA if privileged (V2.2.2 / OD-11).  
2. Platform permission + scope (+ **module** scope once PA-03 is in an authorised V2.1 revision).  
3. Revocation / grant-active check at the gateway (C-A) — fail closed if principal or grant is revoked.  
4. `cms_instances.status = connected` (or explicit migrating path).  
5. `management_mode` allows this actor class for this action.  
6. Module not contractually denied; sensitive modules require unexpired `temporary_access` when applicable.  
7. Capability assessment allows this operation class (C-B).  
8. Issue/attach short-lived assertion carrying platform identity + actor + module + operation + **correlation id** (C-D).  
9. External CMS / gateway AuthZ accepts the call.  
10. Record outcome with the same correlation id; **do not** copy sensitive client content into OkangGroup audit payloads.

Failure at any step **stops** the call. No silent credential escalation (C5).

---

## 7. Module-level permissions and contractual restrictions

### 7.1 Module model

`cms_modules` is the feature map (not content). Platform grants for CMS work must be interpretable at **module** granularity (V2.2.2 W-D). Until PA-03 is authorised in V2.1, design assumes instance-level grants are **insufficient** for hybrid/sensitive pilots.

| Attribute | Use |
| --- | --- |
| `module_code` | Stable key shared in allow-lists and tokens |
| `is_sensitive` | Requires temporary/explicit path + contractual clearance; high-risk revocation rules (C-A) |
| `hosted_in` | `platform_registry_only` / `external_cms` / `company_cms` |
| Contractual profile | Instance-level profile may deny modules regardless of internal role |

### 7.2 Illustrative boundaries (not staff grants; not pilot selection)

Examples only — **Treasure House and NiiNai are not auto-selected as Pilot 2.** Access arrangements for any client must be agreed independently (contractual permission required before C3-01).

| System | Module | Typical posture |
| --- | --- | --- |
| Company CMS | Pages / navigation / SEO | Edit/publish per company CMS workflows |
| Example church CMS | Website content | Edit/publish if granted |
| Example church CMS | Pastoral records | No access by default; sensitive |
| Example hospitality CMS | Public website | Edit if granted |
| Example hospitality CMS | Financial transactions | No access by default |

**Definitive catalogues** for the chosen client pilot are produced in the pilot pack (§14), not invented here for all clients.

### 7.3 Contractual evaluation

Before proxy or credential use:

- Load `contractual_access_profile` and module flags.  
- Deny if client exclusion matches the requested module/operation.  
- Owner/Platform Admin cannot override denial via role alone (OD-08 A).  

---

## 8. Management modes

| Mode | Who mutates content | Platform role | External AuthZ |
| --- | --- | --- | --- |
| `okanggroup_managed` | Authorised OkangGroup staff (module-scoped) | Tasks, publish workflows, monitoring | Must still accept staff-correlated calls |
| `client_managed` | Client Admin/User per portal + module grants | Support, monitoring, optional assist grants | Primary enforcer for client users |
| `hybrid` | Per-module ACL on **both** sides | Module grants mandatory (PA-03 dependency) | Per-module acceptance |

Changing `management_mode` is an audited configuration change (Platform Admin / Owner). It does not by itself copy data or widen sensitive modules.

**C3-04 remains open:** defer hybrid unless the chosen Pilot 2 client genuinely needs it.

---

## 9. Temporary access and revocation (C-A)

### 9.1 Temporary access (sensitive / break-glass)

| Rule | Detail |
| --- | --- |
| Instrument | `temporary_access` (+ module identification once PA-03 exists) |
| Approver | Owner or Platform Admin per policy; never Ops Manager for sensitive CMS (UD-03) |
| Duration | Hard `ends_at`; default short; renewal is a new audited grant |
| Contract | Still subject to contractual denial |
| Runtime | Integration gateway refuses sensitive module calls without unexpired grant |
| End | Auto-deny after expiry; see §9.3 for token/session invalidation |

### 9.2 Revocation triggers

| Trigger | Actions |
| --- | --- |
| Grant expiry / manual revoke | Mark grant revoked; gateway deny; push invalidation where supported; audit |
| Staff offboarding | Revoke role_grants, temporary_access; invalidate OkangGroup sessions; revoke/narrow external actor bindings; rotate instance credentials if the staff member had vault access |
| Client offboarding (OD-09) | Export entitled data → revoke portal + `credential_ref` → disconnect/retire instance |
| Suspected compromise | Disconnect instance; rotate secrets; invalidate outstanding tokens; `security_incidents` |
| Contractual change denying a module | Update profile/modules; rotate or narrow tokens immediately |

Public websites are **not** automatically taken offline for billing (business rule A / OD-10 R1).

### 9.3 Immediate revocation enforcement (C-A)

A revoked employee must **not** retain access merely because an external token has not yet reached its natural expiry.

| Control | Requirement |
| --- | --- |
| Short-lived tokens | Access tokens / call JWTs used toward client CMS have a short TTL. **Design default maximum TTL: 15 minutes** (Owner may tighten per pilot; must be documented in Pilot 2 pack). |
| Revocation-aware gateway | On every outbound call, the OkangGroup gateway re-checks that the initiating principal and relevant grants are still active **before** minting or attaching a token. Cached “allowed” decisions must not outlive the maximum revocation delay. |
| Maximum revocation delay | From revoke/offboard commit to gateway deny: **≤ 60 seconds** (design SLA). Token TTL and cache TTL must be configured so residual external use cannot exceed this bound for ordinary risk, except where §9.4 applies. |
| No rely-on-expiry-alone | Relying solely on waiting for token expiry is **non-compliant** for staff offboarding and temporary_access revoke. |
| Correlation | Revoke events and subsequent denials share audit linkage (C-D). |

### 9.4 High-risk access — immediate invalidation

For **high-risk** access (sensitive modules, break-glass, finance-adjacent CMS modules, or any module marked requiring immediate kill):

| Requirement | Detail |
| --- | --- |
| External support | The client CMS (or its adapter) **must** support immediate session and/or token invalidation, or an equivalent enforceable control (e.g. server-side allow-list check on every request that ignores previously issued bearer tokens once the actor is revoked). |
| If unsupported | Do **not** enable that high-risk module via integration until the control exists (same withhold rule as C-B). |
| Platform duty | On revoke, gateway must invoke the invalidation API/hook as part of the revoke transaction (best effort + alert on failure; instance may be force-disconnected if invalidation fails for high-risk). |

---

## 10. Connection monitoring, errors, retries, and idempotency (C-C)

### 10.1 Health signals

| Signal | Source | Use |
| --- | --- | --- |
| `cms_connections.last_healthy_at` | Probe / successful call | Connection freshness |
| `cms_connections.last_error` | Last failure summary (no secrets, no sensitive content) | Support diagnosis |
| `cms_connections.status` | Derived/operational | Gateway gating |
| Optional `monitored_services` | Domain 12 | Deeper uptime/alerts when registered |

### 10.2 Probe policy (design defaults)

| Item | Default intent |
| --- | --- |
| Interval | Configurable; prefer gentle polling + on-demand before critical ops |
| Success | Auth handshake + minimal authorised ping (no bulk data pull) |
| Failure | Increment error state; alert authorised operators; **do not** retry with broader credentials |
| Backoff | Exponential backoff with cap; circuit-break prolonged failures |

### 10.3 Error classes

| Class | Platform behaviour |
| --- | --- |
| AuthZ denied (external) | Surface clear denial; audit with correlation id; no break-glass fallback |
| AuthN failure (bad/expired secret) | Mark unhealthy; alert Platform Admin; block mutating calls |
| Timeout / unknown outcome | **Do not** blind-retry mutations — see §10.4 |
| Contractual block | Hard deny; do not contact external module |
| Rate limit | Respect client limits; queue non-critical work |

### 10.4 Safe retries vs mutating operations (C-C)

Network failures can leave OkangGroup unsure whether the client CMS completed the work. Blind automatic retry may **duplicate** a publish, update, or other mutation.

| Operation class | Retry / recovery rule |
| --- | --- |
| **Safe read-only** | May retry with backoff (list/get/health) when side-effect free |
| **Mutating** (create/update/publish/delete/approve-proxy) | Must use an **idempotency key** (stable per logical operation) **or** an operation-status check / reconciliation before any re-send |
| After timeout | Query status by idempotency key / operation id; only re-send if external side reports not started / failed safely |
| Duplicate detection | External CMS (or adapter) should treat repeated idempotency keys as the same operation |
| Reconciliation | Platform stores operation intent + correlation id + last known outcome (`accepted` / `rejected` / `unknown` / `reconciled`) without storing sensitive content payloads |
| Forbidden | Automatic “retry publish until 200” without idempotency or status check |

Design default: every mutating outbound call carries `Idempotency-Key` (or protocol equivalent) equal to or derived from the correlation id + operation type.

---

## 11. Audit trails and end-to-end correlation (C-D)

### 11.1 Event families

| Event family | Must record |
| --- | --- |
| Registry changes | Create/update instance, modules, mode, contractual profile |
| Credential lifecycle | Create/rotate/revoke refs (never secret values) |
| Connection probes | Result, timestamp, error class |
| Outbound actions | Initiating `profile_id`, instance, module, operation, outcome, **correlation id** |
| Temporary access | Request, approve, deny, expire, revoke |
| Revocation / invalidation | Trigger, targets, external invalidation result, delay metrics where available |
| Mode changes | From/to `management_mode` |
| Capability withhold | Documented gaps (C-B) when features are disabled |

### 11.2 Correlation identifier (C-D)

| Rule | Detail |
| --- | --- |
| Uniqueness | Every integration operation receives a unique correlation identifier at initiation |
| Propagation | Identifier is sent to the client CMS (header/claim/body field as agreed per adapter) |
| Dual logging | Appears in OkangGroup `audit_events` (or integration audit store) **and** in the client CMS audit trail **where supported** |
| Outcome only | Record success/failure/denied/unknown and error **class** — not pastoral text, financial line content, or other sensitive module payloads |
| Unsupported client logs | If the client CMS cannot store the correlation id, record that limitation; still keep the id on the OkangGroup side; prefer adapters that add correlation support before enabling high-risk modules |

Client CMS access logs remain the client’s accountability surface; platform audit is not a substitute.

---

## 12. Credential protection (summary + C-B)

| Control | Requirement |
| --- | --- |
| No plaintext in DB | Only `credential_ref` |
| Vault ACLs | Restrict who can read refs; dual control for production rotates where policy requires |
| No master key | Service credential must not imply unrestricted CMS admin; see §6.3 |
| Egress | Proxies must not mirror large media through the platform by default (V2.1 Free-tier note) |
| Logging | Redact tokens, signatures, and sensitive content from `last_error` and app logs |
| Separation | Integration credentials ≠ user passwords ≠ Supabase `service_role` in browsers |
| Minting | Long-lived vault secrets mint short-lived, narrowly scoped call assertions only |

---

## 13. Company CMS vs client CMS

| Aspect | Company CMS (Pilot 1) | Client CMS (Pilot 2) |
| --- | --- | --- |
| Data plane | Platform Domain 7 tables | External (typical) |
| AuthZ | Platform RLS + workflows | Platform + **independent** external AuthZ |
| Modules | Company content modules | Per-client catalogue in pilot pack |
| Goal | Prove publish, revision, approval, monitoring, idempotent publish | Prove connection, module ACL, contractual deny, temp access, revoke delay, correlation |

Billing enforcement must not shut down public sites automatically.

---

## 14. Pilot programme (OD-13 R1 / UD-05)

### 14.1 Sequence

1. **Pilot 1 — OkangGroup company CMS**  
   - Internal publish pipeline, approvals, audit, monitoring hooks, idempotent publish.  
   - No external client AuthZ complexity.  

2. **Pilot 2 — One approved client CMS**  
   - Selected only after Pilot 1 acceptance criteria met **and** contractual permission confirmed.  
   - Full connection auth, module map, contractual profile, temp access drill, revoke drill (incl. §9.3–§9.4), correlation drill, capability withhold check.  

### 14.2 Pilot 2 pack (must exist before coding the pilot)

| Item | Content |
| --- | --- |
| Client identity | Legal name, `cms_instances` slug, domains — **Owner-selected; not assumed** |
| Contractual permission | Written permission to integrate |
| Module catalogue | Codes, sensitivity, hosted_in, deny list, permitted operations |
| Contractual access profile | Written exclusions |
| Auth method | Chosen `auth_method` + vault layout + token TTL / revoke SLA confirmation |
| Capability assessment | What the CMS can/cannot enforce (C-B / C-A high-risk) |
| Management mode | Initial mode; hybrid only if required |
| Gateway / adapter | Pattern chosen under C3-05 |
| Success tests | Connect; denied module; temp access grant/expiry; revoke within SLA; idempotent mutate; correlation on both sides; credential rotate; disconnect |
| Rollback | Disconnect + revoke without harming public site availability policy |

### 14.3 Open pilot decisions (Owner) — recommendations not recorded

| ID | Topic | Reviewer recommendation (not Owner-approved) |
| --- | --- | --- |
| C3-01 | Which single client is Pilot 2 | Select one client only after confirming contractual permission; **do not** auto-pick Treasure House or NiiNai |
| C3-02 | Exact `auth_method` for Pilot 2 | Prefer short-lived, narrowly scoped service authentication with independent client-side authorisation |
| C3-03 | Pilot 2 module catalogue and permitted operations | Document actual modules and permitted operations for the selected client |
| C3-04 | Hybrid mode in Pilot 2? | Defer hybrid unless the chosen client genuinely needs it |
| C3-05 | Gateway pattern | Prefer OkangGroup-side integration gateway with a client-specific adapter where necessary |

**Status:** all five remain **OPEN** for Owner decision.

---

## 15. Threats and explicit non-goals

### 15.1 Threats addressed (design)

| Threat | Mitigation |
| --- | --- |
| Cross-client credential reuse | Per-instance refs; isolation tests in pilot |
| Service credential as CMS master key | Four-part call identity + external enforcement + withhold (C-B) |
| Access after revoke via unexpired token | Short TTL + gateway re-check + max delay + high-risk invalidation (C-A) |
| Duplicate publish on retry | Idempotency keys + status reconciliation (C-C) |
| Audit without joinable trails | Correlation ids both sides where supported (C-D) |
| Sensitive content sucked into platform audit | Outcome-only audit payloads (C-D) |
| Owner override of contractual deny | Hard deny in gateway evaluation |
| Sensitive module bleed via migration | `cms_migrations` must skip excluded modules |

### 15.2 Non-goals of V2.3.1

- Implementing adapters or UI  
- Amending V2.1.8A / V2.2.2 in place  
- Recording C3-01–C3-05 as Owner decisions  
- Choosing production hosting beyond existing OD-14 A intent  
- Full multi-client roll-out catalogues  

---

## 16. Acceptance criteria for a future V2.3 freeze

1. Owner accepts or amends §6–§11 security contracts (including C-A–C-D).  
2. Pilot 1 ready; Pilot 2 pack approved (C3-01–C3-05 resolved or explicitly deferred).  
3. PA-03 (and PA-06 if inviting CMS staff) accepted into an authorised V2.1 revision **before** module-scoped external pilots.  
4. §18 proposed integration schema items accepted, deferred, or rejected explicitly.  
5. V2.1.8A and V2.2.2 remain baselines (or later Owner-frozen successors).  
6. No coding until explicit authorisation after relevant freezes.  

---

## 17. Unresolved decisions (summary)

| ID | Topic | Status |
| --- | --- | --- |
| C3-01 | Pilot 2 client selection | **Open** |
| C3-02 | Pilot 2 authentication method | **Open** |
| C3-03 | Pilot 2 module catalogue | **Open** |
| C3-04 | Hybrid in Pilot 2 | **Open** |
| C3-05 | Gateway / adapter pattern | **Open** |
| OD-04 | Retention | **Open** (V2.1) |
| UD-08 | Supabase MCP account/project | **Open** / blocked |
| C3-06 | Final token TTL and revocation SLA numbers for production (defaults in §9.3) | **Open** — confirm at freeze |

---

## 18. Proposed schema / data requirements (not applied to V2.1.8A)

Design needs discovered or strengthened in V2.3.1. **Do not treat as part of V2.1.8A** until an authorised V2.1 revision.

| ID | Need | Driven by | Classification hint |
| --- | --- | --- | --- |
| PA-I01 | Persist integration **correlation id** on outbound operation audit rows | C-D | Likely column/field on `audit_events` metadata or dedicated integration operation log |
| PA-I02 | Persist **idempotency key** + operation outcome state for mutating CMS calls | C-C | New small table or task/operation extension; not in V2.1.8A today |
| PA-I03 | Connection **capability assessment** record (what external AuthZ can enforce; withheld features) | C-B | Could be jsonb on `cms_connections` or child table |
| PA-I04 | Revocation / invalidation attempt log (gateway deny time, external invalidate result) | C-A | Audit metadata or security/ops log; may start as `audit_events` only |
| PA-03 | Module scope on grants (existing V2.2.2 requirement) | W-D / C-B | Still **required** before sensitive/hybrid pilots |
| PA-06 | Invitation exact grant payload (existing V2.2.2 requirement) | W-E | Still required before inviting CMS staff |

**V2.1.8A and V2.2.2 files remain unchanged.**

---

## 19. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 2.3.0 | 2026-10-11 | Initial Client CMS Integration Architecture; expands §6.5 |
| 2.3.1 | 2026-10-11 | C-A revocation/token TTL; C-B four-part identity / no master key; C-C idempotency; C-D correlation; §18 PA-I*; C3-01–C3-05 remain open |

**End of OkangGroup Client CMS Integration Architecture V2.3.1 — under review. Does not modify V2.1.8A or V2.2.2. Does not freeze V2.3. Does not authorise coding. CODING HOLD.**
