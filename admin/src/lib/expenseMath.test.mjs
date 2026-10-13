import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeExpenseTax,
  isEditableExpenseStatus,
  labelExpenseStatus,
  nextExpenseStatuses,
  summariseExpensesByCurrency,
} from './expenseMath.ts';

describe('expenseMath', () => {
  it('labels statuses', () => {
    assert.equal(labelExpenseStatus('submitted'), 'Submitted');
    assert.equal(labelExpenseStatus('paid'), 'Paid');
  });

  it('editable only for draft/rejected/recorded', () => {
    assert.equal(isEditableExpenseStatus('draft'), true);
    assert.equal(isEditableExpenseStatus('approved'), false);
  });

  it('never mixes currencies in summaries', () => {
    const s = summariseExpensesByCurrency([
      { currency_code: 'GBP', amount: 100, status: 'approved', payment_status: 'unpaid' },
      { currency_code: 'GHS', amount: 50, status: 'paid', payment_status: 'paid' },
      { currency_code: 'GBP', amount: 25, status: 'cancelled', payment_status: 'unpaid' },
    ]);
    assert.equal(s.length, 2);
    const gbp = s.find((x) => x.currency === 'GBP');
    const ghs = s.find((x) => x.currency === 'GHS');
    assert.equal(gbp?.total, 100);
    assert.equal(gbp?.unpaid, 100);
    assert.equal(ghs?.total, 50);
    assert.equal(ghs?.unpaid, 0);
  });

  it('computes tax like server (net + tax)', () => {
    const t = computeExpenseTax(100, 12.5);
    assert.equal(t.net, 100);
    assert.equal(t.tax, 12.5);
    assert.equal(t.total, 112.5);
  });

  it('lists valid transitions from draft', () => {
    assert.ok(nextExpenseStatuses('draft').includes('submitted'));
    assert.ok(nextExpenseStatuses('submitted').includes('approved'));
  });
});
