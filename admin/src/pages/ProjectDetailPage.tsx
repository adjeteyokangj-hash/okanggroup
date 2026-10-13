import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProjectFilesPanel } from '../components/ProjectFilesPanel';
import { ClientCmsPanel } from '../components/ClientCmsPanel';
import { formatMoney } from '../lib/devRecords';
import {
  countProgress,
  HANDOVER_ITEMS,
  handoverComplete,
  labelStatus,
  LIFECYCLE_STEPS,
  lifecycleReached,
  nextChangeRequestStatuses,
  nextDeliverableStatuses,
  nextMilestoneStatuses,
  summariseProjectFinance,
} from '../lib/projectOps';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const STAGES = [
  'enquiry',
  'proposal',
  'approved',
  'planning',
  'development',
  'testing',
  'client_review',
  'delivered',
  'maintenance',
  'cancelled',
];

type Project = {
  id: string;
  code: string;
  name: string;
  stage: string;
  status: string;
  client_id: string;
  summary: string | null;
  starts_on: string | null;
  target_end_on: string | null;
  budget_amount: number | null;
  budget_currency: string | null;
  contract_id: string | null;
  handover_checklist_json: string[];
  closure_notes: string | null;
  clients?: { legal_name: string; client_code: string } | null;
};

type Milestone = { id: string; name: string; due_on: string | null; status: string; sort_order: number };
type Task = { id: string; title: string; status: string; priority: string; due_at: string | null };
type Deliverable = {
  id: string;
  name: string;
  deliverable_type: string;
  status: string;
  due_on: string | null;
};
type ChangeRequest = {
  id: string;
  title: string;
  status: string;
  description: string;
  impact_summary: string | null;
  estimated_cost: number | null;
  currency_code: string | null;
  decision_note: string | null;
};
type ContractOpt = { id: string; contract_number: string; title: string; status: string };
type QuoteOpt = { id: string; quote_number: string; status: string; total: number; currency_code: string };
type InvoiceRow = {
  id: string;
  invoice_number: string;
  status: string;
  currency_code: string;
  total: number;
  amount_paid: number | null;
  amount_outstanding: number | null;
};
type ExpenseRow = { id: string; title: string | null; amount: number; currency_code: string; status: string };

export function ProjectDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const canManage = can('projects.manage');
  const canManageClient = can('clients.manage');
  const canFinance = can('finance.invoices.read') || can('finance.expenses.read') || can('finance.quotes.read');
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [contracts, setContracts] = useState<ContractOpt[]>([]);
  const [quotes, setQuotes] = useState<QuoteOpt[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [staffNames, setStaffNames] = useState<Record<string, string>>({});

  const [milestoneName, setMilestoneName] = useState('');
  const [milestoneDue, setMilestoneDue] = useState('');
  const [delivName, setDelivName] = useState('');
  const [crTitle, setCrTitle] = useState('');
  const [crDesc, setCrDesc] = useState('');
  const [crImpact, setCrImpact] = useState('');
  const [crCost, setCrCost] = useState('');
  const [crCurrency, setCrCurrency] = useState('GBP');
  const [crNote, setCrNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const [
      { data: p, error: pErr },
      { data: m },
      { data: t },
      { data: s },
      { data: d },
      { data: cr },
    ] = await Promise.all([
      supabase
        .from('projects')
        .select(
          'id, code, name, stage, status, client_id, summary, starts_on, target_end_on, budget_amount, budget_currency, contract_id, handover_checklist_json, closure_notes, clients(legal_name, client_code)',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('milestones')
        .select('id, name, due_on, status, sort_order')
        .eq('project_id', id)
        .order('sort_order'),
      supabase
        .from('tasks')
        .select('id, title, status, priority, due_at')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, full_name').eq('account_kind', 'staff'),
      supabase
        .from('project_deliverables')
        .select('id, name, deliverable_type, status, due_on')
        .eq('project_id', id)
        .order('sort_order'),
      supabase
        .from('change_requests')
        .select(
          'id, title, status, description, impact_summary, estimated_cost, currency_code, decision_note',
        )
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
    ]);
    if (pErr || !p) {
      setError(pErr?.message ?? 'Project not found');
      return;
    }
    const raw = p as Omit<Project, 'clients' | 'handover_checklist_json'> & {
      clients: Project['clients'] | NonNullable<Project['clients']>[];
      handover_checklist_json: string[] | null;
    };
    const proj: Project = {
      ...raw,
      handover_checklist_json: Array.isArray(raw.handover_checklist_json)
        ? raw.handover_checklist_json
        : [],
      clients: Array.isArray(raw.clients) ? raw.clients[0] ?? null : raw.clients,
    };
    setProject(proj);
    setMilestones((m as Milestone[]) ?? []);
    setTasks((t as Task[]) ?? []);
    setDeliverables((d as Deliverable[]) ?? []);
    setChangeRequests((cr as ChangeRequest[]) ?? []);
    setStaffNames(
      Object.fromEntries(
        ((s as Array<{ id: string; full_name: string }>) ?? []).map((r) => [r.id, r.full_name]),
      ),
    );
    setCrCurrency(proj.budget_currency || 'GBP');

    const clientId = proj.client_id;
    const [{ data: ctr }, { data: q }, { data: inv }, { data: exp }] = await Promise.all([
      supabase
        .from('contracts')
        .select('id, contract_number, title, status')
        .eq('client_id', clientId)
        .in('status', ['active', 'sent', 'draft', 'accepted', 'completed']),
      supabase
        .from('quotations')
        .select('id, quote_number, status, total, currency_code')
        .or(`project_id.eq.${id},client_id.eq.${clientId}`)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('invoices')
        .select('id, invoice_number, status, currency_code, total, amount_paid, amount_outstanding')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('expenses')
        .select('id, title, amount, currency_code, status')
        .eq('project_id', id)
        .order('spent_on', { ascending: false }),
    ]);
    setContracts((ctr as ContractOpt[]) ?? []);
    setQuotes((q as QuoteOpt[]) ?? []);
    setInvoices((inv as InvoiceRow[]) ?? []);
    setExpenses((exp as ExpenseRow[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, [id]);

  const milestoneProg = useMemo(
    () => countProgress(milestones, ['done'], ['cancelled']),
    [milestones],
  );
  const deliverableProg = useMemo(
    () => countProgress(deliverables, ['client_approved', 'delivered'], ['cancelled']),
    [deliverables],
  );
  const taskProg = useMemo(
    () => countProgress(tasks, ['done', 'completed', 'approved'], ['cancelled']),
    [tasks],
  );
  const finance = useMemo(
    () =>
      summariseProjectFinance({
        budgetAmount: project?.budget_amount ?? null,
        budgetCurrency: project?.budget_currency ?? null,
        invoices,
        expenses,
      }),
    [project, invoices, expenses],
  );

  const lifecycleIdx = useMemo(() => {
    if (!project) return 0;
    return lifecycleReached({
      hasClient: true,
      hasQuote: quotes.some((q) => ['sent', 'accepted'].includes(q.status)),
      hasContract: Boolean(project.contract_id) || contracts.some((c) => c.status === 'active'),
      hasProject: true,
      hasDeliveryProgress: deliverableProg.done > 0 || milestoneProg.done > 0 || taskProg.done > 0,
      hasAcceptance: deliverables.some((d) => d.status === 'client_approved' || d.status === 'delivered'),
      hasInvoice: invoices.some((i) => !['draft', 'cancelled', 'void'].includes(i.status)),
      hasPayment: invoices.some((i) => (Number(i.amount_paid) || 0) > 0 || i.status === 'paid'),
      handoverDone: handoverComplete(project.handover_checklist_json),
    });
  }, [project, quotes, contracts, deliverableProg, milestoneProg, taskProg, deliverables, invoices]);

  async function saveProject(successMessage = 'Project updated.') {
    if (!project || !canManage) return;
    setError(null);
    setBusy(true);
    const { error: err } = await supabase
      .from('projects')
      .update({
        name: project.name,
        summary: project.summary,
        stage: project.stage,
        status: project.status,
        starts_on: project.starts_on,
        target_end_on: project.target_end_on,
        budget_amount: project.budget_amount,
        budget_currency: project.budget_currency,
        contract_id: project.contract_id,
        handover_checklist_json: project.handover_checklist_json,
        closure_notes: project.closure_notes,
        closed_at: project.status === 'closed' ? new Date().toISOString() : null,
        updated_by: user?.id,
      })
      .eq('id', project.id);
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(successMessage);
      await load();
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    await saveProject();
  }

  async function addMilestone(e: FormEvent) {
    e.preventDefault();
    if (!project || !canManage) return;
    const { error: err } = await supabase.from('milestones').insert({
      project_id: project.id,
      client_id: project.client_id,
      name: milestoneName.trim(),
      due_on: milestoneDue || null,
      status: 'open',
      sort_order: milestones.length + 1,
    });
    if (err) setError(err.message);
    else {
      setMilestoneName('');
      setMilestoneDue('');
      await load();
    }
  }

  async function addDeliverable(e: FormEvent) {
    e.preventDefault();
    if (!project || !canManage) return;
    const { error: err } = await supabase.from('project_deliverables').insert({
      project_id: project.id,
      client_id: project.client_id,
      name: delivName.trim(),
      deliverable_type: 'general',
      status: 'pending',
      sort_order: deliverables.length + 1,
      created_by: user?.id,
    });
    if (err) setError(err.message);
    else {
      setDelivName('');
      await load();
    }
  }

  async function saveCr(e: FormEvent, submit: boolean) {
    e.preventDefault();
    if (!project || !canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('save_change_request', {
      p_project_id: project.id,
      p_title: crTitle.trim(),
      p_description: crDesc,
      p_impact_summary: crImpact || null,
      p_estimated_cost: crCost ? Number(crCost) : null,
      p_currency_code: crCost ? crCurrency : null,
      p_submit: submit,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setCrTitle('');
      setCrDesc('');
      setCrImpact('');
      setCrCost('');
      setMessage(submit ? 'Change request submitted.' : 'Change request saved as draft.');
      await load();
    }
  }

  async function transitionCr(crId: string, to: string) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('transition_change_request', {
      p_change_request_id: crId,
      p_to_status: to,
      p_decision_note: crNote.trim() || null,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setCrNote('');
      setMessage(`Change request → ${labelStatus(to)}`);
      await load();
    }
  }

  async function transitionDeliv(delivId: string, to: string) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('transition_deliverable_status', {
      p_deliverable_id: delivId,
      p_to_status: to,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(`Deliverable → ${labelStatus(to)}`);
      await load();
    }
  }

  async function transitionMs(msId: string, to: string) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('transition_milestone_status', {
      p_milestone_id: msId,
      p_to_status: to,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(`Milestone → ${labelStatus(to)}`);
      await load();
    }
  }

  function toggleHandover(item: string) {
    if (!project) return;
    const set = new Set(project.handover_checklist_json);
    if (set.has(item)) set.delete(item);
    else set.add(item);
    setProject({ ...project, handover_checklist_json: Array.from(set) });
  }

  if (!project) return <div className="center">{error ?? 'Loading…'}</div>;

  const linkedContract = contracts.find((c) => c.id === project.contract_id);
  const handoverDone = handoverComplete(project.handover_checklist_json);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{project.name}</h1>
          <p>
            {project.code} · {project.clients?.legal_name} ({project.clients?.client_code}) ·{' '}
            {labelStatus(project.stage)} · {labelStatus(project.status)}
          </p>
        </div>
        <div className="page-head-actions">
          <button type="button" className="secondary" onClick={() => navigate('/projects')}>
            Back
          </button>
          <Link to={`/clients/${project.client_id}`}>
            <button type="button" className="secondary">
              Client
            </button>
          </Link>
          {can('finance.quotes.read') ? (
            <Link to={`/finance/quotes`}>
              <button type="button" className="secondary">
                Quotes
              </button>
            </Link>
          ) : null}
          {can('finance.contracts.read') ? (
            <Link to={`/finance/contracts`}>
              <button type="button" className="secondary">
                Contracts
              </button>
            </Link>
          ) : null}
          {can('finance.invoices.read') ? (
            <Link to={`/finance/invoices`}>
              <button type="button" className="secondary">
                Invoices
              </button>
            </Link>
          ) : null}
          {canFinance ? (
            <Link to="/finance/reports">
              <button type="button" className="secondary">
                Reports
              </button>
            </Link>
          ) : null}
          {can('tasks.manage') || can('tasks.execute') ? (
            <Link to={`/tasks?projectId=${project.id}&clientId=${project.client_id}`}>
              <button type="button">Add task</button>
            </Link>
          ) : null}
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <nav className="panel form-compact" aria-label="Lifecycle" style={{ marginBottom: '1rem' }}>
        <p className="muted-sm" style={{ marginTop: 0 }}>
          Integrated operations path (this project)
        </p>
        <ol className="lifecycle-steps">
          {LIFECYCLE_STEPS.map((step, i) => (
            <li key={step} className={i <= lifecycleIdx ? 'is-reached' : ''}>
              {step}
            </li>
          ))}
        </ol>
      </nav>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <article>
          <p style={{ marginTop: 0 }}>Milestones</p>
          <h2 style={{ fontSize: '1.4rem' }}>{milestoneProg.pct}%</h2>
          <p className="muted-sm">
            {milestoneProg.done}/{milestoneProg.total} done
          </p>
        </article>
        <article>
          <p style={{ marginTop: 0 }}>Deliverables</p>
          <h2 style={{ fontSize: '1.4rem' }}>{deliverableProg.pct}%</h2>
          <p className="muted-sm">
            {deliverableProg.done}/{deliverableProg.total} accepted/delivered
          </p>
        </article>
        <article>
          <p style={{ marginTop: 0 }}>Tasks</p>
          <h2 style={{ fontSize: '1.4rem' }}>{taskProg.pct}%</h2>
          <p className="muted-sm">
            {taskProg.done}/{taskProg.total} complete
          </p>
        </article>
        <article>
          <p style={{ marginTop: 0 }}>Handover</p>
          <h2 style={{ fontSize: '1.4rem' }}>{handoverDone ? 'Ready' : 'Open'}</h2>
          <p className="muted-sm">
            {project.handover_checklist_json.length}/{HANDOVER_ITEMS.length} items
          </p>
        </article>
        <article>
          <p style={{ marginTop: 0 }}>Target</p>
          <h2 style={{ fontSize: '1.1rem' }}>{project.target_end_on ?? '—'}</h2>
          <p className="muted-sm">Deadline</p>
        </article>
      </div>

      {canFinance || finance.length > 0 ? (
        <>
          <div
            className="stat-grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: '0.5rem' }}
          >
            {finance.map((f) => (
              <article key={f.currency}>
                <p style={{ marginTop: 0 }}>
                  <strong>{f.currency}</strong> · project finance
                </p>
                <h2 style={{ fontSize: '1.25rem' }}>{formatMoney(f.currency, f.invoiced)}</h2>
                <p>Invoiced</p>
                <p className="muted-sm">
                  Paid {formatMoney(f.currency, f.paid)} · Outstanding {formatMoney(f.currency, f.outstanding)}
                </p>
                <p className="muted-sm">
                  Expenses {formatMoney(f.currency, f.expenses)}
                  {f.budget != null
                    ? ` · Budget ${formatMoney(f.currency, f.budget)} · Remaining ${formatMoney(f.currency, f.remaining ?? 0)}`
                    : ''}
                </p>
              </article>
            ))}
            {finance.length === 0 ? (
              <article>
                <p style={{ marginTop: 0 }}>Project finance</p>
                <p className="muted-sm">No invoices or expenses linked to this project yet.</p>
              </article>
            ) : null}
          </div>
          <p className="muted-sm" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
            Currency totals are never combined. Budget remaining uses expenses in the budget currency only.
          </p>
        </>
      ) : null}

      <div className="panel form-compact" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Commercial links</h2>
        <div className="row-2">
          <div>
            <strong>Contract</strong>
            <p className="muted-sm">
              {linkedContract
                ? `${linkedContract.contract_number} · ${linkedContract.title} (${linkedContract.status})`
                : 'None linked — select below and save.'}
            </p>
          </div>
          <div>
            <strong>Quotations</strong>
            <ul className="muted-sm">
              {quotes.slice(0, 4).map((q) => (
                <li key={q.id}>
                  {q.quote_number} · {labelStatus(q.status)} · {formatMoney(q.currency_code, Number(q.total) || 0)}
                </li>
              ))}
              {quotes.length === 0 ? <li>No quotations for this client/project.</li> : null}
            </ul>
          </div>
        </div>
        {(invoices.length > 0 || expenses.length > 0) && (
          <div className="row-2" style={{ marginTop: '0.5rem' }}>
            <div>
              <strong>Invoices on project</strong>
              <ul className="muted-sm">
                {invoices.slice(0, 5).map((i) => (
                  <li key={i.id}>
                    {i.invoice_number} · {labelStatus(i.status)} ·{' '}
                    {formatMoney(i.currency_code, Number(i.total) || 0)}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <strong>Expenses on project</strong>
              <ul className="muted-sm">
                {expenses.slice(0, 5).map((e) => (
                  <li key={e.id}>
                    {e.title || 'Expense'} · {labelStatus(e.status)} ·{' '}
                    {formatMoney(e.currency_code, Number(e.amount) || 0)}
                  </li>
                ))}
                {expenses.length === 0 ? <li>None</li> : null}
              </ul>
            </div>
          </div>
        )}
      </div>

      <form className="form-grid panel" onSubmit={(e) => void save(e)} style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Project plan</h2>
        <label>
          Name
          <input
            value={project.name}
            disabled={!canManage}
            onChange={(e) => setProject({ ...project, name: e.target.value })}
            required
          />
        </label>
        <div className="row-2">
          <label>
            Stage
            <select
              value={project.stage}
              disabled={!canManage}
              onChange={(e) => setProject({ ...project, stage: e.target.value })}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {labelStatus(s)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={project.status}
              disabled={!canManage}
              onChange={(e) => setProject({ ...project, status: e.target.value })}
            >
              <option value="open">Open</option>
              <option value="on_hold">On hold</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        </div>
        <div className="row-2">
          <label>
            Starts on
            <input
              type="date"
              value={project.starts_on ?? ''}
              disabled={!canManage}
              onChange={(e) => setProject({ ...project, starts_on: e.target.value || null })}
            />
          </label>
          <label>
            Target completion
            <input
              type="date"
              value={project.target_end_on ?? ''}
              disabled={!canManage}
              onChange={(e) => setProject({ ...project, target_end_on: e.target.value || null })}
            />
          </label>
        </div>
        <div className="row-2">
          <label>
            Budget amount
            <input
              type="number"
              step="0.01"
              value={project.budget_amount ?? ''}
              disabled={!canManage}
              onChange={(e) =>
                setProject({
                  ...project,
                  budget_amount: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </label>
          <label>
            Budget currency
            <select
              value={project.budget_currency ?? 'GBP'}
              disabled={!canManage}
              onChange={(e) => setProject({ ...project, budget_currency: e.target.value })}
            >
              <option value="GBP">GBP</option>
              <option value="GHS">GHS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
        </div>
        <label>
          Linked contract
          <select
            value={project.contract_id ?? ''}
            disabled={!canManage}
            onChange={(e) => setProject({ ...project, contract_id: e.target.value || null })}
          >
            <option value="">None</option>
            {contracts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.contract_number} · {c.title} ({c.status})
              </option>
            ))}
          </select>
        </label>
        <label>
          Summary
          <textarea
            value={project.summary ?? ''}
            disabled={!canManage}
            onChange={(e) => setProject({ ...project, summary: e.target.value || null })}
          />
        </label>
        {canManage ? (
          <button type="submit" disabled={busy}>
            Save project
          </button>
        ) : null}
      </form>

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Handover &amp; closure</h2>
        <p className="muted-sm">
          Closing a project requires the handover checklist (server-enforced). Complete items below, then set status to
          Closed and save.
        </p>
        <div className="row-2">
          {HANDOVER_ITEMS.map((item) => (
            <label key={item.code} className="check-row check-row--inline">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={project.handover_checklist_json.includes(item.code)}
                onChange={() => toggleHandover(item.code)}
              />
              {item.label}
            </label>
          ))}
        </div>
        <label style={{ marginTop: '0.75rem', display: 'block' }}>
          Closure notes
          <textarea
            value={project.closure_notes ?? ''}
            disabled={!canManage}
            onChange={(e) => setProject({ ...project, closure_notes: e.target.value || null })}
          />
        </label>
        {canManage ? (
          <button type="button" disabled={busy} onClick={() => void saveProject('Handover checklist saved.')}>
            Save handover
          </button>
        ) : null}
      </div>

      <ProjectFilesPanel
        clientId={project.client_id}
        projectId={project.id}
        canManage={canManage}
        staffNames={staffNames}
      />

      <ClientCmsPanel
        clientId={project.client_id}
        projectId={project.id}
        canManageClient={canManageClient}
      />

      <div className="panel-grid">
        <div className="panel">
          <h2>Deliverables</h2>
          {canManage ? (
            <form className="inline-form" onSubmit={(e) => void addDeliverable(e)}>
              <input
                placeholder="Deliverable name"
                value={delivName}
                onChange={(e) => setDelivName(e.target.value)}
                required
              />
              <button type="submit">Add</button>
            </form>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deliverables.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.name}
                    <div className="muted-sm">{d.deliverable_type}</div>
                  </td>
                  <td>{labelStatus(d.status)}</td>
                  <td className="actions">
                    {canManage
                      ? nextDeliverableStatuses(d.status).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="linkish"
                            disabled={busy}
                            onClick={() => void transitionDeliv(d.id, s)}
                          >
                            → {labelStatus(s)}
                          </button>
                        ))
                      : null}
                  </td>
                </tr>
              ))}
              {deliverables.length === 0 ? (
                <tr>
                  <td colSpan={3}>No deliverables yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Change requests</h2>
          {canManage ? (
            <form className="form-compact" onSubmit={(e) => void saveCr(e, false)}>
              <label>
                Title
                <input value={crTitle} onChange={(e) => setCrTitle(e.target.value)} required />
              </label>
              <label>
                Description
                <textarea rows={2} value={crDesc} onChange={(e) => setCrDesc(e.target.value)} />
              </label>
              <label>
                Impact / scope
                <input value={crImpact} onChange={(e) => setCrImpact(e.target.value)} />
              </label>
              <div className="row-2">
                <label>
                  Est. cost
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={crCost}
                    onChange={(e) => setCrCost(e.target.value)}
                  />
                </label>
                <label>
                  Currency
                  <select value={crCurrency} onChange={(e) => setCrCurrency(e.target.value)}>
                    <option value="GBP">GBP</option>
                    <option value="GHS">GHS</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
              </div>
              <div className="row-2">
                <button type="submit" disabled={busy}>
                  Save draft
                </button>
                <button type="button" className="secondary" disabled={busy} onClick={(e) => void saveCr(e, true)}>
                  Submit
                </button>
              </div>
            </form>
          ) : null}
          <label style={{ marginTop: '0.75rem', display: 'block' }}>
            Decision note (approve / reject / cancel)
            <input value={crNote} onChange={(e) => setCrNote(e.target.value)} />
          </label>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Cost</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {changeRequests.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.title}
                    {c.impact_summary ? <div className="muted-sm">{c.impact_summary}</div> : null}
                  </td>
                  <td>
                    {c.estimated_cost != null && c.currency_code
                      ? formatMoney(c.currency_code, Number(c.estimated_cost) || 0)
                      : '—'}
                  </td>
                  <td>{labelStatus(c.status)}</td>
                  <td className="actions">
                    {canManage
                      ? nextChangeRequestStatuses(c.status).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="linkish"
                            disabled={busy}
                            onClick={() => void transitionCr(c.id, s)}
                          >
                            → {labelStatus(s)}
                          </button>
                        ))
                      : null}
                  </td>
                </tr>
              ))}
              {changeRequests.length === 0 ? (
                <tr>
                  <td colSpan={4}>No change requests.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>Milestones</h2>
          {canManage ? (
            <form className="inline-form" onSubmit={(e) => void addMilestone(e)}>
              <input
                placeholder="Milestone name"
                value={milestoneName}
                onChange={(e) => setMilestoneName(e.target.value)}
                required
              />
              <input type="date" value={milestoneDue} onChange={(e) => setMilestoneDue(e.target.value)} />
              <button type="submit">Add</button>
            </form>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Due</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.due_on ?? '—'}</td>
                  <td>{labelStatus(m.status)}</td>
                  <td className="actions">
                    {canManage
                      ? nextMilestoneStatuses(m.status).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className="linkish"
                            disabled={busy}
                            onClick={() => void transitionMs(m.id, s)}
                          >
                            → {labelStatus(s)}
                          </button>
                        ))
                      : null}
                  </td>
                </tr>
              ))}
              {milestones.length === 0 ? (
                <tr>
                  <td colSpan={4}>No milestones yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h2>Related tasks</h2>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} onClick={() => navigate(`/tasks/${t.id}`)}>
                  <td>{t.title}</td>
                  <td>{t.priority}</td>
                  <td>{labelStatus(t.status)}</td>
                  <td>{t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={4}>No tasks linked yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
