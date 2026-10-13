import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { InvoiceDocument, type InvoiceDocumentModel } from '../components/InvoiceDocument';
import { formatMoney, looksLikeDevRecord } from '../lib/devRecords';
import { exportInvoicePdf } from '../lib/exportInvoicePdf';
import {
  computeInvoiceTotals,
  isEditableInvoiceStatus,
  isOpenInvoiceStatus,
  labelInvoiceStatus,
  parseInvoiceTaxMode,
  PAYMENT_METHODS,
  summariseByCurrency,
  type InvoiceLine,
  type InvoiceTaxMode,
} from '../lib/invoiceMath';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  currency_code: string;
  subtotal: number;
  tax_total: number;
  discount_total: number | null;
  total: number;
  amount_paid: number;
  amount_credited: number;
  amount_outstanding: number;
  client_id: string;
  contract_id: string | null;
  project_id: string | null;
  quotation_id: string | null;
  issue_date: string | null;
  due_date: string | null;
  notes: string | null;
  payment_instructions: string | null;
  tax_snapshot_json: unknown;
  schedule_key: string | null;
  created_at: string;
  clients?: { legal_name: string } | null;
  contracts?: { contract_number: string } | null;
};

type Client = { id: string; legal_name: string };
type ContractOption = {
  id: string;
  contract_number: string;
  title: string;
  status: string;
  client_id: string;
  currency_code: string;
  project_id: string | null;
  quotation_id: string | null;
};
type Project = { id: string; name: string; client_id: string };
type PaymentRow = {
  id: string;
  amount: number;
  paid_on: string;
  method: string;
  provider_ref: string | null;
  status: string;
  notes: string | null;
};
type CreditRow = {
  id: string;
  credit_number: string;
  amount: number;
  reason: string;
  status: string;
  created_at: string;
};
type ReminderRow = {
  id: string;
  reminder_type: string;
  message: string | null;
  sent_at: string;
};
type SavedLine = {
  description: string;
  quantity: number;
  unit_amount: number;
  line_total: number;
};

type LineDraft = { description: string; quantity: string; unit_amount: string };
type ActionPanel = 'pay' | 'credit' | 'cancel' | null;

const CURRENCIES = ['GBP', 'GHS', 'USD', 'EUR'];

const emptyLineDraft = (): LineDraft => ({ description: '', quantity: '1', unit_amount: '' });

function numOrZero(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function draftsToLines(drafts: LineDraft[]): InvoiceLine[] {
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

function parseSnapshot(raw: unknown): {
  mode: InvoiceTaxMode;
  rate: number;
  fixed: number;
  discount: number;
} {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    mode: parseInvoiceTaxMode(s.tax_mode),
    rate: Number(s.tax_rate) || 0,
    fixed: Number(s.tax_fixed) || 0,
    discount: Number(s.discount_total) || 0,
  };
}

function taxLabelFor(mode: InvoiceTaxMode, rate: number): string {
  if (mode === 'percent' && rate > 0) return `Tax (${rate}%)`;
  if (mode === 'fixed') return 'Tax (fixed)';
  return 'Tax';
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function methodLabel(code: string): string {
  return PAYMENT_METHODS.find((m) => m.code === code)?.label ?? code.replace(/_/g, ' ');
}

const today = () => new Date().toISOString().slice(0, 10);

export function FinanceInvoicesPage() {
  const { can } = useAuth();
  const canManage = can('finance.invoices.manage');
  const canIssue = can('finance.invoices.issue');
  const canPay = can('finance.payments.record');
  const canRead = can('finance.invoices.read');
  const canAdjust = canManage || canIssue;

  const [rows, setRows] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  const [viewing, setViewing] = useState<Invoice | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [savedLines, setSavedLines] = useState<SavedLine[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);

  // Builder form
  const [clientId, setClientId] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [contractId, setContractId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [quotationId, setQuotationId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [lineDrafts, setLineDrafts] = useState<LineDraft[]>([emptyLineDraft()]);
  const [taxMode, setTaxMode] = useState<InvoiceTaxMode>('percent');
  const [taxRate, setTaxRate] = useState('');
  const [taxFixed, setTaxFixed] = useState('');
  const [discount, setDiscount] = useState('');
  const [paymentInstructions, setPaymentInstructions] = useState('');
  const [notes, setNotes] = useState('');

  // Contract schedule generation
  const [genContractId, setGenContractId] = useState('');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [showDev, setShowDev] = useState(loadShowDevRecords);

  // Action panels
  const [panel, setPanel] = useState<ActionPanel>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(today());
  const [payMethod, setPayMethod] = useState<string>('bank_transfer');
  const [payRef, setPayRef] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [reminderType, setReminderType] = useState('manual');

  const [previewOpen, setPreviewOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isEditable = Boolean(canManage && (!viewing || isEditableInvoiceStatus(viewing.status)));

  const clientName =
    clients.find((c) => c.id === (viewing?.client_id ?? clientId))?.legal_name ??
    viewing?.clients?.legal_name ??
    'Client';

  const liveLines = useMemo(() => draftsToLines(lineDrafts), [lineDrafts]);
  const liveTotals = useMemo(
    () =>
      computeInvoiceTotals(liveLines, {
        taxMode,
        taxRate: Number(taxRate) || 0,
        taxFixed: Number(taxFixed) || 0,
        discountTotal: Number(discount) || 0,
      }),
    [liveLines, taxMode, taxRate, taxFixed, discount],
  );

  const devVisibleRows = useMemo(
    () =>
      showDev
        ? rows
        : rows.filter((r) => !looksLikeDevRecord(r.clients?.legal_name, r.invoice_number)),
    [rows, showDev],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devVisibleRows.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (clientFilter && r.client_id !== clientFilter) return false;
      if (currencyFilter && r.currency_code !== currencyFilter) return false;
      if (q) {
        const hay = [r.invoice_number, r.clients?.legal_name, r.contracts?.contract_number, r.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [devVisibleRows, search, statusFilter, clientFilter, currencyFilter]);

  // Currency-separated summaries — never summed across currencies.
  const summaries = useMemo(() => {
    const base = summariseByCurrency(devVisibleRows);
    return base.map((s) => {
      const overdue = devVisibleRows
        .filter((r) => (r.currency_code || 'GBP').toUpperCase() === s.currency && r.status === 'overdue')
        .reduce((sum, r) => sum + (Number(r.amount_outstanding) || 0), 0);
      const paid = devVisibleRows
        .filter((r) => (r.currency_code || 'GBP').toUpperCase() === s.currency && r.status !== 'draft')
        .reduce((sum, r) => sum + (Number(r.amount_paid) || 0), 0);
      return {
        ...s,
        overdue: Math.round(overdue * 100) / 100,
        paid: Math.round(paid * 100) / 100,
      };
    });
  }, [devVisibleRows]);

  async function load(): Promise<Invoice[]> {
    const [{ data, error: err }, { data: c }, { data: ct }, { data: p }] = await Promise.all([
      supabase
        .from('invoices')
        .select(
          'id, invoice_number, status, currency_code, subtotal, tax_total, discount_total, total, amount_paid, amount_credited, amount_outstanding, client_id, contract_id, project_id, quotation_id, issue_date, due_date, notes, payment_instructions, tax_snapshot_json, schedule_key, created_at, clients(legal_name), contracts(contract_number)',
        )
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, legal_name').order('legal_name'),
      supabase
        .from('contracts')
        .select('id, contract_number, title, status, client_id, currency_code, project_id, quotation_id')
        .in('status', ['accepted', 'active'])
        .order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, client_id').order('name'),
    ]);
    let mapped: Invoice[] = [];
    if (err) setError(err.message);
    else {
      mapped = ((data as unknown as Invoice[]) ?? []).map((r) => ({
        ...r,
        clients: one(r.clients),
        contracts: one(r.contracts),
      }));
      setRows(mapped);
    }
    setClients((c as Client[]) ?? []);
    setContracts((ct as ContractOption[]) ?? []);
    setProjects((p as Project[]) ?? []);
    return mapped;
  }

  useEffect(() => {
    void load();
  }, []);

  function resetBuilder() {
    setEditingId(null);
    setViewing(null);
    setSavedLines([]);
    setPayments([]);
    setCredits([]);
    setReminders([]);
    setClientId('');
    setCurrency('GBP');
    setContractId('');
    setProjectId('');
    setQuotationId('');
    setIssueDate('');
    setDueDate('');
    setLineDrafts([emptyLineDraft()]);
    setTaxMode('percent');
    setTaxRate('');
    setTaxFixed('');
    setDiscount('');
    setPaymentInstructions('');
    setNotes('');
    setPanel(null);
  }

  async function loadDetail(invoiceId: string) {
    const [l, p, c, r] = await Promise.all([
      supabase
        .from('invoice_lines')
        .select('description, quantity, unit_amount, line_total, sort_order')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true }),
      supabase
        .from('payment_records')
        .select('id, amount, paid_on, method, provider_ref, status, notes')
        .eq('invoice_id', invoiceId)
        .order('paid_on', { ascending: false }),
      supabase
        .from('credit_notes')
        .select('id, credit_number, amount, reason, status, created_at')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false }),
      supabase
        .from('invoice_reminders')
        .select('id, reminder_type, message, sent_at')
        .eq('invoice_id', invoiceId)
        .order('sent_at', { ascending: false }),
    ]);
    const lines = ((l.data as unknown as SavedLine[]) ?? []).map((x) => ({
      description: x.description,
      quantity: Number(x.quantity),
      unit_amount: Number(x.unit_amount),
      line_total: Number(x.line_total),
    }));
    setSavedLines(lines);
    setPayments(((p.data as PaymentRow[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
    setCredits(((c.data as CreditRow[]) ?? []).map((x) => ({ ...x, amount: Number(x.amount) })));
    setReminders((r.data as ReminderRow[]) ?? []);
    return lines;
  }

  async function openInvoice(inv: Invoice) {
    setViewing(inv);
    setPanel(null);
    const editable = canManage && isEditableInvoiceStatus(inv.status);
    setEditingId(editable ? inv.id : null);
    setClientId(inv.client_id);
    setCurrency(inv.currency_code);
    setContractId(inv.contract_id ?? '');
    setProjectId(inv.project_id ?? '');
    setQuotationId(inv.quotation_id ?? '');
    setIssueDate(inv.issue_date ?? '');
    setDueDate(inv.due_date ?? '');
    setNotes(inv.notes ?? '');
    setPaymentInstructions(inv.payment_instructions ?? '');
    const snap = parseSnapshot(inv.tax_snapshot_json);
    setTaxMode(snap.mode);
    setTaxRate(snap.rate ? String(snap.rate) : '');
    setTaxFixed(snap.mode === 'fixed' && snap.fixed ? String(snap.fixed) : '');
    setDiscount(snap.discount || Number(inv.discount_total) ? String(snap.discount || Number(inv.discount_total)) : '');
    setPayAmount(String(Number(inv.amount_outstanding) || ''));
    setPayDate(today());
    setPreviewOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const lines = await loadDetail(inv.id);
    setLineDrafts(
      lines.length
        ? lines.map((x) => ({
            description: x.description,
            quantity: String(x.quantity),
            unit_amount: x.unit_amount === 0 ? '' : String(x.unit_amount),
          }))
        : [emptyLineDraft()],
    );
  }

  async function reopen(id: string) {
    const fresh = await load();
    const inv = fresh.find((r) => r.id === id);
    if (inv) await openInvoice(inv);
  }

  function pickContract(id: string) {
    setContractId(id);
    if (!id) return;
    const c = contracts.find((x) => x.id === id);
    if (!c) return;
    if (!editingId) {
      setClientId(c.client_id);
      setCurrency(c.currency_code);
    }
    if (c.project_id && !projectId) setProjectId(c.project_id);
    if (c.quotation_id) setQuotationId(c.quotation_id);
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !isEditable) return;
    const lines = liveLines
      .filter((l) => l.description.trim() || l.unit_amount > 0)
      .map((l) => ({
        description: l.description.trim() || 'Services',
        quantity: l.quantity,
        unit_amount: l.unit_amount,
      }));
    if (!clientId) {
      setError('Select a client before saving.');
      return;
    }
    if (!lines.length) {
      setError('Add at least one service line.');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('save_invoice_draft', {
      p_client_id: clientId,
      p_currency: currency,
      p_lines: lines,
      p_tax_mode: taxMode,
      p_tax_rate: Number(taxRate) || 0,
      p_tax_fixed: Number(taxFixed) || 0,
      p_discount_total: Number(discount) || 0,
      p_due_date: dueDate || null,
      p_issue_date: issueDate || null,
      p_notes: notes.trim() || null,
      p_payment_instructions: paymentInstructions.trim() || null,
      p_contract_id: contractId || null,
      p_project_id: projectId || null,
      p_quotation_id: quotationId || null,
      p_invoice_id: editingId,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const saved = data as Invoice;
    setMessage(
      editingId
        ? `Draft ${saved.invoice_number ?? ''} updated (server recalculated totals).`
        : `Draft invoice ${saved.invoice_number ?? ''} created.`,
    );
    await reopen(saved.id);
  }

  async function runAction(
    fn: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
    reopenId?: string,
  ): Promise<boolean> {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: err } = await fn();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    setMessage(success);
    setPanel(null);
    if (reopenId) await reopen(reopenId);
    else await load();
    return true;
  }

  async function issue() {
    if (!viewing || !canIssue) return;
    await runAction(
      () => supabase.rpc('issue_invoice', { p_invoice_id: viewing.id }),
      `Invoice ${viewing.invoice_number} issued.`,
      viewing.id,
    );
  }

  async function submitPayment(e: FormEvent) {
    e.preventDefault();
    if (!viewing || !canPay) return;
    const amt = Number(payAmount);
    if (!(amt > 0)) {
      setError('Enter a payment amount greater than zero.');
      return;
    }
    const ok = await runAction(
      () =>
        supabase.rpc('record_invoice_payment', {
          p_invoice_id: viewing.id,
          p_amount: amt,
          p_paid_on: payDate || today(),
          p_method: payMethod,
          p_notes: payNotes.trim() || null,
          p_provider_ref: payRef.trim() || null,
        }),
      `Payment of ${formatMoney(viewing.currency_code, amt)} recorded.`,
      viewing.id,
    );
    if (ok) {
      setPayRef('');
      setPayNotes('');
    }
  }

  async function submitCredit(e: FormEvent) {
    e.preventDefault();
    if (!viewing || !canAdjust) return;
    const amt = Number(creditAmount);
    if (!(amt > 0)) {
      setError('Enter a credit amount greater than zero.');
      return;
    }
    if (!creditReason.trim()) {
      setError('A reason is required for a credit note.');
      return;
    }
    const ok = await runAction(
      () =>
        supabase.rpc('apply_credit_note', {
          p_invoice_id: viewing.id,
          p_amount: amt,
          p_reason: creditReason.trim(),
        }),
      `Credit of ${formatMoney(viewing.currency_code, amt)} applied.`,
      viewing.id,
    );
    if (ok) {
      setCreditAmount('');
      setCreditReason('');
    }
  }

  async function submitCancel(e: FormEvent) {
    e.preventDefault();
    if (!viewing || !canAdjust) return;
    const ok = await runAction(
      () =>
        supabase.rpc('cancel_invoice', {
          p_invoice_id: viewing.id,
          p_reason: cancelReason.trim() || null,
        }),
      `Invoice ${viewing.invoice_number} cancelled.`,
      viewing.id,
    );
    if (ok) setCancelReason('');
  }

  async function sendReminder() {
    if (!viewing || !canAdjust) return;
    await runAction(
      () =>
        supabase.rpc('queue_invoice_reminder', {
          p_invoice_id: viewing.id,
          p_reminder_type: reminderType,
        }),
      'Reminder queued (in-app, no client email).',
      viewing.id,
    );
  }

  async function refreshOverdue() {
    if (!canAdjust) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('refresh_overdue_invoices');
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const n =
      (data as { marked_overdue?: number; updated?: number; count?: number } | null)?.marked_overdue ??
      (data as { updated?: number } | null)?.updated ??
      (data as { count?: number } | null)?.count;
    setMessage(n != null ? `Overdue status refreshed (${n} updated).` : 'Overdue status refreshed.');
    if (viewing) await reopen(viewing.id);
    else await load();
  }

  async function generateFromContract() {
    if (!genContractId || !canManage) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('create_invoices_from_contract_schedule', {
      p_contract_id: genContractId,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    const res = (data ?? {}) as {
      created?: number;
      skipped?: number;
      schedule_total?: number;
      already_invoiced?: string[];
      message?: string;
      contract_number?: string;
    };
    const detail =
      res.message ||
      (res.created
        ? `Created ${res.created} draft invoice(s).`
        : res.skipped
          ? `No new drafts. ${res.skipped} milestone(s) already invoiced` +
            (res.already_invoiced?.length ? ` (${res.already_invoiced.join(', ')})` : '') +
            '.'
          : 'No new drafts — no remaining uninvoiced milestones.');
    setMessage(detail);
    await load();
  }

  async function downloadPdf() {
    if (!viewing) {
      setError('Save the invoice before downloading a PDF. The PDF always uses the saved invoice and server totals.');
      return;
    }
    const savedEl = document.querySelector('[data-invoice-saved="1"]') as HTMLElement | null;
    if (!savedEl) {
      setError('Saved invoice is not ready to export.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const host = document.createElement('div');
      host.className = 'quote-print-host quote-print-host-export';
      const clone = savedEl.cloneNode(true) as HTMLElement;
      clone.removeAttribute('data-invoice-saved');
      host.appendChild(clone);
      document.body.appendChild(host);
      try {
        const result = await exportInvoicePdf({
          element: clone,
          fileName: `${viewing.invoice_number}.pdf`,
        });
        setMessage(
          result.pages === 1
            ? `Downloaded ${result.fileName} (saved invoice, server totals).`
            : `Downloaded ${result.fileName} (${result.pages} pages · saved invoice).`,
        );
      } finally {
        host.remove();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setBusy(false);
    }
  }

  function updateLine(i: number, patch: Partial<LineDraft>) {
    setLineDrafts((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function removeLine(i: number) {
    setLineDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function toSavedModel(inv: Invoice): InvoiceDocumentModel {
    const snap = parseSnapshot(inv.tax_snapshot_json);
    return {
      invoice_number: inv.invoice_number,
      status: inv.status,
      currency_code: inv.currency_code,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      subtotal: Number(inv.subtotal) || 0,
      tax_total: Number(inv.tax_total) || 0,
      discount_total: Number(inv.discount_total) || 0,
      total: Number(inv.total) || 0,
      amount_paid: Number(inv.amount_paid) || 0,
      amount_credited: Number(inv.amount_credited) || 0,
      amount_outstanding: Number(inv.amount_outstanding) || 0,
      notes: inv.notes,
      payment_instructions: inv.payment_instructions,
      client_name: inv.clients?.legal_name ?? clients.find((c) => c.id === inv.client_id)?.legal_name ?? 'Client',
      lines: savedLines,
      tax_label: taxLabelFor(snap.mode, snap.rate),
      contract_number: inv.contracts?.contract_number ?? null,
      payments: payments
        .filter((p) => p.status === 'recorded')
        .map((p) => ({
          paid_on: p.paid_on,
          amount: p.amount,
          method: p.method,
          provider_ref: p.provider_ref,
        })),
      credits: credits
        .filter((c) => c.status === 'applied' || c.status === 'issued')
        .map((c) => ({
          credit_number: c.credit_number,
          amount: c.amount,
          reason: c.reason,
        })),
    };
  }

  const contractNumberFor = (id: string) => contracts.find((c) => c.id === id)?.contract_number ?? null;

  const liveModel: InvoiceDocumentModel | null =
    isEditable && (viewing || clientId)
      ? {
          invoice_number: viewing?.invoice_number ?? 'DRAFT',
          status: viewing?.status ?? 'draft',
          currency_code: currency,
          issue_date: issueDate || null,
          due_date: dueDate || null,
          subtotal: liveTotals.subtotal,
          tax_total: liveTotals.tax,
          discount_total: liveTotals.discount,
          total: liveTotals.total,
          amount_paid: Number(viewing?.amount_paid) || 0,
          amount_credited: Number(viewing?.amount_credited) || 0,
          amount_outstanding: Math.max(
            0,
            Math.round(
              (liveTotals.total -
                (Number(viewing?.amount_paid) || 0) -
                (Number(viewing?.amount_credited) || 0)) *
                100,
            ) / 100,
          ),
          notes: notes || null,
          payment_instructions: paymentInstructions || null,
          client_name: clientName,
          lines: liveLines.filter((l) => l.description.trim() || l.unit_amount > 0),
          tax_label: taxLabelFor(taxMode, Number(taxRate) || 0),
          contract_number: viewing?.contracts?.contract_number ?? (contractId ? contractNumberFor(contractId) : null),
        }
      : null;

  const savedModel = viewing ? toSavedModel(viewing) : null;
  const previewModel = liveModel ?? savedModel;

  const canPayNow = Boolean(viewing && canPay && isOpenInvoiceStatus(viewing.status));
  const canAdjustNow = Boolean(viewing && canAdjust && isOpenInvoiceStatus(viewing.status));
  const canCancelNow = Boolean(
    viewing && canAdjust && (viewing.status === 'draft' || isOpenInvoiceStatus(viewing.status)),
  );
  const canIssueNow = Boolean(viewing && canIssue && viewing.status === 'draft');

  const clientContracts = contracts.filter((c) => !clientId || c.client_id === clientId);
  const hasAnyAccess = canRead || canManage || canIssue || canPay;

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Invoices</h1>
          <p>Draft, issue and track invoices — payments, credits, reminders and PDF export.</p>
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
          <Link to="/finance/contracts">
            <button type="button" className="secondary">
              Contracts
            </button>
          </Link>
          <Link to="/finance/quotes">
            <button type="button" className="secondary">
              Quotations
            </button>
          </Link>
          <Link to="/finance/expenses">
            <button type="button" className="secondary">
              Expenses
            </button>
          </Link>
          {canAdjust ? (
            <button type="button" className="secondary" disabled={busy} onClick={() => void refreshOverdue()}>
              Refresh overdue
            </button>
          ) : null}
          {canManage ? (
            <button type="button" className="secondary" onClick={() => resetBuilder()}>
              New invoice
            </button>
          ) : null}
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}
      {!hasAnyAccess ? <div className="error">You do not have access to invoices.</div> : null}

      {summaries.length > 0 ? (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {summaries.map((s) => (
              <article key={s.currency}>
                <p style={{ marginTop: 0 }}>
                  <strong>{s.currency}</strong> · {s.count} invoice{s.count === 1 ? '' : 's'}
                </p>
                <h2 style={{ fontSize: '1.5rem' }}>{formatMoney(s.currency, s.outstanding)}</h2>
                <p>Outstanding</p>
                <p>
                  Issued {formatMoney(s.currency, s.issuedTotal)} · Paid {formatMoney(s.currency, s.paid)}
                </p>
                {s.overdue > 0 ? (
                  <p style={{ color: 'var(--danger, #f87171)' }}>
                    Overdue {formatMoney(s.currency, s.overdue)}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
          <p className="muted-sm" style={{ marginTop: '-0.75rem', marginBottom: '1rem' }}>
            Totals are shown per currency and are never combined across currencies. Drafts and cancelled invoices are
            excluded from outstanding.
          </p>
        </>
      ) : null}

      {canManage ? (
        <div className="panel form-compact" style={{ marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Generate from contract schedule</h2>
          <div className="row-2">
            <label>
              Accepted / active contract
              <select value={genContractId} onChange={(e) => setGenContractId(e.target.value)}>
                <option value="">Select contract…</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.contract_number} · {c.title} ({c.status})
                  </option>
                ))}
              </select>
            </label>
            <div style={{ alignSelf: 'end' }}>
              <button
                type="button"
                className="secondary"
                disabled={busy || !genContractId}
                onClick={() => void generateFromContract()}
              >
                Generate draft invoices
              </button>
            </div>
          </div>
          <p className="muted-sm">
            Creates one draft invoice per payment-schedule item. Only <strong>accepted</strong> or{' '}
            <strong>active</strong> contracts are eligible (internal approval alone is not enough). Already-invoiced
            milestones are skipped and explained in the result message.
          </p>
        </div>
      ) : null}

      {(canManage || viewing) && (
        <div className="quote-builder-grid">
          {canManage && isEditable ? (
            <form className="panel form-compact" onSubmit={saveDraft}>
              <h2 style={{ marginTop: 0 }}>{editingId ? `Edit draft ${viewing?.invoice_number ?? ''}` : 'Invoice builder'}</h2>

              <div className="row-2">
                <label>
                  Client
                  <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                    <option value="">Select…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Currency
                  <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="row-2">
                <label>
                  Contract (optional)
                  <select value={contractId} onChange={(e) => pickContract(e.target.value)}>
                    <option value="">None</option>
                    {clientContracts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.contract_number} · {c.title}
                      </option>
                    ))}
                    {viewing?.contract_id && !clientContracts.some((c) => c.id === viewing.contract_id) ? (
                      <option value={viewing.contract_id}>
                        {viewing.contracts?.contract_number ?? 'Linked contract'}
                      </option>
                    ) : null}
                  </select>
                </label>
                <label>
                  Project (optional)
                  <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
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
                  Issue date
                  <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
                </label>
                <label>
                  Due date
                  <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </label>
              </div>
              <p className="muted-sm" style={{ marginTop: 0 }}>
                Leave dates blank to use the server defaults (issue date set on issue, due date +14 days).
              </p>

              <fieldset className="panel" style={{ border: 'none', padding: 0 }}>
                <legend>Services</legend>
                {lineDrafts.map((l, i) => (
                  <div className="row-3" key={i} style={{ marginBottom: '0.5rem' }}>
                    <label>
                      Description
                      <input
                        value={l.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                      />
                    </label>
                    <label>
                      Qty
                      <input
                        className="quote-num-input"
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={l.quantity}
                        onChange={(e) => updateLine(i, { quantity: e.target.value.replace(/[^\d.]/g, '') })}
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
                        value={l.unit_amount}
                        onChange={(e) => updateLine(i, { unit_amount: e.target.value.replace(/[^\d.]/g, '') })}
                      />
                    </label>
                    {lineDrafts.length > 1 ? (
                      <button type="button" className="linkish" onClick={() => removeLine(i)}>
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setLineDrafts((prev) => [...prev, emptyLineDraft()])}
                >
                  Add service line
                </button>

                <div className="row-2" style={{ marginTop: '0.75rem' }}>
                  <label>
                    Tax type
                    <select value={taxMode} onChange={(e) => setTaxMode(parseInvoiceTaxMode(e.target.value))}>
                      <option value="percent">Percentage of services</option>
                      <option value="fixed">Fixed tax amount</option>
                      <option value="none">No tax</option>
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
                      />
                    </label>
                  ) : taxMode === 'fixed' ? (
                    <label>
                      Fixed tax amount ({currency})
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0"
                        value={taxFixed}
                        onChange={(e) => setTaxFixed(e.target.value.replace(/[^\d.]/g, ''))}
                      />
                    </label>
                  ) : (
                    <div />
                  )}
                </div>
                <div className="row-2">
                  <label>
                    Discount ({currency})
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                    />
                  </label>
                  <div />
                </div>
                <p className="muted-sm" style={{ margin: '0.35rem 0 0' }}>
                  Live: subtotal {formatMoney(currency, liveTotals.subtotal)}
                  {liveTotals.discount > 0 ? ` · discount −${formatMoney(currency, liveTotals.discount)}` : ''} · tax{' '}
                  {formatMoney(currency, liveTotals.tax)} · total{' '}
                  <strong>{formatMoney(currency, liveTotals.total)}</strong> (server recalculates on save).
                </p>
              </fieldset>

              <label>
                Payment instructions
                <textarea
                  rows={3}
                  value={paymentInstructions}
                  onChange={(e) => setPaymentInstructions(e.target.value)}
                  placeholder="Bank / mobile money details, reference to quote…"
                />
              </label>
              <label>
                Notes
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>

              <button type="submit" disabled={busy}>
                {busy ? 'Saving…' : editingId ? 'Save draft' : 'Create draft invoice'}
              </button>
            </form>
          ) : null}

          <div className="contract-preview-column">
            {viewing ? (
              <div className="panel no-print" style={{ marginBottom: '0.75rem' }}>
                <h2 style={{ marginTop: 0 }}>
                  {viewing.invoice_number}{' '}
                  <span className="status-chip">{labelInvoiceStatus(viewing.status)}</span>
                </h2>
                <p className="muted-sm">
                  {viewing.clients?.legal_name ?? clientName}
                  {viewing.contracts?.contract_number ? ` · Contract ${viewing.contracts.contract_number}` : ''}
                  {viewing.schedule_key ? ` · Schedule: ${viewing.schedule_key}` : ''}
                </p>
                <p className="muted-sm" style={{ marginBottom: 0 }}>
                  Original invoice {formatMoney(viewing.currency_code, Number(viewing.total) || 0)} · Payments
                  received {formatMoney(viewing.currency_code, Number(viewing.amount_paid) || 0)} · Credits applied{' '}
                  {formatMoney(viewing.currency_code, Number(viewing.amount_credited) || 0)} · Outstanding{' '}
                  <strong>{formatMoney(viewing.currency_code, Number(viewing.amount_outstanding) || 0)}</strong> ·{' '}
                  {labelInvoiceStatus(viewing.status)}
                </p>
                {!isEditableInvoiceStatus(viewing.status) ? (
                  <p className="muted-sm">
                    Issued amounts are locked. Corrections use credit notes (and payments) — the original invoice total
                    is not silently edited.
                  </p>
                ) : null}
                <div className="page-head-actions">
                  {canIssueNow ? (
                    <button type="button" disabled={busy} onClick={() => void issue()}>
                      Issue invoice
                    </button>
                  ) : null}
                  {canPayNow ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPanel(panel === 'pay' ? null : 'pay')}
                    >
                      Record payment
                    </button>
                  ) : null}
                  {canAdjustNow ? (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => setPanel(panel === 'credit' ? null : 'credit')}
                    >
                      Apply credit
                    </button>
                  ) : null}
                  {canAdjustNow ? (
                    <>
                      <select
                        aria-label="Reminder type"
                        value={reminderType}
                        onChange={(e) => setReminderType(e.target.value)}
                        style={{ width: 'auto' }}
                      >
                        <option value="manual">Manual reminder</option>
                        <option value="due_soon">Due soon</option>
                        <option value="overdue">Overdue</option>
                      </select>
                      <button type="button" className="secondary" disabled={busy} onClick={() => void sendReminder()}>
                        Queue reminder
                      </button>
                    </>
                  ) : null}
                  {canCancelNow ? (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => setPanel(panel === 'cancel' ? null : 'cancel')}
                    >
                      Cancel invoice
                    </button>
                  ) : null}
                </div>

                {panel === 'pay' && canPayNow ? (
                  <form className="form-compact" onSubmit={submitPayment} style={{ marginTop: '0.75rem' }}>
                    <h3 style={{ marginTop: 0 }}>Record payment</h3>
                    <div className="row-3">
                      <label>
                        Amount ({viewing.currency_code})
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Paid on
                        <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required />
                      </label>
                      <label>
                        Method
                        <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                          {PAYMENT_METHODS.map((m) => (
                            <option key={m.code} value={m.code}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="row-2">
                      <label>
                        Reference (optional)
                        <input
                          value={payRef}
                          onChange={(e) => setPayRef(e.target.value)}
                          placeholder="Bank / mobile money transaction ref"
                        />
                      </label>
                      <label>
                        Notes (optional)
                        <input value={payNotes} onChange={(e) => setPayNotes(e.target.value)} />
                      </label>
                    </div>
                    <div className="page-head-actions">
                      <button type="submit" disabled={busy}>
                        Save payment
                      </button>
                      <button type="button" className="secondary" onClick={() => setPanel(null)}>
                        Close
                      </button>
                    </div>
                  </form>
                ) : null}

                {panel === 'credit' && canAdjustNow ? (
                  <form className="form-compact" onSubmit={submitCredit} style={{ marginTop: '0.75rem' }}>
                    <h3 style={{ marginTop: 0 }}>Apply credit note</h3>
                    <div className="row-2">
                      <label>
                        Amount ({viewing.currency_code})
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={creditAmount}
                          onChange={(e) => setCreditAmount(e.target.value)}
                          required
                        />
                      </label>
                      <label>
                        Reason
                        <input value={creditReason} onChange={(e) => setCreditReason(e.target.value)} required />
                      </label>
                    </div>
                    <div className="page-head-actions">
                      <button type="submit" disabled={busy}>
                        Apply credit
                      </button>
                      <button type="button" className="secondary" onClick={() => setPanel(null)}>
                        Close
                      </button>
                    </div>
                  </form>
                ) : null}

                {panel === 'cancel' && canCancelNow ? (
                  <form className="form-compact" onSubmit={submitCancel} style={{ marginTop: '0.75rem' }}>
                    <h3 style={{ marginTop: 0 }}>Cancel invoice</h3>
                    <label>
                      Reason
                      <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
                    </label>
                    <div className="page-head-actions">
                      <button type="submit" disabled={busy}>
                        Confirm cancel
                      </button>
                      <button type="button" className="secondary" onClick={() => setPanel(null)}>
                        Keep invoice
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            ) : null}

            <div className="quote-preview-shell contract-preview-shell">
              <div className="quote-preview-toolbar no-print">
                <p className="muted-sm" style={{ margin: 0 }}>
                  {isEditable ? (
                    <>
                      Live invoice preview
                      {viewing ? (
                        <>
                          {' '}
                          · saved <strong>{viewing.invoice_number}</strong>
                        </>
                      ) : (
                        ' · unsaved draft'
                      )}
                    </>
                  ) : (
                    <>
                      Preview of saved <strong>{viewing?.invoice_number}</strong>
                    </>
                  )}{' '}
                  <span className="status-chip">
                    {labelInvoiceStatus(previewModel?.status ?? viewing?.status ?? 'draft')}
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
                    title={!viewing ? 'Save the invoice first' : 'Download saved invoice PDF'}
                  >
                    {busy ? 'Working…' : 'Download PDF'}
                  </button>
                </div>
              </div>

              {previewOpen && previewModel ? (
                <div id="invoice-print-area" className="quote-print-root contract-print-root">
                  <InvoiceDocument model={previewModel} />
                </div>
              ) : previewOpen ? (
                <p className="muted-sm no-print">Select a client to see the live invoice preview.</p>
              ) : (
                <p className="muted-sm no-print">Preview hidden. Show preview to review the invoice.</p>
              )}

              {/* Off-screen saved copy for PDF — always server totals, never unsaved live draft */}
              {viewing && savedModel ? (
                <div className="quote-print-host quote-print-host-export" aria-hidden="true">
                  <div data-invoice-saved="1" className="quote-print-root">
                    <InvoiceDocument model={savedModel} />
                  </div>
                </div>
              ) : null}

              {viewing ? (
                <div className="no-print" style={{ marginTop: '1rem' }}>
                  <h3>Payment history</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Method</th>
                        <th>Reference</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{p.paid_on}</td>
                          <td>{methodLabel(p.method)}</td>
                          <td>{p.provider_ref || '—'}</td>
                          <td>{formatMoney(viewing.currency_code, p.amount)}</td>
                          <td>
                            <span className="status-chip">{p.status}</span>
                          </td>
                        </tr>
                      ))}
                      {payments.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No payments recorded.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>

                  <h3>Credit notes</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Number</th>
                        <th>Reason</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credits.map((c) => (
                        <tr key={c.id}>
                          <td>{c.credit_number}</td>
                          <td>{c.reason}</td>
                          <td>{formatMoney(viewing.currency_code, c.amount)}</td>
                          <td>
                            <span className="status-chip">{c.status}</span>
                          </td>
                          <td>{new Date(c.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                      {credits.length === 0 ? (
                        <tr>
                          <td colSpan={5}>No credit notes.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>

                  <h3>Reminders</h3>
                  <table>
                    <thead>
                      <tr>
                        <th>Type</th>
                        <th>Message</th>
                        <th>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reminders.map((r) => (
                        <tr key={r.id}>
                          <td>{r.reminder_type.replace(/_/g, ' ')}</td>
                          <td>{r.message ?? '—'}</td>
                          <td>{new Date(r.sent_at).toLocaleString()}</td>
                        </tr>
                      ))}
                      {reminders.length === 0 ? (
                        <tr>
                          <td colSpan={3}>No reminders sent.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <h2 style={{ marginTop: '1.5rem' }}>Invoice register</h2>
      <div className="toolbar" style={{ marginBottom: '0.75rem' }}>
        <input
          type="search"
          placeholder="Search number, client, contract…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          {['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled', 'void', 'credited'].map((s) => (
            <option key={s} value={s}>
              {labelInvoiceStatus(s)}
            </option>
          ))}
        </select>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name}
            </option>
          ))}
        </select>
        <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
          <option value="">All currencies</option>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>Client</th>
            <th>Contract</th>
            <th>Due</th>
            <th>Total</th>
            <th>Outstanding</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr
              key={r.id}
              className="clickable-row"
              onClick={() => void openInvoice(r)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void openInvoice(r);
                }
              }}
              tabIndex={0}
              role="button"
            >
              <td>{r.invoice_number}</td>
              <td>{r.clients?.legal_name}</td>
              <td>{r.contracts?.contract_number ?? '—'}</td>
              <td>{r.due_date ?? '—'}</td>
              <td>{formatMoney(r.currency_code, Number(r.total) || 0)}</td>
              <td>{formatMoney(r.currency_code, Number(r.amount_outstanding) || 0)}</td>
              <td>
                <span className="status-chip">{labelInvoiceStatus(r.status)}</span>
              </td>
              <td onClick={(e) => e.stopPropagation()}>
                <button type="button" className="linkish" onClick={() => void openInvoice(r)}>
                  {canManage && isEditableInvoiceStatus(r.status) ? 'Edit' : 'View / PDF'}
                </button>
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={8}>
                {rows.length === 0
                  ? 'No invoices yet.'
                  : !showDev &&
                      rows.some((r) => looksLikeDevRecord(r.clients?.legal_name, r.invoice_number)) &&
                      visibleRows.length === 0 &&
                      !statusFilter &&
                      !clientFilter &&
                      !currencyFilter &&
                      !search.trim()
                    ? 'No business invoices in this view. Enable “Show test records” to see UAT/synthetic invoices (for example OKG-INV-000001 · BO UAT Synthetic Ltd).'
                    : 'No invoices match the current filters. Clear status/client/currency/search, or enable “Show test records” if looking for UAT data.'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
