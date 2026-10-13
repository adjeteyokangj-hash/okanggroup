# OkangGroup — Staff Work Management UAT (W1–W4)

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Status | **DEV COMPLETE — browser UAT recommended; production HOLD** |
| Migrations | M27 task/project files + Storage; M28 client CMS registry |
| Owner permissions | **21** (unchanged — no new catalogue codes) |
| MFA | Preserved |
| Stage 2 | HOLD |
| Production | HOLD |

---

## Delivered

### W1 — Task Files
- Private bucket `task-files` (25 MB, MIME allow-list)
- Table `task_attachments` (`instruction` | `work_upload`) with RLS
- Task detail: **Task Files & Attachments** (Owner upload instructions; staff/work uploads; download; staff cannot remove Owner instructions)

### W2 — Project Files
- Private bucket `project-files`
- Table `project_documents` with client/project composite FK + RLS
- Project detail: **Project Files** panel

### W3 — Client CMS registry
- `cms_instances` linked to client (+ optional project)
- Separate from Company CMS (`/cms`)
- `credential_ref` label only — not hosting/DB secrets
- Optional `tasks.cms_instance_id` for task → CMS link

### W4 — Client CMS access
- `cms_instance_grants` with view / edit / submit / publish flags
- Project **Website CMS** panel: register instance, grant/revoke staff
- Staff nav: **My Client CMS** (only granted instances)

---

## Security checks (automated smoke)

| Check | Result |
| --- | --- |
| Owner permission count 21 | PASS |
| Owner MFA required | PASS |
| Daniel cannot soft-delete Owner instruction metadata | PASS |
| Daniel can insert work_upload metadata | PASS |
| CMS instance + Daniel grant (edit/submit, no publish) | PASS |
| Company CMS unchanged | PASS (no schema touch) |

---

## Owner browser checklist

1. Open an assigned task → upload an instruction PDF → confirm Daniel can download.  
2. As Daniel → upload work file → confirm Owner sees it; Daniel cannot remove Owner file.  
3. Open project → **Project Files** → upload a brief.  
4. Project → **Website CMS** → register Test Client CMS → grant Daniel view/edit/submit (not publish).  
5. As Daniel → **My Client CMS** shows only that instance.  
6. Confirm Company CMS still behaves as before for Owner; Daniel still lacks edit/publish there.

---

## Holds

Production deployment and Stage 2 overlays remain **HOLD**.

**End of report**
