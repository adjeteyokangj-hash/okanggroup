# OkangGroup — Task Conversations & File Handoff UAT (M29)

| Field | Value |
| ----- | ----- |
| Status | **DEV COMPLETE — production HOLD** |
| Scope | Task Conversation, notify-after-upload, in-app notifications |
| Stage 2 overlays | Out of scope |
| Production | HOLD |

## What shipped

| Area | Detail |
| ---- | ------ |
| DB | `task_messages`, `notifications`, RLS; RPCs `post_task_message`, `mark_notification_read`, `mark_all_notifications_read`; submit/decide notify hooks |
| Task detail | **Task Conversation** under Task Files; Send Message (optional file links); no auto status change |
| File handoff | After instruction upload: **Notify assigned staff**; upload saves immediately; notify is separate |
| Shell | **Alerts** bell — unread count, open task, mark read / mark all |
| Work uploads | Unchanged separation from Instruction & Reference Files |

## Automated regression (`supabase/tests/m29_task_conversations_regression.sql`)

| Case | Result |
| ---- | ------ |
| Owner posts file-linked message → Daniel notified (`task_files`) | PASS |
| Owner posts message with no attachments → Daniel notified | PASS |
| Task status unchanged by messaging (`awaiting_information`) | PASS |
| Daniel replies → Owner notified | PASS |
| Mark notification read | PASS |
| Unauthorised principal cannot post | PASS |
| Daniel cannot post on other-client task | PASS |

## Browser checklist (Owner)

1. Open **Design OkangGroup Test Homepage** (Awaiting Information).
2. Confirm conversation history from regression (or send: *Daniel, I've uploaded the three documents…*).
3. Use **Notify assigned staff about these files** after an instruction upload — without re-uploading.
4. Confirm **Alerts** shows unread for Daniel when signed in as Daniel; Open task → mark read.
5. As Daniel: download instruction files → reply → upload under **Work Uploads** → Submit for Review.
6. As Owner: Approve/Reject → Daniel receives decision notification.

## Security notes

- Conversation/file access still gated by existing `can_read_task` / execute-vs-manage rules.
- Staff cannot edit task instructions via this feature.
- Notifications are recipient-scoped (`recipient_id = auth.uid()`).
- Owner MFA / permission model unchanged; no new Owner permission codes.

## Hold

Production deployment remains **HOLD**. Stage 2 permission overlays remain outside this work.
