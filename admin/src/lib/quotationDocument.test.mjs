import assert from 'node:assert/strict';
import { quotationDiscount } from './quotationMath.ts';

const model = {
  quote_number: 'OKG-Q-000002',
  status: 'draft',
  currency_code: 'GHS',
  subtotal: 900,
  tax_total: 135,
  total: 1035,
};

assert.equal(quotationDiscount(model), 0);
assert.equal(model.subtotal + model.tax_total, model.total);

console.log('quotationDocument.test.mjs PASS');
