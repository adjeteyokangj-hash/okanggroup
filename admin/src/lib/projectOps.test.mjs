import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  countProgress,
  handoverComplete,
  lifecycleReached,
  nextChangeRequestStatuses,
  summariseProjectFinance,
} from './projectOps.ts';

describe('projectOps', () => {
  it('counts progress excluding cancelled', () => {
    const p = countProgress(
      [
        { status: 'done' },
        { status: 'open' },
        { status: 'cancelled' },
      ],
      ['done'],
    );
    assert.equal(p.total, 2);
    assert.equal(p.done, 1);
    assert.equal(p.pct, 50);
  });

  it('never mixes currencies in finance summary', () => {
    const rows = summariseProjectFinance({
      budgetAmount: 1000,
      budgetCurrency: 'GBP',
      invoices: [
        { currency_code: 'GBP', total: 500, amount_paid: 200, amount_outstanding: 300, status: 'issued' },
        { currency_code: 'GHS', total: 800, amount_paid: 800, amount_outstanding: 0, status: 'paid' },
      ],
      expenses: [
        { currency_code: 'GBP', amount: 50, status: 'approved' },
        { currency_code: 'GHS', amount: 100, status: 'paid' },
      ],
    });
    assert.equal(rows.length, 2);
    const gbp = rows.find((r) => r.currency === 'GBP');
    const ghs = rows.find((r) => r.currency === 'GHS');
    assert.equal(gbp?.invoiced, 500);
    assert.equal(gbp?.expenses, 50);
    assert.equal(gbp?.budget, 1000);
    assert.equal(gbp?.remaining, 950);
    assert.equal(ghs?.invoiced, 800);
    assert.equal(ghs?.budget, null);
    assert.equal(ghs?.expenses, 100);
  });

  it('lists CR transitions from submitted', () => {
    assert.deepEqual(nextChangeRequestStatuses('submitted').sort(), ['approved', 'cancelled', 'rejected'].sort());
  });

  it('handover requires all default items', () => {
    assert.equal(handoverComplete(['credentials', 'documentation']), false);
    assert.equal(
      handoverComplete(['credentials', 'documentation', 'training', 'signoff']),
      true,
    );
  });

  it('lifecycle index advances with flags', () => {
    assert.equal(
      lifecycleReached({
        hasClient: true,
        hasQuote: true,
        hasContract: true,
        hasProject: true,
        hasDeliveryProgress: false,
        hasAcceptance: false,
        hasInvoice: false,
        hasPayment: false,
        handoverDone: false,
      }),
      4,
    );
  });
});
