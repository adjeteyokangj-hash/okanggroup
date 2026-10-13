/** Presentation helpers for in-app notifications — DB kind codes unchanged. */

export type NotificationCategory = 'tasks' | 'projects' | 'finance' | 'clients' | 'cms' | 'system';

const KIND_CATEGORY: Record<string, NotificationCategory> = {
  task_assigned: 'tasks',
  task_due_soon: 'tasks',
  task_overdue: 'tasks',
  task_blocked: 'tasks',
  task_completed: 'tasks',
  project_budget_warning: 'projects',
  project_update: 'projects',
  invoice_due_soon: 'finance',
  invoice_overdue: 'finance',
  recurring_invoice_created: 'finance',
  quote_accepted: 'finance',
  client_update: 'clients',
  enquiry_new: 'clients',
  cms_client_approval: 'cms',
  cms_review: 'cms',
  cms_publish: 'cms',
  owner_summary: 'system',
  owner_alert: 'system',
};

const KIND_TITLE: Record<string, string> = {
  task_assigned: 'Task assigned',
  task_due_soon: 'Task due soon',
  task_overdue: 'Task overdue',
  task_blocked: 'Task blocked',
  recurring_invoice_created: 'Recurring invoice created',
  invoice_due_soon: 'Invoice due soon',
  invoice_overdue: 'Invoice overdue',
  project_budget_warning: 'Project budget warning',
  cms_client_approval: 'CMS approval needed',
  owner_summary: 'Business summary',
  owner_alert: 'System alert',
  client_update: 'Client update',
};

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  tasks: 'Tasks',
  projects: 'Projects',
  finance: 'Finance',
  clients: 'Clients',
  cms: 'Content',
  system: 'System',
};

/** Technical / UAT diagnostics that belong in Automation → Advanced, not the Owner centre. */
export function isDiagnosticNotification(kind: string, title: string): boolean {
  const t = title.trim();
  if (/^BA\s/i.test(t)) return true;
  if (/dedupe|email skip|scheduler.?tick|uat|diagnostic/i.test(t)) return true;
  if (kind.startsWith('diag_') || kind.startsWith('ba_test')) return true;
  return false;
}

export function notificationCategory(kind: string): NotificationCategory {
  return KIND_CATEGORY[kind] ?? (kind.startsWith('cms_') ? 'cms' : 'system');
}

export function labelNotificationKind(kind: string): string {
  if (KIND_TITLE[kind]) return KIND_TITLE[kind];
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function labelNotificationCategory(cat: NotificationCategory): string {
  return CATEGORY_LABEL[cat];
}

export function actionLabelForNotification(kind: string, linkPath: string | null): string {
  if (kind.includes('invoice') || linkPath?.includes('invoice')) return 'View invoice';
  if (kind.includes('task') || linkPath?.includes('/tasks')) return 'View task';
  if (kind.includes('project') || linkPath?.includes('/projects')) return 'View project';
  if (kind.includes('cms') || linkPath?.includes('cms')) return 'Open CMS';
  if (linkPath?.includes('client')) return 'View client';
  return 'Open';
}
