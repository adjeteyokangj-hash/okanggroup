# OkangGroup — Visual Client CMS Direction (LOCKED)

| Field | Value |
| --- | --- |
| Status | **LOCKED — Stage 1 on development** |
| Date | 2026-10-12 |
| Production | **HOLD** |
| Stage 2 permission overlays | HOLD |

## Product objective

Build a **visual website management platform** so authorised OkangGroup staff (and later clients) can work on client websites **without source-code access**.

The editor must adapt to the **client’s existing website layout and branding** — not force a generic OkangGroup document template onto every client.

## Access model (unchanged principles)

| Capability | Owner | Authorised staff | Client |
| --- | --- | --- | --- |
| View website | ✅ | ✅ | ✅ |
| Edit authorised content | ✅ | ✅ | Configurable |
| Upload images | ✅ | Configurable | Configurable |
| Change page layouts | ✅ | Configurable | Configurable |
| Submit changes | ✅ | ✅ | Configurable |
| Approve staff work | ✅ | ❌ | Configurable |
| Approve client-sensitive changes | Configurable | ❌ | ✅ |
| Publish | ✅ | Only if authorised | Configurable |
| Manage permissions | ✅ | ❌ | Limited client admins |

Clients must never see OkangGroup operations, other clients, or confidential project data.

Reuse: CMS registry, grants, tasks, notifications, draft → review → publish workflow.

## Website integration categories

| Category | Approach |
| --- | --- |
| **A. OkangGroup-built** | Native visual editor + platform content store + deployment when authorised |
| **B. WordPress** | Secure REST/API adapter; capabilities limited to what the site exposes |
| **C. Other** | Dedicated adapters; no promise of full visual editing if APIs lack it |

## Delivery stages

1. **Visual Editor Foundation** (this stage) — preview, editable sections, images, responsive preview, drafts  
2. **Client Website Connections** — WordPress / external adapters  
3. **Review and Publishing** — wire approvals to real publication + audit/rollback where supported  
4. **Client Portal** — controlled visual editing and approval for client users  

## Workflow

**Edit → Save Draft → Preview → Submit → Management Review → Client Approval (if required) → Publish**

## Non-goals (Stage 1)

- Replacing live external sites with a single shared design system  
- Exposing DB credentials, hosting admin, or unrelated app modules  
- Production public deploy without Owner authorisation  
