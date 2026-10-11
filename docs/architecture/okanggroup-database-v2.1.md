# OkangGroup Database Architecture V2.1

| Field | Value |
| --- | --- |
| Status | **DESIGN ONLY — UNDER REVIEW (NOT FROZEN) — CODING HOLD** |
| Document version | **2.1.5** |
| Parent | Platform Architecture V2.0 — Proposed Structure |
| Working baseline | V2.1.3–V2.1.4 technical amendments retained; V2.1.5 records business decisions (§14.5) |
| Supabase project | `okanggroup-platform` |
| Project ID | `prbgsnxpwyepdggdysnt` |
| Region | London (`eu-west-2`) |
| Plan | Free |
| Owner account | `okanggroup@gmail.com` |
| Forbidden project | `vzgfvzzbgrlxvixejmdt` (not the platform database) |
| Deliverable type | PostgreSQL design contract (not applied SQL) |
| Public website | Existing Vite site preserved; no framework rewrite required by this contract |
| Phase-1 architecture decisions | `OD-02 A, OD-05 A, OD-08 A, OD-11 A, OD-12 A, OD-14 A` (**preserved**) |
| Business decisions recorded | `OD-01 R1, OD-03 R1-amended, OD-04 R1-pending-durations, OD-06 R1, OD-07 R1-amended, OD-09 R1, OD-10 R1, OD-13 R1, OD-15 R1, OD-16 R1, OD-17 R1-amended, OD-18 R1` |
| Still open | **OD-04** durations/legal review; freeze not authorised |
| Architecture frozen | **No** |

---

## 0. Verification log (read-only)

| Check | Result |
| --- | --- |
| Target project ID | `prbgsnxpwyepdggdysnt` |
| MCP re-auth attempted | Yes (repeated; latest 2026-10-11) |
| Projects visible to current MCP session | Only `vzgfvzzbgrlxvixejmdt` (“adjeteyokangj-hash's Project”, `eu-west-1`) |
| `get_project(prbgsnxpwyepdggdysnt)` | Permission denied |
| `list_tables` / `list_migrations` on target | Not available (permission denied) |
| Mutations performed | **None** |
| New projects created | **None** |
| Switched to old database | **No** — target remains `prbgsnxpwyepdggdysnt` only |

**Owner action required:** In the Supabase MCP OAuth browser window, sign out of any personal Supabase/Google session first, then sign in as `okanggroup@gmail.com` and approve Cursor. Re-run read-only verification afterward. Do not create another project. Do not use `vzgfvzzbgrlxvixejmdt`.

---

## 1. Preamble and principles

### 1.1 Purpose

This document is the PostgreSQL implementation contract for OkangGroup’s central business operations platform. It defines tables, relationships, constraints, indexes, tenant isolation, RLS permission intent, CMS integration boundaries, workflow state machines, Free-tier considerations, and a dependency-ordered migration plan.

Cursor must not invent missing business or security rules. Items that require Owner decision appear in [§14 Open Decisions](#14-open-decisions).

### 1.2 Three principles (from V2.0)

1. OkangGroup operates from one central platform database.
2. Client CMS systems remain individually customised and isolated; the platform holds a registry and connection contracts, not a single generic CMS schema forced on every client.
3. Cursor implements only approved specifications. No migrations, application code, or production deployment until Owner authorises a later phase.

### 1.3 Vite coexistence

The existing public site (`index.html`, `css/styles.css`, `js/main.js`, Vite build → Vercel) remains the marketing surface. This schema supports:

- Company CMS content that can eventually drive public pages without replacing the current design system.
- Secure platform routes (`/login`, `/dashboard`, `/admin/*`, `/cms/*`) introduced later as an adjacent application surface on the same domain.

This contract does **not** require migrating the public site to React/Next.js. Per **OD-14 A**, the secure administration application is introduced separately via same-domain routing, and the public site must remain available even if that administration application is unavailable.

### 1.4 What must not enter the core platform database by default

- Client pastoral / membership pastoral records (e.g. Treasure House sensitive modules).
- Client operational finance ledgers belonging to the client’s own systems (e.g. NiiNai internal transactions).
- Arbitrary PII scraped from client apps without a contractual processing basis.

Those remain in the client CMS / application backends. Platform tables may store only authorised operational metadata (connection health, assigned staff, support tickets linked by ID).

### 1.5 Live payments

No payment-provider integration tables beyond placeholder provider references until [OD-01](#14-open-decisions). Commercial modules record quotations, contracts, invoices, subscriptions, and manually recorded payments only.

---

## 2. Domain map

### 2.1 Logical domains (15)

| # | Domain | Core tables |
| --- | --- | --- |
| 1 | Identity | `profiles`, `invitations`, `account_status_events` |
| 2 | Organisation | `departments`, `teams`, `staff_memberships`, `job_titles` |
| 3 | Permissions | `roles`, `permissions`, `role_permissions`, `role_grants`, `access_scopes`, `temporary_access` |
| 4 | Clients | `clients`, `client_contacts`, `client_memberships`, `client_services` |
| 5 | Projects | `projects`, `project_deliverables`, `milestones`, `change_requests`, `project_documents` |
| 6 | CMS Registry | `cms_instances`, `cms_modules`, `cms_connections`, `cms_migrations` |
| 7 | Company CMS | `cms_pages`, `cms_sections`, `cms_media_assets`, `cms_revisions`, `cms_navigation`, `cms_seo`, `contact_enquiries` |
| 8 | Operations | `tasks`, `task_assignments`, `approvals`, `task_dependencies` |
| 9 | Commercial | `service_plans`, `quotations`, `contracts`, `subscriptions`, `invoices`, `invoice_lines` |
| 10 | Payments | `payment_records`, `credit_notes`, `refunds`, `expenses`, `fx_rates` |
| 11 | Support | `tickets`, `ticket_messages`, `incidents` |
| 12 | Monitoring | `monitored_services`, `health_checks`, `alerts` |
| 13 | Notifications | `notifications`, `notification_preferences`, `delivery_attempts` |
| 14 | Security | `audit_events`, `access_reviews`, `security_incidents` |
| 15 | Configuration | `settings`, `feature_flags`, `workflow_definitions`, `lookup_values` |

### 2.2 Cross-domain relationship overview

```text
auth.users 1—1 profiles
profiles —< role_grants >— roles —< role_permissions >— permissions
profiles —< staff_memberships >— departments / teams
profiles —< client_memberships >— clients
clients —< projects —< deliverables / milestones / change_requests
clients —< cms_instances —< cms_modules / cms_connections
clients —< contracts / subscriptions / invoices
clients —< tickets / monitored_services
tasks / approvals link profiles, clients, projects, cms_instances
audit_events append-only, references actor profile + resource
workflow_definitions configure project / task / ticket / publish / subscription machines
company CMS tables are OkangGroup-tenant (client_id NULL, owner_org flag)
```

### 2.3 Schema placement

| Schema | Use |
| --- | --- |
| `public` | Application tables listed below (RLS enabled and forced on every table in the same migration that creates them) |
| `auth` | Supabase-managed users/sessions (do not redefine) |
| `storage` | Supabase Storage; buckets referenced by path conventions |
| `private` | `SECURITY DEFINER` RLS helper functions only — not exposed via Data API (OD-02 A). Privilege contract in [§5.1](#51-helper-predicates-and-privilege-contract) |

Per recorded decision **OD-02 A**, helper SQL resides in schema `private`. See [§14.3](#143-recorded-architecture-decisions-direction-accepted-schema-not-frozen).

---

## 3. Shared conventions

### 3.1 Identifiers and timestamps

| Convention | Rule |
| --- | --- |
| Primary keys | `uuid` DEFAULT `gen_random_uuid()` |
| Foreign keys | Explicit `ON DELETE` policy per relationship (see domain sections) |
| Created | `created_at timestamptz NOT NULL DEFAULT now()` |
| Updated | `updated_at timestamptz NOT NULL DEFAULT now()` maintained by trigger |
| Soft lifecycle | Prefer `status` / `archived_at` over hard delete for business entities |
| Hard delete | Allowed for draft/ephemeral rows only (e.g. unused invitation before accept) |

### 3.2 Actor columns and account lifecycle

Where a human action is recorded on mutable business rows:

- `created_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
- `updated_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`

System jobs set these NULL and set `source = 'system'` where applicable.

**Account removal policy (Issue 3):**

1. Prefer **deactivation / offboarding** (`profiles.account_status = offboarded`) over deleting `auth.users` / `profiles`.
2. Hard deletion of an auth user is an exceptional break-glass operation, not a normal HR workflow.
3. Accountability tables must not use `ON DELETE CASCADE` from `profiles` in a way that destroys history. See [§3.9](#39-audit-and-historical-record-survival).
4. When a profile row is removed in an exceptional case, actor FKs use `ON DELETE SET NULL` and denormalised actor snapshots remain.

### 3.3 Tenant boundary

| Record class | Tenant key |
| --- | --- |
| Client-owned / client-scoped | `client_id uuid NOT NULL REFERENCES clients(id)` |
| OkangGroup company CMS / internal-only | `client_id` NULL + `is_internal boolean NOT NULL DEFAULT false` (internal = true) |
| Platform-wide configuration | No `client_id`; protected by platform admin permissions |

Every client-scoped table must include `client_id` (denormalised where needed for RLS performance) even if also linked via `project_id` / `cms_instance_id`.

#### 3.3.1 Cross-client referential integrity (mandatory)

`client_id` alone is not sufficient. The database must prevent a row owned by Client A from referencing a project, CMS instance, contract, ticket, or other tenant resource owned by Client B.

**Composite foreign-key pattern (required for client-scoped children):**

1. Parent tables expose a uniqueness suitable for composite references, typically `UNIQUE (id)` plus the natural rule that `id` already implies one `client_id`, and children store both `client_id` and the parent id.
2. Where a child references a parent that also has `client_id`, define a composite FK such as:

   - `FOREIGN KEY (client_id, project_id) REFERENCES projects (client_id, id)`
   - `FOREIGN KEY (client_id, cms_instance_id) REFERENCES cms_instances (client_id, id)`
   - `FOREIGN KEY (client_id, contract_id) REFERENCES contracts (client_id, id)`
   - `FOREIGN KEY (client_id, invoice_id) REFERENCES invoices (client_id, id)`
   - `FOREIGN KEY (client_id, ticket_id) REFERENCES tickets (client_id, id)`
   - `FOREIGN KEY (client_id, monitored_service_id) REFERENCES monitored_services (client_id, id)` (when `client_id` is NOT NULL)

3. Parent tables that are client-scoped must therefore declare `UNIQUE (client_id, id)` (in addition to PK on `id`) so composite FKs are enforceable.
4. Optional nullable links follow [§3.3.2](#332-nullable-parent-references-internal-records-and-tenant-immutability).
5. Application code must not be the sole enforcement of tenant matching. RLS remains required, but **database constraints are mandatory** for cross-client integrity.

Tables requiring composite uniqueness / FKs include (non-exhaustive): `projects` and all project children; `cms_instances` and registry children; commercial documents; `subscriptions`; support tickets/messages; client-scoped monitoring; client-scoped tasks/approvals when linked to client resources.

#### 3.3.2 Nullable parent references, internal records, and tenant immutability

**Nullable parent references**

| Case | Rule |
| --- | --- |
| Optional FK NULL | When `project_id` / `cms_instance_id` / similar is NULL, no composite FK row is required for that parent. |
| Optional FK present | When the optional parent id is NOT NULL, the composite FK `(client_id, parent_id)` **must** hold. Implement as a composite FK (Postgres allows NULL in FK columns; a non-null parent id must match a parent of the same `client_id`). |
| Mixed nullability | A task may have `client_id` set and `project_id` NULL, or both set consistently. It must not have `project_id` pointing at another client’s project. |
| CHECK consistency | For client-scoped rows: `CHECK (project_id IS NULL OR client_id IS NOT NULL)` (and equivalents) so a parent link never exists without a tenant key. |

**Internal-only records (no client tenant)**

| Case | Rule |
| --- | --- |
| Classification | `is_internal = true` AND `client_id IS NULL`. |
| Forbidden mix | `CHECK (NOT (is_internal AND client_id IS NOT NULL))` and `CHECK (is_internal OR client_id IS NOT NULL)` on tables that support both modes (e.g. `tasks`, `monitored_services`, `approvals` where applicable). |
| Parent links | Internal rows must not reference client-owned parents (`project_id`, `cms_instance_id`, client `contract_id`, etc. must be NULL). |
| Company CMS | OkangGroup website CMS tables are internal by definition (no `client_id`); they never participate in client composite FKs. |

**Tenant ownership immutability**

| Rule | Requirement |
| --- | --- |
| Stable `client_id` | Once a client-scoped row is inserted, `client_id` is **immutable**. Updates that change `client_id` are rejected (trigger or generated-column/protection pattern). |
| No silent re-tenanting | Moving work between clients requires creating a new row (or an explicit, audited reassignment procedure that inserts a successor and archives the old row)—never an in-place `client_id` rewrite that would orphan or rewire history. |
| Parent id changes | Changing `project_id` / `cms_instance_id` on an existing row is allowed only when the new parent shares the same immutable `client_id` (enforced by composite FK). |
| Archive vs transfer | Client archive does not reassign child rows to another client. Offboarding/export follows **OD-09 R1** (§7.3, §14.5). |

### 3.4 Money, tax, and currency (OD-03 R1-amended; finance business rules)

| Rule | Detail |
| --- | --- |
| Amount storage | `numeric(18,2)` for major-unit money fields |
| Currency | ISO 4217 `char(3)` — initial support `GBP`, `GHS` |
| Historical integrity | Invoice/payment rows store `currency_code` and amounts as issued; price-list changes must not rewrite historical rows |
| FX | Optional `fx_rate numeric(18,8)` + `fx_rate_as_of date` + `fx_base_currency` when converting for reporting; exchange-rate adjustments recorded explicitly, never silent rewrite of issued totals |
| Rounding | Half-up to `numeric(18,2)` unless a tax profile overrides (OD-03) |
| Tax profiles | Configurable by **jurisdiction**, with **effective dates**, **exemptions**, and rates; never hard-coded only to one country |
| Invoice tax snapshots | Each invoice stores the tax composition applied at issue time (jurisdiction, rate refs, taxable base, tax amount, exemptions applied)—later tax-profile edits must not mutate issued invoices |
| Accounting distinctions | System must separately track: amount invoiced, tax charged, amount paid, outstanding balance, credit notes, refunds, currency, and FX adjustments |
| Funds ownership | Distinguish **OkangGroup income** (fees OkangGroup earns) from **client-held / client-belonging funds** (money that is not OkangGroup revenue). Schema and reports must not conflate the two |

### 3.4.1 Billing enforcement vs public availability (business rule A — OD-10 R1)

Billing/subscription enforcement is **separate** from public website availability.

| Allowed after authorised decision | Forbidden as automatic behaviour |
| --- | --- |
| Mark subscription `past_due` / notify / pause OkangGroup **management** services (portal CMS editing, managed content ops) when explicitly authorised | Automatically take a client’s **public website** offline because a CMS subscription payment was missed |
| Manual ops decision to restrict management access after review | Automatic CMS/website hard shutdown driven solely by dunning timers |

Public client sites must not go dark as a side effect of billing automation.

### 3.5 Enumerations

Prefer `lookup_values` / `workflow_definitions` for Owner-configurable statuses (departments are never hard-coded). Use PostgreSQL `text` + `CHECK` only for closed technical enums that must not be casually renamed (e.g. `audit_events.severity`).

Configurable via Configuration Studio (domain 15):

- Department names, team names, job titles
- Client types / account statuses
- Project categories and stages
- Task priorities and approval types
- Support statuses and priorities
- Subscription package codes (via `service_plans`)
- Notification categories (except critical security, which is forced)

### 3.6 Audit coverage

Mutating business tables emit `audit_events` via trigger or application service. `audit_events` is append-only: no UPDATE/DELETE policies for ordinary roles; service role only for retention purge after Owner-approved policy ([OD-04](#14-open-decisions)). See also [§3.9](#39-audit-and-historical-record-survival).

### 3.7 Indexing baseline

- Every FK column indexed unless the table is tiny and write-heavy with Owner exception.
- Composite indexes for RLS hot paths: `(client_id, status)`, `(assignee_profile_id, status)`, `(cms_instance_id, status)`.
- Unique natural keys where listed (slug, invoice number, etc.).

### 3.8 Storage path conventions (design)

| Bucket (proposed) | Contents |
| --- | --- |
| `company-media` | OkangGroup website media |
| `client-documents` | Contracts, project files (path prefix `client/{client_id}/...`) |
| `support-attachments` | Ticket files |
| `cms-migration-artefacts` | Migration assessment exports (non-sensitive metadata preferred) |

Bucket policies are application/Storage RLS work in a later phase; paths must embed `client_id` for isolation. Storage policies for a bucket must ship in the same implementation tranche that first writes objects to that bucket — never leave a public/authenticated bucket writable without policies.

### 3.9 Audit and historical record survival

**Principle:** Deactivating or removing an account must not destroy accountability history.

| Record class | Survival rule |
| --- | --- |
| `audit_events` | Append-only. `actor_profile_id` → `profiles(id) ON DELETE SET NULL`. Also store immutable snapshots: `actor_email`, `actor_display_name` (and optional `actor_account_kind`) copied at event time. |
| `account_status_events` | Retain after offboarding. `changed_by` → `ON DELETE SET NULL`. Never CASCADE delete the event row when a profile is removed. |
| `access_reviews` | Retain. `subject_profile_id` / `reviewed_by` → `ON DELETE SET NULL` with snapshot columns for subject/reviewer identity at review time. |
| Financial / commercial documents | Never CASCADE delete because a staff profile was removed. Actor columns SET NULL; document rows remain. |
| `task_assignments`, approvals, ticket messages | Prefer SET NULL on actor FKs; keep the operational/history row. |
| `invitations` | Completed invitations retained for audit; `invited_by` SET NULL if profile removed. |

**Forbidden:** `ON DELETE CASCADE` from `profiles` to `audit_events`, financial documents, contracts, invoices, payment records, or security incident records.

**Auth linkage:** `profiles.id` may reference `auth.users(id)`. Normal offboarding must not delete the auth user until sessions are revoked and a documented retention check passes. If `auth.users` is deleted in a break-glass case, profile handling must still leave audit snapshots intact (profile row may be retained in `offboarded` state with auth unlinked, or removed only after snapshotting — exact procedure is part of OD-09 runbook; default design prefers retain profile row).

#### 3.9.1 Audit retention vs personal data (pending OD-04)

Actor snapshots (`actor_email`, `actor_display_name`, etc.) exist for **accountability**, not indefinite personal-data hoarding.

| Rule | Requirement |
| --- | --- |
| Legal basis required | Retention of snapshot PII must follow schedules under **OD-04 R1-pending-durations**. Category-based schedules are required; **concrete durations and legal review remain open**. Until durations are approved, snapshots are retained only as a holding position—not a freeze of retention policy. |
| Category-based schedules | OD-04 must define retention by category at minimum: security audit events; access reviews; financial/commercial records; support transcripts; health-check telemetry; notification delivery logs. |
| Minimisation | Snapshots store the minimum identity fields needed to explain “who acted”; do not copy full profile rows or unrelated PII into `before_json`/`after_json` by default. |
| Pseudonymisation / erasure path | OD-04 may require a controlled purge or irreversible pseudonymisation job (service role only) that replaces snapshot emails/names with stable opaque tokens after the retention period, while keeping the audit event’s action/entity metadata for integrity where law allows. |
| Legal hold | OD-04 must allow holds that suspend purge for designated matters. |
| No user self-delete of audits | Ordinary users and admins cannot DELETE `audit_events` to satisfy a preference request; erasure follows the OD-04 procedure only. |
| Conflict resolution | If accountability retention and a deletion request conflict, the OD-04 schedule and legal hold rules win; Cursor must not invent erasure behaviour in code before OD-04 is approved. |

### 3.10 Security-with-table rule (migration law)

Every migration that creates or first exposes a `public` table must, in the **same** migration:

1. Create constraints and indexes (including composite tenant FKs where applicable).
2. `ENABLE ROW LEVEL SECURITY`.
3. `FORCE ROW LEVEL SECURITY` for table owners where supported / required so bypass via ownership is not accidental.
4. Create the minimum RLS policies for that table’s policy family ([§5.2](#52-policy-families)).
5. `REVOKE` direct table privileges from `anon` / `authenticated` as appropriate, then `GRANT` only the intended DML.
6. Depend on `private` helpers already created in M0/M2 — never ship a table that is selectable by `authenticated` before its policies exist.

There is **no** deferred “security catch-up” migration that first enables RLS for tables already exposed. Hardening tests and Storage bucket policy completion may still have a dedicated late tranche, but initial protection is never postponed.

---

## 4. Domain contracts

Column lists are the approved design contract. Types are PostgreSQL. `…` means standard `created_at` / `updated_at` / `created_by` / `updated_by` unless noted.

---

### Domain 1 — Identity

#### `profiles`

Extends `auth.users` 1:1. Authorisation data lives here / in grants — **never** in `user_metadata` for RLS decisions.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK; FK → `auth.users(id)` — prefer retain profile on offboard; avoid routine auth deletion (see §3.9) |
| `email` | `citext` | NOT NULL, UNIQUE |
| `full_name` | `text` | NOT NULL |
| `display_name` | `text` | NULL |
| `phone` | `text` | NULL |
| `avatar_url` | `text` | NULL |
| `account_kind` | `text` | NOT NULL CHECK IN (`staff`, `client_user`, `system`) |
| `account_status` | `text` | NOT NULL DEFAULT `invited` — values via lookup: `invited`, `active`, `suspended`, `offboarded` |
| `mfa_required` | `boolean` | NOT NULL DEFAULT false — enforced true for OD-11 A roles/sensitive grants |
| `mfa_enforced_at` | `timestamptz` | NULL — when platform marked MFA mandatory for this account |
| `last_login_at` | `timestamptz` | NULL |
| `offboarded_at` | `timestamptz` | NULL |
| … | | |

Indexes: `(account_kind, account_status)`, `(email)`.

**MFA enforcement (OD-11 A):** Login to privileged sessions must fail closed when `mfa_required` is true and the Auth assurance level does not include MFA. Enforcement is both application-side and Auth configuration; UI hiding is not sufficient.

#### `invitations`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `email` | `citext` | NOT NULL |
| `account_kind` | `text` | NOT NULL CHECK IN (`staff`, `client_user`) |
| `client_id` | `uuid` | NULL FK → `clients` ON DELETE CASCADE (required if client_user) |
| `invited_by` | `uuid` | NOT NULL FK → `profiles` |
| `token_hash` | `text` | NOT NULL UNIQUE |
| `role_ids` | `uuid[]` | NULL — initial roles to grant on accept |
| `expires_at` | `timestamptz` | NOT NULL |
| `accepted_at` | `timestamptz` | NULL |
| `revoked_at` | `timestamptz` | NULL |
| `status` | `text` | NOT NULL DEFAULT `pending` |
| … | | |

CHECK: client invitations require `client_id`; staff invitations forbid `client_id` or allow NULL only.

#### `account_status_events`

Append-ish history of status changes.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `profile_id` | `uuid` | NOT NULL FK → `profiles` ON DELETE RESTRICT (offboard instead of delete) |
| `from_status` | `text` | NULL |
| `to_status` | `text` | NOT NULL |
| `reason` | `text` | NULL |
| `changed_by` | `uuid` | NULL FK → `profiles` ON DELETE SET NULL |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |

No `updated_at`. No UPDATE/DELETE for ordinary roles. Survives account deactivation.

---

### Domain 2 — Organisation

Departments and teams are **data**, not code constants.

#### `departments`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `code` | `text` | NOT NULL UNIQUE |
| `name` | `text` | NOT NULL |
| `description` | `text` | NULL |
| `parent_department_id` | `uuid` | NULL FK → `departments` ON DELETE SET NULL |
| `status` | `text` | NOT NULL DEFAULT `active` (`active`, `inactive`, `merged`) |
| `merged_into_id` | `uuid` | NULL FK → `departments` |
| … | | |

#### `teams`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `department_id` | `uuid` | NOT NULL FK → `departments` ON DELETE RESTRICT |
| `code` | `text` | NOT NULL |
| `name` | `text` | NOT NULL |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

UNIQUE (`department_id`, `code`).

#### `job_titles`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `title` | `text` | NOT NULL UNIQUE |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

#### `staff_memberships`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `profile_id` | `uuid` | NOT NULL FK → `profiles` ON DELETE CASCADE |
| `department_id` | `uuid` | NULL FK → `departments` |
| `team_id` | `uuid` | NULL FK → `teams` |
| `job_title_id` | `uuid` | NULL FK → `job_titles` |
| `is_primary` | `boolean` | NOT NULL DEFAULT false |
| `reports_to_profile_id` | `uuid` | NULL FK → `profiles` |
| `started_at` | `date` | NULL |
| `ended_at` | `date` | NULL |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

CHECK: if `team_id` set, team’s department matches `department_id`. Multiple active memberships allowed. Reporting hierarchy is organisational only — **not** an automatic privilege ladder.

---

### Domain 3 — Permissions (RBAC + scope)

#### `permissions`

Stable permission catalogue (seeded by migration; extendable via Configuration Studio only for non-security-critical codes — [OD-05](#14-open-decisions)).

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `code` | `text` | NOT NULL UNIQUE (e.g. `clients.read`, `finance.invoice.issue`) |
| `description` | `text` | NOT NULL |
| `category` | `text` | NOT NULL |
| `is_sensitive` | `boolean` | NOT NULL DEFAULT false |
| `allows_scope` | `boolean` | NOT NULL DEFAULT true |
| … | | |

#### `roles`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `code` | `text` | NOT NULL UNIQUE |
| `name` | `text` | NOT NULL |
| `description` | `text` | NULL |
| `is_system` | `boolean` | NOT NULL DEFAULT false |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

Proposed system role codes (names configurable; codes stable):

`owner`, `platform_admin`, `operations_manager`, `department_manager`, `team_manager`, `staff`, `finance_user`, `support_agent`, `cms_editor`, `client_admin`, `client_user`

#### `role_permissions`

| Column | Type | Constraints |
| --- | --- | --- |
| `role_id` | `uuid` | FK → `roles` ON DELETE CASCADE |
| `permission_id` | `uuid` | FK → `permissions` ON DELETE CASCADE |
| PK | | (`role_id`, `permission_id`) |

#### `access_scopes`

Defines the resource boundary attached to a grant.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `scope_type` | `text` | NOT NULL CHECK IN (`platform`, `department`, `team`, `client`, `project`, `cms_instance`) |
| `department_id` | `uuid` | NULL |
| `team_id` | `uuid` | NULL |
| `client_id` | `uuid` | NULL |
| `project_id` | `uuid` | NULL |
| `cms_instance_id` | `uuid` | NULL |
| … | | |

CHECK: exactly the columns required by `scope_type` are non-null.

#### `role_grants`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `profile_id` | `uuid` | NOT NULL FK → `profiles` ON DELETE CASCADE |
| `role_id` | `uuid` | NOT NULL FK → `roles` ON DELETE RESTRICT |
| `access_scope_id` | `uuid` | NOT NULL FK → `access_scopes` |
| `granted_by` | `uuid` | NULL FK → `profiles` |
| `starts_at` | `timestamptz` | NOT NULL DEFAULT now() |
| `ends_at` | `timestamptz` | NULL |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

UNIQUE active grant: (`profile_id`, `role_id`, `access_scope_id`) WHERE `status = 'active'` (partial unique index).

#### `temporary_access`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `profile_id` | `uuid` | NOT NULL FK → `profiles` |
| `permission_id` | `uuid` | NULL FK → `permissions` |
| `role_id` | `uuid` | NULL FK → `roles` |
| `access_scope_id` | `uuid` | NOT NULL FK → `access_scopes` |
| `reason` | `text` | NOT NULL |
| `approved_by` | `uuid` | NULL FK → `profiles` |
| `starts_at` / `ends_at` | `timestamptz` | NOT NULL |
| `revoked_at` | `timestamptz` | NULL |
| … | | |

CHECK: at least one of `permission_id` / `role_id`.

**Authorisation rule:** Effective access = active `role_grants` (+ unexpired `temporary_access`) whose scope covers the resource, AND permission codes required by the operation. Org reporting lines do not grant permissions by themselves.

---

### Domain 4 — Clients

#### `clients`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_code` | `text` | NOT NULL UNIQUE |
| `legal_name` | `text` | NOT NULL |
| `trading_name` | `text` | NULL |
| `client_type` | `text` | NOT NULL (lookup) |
| `country_code` | `char(2)` | NOT NULL |
| `primary_currency` | `char(3)` | NOT NULL DEFAULT `GBP` |
| `account_status` | `text` | NOT NULL DEFAULT `prospect` |
| `billing_email` | `citext` | NULL |
| `notes_internal` | `text` | NULL (staff-only) |
| `archived_at` | `timestamptz` | NULL |
| … | | |

#### `client_contacts`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL FK → `clients` ON DELETE CASCADE |
| `full_name` | `text` | NOT NULL |
| `email` | `citext` | NULL |
| `phone` | `text` | NULL |
| `job_title` | `text` | NULL |
| `is_primary` | `boolean` | NOT NULL DEFAULT false |
| `portal_profile_id` | `uuid` | NULL FK → `profiles` |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

#### `client_memberships`

Links portal users to a client with a portal role grant scope.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL FK → `clients` ON DELETE CASCADE |
| `profile_id` | `uuid` | NOT NULL FK → `profiles` ON DELETE CASCADE |
| `membership_role` | `text` | NOT NULL (e.g. `client_admin`, `client_user`) |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

UNIQUE (`client_id`, `profile_id`).

#### `client_services`

Catalogue of services engaged (links to commercial plans optionally).

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL FK → `clients` ON DELETE CASCADE |
| `service_plan_id` | `uuid` | NULL FK → `service_plans` |
| `service_name` | `text` | NOT NULL |
| `status` | `text` | NOT NULL DEFAULT `active` |
| `started_on` / `ended_on` | `date` | NULL |
| … | | |

**Deletion:** Clients are soft-archived (`account_status = archived`, `archived_at`). Hard delete forbidden once contracts/invoices exist (RESTRICT via FKs).

---

### Domain 5 — Projects

#### `projects`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL FK → `clients` ON DELETE RESTRICT |
| `code` | `text` | NOT NULL |
| `name` | `text` | NOT NULL |
| `category` | `text` | NOT NULL (lookup / configurable) |
| `stage` | `text` | NOT NULL (workflow-driven) |
| `status` | `text` | NOT NULL DEFAULT `open` (`open`, `on_hold`, `cancelled`, `closed`) |
| `contract_id` | `uuid` | NULL FK → `contracts` |
| `budget_amount` | `numeric(18,2)` | NULL |
| `budget_currency` | `char(3)` | NULL |
| `starts_on` / `target_end_on` | `date` | NULL |
| `summary` | `text` | NULL |
| … | | |

UNIQUE (`client_id`, `code`). Also `UNIQUE (client_id, id)` to support composite tenant FKs from children (§3.3.1).

Lifecycle stages (default seed; configurable):  
`enquiry` → `proposal` → `approved` → `planning` → `development` → `testing` → `client_review` → `delivered` → `maintenance`  
Machine must allow skip, return, cancel ([§8](#8-workflow-state-machines)).

#### `project_deliverables`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `project_id` | `uuid` | NOT NULL FK → `projects` ON DELETE CASCADE |
| `client_id` | `uuid` | NOT NULL FK → `clients` |
| `name` | `text` | NOT NULL |
| `deliverable_type` | `text` | NOT NULL |
| `status` | `text` | NOT NULL |
| … | | |

#### `milestones`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `project_id` | `uuid` | NOT NULL FK → `projects` ON DELETE CASCADE |
| `client_id` | `uuid` | NOT NULL |
| `name` | `text` | NOT NULL |
| `due_on` | `date` | NULL |
| `completed_at` | `timestamptz` | NULL |
| `status` | `text` | NOT NULL |
| `sort_order` | `int` | NOT NULL DEFAULT 0 |
| … | | |

#### `change_requests`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `project_id` | `uuid` | NOT NULL FK → `projects` |
| `client_id` | `uuid` | NOT NULL |
| `title` | `text` | NOT NULL |
| `description` | `text` | NOT NULL |
| `impact_summary` | `text` | NULL |
| `status` | `text` | NOT NULL |
| `requested_by_profile_id` | `uuid` | NULL |
| `approved_by_profile_id` | `uuid` | NULL |
| … | | |

#### `project_documents`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `project_id` | `uuid` | NOT NULL |
| `client_id` | `uuid` | NOT NULL |
| `title` | `text` | NOT NULL |
| `storage_path` | `text` | NOT NULL |
| `doc_type` | `text` | NOT NULL |
| `visibility` | `text` | NOT NULL CHECK IN (`internal`, `client_visible`) |
| … | | |

---

### Domain 6 — CMS Registry (client CMS control centre)

Platform registry only. Per-client content schemas live in the client CMS backend.

#### `cms_instances`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL FK → `clients` ON DELETE RESTRICT |
| `slug` | `text` | NOT NULL UNIQUE (e.g. `treasure-house`) |
| `display_name` | `text` | NOT NULL |
| `cms_kind` | `text` | NOT NULL (e.g. `church_website`, `courier_website`, `custom`) |
| `management_mode` | `text` | NOT NULL CHECK IN (`okanggroup_managed`, `client_managed`, `hybrid`) |
| `status` | `text` | NOT NULL DEFAULT `pending` (`pending`, `connected`, `disconnected`, `migrating`, `retired`) |
| `primary_domain` | `text` | NULL |
| `admin_path` | `text` | NULL (e.g. `/cms/treasure-house`) |
| `data_residency_note` | `text` | NULL |
| `excludes_sensitive_modules` | `boolean` | NOT NULL DEFAULT true |
| `contractual_access_profile` | `text` | NULL — reference/key to contractual restriction set (enforced in platform + external CMS; see §6.5) |
| … | | |

Also `UNIQUE (client_id, id)` for composite tenant FKs (§3.3.1).

#### `cms_modules`

Registered capability modules for an instance (feature map, not content).

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `cms_instance_id` | `uuid` | NOT NULL FK → `cms_instances` ON DELETE CASCADE |
| `client_id` | `uuid` | NOT NULL |
| `module_code` | `text` | NOT NULL |
| `module_name` | `text` | NOT NULL |
| `is_sensitive` | `boolean` | NOT NULL DEFAULT false |
| `hosted_in` | `text` | NOT NULL CHECK IN (`platform_registry_only`, `external_cms`, `company_cms`) |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

UNIQUE (`cms_instance_id`, `module_code`). Sensitive modules marked `is_sensitive = true` must not be migrated into platform content tables.

#### `cms_connections`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `cms_instance_id` | `uuid` | NOT NULL FK → `cms_instances` ON DELETE CASCADE |
| `client_id` | `uuid` | NOT NULL |
| `base_url` | `text` | NOT NULL |
| `auth_method` | `text` | NOT NULL CHECK IN (`service_jwt`, `m2m_oauth`, `signed_webhook`, `manual`) |
| `credential_ref` | `text` | NULL — reference to secret store / vault scoped per `cms_instance_id`; **never** store raw secrets in this row; **never** reuse one credential across clients |
| `credential_rotated_at` | `timestamptz` | NULL |
| `last_healthy_at` | `timestamptz` | NULL |
| `last_error` | `text` | NULL |
| `status` | `text` | NOT NULL DEFAULT `unknown` |
| … | | |

Composite FK: `FOREIGN KEY (client_id, cms_instance_id) REFERENCES cms_instances (client_id, id)`.

#### `cms_migrations`

Migration framework records for existing CMS systems.

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `cms_instance_id` | `uuid` | NOT NULL |
| `client_id` | `uuid` | NOT NULL |
| `phase` | `text` | NOT NULL (`discovery`, `compatibility`, `feature_mapping`, `auth_migration`, `api_integration`, `content_verification`, `permission_testing`, `cutover`, `rollback`, `complete`) |
| `assessment_notes` | `text` | NULL |
| `risk_level` | `text` | NULL |
| `cutover_at` | `timestamptz` | NULL |
| `rolled_back_at` | `timestamptz` | NULL |
| `status` | `text` | NOT NULL |
| … | | |

**Ownership:** Client retains data ownership regardless of `management_mode`.

---

### Domain 7 — Company CMS (OkangGroup website)

Internal CMS for `okanggroup.com`. Not a multi-tenant client content store.

#### `cms_pages`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `slug` | `text` | NOT NULL UNIQUE |
| `title` | `text` | NOT NULL |
| `page_type` | `text` | NOT NULL (home, about, services, products, client_work, contact, custom) |
| `status` | `text` | NOT NULL DEFAULT `draft` (`draft`, `in_review`, `scheduled`, `published`, `archived`) |
| `published_at` | `timestamptz` | NULL |
| `published_by` | `uuid` | NULL |
| … | | |

#### `cms_sections`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `page_id` | `uuid` | NOT NULL FK → `cms_pages` ON DELETE CASCADE |
| `section_key` | `text` | NOT NULL |
| `sort_order` | `int` | NOT NULL DEFAULT 0 |
| `content_json` | `jsonb` | NOT NULL DEFAULT `{}` |
| `status` | `text` | NOT NULL DEFAULT `draft` |
| … | | |

UNIQUE (`page_id`, `section_key`).

#### Specialised managers (tables or typed rows)

| Table | Purpose |
| --- | --- |
| `cms_services` | Services catalogue items |
| `cms_products` | OkangGroup-owned products |
| `cms_portfolio_items` | Approved client-work showcases (may reference `clients.id` optionally) |
| `cms_media_assets` | Media library metadata + `storage_path` |
| `cms_navigation` | Menu trees (`parent_id`, `label`, `href`, `sort_order`) |
| `cms_seo` | Per-page metadata (`page_id`, title, description, og fields) |
| `contact_enquiries` | Public contact form submissions |
| `cms_revisions` | Version history for pages/sections (`entity_type`, `entity_id`, `snapshot_json`, `revision_no`) |

Publishing rules: draft → review → publish; restore from `cms_revisions`. Exact approval chain is workflow-configured ([§8](#8-workflow-state-machines)).

**Design constraint:** Content model adapts to existing page structure; it must not mandate a visual redesign of the live site.

---

### Domain 8 — Operations (work allocation)

#### `tasks`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NULL FK → `clients` |
| `project_id` | `uuid` | NULL FK → `projects` |
| `cms_instance_id` | `uuid` | NULL FK → `cms_instances` |
| `title` | `text` | NOT NULL |
| `description` | `text` | NULL |
| `priority` | `text` | NOT NULL (lookup) |
| `status` | `text` | NOT NULL (workflow) |
| `due_at` | `timestamptz` | NULL |
| `requires_approval` | `boolean` | NOT NULL DEFAULT false |
| `created_by` | `uuid` | NULL |
| `completed_at` | `timestamptz` | NULL |
| `verification_status` | `text` | NULL (`unverified`, `verified`, `rejected`) |
| … | | |

**OD-06 R1:** Internal company tasks use `is_internal = true` with `client_id IS NULL` (§3.3.2)—no fictional client. Client-linked tasks require `client_id` and optional composite parent FKs.

#### `task_assignments`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `task_id` | `uuid` | NOT NULL FK → `tasks` ON DELETE CASCADE |
| `assignee_profile_id` | `uuid` | NULL FK → `profiles` |
| `assignee_team_id` | `uuid` | NULL FK → `teams` |
| `assigned_by` | `uuid` | NULL FK → `profiles` |
| `assignment_type` | `text` | NOT NULL CHECK IN (`manual`, `team`, `reassignment`, `escalation`) |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

CHECK: one of profile or team assignee. All changes audited.

#### `task_dependencies`

| Column | Type | Constraints |
| --- | --- | --- |
| `task_id` | `uuid` | FK → `tasks` ON DELETE CASCADE |
| `depends_on_task_id` | `uuid` | FK → `tasks` ON DELETE CASCADE |
| PK | | (`task_id`, `depends_on_task_id`) |
| CHECK | | `task_id <> depends_on_task_id` |

#### `approvals`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `entity_type` | `text` | NOT NULL (`task`, `change_request`, `cms_page`, `quotation`, `invoice`, `access_request`, …) |
| `entity_id` | `uuid` | NOT NULL |
| `client_id` | `uuid` | NULL |
| `requested_by` | `uuid` | NOT NULL FK → `profiles` |
| `approver_profile_id` | `uuid` | NULL |
| `approver_role_id` | `uuid` | NULL |
| `status` | `text` | NOT NULL DEFAULT `pending` |
| `decided_at` | `timestamptz` | NULL |
| `decision_note` | `text` | NULL |
| … | | |

Ordinary client CMS publish tasks must not require Owner for every step; Operations Manager / Team Manager scopes apply within authorised grants.

---

### Domain 9 — Commercial

#### `service_plans`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `code` | `text` | NOT NULL UNIQUE |
| `name` | `text` | NOT NULL |
| `billing_model` | `text` | NOT NULL CHECK IN (`one_time`, `monthly`, `annual`, `custom`) |
| `default_amount` | `numeric(18,2)` | NULL |
| `default_currency` | `char(3)` | NOT NULL DEFAULT `GBP` |
| `includes_json` | `jsonb` | NOT NULL DEFAULT `[]` |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

#### `quotations`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL |
| `quote_number` | `text` | NOT NULL UNIQUE |
| `status` | `text` | NOT NULL |
| `currency_code` | `char(3)` | NOT NULL |
| `subtotal` / `tax_total` / `total` | `numeric(18,2)` | NOT NULL |
| `valid_until` | `date` | NULL |
| `lines_json` | `jsonb` | NOT NULL |
| … | | |

#### `contracts`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL |
| `contract_number` | `text` | NOT NULL UNIQUE |
| `title` | `text` | NOT NULL |
| `status` | `text` | NOT NULL |
| `effective_on` / `ends_on` | `date` | NULL |
| `storage_path` | `text` | NULL |
| `terms_summary` | `text` | NULL |
| … | | |

#### `subscriptions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL |
| `service_plan_id` | `uuid` | NOT NULL FK → `service_plans` |
| `cms_instance_id` | `uuid` | NULL |
| `status` | `text` | NOT NULL (`trial`, `active`, `past_due`, `paused`, `cancelled`, `expired`) |
| `billing_interval` | `text` | NOT NULL (`monthly`, `annual`, `custom`) |
| `amount` | `numeric(18,2)` | NOT NULL |
| `currency_code` | `char(3)` | NOT NULL |
| `current_period_start` / `current_period_end` | `date` | NOT NULL |
| `cancel_at_period_end` | `boolean` | NOT NULL DEFAULT false |
| `grace_period_days` | `int` | NULL — configurable (OD-10 R1) |
| … | | |

**OD-10 R1:** Dunning may set `past_due` and notify. It must **not** automatically disconnect the client’s public website or CMS runtime. Any suspension of OkangGroup **management** services requires an authorised decision (§3.4.1).

#### `invoices` / `invoice_lines`

| `invoices` column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL |
| `invoice_number` | `text` | NOT NULL UNIQUE — **OD-17 R1-amended:** allocated atomically; never reused; voided numbers retained |
| `subscription_id` | `uuid` | NULL |
| `contract_id` | `uuid` | NULL |
| `status` | `text` | `draft`, `issued`, `paid`, `partially_paid`, `void`, `overdue` |
| `currency_code` | `char(3)` | NOT NULL |
| `issue_date` / `due_date` | `date` | |
| `subtotal` | `numeric(18,2)` | amount invoiced (ex-tax or as defined by lines) |
| `tax_total` | `numeric(18,2)` | tax charged |
| `total` | `numeric(18,2)` | invoiced total |
| `amount_paid` | `numeric(18,2)` | sum of applied payments |
| `amount_credited` | `numeric(18,2)` | NOT NULL DEFAULT 0 — credit notes applied |
| `amount_outstanding` | `numeric(18,2)` | derived or stored consistently with paid/credited |
| `tax_snapshot_json` | `jsonb` | NOT NULL DEFAULT `{}` — jurisdiction, rates, exemptions, bases at issue (OD-03) |
| `funds_class` | `text` | NOT NULL DEFAULT `okanggroup_income` — vs `client_funds` (or equivalent) so OkangGroup revenue ≠ client-belonging money |
| `fx_rate` / `fx_rate_as_of` | | optional |
| `voided_at` / `void_reason` | | void preserves `invoice_number` in audit history |

`invoice_lines`: `invoice_id`, `description`, `quantity`, `unit_amount`, `line_total`, tax fields as needed, optional `service_plan_id`.

Pricing overrides are per contract/subscription row — never mutate past invoices when `service_plans.default_amount` changes.

**OD-17 R1-amended:** Number issuance must be concurrency-safe (atomic sequence / transactional allocation). Gaps appear only when a number was issued then voided; voided numbers remain queryable.

---

### Domain 10 — Payments

#### `payment_records`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL |
| `invoice_id` | `uuid` | NULL FK → `invoices` |
| `amount` | `numeric(18,2)` | NOT NULL |
| `currency_code` | `char(3)` | NOT NULL |
| `paid_on` | `date` | NOT NULL |
| `method` | `text` | NOT NULL (bank_transfer, cash, other) — **OD-01 R1:** manual recording initially |
| `provider` | `text` | NULL — reserved for future provider integration (schema retains extensibility) |
| `provider_ref` | `text` | NULL |
| `status` | `text` | NOT NULL DEFAULT `recorded` |
| `funds_class` | `text` | NOT NULL DEFAULT `okanggroup_income` — same distinction as invoices |
| `fx_rate` / `fx_rate_as_of` | | optional |
| … | | |

#### `credit_notes` / `refunds`

Parallel structures referencing `invoice_id` / `payment_records.id` with immutable amounts and reason codes.

**OD-07 R1-amended:** Configurable approval thresholds (amount + currency + role) in Configuration Studio. **Separation of duties:** the profile that **requests** a credit/refund must not be the same profile that **approves** it (enforce in `approvals` workflow). Below-threshold paths still require a distinct approver when the requester holds the finance role that would otherwise self-approve—or define an alternate approver role; self-approval is forbidden.

#### `expenses`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `category` | `text` | NOT NULL |
| `amount` / `currency_code` | | NOT NULL |
| `spent_on` | `date` | NOT NULL |
| `vendor_name` | `text` | NULL |
| `client_id` | `uuid` | NULL (billable recharge) |
| `project_id` | `uuid` | NULL |
| `status` | `text` | NOT NULL |
| … | | |

#### `fx_rates`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `base_currency` | `char(3)` | NOT NULL |
| `quote_currency` | `char(3)` | NOT NULL |
| `rate` | `numeric(18,8)` | NOT NULL |
| `as_of_date` | `date` | NOT NULL |
| `source` | `text` | NOT NULL |
| UNIQUE | | (`base_currency`, `quote_currency`, `as_of_date`, `source`) |

---

### Domain 11 — Support

#### `tickets`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NOT NULL |
| `ticket_number` | `text` | NOT NULL UNIQUE |
| `subject` | `text` | NOT NULL |
| `priority` | `text` | NOT NULL |
| `status` | `text` | NOT NULL (workflow) |
| `project_id` / `cms_instance_id` / `monitored_service_id` | `uuid` | NULL |
| `requester_profile_id` | `uuid` | NULL |
| `assignee_profile_id` | `uuid` | NULL |
| `first_response_due_at` / `resolve_due_at` | `timestamptz` | NULL |
| `satisfaction_score` | `int` | NULL CHECK 1–5 |
| … | | |

Default statuses: `new` → `assigned` → `in_progress` → `awaiting_client` → `resolved` → `closed` (configurable).

#### `ticket_messages`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `ticket_id` | `uuid` | NOT NULL FK ON DELETE CASCADE |
| `client_id` | `uuid` | NOT NULL |
| `author_profile_id` | `uuid` | NULL |
| `visibility` | `text` | NOT NULL CHECK IN (`client_visible`, `internal`) |
| `body` | `text` | NOT NULL |
| `storage_paths` | `text[]` | NULL |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |

#### `incidents`

Operational incidents (may link multiple clients/services).

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `title` | `text` | NOT NULL |
| `severity` | `text` | NOT NULL |
| `status` | `text` | NOT NULL |
| `started_at` / `resolved_at` | `timestamptz` | |
| `summary` | `text` | NULL |
| `client_id` | `uuid` | NULL |
| `monitored_service_id` | `uuid` | NULL |
| … | | |

---

### Domain 12 — Monitoring

#### `monitored_services`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `client_id` | `uuid` | NULL (NULL = OkangGroup-owned) |
| `cms_instance_id` | `uuid` | NULL |
| `name` | `text` | NOT NULL |
| `service_type` | `text` | NOT NULL (`website`, `api`, `cms`, `ssl`, `domain`, `backup`, `integration`) |
| `target` | `text` | NOT NULL (URL/host) |
| `is_authorised` | `boolean` | NOT NULL DEFAULT false — monitoring only if authorised |
| `check_mode` | `text` | NOT NULL CHECK IN (`live_check`, `manual_status`) |
| `status` | `text` | NOT NULL DEFAULT `unknown` |
| `ssl_expires_on` / `domain_expires_on` | `date` | NULL |
| … | | |

#### `health_checks`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `monitored_service_id` | `uuid` | NOT NULL |
| `checked_at` | `timestamptz` | NOT NULL DEFAULT now() |
| `ok` | `boolean` | NOT NULL |
| `latency_ms` | `int` | NULL |
| `detail` | `text` | NULL |
| `source` | `text` | NOT NULL (`probe`, `manual`) |

Append-oriented; retention policy OD-04.

#### `alerts`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `monitored_service_id` | `uuid` | NULL |
| `client_id` | `uuid` | NULL |
| `severity` | `text` | NOT NULL |
| `title` | `text` | NOT NULL |
| `status` | `text` | NOT NULL (`open`, `acknowledged`, `resolved`) |
| `opened_at` / `resolved_at` | `timestamptz` | |
| … | | |

---

### Domain 13 — Notifications

#### `notifications`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `profile_id` | `uuid` | NOT NULL FK → `profiles` ON DELETE CASCADE |
| `category` | `text` | NOT NULL |
| `title` | `text` | NOT NULL |
| `body` | `text` | NOT NULL |
| `payload_json` | `jsonb` | NOT NULL DEFAULT `{}` |
| `is_critical` | `boolean` | NOT NULL DEFAULT false |
| `read_at` | `timestamptz` | NULL |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |

#### `notification_preferences`

| Column | Type | Constraints |
| --- | --- | --- |
| `profile_id` | `uuid` | NOT NULL |
| `category` | `text` | NOT NULL |
| `channel` | `text` | NOT NULL CHECK IN (`in_app`, `email`) |
| `enabled` | `boolean` | NOT NULL DEFAULT true |
| PK | | (`profile_id`, `category`, `channel`) |

Critical security categories ignore `enabled = false` for ordinary users.

#### `delivery_attempts`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `notification_id` | `uuid` | NOT NULL |
| `channel` | `text` | NOT NULL |
| `status` | `text` | NOT NULL |
| `attempted_at` | `timestamptz` | NOT NULL DEFAULT now() |
| `error` | `text` | NULL |

---

### Domain 14 — Security

#### `audit_events` (append-only)

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `actor_profile_id` | `uuid` | NULL FK → `profiles(id) ON DELETE SET NULL` |
| `actor_email` | `citext` | NULL — snapshot at event time |
| `actor_display_name` | `text` | NULL — snapshot at event time |
| `actor_kind` | `text` | NOT NULL (`user`, `system`, `service`) |
| `action` | `text` | NOT NULL |
| `entity_type` | `text` | NOT NULL |
| `entity_id` | `uuid` | NULL |
| `client_id` | `uuid` | NULL |
| `severity` | `text` | NOT NULL DEFAULT `info` |
| `before_json` / `after_json` | `jsonb` | NULL |
| `ip` | `inet` | NULL |
| `user_agent` | `text` | NULL |
| `created_at` | `timestamptz` | NOT NULL DEFAULT now() |

Indexes: `(client_id, created_at DESC)`, `(actor_profile_id, created_at DESC)`, `(entity_type, entity_id)`.  
**No CASCADE from profiles.** No UPDATE/DELETE for `authenticated` / `anon`. Retention purge only via controlled service role after OD-04.

#### `access_reviews`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `subject_profile_id` | `uuid` | NULL FK → `profiles ON DELETE SET NULL` |
| `subject_email` | `citext` | NOT NULL — snapshot |
| `reviewed_by` | `uuid` | NULL FK → `profiles ON DELETE SET NULL` |
| `reviewer_email` | `citext` | NOT NULL — snapshot |
| `outcome` | `text` | NOT NULL |
| `notes` | `text` | NULL |
| `reviewed_at` | `timestamptz` | NOT NULL DEFAULT now() |

#### `security_incidents`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `title` | `text` | NOT NULL |
| `severity` | `text` | NOT NULL |
| `status` | `text` | NOT NULL |
| `detected_at` | `timestamptz` | NOT NULL |
| `resolved_at` | `timestamptz` | NULL |
| `summary` | `text` | NULL |
| … | | |

Owner actions are audited the same as any privileged actor. Contractual/legal restrictions on client PII are enforced via permissions + scope + application checks — Owner role is not a silent bypass for excluded sensitive CMS modules ([OD-08](#14-open-decisions)).

---

### Domain 15 — Configuration (Configuration Studio)

#### `settings`

| Column | Type | Constraints |
| --- | --- | --- |
| `key` | `text` | PK |
| `value_json` | `jsonb` | NOT NULL |
| `is_secret` | `boolean` | NOT NULL DEFAULT false |
| `description` | `text` | NULL |
| `updated_by` | `uuid` | NULL |
| `updated_at` | `timestamptz` | NOT NULL DEFAULT now() |

Secrets must not be readable via anon key; prefer external secret refs.

#### `feature_flags`

| Column | Type | Constraints |
| --- | --- | --- |
| `key` | `text` | PK |
| `enabled` | `boolean` | NOT NULL DEFAULT false |
| `description` | `text` | NULL |
| … | | |

#### `workflow_definitions`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `workflow_key` | `text` | NOT NULL UNIQUE (`project_lifecycle`, `task`, `support_ticket`, `company_cms_publish`, `subscription`) |
| `definition_json` | `jsonb` | NOT NULL — states, transitions, required permissions, skip rules |
| `version` | `int` | NOT NULL DEFAULT 1 |
| `status` | `text` | NOT NULL DEFAULT `active` |
| … | | |

Validation: Configuration Studio writes must pass server-side schema validation; cannot grant `permissions` codes outside allowed admin operations; cannot disable audit; cannot widen RLS by config alone.

#### `lookup_values`

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | `uuid` | PK |
| `set_key` | `text` | NOT NULL |
| `code` | `text` | NOT NULL |
| `label` | `text` | NOT NULL |
| `sort_order` | `int` | NOT NULL DEFAULT 0 |
| `status` | `text` | NOT NULL DEFAULT `active` |
| UNIQUE | | (`set_key`, `code`) |

---

## 5. Permission and RLS contracts

### 5.1 Helper predicates and privilege contract

Implement as `SECURITY DEFINER` functions in schema `private` (OD-02 A). These functions exist so RLS policies can evaluate grants without granting callers direct SELECT on all grant tables under overly broad policies.

| Function | Intent | Callable by |
| --- | --- | --- |
| `private.current_profile_id()` | `auth.uid()` → active `profiles.id` (null if suspended/offboarded) | `authenticated` (EXECUTE only) |
| `private.has_permission(code text)` | platform-scoped active grant exists | `authenticated` (EXECUTE only) |
| `private.has_permission_on_client(code, client_id)` | platform OR matching client scope; also evaluates contractual restriction flags where applicable | `authenticated` (EXECUTE only) |
| `private.has_permission_on_project(code, project_id)` | client/project scope chain | `authenticated` (EXECUTE only) |
| `private.has_permission_on_cms(code, cms_instance_id)` | cms scope **and** not blocked by contractual/module restrictions | `authenticated` (EXECUTE only) |
| `private.is_client_member(client_id)` | active `client_memberships` | `authenticated` (EXECUTE only) |
| `private.can_read_finance(client_id)` | explicit finance permission — not implied by ops roles | `authenticated` (EXECUTE only) |
| `private.assert_same_client(...)` | internal helper for triggers validating composite tenant consistency | **not** granted to `authenticated` / `anon` |

#### 5.1.1 Privilege rules (mandatory)

| Rule | Requirement |
| --- | --- |
| Schema exposure | `REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated`. No PostgREST exposure of `private`. |
| Default privileges | No default GRANT that would auto-expose new `private` functions to `authenticated`. |
| EXECUTE grants | Only the boolean/uuid predicate functions listed as callable by `authenticated` receive `GRANT EXECUTE`. They return non-privileged scalars only (uuid/boolean), never grant-table rowsets. |
| Internal helpers | Trigger/validation helpers are executable by the role that owns triggers (typically migration owner / `postgres` / Supabase maintainer role), not by end-user roles. |
| `SECURITY DEFINER` owner | Functions owned by a privileged role; body must set a fixed `search_path` (e.g. `SET search_path = private, public, pg_temp`) to prevent search-path attacks. |
| RLS interaction | Policies on `public` tables invoke `private.*` predicates in `USING` / `WITH CHECK`. Callers do not bypass RLS on underlying grant tables except through the definer’s carefully scoped reads inside the function. |
| Service role | `service_role` bypasses RLS by design in Supabase — application servers must not expose it to browsers; use only for trusted server jobs (audit insert, probes, controlled retention). |
| Forbidden | Exposing SQL that accepts dynamic table/column names from the client; granting `authenticated` ownership of `private` objects; putting definer helpers in `public`. |

#### 5.1.2 How schema privileges, EXECUTE, RLS, and the Data API work together

PostgreSQL separates **schema USAGE**, **function EXECUTE**, and **table DML**. Supabase’s Data API (PostgREST) only exposes schemas configured in API settings (normally `public`, `storage`, `graphql_public` — **not** `private`).

**Executable privilege model (design contract):**

1. **Schema `private`**
   - `REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated`.
   - Do **not** add `private` to Supabase “Exposed schemas”.
   - Result: clients cannot `SELECT`/`INSERT` arbitrary objects in `private` via the Data API, and cannot discover private tables as REST resources.

2. **Why EXECUTE can still work without schema USAGE on `private`**
   - RLS policies on `public` tables are rewritten/executed inside the database engine as expressions on the table owner’s policy definitions.
   - When a policy expression calls `private.has_permission_on_client(...)`, PostgreSQL resolves that call as a function invocation in a security context that does **not** require the end-user role to hold broad schema privileges to “browse” `private`.
   - End-user roles need `EXECUTE` on the specific predicate functions they are allowed to call (for policy evaluation and, if ever needed, explicit `select private.fn()` from SQL). They must **not** receive `CREATE`/`USAGE` that would let them list or manipulate other private objects.
   - Practical GRANT pattern for each allowed predicate:
     - `GRANT EXECUTE ON FUNCTION private.has_permission_on_client(text, uuid) TO authenticated;`
     - Never `GRANT ALL ON ALL FUNCTIONS IN SCHEMA private TO authenticated`.
     - Never `GRANT USAGE ON SCHEMA private TO anon`.

3. **RLS compatibility**
   - Policies live on `public` tables and reference `private.*` predicates in `USING` / `WITH CHECK`.
   - Predicate functions are `SECURITY DEFINER` with fixed `search_path`, read only the grant/profile tables they need, and return `boolean`/`uuid`.
   - Because functions are definer-owned, they can read grant rows even when the invoking user lacks direct SELECT on those tables — this is intentional and must stay narrowly scoped inside the function body.
   - `FORCE ROW LEVEL SECURITY` on sensitive tables prevents table-owner bypass during ordinary sessions.

4. **Data API non-exposure**
   - Clients authenticate as `anon` / `authenticated` against `public` (and Storage) only.
   - Even if someone learns a function name, PostgREST will not expose `private` RPCs unless the schema is exposed **and** `GRANT EXECUTE` exists; both must remain false for privileged internals.
   - Allowed predicates are not “privileged operations”: they answer yes/no for the current `auth.uid()` only. They must not accept arbitrary SQL, must not return grant rowsets, and must not elevate the caller’s role.

5. **Verification checklist (future implementation phase — not executed now)**
   - `private` absent from exposed schemas.
   - `\dp` / privilege inventory shows no table DML on private objects for `authenticated`.
   - Only listed predicates have `EXECUTE` for `authenticated`.
   - Negative test: REST call to `/rest/v1/rpc/has_permission_on_client` fails if routed through private exposure (preferred: function not exposed at all; policies alone use it).
   - Positive test: `authenticated` SELECT on a permitted `public` row succeeds via policy calling the predicate.

**Never** authorise from `auth.jwt() -> user_metadata`. Prefer `profiles` + grants tables; if using JWT claims, only `app_metadata` maintained by service role, with documented refresh lag.

**Auth enforcement strengtheners (design):** suspended/offboarded profiles cause `current_profile_id()` to return null so RLS denies; MFA-required accounts must not receive elevated sessions without MFA (OD-11 A); invitation tokens are single-use hashed secrets (OD-12 A).

### 5.2 Policy families

| Table family | SELECT | INSERT/UPDATE | DELETE |
| --- | --- | --- | --- |
| `profiles` | self; staff with `people.read`; limited client-visible fields via views | self limited fields; admin for status | forbid (offboard instead) |
| Org tables | staff with `org.read` | `org.manage` | soft-deactivate |
| `role_grants` | security admins; self read own | `security.grants.manage` | revoke = status update |
| `clients` | staff scoped OR client members (own client) | `clients.write` scoped | archive only |
| Client child tables | same tenant + permission | scoped write | soft or RESTRICT |
| Finance tables | `finance.*` only | finance roles | void/credit flows, not silent delete |
| Company CMS | `company_cms.*` staff | editors + publish approval | archive |
| CMS registry | staff with `cms_registry.*` scoped by client; client members see own non-sensitive connection status | manage modes per permission | retire |
| `tasks` / `approvals` | assignees, scoped managers, relevant client visibility rules | assign within grant scope | soft cancel |
| `tickets` | client members (own, non-internal notes); support staff scoped | create/reply rules by visibility | close only |
| `audit_events` | `security.audit.read` (scoped by client where present) | insert via trigger/service only | deny |
| `settings` / workflows | platform admin | platform admin with validation | deny destructive on system keys |
| Monitoring | ops/monitoring roles; client may see own authorised services if granted | probe writers = service role | — |

### 5.3 Client portal isolation

Client users:

- See only their `client_id` rows.
- Never see other clients, staff HR records, internal notes (`notes_internal`, internal ticket messages), profit margins, or platform settings.
- CMS UI access further limited by `cms_instances.management_mode` and module permissions.

### 5.4 Staff vs Owner

- Owner: broad platform configuration and commercial administration via permissions on `owner` role — still audited.
- Owner does **not** automatically receive content access inside external sensitive CMS modules marked `is_sensitive` / `hosted_in = external_cms` without an explicit time-limited audited grant (OD-08 A). Even with such a grant, client contractual access restrictions take precedence and cannot be overridden by an internal Owner grant.

### 5.5 RLS enablement (per migration)

`ALTER TABLE … ENABLE ROW LEVEL SECURITY` (and force where required) on every `public` table **in the same migration that creates the table** ([§3.10](#310-security-with-table-rule-migration-law)). No table relies on “hidden from UI” alone. Views that join tenant data use `security_invoker = true` (Postgres 15+).

---

## 6. Client CMS integration model

### 6.1 Three components (per V2.0)

| Component | Where it lives | Platform DB responsibility |
| --- | --- | --- |
| A. Management UI | Route under okanggroup.com (e.g. `/cms/{slug}`) | Platform AuthZ via grants + `cms_instances` — **not** a substitute for external CMS AuthZ |
| B. CMS backend | Separate service/DB per client (typical) | Registry + connection health + credential refs only |
| C. Client application | Client domain | Out of platform DB |

### 6.2 Connection contract (logical)

```text
Platform  --(cms_connections.auth_method + per-instance credential_ref)-->  Client CMS API
Platform stores: instance metadata, module map, migration state, task links
Client CMS stores: content, media, domain-specific business data
External CMS independently enforces its own authorisation
```

### 6.3 Management modes

| Mode | Who mutates content in client CMS | Platform tasks |
| --- | --- | --- |
| OkangGroup Managed | Staff with cms scope **and** external CMS acceptance of that actor | Full ops workflow |
| Client Managed | Client portal users **and** external CMS AuthZ | Support + monitoring optional |
| Hybrid | Both per module ACL on **both** sides | Module-level grants required |

### 6.4 Example registry rows (illustrative, not seed mandates)

| Client | CMS slug | Kind |
| --- | --- | --- |
| Treasure House Bible Church International | `treasure-house` | Church website CMS |
| Noble Express Courier | `noble-express` | Courier website CMS |
| SparkleValeting | `sparkle-valeting` | Valeting website CMS |

### 6.5 External CMS authorisation boundaries (mandatory; detail in V2.3)

Platform permissions **do not** automatically grant access to an external client database or CMS API.

| Requirement | Rule |
| --- | --- |
| Independent AuthZ | Every call into a client CMS must be authorised by that CMS (or its dedicated gateway) using its own rules. Platform RLS is necessary but not sufficient for external data. |
| Contractual restrictions | `contractual_access_profile` / module `is_sensitive` flags and client-stated exclusions must be evaluated before any proxy or credential use. An Owner temporary grant cannot override an explicit contractual denial (OD-08 A). |
| Credential isolation | One `credential_ref` per `cms_instance` (or narrower). No shared service credentials across clients. Rotation recorded; revoke on offboarding (OD-09). Raw secrets never in Postgres rows. |
| Least privilege tokens | Connection credentials must be scoped to the minimum external operations required; sensitive modules remain unreachable when excluded. |
| No silent data copy | Migration/discovery must not ingest excluded sensitive modules into OkangGroup tables. |
| Audit | Platform audits who initiated an external action; the external CMS should retain its own access logs where available. |
| Failure mode | If external AuthZ denies, platform must surface denial — not fall back to a privileged break-glass credential without an audited temporary_access path. |

**V2.3 obligation:** Expand this section into the full CMS Integration Architecture (protocols, token exchange, per-client gateway patterns, pilot checklist). V2.1.3 only locks the security boundary requirements above.

---

## 7. Delegation and offboarding

### 7.1 Delegation rules (data support)

- Manual / team / reassignment / escalation via `task_assignments.assignment_type`.
- Managers assign only within `access_scopes` they hold (`operations.assign` permission).
- Workload views: count open tasks per `assignee_profile_id` / team (application query; optional materialised view later).
- Approval requirements from `tasks.requires_approval` + `workflow_definitions`.

### 7.2 Staff offboarding

1. Set `profiles.account_status = offboarded`, `offboarded_at = now()` — **default path; do not delete the profile** (§3.9).
2. End `staff_memberships`, revoke `role_grants` / `temporary_access`.
3. Reassign open `tasks`, tickets, approvals.
4. Invalidate sessions (Auth admin API — application phase).
5. Retain `audit_events` and other historical rows with actor snapshots; never CASCADE-delete accountability data.
6. Auth user deletion only as break-glass after OD-09 checks.

### 7.3 Client offboarding / archive (OD-09 R1; portability business rule C)

Controlled handover — client data must remain portable:

1. **Export** authorised client content and documentation the client is entitled to receive.
2. **Revoke** portal memberships, invitations, and OkangGroup credentials to external CMS where appropriate (`credential_ref` rotation/revoke).
3. **Archive** client (`account_status = archived`); pause subscriptions with recorded reason.
4. Do **not** delete invoices, payments, or audit history required for lawful retention.
5. Set `cms_instances.status` to `retired` / `disconnected` as appropriate; public site handling is contractual—not an automatic billing kill-switch (§3.4.1).
6. **Lawful deletion / pseudonymisation** only per **OD-04** schedule once durations are approved; until then retain per holding rules in §3.9.1.
7. Monitoring: disable checks unless retention monitoring remains authorised.

---

## 8. Workflow state machines

Stored in `workflow_definitions.definition_json`. Defaults below are seeds, not immutable code.

### 8.1 Project lifecycle

States: `enquiry`, `proposal`, `approved`, `planning`, `development`, `testing`, `client_review`, `delivered`, `maintenance`, plus terminal `cancelled`.  
Transitions: forward, skip (permission-gated), return-for-correction, cancel.

### 8.2 Tasks

Example states: `backlog`, `assigned`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`.  
Hooks: assignment events → notifications; completion → verification; escalation transition requires reason.

### 8.3 Support tickets

`new` → `assigned` → `in_progress` → `awaiting_client` → `resolved` → `closed` (+ configurable).

### 8.4 Company CMS publish

`draft` → `in_review` → `scheduled` → `published` → `archived`; restore from revision creates new draft from snapshot.

### 8.5 Subscriptions

`trial` → `active` ↔ `past_due` → `paused` / `cancelled` / `expired`.  
Overdue rules per **OD-10 R1**: configurable grace + notifications; no automatic public website/CMS runtime shutdown (§3.4.1).

---

## 9. Free-tier capacity considerations

Design for Supabase Free plan limits (verify current numbers in Supabase docs before go-live; treat below as planning triggers, not guarantees):

| Resource | Design implication | Upgrade trigger (suggested) |
| --- | --- | --- |
| Database size | Avoid storing large binaries in Postgres; use Storage | DB approaching plan limit |
| Row volume (`health_checks`, `audit_events`, `delivery_attempts`) | Partition/archive strategy; sampling for probes | Sustained high insert rates |
| Auth MAU | Staff + client users only; no public auth for marketing site | Client portal expansion |
| Egress | CMS proxies should not mirror large media through platform | Heavy media proxying |
| Edge functions / cron | Minimal probes on Free; prefer external uptime later if needed | Frequent multi-site monitoring |
| Concurrent connections | Server-side pooling; avoid chatty client polling | Many admin users concurrent |

Monitoring probes: prefer low frequency + manual status for non-critical sites on Free tier.

---

## 10. Dependency-ordered migration plan (not applied)

Migrations are named for future implementation. **None are applied in this phase.**

**Security law:** Each migration that creates `public` tables also creates that tranche’s constraints (including composite tenant FKs), enables/forces RLS, attaches policies, and applies GRANTs/REVOKEs ([§3.10](#310-security-with-table-rule-migration-law)). Newly exposed tables must never be reachable by `anon`/`authenticated` without their intended policies.

| Migration | Depends on | Creates (tables/objects) | Security delivered in same migration |
| --- | --- | --- | --- |
| M0 | — | Extensions (`pgcrypto`, `citext`); `updated_at` trigger fn; schema `private`; `REVOKE` on `private` from `PUBLIC`/`anon`/`authenticated` | Private schema privilege baseline (§5.1.1) |
| M1 | M0 | `profiles`, `invitations`, `account_status_events`; profile linkage rules | RLS + policies for identity tables; deny hard-delete paths for ordinary roles |
| M2 | M1 | Permissions domain tables; seed system permissions/roles; **core `private.*` predicates** + EXECUTE grants | RLS on grant tables; helpers usable by later policies |
| M3 | M1–M2 | `departments`, `teams`, `job_titles`, `staff_memberships` | RLS for org tables |
| M4 | M2 | `clients`, `client_contacts`, `client_memberships`, `client_services`; `UNIQUE (client_id, id)` pattern begins | RLS + tenant isolation for client directory |
| M5 | M4 | `service_plans`, quotations, contracts, subscriptions, invoices, lines; composite tenant FKs | RLS for commercial tables (`finance.*`) |
| M6 | M4–M5 | Projects + children; `UNIQUE (client_id, id)` + composite FKs | RLS for project tables |
| M7 | M4 | CMS registry tables; composite FKs; credential_ref isolation constraints | RLS for registry; no secret plaintext; deny cross-client CMS links |
| M8 | M2 | Company CMS tables + `contact_enquiries` | RLS for company CMS; public insert path for enquiries carefully scoped |
| M9 | M3–M7 | Tasks, assignments, dependencies, approvals; composite FKs when client-linked | RLS for operations |
| M10 | M5 | Payments, credit notes, refunds, expenses, `fx_rates` | RLS for payments; immutable financial history rules |
| M11 | M4 | Tickets, messages, incidents; composite FKs | RLS + internal vs client_visible message split |
| M12 | M4–M7 | Monitoring tables | RLS; probes write via service role only |
| M13 | M1–M2 | Notifications stack | RLS (users see own notifications) |
| M14 | M1–M2 | `audit_events`, `access_reviews`, `security_incidents` with snapshot columns + SET NULL actor FKs; audit triggers on critical tables already present | RLS: append/insert via trigger or service role; SELECT limited; no UPDATE/DELETE for users |
| M15 | M2 | Configuration Studio tables; workflow/lookup seeds; validation constraints for OD-05 A | RLS for settings/flags/workflows |
| M16 | M0–M15 | **Hardening only:** security regression tests checklist artefacts (design), Storage bucket policy completion for buckets first used in app phase, advisor remediations, optional policy performance indexes — **not** the first enablement of table RLS | Confirms no table lacks RLS; does not introduce delayed first protection |

Mapping to V2.0 delivery phases:

| V2.0 phase | Migrations |
| --- | --- |
| 1 Database foundation & auth | M0–M2 (including private helpers + identity RLS) |
| 2 Roles, departments, staff | M2–M3 |
| 3 Owner dashboard | reads from secured tables (views later) |
| 4 Clients & projects | M4–M6 |
| 5 Company CMS | M8 |
| 6 Client CMS framework | M7 (+ V2.3 external AuthZ) |
| 7 Work allocation | M9 |
| 8 Finance & subscriptions | M5, M10 |
| 9 Support & monitoring | M11–M12 |
| 10 Reports, config, audit | M13–M15 |
| 11 CMS integration pilot | M7 data + external systems under §6.5 |
| 12 Security testing | M16 hardening + cross-tenant negative tests |

---

## 11. Acceptance criteria for a future implementation phase

Before any production migration apply:

1. Owner approved this V2.1 document (or a superseding revision).
2. MCP/read access confirmed on `prbgsnxpwyepdggdysnt` under `okanggroup@gmail.com`.
3. Open Decisions blocking that phase are resolved.
4. RLS policies written and tested with staff, client, and negative cross-tenant cases.
5. No automatic production deploy.

---

## 12. Explicit non-goals of V2.1

- Application UI / routing implementation
- Framework migration of the Vite marketing site
- Applying SQL to Supabase
- Live payment provider integration
- Automatic migration of Treasure House / NiiNai sensitive modules
- Use of project `vzgfvzzbgrlxvixejmdt`

---

## 13. Document control

| Version | Date | Notes |
| --- | --- | --- |
| 2.1.0 | 2026-10-11 | Initial complete 15-domain design contract for Owner review |
| 2.1.1 | 2026-10-11 | Added option sets for six Phase-1 critical decisions |
| 2.1.2 | 2026-10-11 | Recorded Owner choices OD-02/05/08/11/12/14 = A with OD-08/OD-14 safeguards |
| 2.1.3 | 2026-10-11 | Owner review amendments: RLS-per-migration; cross-client composite FKs; audit/actor survival; private privilege contract; external CMS AuthZ boundary (§6.5); Open Decisions register cleanup |
| 2.1.4 | 2026-10-11 | Final design refinements: private EXECUTE vs schema/Data API (§5.1.2); nullable/internal/immutable tenancy (§3.3.2); audit retention pending OD-04 (§3.9.1); §14.4 option catalogue |
| 2.1.5 | 2026-10-11 | Recorded business decisions (§14.5) with OD-03/07/17 amendments; OD-04 pending durations; business rules A/B/C (billing≠site offline; accounting distinctions; portable offboarding). Prior architecture decisions OD-02/05/08/11/12/14 A **preserved**. **Still not frozen.** |

### 13.1 V2.1.3 review amendment register

| Issue | Decision | Documented in |
| --- | --- | --- |
| 1 Security migrations too late | Integrate RLS/constraints with each table migration; M16 = hardening only | §3.10, §5.5, §10 |
| 2 Client isolation | Composite tenant FKs / `UNIQUE (client_id, id)` | §3.3.1 |
| 3 Audit vs account removal | Prefer deactivation; SET NULL + snapshots; no CASCADE destroying history | §3.2, §3.9, Domain 14 |
| 4 Private function privileges | Precise EXECUTE/REVOKE/`search_path` contract | §5.1, §5.1.1 |
| 5 External CMS AuthZ | Independent AuthZ, contractual limits, credential isolation | §6.5 → mandatory for V2.3 |
| 6 OD register duplication | Single status table | §14 |

### 13.2 V2.1.4 clarification register

| Clarification | Documented in |
| --- | --- |
| A Private schema USAGE vs EXECUTE vs Data API / RLS | §5.1.2 |
| B Nullable parents, internal-only rows, immutable `client_id` | §3.3.2 |
| C Audit snapshots vs OD-04 retention / erasure | §3.9.1 |
| Remaining 12 business decision options (catalogue) | §14.4 |
| Recorded business decisions + amendments + rules A/B/C | §14.5 |

**Git status note:** Published on dedicated review branch `docs/architecture-v2.1-review`. Must not merge to production/default until Owner freezes V2.1. Coding HOLD; no migrations.

**Recommended specification sequence (Owner):** Complete OD-04 retention schedule + final technical checks → consider V2.1 freeze → V2.2 Workflows & Permissions → V2.3 CMS Integration → V2.4 Security & Implementation Readiness → coding authorisation.

---

## 14. Open Decisions

Cursor must not invent answers for these. Owner (or designated officer) decides before the relevant migration phase.

**Decision register (single authoritative table):**

| ID | Topic | Status | Decision / remaining need |
| --- | --- | --- | --- |
| OD-01 | Payment provider | **Recorded R1** | Manual payments initially; provider fields reserved — §14.5 |
| OD-02 | Private schema for helpers | **Recorded A** | See §14.3; privilege model §5.1.1–§5.1.2 |
| OD-03 | Tax and rounding | **Recorded R1-amended** | Jurisdiction, effective dates, exemptions, invoice tax snapshots — §3.4, §14.5 |
| OD-04 | Retention | **R1-pending-durations** | Category schedules required; durations + legal review still open — §3.9.1, §14.5 |
| OD-05 | Permission catalogue mutability | **Recorded A** | See §14.3 — Configuration Studio limits |
| OD-06 | Internal tasks without client | **Recorded R1** | Internal tasks allowed; no fictional client — §3.3.2, §14.5 |
| OD-07 | Credit/refund approval thresholds | **Recorded R1-amended** | Configurable thresholds; requester ≠ approver — §14.5 |
| OD-08 | Owner access to client PII / sensitive CMS | **Recorded A** | See §14.3 — contractual non-override + §6.5 |
| OD-09 | Offboarding runbook | **Recorded R1** | Export → revoke → archive → lawful deletion — §7.3, §14.5 |
| OD-10 | Subscription dunning | **Recorded R1** | No automatic public site/CMS shutdown — §3.4.1, §14.5 |
| OD-11 | MFA enforcement set | **Recorded A** | See §14.3 — fail closed for privileged sessions |
| OD-12 | Invitation channel | **Recorded A** | See §14.3; sender domain OD-15 R1 |
| OD-13 | First CMS pilot | **Recorded R1** | OkangGroup CMS first, then one client CMS — §14.5 |
| OD-14 | Admin app hosting | **Recorded A** | See §14.3 — public site independence |
| OD-15 | Official email | **Recorded R1** | Verified `@okanggroup.com` when configured — §14.5 |
| OD-16 | Cross-border data | **Recorded R1** | London DB + UK/Ghana safeguards — §14.5 |
| OD-17 | Invoice numbering | **Recorded R1-amended** | Atomic unique numbers; voided numbers retained — §14.5 |
| OD-18 | Client-visible project fields | **Recorded R1** | Explicit allow-lists — §14.5 |

### 14.1 Six Phase-1 critical decisions — meaning, consequences, options

Owner has recorded option **A** for all six ([§14.3](#143-recorded-architecture-decisions-direction-accepted-schema-not-frozen)). The option tables remain for audit trail. The full database architecture is **not frozen** until the Owner completes schema review.

---

#### OD-02 — Private schema for RLS helper functions

**What it means:** Authorisation helpers such as `has_permission_on_client(...)` must run with elevated rights (`SECURITY DEFINER`) so they can read grant tables under RLS. Where those functions live determines whether the Supabase Data API can call them accidentally.

| Option | Description | Consequence |
| --- | --- | --- |
| **A (recommended)** | Create schema `private`; put all `SECURITY DEFINER` helpers there; revoke `USAGE` on `private` from `anon` / `authenticated`; grant execute only as needed to `authenticated` for specific functions | Strongest default; matches Supabase guidance; slightly more migration ceremony |
| **B** | Keep helpers in `public` but `REVOKE ALL` from `anon`/`authenticated` except explicit `GRANT EXECUTE` on named functions | Simpler schema map; higher risk of mis-grant if someone adds a new function carelessly |
| **C** | No DB helpers; enforce all authorisation only in application server code | Weaker defense-in-depth; RLS becomes thin; not recommended for multi-tenant client data |

**Affects:** M0–M2 foundation, every RLS policy in M1+.

---

#### OD-05 — Permission catalogue mutability (Configuration Studio)

**What it means:** Who may create or rename permission codes such as `finance.invoice.issue`. If Configuration Studio can invent powerful codes freely, an admin misconfiguration could bypass intended security.

| Option | Description | Consequence |
| --- | --- | --- |
| **A (recommended)** | Split catalogue: `is_system = true` permission codes are immutable except via migration / Owner-approved change control; Configuration Studio may only create non-sensitive operational codes (`allows_config_create = true`) and may assign existing codes to roles | Safe expansion without silent privilege invention |
| **B** | Entire catalogue frozen; only migrations add permissions; Studio only maps roles ↔ existing permissions | Maximum safety; slower product evolution; every new feature needs a migration |
| **C** | Studio may create any permission code including sensitive ones (Owner/platform_admin only) | Flexible; high blast radius if Owner account compromised |

**Affects:** M2 seed data, Domain 15 validation rules, V2.2 permission matrices.

---

#### OD-08 — Owner access to client PII / sensitive CMS modules

**What it means:** The Owner role administers OkangGroup’s platform. That is not the same as a contractual right to open every client’s pastoral records, courier PII, or internal finance ledgers inside an external CMS.

| Option | Description | Consequence |
| --- | --- | --- |
| **A (recommended / recorded)** | Owner has platform-wide grants for OkangGroup operational data (clients directory, contracts OkangGroup holds, support, registry). Access to `cms_modules.is_sensitive = true` / external CMS content requires a separate time-bounded `temporary_access` (or explicit cms scope grant) plus audit. **Safeguard:** an internal Owner grant must never override a client’s explicit contractual access restrictions | Matches V2.0 legal posture; supports client trust |
| **B** | Owner may open any connected CMS module including sensitive ones, always audited | Operationally convenient; higher contractual/regulatory risk; clients may reject |
| **C** | Owner cannot access any client CMS content; only designated staff with client scope | Safest for clients; Owner may be blocked from emergency support without delegation |

**Affects:** RLS for CMS proxy routes, `temporary_access`, V2.3 CMS integration, support emergencies.

---

#### OD-11 — MFA enforcement set

**What it means:** Which account kinds/roles cannot sign in without multi-factor authentication from day one.

| Option | Description | Consequence |
| --- | --- | --- |
| **A (recommended)** | MFA required for `owner`, `platform_admin`, `finance_user`, and any grant that includes `is_sensitive` permissions; MFA optional but encouraged for other staff; MFA optional for `client_user` initially | Strong protection where breach cost is highest; lower friction for client portal MVP |
| **B** | MFA required for all `staff` accounts from day one; client users optional | Stronger internal security; onboarding friction for every employee |
| **C** | MFA required for everyone including client portal users | Highest security; support burden; may block less technical client contacts |

**Affects:** `profiles.mfa_required`, Auth settings, invitation acceptance UX (implementation later).

---

#### OD-12 — Invitation channel

**What it means:** How staff and client users are brought into Supabase Auth before they have a password/session.

| Option | Description | Consequence |
| --- | --- | --- |
| **A (recommended)** | Email invitation with secure single-use link (token stored hashed in `invitations`); user sets password on accept; magic-link login allowed later as optional sign-in method | Clear audit trail; works for staff and clients; needs working sender domain (see OD-15) |
| **B** | Magic-link only (no password) for all users | Simpler UX; email dependency for every login; weaker for shared mailboxes |
| **C** | Owner/admin creates accounts and issues temporary passwords out-of-band | Faster early testing; poor security hygiene; not recommended beyond break-glass |

**Affects:** `invitations` table semantics, Auth providers, email infrastructure (OD-15).

---

#### OD-14 — Admin / platform app hosting vs existing Vite site

**What it means:** How secure routes (`/login`, `/dashboard`, `/admin/*`, `/cms/*`) coexist with the current static Vite marketing site on Vercel without forcing a full rewrite.

| Option | Description | Consequence |
| --- | --- | --- |
| **A (recommended / recorded)** | Keep marketing site as current Vite static app; add a second application (e.g. `apps/platform`) deployed to the same domain via Vercel rewrites for `/login`, `/dashboard`, `/admin`, `/cms` (and API routes), leaving `/` and marketing assets on the existing build. **Safeguard:** routing must keep the public website available even if the administration application is unavailable | Preserves branding and current site; clear security boundary; modest DevOps complexity |
| **B** | Single codebase migration: fold marketing pages into one full-stack framework app | One deploy unit; highest rewrite risk to the live site; conflicts with “do not replace Vite simply because it lacks a framework” |
| **C** | Platform on subdomain `platform.okanggroup.com` (or `admin.`); marketing stays on apex | Simplest isolation; cookie/SSO and brand URL trade-offs; clients type a different host |

**Affects:** No database tables directly; blocks application scaffolding choices after V2.4; must be decided before coding so M8 company CMS publish targets the correct runtime.

---

### 14.2 How to reply (Owner)

Architecture decisions: §14.3. Business decisions: §14.5. **OD-04** still needs a concrete retention schedule before freeze. Option catalogues in §14.1 / §14.4 remain for audit trail.

### 14.3 Recorded architecture decisions (preserved; schema not frozen)

| Field | Value |
| --- | --- |
| Decision record | `OD-02 A, OD-05 A, OD-08 A, OD-11 A, OD-12 A, OD-14 A` |
| Recorded date | 2026-10-11 |
| Effect | Establishes Phase-1 **direction** |
| V2.1.5 | **Preserved unchanged** |
| Freeze status | **Not frozen** |

| Decision | Option | Binding requirement |
| --- | --- | --- |
| **OD-02** | A | RLS helper functions reside in a private, non-exposed schema (`private`). |
| **OD-05** | A | System permission codes remain immutable. Configuration Studio may manage authorised role mappings and approved non-sensitive operation codes only. |
| **OD-08** | A | Owner access does not automatically extend to confidential client CMS data. Sensitive access requires an explicit, time-limited, audited grant. **Additional safeguard:** sensitive access must also respect the client’s contractual permissions; an internal Owner grant must never override a client’s explicit access restrictions. |
| **OD-11** | A | MFA is mandatory for Owner, Platform Admin, finance users, and anyone holding sensitive permissions. |
| **OD-12** | A | Email invitation followed by secure account setup. Magic links may be introduced later. |
| **OD-14** | A | Preserve the existing Vite public website. Introduce a separate secure administration application through same-domain routing. **Additional safeguard:** design routing so the public website continues working even if the administration application becomes unavailable. |

These decisions do **not** authorise SQL migrations, application code, or production deployment.

### 14.4 Business decision option catalogue (historical)

Options below were the V2.1.4 catalogue. **Authoritative recorded outcomes are in §14.5.** Tables retained for audit.

---

#### OD-01 — Payment provider

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Manual payment recording only (`payment_records.method` bank_transfer/cash/other); no live provider webhooks until a later Owner decision | Unblocks commercial tables; no PCI/provider compliance scope yet |
| **R2** | Select a provider now (e.g. Stripe) and design webhook tables in V2.1 | Faster later integration; forces compliance/settlement decisions immediately |
| **R3** | Manual forever for v1; revisit only after first paying CMS subscriptions | Same as R1 with explicit deferral horizon |

---

#### OD-03 — Tax and rounding

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Jurisdiction-specific tax rules via configurable tax profiles (UK VAT, Ghana rules as data); store tax lines on invoices; round money with half-up to `numeric(18,2)` unless a profile overrides | Flexible for UK/Ghana; needs tax profile maintenance |
| **R2** | Single default tax rate per client currency | Simpler; inaccurate for mixed jurisdictions |
| **R3** | Tax calculated externally; platform stores totals only | Least schema complexity; weak auditability of tax composition |

---

#### OD-04 — Data retention

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Define retention schedules by record category (security audit, access reviews, financial, support, telemetry, notifications); support legal hold; allow controlled purge/pseudonymisation of snapshot PII after expiry (§3.9.1) | Reconciles accountability with data minimisation; required before freeze of erasure behaviour |
| **R2** | Retain all audits indefinitely; purge only telemetry/notifications | Stronger forensics; higher personal-data and Free-tier storage risk |
| **R3** | Short global retention (e.g. 12 months) for all non-financial logs | Lower storage; may be too short for disputes/security |

*Owner must still supply concrete durations per category when approving R1 (or variant).*

---

#### OD-06 — Internal tasks without a client

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Allow tasks with `is_internal = true` and `client_id IS NULL`, under §3.3.2 checks (no client parent FKs) | Supports company ops work; aligns with internal tenancy rules |
| **R2** | Require a synthetic “OkangGroup Internal” client row for all tasks | Simpler FK uniformity; pollutes client directory |
| **R3** | Disallow client-less tasks | Forces every internal chore onto a fake client or blocks ops |

---

#### OD-07 — Refund / credit-note approvals

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Configurable approval thresholds in Configuration Studio (amount + currency + role); below threshold finance_user may issue; above requires Owner/platform_admin approval via `approvals` | Matches growing finance controls without hard-coding amounts |
| **R2** | Every credit/refund requires Owner approval | Safest early; operational bottleneck |
| **R3** | No dual control; finance_user may issue any credit/refund (audited only) | Fast; higher fraud/error risk |

---

#### OD-09 — Client / staff offboarding

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Controlled workflow: export package → revoke portal/CMS credentials → archive client → retain financial/audit history → deletion/pseudonymisation only per OD-04 schedule | Safe commercial/legal posture; pairs with §3.9 |
| **R2** | Soft-archive only; never delete client-linked rows | Simplest; storage growth; harder “right to erasure” responses |
| **R3** | Hard-delete client trees after export | Dangerous for invoices/audit; rejected by §3.9 for accountability tables |

---

#### OD-10 — Subscription overdue rules

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Configurable grace periods and notification cadence; mark `past_due`; **no automatic CMS shutdown/disconnect** in initial release (manual ops decision) | Avoids accidental client outages; still visible commercially |
| **R2** | Auto-suspend CMS access after grace period | Strong collections lever; requires V2.3 careful integration + support process |
| **R3** | Notifications only; status never auto-changes from `active` | Weakest dunning; status drift vs reality |

---

#### OD-13 — First CMS pilot

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Pilot 1: OkangGroup company CMS (M8). Pilot 2: one selected client CMS after V2.3 | Proves platform CMS + publish flow before external AuthZ complexity |
| **R2** | Pilot a client CMS first (e.g. Treasure House website CMS modules only) | Earlier client value; higher integration risk before company CMS exists |
| **R3** | Parallel pilots | Faster learning; stretched Free-tier and attention |

---

#### OD-15 — Official email

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Use verified `@okanggroup.com` sending identities for invitations and system notifications (SPF/DKIM/DMARC) | Aligns with OD-12 A; professional trust |
| **R2** | Temporary third-party sender (e.g. supplier domain) until DNS ready | Unblocks testing; brand mismatch |
| **R3** | Transactional email deferred; Owner creates users manually | Blocks OD-12 A at scale |

---

#### OD-16 — Cross-border data (UK / Ghana)

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Contractual + legal safeguards: record processing roles, lawful bases, and allowed CMS backend residency per client; platform DB remains London (`eu-west-2`) unless Owner later decides otherwise | Matches current Supabase region; forces paperwork before cross-border processing |
| **R2** | Allow per-client data residency choices in schema now | More flexible; complex before legal advice |
| **R3** | Ignore residency beyond London hosting | Fast; inadequate for multi-country clients |

---

#### OD-17 — Invoice numbering

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Unique, sequential, auditable invoice references (e.g. `OG-YYYY-#####` or per-currency sequences); no reuse; gaps explained only via voided numbers retained | Accountant-friendly; supports GBP/GHS |
| **R2** | UUID-only public references | Unique but poor human/ops UX |
| **R3** | Per-client separate sequences only | Clear per client; harder global uniqueness reporting |

---

#### OD-18 — Client-visible project fields

| Option | Description | Consequence |
| --- | --- | --- |
| **R1 (recommended)** | Explicit allow-list of client-visible fields/documents (`visibility` / field policies); defaults hide internal estimates, margins, staff notes | Matches portal isolation; configurable later in V2.2 |
| **R2** | Clients see all non-finance project fields by default | Transparent; may overshare staffing internals |
| **R3** | Clients see status + milestones only | Safest minimal portal; may frustrate clients |

### 14.5 Recorded business decisions (V2.1.5 — not a freeze)

| Field | Value |
| --- | --- |
| Decision record | `OD-01 R1, OD-03 R1-amended, OD-04 R1-pending-durations, OD-06 R1, OD-07 R1-amended, OD-09 R1, OD-10 R1, OD-13 R1, OD-15 R1, OD-16 R1, OD-17 R1-amended, OD-18 R1` |
| Recorded date | 2026-10-11 |
| Architecture decisions preserved | `OD-02 A, OD-05 A, OD-08 A, OD-11 A, OD-12 A, OD-14 A` |
| Freeze status | **Not frozen** |
| Coding | **HOLD** — no migrations, application code, or production deploy |

| Decision | Option | Binding requirement |
| --- | --- | --- |
| **OD-01** | R1 | Manual payment recording initially; retain schema ability to integrate providers later (`provider` / `provider_ref` reserved). |
| **OD-03** | R1-amended | Tax rules support **jurisdiction**, **effective dates**, **exemptions**, and **invoice-level tax snapshots**; rounding per §3.4. |
| **OD-04** | R1-pending-durations | Category-based retention schedules required before implementation; **durations and legal requirements remain open** — must be reviewed before freeze (§3.9.1). |
| **OD-06** | R1 | Internal company tasks allowed with `is_internal` and NULL `client_id`; no fictional client (§3.3.2). |
| **OD-07** | R1-amended | Configurable approval thresholds; **requester and approver must be different profiles** for credits/refunds. |
| **OD-09** | R1 | Controlled offboarding: export → revoke access → archive → retain lawful records → delete/pseudonymise only per OD-04 (§7.3). |
| **OD-10** | R1 | Configurable grace/notifications; **no automatic shutdown** of client public websites or CMS runtimes (§3.4.1). |
| **OD-13** | R1 | Pilot OkangGroup company CMS first, then one selected client CMS. |
| **OD-15** | R1 | Official verified `@okanggroup.com` sending identities once configured. |
| **OD-16** | R1 | Platform DB in London (`eu-west-2`) with documented UK/Ghana data-processing safeguards. |
| **OD-17** | R1-amended | Unique invoice numbers issued **atomically**; voided numbers and audit history preserved. |
| **OD-18** | R1 | Client-visible information via **explicit allow-lists**. |

#### 14.5.1 Additional business rules (recorded with V2.1.5)

| Rule | Statement |
| --- | --- |
| **A — Billing ≠ public availability** | Missed CMS subscription payment must not automatically take a client’s public website offline. Authorised decisions may suspend certain OkangGroup management services; public availability remains protected from automatic billing kill-switches (§3.4.1, OD-10 R1). |
| **B — Proper accounting** | Finance distinguishes amount invoiced, tax charged, amount paid, outstanding balance, credit notes, refunds, currency, and FX adjustments; and distinguishes OkangGroup income from client-belonging funds (§3.4). |
| **C — Portable client data** | Client exit supports controlled handover: export authorised content/docs, revoke OkangGroup access where appropriate, retain only records that must lawfully be preserved (§7.3, OD-09 R1, OD-04). |

These decisions do **not** authorise SQL migrations, application code, merge to `main`, or production deployment.

---

## 15. Owner review checklist

- [ ] Confirm Supabase MCP access as `okanggroup@gmail.com` to `prbgsnxpwyepdggdysnt`
- [x] V2.1.3 six security amendments retained
- [x] Phase-1 architecture decisions OD-02/05/08/11/12/14 = A preserved
- [x] Business decisions recorded in §14.5 (V2.1.5)
- [x] Business rules A/B/C recorded
- [ ] **OD-04:** establish retention schedule by category + legal review (still open)
- [ ] Final technical checks before freeze consideration
- [ ] Freeze V2.1 explicitly (not done)
- [ ] Authorise a future coding phase explicitly (not done)

---

**End of OkangGroup Database Architecture V2.1.5 — under review on branch `docs/architecture-v2.1-review`. NOT FROZEN. OD-04 pending durations. CODING HOLD remains in effect.**
