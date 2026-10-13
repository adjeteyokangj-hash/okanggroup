import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExpenseDocument, type ExpenseDocumentModel } from '../components/ExpenseDocument';
import { formatMoney, looksLikeDevRecord } from '../lib/devRecords';
import {
  computeExpenseTax,
  EXPENSE_PAYMENT_METHODS,
  isEditableExpenseStatus,
  labelExpenseStatus,
  methodLabel,
  nextExpenseStatuses,
  summariseExpensesByCurrency,
} from '../lib/expenseMath';
import { exportExpensePdf } from '../lib/exportExpensePdf';
import { downloadStorageFile, uploadExpenseReceipt } from '../lib/files';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Expense = {
  id: string;
  title: string | null;
  description: string | null;
  reference_number: string | null;
  category: string;
  category_id: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  amount: number;
  net_amount: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  currency_code: string;
  spent_on: string;
  client_id: string | null;
  project_id: string | null;
  payment_method: string | null;
  payment_status: string | null;
  paid_on: string | null;
  notes: string | null;
  status: string;
  is_recurring: boolean | null;
  recurring_schedule_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  clients?: { legal_name: string } | null;
  projects?: { name: string } | null;
  expense_categories?: { name: string; code: string } | null;
};

type Category = { id: string; code: string; name: string; is_active: boolean };
type Vendor = { id: string; name: string; default_currency: string; is_active: boolean };
type Client = { id: string; legal_name: string };
type Project = { id: string; name: string; client_id: string };
type Attachment = {
  id: string;
  file_name: string;
  mime_type: string | null;
  byte_size: number | null;
  storage_path: string;
  created_at: string;
};
type EventRow = { id: string; event_type: string; detail_json: unknown; created_at: string };
type Recurring = {
  id: string;
  name: string;
  title: string;
  amount: number;
  currency_code: string;
  interval_unit: string;
  interval_count: number;
  next_due_on: string;
  ends_on: string | null;
  is_active: boolean;
  tax_rate: number | null;
  category_id: string | null;
  vendor_id: string | null;
};

const CURRENCIES = ['GBP', 'GHS', 'USD', 'EUR'];
const today = () => new Date().toISOString().slice(0, 10);

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function emptyForm() {
  return {
    title: '',
    description: '',
    reference: '',
    categoryId: '',
    vendorId: '',
    vendorName: '',
    amount: '',
    taxRate: '',
    currency: 'GBP',
    spentOn: today(),
    clientId: '',
    projectId: '',
    paymentMethod: '',
    paymentStatus: 'unpaid',
    notes: '',
  };
}

export function FinanceExpensesPage() {
  const { can, user } = useAuth();
  const canManage = can('finance.expenses.manage');
  const canRead = can('finance.expenses.read') || canManage;
  const docRef = useRef<HTMLDivElement>(null);

  const [rows, setRows] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);

  const [viewing, setViewing] = useState<Expense | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showBuilder, setShowBuilder] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showDev, setShowDev] = useState(loadShowDevRecords);

  const [vendorDraft, setVendorDraft] = useState({ name: '', currency: 'GBP' });
  const [categoryDraft, setCategoryDraft] = useState({ code: '', name: '' });
  const [recurringDraft, setRecurringDraft] = useState({
    name: '',
    title: '',
    amount: '',
    currency: 'GBP',
    nextDue: today(),
    intervalUnit: 'month',
    intervalCount: '1',
    taxRate: '',
    categoryId: '',
    vendorId: '',
  });

  const [transitionTo, setTransitionTo] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [expRes, catRes, vendRes, clientRes, projRes, recRes] = await Promise.all([
      supabase
        .from('expenses')
        .select(
          'id, title, description, reference_number, category, category_id, vendor_id, vendor_name, amount, net_amount, tax_rate, tax_amount, currency_code, spent_on, client_id, project_id, payment_method, payment_status, paid_on, notes, status, is_recurring, recurring_schedule_id, rejection_reason, created_at, clients(legal_name), projects(name), expense_categories(name, code)',
        )
        .order('spent_on', { ascending: false })
        .limit(500),
      supabase.from('expense_categories').select('id, code, name, is_active').order('sort_order'),
      supabase.from('expense_vendors').select('id, name, default_currency, is_active').eq('is_active', true).order('name'),
      supabase.from('clients').select('id, legal_name').order('legal_name').limit(300),
      supabase.from('projects').select('id, name, client_id').order('name').limit(500),
      supabase
        .from('expense_recurring_schedules')
        .select(
          'id, name, title, amount, currency_code, interval_unit, interval_count, next_due_on, ends_on, is_active, tax_rate, category_id, vendor_id',
        )
        .order('next_due_on'),
    ]);

    if (expRes.error) setError(expRes.error.message);
    else {
      setRows(
        ((expRes.data as unknown as Expense[]) ?? []).map((r) => ({
          ...r,
          clients: one(r.clients as Expense['clients'] | Expense['clients'][]),
          projects: one(r.projects as Expense['projects'] | Expense['projects'][]),
          expense_categories: one(
            r.expense_categories as Expense['expense_categories'] | Expense['expense_categories'][],
          ),
        })),
      );
    }
    if (!catRes.error) setCategories((catRes.data as Category[]) ?? []);
    if (!vendRes.error) setVendors((vendRes.data as Vendor[]) ?? []);
    if (!clientRes.error) setClients((clientRes.data as Client[]) ?? []);
    if (!projRes.error) setProjects((projRes.data as Project[]) ?? []);
    if (!recRes.error) setRecurring((recRes.data as Recurring[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function loadDetail(expenseId: string) {
    const [att, ev] = await Promise.all([
      supabase
        .from('expense_attachments')
        .select('id, file_name, mime_type, byte_size, storage_path, created_at')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: false }),
      supabase
        .from('expense_events')
        .select('id, event_type, detail_json, created_at')
        .eq('expense_id', expenseId)
        .order('created_at', { ascending: false })
        .limit(40),
    ]);
    setAttachments((att.data as Attachment[]) ?? []);
    setEvents((ev.data as EventRow[]) ?? []);
  }

  const visibleRows = useMemo(() => {
    const base = showDev
      ? rows
      : rows.filter(
          (r) =>
            !looksLikeDevRecord(
              r.title,
              r.vendor_name,
              r.clients?.legal_name,
              r.reference_number,
              r.description,
            ),
        );
    const q = search.trim().toLowerCase();
    return base.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (currencyFilter && r.currency_code !== currencyFilter) return false;
      if (categoryFilter && r.category_id !== categoryFilter && r.category !== categoryFilter) return false;
      if (!q) return true;
      return [r.title, r.vendor_name, r.reference_number, r.category, r.clients?.legal_name]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q));
    });
  }, [rows, showDev, search, statusFilter, currencyFilter, categoryFilter]);

  const summaries = useMemo(() => summariseExpensesByCurrency(visibleRows), [visibleRows]);

  const liveTax = useMemo(
    () => computeExpenseTax(Number(form.amount) || 0, Number(form.taxRate) || 0),
    [form.amount, form.taxRate],
  );

  const clientProjects = projects.filter((p) => !form.clientId || p.client_id === form.clientId);

  function resetBuilder() {
    setEditingId(null);
    setForm(emptyForm());
    setShowBuilder(true);
    setViewing(null);
    setAttachments([]);
    setEvents([]);
    setMessage(null);
    setError(null);
  }

  function openView(row: Expense) {
    setViewing(row);
    setShowBuilder(false);
    setEditingId(null);
    setTransitionTo('');
    setTransitionReason('');
    void loadDetail(row.id);
  }

  function startEdit(row: Expense) {
    if (!isEditableExpenseStatus(row.status)) return;
    setEditingId(row.id);
    setViewing(row);
    setShowBuilder(true);
    setForm({
      title: row.title ?? '',
      description: row.description ?? '',
      reference: row.reference_number ?? '',
      categoryId: row.category_id ?? '',
      vendorId: row.vendor_id ?? '',
      vendorName: row.vendor_name ?? '',
      amount: String(row.net_amount ?? row.amount ?? ''),
      taxRate: String(row.tax_rate ?? ''),
      currency: row.currency_code || 'GBP',
      spentOn: row.spent_on || today(),
      clientId: row.client_id ?? '',
      projectId: row.project_id ?? '',
      paymentMethod: row.payment_method ?? '',
      paymentStatus: row.payment_status ?? 'unpaid',
      notes: row.notes ?? '',
    });
    void loadDetail(row.id);
  }

  async function saveExpense(e: FormEvent, submit: boolean) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { data, error: err } = await supabase.rpc('save_expense', {
        p_title: form.title.trim(),
        p_amount: Number(form.amount),
        p_currency: form.currency,
        p_category_id: form.categoryId || null,
        p_vendor_id: form.vendorId || null,
        p_vendor_name: form.vendorName.trim() || null,
        p_spent_on: form.spentOn || today(),
        p_description: form.description.trim() || null,
        p_reference_number: form.reference.trim() || null,
        p_client_id: form.clientId || null,
        p_project_id: form.projectId || null,
        p_tax_rate: Number(form.taxRate) || 0,
        p_payment_method: form.paymentMethod || null,
        p_payment_status: form.paymentStatus || 'unpaid',
        p_notes: form.notes.trim() || null,
        p_expense_id: editingId,
        p_submit: submit,
      });
      if (err) throw new Error(err.message);
      setMessage(submit ? 'Expense submitted for approval.' : editingId ? 'Expense updated.' : 'Expense saved as draft.');
      setShowBuilder(false);
      await load();
      const saved = data as { id?: string } | null;
      if (saved?.id) {
        const refreshed = (
          await supabase
            .from('expenses')
            .select(
              'id, title, description, reference_number, category, category_id, vendor_id, vendor_name, amount, net_amount, tax_rate, tax_amount, currency_code, spent_on, client_id, project_id, payment_method, payment_status, paid_on, notes, status, is_recurring, recurring_schedule_id, rejection_reason, created_at, clients(legal_name), projects(name), expense_categories(name, code)',
            )
            .eq('id', saved.id)
            .single()
        ).data as unknown as Expense | null;
        if (refreshed) {
          openView({
            ...refreshed,
            clients: one(refreshed.clients as Expense['clients'] | Expense['clients'][]),
            projects: one(refreshed.projects as Expense['projects'] | Expense['projects'][]),
            expense_categories: one(
              refreshed.expense_categories as
                | Expense['expense_categories']
                | Expense['expense_categories'][],
            ),
          });
        }
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function runTransition() {
    if (!canManage || !viewing || !transitionTo) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('transition_expense_status', {
        p_expense_id: viewing.id,
        p_to_status: transitionTo,
        p_reason: transitionReason.trim() || null,
      });
      if (err) throw new Error(err.message);
      setMessage(`Status updated to ${labelExpenseStatus(transitionTo)}.`);
      setTransitionTo('');
      setTransitionReason('');
      await load();
      if (data) {
        const row = data as Expense;
        openView({
          ...row,
          clients: viewing.clients,
          projects: viewing.projects,
          expense_categories: viewing.expense_categories,
        });
      }
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function saveVendor(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('save_expense_vendor', {
        p_name: vendorDraft.name.trim(),
        p_default_currency: vendorDraft.currency,
      });
      if (err) throw new Error(err.message);
      setVendorDraft({ name: '', currency: 'GBP' });
      setMessage('Vendor saved.');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function saveCategory(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('save_expense_category', {
        p_code: categoryDraft.code.trim() || categoryDraft.name.trim(),
        p_name: categoryDraft.name.trim(),
      });
      if (err) throw new Error(err.message);
      setCategoryDraft({ code: '', name: '' });
      setMessage('Category saved.');
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function saveRecurring(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.rpc('save_recurring_expense', {
        p_name: recurringDraft.name.trim(),
        p_title: recurringDraft.title.trim(),
        p_amount: Number(recurringDraft.amount),
        p_currency: recurringDraft.currency,
        p_next_due_on: recurringDraft.nextDue,
        p_interval_unit: recurringDraft.intervalUnit,
        p_interval_count: Number(recurringDraft.intervalCount) || 1,
        p_category_id: recurringDraft.categoryId || null,
        p_vendor_id: recurringDraft.vendorId || null,
        p_tax_rate: Number(recurringDraft.taxRate) || 0,
      });
      if (err) throw new Error(err.message);
      setMessage('Recurring schedule saved.');
      setRecurringDraft({
        name: '',
        title: '',
        amount: '',
        currency: 'GBP',
        nextDue: today(),
        intervalUnit: 'month',
        intervalCount: '1',
        taxRate: '',
        categoryId: '',
        vendorId: '',
      });
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function generateDue() {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('generate_due_recurring_expenses', {
        p_as_of: today(),
      });
      if (err) throw new Error(err.message);
      const created = (data as { created?: number } | null)?.created ?? 0;
      setMessage(
        created === 0
          ? 'No recurring expenses were due — nothing created.'
          : `Generated ${created} expense${created === 1 ? '' : 's'} from due schedules.`,
      );
      await load();
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function onReceiptSelected(file: File | null) {
    if (!file || !viewing || !user?.id || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      await uploadExpenseReceipt({ expenseId: viewing.id, file, userId: user.id });
      setMessage('Receipt uploaded.');
      await loadDetail(viewing.id);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!docRef.current || !viewing) return;
    setBusy(true);
    try {
      const safe = (viewing.title || 'expense').replace(/[^\w\-]+/g, '_').slice(0, 60);
      await exportExpensePdf({
        element: docRef.current,
        fileName: `expense-${safe}-${viewing.spent_on || today()}.pdf`,
      });
      setMessage('PDF downloaded.');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  const docModel: ExpenseDocumentModel | null = viewing
    ? {
        title: viewing.title || 'Untitled expense',
        status: viewing.status,
        currency_code: viewing.currency_code,
        spent_on: viewing.spent_on,
        reference_number: viewing.reference_number,
        category_name: viewing.expense_categories?.name || viewing.category,
        vendor_name: viewing.vendor_name,
        client_name: viewing.clients?.legal_name ?? null,
        project_name: viewing.projects?.name ?? null,
        net_amount: Number(viewing.net_amount ?? viewing.amount) || 0,
        tax_rate: Number(viewing.tax_rate) || 0,
        tax_amount: Number(viewing.tax_amount) || 0,
        amount: Number(viewing.amount) || 0,
        payment_method: viewing.payment_method,
        payment_status: viewing.payment_status,
        paid_on: viewing.paid_on,
        description: viewing.description,
        notes: viewing.notes,
        rejection_reason: viewing.rejection_reason,
      }
    : null;

  const nextStatuses = viewing ? nextExpenseStatuses(viewing.status) : [];

  if (!canRead) {
    return (
      <section>
        <header className="page-head">
          <div>
            <h1>Expenses</h1>
            <p>You do not have access to expenses.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Expenses</h1>
          <p>Record, approve and track business spend — categories, vendors, receipts and recurring.</p>
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
          <Link to="/finance/invoices">
            <button type="button" className="secondary">
              Invoices
            </button>
          </Link>
          {canManage ? (
            <>
              <button type="button" className="secondary" disabled={busy} onClick={() => void generateDue()}>
                Generate due recurring
              </button>
              <button type="button" onClick={() => resetBuilder()}>
                New expense
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {summaries.length > 0 ? (
        <>
          <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            {summaries.map((s) => (
              <article key={s.currency}>
                <p style={{ marginTop: 0 }}>
                  <strong>{s.currency}</strong> · {s.count} expense{s.count === 1 ? '' : 's'}
                </p>
                <h2 style={{ fontSize: '1.5rem' }}>{formatMoney(s.currency, s.total)}</h2>
                <p>Total spend</p>
                <p>
                  Unpaid {formatMoney(s.currency, s.unpaid)}
                  {s.pendingApproval > 0
                    ? ` · Pending approval ${formatMoney(s.currency, s.pendingApproval)}`
                    : ''}
                </p>
              </article>
            ))}
          </div>
          <p className="muted-sm" style={{ marginTop: '-0.75rem', marginBottom: '1rem' }}>
            Totals are shown per currency and are never combined across currencies. Cancelled and void expenses are
            excluded.
          </p>
        </>
      ) : null}

      {canManage && showBuilder ? (
        <form className="panel form-compact" style={{ marginBottom: '1rem' }} onSubmit={(e) => void saveExpense(e, false)}>
          <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit expense' : 'New expense'}</h2>
          <div className="row-2">
            <label>
              Title
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </label>
            <label>
              Spent on
              <input
                type="date"
                value={form.spentOn}
                onChange={(e) => setForm((f) => ({ ...f, spentOn: e.target.value }))}
                required
              />
            </label>
          </div>
          <div className="row-2">
            <label>
              Net amount (ex-tax)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                required
              />
            </label>
            <label>
              Tax rate %
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.taxRate}
                onChange={(e) => setForm((f) => ({ ...f, taxRate: e.target.value }))}
              />
            </label>
          </div>
          <p className="muted-sm">
            Live: net {formatMoney(form.currency, liveTax.net)} · tax {formatMoney(form.currency, liveTax.tax)} ·
            total <strong>{formatMoney(form.currency, liveTax.total)}</strong>
          </p>
          <div className="row-2">
            <label>
              Currency
              <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Category
              <select
                value={form.categoryId}
                onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
              >
                <option value="">General</option>
                {categories
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <div className="row-2">
            <label>
              Vendor (saved)
              <select
                value={form.vendorId}
                onChange={(e) => {
                  const id = e.target.value;
                  const v = vendors.find((x) => x.id === id);
                  setForm((f) => ({
                    ...f,
                    vendorId: id,
                    vendorName: v?.name ?? f.vendorName,
                    currency: v?.default_currency || f.currency,
                  }));
                }}
              >
                <option value="">— free text / none —</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Vendor name
              <input
                value={form.vendorName}
                onChange={(e) => setForm((f) => ({ ...f, vendorName: e.target.value }))}
                disabled={Boolean(form.vendorId)}
              />
            </label>
          </div>
          <div className="row-2">
            <label>
              Client
              <select
                value={form.clientId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, clientId: e.target.value, projectId: '' }))
                }
              >
                <option value="">—</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.legal_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Project
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
              >
                <option value="">—</option>
                {clientProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row-2">
            <label>
              Payment method
              <select
                value={form.paymentMethod}
                onChange={(e) => setForm((f) => ({ ...f, paymentMethod: e.target.value }))}
              >
                <option value="">—</option>
                {EXPENSE_PAYMENT_METHODS.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Payment status
              <select
                value={form.paymentStatus}
                onChange={(e) => setForm((f) => ({ ...f, paymentStatus: e.target.value }))}
              >
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </select>
            </label>
          </div>
          <label>
            Reference
            <input
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
            />
          </label>
          <label>
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
          <label>
            Notes
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="row-2" style={{ alignItems: 'center' }}>
            <button type="submit" disabled={busy}>
              {editingId ? 'Save changes' : 'Save draft'}
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={(e) => void saveExpense(e, true)}>
              Save &amp; submit
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setShowBuilder(false);
                setEditingId(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {viewing && docModel ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <div className="page-head" style={{ marginBottom: '0.75rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>{viewing.title || 'Expense'}</h2>
              <p className="muted-sm">
                {labelExpenseStatus(viewing.status)} · {formatMoney(viewing.currency_code, Number(viewing.amount) || 0)}
              </p>
            </div>
            <div className="page-head-actions">
              {canManage && isEditableExpenseStatus(viewing.status) ? (
                <button type="button" className="secondary" onClick={() => startEdit(viewing)}>
                  Edit
                </button>
              ) : null}
              <button type="button" className="secondary" disabled={busy} onClick={() => void exportPdf()}>
                Download PDF
              </button>
              <button type="button" className="secondary" onClick={() => setViewing(null)}>
                Close
              </button>
            </div>
          </div>

          {canManage && nextStatuses.length > 0 ? (
            <div className="form-compact" style={{ marginBottom: '1rem' }}>
              <h3 style={{ marginTop: 0 }}>Approval / status</h3>
              <div className="row-2">
                <label>
                  Transition to
                  <select value={transitionTo} onChange={(e) => setTransitionTo(e.target.value)}>
                    <option value="">Select…</option>
                    {nextStatuses.map((s) => (
                      <option key={s} value={s}>
                        {labelExpenseStatus(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Reason (reject / cancel)
                  <input value={transitionReason} onChange={(e) => setTransitionReason(e.target.value)} />
                </label>
              </div>
              <button type="button" disabled={busy || !transitionTo} onClick={() => void runTransition()}>
                Apply status
              </button>
            </div>
          ) : null}

          {canManage ? (
            <div style={{ marginBottom: '1rem' }}>
              <label className="file-upload">
                Upload receipt
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.doc,.docx"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = '';
                    void onReceiptSelected(f);
                  }}
                />
              </label>
              {attachments.length > 0 ? (
                <ul>
                  {attachments.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => void downloadStorageFile('expense-receipts', a.storage_path, a.file_name)}
                      >
                        {a.file_name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted-sm">No receipts attached.</p>
              )}
            </div>
          ) : null}

          <div ref={docRef}>
            <ExpenseDocument model={docModel} />
          </div>

          {events.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              <h3>Activity</h3>
              <ul className="muted-sm">
                {events.map((ev) => (
                  <li key={ev.id}>
                    {new Date(ev.created_at).toLocaleString()} · {ev.event_type}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {canManage ? (
        <div className="row-2" style={{ marginBottom: '1rem', alignItems: 'start' }}>
          <form className="panel form-compact" onSubmit={(e) => void saveVendor(e)}>
            <h2 style={{ marginTop: 0 }}>Vendors</h2>
            <label>
              Name
              <input
                value={vendorDraft.name}
                onChange={(e) => setVendorDraft((d) => ({ ...d, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Default currency
              <select
                value={vendorDraft.currency}
                onChange={(e) => setVendorDraft((d) => ({ ...d, currency: e.target.value }))}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>
              Add vendor
            </button>
            {vendors.length > 0 ? (
              <ul className="muted-sm">
                {vendors.slice(0, 8).map((v) => (
                  <li key={v.id}>
                    {v.name} ({v.default_currency})
                  </li>
                ))}
              </ul>
            ) : null}
          </form>

          <form className="panel form-compact" onSubmit={(e) => void saveCategory(e)}>
            <h2 style={{ marginTop: 0 }}>Categories</h2>
            <label>
              Name
              <input
                value={categoryDraft.name}
                onChange={(e) => setCategoryDraft((d) => ({ ...d, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Code (optional)
              <input
                value={categoryDraft.code}
                onChange={(e) => setCategoryDraft((d) => ({ ...d, code: e.target.value }))}
              />
            </label>
            <button type="submit" disabled={busy}>
              Add category
            </button>
            {categories.length > 0 ? (
              <ul className="muted-sm">
                {categories.slice(0, 8).map((c) => (
                  <li key={c.id}>
                    {c.name} <code>{c.code}</code>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
        </div>
      ) : null}

      {canManage ? (
        <form className="panel form-compact" style={{ marginBottom: '1rem' }} onSubmit={(e) => void saveRecurring(e)}>
          <h2 style={{ marginTop: 0 }}>Recurring expenses</h2>
          <div className="row-2">
            <label>
              Schedule name
              <input
                value={recurringDraft.name}
                onChange={(e) => setRecurringDraft((d) => ({ ...d, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Expense title
              <input
                value={recurringDraft.title}
                onChange={(e) => setRecurringDraft((d) => ({ ...d, title: e.target.value }))}
                required
              />
            </label>
          </div>
          <div className="row-2">
            <label>
              Amount (net)
              <input
                type="number"
                step="0.01"
                min="0"
                value={recurringDraft.amount}
                onChange={(e) => setRecurringDraft((d) => ({ ...d, amount: e.target.value }))}
                required
              />
            </label>
            <label>
              Currency
              <select
                value={recurringDraft.currency}
                onChange={(e) => setRecurringDraft((d) => ({ ...d, currency: e.target.value }))}
              >
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
              Next due
              <input
                type="date"
                value={recurringDraft.nextDue}
                onChange={(e) => setRecurringDraft((d) => ({ ...d, nextDue: e.target.value }))}
                required
              />
            </label>
            <label>
              Every
              <div className="row-2">
                <input
                  type="number"
                  min="1"
                  value={recurringDraft.intervalCount}
                  onChange={(e) => setRecurringDraft((d) => ({ ...d, intervalCount: e.target.value }))}
                />
                <select
                  value={recurringDraft.intervalUnit}
                  onChange={(e) => setRecurringDraft((d) => ({ ...d, intervalUnit: e.target.value }))}
                >
                  <option value="week">week(s)</option>
                  <option value="month">month(s)</option>
                  <option value="year">year(s)</option>
                </select>
              </div>
            </label>
          </div>
          <button type="submit" disabled={busy}>
            Save schedule
          </button>
          {recurring.length > 0 ? (
            <table style={{ marginTop: '0.75rem' }}>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Next due</th>
                  <th>Amount</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {recurring.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.name}
                      <div className="muted-sm">{r.title}</div>
                    </td>
                    <td>{r.next_due_on}</td>
                    <td>{formatMoney(r.currency_code, Number(r.amount) || 0)}</td>
                    <td>{r.is_active ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </form>
      ) : null}

      <div className="panel form-compact" style={{ marginBottom: '1rem' }}>
        <div className="row-2">
          <label>
            Search
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, vendor, ref…" />
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {['draft', 'submitted', 'approved', 'rejected', 'recorded', 'paid', 'reimbursed', 'cancelled', 'void'].map(
                (s) => (
                  <option key={s} value={s}>
                    {labelExpenseStatus(s)}
                  </option>
                ),
              )}
            </select>
          </label>
        </div>
        <div className="row-2">
          <label>
            Currency
            <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
              <option value="">All</option>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Title</th>
            <th>Category</th>
            <th>Vendor</th>
            <th>Amount</th>
            <th>Payment</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openView(r)}>
              <td>{r.spent_on}</td>
              <td>
                {r.title || 'Untitled'}
                {r.is_recurring ? <span className="muted-sm"> · recurring</span> : null}
              </td>
              <td>{r.expense_categories?.name || r.category}</td>
              <td>{r.vendor_name || '—'}</td>
              <td>{formatMoney(r.currency_code, Number(r.amount) || 0)}</td>
              <td>
                {r.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                {r.payment_method ? ` · ${methodLabel(r.payment_method)}` : ''}
              </td>
              <td>{labelExpenseStatus(r.status)}</td>
            </tr>
          ))}
          {visibleRows.length === 0 ? (
            <tr>
              <td colSpan={7}>
                {!showDev &&
                rows.some((r) =>
                  looksLikeDevRecord(r.title, r.vendor_name, r.clients?.legal_name, r.reference_number),
                )
                  ? 'No expenses match filters (test records hidden).'
                  : 'No expenses.'}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}
