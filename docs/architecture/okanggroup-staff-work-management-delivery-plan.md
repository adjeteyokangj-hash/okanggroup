# OkangGroup — Staff Work Management Delivery Plan

**Task Files + Project Files + Client CMS Access**

| Field | Value |
| --- | --- |
| Status | **IMPLEMENTED on dev (M27/M28) — see UAT report; production HOLD** |
| UAT | `okanggroup-staff-work-management-uat.md` |
| Date | 2026-10-12 |
| Priority | HIGH — complete missing staff work capability |
| Baseline | Stage 1 PASS/FROZEN; Stage 1.1 task-execute security **preserved** |
| Stage 2 overlays | **HOLD** |
| Production / public website | **HOLD** |
| Gate to implement | Exact Owner phrase: `APPROVED — implement staff work management (files + client CMS)` |

---

## 1. Problem (confirmed)

| Area | Status |
| --- | --- |
| Staff progress reporting (status, notes, history, Owner dashboard) | **Working** — do not redesign |
| Task execute vs manage + approval workflow (M25/M26) | **Working** — preserve |
| Owner → staff file handoff on tasks | **Missing** |
| Project-level documents | **Missing** |
| Client-specific CMS (separate from Company CMS) | **Missing** |

Daniel can report “Waiting for the files”; the platform cannot yet deliver those files securely.

---

## 2. What already exists (reuse — do not rebuild)

| Asset | Reuse as |
| --- | --- |
| `tasks.manage` / `tasks.execute` + field trigger + submit/decide RPCs | AuthZ for who uploads instructions vs who uploads work |
| `task_progress_notes` + TaskDetail “Your Progress” / history | Keep; add sibling **Task Files** sections |
| Client/project RLS (`has_permission_on_client`) | File metadata RLS and Storage path isolation |
| `cms_media_assets` column shape (`storage_path`, mime, created_by) | Pattern for attachment metadata |
| Company CMS (`company_cms.*`, `/cms`) | **Leave as OkangGroup website only** |
| `access_scopes.scope_type = 'cms_instance'` (column present) | Wire when client CMS registry ships |
| V2.1 `project_documents` / Domain 6 CMS registry design | Spec source for schema |

**Not present today:** Storage buckets, upload UI, `task_evidence` / `project_documents` tables, `cms_instances` registry, client CMS permissions/UI.

---

## 3. Target outcomes (one workstream)

### A. Task Files & Attachments

On task detail (`Design OkangGroup Test Homepage` and all tasks):

| Capability | Owner / `tasks.manage` | Assigned staff (`tasks.execute`) |
| --- | --- | --- |
| Upload instruction / reference files | ✅ | ❌ |
| Replace / remove **own** instruction files | ✅ | ❌ |
| View / download authorised files | ✅ | ✅ |
| Upload completed work / evidence | ✅ | ✅ |
| Delete Owner-supplied originals | ✅ (manage) | ❌ |
| Submit for review | — | ✅ (existing) |

Formats (MVP): PDF, Word, Excel, common images, ZIP — MIME allow-list + size cap.

Every object records: uploader, timestamp, task_id, client_id (when set), role (`instruction` | `work_upload`), version chain.

### B. Project Files

On project detail (`OKG Website Development UAT`):

- Project briefs, specs, designs, shared working docs, deliverables  
- Upload **without** creating a task  
- Visibility = existing client/project grants only (not “all staff”)

### C. Client CMS (separate from Company CMS)

| System | Purpose |
| --- | --- |
| Company CMS (`/cms`) | OkangGroup’s own site — **unchanged** |
| Client CMS registry | Link/create a per-client CMS instance; assign staff; view/edit/submit/approve/publish per grant |

Navigation: **Client → Project → Website CMS** (and task link when `cms_instance` bound).

Staff see only instances explicitly granted. Daniel must not gain Company CMS edit/publish or other clients’ CMS.

**Architecture constraint (agreed earlier):** Client site content lives in the **client’s** CMS/hosting. OkangGroup holds a **registry + credentials ref + permission grants + activity**, with adapters per technology — not one shared content schema for every client.

### D. Staff task workspace (integrate, don’t invent a new app)

| Section | Source |
| --- | --- |
| Task instructions | Existing description (read-only for execute) |
| Task Files | **New** |
| Your Progress | Existing M26 |
| Work Uploads | **New** (subset of Task Files) |
| Progress History | Existing |
| Client CMS | Link when assigned |
| Submit for Review | Existing |

---

## 4. Technical design (narrow)

### 4.1 Storage foundation (shared)

| Bucket (proposed) | Path convention | First used by |
| --- | --- | --- |
| `task-files` | `{client_id|internal}/{task_id}/{role}/{object_id}/{filename}` | Slice W1 |
| `project-files` | `{client_id}/{project_id}/{object_id}/{filename}` | Slice W2 |

Policies: authenticated read/write **only** when SQL metadata RLS allows the same user; no public buckets. Policies ship in the **same** migration that first writes objects.

### 4.2 Metadata tables (MVP)

**`task_attachments`**

- `id`, `task_id`, `client_id` (nullable for internal), `role` (`instruction` | `work_upload`), `file_name`, `mime_type`, `byte_size`, `storage_path`, `version_of` (nullable), `uploaded_by`, `created_at`, `deleted_at` (soft delete for manage only)

RLS:

- SELECT if can read task (existing task select rules)  
- INSERT instruction if `tasks.manage` on scope  
- INSERT work_upload if execute assignee **or** manage  
- UPDATE/DELETE instruction: manage only; work_upload: uploader or manage (staff cannot delete Owner instruction rows)

**`project_documents`** (align V2.1)

- `id`, `client_id`, `project_id`, `title`, `doc_type`, `storage_path`, `mime_type`, `byte_size`, `visibility` (`internal` | `staff` MVP), `uploaded_by`, `created_at`, `deleted_at`

RLS: `has_permission_on_client` for `projects.read` / `projects.manage` (manage for write).

### 4.3 Permissions (minimal adds — Owner stays at 21 unless Owner accepts +1/+2)

Prefer **reuse** existing codes first:

| Action | Permission |
| --- | --- |
| Task instruction upload | `tasks.manage` |
| Task work upload | `tasks.execute` (assignee) |
| Project file upload | `projects.manage` |
| Project file read | `projects.read` (in scope) |

**Client CMS (later slice)** — new codes only when registry ships, e.g.:

- `client_cms.read` / `client_cms.edit` / `client_cms.submit` / `client_cms.publish`  
- Granted on `cms_instance` scope (not platform Company CMS)

**Owner catalogue:** If new permissions are inserted, **do not** auto-grant all to Owner via blanket CROSS JOIN unless Owner accepts a new count. Default recommendation: grant client_cms.* to Owner role explicitly and document new count; or keep Owner manage via platform admin path without inflating until approved.

### 4.4 Client CMS — phased so we don’t block files

| Phase | Deliverable |
| --- | --- |
| **C0 (with files)** | Optional `tasks.cms_instance_id` deferred until registry exists; task UI shows “CMS link” placeholder only if instance exists |
| **C1 Registry** | `cms_instances`, `cms_modules`, `cms_connections` (credential_ref only); Owner create/connect from Client/Project |
| **C2 Grants** | Role grants on `cms_instance` scope; staff workspace link |
| **C3 Adapter MVP** | One adapter (e.g. “external URL + notes” or WordPress stub) — **not** assuming all clients share one stack |
| **C4** | Activity/history + approve/publish workflow hooks |

Files (W1–W2) must not wait on C3–C4.

---

## 5. Delivery slices (after approval)

| Slice | Scope | Exit criteria |
| --- | --- | --- |
| **W0** | Inventory re-check; bucket naming; MIME/size policy doc | Owner confirms sizes/formats |
| **W1** | Storage `task-files` + `task_attachments` + TaskDetail sections + signed download | Owner upload → Daniel download; Daniel work upload; Daniel cannot delete Owner files; cross-client deny |
| **W2** | Storage `project-files` + `project_documents` + ProjectDetail **Project Files** | Owner upload on project; Daniel with project scope sees; unscoped staff denied |
| **W3** | Wire “Work Uploads” into Submit for Review (list attachments on review) | Owner sees files when deciding |
| **C1–C2** | Client CMS registry + staff grant + navigation | Daniel sees only assigned instance; Company CMS unchanged |
| **C3** | First adapter (explicit tech choice) | Smoke connect for Test Client |
| **UAT** | Full staff day-in-the-life pack | Report for Owner accept |

**Out of scope for this workstream:** Stage 2 overlays, finance, public website deploy, replacing Company CMS, multi-adapter marketplace.

---

## 6. Security requirements (non-negotiable)

1. Owner **21** permissions + mandatory MFA preserved unless Owner explicitly accepts catalogue growth for client_cms.*  
2. Stage 1.1 execute/manage field locks unchanged  
3. Staff cannot edit task instructions / priority / deadline / assignment  
4. File access enforced in **Postgres RLS + Storage policies** (not UI alone)  
5. Path embeds `client_id` — no cross-client reads  
6. Soft-delete / history for attachments; no silent overwrite of Owner instruction without version row  
7. Company CMS permissions stay separate from Client CMS  
8. No production deploy under this plan  

---

## 7. Acceptance tests (summary)

| ID | Test | Expected |
| --- | --- | --- |
| F1 | Owner uploads PDF to task | Stored; visible to assignee |
| F2 | Daniel downloads instruction file | Allowed |
| F3 | Daniel deletes Owner instruction | **Denied** |
| F4 | Daniel uploads work ZIP | Allowed; listed under Work Uploads |
| F5 | Daniel uploads to other-client task | **Denied** |
| F6 | Owner uploads project brief | Visible to project-scoped staff only |
| F7 | Unscoped staff lists project files | **0 rows** |
| F8 | Submit for review includes work uploads | Owner sees them on decide |
| F9 | Company CMS still Owner-only edit for Daniel | Daniel still `company_cms.read` only (no edit/publish) |
| F10 | Client CMS grant to Daniel for Test Client only | Sees that instance; not others |
| F11 | Owner perms + MFA | Intact |

---

## 8. Dependencies & risks

| Risk | Mitigation |
| --- | --- |
| Client websites use different stacks | Registry + adapters; C3 picks one explicit first adapter |
| Large binaries | Size caps; signed URLs; no public buckets |
| Scope creep into full CMS product | Cap C1–C3; adapters after files ship |
| Owner permission count | Prefer reuse `tasks.*` / `projects.*` for files; ask before adding client_cms.* |

---

## 9. Decisions for Owner

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Approve this consolidated plan as next priority (ahead of Stage 2)? | **Yes** |
| D2 | Ship **W1 Task Files** before Client CMS registry? | **Yes** — unblocks Daniel immediately |
| D3 | Max upload size (e.g. 25 MB)? | **25 MB** MVP |
| D4 | First Client CMS adapter after registry? | **External managed link** MVP, then WordPress/custom later |
| D5 | Allow Owner permission count to grow for `client_cms.*`? | Ask at C1; files slices need **no** new Owner codes |
| D6 | Authorise implementation? | Await: `APPROVED — implement staff work management (files + client CMS)` |

---

## 10. Verdict

Progress reporting is done. The blocking gap is **file handoff + project documents**, then **client CMS access** without contaminating Company CMS.

This plan reuses Stage 1.1 security and existing task/project UI; adds Storage + metadata; phases Client CMS so files are not blocked by adapter work.

**No schema, Storage, permission, or application changes have been made under this document.**

**End of plan**
