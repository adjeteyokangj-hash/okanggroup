/** Project operations helpers — progress + per-currency finance (never mix FX). */

export const HANDOVER_ITEMS = [
  { code: 'credentials', label: 'Credentials transferred' },
  { code: 'documentation', label: 'Documentation delivered' },
  { code: 'training', label: 'Client training complete' },
  { code: 'signoff', label: 'Client sign-off received' },
] as const;

export const LIFECYCLE_STEPS = [
  'Enquiry',
  'Client',
  'Quotation',
  'Contract',
  'Project',
  'Delivery',
  'Acceptance',
  'Invoice',
  'Payment',
  'Handover',
] as const;

export type ProgressCounts = {
  total: number;
  done: number;
  pct: number;
};

export function countProgress(
  rows: Array<{ status: string }>,
  doneStatuses: string[],
  excludeStatuses: string[] = ['cancelled'],
): ProgressCounts {
  const active = rows.filter((r) => !excludeStatuses.includes(r.status));
  const total = active.length;
  const done = active.filter((r) => doneStatuses.includes(r.status)).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

export type ProjectFinanceBucket = {
  currency: string;
  invoiced: number;
  paid: number;
  outstanding: number;
  expenses: number;
  budget: number | null;
  remaining: number | null;
};

/** Summarise invoices + expenses per currency; budget only applies to matching currency. */
export function summariseProjectFinance(opts: {
  budgetAmount: number | null;
  budgetCurrency: string | null;
  invoices: Array<{
    currency_code: string;
    total: number;
    amount_paid?: number | null;
    amount_outstanding?: number | null;
    status: string;
  }>;
  expenses: Array<{ currency_code: string; amount: number; status: string }>;
}): ProjectFinanceBucket[] {
  const map = new Map<string, ProjectFinanceBucket>();

  function bucket(ccy: string): ProjectFinanceBucket {
    const currency = (ccy || 'GBP').toUpperCase();
    let b = map.get(currency);
    if (!b) {
      const budgetCcy = (opts.budgetCurrency || '').toUpperCase();
      const budget =
        budgetCcy && budgetCcy === currency && opts.budgetAmount != null
          ? Number(opts.budgetAmount) || 0
          : null;
      b = {
        currency,
        invoiced: 0,
        paid: 0,
        outstanding: 0,
        expenses: 0,
        budget,
        remaining: budget,
      };
      map.set(currency, b);
    }
    return b;
  }

  for (const inv of opts.invoices) {
    if (['draft', 'cancelled', 'void'].includes(inv.status)) continue;
    const b = bucket(inv.currency_code);
    const total = Number(inv.total) || 0;
    const paid = Number(inv.amount_paid) || 0;
    const outstanding =
      inv.amount_outstanding != null ? Number(inv.amount_outstanding) || 0 : Math.max(0, total - paid);
    b.invoiced += total;
    b.paid += paid;
    b.outstanding += outstanding;
  }

  for (const exp of opts.expenses) {
    if (['cancelled', 'void'].includes(exp.status)) continue;
    const b = bucket(exp.currency_code);
    b.expenses += Number(exp.amount) || 0;
  }

  // Ensure budget currency appears even with no invoices/expenses
  if (opts.budgetCurrency && opts.budgetAmount != null) {
    bucket(opts.budgetCurrency);
  }

  for (const b of map.values()) {
    if (b.budget != null) b.remaining = Math.round((b.budget - b.expenses) * 100) / 100;
  }

  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export function nextChangeRequestStatuses(from: string): string[] {
  if (from === 'draft') return ['submitted', 'cancelled'];
  if (from === 'submitted') return ['approved', 'rejected', 'cancelled'];
  if (from === 'approved') return ['implemented', 'cancelled'];
  if (from === 'rejected') return ['draft', 'cancelled'];
  return [];
}

export function nextDeliverableStatuses(from: string): string[] {
  if (from === 'pending') return ['in_progress', 'cancelled'];
  if (from === 'in_progress') return ['ready_for_review', 'cancelled'];
  if (from === 'ready_for_review') return ['client_approved', 'in_progress', 'cancelled'];
  if (from === 'client_approved') return ['delivered', 'cancelled'];
  if (from === 'delivered') return ['cancelled'];
  return [];
}

export function nextMilestoneStatuses(from: string): string[] {
  if (from === 'open') return ['in_progress', 'done', 'cancelled'];
  if (from === 'in_progress') return ['done', 'open', 'cancelled'];
  if (from === 'done') return ['open', 'in_progress'];
  if (from === 'cancelled') return ['open'];
  return ['in_progress', 'done', 'cancelled'];
}

export function labelStatus(code: string): string {
  return code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function handoverComplete(checklist: string[]): boolean {
  return HANDOVER_ITEMS.every((i) => checklist.includes(i.code));
}

/** Infer which lifecycle steps are “reached” for dashboard breadcrumb (heuristic). */
export function lifecycleReached(flags: {
  hasClient: boolean;
  hasQuote: boolean;
  hasContract: boolean;
  hasProject: boolean;
  hasDeliveryProgress: boolean;
  hasAcceptance: boolean;
  hasInvoice: boolean;
  hasPayment: boolean;
  handoverDone: boolean;
}): number {
  // Always start after enquiry if we have a project/client
  let idx = 0;
  if (flags.hasClient) idx = 1;
  if (flags.hasQuote) idx = 2;
  if (flags.hasContract) idx = 3;
  if (flags.hasProject) idx = 4;
  if (flags.hasDeliveryProgress) idx = 5;
  if (flags.hasAcceptance) idx = 6;
  if (flags.hasInvoice) idx = 7;
  if (flags.hasPayment) idx = 8;
  if (flags.handoverDone) idx = 9;
  return idx;
}
