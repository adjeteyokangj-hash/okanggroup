/** Contract agreement body helpers (client-side draft shaping only; totals are server-authoritative). */

export type ContractServiceLine = {
  description: string;
  quantity: number;
  unit_amount: number;
  line_total?: number;
  optional?: boolean;
};

export type ContractDeliverable = { title: string; description: string };
export type ContractMilestone = { title: string; due_offset_days?: number; description: string; due_on?: string };
export type ContractPaymentItem = {
  label: string;
  percent: number;
  trigger: string;
  description: string;
};

/** percent = tax_rate% of taxable services; fixed = explicit tax_total amount. */
export type ContractTaxMode = 'percent' | 'fixed';

/** Governing law for the agreement — configurable per contract. */
export type ContractJurisdiction = 'england_wales' | 'ghana';

export type ContractBody = {
  scope_of_work: string;
  deliverables: ContractDeliverable[];
  milestones: ContractMilestone[];
  payment_schedule: ContractPaymentItem[];
  okang_responsibilities: string;
  client_responsibilities: string;
  terms_and_conditions: string;
  services: ContractServiceLine[];
  tax_mode?: ContractTaxMode;
  tax_rate?: number;
  tax_total?: number;
  subtotal?: number;
  total?: number;
  /** Stored in body_json; defaults from currency / template when omitted. */
  governing_jurisdiction?: ContractJurisdiction;
};

export const JURISDICTION_OPTIONS: { code: ContractJurisdiction; label: string; clause: string }[] = [
  {
    code: 'england_wales',
    label: 'England and Wales',
    clause: 'This agreement is governed by the laws of England and Wales.',
  },
  {
    code: 'ghana',
    label: 'Ghana',
    clause: 'This agreement is governed by the laws of Ghana.',
  },
];

export function parseJurisdiction(raw: unknown): ContractJurisdiction {
  return raw === 'ghana' ? 'ghana' : 'england_wales';
}

export function jurisdictionLabel(code: ContractJurisdiction): string {
  return JURISDICTION_OPTIONS.find((o) => o.code === code)?.label ?? 'England and Wales';
}

export function jurisdictionClause(code: ContractJurisdiction): string {
  return (
    JURISDICTION_OPTIONS.find((o) => o.code === code)?.clause ??
    'This agreement is governed by the laws of England and Wales.'
  );
}

/** Template default: GHS → Ghana; otherwise England and Wales. */
export function defaultJurisdictionForCurrency(currencyCode: string): ContractJurisdiction {
  return String(currencyCode || '').toUpperCase() === 'GHS' ? 'ghana' : 'england_wales';
}

export const SCOPE_QUOTATION_LINKED =
  'OkangGroup will design, build and deliver the agreed digital solution described in the schedule of services, to a professional standard consistent with the accepted quotation.';

export const SCOPE_INDEPENDENT =
  'OkangGroup will design, build and deliver the agreed digital solution described in the schedule of services in this agreement, to a professional standard consistent with the agreed scope and schedule of services.';

/** Legacy template wording (quotation-implying) — treated as a known default for adaptation. */
export const SCOPE_LEGACY_QUOTATION = SCOPE_QUOTATION_LINKED;

export function defaultScopeOfWork(hasQuotation: boolean): string {
  return hasQuotation ? SCOPE_QUOTATION_LINKED : SCOPE_INDEPENDENT;
}

export function defaultTermsAndConditions(
  hasQuotation: boolean,
  jurisdiction: ContractJurisdiction,
): string {
  const scopeLine = hasQuotation
    ? '1. Scope is limited to the services and amounts stated in this agreement and any attached quotation snapshot.'
    : '1. Scope is limited to the services and amounts stated in this agreement and its schedule of services.';
  const changeLine = hasQuotation
    ? '2. Changes outside scope require a written amendment or revised quotation.'
    : '2. Changes outside scope require a written amendment agreed by both parties.';
  return [
    scopeLine,
    changeLine,
    '3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.',
    '4. Either party may terminate for material breach if not remedied within 14 days of written notice.',
    '5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.',
    `6. ${jurisdictionClause(jurisdiction)}`,
  ].join('\n');
}

const KNOWN_SCOPES = new Set([SCOPE_QUOTATION_LINKED, SCOPE_INDEPENDENT]);

/** True when terms match a generated default (any prior jurisdiction / quote variant). */
export function isDefaultTermsAndConditions(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  for (const hasQ of [true, false]) {
    for (const j of JURISDICTION_OPTIONS.map((o) => o.code)) {
      if (t === defaultTermsAndConditions(hasQ, j).trim()) return true;
    }
  }
  // Legacy hardcoded England & Wales clause with "unless a different jurisdiction…"
  if (
    t ===
    [
      '1. Scope is limited to the services and amounts stated in this agreement and any attached quotation snapshot.',
      '2. Changes outside scope require a written amendment or revised quotation.',
      '3. Intellectual property in deliverables transfers to the Client upon full payment, unless otherwise agreed.',
      '4. Either party may terminate for material breach if not remedied within 14 days of written notice.',
      '5. Liability is limited to the contract value paid in the preceding 12 months, excluding fraud or wilful misconduct.',
      '6. This agreement is governed by the laws of England and Wales unless a different jurisdiction is agreed in writing.',
    ].join('\n')
  ) {
    return true;
  }
  return false;
}

/**
 * Adapt template/default wording when linking or unlinking a quotation, or changing jurisdiction.
 * Custom Owner-edited scope/terms are left untouched unless `force` is set.
 */
export function adaptAgreementCopy(
  body: ContractBody,
  options: {
    hasQuotation: boolean;
    jurisdiction?: ContractJurisdiction;
    force?: boolean;
  },
): ContractBody {
  const jurisdiction = parseJurisdiction(
    options.jurisdiction ?? body.governing_jurisdiction ?? 'england_wales',
  );
  const scope = String(body.scope_of_work || '').trim();
  const nextScope =
    options.force || !scope || KNOWN_SCOPES.has(scope)
      ? defaultScopeOfWork(options.hasQuotation)
      : body.scope_of_work;
  const nextTerms =
    options.force || isDefaultTermsAndConditions(body.terms_and_conditions)
      ? defaultTermsAndConditions(options.hasQuotation, jurisdiction)
      : body.terms_and_conditions;
  return {
    ...body,
    governing_jurisdiction: jurisdiction,
    scope_of_work: nextScope,
    terms_and_conditions: nextTerms,
  };
}

export const EMPTY_BODY: ContractBody = {
  scope_of_work: '',
  deliverables: [{ title: '', description: '' }],
  milestones: [{ title: '', description: '', due_offset_days: 14 }],
  payment_schedule: [
    { label: 'Deposit', percent: 40, trigger: 'on_acceptance', description: 'Payable on contract acceptance' },
    { label: 'Progress', percent: 40, trigger: 'milestone', description: 'Payable at mid-project milestone' },
    { label: 'Final balance', percent: 20, trigger: 'on_completion', description: 'Payable on completion / go-live' },
  ],
  okang_responsibilities: '',
  client_responsibilities: '',
  terms_and_conditions: '',
  services: [],
  tax_mode: 'percent',
  tax_rate: 0,
  tax_total: 0,
  governing_jurisdiction: 'england_wales',
};

export function asArray<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

export function parseTaxMode(raw: unknown): ContractTaxMode {
  return raw === 'fixed' ? 'fixed' : 'percent';
}

export function parseContractBody(raw: unknown): ContractBody {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const services = asArray<ContractServiceLine>(o.services).map((s) => {
    const qty = Number(s.quantity) || 0;
    const unit = Number(s.unit_amount) || 0;
    return {
      description: String(s.description ?? ''),
      quantity: qty,
      unit_amount: unit,
      line_total: s.line_total != null ? Number(s.line_total) : qty * unit,
      optional: Boolean(s.optional),
    };
  });
  const deliverables = asArray<ContractDeliverable>(o.deliverables).map((d) => ({
    title: String(d.title ?? ''),
    description: String(d.description ?? ''),
  }));
  const milestones = asArray<ContractMilestone>(o.milestones).map((m) => ({
    title: String(m.title ?? ''),
    description: String(m.description ?? ''),
    due_offset_days: m.due_offset_days != null ? Number(m.due_offset_days) : undefined,
    due_on: m.due_on ? String(m.due_on) : undefined,
  }));
  const payment_schedule = asArray<ContractPaymentItem>(o.payment_schedule).map((p) => ({
    label: String(p.label ?? ''),
    percent: Number(p.percent) || 0,
    trigger: String(p.trigger ?? 'on_acceptance'),
    description: String(p.description ?? ''),
  }));

  const taxMode = parseTaxMode(o.tax_mode);
  // Legacy rows stored only tax_total as a fixed amount with no tax_mode/tax_rate.
  const legacyFixed =
    o.tax_mode == null && o.tax_rate == null && Number(o.tax_total) > 0 && services.every((s) => !s.line_total);

  return {
    scope_of_work: String(o.scope_of_work ?? ''),
    deliverables: deliverables.length ? deliverables : [{ title: '', description: '' }],
    milestones: milestones.length ? milestones : [{ title: '', description: '', due_offset_days: 14 }],
    payment_schedule: payment_schedule.length ? payment_schedule : EMPTY_BODY.payment_schedule,
    okang_responsibilities: String(o.okang_responsibilities ?? ''),
    client_responsibilities: String(o.client_responsibilities ?? ''),
    terms_and_conditions: String(o.terms_and_conditions ?? ''),
    services,
    tax_mode: legacyFixed ? 'fixed' : taxMode,
    tax_rate: Number(o.tax_rate) || 0,
    tax_total: Number(o.tax_total) || 0,
    subtotal: Number(o.subtotal) || 0,
    total: Number(o.total) || 0,
    governing_jurisdiction: parseJurisdiction(o.governing_jurisdiction),
  };
}

export function servicesFromQuoteLines(raw: unknown): ContractServiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l) => {
    const row = l as Record<string, unknown>;
    const qty = Number(row.quantity) || 0;
    const unit = Number(row.unit_amount) || 0;
    const lineTotal = row.line_total != null ? Number(row.line_total) : qty * unit;
    return {
      description: String(row.description ?? ''),
      quantity: qty,
      unit_amount: unit,
      line_total: lineTotal,
      optional: Boolean(row.optional),
    };
  });
}

export function serviceSubtotal(services: ContractServiceLine[]): number {
  return services.reduce(
    (s, l) => s + (l.line_total != null ? Number(l.line_total) : Number(l.quantity) * Number(l.unit_amount)),
    0,
  );
}

/** Client-side estimate mirroring server rules. */
export function computeServiceTotals(
  services: ContractServiceLine[],
  options: { taxMode?: ContractTaxMode; taxRate?: number; taxFixed?: number } = {},
) {
  const subtotal = Math.round(serviceSubtotal(services) * 100) / 100;
  const mode = options.taxMode ?? 'percent';
  let tax = 0;
  if (mode === 'fixed') {
    tax = Math.max(0, Number(options.taxFixed) || 0);
  } else {
    const rate = Math.max(0, Number(options.taxRate) || 0);
    tax = subtotal > 0 && rate > 0 ? Math.round(((subtotal * rate) / 100) * 100) / 100 : 0;
  }
  tax = Math.round(tax * 100) / 100;
  return { subtotal, tax, total: Math.round((subtotal + tax) * 100) / 100 };
}

export function bodyForSave(body: ContractBody): ContractBody {
  const services = body.services.map((s) => {
    const qty = Math.max(0, Number(s.quantity) || 0);
    const unit = Math.max(0, Number(s.unit_amount) || 0);
    return {
      description: s.description.trim(),
      quantity: qty,
      unit_amount: unit,
      line_total: Math.round(qty * unit * 100) / 100,
      optional: Boolean(s.optional),
    };
  });
  const taxMode = body.tax_mode === 'fixed' ? 'fixed' : 'percent';
  const totals = computeServiceTotals(services, {
    taxMode,
    taxRate: body.tax_rate,
    taxFixed: body.tax_total,
  });
  return {
    ...body,
    services,
    tax_mode: taxMode,
    tax_rate: taxMode === 'percent' ? Math.max(0, Number(body.tax_rate) || 0) : 0,
    subtotal: totals.subtotal,
    tax_total: totals.tax,
    total: totals.total,
    deliverables: body.deliverables.filter((d) => d.title.trim() || d.description.trim()),
    milestones: body.milestones.filter((m) => m.title.trim() || m.description.trim()),
    payment_schedule: body.payment_schedule.filter((p) => p.label.trim() || p.percent > 0),
  };
}

/** Infer percent rate from an accepted quotation's stored totals. */
export function taxRateFromQuote(subtotal: number, taxTotal: number): number {
  const s = Number(subtotal) || 0;
  const t = Number(taxTotal) || 0;
  if (s <= 0 || t <= 0) return 0;
  return Math.round((t / s) * 10000) / 100;
}

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  internal_review: 'Internal review',
  approved: 'Approved',
  sent: 'Sent',
  accepted: 'Accepted',
  active: 'Active',
  completed: 'Completed',
  terminated: 'Terminated',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

export function labelContractStatus(code: string): string {
  return CONTRACT_STATUS_LABELS[code] ?? code.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const EDITABLE_CONTRACT_STATUSES = new Set(['draft', 'internal_review', 'rejected']);

export function nextTransitions(from: string): string[] {
  switch (from) {
    case 'draft':
      return ['internal_review', 'approved', 'cancelled'];
    case 'internal_review':
      return ['approved', 'rejected', 'draft', 'cancelled'];
    case 'rejected':
      return ['draft', 'cancelled'];
    case 'approved':
      return ['sent', 'cancelled'];
    case 'sent':
      return ['rejected', 'cancelled'];
    case 'accepted':
      return ['active', 'cancelled'];
    case 'active':
      return ['completed', 'terminated'];
    default:
      return [];
  }
}
