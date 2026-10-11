# OkangGroup Platform — Client CMS Integration Architecture V2.3

| Field | Value |
| --- | --- |
| Status | **DESIGN ONLY — UNDER REVIEW — CODING HOLD — NOT FROZEN** |
| Document version | **2.3.0** |
| Depends on | Database **V2.1.8A** (accepted technical baseline); Workflows **V2.2.2** (accepted working baseline) |
| Does not modify | **V2.1.8A** · **V2.2.2** (changes that require schema must be raised as authorised V2.1 revisions) |
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
- Connection monitoring and error handling  
- Client-managed, OkangGroup-managed, and hybrid administration  
- Secure temporary access and revocation  
- Audit trails and integration credential protection  
- Pilot sequence: **company CMS first**, then **one approved client pilot** (OD-13 R1 / UD-05)  

### 1.2 Out of scope

- Modifying V2.1.8A or V2.2.2 text  
- SQL migrations, RLS implementation, UI coding  
- Closing OD-04 or unblocking Supabase MCP  
- Definitive per-client module catalogues for every client (only company CMS + one pilot are sequenced)  
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
| `audit_events` | Who initiated which external action |
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
| PA-01 | Configurable staff availability | V2.2.2 §19.1 | Needed for ops assignment UX around CMS tasks; not a CMS protocol blocker |
| PA-03 | Module-specific CMS permission scopes | V2.2.2 §19.1 | **Blocking** for module-scoped platform grants before hybrid/client pilots |
| PA-06 | Exact approved permissions/scopes in invitations | V2.2.2 §19.1 | Needed so CMS editors are not over-privileged at invite accept |
| OD-04 | Retention durations | V2.1 | Open; affects offboarding deletion of integration artefacts |
| UD-08 | Supabase MCP to `prbgsnxpwyepdggdysnt` | V2.2.2 | Blocked; no remote verification/migrations |

V2.3 may describe how PA-03 is **used** at the integration boundary; it does **not** amend V2.1.8A to add `cms_module` scope types.

---

## 4. Logical architecture

```text
┌─────────────────────────────────────────────────────────────┐
│ OkangGroup Platform (Auth, RLS, tasks, registry, audit)     │
│  /cms/{slug} management UI  →  Integration Gateway (design) │
└────────────────────────────┬────────────────────────────────┘
                             │ auth_method + per-instance credential_ref
                             │ module allow-list + contractual checks
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Client CMS / Company CMS API or dedicated gateway           │
│  Independent AuthZ · own data store · own access logs       │
└─────────────────────────────────────────────────────────────┘
```

| Plane | Stores | Must not store |
| --- | --- | --- |
| Platform | Instance metadata, module map, connection health, task links, audit of initiations, credential **references** | Raw client CMS secrets; excluded sensitive module content by default |
| Client / company CMS | Content, media, domain business data | OkangGroup platform-wide secrets |

Management UI under okanggroup.com is **not** a substitute for external AuthZ (V2.1 §6.1).

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
5. Run connectivity probe → record `last_healthy_at` / `last_error`.  
6. Transition to `connected` only when probe succeeds **and** contractual module map is confirmed.  
7. Audit every step.

### 5.3 Connection management actions

| Action | Who (minimum) | Notes |
| --- | --- | --- |
| Register instance | Platform Admin / Owner | Client isolation from creation |
| Rotate credentials | Platform Admin / Owner | Update vault secret; bump `credential_rotated_at`; short overlap window optional |
| Disconnect | Platform Admin / Owner | Blocks proxy; does not auto-kill public site (business rule A) |
| Retire | Owner / authorised offboarding | OD-09; revoke refs |
| Reconnect | Platform Admin / Owner | Re-probe + audit |

Managers do **not** hold integration credential administration under V2.2.2 UD-03 exclusions.

---

## 6. Secure authentication between OkangGroup and client systems

### 6.1 Supported `auth_method` values (V2.1)

| Method | Intent | Design constraints |
| --- | --- | --- |
| `service_jwt` | Platform presents short-lived JWT signed for that instance | Audience/issuer bound to `cms_instance_id`; minimal scopes = authorised modules |
| `m2m_oauth` | Client-credentials (or similar) against client token endpoint | Tokens cached only in secure runtime memory/vault side-car; never in DB rows |
| `signed_webhook` | Platform → client signed callbacks / client → platform events | Replay protection (timestamp + nonce); per-instance signing keys |
| `manual` | Human-operated or break-glass tooling | No standing high privilege; operations still audited; prefer upgrade to automated method |

### 6.2 Token and secret rules

| Rule | Detail |
| --- | --- |
| Isolation | One credential identity per `cms_instance` (or narrower module gateway). **Never** reuse across clients. |
| Storage | Vault/secret store only; Postgres holds `credential_ref` |
| Rotation | Scheduled + on staff/client offboarding + on suspected compromise |
| Scope binding | Token claims / OAuth scopes must not include modules that are contractually denied or unmarked in the allow-list |
| Actor attribution | Where the external CMS supports it, forward an opaque actor correlation id so both sides can audit the initiating profile without leaking unnecessary PII |
| Clock skew | Document max skew for JWT/webhook validation |

### 6.3 Call path (authorisation order)

Every outbound integration call must pass **in order**:

1. Authenticated OkangGroup session with MFA if privileged (V2.2.2 / OD-11).  
2. Platform permission + scope (+ **module** scope once PA-03 is in an authorised V2.1 revision).  
3. `cms_instances.status = connected` (or explicit migrating path).  
4. `management_mode` allows this actor class for this action.  
5. Module not contractually denied; sensitive modules require unexpired `temporary_access` when applicable.  
6. External CMS / gateway AuthZ accepts the call.  
7. Audit platform initiation; prefer external log retention where available.

Failure at any step **stops** the call. No silent credential escalation (C5).

---

## 7. Module-level permissions and contractual restrictions

### 7.1 Module model

`cms_modules` is the feature map (not content). Platform grants for CMS work must be interpretable at **module** granularity (V2.2.2 W-D). Until PA-03 is authorised in V2.1, design assumes instance-level grants are **insufficient** for hybrid/sensitive pilots.

| Attribute | Use |
| --- | --- |
| `module_code` | Stable key shared in allow-lists and tokens |
| `is_sensitive` | Requires temporary/explicit path + contractual clearance |
| `hosted_in` | `platform_registry_only` / `external_cms` / `company_cms` |
| Contractual profile | Instance-level profile may deny modules regardless of internal role |

### 7.2 Illustrative boundaries (not staff grants; not full catalogue)

| System | Module | Typical posture |
| --- | --- | --- |
| Company CMS | Pages / navigation / SEO | Edit/publish per company CMS workflows |
| Treasure House (example) | Website content | Edit/publish if granted |
| Treasure House (example) | Pastoral records | No access by default; sensitive |
| NiiNai (example) | Public website | Edit if granted |
| NiiNai (example) | Financial transactions | No access by default |

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

---

## 9. Temporary access and revocation

### 9.1 Temporary access (sensitive / break-glass)

| Rule | Detail |
| --- | --- |
| Instrument | `temporary_access` (+ module identification once PA-03 exists) |
| Approver | Owner or Platform Admin per policy; never Ops Manager for sensitive CMS (UD-03) |
| Duration | Hard `ends_at`; default short; renewal is a new audited grant |
| Contract | Still subject to contractual denial |
| Runtime | Integration gateway refuses sensitive module calls without unexpired grant |
| End | Auto-deny after expiry; sessions that relied on the grant must re-authorise |

### 9.2 Revocation triggers

| Trigger | Actions |
| --- | --- |
| Grant expiry / manual revoke | Immediate deny on next call; audit |
| Staff offboarding | Revoke role_grants, temporary_access; invalidate sessions; rotate instance credentials if the staff member had vault access |
| Client offboarding (OD-09) | Export entitled data → revoke portal + `credential_ref` → disconnect/retire instance |
| Suspected compromise | Disconnect instance; rotate secrets; security_incident record |
| Contractual change denying a module | Update profile/modules; active tokens must be rotated or narrowed |

Public websites are **not** automatically taken offline for billing (business rule A / OD-10 R1).

---

## 10. Connection monitoring and error handling

### 10.1 Health signals

| Signal | Source | Use |
| --- | --- | --- |
| `cms_connections.last_healthy_at` | Probe / successful call | Connection freshness |
| `cms_connections.last_error` | Last failure summary (no secrets) | Support diagnosis |
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
| AuthZ denied (external) | Surface clear denial; audit; no break-glass fallback |
| AuthN failure (bad/expired secret) | Mark unhealthy; alert Platform Admin; block mutating calls |
| Timeout / 5xx | Retry per policy; degrade UI; keep last known health |
| Contractual block | Hard deny; do not contact external module |
| Rate limit | Respect client limits; queue non-critical work |

---

## 11. Audit trails

| Event family | Must record |
| --- | --- |
| Registry changes | Create/update instance, modules, mode, contractual profile |
| Credential lifecycle | Create/rotate/revoke refs (never secret values) |
| Connection probes | Result, timestamp, error class |
| Outbound actions | Initiating `profile_id`, instance, module, operation, outcome |
| Temporary access | Request, approve, deny, expire, revoke |
| Mode changes | From/to `management_mode` |

Client CMS should retain its own access logs where available; platform audit is not a substitute for client-side accountability.

---

## 12. Credential protection (summary)

| Control | Requirement |
| --- | --- |
| No plaintext in DB | Only `credential_ref` |
| Vault ACLs | Restrict who can read refs; dual control for production rotates where policy requires |
| Egress | Proxies must not mirror large media through the platform by default (V2.1 Free-tier note) |
| Logging | Redact tokens, signatures, and PII from `last_error` and app logs |
| Separation | Integration credentials ≠ user passwords ≠ Supabase service_role in browsers |

---

## 13. Company CMS vs client CMS

| Aspect | Company CMS (Pilot 1) | Client CMS (Pilot 2) |
| --- | --- | --- |
| Data plane | Platform Domain 7 tables | External (typical) |
| AuthZ | Platform RLS + workflows | Platform + **independent** external AuthZ |
| Modules | Company content modules | Per-client catalogue in pilot pack |
| Goal | Prove publish, revision, approval, monitoring | Prove connection, module ACL, contractual deny, temp access |

Billing enforcement must not shut down public sites automatically.

---

## 14. Pilot programme (OD-13 R1 / UD-05)

### 14.1 Sequence

1. **Pilot 1 — OkangGroup company CMS**  
   - Internal publish pipeline, approvals, audit, monitoring hooks.  
   - No external client AuthZ complexity.  

2. **Pilot 2 — One approved client CMS**  
   - Selected only after Pilot 1 acceptance criteria met.  
   - Full connection auth, module map, contractual profile, temp access drill, revoke drill.  

### 14.2 Pilot 2 pack (must exist before coding the pilot)

| Item | Content |
| --- | --- |
| Client identity | Legal name, `cms_instances` slug, domains |
| Module catalogue | Codes, sensitivity, hosted_in, deny list |
| Contractual access profile | Written exclusions and allowed operations |
| Auth method | Chosen `auth_method` + vault layout |
| Management mode | Initial mode + hybrid module matrix if hybrid |
| Success tests | Connect, denied-module attempt, temp access grant/expiry, credential rotate, disconnect |
| Rollback | Disconnect + revoke without harming public site availability policy |

Pilot client name is an **Owner selection**, not assumed by this document.

### 14.3 Open pilot decisions

| ID | Topic |
| --- | --- |
| C3-01 | Which single client is Pilot 2 |
| C3-02 | Exact `auth_method` for Pilot 2 |
| C3-03 | Pilot 2 module catalogue and contractual profile text |
| C3-04 | Whether hybrid mode is in Pilot 2 or deferred |
| C3-05 | Gateway pattern: direct-to-CMS API vs OkangGroup-side adapter per client |

---

## 15. Threats and explicit non-goals

### 15.1 Threats addressed (design)

| Threat | Mitigation |
| --- | --- |
| Cross-client credential reuse | Per-instance refs; isolation tests in pilot |
| Platform role used as external master key | Independent AuthZ + call-order checks |
| Owner override of contractual deny | Hard deny in gateway evaluation |
| Sensitive module bleed via migration | `cms_migrations` must skip excluded modules |
| Secret leakage via errors/logs | Redaction rules |
| Stale temp access | Hard expiry + revoke path |

### 15.2 Non-goals of V2.3.0

- Implementing adapters or UI  
- Amending V2.1.8A / V2.2.2 in place  
- Choosing production hosting beyond existing OD-14 A intent  
- Full multi-client roll-out catalogues  

---

## 16. Acceptance criteria for a future V2.3 freeze

1. Owner accepts or amends §6–§11 security contracts.  
2. Pilot 1 and Pilot 2 packs approved (C3-01–C3-05 resolved or explicitly deferred).  
3. PA-03 (and PA-06 if inviting CMS staff) accepted into an authorised V2.1 revision **before** implementation of module-scoped external pilots.  
4. V2.1.8A and V2.2.2 remain baselines (or later Owner-frozen successors).  
5. No coding until explicit authorisation after relevant freezes.  

---

## 17. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 2.3.0 | 2026-10-11 | Initial Client CMS Integration Architecture; separate from V2.1.8A and V2.2.2; expands §6.5 |

**End of OkangGroup Client CMS Integration Architecture V2.3.0 — under review. Does not modify V2.1.8A or V2.2.2. Does not freeze architecture. Does not authorise coding. CODING HOLD.**
