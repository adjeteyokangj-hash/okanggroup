# OkangGroup — Business Operations End-to-End UAT

| Field | Value |
| --- | --- |
| Date | 2026-10-12 |
| Scope | BO-1 → BO-7 consolidated lifecycle + security |
| Environment | Supabase `prbgsnxpwyepdggdysnt` (development) |
| Verdict | **PASS (development)** |
| Production website | **HOLD — not deployed** |
| CMS / Treasure House Shadow | **Preserved** (no schema teardown; CMS tables intact) |

---

## Verdict

Business Operations end-to-end UAT **PASS** on development for the synthetic lifecycle below. Defects found mid-UAT were fixed in **m50 / m50b / m51** without expanding product scope. Public production website was **not** deployed.

---

## Synthetic actors & records

| Role | Identity | Notes |
| --- | --- | --- |
| Owner | `a7bce15a-566a-43df-aa93-4f23da8bb35f` | Full finance + ops |
| Staff (Daniel) | `928646aa-759b-42b5-a346-19aa71ead822` | No finance permissions |
| Client A portal | `c1111111-1111-4111-8111-111111111111` | Member of synthetic UAT client |
| Client B portal | `c2222222-2222-4222-8222-222222222222` | Isolation control client |

| Entity | ID / code | Final status |
| --- | --- | --- |
| Enquiry | `8ab916ba-7f78-4363-a882-728cd70472e1` | converted |
| Client | `c3a03d35-b094-4358-a099-61c8d31398a3` | prospect (converted) |
| Quotation | `4d7ac3da-b7a0-4aba-b02a-279bc2d4f230` | accepted |
| Contract | `d1b421cc-901a-4107-904a-426fdacd4f58` | active |
| Project | `7d516812-0b8e-46ad-be17-c3116df679e4` (`OKG-PR-000002`) | **closed** |
| Invoice | `24e08f3f-30c7-427a-b6c2-210804cb44ba` (`OKG-INV-000001`) | **paid** |
| Payments | £500 + £700 bank transfer | recorded |
| Expense | £50 on project | recorded (budget £1300) |
| Documents | Spec v1 → Spec v2 | v1 **superseded**, v2 **approved** |

Lifecycle exercised:

**Enquiry → Client → Quotation → Contract → Project → Tasks → Deliverables → Approval → Invoice → Payment → Handover → Closure**

---

## Happy-path matrix

| ID | Check | Result | Evidence |
| --- | --- | --- | --- |
| UAT-01 | Create / convert enquiry | **PASS** | Enquiry `converted`; client created |
| UAT-02 | Client CRM record | **PASS** | Synthetic client present |
| UAT-03 | Quotation accepted | **PASS** | Quote status `accepted` |
| UAT-04 | Contract active | **PASS** | Contract status `active` |
| UAT-05 | Project created + staff assign | **PASS** | Project `OKG-PR-000002` |
| UAT-06 | Tasks / deliverables | **PASS** | Delivery records under project |
| UAT-07 | Client-visible document + version | **PASS** | Spec v1 / v2 chain (`version_of`) |
| UAT-08 | Client approve / reject + audit | **PASS** | `approvals` rows = 2 for `project_document` |
| UAT-09 | Invoice issue with tax snapshot | **PASS** | subtotal 1000 + tax 200 = total 1200; snapshot `GB_STD` @ 20% |
| UAT-10 | Partial then full payment | **PASS** | £500 + £700 → `paid`, outstanding 0 |
| UAT-11 | Expense vs budget | **PASS** | expense 50 / budget 1300 / remaining 1250 |
| UAT-12 | Handover checklist complete | **PASS** | `[credentials, documentation, training, signoff]` |
| UAT-13 | Project closed | **PASS** | status `closed` |

---

## Security & isolation (SEC)

| ID | Check | Result | Detail |
| --- | --- | --- | --- |
| SEC-01 | Staff lacks finance permission | **PASS** | `invoices.read=false` |
| SEC-02 | Staff payment RPC denied | **PASS** | Not authorised to record payments |
| SEC-03 | Staff issue invoice denied | **PASS** | Not authorised to issue invoices |
| SEC-04 | Staff finance-on-client false | **PASS** | no finance |
| SEC-05–08 | Membership matrix A/B | **PASS** | Correct memberships only |
| SEC-09 | Client B cannot read A invoices | **PASS** | rows=0 |
| SEC-10 | Client B cannot read A projects | **PASS** | rows=0 |
| SEC-11 | Client B cannot read A documents | **PASS** | rows=0 |
| SEC-12 | Client A can read own invoice | **PASS** | rows=1 |
| SEC-13 | Client A can read own projects | **PASS** | rows=1 |
| SEC-14 | Client A cannot read Client B | **PASS** | rows=0 |
| SEC-15 | Staff cannot SELECT invoices | **PASS** | rows=0 (RLS) |
| SEC-16 | Staff cannot SELECT quotations | **PASS** | rows=0 (RLS) |

Actor simulation used `public.uat_set_actor` (m50b) for SECURITY DEFINER RPC checks under JWT `auth.uid()`.

---

## Finance, negatives, dashboard (DASH / FIN / NEG / CLOSE / DOC)

| ID | Check | Result | Detail |
| --- | --- | --- | --- |
| DASH-01 | Dashboard invoiced/paid totals | **PASS** | invoiced=1200 paid=1200 (non-void) |
| DASH-02 | Expense vs budget | **PASS** | 50 / 1300 |
| DASH-03 | Outstanding invoice count | **PASS** | 0 |
| DASH-04 | Awaiting approval after supersede | **PASS** | pending=0 |
| FIN-01 | Tax snapshot preserved | **PASS** | rate 0.2, tax_amount 200, `GB_STD` |
| FIN-02 | Tax totals coherent | **PASS** | 1000+200=1200 paid |
| CLOSE-01 | Project closed | **PASS** | status=closed |
| CLOSE-02 | Handover gate satisfied | **PASS** | mandatory items present |
| DOC-01 | Approval audit history | **PASS** | approvals=2 |
| NEG-01 | Duplicate enquiry convert | **PASS** | Enquiry already converted |
| NEG-02 | Pay already-paid invoice | **PASS** | Payments only against issued |
| NEG-03 | Zero payment | **PASS** | Payment amount must be positive |
| NEG-04 | Negative payment | **PASS** | Payment amount must be positive |
| NEG-05 | Overpay blocked | **PASS** | Payment amount (51) exceeds outstanding (50.00) |

Owner dashboard figures are derived from live `invoices`, `expenses`, and `project_documents` queries (not placeholders) — reconciled above against the synthetic records.

---

## Defects found and fixed (no scope expansion)

| Defect | Fix | Migration |
| --- | --- | --- |
| Payments could exceed outstanding balance | Guard in `record_invoice_payment` | **m50** |
| Projects could close without mandatory handover | BEFORE trigger on `projects.status` | **m50** |
| `uat_set_actor` not executable as authenticated for RPC UAT | Public wrapper | **m50b** |
| Older document versions stayed `pending` after a newer version existed, inflating “Awaiting client approval” | `superseded` status + insert trigger + backfill | **m51** |

Local migration files:

- `supabase/migrations/20261012193102_m50_bo_uat_guards_and_harness.sql`
- `supabase/migrations/20261012193307_m50b_uat_set_actor_public.sql` (applied remotely as `m50b_uat_set_actor_public`)
- `supabase/migrations/20261012194000_m51_bo_uat_document_version_supersede.sql`

---

## Owner acceptance criteria mapping

| Owner requirement | Result |
| --- | --- |
| 1. Staff cannot access financial information without permission | **PASS** (SEC-01–04, SEC-15–16) |
| 2. Clients cannot view another client’s projects / invoices / documents | **PASS** (SEC-09–14) |
| 3. Payments cannot exceed outstanding balance | **PASS** (NEG-05; m50) |
| 4. Invoice totals, tax and currency calculations correct | **PASS** (FIN-01–02; GBP snapshot) |
| 5. Document approvals preserve version + audit history | **PASS** (v1 superseded / v2 approved; DOC-01) |
| 6. Projects cannot close with incomplete mandatory handover | **PASS** (m50 gate; CLOSE-01–02) |
| 7. Owner dashboard reflects actual business records | **PASS** (DASH-01–04) |

---

## Remaining caveats (non-blocking)

1. **Browser UAT** of admin/portal UI still recommended for Owner walkthrough (this report is RPC/RLS/SQL evidence-backed).
2. **Client SELECT of `notes_internal`** may still be possible at row level depending on column projection; UI should continue to omit internal notes for portal users.
3. **Document version upload UI** must set `version_of` for the m51 supersede trigger to fire on new uploads; `uploadProjectDocument` now accepts optional `versionOf` / `versionNo`.
4. **Invoice tax** correctness depends on stored `tax_total` + `tax_snapshot_json` at create/issue time (issue RPC does not recompute tax from profiles).
5. Ephemeral UAT result tables `bo_uat_sec_results` / `bo_uat_misc_results` may remain in the development database for evidence replay.

---

## Explicit holds

| Item | Status |
| --- | --- |
| Public production website deploy | **HOLD** |
| Further BO feature build | Deferred until Owner accepts this UAT |
| Recommended next focus (Owner direction) | Internal admin automation: notifications, reminders, recurring billing, project monitoring, reporting |

---

## CMS preservation

Generic / central CMS and Treasure House Shadow CMS infrastructure were **not** rebuilt or removed. Development still has CMS tables including `cms_pages`, `cms_instances`, `cms_connections` (3 connections observed), revisions, publish jobs, and related objects.

---

**End of report — Business Operations E2E UAT: PASS (development)**
