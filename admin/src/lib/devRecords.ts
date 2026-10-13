/** Heuristics to flag synthetic / UAT records in Owner views (never deletes). */

const DEV_NAME_RE =
  /\b(uat|test|synthetic|demo|okg test|ba complete|dev client|ba assign)\b/i;

export function looksLikeDevRecord(...parts: Array<string | null | undefined>): boolean {
  return parts.some((p) => (p ? DEV_NAME_RE.test(p) : false));
}

export function formatMoney(currency: string, amount: number): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency || 'GBP',
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
