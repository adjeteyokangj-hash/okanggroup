import assert from 'node:assert/strict';
import {
  computeInvoiceTotals,
  labelInvoiceStatus,
  outstandingOf,
  summariseByCurrency,
} from './invoiceMath.ts';

const zeroTax = computeInvoiceTotals([], { taxMode: 'percent', taxRate: 15 });
assert.equal(zeroTax.subtotal, 0);
assert.equal(zeroTax.tax, 0);
assert.equal(zeroTax.total, 0);

const withLines = computeInvoiceTotals(
  [{ description: 'Webpage', quantity: 1, unit_amount: 1900 }],
  { taxMode: 'percent', taxRate: 15 },
);
assert.equal(withLines.subtotal, 1900);
assert.equal(withLines.tax, 285);
assert.equal(withLines.total, 2185);

const discounted = computeInvoiceTotals(
  [{ description: 'A', quantity: 2, unit_amount: 100 }],
  { taxMode: 'percent', taxRate: 10, discountTotal: 20 },
);
assert.equal(discounted.subtotal, 200);
assert.equal(discounted.discount, 20);
assert.equal(discounted.taxable, 180);
assert.equal(discounted.tax, 18);
assert.equal(discounted.total, 198);

assert.equal(outstandingOf({ total: 100, amount_paid: 40, amount_credited: 10 }), 50);
assert.equal(labelInvoiceStatus('partially_paid'), 'Partially paid');
assert.equal(labelInvoiceStatus('void'), 'Cancelled');

const summary = summariseByCurrency([
  { currency_code: 'GHS', total: 2185, amount_outstanding: 2185, status: 'issued' },
  { currency_code: 'GBP', total: 1200, amount_outstanding: 0, status: 'paid' },
  { currency_code: 'GHS', total: 100, amount_outstanding: 100, status: 'draft' },
]);
assert.equal(summary.length, 2);
const ghs = summary.find((s) => s.currency === 'GHS');
assert.ok(ghs);
assert.equal(ghs.outstanding, 2185); // draft excluded from AR
assert.equal(ghs.count, 2);
const gbp = summary.find((s) => s.currency === 'GBP');
assert.equal(gbp.outstanding, 0);

console.log('invoiceMath.test.mjs OK');
