import assert from 'node:assert/strict';
import {
  adaptAgreementCopy,
  bodyForSave,
  computeServiceTotals,
  defaultJurisdictionForCurrency,
  defaultScopeOfWork,
  defaultTermsAndConditions,
  nextTransitions,
  parseContractBody,
  SCOPE_QUOTATION_LINKED,
  servicesFromQuoteLines,
  taxRateFromQuote,
} from './contractBody.ts';

const parsed = parseContractBody({
  scope_of_work: 'Build CMS',
  services: [{ description: 'Testing', quantity: 1, unit_amount: 300 }],
  deliverables: [{ title: 'Site', description: 'Live site' }],
  milestones: [{ title: 'Launch', due_offset_days: 30, description: 'Requirements' }],
  payment_schedule: [{ label: 'Deposit', percent: 40, trigger: 'on_acceptance', description: 'Upfront' }],
  tax_mode: 'percent',
  tax_rate: 15,
});

assert.equal(parsed.services[0].line_total, 300);

// Owner UAT: empty services + percentage must not produce positive tax
const emptyPercent = computeServiceTotals([], { taxMode: 'percent', taxRate: 15 });
assert.equal(emptyPercent.subtotal, 0);
assert.equal(emptyPercent.tax, 0);
assert.equal(emptyPercent.total, 0);

const fromQuote = servicesFromQuoteLines([
  { description: 'Testing', quantity: 1, unit_amount: 300 },
  { description: 'Update Webpage', quantity: 1, unit_amount: 600 },
]);
assert.equal(fromQuote.length, 2);
assert.equal(computeServiceTotals(fromQuote, { taxMode: 'percent', taxRate: 15 }).total, 1035);
assert.equal(taxRateFromQuote(900, 135), 15);

const fixedEmpty = computeServiceTotals([], { taxMode: 'fixed', taxFixed: 15 });
assert.equal(fixedEmpty.tax, 15);

const saved = bodyForSave({
  ...parsed,
  services: [],
  tax_mode: 'percent',
  tax_rate: 15,
  tax_total: 99,
  okang_responsibilities: 'Deliver',
  client_responsibilities: 'Pay',
  terms_and_conditions: 'T&Cs',
});
assert.equal(saved.tax_total, 0);
assert.equal(saved.total, 0);

assert.deepEqual(nextTransitions('draft'), ['internal_review', 'approved', 'cancelled']);
assert.ok(!nextTransitions('sent').includes('accepted'));

assert.equal(defaultJurisdictionForCurrency('GHS'), 'ghana');
assert.equal(defaultJurisdictionForCurrency('GBP'), 'england_wales');

const independent = adaptAgreementCopy(
  {
    ...parsed,
    scope_of_work: SCOPE_QUOTATION_LINKED,
    terms_and_conditions: defaultTermsAndConditions(true, 'england_wales'),
    okang_responsibilities: 'Deliver',
    client_responsibilities: 'Pay',
  },
  { hasQuotation: false, jurisdiction: 'ghana' },
);
assert.equal(independent.scope_of_work, defaultScopeOfWork(false));
assert.ok(!independent.scope_of_work.toLowerCase().includes('accepted quotation'));
assert.ok(independent.terms_and_conditions.includes('schedule of services'));
assert.ok(!independent.terms_and_conditions.includes('quotation snapshot'));
assert.ok(independent.terms_and_conditions.includes('laws of Ghana'));
assert.equal(independent.governing_jurisdiction, 'ghana');

const quoted = adaptAgreementCopy(independent, {
  hasQuotation: true,
  jurisdiction: 'england_wales',
});
assert.equal(quoted.scope_of_work, defaultScopeOfWork(true));
assert.ok(quoted.terms_and_conditions.includes('quotation snapshot'));
assert.ok(quoted.terms_and_conditions.includes('laws of England and Wales'));

const customScope = adaptAgreementCopy(
  {
    ...independent,
    scope_of_work: 'Custom Owner scope — do not overwrite',
    terms_and_conditions: 'Custom T&Cs',
  },
  { hasQuotation: true, jurisdiction: 'ghana' },
);
assert.equal(customScope.scope_of_work, 'Custom Owner scope — do not overwrite');
assert.equal(customScope.terms_and_conditions, 'Custom T&Cs');

const withJurisdiction = parseContractBody({
  scope_of_work: 'x',
  governing_jurisdiction: 'ghana',
  services: [],
});
assert.equal(withJurisdiction.governing_jurisdiction, 'ghana');

console.log('contractBody.test.mjs OK');
