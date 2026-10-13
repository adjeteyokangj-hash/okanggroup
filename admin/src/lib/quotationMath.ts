/** Helpers for quotation presentation totals (server remains source of truth on save). */

export function quotationDiscount(input: {
  subtotal: number;
  tax_total: number;
  total: number;
}): number {
  const subtotal = Number(input.subtotal) || 0;
  const tax = Number(input.tax_total) || 0;
  const total = Number(input.total) || 0;
  return Math.max(0, Math.round((subtotal + tax - total) * 100) / 100);
}
