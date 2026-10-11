# OkangGroup Platform — Workflows and Permissions Design V2.2

| Field | Value |
| --- | --- |
| Status | **DESIGN ONLY — UNDER REVIEW — CODING HOLD** |
| Document version | **2.2.0** |
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
- Task assignment and workload delegation  
- Approval workflows  
- Client portal access  
- Management delegation without Owner bottleneck  

It does **not** change table schemas, freeze V2.1, or authorise implementation.

---

## 2. Governing principles

| Principle | Meaning |
| --- | --- |
| **P1 — Owner control** | The Owner retains final authority over platform configuration, commercial policy, sensitive grants, and break-glass access — always audited, and **never** overriding client contractual / legal restrictions (OD-08 A). |
| **P2 — Delegated management** | Authorised managers assign and supervise work within their department/team/client scopes without Owner approval for every routine action. |
| **P3 — Client isolation** | Staff see only clients, projects, CMS instances, and documents within their active `access_scopes`. Cross-tenant access is denied by design (V2.1.8A RLS + composite FKs). |

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

**Non-interference:** If V2.2 needs a schema change, it must be raised as an explicit V2.1 amendment request — not silently applied here. V2.2.0 assumes V2.1.8A is sufficient.

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

Effective access = active `role_grants` (+ unexpired `temporary_access`) whose `access_scopes` cover the resource **and** required permission codes.

| Scope type | Typical use |
| --- | --- |
| `platform` | Owner / Platform Admin operations |
| `department` / `team` | Manager assignment boundaries |
| `client` | Client Services, ops, CMS work for one client |
| `project` | Delivery team for one project |
| `cms_instance` | Editors for one CMS |

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
| `cms_editor` | Content edit/publish per CMS rules | `cms_instance` |
| `client_admin` | Own client portal administration | own `client` |
| `client_user` | Own client limited portal | own `client` |

### 6.2 Permission matrix (design defaults — Owner may tighten)

Legend: **F** = full within scope · **R** = read · **W** = write/create · **A** = approve · **X** = none · **\*** = only with OD-08 temporary/contractual path for sensitive CMS

| Capability (permission family) | Owner | Platform Admin | Ops Mgr | Dept/Team Mgr | Staff | Finance | Support | CMS Editor | Client Admin | Client User |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Platform settings / Configuration Studio | F | F† | X | X | X | X | X | X | X | X |
| Roles & grants (non-owner) | F | F† | X | X | X | X | X | X | X | X |
| Departments / teams | F | F | R | R (own) | R (own) | X | X | X | X | X |
| Staff directory | F | F | R | R (own dept/team) | R limited | X | X | X | X | X |
| Clients directory | F | F | F scoped | scoped | scoped | R scoped | R scoped | R scoped | own only | own only |
| Projects | F | F | F scoped | F scoped | RW assigned | R finance-linked | R linked tickets | R linked CMS | R allow-list (OD-18) | R allow-list |
| Tasks assign / reassign | F | F | F scoped | F scoped | own only | X | own tickets | own CMS tasks | request only | request only |
| Approvals (routine) | F | A† | A scoped | A scoped | request | A finance‡ | A support‡ | A publish‡ | A client-side‡ | X |
| Company CMS | F | F | R | R | RW if granted | X | X | F if granted | X | X |
| Client CMS registry | F | F | F scoped | scoped | scoped | X | R status | F instance | R own status | R own status |
| Client CMS content (external) | \* | \* | \* scoped | \* scoped | \* scoped | X | X | \* instance | per mode | per mode |
| Finance (invoices/payments) | F | R | X | X | X | F | X | X | R own invoices | R own if allowed |
| Credit/refund approve | A‡ | A‡ | X | X | X | request / A‡ | X | X | X | X |
| Support tickets | F | F | F scoped | scoped | assigned | X | F scoped | X | RW own | RW own limited |
| Monitoring | F | F | R scoped | X | X | X | R | X | R own if granted | X |
| Audit logs | F | R | X | X | X | X | X | X | X | X |
| Legal holds / retention purge | F | X§ | X | X | X | X | X | X | X | X |

† Within Owner policy; cannot disable audit or widen RLS via config (V2.1).  
‡ OD-07: requester ≠ approver for credits/refunds; thresholds configurable.  
§ Draft retention policy only; purge execution after OD-04 approval.  
\* Sensitive modules: temporary_access + contractual profile; Owner grant cannot override client denial (OD-08 A).

### 6.3 MFA (OD-11 A)

MFA mandatory for: `owner`, `platform_admin`, `finance_user`, and any principal holding `is_sensitive` permissions. Fail closed for privileged sessions.

---

## 7. Delegation model

### 7.1 What managers may do without Owner

| Action | Minimum role | Required scope | Owner needed? |
| --- | --- | --- | --- |
| Create/assign routine task | Team/Dept/Ops Manager | team/department/client covering the resource | No |
| Reassign within same scope | same | same | No |
| Escalate to another authorised manager | Manager | own scope → target must have scope | No |
| Approve routine CMS publish (non-sensitive) | Team Manager / designated approver | `cms_instance` | No |
| Approve project stage advance (non-commercial) | Ops / Dept Manager | `project` / `client` | No |
| Invite staff | Platform Admin / Owner | platform | Owner for `owner`/`platform_admin` roles |
| Grant client scope to staff | Ops Mgr or Platform Admin per policy | that `client` | Owner for finance+sensitive bundles |
| Issue invoice | Finance | finance permission | No (policy) |
| Approve credit/refund over threshold | Distinct approver (OD-07) | finance | Owner/platform_admin if above top threshold |
| Temporary sensitive CMS access | Owner or Platform Admin per policy | cms + contract check | Owner for break-glass |
| Change commercial policy / service plans | Owner (or Platform Admin if delegated) | platform | Owner for material policy |

### 7.2 Work allocation workflow (example)

**Client request → Operations Manager → CMS Team Manager → Assigned Editor → Review → Approval → Publish**

| Step | Actor | System action |
| --- | --- | --- |
| 1 | Client Admin / Support | Ticket or task created, `client_id` set |
| 2 | Operations Manager | Assigns to team or Team Manager (`task_assignments`) |
| 3 | Team Manager | Assigns Editor; sets priority/due |
| 4 | CMS Editor | Performs work in authorised CMS scope |
| 5 | Reviewer | Approval record `pending` → `approved` / `rejected` |
| 6 | Publisher | Publish transition per `workflow_definitions` |
| 7 | Audit | All assignment/approval changes logged |

Owner is **not** on the critical path for ordinary publishes.

### 7.3 Assignment rules (maps to V2.1 operations domain)

1. Manual assignment to a profile  
2. Team assignment (queue)  
3. Reassignment (audited)  
4. Priority levels (lookup)  
5. Deadlines  
6. Approval flags  
7. Dependencies (`task_dependencies`)  
8. Escalation (type + reason)  
9. Workload visibility (open task counts)  
10. Completion verification (`verification_status`)  

Managers may only assign to assignees who already hold (or will be granted in the same controlled step) scope covering the task’s client/project/cms.

---

## 8. Approval workflows

Stored in `workflow_definitions` / `approvals` (V2.1). Defaults below are seeds.

### 8.1 Common approval types

| Entity | Typical approvers | Owner required? |
| --- | --- | --- |
| Task completion (routine) | Team Manager | No |
| Company CMS publish | Designated publisher / Team Manager | No (Owner for legal homepage exceptions if configured) |
| Client CMS publish (non-sensitive) | Team Manager or Client Admin (per `management_mode`) | No |
| Client CMS sensitive module | Explicit temporary grant path | Usually Owner/Platform Admin + contract |
| Project stage skip/return | Ops Manager | No |
| Change request | Ops Manager + Client Admin if client-impacting | Commercial impact → Finance/Owner |
| Quotation send | Finance or Ops per policy | Above amount → Owner |
| Invoice issue | Finance | No |
| Credit/refund | Distinct approver (OD-07) | Above threshold → Owner/platform_admin |
| Access grant (sensitive) | Platform Admin / Owner | Yes for Owner-level roles |
| Deletion / purge | DPO path + dual control | Yes until OD-04 defines automation |

### 8.2 Approval state machine

`pending` → `approved` | `rejected` | `cancelled`  
Optional: `escalated`.

Rules:

- Requester ≠ approver for finance credits/refunds and for deletion approvals  
- Rejection requires `decision_note`  
- All transitions audited  

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

### 9.3 Support

`new` → `assigned` → `in_progress` → `awaiting_client` → `resolved` → `closed`.

Client sees only `client_visible` messages.

### 9.4 Subscriptions (commercial ops)

`trial` → `active` ↔ `past_due` → `paused` / `cancelled` / `expired`.

Dunning per OD-10 R1: notify / mark past_due; **no** automatic public site/CMS runtime shutdown. Management-service suspension only after authorised decision.

### 9.5 Company CMS publish

`draft` → `in_review` → `scheduled` → `published` → `archived`.

---

## 10. Client portal access

### 10.1 What clients see (OD-18 R1)

Explicit allow-lists. Defaults:

| Visible | Hidden |
| --- | --- |
| Own organisation profile (non-internal notes) | Other clients |
| Own projects (status, milestones, client_visible docs) | Internal estimates, margins, staff HR |
| Own CMS instances (status; content per management mode) | Platform settings, audit, staff directory |
| Own tickets (client_visible thread) | Internal ticket notes |
| Own contracts / invoices / subscription status | OkangGroup expenses, other clients’ finance |
| Notifications for own events | Security admin alerts |

### 10.2 Management modes (client CMS)

| Mode | Client Admin | OkangGroup CMS Editor |
| --- | --- | --- |
| OkangGroup Managed | Request / approve as configured | Primary editors |
| Client Managed | Primary editors | Support only if granted |
| Hybrid | Per-module ACL | Per-module ACL |

External CMS still enforces its own AuthZ (V2.1 §6.5 → V2.3 detail).

---

## 11. Owner authority and limits

### 11.1 Owner may

- Define/alter roles and non-forbidden permission mappings (OD-05 A)  
- Create departments/teams; invite Platform Admins  
- Register clients; allocate CMS instances  
- Set commercial policies and service plans  
- Approve top-tier finance exceptions  
- Place legal holds; approve retention policy versions **after OD-04**  
- Issue temporary sensitive access (still contractual)  

### 11.2 Owner may not (system must enforce)

- Bypass client contractual access denials via role alone (OD-08 A)  
- Disable audit logging through Configuration Studio  
- Silently rewrite historical invoices/tax snapshots  
- Auto-kill client public websites for billing (business rule A)  
- Access external sensitive CMS modules without explicit grant + contract path  

All Owner actions are audited like any privileged actor.

---

## 12. Invitation and onboarding workflows

### 12.1 Staff (OD-12 A, OD-15 R1)

1. Platform Admin/Owner creates `invitations` (staff) with initial role ids  
2. Email via verified `@okanggroup.com` when configured  
3. Accept → set password → MFA enrolment if `mfa_required`  
4. `role_grants` + `staff_memberships` activated  
5. Audit + `account_status_events`  

### 12.2 Client users

1. Client Admin or OkangGroup staff with `clients.invite` creates invitation with `client_id`  
2. Accept → membership + scoped grants  
3. Client Admin cannot invite staff or grant other clients  

---

## 13. Escalation and exceptions

| Situation | Path |
| --- | --- |
| Blocked task past SLA | Team Manager → Ops Manager |
| Client dispute on scope | Ops Manager → Owner (commercial) |
| Suspected security incident | Any staff → Platform Admin/Owner; `security_incidents` |
| Need sensitive CMS access | Temporary access request → approver → time-boxed grant |
| Billing past_due | Finance notifies; ops may propose management suspension — **Owner/authorised approver** before acting; site stays up |

---

## 14. Navigation visibility (by actor)

Logical menus (routes later; OD-14 A hosting). Show only if permission exists.

| Menu | Owner / Platform Admin | Ops / Managers | Specialist staff | Client |
| --- | --- | --- | --- | --- |
| Dashboard | Yes | Yes (scoped) | Yes (personal) | Yes (client) |
| OkangGroup CMS | Yes | If granted | If granted | No |
| Clients | Yes | Scoped | Scoped | Own only |
| Projects | Yes | Scoped | Assigned | Allow-list |
| Client CMS | Yes | Scoped | Instance | Own |
| Operations (tasks) | Yes | Yes | Assigned | Requests |
| People | Yes | Limited | Limited | No |
| Finance | Yes / Finance | No | No | Own invoices |
| Support | Yes | Scoped | If agent | Own tickets |
| Monitoring | Yes | Limited | No | Own if granted |
| Security / Audit | Yes | No | No | No |
| Settings / Config Studio | Yes | No | No | No |

---

## 15. Open items for V2.2 (do not invent)

| ID | Topic | Notes |
| --- | --- | --- |
| W2-01 | Exact permission code catalogue seed list | Freeze with Owner before coding |
| W2-02 | Default department seed set | Data only; names configurable |
| W2-03 | SLA numeric targets for support/tasks | Business choice |
| W2-04 | Which company CMS pages need Owner publish | Optional tightening |
| W2-05 | Client Admin invite quota / verification | Abuse control |
| W2-06 | Mapping of Hybrid CMS modules per pilot client | V2.3 + OD-13 |

---

## 16. Acceptance criteria for a future V2.2 freeze

1. Owner reviews and accepts or amends matrices in §6–§8.  
2. W2-01 permission catalogue agreed.  
3. V2.1.8A remains baseline (or a later Owner-frozen V2.1).  
4. No coding until explicit authorisation after relevant freezes.  

---

## 17. Explicit non-goals of V2.2.0

- Modifying V2.1.8A schema text  
- Freezing V2.1 or V2.2  
- SQL migrations, RLS SQL, application UI  
- CMS wire protocols (V2.3)  
- Closing OD-04  
- Supabase project changes  

---

## 18. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 2.2.0 | 2026-10-11 | Initial Workflows and Permissions design; separate from V2.1.8A |

**End of OkangGroup Workflows and Permissions Design V2.2.0 — under review. Does not modify V2.1.8A. Does not authorise coding. CODING HOLD.**
