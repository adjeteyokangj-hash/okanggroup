/** User-facing labels for stored enum-like codes (DB values unchanged). */

export const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  on_hold: 'On Hold',
  awaiting_information: 'Awaiting Information',
  in_review: 'In Review',
  done: 'Done',
  cancelled: 'Cancelled',
};

/** Statuses staff may set via Save Progress (not Approved/Completed). */
export const STAFF_PROGRESS_STATUS_LABELS: Record<string, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  on_hold: 'On Hold',
  awaiting_information: 'Awaiting Information',
};

export const STAFF_NOTE_REQUIRED_STATUSES = new Set([
  'blocked',
  'on_hold',
  'awaiting_information',
]);

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

export function labelStatus(code: string): string {
  return TASK_STATUS_LABELS[code] ?? code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function labelPriority(code: string): string {
  return TASK_PRIORITY_LABELS[code] ?? code;
}
