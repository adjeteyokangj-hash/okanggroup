/** Invoice line maths — client preview only; server save_invoice_draft is authoritative. */

export type InvoiceTaxMode = 'percent' | 'fixed' | 'none';

export type InvoiceLine = {
  description: string;
  quantity: number;
  unit_amount: number;
  line_total?: number;
};

export type InvoiceTotals = {
  subtotal: number;
  discount: number;
  taxable: number;
  tax: number;
  total: number;
};

export function parseInvoiceTaxMode(raw: unknown): InvoiceTaxMode {
  if (raw === 'fixed' || raw === 'none') return raw;
  return 'percent';
}

export function lineTotal(line: InvoiceLine): number {
  if (line.line_total != null && Number.isFinite(Number(line.line_total))) {
    return Math.round(Number(line.line_total) * 100) / 100;
  }
  const qty = Math.max(0, Number(line.quantity) || 0);
  const unit = Math.max(0, Number(line.unit_amount) || 0);
  return Math.round(qty * unit * 100) / 100;
}

export function computeInvoiceTotals(
  lines: InvoiceLine[],
  options: {
    taxMode?: InvoiceTaxMode;
    taxRate?: number;
    taxFixed?: number;
    discountTotal?: number;
  } = {},
): InvoiceTotals {
  const subtotal = Math.round(lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;
  const discount = Math.min(Math.max(0, Number(options.discountTotal) || 0), subtotal);
  const taxable = Math.round((subtotal - discount) * 100) / 100;
  const mode = options.taxMode ?? 'percent';
  let tax = 0;
  if (mode === 'fixed') {
    tax = Math.max(0, Number(options.taxFixed) || 0);
  } else if (mode === 'percent') {
    const rate = Math.max(0, Number(options.taxRate) || 0);
    tax = taxable > 0 && rate > 0 ? Math.round(((taxable * rate) / 100) * 100) / 100 : 0;
  }
  tax = Math.round(tax * 100) / 100;
  return {
    subtotal,
    discount,
    taxable,
    tax,
    total: Math.round((taxable + tax) * 100) / 100,
  };
}

export function outstandingOf(invoice: {
  total?: number | null;
  amount_paid?: number | null;
  amount_credited?: number | null;
  amount_outstanding?: number | null;
}): number {
  if (invoice.amount_outstanding != null && Number.isFinite(Number(invoice.amount_outstanding))) {
    return Math.max(0, Number(invoice.amount_outstanding));
  }
  const total = Number(invoice.total) || 0;
  const paid = Number(invoice.amount_paid) || 0;
  const credited = Number(invoice.amount_credited) || 0;
  return Math.max(0, Math.round((total - paid - credited) * 100) / 100);
}

/** Currency-separated AR summary — never mixes currencies. */
export function summariseByCurrency(
  rows: Array<{
    currency_code: string;
    total?: number | null;
    amount_outstanding?: number | null;
    status: string;
  }>,
): Array<{ currency: string; count: number; outstanding: number; issuedTotal: number }> {
  const map = new Map<string, { currency: string; count: number; outstanding: number; issuedTotal: number }>();
  for (const r of rows) {
    const ccy = (r.currency_code || 'GBP').toUpperCase();
    const cur = map.get(ccy) ?? { currency: ccy, count: 0, outstanding: 0, issuedTotal: 0 };
    cur.count += 1;
    if (!['draft', 'void', 'cancelled'].includes(r.status)) {
      cur.outstanding += Number(r.amount_outstanding) || 0;
      cur.issuedTotal += Number(r.total) || 0;
    }
    map.set(ccy, cur);
  }
  return [...map.values()]
    .map((x) => ({
      ...x,
      outstanding: Math.round(x.outstanding * 100) / 100,
      issuedTotal: Math.round(x.issuedTotal * 100) / 100,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_paid: 'Partially paid',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Cancelled',
  cancelled: 'Cancelled',
  credited: 'Credited',
};

export function labelInvoiceStatus(code: string): string {
  return INVOICE_STATUS_LABELS[code] ?? code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const PAYMENT_METHODS = [
  { code: 'bank_transfer', label: 'Bank transfer' },
  { code: 'mobile_money', label: 'Mobile money' },
  { code: 'cash', label: 'Cash' },
  { code: 'card', label: 'Card' },
  { code: 'other', label: 'Other' },
] as const;

export function isEditableInvoiceStatus(status: string): boolean {
  return status === 'draft';
}

export function isOpenInvoiceStatus(status: string): boolean {
  return ['issued', 'partially_paid', 'overdue'].includes(status);
}
