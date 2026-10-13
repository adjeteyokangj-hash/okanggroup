export const EXPENSE_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'recorded',
  'paid',
  'reimbursed',
  'cancelled',
  'void',
] as const;

export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

const EXPENSE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  recorded: 'Recorded',
  paid: 'Paid',
  reimbursed: 'Reimbursed',
  cancelled: 'Cancelled',
  void: 'Void',
};

export function labelExpenseStatus(code: string): string {
  return EXPENSE_STATUS_LABELS[code] ?? code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isEditableExpenseStatus(status: string): boolean {
  return status === 'draft' || status === 'rejected' || status === 'recorded';
}

/** Statuses that count toward spend totals (exclude cancelled/void drafts cancelled). */
export function isCountedExpenseStatus(status: string): boolean {
  return !['cancelled', 'void'].includes(status);
}

export const EXPENSE_PAYMENT_METHODS = [
  { code: 'bank_transfer', label: 'Bank transfer' },
  { code: 'mobile_money', label: 'Mobile money' },
  { code: 'cash', label: 'Cash' },
  { code: 'card', label: 'Card' },
  { code: 'other', label: 'Other' },
] as const;

export function methodLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return EXPENSE_PAYMENT_METHODS.find((m) => m.code === code)?.label ?? code.replace(/_/g, ' ');
}

export type ExpenseSummaryRow = {
  currency: string;
  count: number;
  total: number;
  unpaid: number;
  pendingApproval: number;
};

export function summariseExpensesByCurrency(
  rows: Array<{
    currency_code: string;
    amount: number;
    status: string;
    payment_status?: string | null;
  }>,
): ExpenseSummaryRow[] {
  const map = new Map<string, ExpenseSummaryRow>();
  for (const r of rows) {
    if (!isCountedExpenseStatus(r.status)) continue;
    const currency = (r.currency_code || 'GBP').toUpperCase();
    const cur = map.get(currency) ?? {
      currency,
      count: 0,
      total: 0,
      unpaid: 0,
      pendingApproval: 0,
    };
    const amt = Number(r.amount) || 0;
    cur.count += 1;
    cur.total += amt;
    if (r.payment_status !== 'paid' && !['paid', 'reimbursed'].includes(r.status)) {
      cur.unpaid += amt;
    }
    if (r.status === 'submitted') cur.pendingApproval += amt;
    map.set(currency, cur);
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Allowed next statuses from transition_expense_status rules. */
export function nextExpenseStatuses(from: string): string[] {
  const out: string[] = [];
  if (from === 'draft') out.push('submitted', 'recorded', 'cancelled', 'void');
  if (from === 'submitted') out.push('approved', 'rejected', 'cancelled', 'void');
  if (from === 'approved') out.push('paid', 'reimbursed', 'cancelled', 'void');
  if (from === 'recorded') out.push('paid', 'reimbursed', 'cancelled', 'void');
  if (from === 'rejected') out.push('draft', 'cancelled');
  if (from === 'paid') out.push('reimbursed');
  return [...new Set(out)];
}

export function computeExpenseTax(net: number, taxRate: number): { net: number; tax: number; total: number } {
  const n = Math.round(Math.max(0, net) * 100) / 100;
  const rate = Math.max(0, taxRate);
  // match server: round(net * rate / 100, 2)
  const taxAmt = rate > 0 ? Math.round(((n * rate) / 100) * 100) / 100 : 0;
  return { net: n, tax: taxAmt, total: Math.round((n + taxAmt) * 100) / 100 };
}
