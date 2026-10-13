import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, looksLikeDevRecord } from '../lib/devRecords';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  currency_code: string;
  total: number;
  amount_paid: number | null;
  amount_outstanding: number | null;
  client_id: string;
  project_id: string | null;
  clients?: { legal_name: string } | null;
};

type Expense = {
  id: string;
  title: string | null;
  status: string;
  currency_code: string;
  amount: number;
  project_id: string | null;
  clients?: { legal_name: string } | null;
};

type Project = {
  id: string;
  code: string;
  name: string;
  status: string;
  budget_amount: number | null;
  budget_currency: string | null;
  clients?: { legal_name: string } | null;
};

type CurrencyRollup = {
  currency: string;
  invoiced: number;
  paid: number;
  outstanding: number;
  expenses: number;
  budget: number;
  invoiceCount: number;
  expenseCount: number;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export function FinanceReportsPage() {
  const { can } = useAuth();
  const canRead =
    can('finance.reports.read') ||
    can('finance.invoices.read') ||
    can('finance.expenses.read');

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showDev, setShowDev] = useState(loadShowDevRecords);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    void (async () => {
      const [inv, exp, proj] = await Promise.all([
        supabase
          .from('invoices')
          .select(
            'id, invoice_number, status, currency_code, total, amount_paid, amount_outstanding, client_id, project_id, clients(legal_name)',
          )
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('expenses')
          .select('id, title, status, currency_code, amount, project_id, clients(legal_name)')
          .order('spent_on', { ascending: false })
          .limit(500),
        supabase
          .from('projects')
          .select('id, code, name, status, budget_amount, budget_currency, clients(legal_name)')
          .neq('status', 'cancelled')
          .order('updated_at', { ascending: false })
          .limit(200),
      ]);
      if (inv.error) setError(inv.error.message);
      else {
        setInvoices(
          ((inv.data as unknown as Invoice[]) ?? []).map((r) => ({
            ...r,
            clients: one(r.clients as Invoice['clients'] | Invoice['clients'][]),
          })),
        );
      }
      if (exp.error) setError(exp.error.message);
      else {
        setExpenses(
          ((exp.data as unknown as Expense[]) ?? []).map((r) => ({
            ...r,
            clients: one(r.clients as Expense['clients'] | Expense['clients'][]),
          })),
        );
      }
      if (proj.error) setError(proj.error.message);
      else {
        setProjects(
          ((proj.data as unknown as Project[]) ?? []).map((r) => ({
            ...r,
            clients: one(r.clients as Project['clients'] | Project['clients'][]),
          })),
        );
      }
    })();
  }, [canRead]);

  const visibleInvoices = useMemo(
    () =>
      showDev
        ? invoices
        : invoices.filter((i) => !looksLikeDevRecord(i.clients?.legal_name, i.invoice_number)),
    [invoices, showDev],
  );
  const visibleExpenses = useMemo(
    () =>
      showDev
        ? expenses
        : expenses.filter((e) => !looksLikeDevRecord(e.clients?.legal_name, e.title)),
    [expenses, showDev],
  );
  const visibleProjects = useMemo(
    () =>
      showDev
        ? projects
        : projects.filter((p) => !looksLikeDevRecord(p.clients?.legal_name, p.code, p.name)),
    [projects, showDev],
  );

  const byCurrency = useMemo(() => {
    const map = new Map<string, CurrencyRollup>();
    const bucket = (ccy: string) => {
      const currency = (ccy || 'GBP').toUpperCase();
      let b = map.get(currency);
      if (!b) {
        b = {
          currency,
          invoiced: 0,
          paid: 0,
          outstanding: 0,
          expenses: 0,
          budget: 0,
          invoiceCount: 0,
          expenseCount: 0,
        };
        map.set(currency, b);
      }
      return b;
    };

    for (const i of visibleInvoices) {
      if (['draft', 'cancelled', 'void'].includes(i.status)) continue;
      const b = bucket(i.currency_code);
      b.invoiced += Number(i.total) || 0;
      b.paid += Number(i.amount_paid) || 0;
      b.outstanding += Number(i.amount_outstanding) || 0;
      b.invoiceCount += 1;
    }
    for (const e of visibleExpenses) {
      if (['cancelled', 'void'].includes(e.status)) continue;
      const b = bucket(e.currency_code);
      b.expenses += Number(e.amount) || 0;
      b.expenseCount += 1;
    }
    for (const p of visibleProjects) {
      if (p.budget_amount == null || !p.budget_currency) continue;
      bucket(p.budget_currency).budget += Number(p.budget_amount) || 0;
    }
    return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  }, [visibleInvoices, visibleExpenses, visibleProjects]);

  const projectRows = useMemo(() => {
    return visibleProjects
      .map((p) => {
        const ccy = (p.budget_currency || 'GBP').toUpperCase();
        const inv = visibleInvoices.filter(
          (i) => i.project_id === p.id && !['draft', 'cancelled', 'void'].includes(i.status),
        );
        const exp = visibleExpenses.filter(
          (e) => e.project_id === p.id && !['cancelled', 'void'].includes(e.status),
        );
        const invoiced = inv.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const expensesTotal = exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const budget = p.budget_amount != null ? Number(p.budget_amount) || 0 : null;
        // Only compare expense vs budget in same currency; invoiced may differ — show per project budget ccy slice
        const expSameCcy = exp
          .filter((e) => (e.currency_code || '').toUpperCase() === ccy)
          .reduce((s, e) => s + (Number(e.amount) || 0), 0);
        const invSameCcy = inv
          .filter((i) => (i.currency_code || '').toUpperCase() === ccy)
          .reduce((s, i) => s + (Number(i.total) || 0), 0);
        return {
          ...p,
          ccy,
          invoicedSameCcy: invSameCcy,
          expensesSameCcy: expSameCcy,
          invoicedAll: invoiced,
          expensesAll: expensesTotal,
          remaining: budget != null ? budget - expSameCcy : null,
          mixed:
            inv.some((i) => (i.currency_code || '').toUpperCase() !== ccy) ||
            exp.some((e) => (e.currency_code || '').toUpperCase() !== ccy),
        };
      })
      .filter((p) => p.budget_amount != null || p.invoicedAll > 0 || p.expensesAll > 0)
      .slice(0, 40);
  }, [visibleProjects, visibleInvoices, visibleExpenses]);

  if (!canRead) {
    return (
      <section>
        <header className="page-head">
          <div>
            <h1>Financial reports</h1>
            <p>You do not have access to financial reports.</p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Financial reports</h1>
          <p>
            Business analytics by currency — invoiced, paid, outstanding, expenses and project budgets. Currencies are
            never combined.
          </p>
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
          <Link to="/finance/expenses">
            <button type="button" className="secondary">
              Expenses
            </button>
          </Link>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {byCurrency.map((b) => (
          <article key={b.currency}>
            <p style={{ marginTop: 0 }}>
              <strong>{b.currency}</strong> · {b.invoiceCount} invoice{b.invoiceCount === 1 ? '' : 's'} ·{' '}
              {b.expenseCount} expense{b.expenseCount === 1 ? '' : 's'}
            </p>
            <h2 style={{ fontSize: '1.4rem' }}>{formatMoney(b.currency, b.outstanding)}</h2>
            <p>Outstanding</p>
            <p className="muted-sm">
              Invoiced {formatMoney(b.currency, b.invoiced)} · Paid {formatMoney(b.currency, b.paid)}
            </p>
            <p className="muted-sm">
              Expenses {formatMoney(b.currency, b.expenses)}
              {b.budget > 0 ? ` · Project budgets ${formatMoney(b.currency, b.budget)}` : ''}
            </p>
          </article>
        ))}
        {byCurrency.length === 0 ? (
          <article>
            <p style={{ marginTop: 0 }}>No financial activity in view.</p>
          </article>
        ) : null}
      </div>
      <p className="muted-sm" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
        Totals are per currency only. Project budget remaining uses expenses in the project’s budget currency.
      </p>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Project profitability snapshot</h2>
        <table>
          <thead>
            <tr>
              <th>Project</th>
              <th>Client</th>
              <th>Budget ccy</th>
              <th>Budget</th>
              <th>Invoiced (same ccy)</th>
              <th>Expenses (same ccy)</th>
              <th>Budget remaining</th>
            </tr>
          </thead>
          <tbody>
            {projectRows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={`/projects/${p.id}`}>
                    {p.code} · {p.name}
                  </Link>
                  {p.mixed ? <div className="muted-sm">Also has other-currency activity</div> : null}
                </td>
                <td>{p.clients?.legal_name ?? '—'}</td>
                <td>{p.ccy}</td>
                <td>{p.budget_amount != null ? formatMoney(p.ccy, Number(p.budget_amount) || 0) : '—'}</td>
                <td>{formatMoney(p.ccy, p.invoicedSameCcy)}</td>
                <td>{formatMoney(p.ccy, p.expensesSameCcy)}</td>
                <td>{p.remaining != null ? formatMoney(p.ccy, p.remaining) : '—'}</td>
              </tr>
            ))}
            {projectRows.length === 0 ? (
              <tr>
                <td colSpan={7}>No projects with budget or linked finance yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
