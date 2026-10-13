# OkangGroup — Staff Onboarding & Task Access Implementation Plan

| Field | Value |
| --- | --- |
| Status | **Stage 1 PASS / FROZEN (Owner accepted 2026-10-12). Stage 2 planning only.** |
| Date | 2026-10-12 |
| Target project | `prbgsnxpwyepdggdysnt` only |
| Design baseline | V2.1.9 R1 + existing tables (profiles, invitations, roles, grants, scopes, staff_memberships) |
| Public website | HOLD |
| Owner / MFA | Must remain unchanged and enforced |

---

## 1. Goal

Replace “record invitation only” with a complete **Owner-driven staff lifecycle**:

Create staff → invite (email) → password + MFA → role + scope grants → assign tasks → staff works with least privilege → Owner can suspend/offboard without deleting history.

**Employment coverage (recommended: YES):** permanent employees, contractors, and freelancers use the same staff identity path (`profiles.account_kind = 'staff'`), distinguished by an employment-type attribute (new column or membership metadata). Client portal users remain `client_user` (out of this increment).

---

## 2. Stages

### Stage 1 — Staff Onboarding and Permissions (first build)

| Capability | Outcome |
| --- | --- |
| Create Staff UI | Form: name, email, phone, job title, department, employment type, status, initial role + scopes |
| Provision Auth | Server-side invite (no Owner manual Dashboard user create) |
| Invitation email | Magic/invite link to set password; redirect to `/admin/` URLs already configured |
| Activate + MFA | Profile `invited` → `active`; MFA required for privileged roles; optional MFA for others per Owner flag |
| Permission management UI | Owner/admin with `platform.roles.manage` grants/revokes roles and **client/project scopes** |
| No self-elevation | Users cannot insert/update their own `role_grants`; Owner grants immutable except by privileged admins |
| Offboard/suspend | Status + revoke grants; Auth disable/ban; history retained |

### Stage 2 — Staff Workspace (after Stage 1 UAT)

| Capability | Outcome |
| --- | --- |
| My Work | Dashboard/filter: assigned tasks, deadlines, projects in scope |
| Task progress | Assignees can update status/comments on **assigned** tasks without platform-wide `tasks.manage` |
| Project membership | Optional explicit project assignment UI (reuse scopes or lightweight membership) |
| Notifications | Minimal in-app or email later; not blocking Stage 1 |

**Later (not this plan):** AI Work Inbox, client file packages, client CMS via task (R3).

---

## 3. Reuse existing database (prefer extend, don’t replace)

| Existing | Use |
| --- | --- |
| `profiles` | Staff identity; phone already exists; add employment_type if approved |
| `invitations` | Pending invites; store `role_ids` + planned scope payload (JSONB or child table) |
| `roles` / `permissions` / `role_permissions` | Configurable matrices (Owner, platform_admin, operations_manager, staff, cms_editor, …) |
| `access_scopes` | `platform` / `client` / `project` — **required for least privilege** |
| `role_grants` | Effective access |
| `staff_memberships`, `departments`, `job_titles` | Org placement |
| `task_assignments` | Assignment link |
| `private.has_permission*` | Keep as enforcement source of truth |

### Minimal schema deltas (only if Stage 1 authorised)

1. `profiles.employment_type` — `employee` \| `contractor` \| `freelancer` (nullable until set).  
2. Optional `invitations.invite_payload jsonb` — intended roles + client/project scope ids for accept-time grant.  
3. RLS tweak: assignees may `UPDATE` limited task fields when actively assigned (without full `tasks.manage`).  
4. Edge Function (or Auth Admin API via service role, server-only): `invite-staff` — creates Auth invite / generates link, writes invitation, never exposed to browser as service role.

No finance/M5/M7 tables. No public site changes.

---

## 4. Target UX (admin)

### 4.1 Create Staff (replaces invitation-only form)

Fields: full name*, work email*, phone, job title, department, employment type*, account status*, access package (role + client/project scopes)*.

Actions: **Create & send invite** | Save draft invite (no send) | Cancel.

### 4.2 Staff directory / detail

List + search; open detail to edit org fields, resend invite, suspend/offboard, manage grants (roles + scopes).  
Owner row: MFA locked (existing M19); cannot clear privileged MFA.

### 4.3 Permissions model (configurable, not job-title-hardcoded)

Job title is descriptive. Access comes from **role + scope grants**.

Example packages (templates Owner can apply, then edit):

| Package | Typical grants |
| --- | --- |
| Developer (scoped) | `dashboard.read`, `tasks.read`, assignee update; `clients.read`/`projects.read` on **selected** client/project scopes only |
| Project Manager (scoped) | Above + `tasks.assign`, `tasks.manage`, `projects.manage` on selected scopes |
| Owner | Existing full platform grant (unchanged) |

### 4.4 Task connection (already partly built)

Keep assignee dropdown; Stage 2 ensures assignee workspace + limited update rights. Stage 1 must ensure granted staff appear in picker and cannot see out-of-scope clients.

---

## 5. Auth & invite flow (no manual Supabase for day-to-day)

```text
Owner completes Create Staff
  → Edge Function (service role): Auth inviteUserByEmail / generateLink
  → invitations row pending + intended grants stored
  → Email to staff (Supabase Auth email or approved sender)
Staff opens link → sets password → lands on /admin/
  → profile active (trigger/accept handler)
  → apply intended role_grants + scopes (SECURITY DEFINER accept function)
  → MFA enrol if mfa_required
  → Staff workspace (Stage 2) / limited dashboard
```

**Rate limits:** use invite carefully; avoid dashboard password-recovery spam patterns.

**Microsoft licences:** not required; use Supabase Auth + OkangGroup email domain when OD-15 ready.

---

## 6. Security requirements (non-negotiable)

1. Owner account and existing 21 permissions remain.  
2. Privileged MFA hard-gate (M19) unchanged.  
3. No self-grant of `role_grants` / `platform.roles.manage`.  
4. Client/project isolation enforced in **Postgres RLS**, not only UI hiding.  
5. Service role only in Edge Functions / server scripts — never in admin SPA.  
6. Suspend/offboard revokes grants and blocks login; retains audit/task history.  
7. Public website and production deploy remain HOLD unless separately approved.

---

## 7. Delivery slices (after Owner authorises implementation)

| Slice | Deliverable | Exit test |
| --- | --- | --- |
| S1a | Create Staff UI + invitation persistence with intended grants | Owner creates David record without Dashboard |
| S1b | Edge Function invite + email + accept/activate | David sets password, lands in admin |
| S1c | Grants UI (role + client/project scopes) | David cannot see other clients |
| S1d | Suspend/resend/offboard | Access removed immediately |
| S2a | My Work + assignee task updates | David updates only assigned tasks |
| S2b | Dashboard scoped widgets | Counts respect RLS |

Duplicate UAT tasks: resolve manually during UAT cleanup (Owner decides keep/archive); not part of schema plan.

---

## 8. Explicitly out of scope

- AI Work Inbox / AI agents  
- Client file library / work packages (separate increment)  
- Client CMS delegated access (R3)  
- Finance / M5–M7  
- Production deploy / public site publish  

---

## 9. Decisions for Owner before coding

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Cover employees + contractors + freelancers? | **Yes** — same staff path, `employment_type` field |
| D2 | Authorise Stage 1 implementation after plan review? | Await Owner **APPROVED — implement Stage 1** |
| D3 | Invite email via Supabase Auth vs custom SMTP (`@okanggroup.com`)? | Start with Supabase Auth invite; migrate sender when OD-15 ready |
| D4 | Default MFA for all staff vs privileged only? | Privileged required; others Owner-selectable (default on for production readiness) |

---

## 10. Current verdict

Plan ready for Owner review. **No code or database changes have been made under this document.**

**End of plan**
