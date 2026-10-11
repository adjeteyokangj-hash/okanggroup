# OkangGroup Platform — Workflows and Permissions Design V2.2

| Field | Value |
| --- | --- |
| Status | **DESIGN ONLY — UNDER REVIEW — CODING HOLD — NOT FROZEN** |
| Document version | **2.2.2** |
| Depends on | Database Architecture **V2.1.8A** (accepted technical baseline — **not modified by this document**) |
| Supabase target | `okanggroup-platform` / `prbgsnxpwyepdggdysnt` (implementation later; not altered here) |
| V2.1 freeze | **Not authorised** by this document |
| OD-04 | Remains **OPEN** (handled separately; not redefined here) |
| Coding / migrations / deploy | **HOLD** |

---

## 1. Purpose

V2.2 defines how OkangGroup operates day to day on top of the V2.1.8A data model:

- Staff responsibilities and organisational placement  
- Role and permission matrices (RBAC + scope)  
- Task assignment with availability and workload eligibility  
- Strict permission delegation (no self-escalation)  
- Approval workflows with identity-based separation of duties  
- Module-specific client CMS access intent (external enforcement in V2.3)  
- Secure invitation / onboarding and privileged MFA  
- Scope-filtered management dashboards  
- Client portal access  
- Management delegation without Owner bottleneck  

It does **not** change V2.1.8A schema text, freeze V2.1 or V2.2, or authorise implementation. Database implications are classified in §19 (required schema amendments vs existing-schema capabilities vs implementation details).

---

## 2. Governing principles

| Principle | Meaning |
| --- | --- |
| **P1 — Owner control** | The Owner retains final authority over platform configuration, commercial policy, sensitive grants, and break-glass access — always audited, and **never** overriding client contractual / legal restrictions (OD-08 A). |
| **P2 — Delegated management** | Authorised managers assign and supervise work within their department/team/client scopes without Owner approval for every routine action. |
| **P3 — Client isolation** | Staff see only clients, projects, CMS instances, modules, and documents within their active scopes. Cross-tenant access is denied by design (V2.1.8A RLS + composite FKs). |
| **P4 — No privilege escalation via delegation** | Delegation requires **both** explicit authority to delegate the permission family **and** effective coverage of the permission, resource scope, and CMS module being granted. A `*.delegate` right never independently authorises broader access (W-B / V2.2.2). |
| **P5 — Identity-based duty separation** | Finance and other critical approvals evaluate the **acting user identity**, not merely whether any of their roles could approve (W-C). |
| **P6 — Availability ≠ authorisation** | Staff availability and workload inform assignment; they never replace permission or scope checks (W-A). |

Supporting rules already recorded in V2.1:

- Org reporting lines ≠ automatic privileges  
- Departments/teams are data, not hard-coded  
- Sensitive CMS modules require explicit time-limited grants + contractual clearance  
- Billing automation must not take public websites offline (business rule A)  

---

## 3. Relationship to V2.1.8A

| V2.1.8A artefact | V2.2 use |
| --- | --- |
| `roles`, `permissions`, `role_grants`, `access_scopes`, `temporary_access` | Permission matrix and grant workflows |
| `departments`, `teams`, `staff_memberships` | Org placement and manager scope |
| `tasks`, `task_assignments`, `approvals`, `task_dependencies` | Work allocation state machines |
| `clients`, `client_memberships`, `cms_instances` | Client portal and CMS access |
| `workflow_definitions` | Configurable stage machines |
| §5 RLS helpers | Runtime enforcement intent (implementation later) |

**Non-interference:** If V2.2 needs a schema change, it is classified in §19 and only applied in a future authorised V2.1 revision — not silently to V2.1.8A. V2.2.2 runs conceptually on V2.1.8A plus §19.1 required amendments when those are accepted.

---

## 4. Actor types

| Actor | `account_kind` | Typical use |
| --- | --- | --- |
| Owner | `staff` + system role `owner` | Ultimate platform authority |
| Platform Admin | `staff` + `platform_admin` | Day-to-day platform config within Owner policy |
| Operations Manager | `staff` + `operations_manager` | Cross-team work distribution within authorised clients |
| Department / Team Manager | `staff` + manager roles | Assign work inside department/team scope |
| Staff (specialist) | `staff` + functional roles (`cms_editor`, `finance_user`, `support_agent`, …) | Execute assigned work |
| Client Admin | `client_user` + `client_admin` membership | Manage own organisation’s portal users and authorised CMS actions |
| Client User | `client_user` + `client_user` membership | Limited portal and CMS actions per grant |

---

## 5. Organisational placement vs system permissions

### 5.1 Placement (who reports where)

`staff_memberships` records department, team, job title, and `reports_to_profile_id`.

| Rule | Detail |
| --- | --- |
| Multiple memberships | Allowed when authorised |
| Hierarchy | Owner → Platform Admin → Operations Manager → Department Manager → Team Manager → Staff is an **org chart**, not an automatic privilege ladder |
| Manager of people | Does not imply finance, security, or all-client access |

### 5.2 Permissions (what they may do)

Effective access = active `role_grants` (+ unexpired `temporary_access`) whose `access_scopes` cover the resource **and** required permission codes **and**, for CMS, any required **module** scope (W-D).

| Scope type | Typical use |
| --- | --- |
| `platform` | Owner / Platform Admin operations |
| `department` / `team` | Manager assignment boundaries |
| `client` | Client Services, ops, CMS work for one client |
| `project` | Delivery team for one project |
| `cms_instance` | Editors for one CMS (instance-level; not all modules) |
| `cms_module` *(proposed)* | Module-specific CMS capability within an instance (W-D / §19) |

---

## 6. System roles and default permission bundles

Permission codes follow V2.1 catalogue style (`domain.action`). System role **codes** are stable; display names are configurable. OD-05 A: system permission codes immutable except via change control.

### 6.1 Role summary

| Role code | Intent | Default scope habit |
| --- | --- | --- |
| `owner` | Full platform administration within legal/contractual limits | `platform` |
| `platform_admin` | Operate Configuration Studio, users, non-sensitive settings | `platform` |
| `operations_manager` | Coordinate delivery across authorised clients/teams | `client` / multi-client grants |
| `department_manager` | Manage staff and work in a department | `department` |
| `team_manager` | Assign tasks within a team | `team` |
| `staff` | Baseline staff access (profile, assigned tasks) | assigned resources |
| `finance_user` | Quotes, invoices, payments (manual), reports | `platform` or named clients |
| `support_agent` | Tickets and client-visible replies | scoped `client` |
| `cms_editor` | Content edit/publish per **module** rules | `cms_instance` + `cms_module` |
| `client_admin` | Own client portal administration | own `client` |
| `client_user` | Own client limited portal | own `client` |

### 6.2 Permission matrix (design defaults — Owner may tighten)

Legend: **F** = full within scope · **R** = read · **W** = write/create · **A** = approve · **X** = none · **\*** = only with OD-08 temporary/contractual path for sensitive CMS

| Capability (permission family) | Owner | Platform Admin | Ops Mgr | Dept/Team Mgr | Staff | Finance | Support | CMS Editor | Client Admin | Client User |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Platform settings / Configuration Studio | F | F† | X | X | X | X | X | X | X | X |
| Roles & grants (non-owner) | F | F† | X‡‡ | X‡‡ | X | X | X | X | X | X |
| Departments / teams | F | F | R | R (own) | R (own) | X | X | X | X | X |
| Staff directory | F | F | R | R (own dept/team) | R limited | X | X | X | X | X |
| Staff availability / workload (W-A) | F | F | R scoped | R scoped | R own | X | X | X | X | X |
| Clients directory | F | F | F scoped | scoped | scoped | R scoped | R scoped | R scoped | own only | own only |
| Projects | F | F | F scoped | F scoped | RW assigned | R finance-linked | R linked tickets | R linked CMS | R allow-list (OD-18) | R allow-list |
| Tasks assign / reassign | F | F | F scoped | F scoped | own only | X | own tickets | own CMS tasks | request only | request only |
| Approvals (routine) | F | A† | A scoped | A scoped | request | A finance‡ | A support‡ | A publish‡ | A client-side‡ | X |
| Company CMS | F | F | R | R | RW if granted | X | X | F if granted | X | X |
| Client CMS registry | F | F | F scoped | scoped | scoped | X | R status | F instance | R own status | R own status |
| Client CMS modules (W-D) | \* | \* | \* module | \* module | \* module | X | X | \* module | per mode/module | per mode/module |
| Finance (invoices/payments) | F | R | X | X | X | F | X | X | R own invoices | R own if allowed |
| Credit/refund approve | A‡ | A‡ | X | X | X | request / A‡ | X | X | X | X |
| Support tickets | F | F | F scoped | scoped | assigned | X | F scoped | X | RW own | RW own limited |
| Monitoring | F | F | R scoped | X | X | X | R | X | R own if granted | X |
| Management dashboard (W-F) | F | F | F scoped | F scoped | personal | finance widgets‡ | agent widgets | CMS widgets | client widgets | limited |
| Audit logs | F | R | X | X | X | X | X | X | X | X |
| Legal holds / retention purge | F | X§ | X | X | X | X | X | X | X | X |

† Within Owner policy; cannot disable audit or widen RLS via config (V2.1).  
‡ OD-07 + W-C: requester ≠ approver by **user identity** for credits/refunds and financial exceptions; thresholds configurable.  
§ Draft retention policy only; purge execution after OD-04 approval.  
\* Sensitive modules: temporary_access + contractual profile; Owner grant cannot override client denial (OD-08 A).  
‡‡ Managers may propose or grant **only** within §7.4 dual-requirement rules and UD-03 exclusions; they cannot open Platform Admin grant UI for arbitrary roles. Managers request staff invitations only (UD-02).

### 6.3 MFA (OD-11 A + W-E)

MFA mandatory for: `owner`, `platform_admin`, `finance_user`, and any principal holding `is_sensitive` permissions or privileged temporary grants. Privileged accounts must complete MFA **before** accessing protected functions. Fail closed for privileged sessions. Invitation acceptance alone never skips MFA when the approved grant set requires it.

---

## 7. Delegation model

### 7.1 What managers may do without Owner

| Action | Minimum role | Required scope | Owner needed? |
| --- | --- | --- | --- |
| Create/assign routine task | Team/Dept/Ops Manager | team/department/client covering the resource | No |
| Reassign within same scope | same | same + assignee eligibility (§7.3) | No |
| Escalate to another authorised manager | Manager | own scope → target must have scope | No |
| Approve routine CMS publish (non-sensitive module) | Team Manager / designated approver | `cms_instance` + module | No |
| Approve project stage advance (non-commercial) | Ops / Dept Manager | `project` / `client` | No |
| Invite staff | Platform Admin / Owner only (UD-02) | platform; invitation carries **exact** approved grant set (W-E) | Owner for `owner`/`platform_admin` roles; managers may **request** invitations only |
| Grant routine task/project access | Ops Mgr within §7.4 + UD-03 | permission + scope the granter effectively holds and may delegate | Finance, security, privileged roles, sensitive CMS excluded |
| Grant client / module scope (non-routine) | Platform Admin / Owner per policy **and** §7.4 | only scopes the granter holds and may delegate | Owner for finance + sensitive bundles |
| Issue invoice | Finance | finance permission | No (policy) |
| Approve credit/refund over threshold | Distinct **user** (W-C / OD-07) | finance | Owner/platform_admin if above top threshold |
| Temporary sensitive CMS access | Owner or Platform Admin per policy | cms module + contract check | Owner for break-glass |
| Change commercial policy / service plans | Owner (or Platform Admin if delegated) | platform | Owner for material policy |

### 7.2 Work allocation workflow (example)

**Client request → Operations Manager → CMS Team Manager → Assigned Editor → Review → Approval → Publish**

| Step | Actor | System action |
| --- | --- | --- |
| 1 | Client Admin / Support | Ticket or task created, `client_id` set |
| 2 | Operations Manager | Assigns to team or Team Manager after eligibility check (§7.3) |
| 3 | Team Manager | Assigns Editor; sets priority/due; sees availability/workload |
| 4 | CMS Editor | Performs work only in authorised **modules** |
| 5 | Reviewer | Approval record `pending` → `approved` / `rejected` |
| 6 | Publisher | Publish transition per `workflow_definitions` for that module |
| 7 | Audit | All assignment/approval/grant changes logged |

Owner is **not** on the critical path for ordinary publishes.

### 7.3 Assignment eligibility (W-A)

Managers must not assign solely because a person has the right permissions. Assignment requires **all** of:

| Check | Rule |
| --- | --- |
| Authorisation | Assignee holds (or receives in the same controlled step) permission + scope covering the task’s client/project/cms **module** |
| Availability | Assignee’s current operational status allows new work (see statuses below) |
| Workload | Manager can see open assignments, priorities, and deadlines before confirming |
| Scope of manager | Assigner may only assign within their own authorised scopes |

**Availability statuses** are **configurable lookup data** (UD-01), not hard-coded per department. Seed examples (Owner/Platform Admin may rename/extend):

| Status code (example) | Meaning for new assignments (UD-01) |
| --- | --- |
| `available` | Eligible for ordinary new assignments |
| `busy` | Ordinary assignment blocked unless a **recorded manager override** is supplied |
| `on_leave` | Blocks ordinary assignments |
| `absent` | Blocks ordinary assignments |
| `unavailable` | Blocks ordinary assignments |

Operational consideration only: availability **never** grants access the employee lacks, and never bypasses client isolation or contractual denials. Overrides are audited and do not weaken permission checks.

Managers should see, within their authorised scope:

- Current availability status  
- Count and list of open/overdue tasks  
- Upcoming deadlines for those tasks  
- Team workload distribution (for Ops / Dept / Team Managers)  

Database classification: §19 PA-01 (schema), PA-02 (existing-schema capability).

### 7.4 Strict permission delegation (W-B) — V2.2.2

**Final rule:** A manager must never grant permissions, roles, scopes, or module accesses unless **both** of the following are true:

1. **Delegation authority** — The manager has explicit authority to delegate that permission family (e.g. a dedicated `*.delegate` right under Owner policy / UD-03).  
2. **Effective coverage** — The manager’s own effective authority covers the **permission**, **resource scope**, and **CMS module** being granted.

A delegation permission must **never** independently authorise broader access. Holding `tasks.assign.delegate` without also holding effective `tasks.assign` (and the target scope/module) is insufficient. Conversely, holding a permission without delegation authority does not allow granting it to others.

| Check | Detail |
| --- | --- |
| Both conditions | Fail closed if either (1) or (2) is missing |
| Granter scope / module | Granter’s active scopes must cover every target scope (client, project, cms_instance) **and** module where applicable |
| Recipient eligibility | Recipient account kind, employment/membership status, and contractual clearance must allow the grant |
| Ops Manager limit (UD-03) | May delegate **routine task and project access** within existing authority only |
| Exclusions (UD-03) | Finance, security, privileged roles (`owner`, `platform_admin`, …), and sensitive CMS access **remain excluded** from Ops Manager delegation |
| No self-escalation | A principal cannot approve their own grant request or widen their own privileges through a second role they hold |
| Audit | Every grant, deny, and revoke is audited with granter, recipient, and delta |

**Example (illustrative boundaries only):** A manager authorised for Treasure House **website maintenance** modules must not grant access to Treasure House **pastoral records**. Holding `cms_instance` for Treasure House is insufficient without the specific module grant and contractual clearance.

V2.2.0/2.2.1 wording that allowed effective permission **or** `*.delegate` alone is **superseded** by this dual-requirement rule.

---

## 8. Approval workflows

Stored in `workflow_definitions` / `approvals` (V2.1). Defaults below are seeds.

### 8.1 Common approval types

| Entity | Typical approvers | Owner required? |
| --- | --- | --- |
| Task completion (routine) | Team Manager | No |
| Company CMS publish | Designated publisher / Team Manager | No (Owner for legal homepage exceptions if configured) |
| Client CMS publish (non-sensitive module) | Team Manager or Client Admin (per `management_mode`) | No |
| Client CMS sensitive module | Explicit temporary grant path | Usually Owner/Platform Admin + contract |
| Project stage skip/return | Ops Manager | No |
| Change request | Ops Manager + Client Admin if client-impacting | Commercial impact → Finance/Owner |
| Quotation send | Finance or Ops per policy | Above amount → Owner |
| Invoice issue | Finance | No |
| Credit/refund / financial exception | Distinct **user identity** (W-C) | Above threshold → Owner/platform_admin |
| Access grant (sensitive) | Platform Admin / Owner | Yes for Owner-level roles |
| Deletion / purge | DPO path + dual control | Yes until OD-04 defines automation |

### 8.2 Approval state machine

`pending` → `approved` | `rejected` | `cancelled`  
Optional: `escalated`.

Rules:

- For finance credits/refunds, financial exceptions, and deletion approvals: **acting user id of approver ≠ acting user id of requester/creator** (W-C), even if both hold approval-capable roles  
- Holding multiple roles does not allow a single user to create and approve the same financial artefact  
- Rejection requires `decision_note`  
- All transitions audited  

### 8.3 Identity-based separation of financial duties (W-C / UD-04)

| Rule | Detail |
| --- | --- |
| Subject (UD-04) | Refunds; credit notes; write-offs; payment corrections; financial exceptions; approval of sensitive financial access |
| Evaluation key | `profiles.id` (authenticated user), not role membership alone |
| Forbidden | Same user creates/requests and later approves the same artefact via a second role |
| Allowed | Distinct user with approval permission and scope; thresholds may still escalate to Owner |
| Extension | Same identity rule applies to grant of finance approval rights to oneself |

---

## 9. Domain workflow machines (operational view)

### 9.1 Projects

Stages (configurable):  
`enquiry` → `proposal` → `approved` → `planning` → `development` → `testing` → `client_review` → `delivered` → `maintenance` (+ `cancelled`).

| Transition | Who |
| --- | --- |
| Forward one stage | Ops / Project lead with `projects.stage.advance` |
| Skip stage | Ops Manager + reason |
| Return for correction | Ops / Client Admin (client_review) |
| Cancel | Ops Manager or Owner |

### 9.2 Tasks

`backlog` → `assigned` → `in_progress` → `blocked` → `in_review` → `done` / `cancelled`.

Assignment into `assigned` / `in_progress` must pass §7.3 eligibility.

### 9.3 Support

`new` → `assigned` → `in_progress` → `awaiting_client` → `resolved` → `closed`.

Client sees only `client_visible` messages.

### 9.4 Subscriptions (commercial ops)

`trial` → `active` ↔ `past_due` → `paused` / `cancelled` / `expired`.

Dunning per OD-10 R1: notify / mark past_due; **no** automatic public site/CMS runtime shutdown. Management-service suspension only after authorised decision.

### 9.5 Company CMS publish

`draft` → `in_review` → `scheduled` → `published` → `archived`.

---

## 10. Client portal access and CMS modules

### 10.1 What clients see (OD-18 R1)

Explicit allow-lists. Defaults:

| Visible | Hidden |
| --- | --- |
| Own organisation profile (non-internal notes) | Other clients |
| Own projects (status, milestones, client_visible docs) | Internal estimates, margins, staff HR |
| Own CMS instances (status; content per management mode **and module**) | Platform settings, audit, staff directory |
| Own tickets (client_visible thread) | Internal ticket notes |
| Own contracts / invoices / subscription status | OkangGroup expenses, other clients’ finance |
| Notifications for own events | Security admin alerts |

### 10.2 Management modes (client CMS)

| Mode | Client Admin | OkangGroup CMS Editor |
| --- | --- | --- |
| OkangGroup Managed | Request / approve as configured | Primary editors (module-scoped) |
| Client Managed | Primary editors (module-scoped) | Support only if granted |
| Hybrid | Per-module ACL | Per-module ACL |

### 10.3 Module-specific CMS permissions (W-D)

Granting access to a client CMS **instance** must **not** automatically grant every module inside it. Each module has its own view/edit/publish/no-access posture.

Illustrative boundaries (**not** grants to named staff; **not** the definitive catalogue):

| Client CMS | Module | Possible access |
| --- | --- | --- |
| Treasure House | Website content | Edit / Publish |
| Treasure House | Events | View / Edit |
| Treasure House | Finance | No access |
| Treasure House | Pastoral records | No access |
| NiiNai | Public website | Edit |
| NiiNai | Guest bookings | No access |
| NiiNai | Financial transactions | No access |

**UD-05:** The definitive client CMS module catalogue is **deferred to V2.3**. Implementation sequencing: company CMS first, then **one** selected client pilot.

| Layer | Responsibility |
| --- | --- |
| OkangGroup platform (V2.2) | Records intended module grants, scopes, and contractual flags; blocks unauthorised grant attempts (W-B) |
| External CMS (V2.3) | Enforces module AuthZ at runtime; definitive per-client module catalogues |

Sensitive modules continue to require temporary_access + contractual clearance (OD-08 A). Owner cannot override a client contractual denial.

---

## 11. Owner authority and limits

### 11.1 Owner may

- Define/alter roles and non-forbidden permission mappings (OD-05 A)  
- Create departments/teams; invite Platform Admins  
- Register clients; allocate CMS instances and module catalogues  
- Configure availability status lookups and assignment policies  
- Set commercial policies and service plans  
- Approve top-tier finance exceptions (as a distinct user from the requester)  
- Place legal holds; approve retention policy versions **after OD-04**  
- Issue temporary sensitive access (still contractual)  

### 11.2 Owner may not (system must enforce)

- Bypass client contractual access denials via role alone (OD-08 A)  
- Disable audit logging through Configuration Studio  
- Silently rewrite historical invoices/tax snapshots  
- Auto-kill client public websites for billing (business rule A)  
- Access external sensitive CMS modules without explicit grant + contract path  
- Approve their own financial exception request when they were the creator/requester (W-C; use a distinct authorised approver or documented break-glass with dual control if ever required by policy)

All Owner actions are audited like any privileged actor.

---

## 12. Invitation and onboarding workflows (W-E)

### 12.1 Staff (OD-12 A, OD-15 R1, UD-02)

1. **Only** Owner or Platform Admin issues staff `invitations` (UD-02)  
2. Managers may **request** a staff invitation (workflow/approval) but cannot create or send invitations directly  
3. Invitation carries the **exact** approved role ids, scopes, and module grants — no implicit platform-wide privileges  
4. Email via verified `@okanggroup.com` when configured  
5. Accept → set password → **MFA enrolment/completion required before privileged functions** if any approved grant is privileged or `mfa_required`  
6. On activation, system materialises **only** the invitation’s approved grant set — acceptance must not widen privileges  
7. Audit + `account_status_events`  

| Guard | Detail |
| --- | --- |
| Issuer | Owner / Platform Admin only for staff invites (UD-02) |
| Manager path | Request → authorised issuer; §7.4 still caps grant content |
| No excess on accept | Invitation payload is the sole source of day-0 privileges |
| Stale invitation | Expired or revoked invitations cannot activate |
| Privileged MFA | Owner, Platform Admin, Finance, sensitive holders: MFA before protected UI/API |

### 12.2 Client users

1. Client Admin or OkangGroup staff with `clients.invite` creates invitation with `client_id` and explicit membership/role/module set  
2. Accept → membership + scoped grants **exactly as approved**  
3. Client Admin cannot invite staff, grant other clients, or escalate modules beyond their own authority  

---

## 13. Escalation and exceptions

| Situation | Path |
| --- | --- |
| Blocked task past SLA | Team Manager → Ops Manager |
| Assignee unavailable / on leave | Reassign within scope using §7.3; escalate if no eligible staff |
| Client dispute on scope | Ops Manager → Owner (commercial) |
| Suspected security incident | Any staff → Platform Admin/Owner; `security_incidents` |
| Need sensitive CMS module access | Temporary access request → approver → time-boxed **module** grant |
| Billing past_due | Finance notifies; ops may propose management suspension — **Owner/authorised approver** before acting; site stays up |
| Attempted privilege escalation | Deny + audit; Platform Admin/Owner review |

---

## 14. Navigation visibility (by actor)

Logical menus (routes later; OD-14 A hosting). Show only if permission exists.

| Menu | Owner / Platform Admin | Ops / Managers | Specialist staff | Client |
| --- | --- | --- | --- | --- |
| Dashboard (W-F) | Yes | Yes (scoped) | Yes (personal) | Yes (client) |
| OkangGroup CMS | Yes | If granted | If granted | No |
| Clients | Yes | Scoped | Scoped | Own only |
| Projects | Yes | Scoped | Assigned | Allow-list |
| Client CMS | Yes | Scoped modules | Granted modules | Own modules |
| Operations (tasks) | Yes | Yes | Assigned | Requests |
| People / availability | Yes | Limited scoped | Own status | No |
| Finance | Yes / Finance | No | No | Own invoices |
| Support | Yes | Scoped | If agent | Own tickets |
| Monitoring | Yes | Limited | No | Own if granted |
| Security / Audit | Yes | No | No | No |
| Settings / Config Studio | Yes | No | No | No |

---

## 15. Management dashboard requirements (W-F)

Managers need a single operational view so delegation is usable day to day. **Every widget is filtered by the viewer’s authorised scopes** (client / department / team / project / cms module). Cross-tenant leakage is forbidden.

### 15.1 Widget phases (UD-06)

**MVP (first coded release):**

| Widget | Purpose |
| --- | --- |
| Assigned tasks | Open work for the manager’s teams/clients |
| Outstanding approvals | Items waiting on the manager or their delegates |
| Overdue work | Past-due tasks and stalled approvals |
| Workload distribution | Open task counts / deadlines by assignee |

**Subsequent (after MVP):**

| Widget | Purpose |
| --- | --- |
| Availability board | Configurable statuses for staff in scope (W-A / UD-01) |
| Escalations | Escalated items and SLA breaches |

### 15.2 Dashboard rules

| Rule | Detail |
| --- | --- |
| Scope filter | Default and hard filter = viewer’s effective scopes |
| No privilege boost | Dashboard links must not open resources the viewer cannot access |
| Personal vs manager | Specialists see personal queue; managers see supervised scope |
| Client dashboards | Client Admin/User see only own-organisation widgets (OD-18) |
| Audit | Sensitive drill-downs (e.g. finance exceptions) remain permission-gated |

UI implementation is out of scope until coding is authorised; this section is the design contract.

---

## 16. Open items for V2.2 (do not invent)

| ID | Topic | Notes |
| --- | --- | --- |
| W2-01 | Exact permission code catalogue seed list | Freeze with Owner before coding |
| W2-02 | Default department seed set | Data only; names configurable |
| W2-03 | SLA numeric targets for support/tasks | Business choice |
| W2-04 | Which company CMS pages need Owner publish | Optional tightening |
| W2-05 | Client Admin invite quota / verification | Abuse control |
| W2-06 | Mapping of Hybrid CMS modules per pilot client | V2.3 + OD-13 |
| W2-07 | Exact availability status seed labels | UD-01 policy recorded; display names configurable |
| W2-08 | Exact `*.delegate` permission codes for routine task/project families | UD-03 bounds Ops Manager; code list still needed (W2-01) |
| W2-10 | MFA grace / recovery for privileged invites | Security policy |

---

## 17. Acceptance criteria for a future V2.2 freeze

1. Owner reviews and accepts or amends matrices in §6–§8 and §10.3 / §15.  
2. W2-01 permission catalogue agreed.  
3. Required schema amendments in §19.1 accepted into a future V2.1 revision (or explicitly deferred).  
4. V2.1.8A remains baseline (or a later Owner-frozen V2.1).  
5. UD-07 / OD-04 and UD-08 resolved or explicitly waived for freeze.  
6. No coding until explicit authorisation after relevant freezes.  

---

## 18. Explicit non-goals of V2.2.2

- Modifying V2.1.8A schema text in place  
- Freezing V2.1 or V2.2  
- SQL migrations, RLS SQL, application UI  
- CMS wire protocols and external AuthZ enforcement (V2.3)  
- Closing OD-04 (UD-07)  
- Supabase project / MCP account changes (UD-08)  
- Merges to `main` or deployments  

---

## 19. PA classification against V2.1.8A (not applied to baseline)

Assessed against Database Architecture **V2.1.8A** only. Nothing below changes that file until a separate, authorised V2.1 amendment cycle.

### 19.1 Required schema amendments

| ID | Need | V2.1.8A gap | Proposed direction (design only) |
| --- | --- | --- | --- |
| PA-01 | Staff operational availability | `staff_memberships.status` is employment lifecycle, not available/busy/leave; no availability field on `profiles` | Add configurable availability via `lookup_values` (or equivalent) **plus** a current status on profile or membership; support audited busy-override reason on assignment |
| PA-03 | Module-scoped grants | `cms_modules` registry exists, but `access_scopes.scope_type` is only `platform` / `department` / `team` / `client` / `project` / `cms_instance` — **no module scope** | Extend scopes or add module-linked grant artefact so instance access ≠ all modules |
| PA-06 | Exact invitation grant set | `invitations.role_ids` exists; **no** stored scopes/modules payload | Persist approved roles **and** scopes/modules (e.g. structured grant payload or child rows); activation applies only that set |

### 19.2 Existing-schema capabilities

| ID | Need | V2.1.8A support | Notes |
| --- | --- | --- | --- |
| PA-02 | Workload distribution | `tasks`, `task_assignments`, due dates; V2.1 already describes workload as application query / optional materialised view later | **No new table required** for MVP; scoped queries suffice |
| PA-05 | Identity-based finance SoD | `approvals.requested_by` / `approver_profile_id`; OD-07 forbids same-profile self-approval; finance entities carry actor columns | Enforce UD-04 subject list in workflow rules; expand `entity_type` values via config as needed — not a new SoD table |
| PA-07 | Privileged MFA gate | `profiles.mfa_required`, `mfa_enforced_at`; OD-11 A fail-closed privileged sessions | Auth + application session checks; **no new MFA table** required for the gate itself |

### 19.3 Implementation details (policy / seeds / app logic)

| ID | Need | Classification | Notes |
| --- | --- | --- | --- |
| PA-04 | Dual delegation rule + Ops limits | Primarily **implementation / permission seeds** | Dual check (delegate authority **and** effective coverage) is enforced in grant services using existing `permissions` / `role_grants` / `access_scopes`. Seed `*.delegate` codes for routine task/project families only (UD-03). Optional per-grant `may_redelegate` flag is **not** required for V2.2.2; raise as a future schema item only if Owner wants grant-level redelegation control |

**V2.1.8A file remains unchanged.**

---

## 20. Decisions

### 20.1 Recorded in V2.2.2 (UD-01–UD-06)

| ID | Decision | Status |
| --- | --- | --- |
| UD-01 | Availability statuses are configurable. `busy` may receive additional work only with a **recorded manager override**. `on_leave` and `absent` block ordinary assignments. | **Recorded** |
| UD-02 | Owner and Platform Admin invite staff. Managers may **request** invitations but cannot issue them directly. | **Recorded** |
| UD-03 | Operations Managers may delegate **routine task and project access** within existing authority, subject to §7.4 dual rule. Finance, security, privileged roles, and sensitive CMS access remain excluded. | **Recorded** |
| UD-04 | Identity SoD covers refunds, credit notes, write-offs, payment corrections, financial exceptions, and approval of sensitive financial access. | **Recorded** |
| UD-05 | Definitive client CMS module catalogue deferred to **V2.3**. Sequence: company CMS first, then one client pilot. | **Recorded** |
| UD-06 | Dashboard MVP: assigned tasks, outstanding approvals, overdue work, workload distribution. Availability and escalation widgets follow later. | **Recorded** |

### 20.2 Still unresolved

| ID | Topic | Status |
| --- | --- | --- |
| UD-07 | Data retention / OD-04 | **Open** — remains under V2.1 OD-04 |
| UD-08 | Supabase MCP authentication to `okanggroup@gmail.com` / `prbgsnxpwyepdggdysnt` | **Open** — blocked until correct account and project are accessible |

---

## 21. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 2.2.0 | 2026-10-11 | Initial Workflows and Permissions design; separate from V2.1.8A |
| 2.2.1 | 2026-10-11 | W-A–W-F; §19 proposed V2.1 amendments; UD-01–UD-08 open |
| 2.2.2 | 2026-10-11 | Dual-requirement delegation (§7.4); record UD-01–UD-06; UD-07/08 remain open; classify PA-01–PA-07 against V2.1.8A |

**End of OkangGroup Workflows and Permissions Design V2.2.2 — under review. Does not modify V2.1.8A. Does not freeze V2.2. Does not authorise coding. CODING HOLD.**
