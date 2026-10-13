import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ContractDocument, type ContractDocumentModel } from '../components/ContractDocument';
import {
  adaptAgreementCopy,
  bodyForSave,
  computeServiceTotals,
  defaultJurisdictionForCurrency,
  EDITABLE_CONTRACT_STATUSES,
  EMPTY_BODY,
  JURISDICTION_OPTIONS,
  labelContractStatus,
  nextTransitions,
  parseContractBody,
  parseJurisdiction,
  servicesFromQuoteLines,
  taxRateFromQuote,
  type ContractBody,
  type ContractDeliverable,
  type ContractJurisdiction,
  type ContractMilestone,
  type ContractPaymentItem,
  type ContractServiceLine,
  type ContractTaxMode,
} from '../lib/contractBody';
import { formatMoney, looksLikeDevRecord } from '../lib/devRecords';
import { exportContractPdf } from '../lib/exportContractPdf';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Contract = {
  id: string;
  contract_number: string;
  title: string;
  status: string;
  currency_code: string;
  value_amount: number | null;
  subtotal: number;
  tax_total: number;
  client_id: string;
  quotation_id: string | null;
  project_id: string | null;
  template_code: string | null;
  version_no: number;
  parent_contract_id: string | null;
  body_json: unknown;
  quotation_snapshot_json: unknown;
  acceptance_json: unknown;
  payment_terms: string | null;
  effective_on: string | null;
  ends_on: string | null;
  created_at?: string | null;
  clients?: { legal_name: string } | null;
};

type Client = { id: string; legal_name: string };
type Quote = {
  id: string;
  quote_number: string;
  client_id: string;
  total: number;
  subtotal: number;
  tax_total: number;
  currency_code: string;
  lines_json: unknown;
  notes: string | null;
  status: string;
};
type Template = {
  code: string;
  name: string;
  description: string | null;
  category: string;
  body_json: unknown;
};
type Project = { id: string; name: string; client_id: string };
type VersionRow = {
  id: string;
  version_no: number;
  status: string;
  change_note: string | null;
  created_at: string;
};

function extractPaymentTerms(notes: string | null): string {
  if (!notes) return '';
  const m = notes.match(/Payment terms:\s*(.+?)(?:\n---\n|$)/i);
  return m?.[1]?.trim() ?? '';
}

/** Raw strings so Qty / Unit amount can be cleared while typing (same pattern as Quotations). */
type ServiceDraft = {
  description: string;
  quantity: string;
  unit_amount: string;
};

const emptyServiceDraft = (): ServiceDraft => ({
  description: '',
  quantity: '1',
  unit_amount: '',
});

function numOrZero(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function toServiceDrafts(services: ContractServiceLine[]): ServiceDraft[] {
  if (!services.length) return [emptyServiceDraft()];
  return services.map((s) => ({
    description: s.description,
    quantity: String(s.quantity ?? 1),
    unit_amount: s.unit_amount === 0 ? '' : String(s.unit_amount),
  }));
}

function servicesFromDrafts(drafts: ServiceDraft[]): ContractServiceLine[] {
  return drafts.map((d) => {
    const quantity = Math.max(0, numOrZero(d.quantity));
    const unit_amount = Math.max(0, numOrZero(d.unit_amount));
    return {
      description: d.description,
      quantity,
      unit_amount,
      line_total: Math.round(quantity * unit_amount * 100) / 100,
    };
  });
}

export function FinanceContractsPage() {
  const { can } = useAuth();
  const canManage = can('finance.contracts.manage');
  const [rows, setRows] = useState<Contract[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [versions, setVersions] = useState<VersionRow[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Contract | null>(null);
  const [clientId, setClientId] = useState('');
  const [quoteId, setQuoteId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [templateCode, setTemplateCode] = useState('okang_service_agreement');
  const [title, setTitle] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [paymentTerms, setPaymentTerms] = useState('Due according to the payment schedule');
  const [effectiveOn, setEffectiveOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [body, setBody] = useState<ContractBody>(EMPTY_BODY);
  const [serviceDrafts, setServiceDrafts] = useState<ServiceDraft[]>([emptyServiceDraft()]);
  const [taxMode, setTaxMode] = useState<ContractTaxMode>('percent');
  const [taxRate, setTaxRate] = useState('');
  const [taxFixed, setTaxFixed] = useState('');

  const [previewOpen, setPreviewOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDev, setShowDev] = useState(loadShowDevRecords);
  const [acceptOpen, setAcceptOpen] = useState(false);
  const [acceptName, setAcceptName] = useState('');
  const [acceptEmail, setAcceptEmail] = useState('');
  const [acceptMethod, setAcceptMethod] = useState('recorded_in_okanggroup');
  const [acceptNote, setAcceptNote] = useState('');

  const clientName =
    clients.find((c) => c.id === (viewing?.client_id ?? clientId))?.legal_name ??
    viewing?.clients?.legal_name ??
    'Client';
  const isEditable = Boolean(
    canManage && (!viewing || EDITABLE_CONTRACT_STATUSES.has(viewing.status)),
  );

  const liveServices = useMemo(() => servicesFromDrafts(serviceDrafts), [serviceDrafts]);

  const liveTotals = useMemo(
    () =>
      computeServiceTotals(liveServices, {
        taxMode,
        taxRate: Number(taxRate) || 0,
        taxFixed: Number(taxFixed) || 0,
      }),
    [liveServices, taxMode, taxRate, taxFixed],
  );

  const visibleRows = useMemo(
    () =>
      showDev
        ? rows
        : rows.filter((r) => !looksLikeDevRecord(r.clients?.legal_name, r.contract_number, r.title)),
    [rows, showDev],
  );

  async function load() {
    const [{ data, error: err }, { data: c }, { data: q }, { data: t }, { data: p }] = await Promise.all([
      supabase
        .from('contracts')
        .select(
          'id, contract_number, title, status, currency_code, value_amount, subtotal, tax_total, client_id, quotation_id, project_id, template_code, version_no, parent_contract_id, body_json, quotation_snapshot_json, acceptance_json, payment_terms, effective_on, ends_on, created_at, clients(legal_name)',
        )
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, legal_name').order('legal_name'),
      supabase
        .from('quotations')
        .select('id, quote_number, client_id, total, subtotal, tax_total, currency_code, lines_json, notes, status')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false }),
      supabase
        .from('contract_templates')
        .select('code, name, description, category, body_json')
        .eq('is_active', true)
        .order('sort_order'),
      supabase.from('projects').select('id, name, client_id').order('name'),
    ]);
    if (err) setError(err.message);
    else {
      setRows(
        ((data as unknown as Contract[]) ?? []).map((r) => ({
          ...r,
          clients: Array.isArray(r.clients) ? r.clients[0] : r.clients,
        })),
      );
    }
    setClients((c as Client[]) ?? []);
    setQuotes((q as Quote[]) ?? []);
    setTemplates((t as Template[]) ?? []);
    setProjects((p as Project[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  function applyTemplate(code: string, preserveServices = true) {
    const tpl = templates.find((x) => x.code === code);
    setTemplateCode(code);
    if (!tpl) return;
    const parsed = parseContractBody(tpl.body_json);
    const jurisdiction =
      parsed.governing_jurisdiction ?? defaultJurisdictionForCurrency(currency);
    const adapted = adaptAgreementCopy(
      { ...parsed, governing_jurisdiction: jurisdiction },
      { hasQuotation: Boolean(quoteId), jurisdiction, force: true },
    );
    setBody((prev) => ({
      ...adapted,
      services: preserveServices ? prev.services : adapted.services,
      tax_mode: preserveServices ? prev.tax_mode : adapted.tax_mode,
      tax_rate: preserveServices ? prev.tax_rate : adapted.tax_rate,
      tax_total: preserveServices ? prev.tax_total : adapted.tax_total,
      subtotal: preserveServices ? prev.subtotal : adapted.subtotal,
      total: preserveServices ? prev.total : adapted.total,
    }));
    if (!preserveServices) setServiceDrafts(toServiceDrafts(adapted.services));
  }

  function setJurisdiction(next: ContractJurisdiction) {
    setBody((prev) =>
      adaptAgreementCopy(
        { ...prev, governing_jurisdiction: next },
        { hasQuotation: Boolean(quoteId), jurisdiction: next },
      ),
    );
  }

  function setCurrencyAndJurisdiction(nextCurrency: string) {
    const prevDefault = defaultJurisdictionForCurrency(currency);
    const nextDefault = defaultJurisdictionForCurrency(nextCurrency);
    setCurrency(nextCurrency);
    setBody((prev) => {
      const current = parseJurisdiction(prev.governing_jurisdiction);
      if (current !== prevDefault) return prev;
      return adaptAgreementCopy(
        { ...prev, governing_jurisdiction: nextDefault },
        { hasQuotation: Boolean(quoteId), jurisdiction: nextDefault },
      );
    });
  }

  function resetBuilder() {
    setEditingId(null);
    setViewing(null);
    setClientId('');
    setQuoteId('');
    setProjectId('');
    setTemplateCode('okang_service_agreement');
    setTitle('');
    setCurrency('GBP');
    setPaymentTerms('Due according to the payment schedule');
    setEffectiveOn(new Date().toISOString().slice(0, 10));
    setEndsOn('');
    setTaxMode('percent');
    setTaxRate('');
    setTaxFixed('');
    setVersions([]);
    const tpl = templates.find((x) => x.code === 'okang_service_agreement');
    const parsed = tpl ? parseContractBody(tpl.body_json) : { ...EMPTY_BODY };
    const jurisdiction =
      parsed.governing_jurisdiction ?? defaultJurisdictionForCurrency('GBP');
    const next = adaptAgreementCopy(
      { ...parsed, governing_jurisdiction: jurisdiction },
      { hasQuotation: false, jurisdiction, force: true },
    );
    setBody(next);
    setServiceDrafts(toServiceDrafts(next.services));
  }

  async function loadVersions(contractId: string) {
    const { data } = await supabase
      .from('contract_versions')
      .select('id, version_no, status, change_note, created_at')
      .eq('contract_id', contractId)
      .order('version_no', { ascending: false });
    setVersions((data as VersionRow[]) ?? []);
  }

  function openContract(c: Contract) {
    setViewing(c);
    setEditingId(EDITABLE_CONTRACT_STATUSES.has(c.status) && canManage ? c.id : null);
    setClientId(c.client_id);
    setQuoteId(c.quotation_id ?? '');
    setProjectId(c.project_id ?? '');
    setTemplateCode(c.template_code ?? 'okang_service_agreement');
    setTitle(c.title);
    setCurrency(c.currency_code);
    setPaymentTerms(c.payment_terms ?? 'Due according to the payment schedule');
    setEffectiveOn(c.effective_on ?? '');
    setEndsOn(c.ends_on ?? '');
    const parsed = parseContractBody(c.body_json);
    const hasQuotation = Boolean(c.quotation_id || c.quotation_snapshot_json);
    const jurisdiction =
      parsed.governing_jurisdiction ?? defaultJurisdictionForCurrency(c.currency_code);
    // Legacy rows with empty body: seed from template but keep value
    if (!parsed.scope_of_work && !parsed.services.length && templates.length) {
      const tpl = templates.find((x) => x.code === (c.template_code || 'okang_service_agreement'));
      const seeded = tpl ? parseContractBody(tpl.body_json) : EMPTY_BODY;
      const nextBody = adaptAgreementCopy(
        {
          ...seeded,
          tax_mode: 'percent' as const,
          tax_rate: 0,
          tax_total: 0,
          subtotal: Number(c.subtotal) || Number(c.value_amount) || 0,
          total: Number(c.value_amount) || 0,
          governing_jurisdiction: jurisdiction,
        },
        { hasQuotation, jurisdiction, force: true },
      );
      setBody(nextBody);
      setServiceDrafts(toServiceDrafts(nextBody.services));
      setTaxMode('percent');
      setTaxRate('');
      setTaxFixed('');
    } else {
      // Soft-adapt known default wording (e.g. independent contracts still on quotation template text).
      const nextBody = adaptAgreementCopy(
        { ...parsed, governing_jurisdiction: jurisdiction },
        { hasQuotation, jurisdiction },
      );
      setBody(nextBody);
      setServiceDrafts(toServiceDrafts(nextBody.services));
      setTaxMode(nextBody.tax_mode ?? 'percent');
      setTaxRate(nextBody.tax_rate ? String(nextBody.tax_rate) : '');
      setTaxFixed(nextBody.tax_mode === 'fixed' && nextBody.tax_total ? String(nextBody.tax_total) : '');
    }
    setPreviewOpen(true);
    void loadVersions(c.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => {
      document.getElementById('contract-print-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  function importAcceptedQuote(qid: string) {
    setQuoteId(qid);
    if (!qid) {
      setBody((prev) =>
        adaptAgreementCopy(prev, {
          hasQuotation: false,
          jurisdiction: parseJurisdiction(prev.governing_jurisdiction),
        }),
      );
      setMessage('Quotation link cleared — agreement wording uses the independent scope.');
      return;
    }
    const q = quotes.find((x) => x.id === qid);
    if (!q) return;
    if (q.status !== 'accepted') {
      setError('Only accepted quotations can be imported into a contract.');
      setQuoteId('');
      return;
    }
    setClientId(q.client_id);
    const nextJurisdiction = defaultJurisdictionForCurrency(q.currency_code);
    setCurrency(q.currency_code);
    const services = servicesFromQuoteLines(q.lines_json);
    const rate = taxRateFromQuote(Number(q.subtotal), Number(q.tax_total));
    setTaxMode('percent');
    setTaxRate(rate ? String(rate) : '');
    setTaxFixed('');
    setServiceDrafts(toServiceDrafts(services));
    setBody((prev) => {
      const prevDefault = defaultJurisdictionForCurrency(currency);
      const currentJ = parseJurisdiction(prev.governing_jurisdiction);
      const jurisdiction = currentJ === prevDefault ? nextJurisdiction : currentJ;
      return adaptAgreementCopy(
        {
          ...prev,
          services,
          tax_mode: 'percent',
          tax_rate: rate,
          tax_total: Number(q.tax_total) || 0,
          subtotal: Number(q.subtotal) || 0,
          total: Number(q.total) || 0,
          governing_jurisdiction: jurisdiction,
        },
        { hasQuotation: true, jurisdiction },
      );
    });
    const terms = extractPaymentTerms(q.notes);
    if (terms) setPaymentTerms(terms);
    if (!title.trim()) setTitle(`Service Agreement — ${q.quote_number}`);
    setMessage(`Imported accepted quotation ${q.quote_number}. Snapshot will be locked when the draft is saved.`);
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !isEditable) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const payload = bodyForSave({
      ...body,
      services: servicesFromDrafts(serviceDrafts),
      tax_mode: taxMode,
      tax_rate: Number(taxRate) || 0,
      tax_total: Number(taxFixed) || 0,
    });
    const { data, error: err } = await supabase.rpc('save_contract_draft', {
      p_client_id: clientId,
      p_title: title.trim(),
      p_currency: currency,
      p_body: payload,
      p_template_code: templateCode || null,
      p_quotation_id: quoteId || null,
      p_project_id: projectId || null,
      p_payment_terms: paymentTerms || null,
      p_effective_on: effectiveOn || null,
      p_ends_on: endsOn || null,
      p_contract_id: editingId,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      const saved = data as Contract;
      setMessage(
        editingId
          ? `Draft ${saved.contract_number ?? ''} updated.`
          : `Draft contract ${saved.contract_number ?? ''} created.`,
      );
      await load();
      openContract({
        ...saved,
        clients: { legal_name: clientName },
      });
    }
  }

  function toDocumentModel(c: Contract, overrideBody?: ContractBody): ContractDocumentModel {
    const snap = (c.quotation_snapshot_json ?? null) as ContractDocumentModel['quotation_snapshot'];
    const acceptance = (c.acceptance_json ?? null) as ContractDocumentModel['acceptance'];
    const tplName = templates.find((t) => t.code === c.template_code)?.name;
    const bodyModel = overrideBody ?? parseContractBody(c.body_json);
    return {
      contract_number: c.contract_number,
      title: c.title,
      status: c.status,
      currency_code: c.currency_code,
      value_amount: overrideBody ? liveTotals.total : c.value_amount != null ? Number(c.value_amount) : null,
      subtotal: overrideBody ? liveTotals.subtotal : Number(c.subtotal) || 0,
      tax_total: overrideBody ? liveTotals.tax : Number(c.tax_total) || 0,
      payment_terms: c.payment_terms,
      effective_on: c.effective_on,
      ends_on: c.ends_on,
      version_no: c.version_no || 1,
      template_name: tplName,
      client_name: c.clients?.legal_name ?? clients.find((x) => x.id === c.client_id)?.legal_name ?? 'Client',
      body: bodyModel,
      quotation_snapshot: snap,
      acceptance,
    };
  }

  const draftBody: ContractBody = {
    ...body,
    services: liveServices,
    tax_mode: taxMode,
    tax_rate: Number(taxRate) || 0,
    tax_total: liveTotals.tax,
    subtotal: liveTotals.subtotal,
    total: liveTotals.total,
  };

  /** Live preview while editing; PDF uses saved server totals only. */
  const livePreviewModel: ContractDocumentModel | null =
    isEditable && (viewing || (clientId && title))
      ? viewing
        ? toDocumentModel(
            {
              ...viewing,
              title,
              currency_code: currency,
              payment_terms: paymentTerms,
              effective_on: effectiveOn || null,
              ends_on: endsOn || null,
              template_code: templateCode,
            },
            draftBody,
          )
        : {
            contract_number: 'DRAFT',
            title,
            status: 'draft',
            currency_code: currency,
            value_amount: liveTotals.total,
            subtotal: liveTotals.subtotal,
            tax_total: liveTotals.tax,
            payment_terms: paymentTerms,
            effective_on: effectiveOn || null,
            ends_on: endsOn || null,
            version_no: 1,
            template_name: templates.find((t) => t.code === templateCode)?.name,
            client_name: clientName,
            body: draftBody,
            quotation_snapshot: quoteId
              ? {
                  quote_number: quotes.find((q) => q.id === quoteId)?.quote_number,
                  currency_code: currency,
                  total: liveTotals.total,
                }
              : null,
            acceptance: null,
          }
      : null;

  const savedDocument = viewing && !isEditable ? toDocumentModel(viewing) : viewing ? toDocumentModel(viewing) : null;
  const previewModel = livePreviewModel ?? savedDocument;

  async function downloadPdf() {
    if (!viewing) {
      setError('Save the contract before downloading PDF. The PDF always uses the saved agreement and server totals.');
      return;
    }
    const savedEl = document.querySelector('[data-contract-saved="1"]') as HTMLElement | null;
    if (!savedEl) {
      setError('Saved agreement is not ready to export. Save the contract first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const host = document.createElement('div');
      host.className = 'quote-print-host quote-print-host-export';
      // Export saved server totals, not unsaved live draft estimates.
      const clone = savedEl.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-contract-saved');
      host.appendChild(clone);
      document.body.appendChild(host);
      const result = await exportContractPdf({
        element: clone,
        fileName: `${viewing.contract_number}.pdf`,
      });
      host.remove();
      setMessage(
        result.pages === 1
          ? `Downloaded ${result.fileName} (saved agreement, server totals).`
          : `Downloaded ${result.fileName} (${result.pages} pages · saved agreement).`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setBusy(false);
    }
  }

  async function transition(to: string) {
    if (!viewing || !canManage) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('transition_contract_status', {
      p_contract_id: viewing.id,
      p_to_status: to,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(`Status → ${labelContractStatus(to)}`);
      await load();
      openContract({ ...(data as Contract), clients: viewing.clients });
    }
  }

  async function recordAcceptance(e: FormEvent) {
    e.preventDefault();
    if (!viewing || !canManage) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('record_contract_acceptance', {
      p_contract_id: viewing.id,
      p_accepted_by_name: acceptName,
      p_accepted_by_email: acceptEmail || null,
      p_method: acceptMethod,
      p_evidence_note: acceptNote || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setAcceptOpen(false);
      setMessage('Client acceptance recorded (evidence only — not a certified e-signature).');
      await load();
      openContract({ ...(data as Contract), clients: viewing.clients });
    }
  }

  async function revise() {
    if (!viewing || !canManage) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('revise_contract', {
      p_contract_id: viewing.id,
      p_note: 'Owner amendment',
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(`Amendment draft ${(data as Contract).contract_number} created.`);
      await load();
      openContract({ ...(data as Contract), clients: viewing.clients });
    }
  }

  async function generateInvoices() {
    if (!viewing || !canManage) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('create_invoices_from_contract_schedule', {
      p_contract_id: viewing.id,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      const created = (data as { created?: number })?.created ?? 0;
      setMessage(`Created ${created} draft invoice(s) from payment schedule.`);
    }
  }

  function updateServiceDraft(i: number, patch: Partial<ServiceDraft>) {
    setServiceDrafts((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  function updateDeliverable(i: number, patch: Partial<ContractDeliverable>) {
    setBody((prev) => ({
      ...prev,
      deliverables: prev.deliverables.map((d, idx) => (idx === i ? { ...d, ...patch } : d)),
    }));
  }

  function updateMilestone(i: number, patch: Partial<ContractMilestone>) {
    setBody((prev) => ({
      ...prev,
      milestones: prev.milestones.map((m, idx) => (idx === i ? { ...m, ...patch } : m)),
    }));
  }

  function updatePayment(i: number, patch: Partial<ContractPaymentItem>) {
    setBody((prev) => ({
      ...prev,
      payment_schedule: prev.payment_schedule.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    }));
  }

  useEffect(() => {
    if (templates.length && !viewing && !body.scope_of_work) {
      applyTemplate('okang_service_agreement', false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.length]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Contracts</h1>
          <p>Professional service agreements — templates, quotation import, preview and PDF.</p>
        </div>
        <div className="page-head-actions">
          <label className="show-dev-toggle">
            <input
              type="checkbox"
              checked={showDev}
              onChange={(e) => {
                setShowDev(e.target.checked);
                saveShowDevRecords(e.target.checked);
              }}
            />
            Show test records
          </label>
          <Link to="/finance/quotes">
            <button type="button" className="secondary">
              Quotations
            </button>
          </Link>
          {canManage ? (
            <button type="button" className="secondary" onClick={() => resetBuilder()}>
              New contract
            </button>
          ) : null}
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {(canManage || viewing) && (
        <div className="quote-builder-grid contract-builder-grid">
          {canManage && isEditable ? (
            <form className="panel form-compact" onSubmit={saveDraft}>
              <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit agreement draft' : 'Contract builder'}</h2>
              <p className="muted" style={{ marginTop: 0 }}>
                Only <strong>accepted</strong> quotations can be imported. Draft quotes (e.g. OKG-Q-000002) cannot
                create a binding agreement.
              </p>

              <div className="row-2">
                <label>
                  Template
                  <select
                    value={templateCode}
                    onChange={(e) => applyTemplate(e.target.value, true)}
                    disabled={!isEditable}
                  >
                    {templates.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Client
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)} required disabled={!isEditable}>
                    <option value="">Select…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="row-2">
                <label>
                  Accepted quotation (optional)
                  <select
                    value={quoteId}
                    onChange={(e) => importAcceptedQuote(e.target.value)}
                    disabled={!isEditable || Boolean(editingId && viewing?.quotation_snapshot_json)}
                  >
                    <option value="">None — independent contract</option>
                    {quotes
                      .filter((q) => !clientId || q.client_id === clientId)
                      .map((q) => (
                        <option key={q.id} value={q.id}>
                          {q.quote_number} · {q.currency_code} {Number(q.total).toFixed(2)}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Project (optional)
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)} disabled={!isEditable}>
                    <option value="">None</option>
                    {projects
                      .filter((p) => !clientId || p.client_id === clientId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="row-2">
                <label>
                  Agreement title
                  <input value={title} onChange={(e) => setTitle(e.target.value)} required disabled={!isEditable} />
                </label>
                <label>
                  Currency
                  <select
                    value={currency}
                    onChange={(e) => setCurrencyAndJurisdiction(e.target.value)}
                    disabled={!isEditable}
                  >
                    <option value="GBP">GBP</option>
                    <option value="GHS">GHS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
              </div>

              <div className="row-2">
                <label>
                  Governing jurisdiction
                  <select
                    value={parseJurisdiction(body.governing_jurisdiction)}
                    onChange={(e) => setJurisdiction(parseJurisdiction(e.target.value))}
                    disabled={!isEditable}
                  >
                    {JURISDICTION_OPTIONS.map((j) => (
                      <option key={j.code} value={j.code}>
                        {j.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Effective on
                  <input
                    type="date"
                    value={effectiveOn}
                    onChange={(e) => setEffectiveOn(e.target.value)}
                    disabled={!isEditable}
                  />
                </label>
              </div>

              <div className="row-2">
                <label>
                  Ends on
                  <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} disabled={!isEditable} />
                </label>
                <div />
              </div>

              <label>
                Scope of work
                <textarea
                  rows={4}
                  value={body.scope_of_work}
                  onChange={(e) => setBody((b) => ({ ...b, scope_of_work: e.target.value }))}
                  disabled={!isEditable}
                />
              </label>

              <fieldset className="panel" style={{ border: 'none', padding: 0 }}>
                <legend>Schedule of services</legend>
                {serviceDrafts.map((s, i) => (
                  <div className="row-3" key={i} style={{ marginBottom: '0.5rem' }}>
                    <label>
                      Description
                      <input
                        value={s.description}
                        onChange={(e) => updateServiceDraft(i, { description: e.target.value })}
                        disabled={!isEditable}
                      />
                    </label>
                    <label>
                      Qty
                      <input
                        className="quote-num-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={s.quantity}
                        onChange={(e) =>
                          updateServiceDraft(i, { quantity: e.target.value.replace(/[^\d.]/g, '') })
                        }
                        disabled={!isEditable}
                      />
                    </label>
                    <label>
                      Unit amount
                      <input
                        className="quote-num-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0.00"
                        value={s.unit_amount}
                        onChange={(e) =>
                          updateServiceDraft(i, { unit_amount: e.target.value.replace(/[^\d.]/g, '') })
                        }
                        disabled={!isEditable}
                      />
                    </label>
                  </div>
                ))}
                {isEditable ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setServiceDrafts((prev) => [...prev, emptyServiceDraft()])}
                  >
                    Add service line
                  </button>
                ) : null}
                <div className="row-2" style={{ marginTop: '0.75rem' }}>
                  <label>
                    Tax type
                    <select
                      value={taxMode}
                      onChange={(e) => setTaxMode(e.target.value === 'fixed' ? 'fixed' : 'percent')}
                      disabled={!isEditable}
                    >
                      <option value="percent">Percentage of services</option>
                      <option value="fixed">Fixed tax amount</option>
                    </select>
                  </label>
                  {taxMode === 'percent' ? (
                    <label>
                      Tax rate (%)
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ''))}
                        disabled={!isEditable}
                      />
                    </label>
                  ) : (
                    <label>
                      Fixed tax amount ({currency})
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={taxFixed}
                        onChange={(e) => setTaxFixed(e.target.value.replace(/[^\d.]/g, ''))}
                        disabled={!isEditable}
                      />
                    </label>
                  )}
                </div>
                <p className="muted-sm" style={{ margin: '0.35rem 0 0' }}>
                  {taxMode === 'percent'
                    ? 'Percentage tax applies only to the taxable service subtotal. Zero services ⇒ zero tax.'
                    : 'Fixed tax is an explicit amount (not a percentage).'}{' '}
                  Live: subtotal {formatMoney(currency, liveTotals.subtotal)} · tax{' '}
                  {formatMoney(currency, liveTotals.tax)} · total{' '}
                  <strong>{formatMoney(currency, liveTotals.total)}</strong> (server recalculates on save).
                </p>
              </fieldset>

              <fieldset className="panel" style={{ border: 'none', padding: 0 }}>
                <legend>Deliverables</legend>
                {body.deliverables.map((d, i) => (
                  <div className="row-2" key={i} style={{ marginBottom: '0.5rem' }}>
                    <label>
                      Title
                      <input
                        value={d.title}
                        onChange={(e) => updateDeliverable(i, { title: e.target.value })}
                        disabled={!isEditable}
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={d.description}
                        onChange={(e) => updateDeliverable(i, { description: e.target.value })}
                        disabled={!isEditable}
                      />
                    </label>
                  </div>
                ))}
                {isEditable ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setBody((b) => ({ ...b, deliverables: [...b.deliverables, { title: '', description: '' }] }))
                    }
                  >
                    Add deliverable
                  </button>
                ) : null}
              </fieldset>

              <fieldset className="panel" style={{ border: 'none', padding: 0 }}>
                <legend>Milestones</legend>
                {body.milestones.map((m, i) => (
                  <div className="row-3" key={i} style={{ marginBottom: '0.5rem' }}>
                    <label>
                      Title
                      <input
                        value={m.title}
                        onChange={(e) => updateMilestone(i, { title: e.target.value })}
                        disabled={!isEditable}
                      />
                    </label>
                    <label>
                      Offset (days)
                      <input
                        type="number"
                        value={m.due_offset_days ?? ''}
                        onChange={(e) =>
                          updateMilestone(i, { due_offset_days: e.target.value ? Number(e.target.value) : undefined })
                        }
                        disabled={!isEditable}
                      />
                    </label>
                    <label>
                      Description
                      <input
                        value={m.description}
                        onChange={(e) => updateMilestone(i, { description: e.target.value })}
                        disabled={!isEditable}
                      />
                    </label>
                  </div>
                ))}
                {isEditable ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      setBody((b) => ({
                        ...b,
                        milestones: [...b.milestones, { title: '', description: '', due_offset_days: 14 }],
                      }))
                    }
                  >
                    Add milestone
                  </button>
                ) : null}
              </fieldset>

              <fieldset className="panel" style={{ border: 'none', padding: 0 }}>
                <legend>Payment schedule</legend>
                <label>
                  Payment terms summary
                  <input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    disabled={!isEditable}
                  />
                </label>
                {body.payment_schedule.map((p, i) => (
                  <div className="row-3" key={i} style={{ marginBottom: '0.5rem' }}>
                    <label>
                      Label
                      <input
                        value={p.label}
                        onChange={(e) => updatePayment(i, { label: e.target.value })}
                        disabled={!isEditable}
                      />
                    </label>
                    <label>
                      Percent
                      <input
                        type="number"
                        step="0.01"
                        value={p.percent}
                        onChange={(e) => updatePayment(i, { percent: Number(e.target.value) || 0 })}
                        disabled={!isEditable}
                      />
                    </label>
                    <label>
                      Trigger
                      <select
                        value={p.trigger}
                        onChange={(e) => updatePayment(i, { trigger: e.target.value })}
                        disabled={!isEditable}
                      >
                        <option value="on_acceptance">On acceptance</option>
                        <option value="milestone">Milestone</option>
                        <option value="on_completion">On completion</option>
                        <option value="custom">Custom</option>
                      </select>
                    </label>
                  </div>
                ))}
              </fieldset>

              <label>
                OkangGroup responsibilities
                <textarea
                  rows={3}
                  value={body.okang_responsibilities}
                  onChange={(e) => setBody((b) => ({ ...b, okang_responsibilities: e.target.value }))}
                  disabled={!isEditable}
                />
              </label>
              <label>
                Client responsibilities
                <textarea
                  rows={3}
                  value={body.client_responsibilities}
                  onChange={(e) => setBody((b) => ({ ...b, client_responsibilities: e.target.value }))}
                  disabled={!isEditable}
                />
              </label>
              <label>
                Terms and conditions
                <textarea
                  rows={6}
                  value={body.terms_and_conditions}
                  onChange={(e) => setBody((b) => ({ ...b, terms_and_conditions: e.target.value }))}
                  disabled={!isEditable}
                />
              </label>

              {isEditable ? (
                <button type="submit" disabled={busy}>
                  {busy ? 'Saving…' : editingId ? 'Save draft' : 'Create draft contract'}
                </button>
              ) : null}
            </form>
          ) : null}

          <div className="contract-preview-column">
            {!isEditable && viewing ? (
              <div className="panel no-print" style={{ marginBottom: '0.75rem' }}>
                <h2 style={{ marginTop: 0 }}>Viewing {viewing.contract_number}</h2>
                <p className="muted-sm">
                  Status: <span className="status-chip">{labelContractStatus(viewing.status)}</span>
                  {' · '}v{viewing.version_no}. PDF uses the saved agreement and server-calculated totals.
                </p>
              </div>
            ) : null}

            <div className="quote-preview-shell contract-preview-shell">
              <div className="quote-preview-toolbar no-print">
                <p className="muted-sm" style={{ margin: 0 }}>
                  {isEditable ? (
                    <>
                      Live agreement preview
                      {viewing ? (
                        <>
                          {' '}
                          · saved <strong>{viewing.contract_number}</strong>
                        </>
                      ) : (
                        ' · unsaved draft'
                      )}
                    </>
                  ) : (
                    <>
                      Preview of saved <strong>{viewing?.contract_number}</strong>
                    </>
                  )}{' '}
                  <span className="status-chip">
                    {labelContractStatus(previewModel?.status ?? viewing?.status ?? 'draft')}
                  </span>
                </p>
                <div className="page-head-actions">
                  <button type="button" className="secondary" onClick={() => setPreviewOpen((v) => !v)}>
                    {previewOpen ? 'Hide preview' : 'Show preview'}
                  </button>
                  <button
                    type="button"
                    className="quote-print-btn"
                    disabled={busy || !viewing}
                    onClick={() => void downloadPdf()}
                    title={!viewing ? 'Save the contract first' : 'Download saved agreement PDF'}
                  >
                    {busy ? 'Preparing PDF…' : 'Download PDF'}
                  </button>
                </div>
              </div>

              {canManage && viewing ? (
                <div className="page-head-actions no-print" style={{ marginBottom: '0.75rem' }}>
                  {nextTransitions(viewing.status).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void transition(s)}
                    >
                      → {labelContractStatus(s)}
                    </button>
                  ))}
                  {['sent', 'approved'].includes(viewing.status) ? (
                    <button type="button" disabled={busy} onClick={() => setAcceptOpen(true)}>
                      Record acceptance
                    </button>
                  ) : null}
                  {['accepted', 'active', 'sent', 'approved', 'rejected', 'completed'].includes(viewing.status) ? (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void revise()}>
                      Create amendment
                    </button>
                  ) : null}
                  {['accepted', 'active'].includes(viewing.status) ? (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void generateInvoices()}>
                      Generate invoices
                    </button>
                  ) : null}
                </div>
              ) : null}

              {viewing?.quotation_snapshot_json ? (
                <p className="muted-sm no-print">
                  Quotation snapshot locked:{' '}
                  {(viewing.quotation_snapshot_json as { quote_number?: string }).quote_number ?? 'linked quote'} —
                  later quotation edits will not change this agreement.
                </p>
              ) : null}

              {acceptOpen && viewing ? (
                <form className="panel form-compact no-print" onSubmit={recordAcceptance} style={{ marginBottom: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>Record client acceptance</h3>
                  <p className="muted-sm" style={{ marginTop: 0 }}>
                    Stores evidence of acceptance (name, time, method, document version). This is not a certified
                    electronic signature.
                  </p>
                  <div className="row-2">
                    <label>
                      Accepted by (name)
                      <input value={acceptName} onChange={(e) => setAcceptName(e.target.value)} required />
                    </label>
                    <label>
                      Email (optional)
                      <input type="email" value={acceptEmail} onChange={(e) => setAcceptEmail(e.target.value)} />
                    </label>
                  </div>
                  <div className="row-2">
                    <label>
                      Method
                      <select value={acceptMethod} onChange={(e) => setAcceptMethod(e.target.value)}>
                        <option value="recorded_in_okanggroup">Recorded in OkangGroup</option>
                        <option value="email_confirmation">Email confirmation</option>
                        <option value="signed_pdf_returned">Signed PDF returned</option>
                        <option value="in_person">In person</option>
                      </select>
                    </label>
                    <label>
                      Evidence note
                      <input value={acceptNote} onChange={(e) => setAcceptNote(e.target.value)} />
                    </label>
                  </div>
                  <div className="page-head-actions">
                    <button type="submit" disabled={busy}>
                      Save acceptance
                    </button>
                    <button type="button" className="secondary" onClick={() => setAcceptOpen(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}

              {previewOpen && previewModel ? (
                <div id="contract-print-area" className="quote-print-root contract-print-root">
                  <ContractDocument model={previewModel} />
                </div>
              ) : (
                <p className="muted-sm no-print">Preview hidden. Show preview to review the full agreement.</p>
              )}

              {/* Off-screen saved copy for PDF — always server totals, never unsaved live draft */}
              {viewing ? (
                <div className="quote-print-host quote-print-host-export" aria-hidden="true">
                  <div data-contract-saved="1" className="quote-print-root">
                    <ContractDocument model={toDocumentModel(viewing)} />
                  </div>
                </div>
              ) : null}

              {versions.length > 0 ? (
                <div className="no-print" style={{ marginTop: '1rem' }}>
                  <h3>Version history</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Note</th>
                        <th>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((v) => (
                        <tr key={v.id}>
                          <td>v{v.version_no}</td>
                          <td>{labelContractStatus(v.status)}</td>
                          <td>{v.change_note ?? '—'}</td>
                          <td>{new Date(v.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: '1.5rem' }}>Contract register</h2>
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>Title</th>
            <th>Client</th>
            <th>Value</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr
              key={r.id}
              className="clickable-row"
              onClick={() => openContract(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openContract(r);
                }
              }}
              tabIndex={0}
              role="button"
            >
              <td>{r.contract_number}</td>
              <td>{r.title}</td>
              <td>{r.clients?.legal_name}</td>
              <td>
                {r.currency_code}{' '}
                {r.value_amount != null ? Number(r.value_amount).toFixed(2) : '—'}
              </td>
              <td>
                <span className="status-chip">{labelContractStatus(r.status)}</span>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <button type="button" className="linkish" onClick={() => openContract(r)}>
                  {EDITABLE_CONTRACT_STATUSES.has(r.status) && canManage ? 'Edit' : 'View / PDF'}
                </button>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={6}>No contracts.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
