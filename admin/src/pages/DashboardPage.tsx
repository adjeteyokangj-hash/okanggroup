import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { labelStatus } from '../lib/labels';
import { formatMoney, looksLikeDevRecord } from '../lib/devRecords';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  latest_note?: string | null;
  latest_at?: string | null;
  assignee_name?: string | null;
};
type Project = {
  id: string;
  code: string;
  name: string;
  stage: string;
  status: string;
  target_end_on: string | null;
  budget_amount?: number | null;
};
type Client = { id: string; client_code: string; legal_name: string; status: string; updated_at: string };
type Workload = { name: string; openTasks: number };
type InvoiceRow = {
  id: string;
  invoice_number: string;
  currency_code: string;
  amount_outstanding: number;
  status: string;
};
type CurrencyTotals = {
  currency: string;
  invoiced: number;
  paid: number;
  expenses: number;
  outstanding: number;
};

const STAGE_PROGRESS: Record<string, number> = {
  enquiry: 10,
  proposal: 20,
  approved: 30,
  planning: 40,
  development: 55,
  testing: 70,
  client_review: 80,
  delivered: 90,
  maintenance: 95,
  cancelled: 0,
};

export function DashboardPage() {
  const { profile, aal, mfaEnrolled, permissions } = useAuth();
  const canTasks = permissions.includes('tasks.read');
  const canProjects = permissions.includes('projects.read');
  const canClients = permissions.includes('clients.read');
  const canFinance = permissions.includes('finance.reports.read') || permissions.includes('finance.invoices.read');
  const [counts, setCounts] = useState({
    clients: 0,
    projects: 0,
    tasks: 0,
    overdue: 0,
    outstandingInvoices: 0,
    awaitingApproval: 0,
  });
  const [attention, setAttention] = useState<Task[]>([]);
  const [deadlines, setDeadlines] = useState<Task[]>([]);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [recentClients, setRecentClients] = useState<Client[]>([]);
  const [workload, setWorkload] = useState<Workload[]>([]);
  const [outstanding, setOutstanding] = useState<InvoiceRow[]>([]);
  const [byCurrency, setByCurrency] = useState<CurrencyTotals[]>([]);
  const [showDev, setShowDev] = useState(loadShowDevRecords);

  useEffect(() => {
    void (async () => {
      const now = new Date();
      const week = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const [
        c,
        p,
        t,
        o,
        att,
        due,
        ap,
        rc,
        assigns,
        openTasks,
        profiles,
        invOutstanding,
        invAll,
        expenses,
        docsPending,
      ] = await Promise.all([
        supabase.from('clients').select('id', { count: 'exact', head: true }),
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done'),
        supabase
          .from('tasks')
          .select('id', { count: 'exact', head: true })
          .lt('due_at', now.toISOString())
          .not('status', 'in', '("done","cancelled")'),
        canTasks
          ? supabase
              .from('tasks')
              .select('id, title, status, priority, due_at')
              .in('status', [
                'blocked',
                'on_hold',
                'awaiting_information',
                'in_review',
                'assigned',
              ])
              .order('due_at', { ascending: true, nullsFirst: false })
              .limit(8)
          : Promise.resolve({ data: [] }),
        canTasks
          ? supabase
              .from('tasks')
              .select('id, title, status, priority, due_at')
              .not('status', 'in', '("done","cancelled")')
              .gte('due_at', now.toISOString())
              .lte('due_at', week)
              .order('due_at')
              .limit(6)
          : Promise.resolve({ data: [] }),
        canProjects
          ? supabase
              .from('projects')
              .select('id, code, name, stage, status, target_end_on, budget_amount')
              .eq('status', 'open')
              .order('updated_at', { ascending: false })
              .limit(6)
          : Promise.resolve({ data: [] }),
        canClients
          ? supabase
              .from('clients')
              .select('id, client_code, legal_name, status, updated_at')
              .order('updated_at', { ascending: false })
              .limit(5)
          : Promise.resolve({ data: [] }),
        canTasks
          ? supabase.from('task_assignments').select('assignee_profile_id, task_id').eq('status', 'active')
          : Promise.resolve({ data: [] }),
        canTasks
          ? supabase
              .from('tasks')
              .select('id, status')
              .not('status', 'in', '("done","cancelled")')
          : Promise.resolve({ data: [] }),
        supabase.from('profiles').select('id, full_name').eq('account_kind', 'staff'),
        canFinance
          ? supabase
              .from('invoices')
              .select('id, invoice_number, currency_code, amount_outstanding, status')
              .in('status', ['issued', 'partially_paid', 'overdue'])
              .gt('amount_outstanding', 0)
              .order('due_date', { ascending: true, nullsFirst: false })
              .limit(8)
          : Promise.resolve({ data: [] }),
        canFinance
          ? supabase.from('invoices').select('total, amount_paid, status, currency_code').neq('status', 'void')
          : Promise.resolve({ data: [] }),
        canFinance
          ? supabase.from('expenses').select('amount, currency_code').eq('status', 'recorded')
          : Promise.resolve({ data: [] }),
        supabase
          .from('project_documents')
          .select('id', { count: 'exact', head: true })
          .eq('visibility', 'client_visible')
          .eq('approval_status', 'pending')
          .is('deleted_at', null),
      ]);

      setCounts({
        clients: c.count ?? 0,
        projects: p.count ?? 0,
        tasks: t.count ?? 0,
        overdue: o.count ?? 0,
        outstandingInvoices: (invOutstanding.data as InvoiceRow[] | null)?.length ?? 0,
        awaitingApproval: docsPending.count ?? 0,
      });

      const attentionRows = (att.data as Task[]) ?? [];
      if (canTasks && attentionRows.length > 0) {
        const ids = attentionRows.map((task) => task.id);
        const [{ data: notes }, { data: assignRows }] = await Promise.all([
          supabase
            .from('task_progress_notes')
            .select('task_id, body, created_at')
            .in('task_id', ids)
            .order('created_at', { ascending: false }),
          supabase
            .from('task_assignments')
            .select('task_id, assignee_profile_id')
            .in('task_id', ids)
            .eq('status', 'active'),
        ]);
        const nameById = new Map(
          ((profiles.data as Array<{ id: string; full_name: string }>) ?? []).map((row) => [
            row.id,
            row.full_name,
          ]),
        );
        const assigneeByTask = new Map(
          (
            (assignRows as Array<{ task_id: string; assignee_profile_id: string | null }>) ?? []
          ).map((a) => [a.task_id, a.assignee_profile_id]),
        );
        const noteByTask = new Map<string, { body: string; created_at: string }>();
        for (const n of (notes as Array<{
          task_id: string;
          body: string;
          created_at: string;
        }>) ?? []) {
          if (!noteByTask.has(n.task_id)) {
            noteByTask.set(n.task_id, { body: n.body, created_at: n.created_at });
          }
        }
        for (const task of attentionRows) {
          const note = noteByTask.get(task.id);
          const assigneeId = assigneeByTask.get(task.id);
          task.latest_note = note?.body ?? null;
          task.latest_at = note?.created_at ?? null;
          task.assignee_name = assigneeId ? (nameById.get(assigneeId) ?? null) : null;
        }
      }
      setAttention(attentionRows);
      setDeadlines((due.data as Task[]) ?? []);
      setActiveProjects((ap.data as Project[]) ?? []);
      setRecentClients((rc.data as Client[]) ?? []);
      setOutstanding((invOutstanding.data as InvoiceRow[]) ?? []);

      const nameById = new Map(
        ((profiles.data as Array<{ id: string; full_name: string }>) ?? []).map((row) => [
          row.id,
          row.full_name,
        ]),
      );
      const openTaskIds = new Set(
        ((openTasks.data as Array<{ id: string }>) ?? []).map((row) => row.id),
      );
      const openByAssignee = new Map<string, number>();
      for (const row of (assigns.data as Array<{
        assignee_profile_id: string | null;
        task_id: string;
      }>) ?? []) {
        if (!row.assignee_profile_id || !openTaskIds.has(row.task_id)) continue;
        openByAssignee.set(
          row.assignee_profile_id,
          (openByAssignee.get(row.assignee_profile_id) ?? 0) + 1,
        );
      }
      setWorkload(
        Array.from(openByAssignee.entries())
          .map(([id, openTasks]) => ({
            name: nameById.get(id) ?? 'Staff',
            openTasks,
          }))
          .sort((a, b) => b.openTasks - a.openTasks)
          .slice(0, 8),
      );

      const invRows =
        (invAll.data as Array<{
          total: number;
          amount_paid: number;
          status: string;
          currency_code: string;
        }>) ?? [];
      const expRows = (expenses.data as Array<{ amount: number; currency_code: string }>) ?? [];
      const map = new Map<string, CurrencyTotals>();
      const bump = (currency: string) => {
        const ccy = currency || 'GBP';
        if (!map.has(ccy)) {
          map.set(ccy, { currency: ccy, invoiced: 0, paid: 0, expenses: 0, outstanding: 0 });
        }
        return map.get(ccy)!;
      };
      for (const r of invRows) {
        const row = bump(r.currency_code);
        row.invoiced += Number(r.total || 0);
        row.paid += Number(r.amount_paid || 0);
      }
      for (const r of expRows) {
        bump(r.currency_code).expenses += Number(r.amount || 0);
      }
      for (const r of (invOutstanding.data as InvoiceRow[]) ?? []) {
        bump(r.currency_code).outstanding += Number(r.amount_outstanding || 0);
      }
      setByCurrency(Array.from(map.values()).sort((a, b) => a.currency.localeCompare(b.currency)));
    })();
  }, [canTasks, canProjects, canClients, canFinance]);

  const visibleAttention = useMemo(
    () =>
      showDev
        ? attention
        : attention.filter((t) => !looksLikeDevRecord(t.title, t.latest_note, t.assignee_name)),
    [attention, showDev],
  );
  const visibleDeadlines = useMemo(
    () => (showDev ? deadlines : deadlines.filter((t) => !looksLikeDevRecord(t.title))),
    [deadlines, showDev],
  );
  const visibleProjects = useMemo(
    () =>
      showDev
        ? activeProjects
        : activeProjects.filter((p) => !looksLikeDevRecord(p.name, p.code)),
    [activeProjects, showDev],
  );
  const visibleClients = useMemo(
    () =>
      showDev
        ? recentClients
        : recentClients.filter((c) => !looksLikeDevRecord(c.legal_name, c.client_code)),
    [recentClients, showDev],
  );

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>Welcome, {profile?.full_name}. Business overview for OkangGroup operations.</p>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={showDev}
            onChange={(e) => {
              setShowDev(e.target.checked);
              saveShowDevRecords(e.target.checked);
            }}
          />
          Show development records
        </label>
      </header>
      {aal !== 'aal2' ? (
        <div className="error">
          MFA session is not at AAL2. Sign out and sign in again; you should be prompted for an
          authenticator code{mfaEnrolled ? '' : ' (and QR enrolment if not yet set up)'}.
        </div>
      ) : (
        <div className="ok">MFA verified (AAL2).</div>
      )}

      <div className="dash-quick-actions">
        {canClients ? (
          <Link to="/clients/new">
            <button type="button" className="secondary">
              New client
            </button>
          </Link>
        ) : null}
        {canProjects ? (
          <Link to="/projects/new">
            <button type="button" className="secondary">
              New project
            </button>
          </Link>
        ) : null}
        {canTasks ? (
          <Link to="/tasks">
            <button type="button" className="secondary">
              Tasks
            </button>
          </Link>
        ) : null}
        {permissions.includes('finance.quotes.manage') ? (
          <Link to="/finance/quotes">
            <button type="button" className="secondary">
              New quotation
            </button>
          </Link>
        ) : null}
        <Link to="/notifications">
          <button type="button" className="secondary">
            Notifications
          </button>
        </Link>
      </div>

      <div className="stat-grid">
        <Link to="/clients" className="stat-card">
          <h2>{counts.clients}</h2>
          <p>Clients</p>
        </Link>
        <Link to="/projects" className="stat-card">
          <h2>{counts.projects}</h2>
          <p>Projects</p>
        </Link>
        <Link to="/tasks" className="stat-card">
          <h2>{counts.tasks}</h2>
          <p>Open tasks</p>
        </Link>
        <Link to="/tasks?filter=overdue" className="stat-card">
          <h2>{counts.overdue}</h2>
          <p>Overdue</p>
        </Link>
        {canFinance ? (
          <Link to="/finance/invoices" className="stat-card">
            <h2>{counts.outstandingInvoices}</h2>
            <p>Outstanding invoices</p>
          </Link>
        ) : null}
        <Link to="/projects" className="stat-card">
          <h2>{counts.awaitingApproval}</h2>
          <p>Awaiting client approval</p>
        </Link>
      </div>

      <div className="dash-layout">
        <div className="panel dash-attention">
          <h2 style={{ marginTop: 0 }}>Requires your attention</h2>
          <table>
            <tbody>
              {visibleAttention.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tasks/${t.id}`}>
                      {t.assignee_name ? `${t.assignee_name} — ${t.title}` : t.title}
                    </Link>
                    <div className="muted-sm">
                      <span className="status-chip warn">{labelStatus(t.status)}</span>
                      {t.priority === 'urgent' || t.priority === 'high' ? (
                        <> · <span className="status-chip danger">{t.priority}</span></>
                      ) : null}
                      {t.latest_note ? (
                        <>
                          <br />
                          Note: {t.latest_note}
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleAttention.length === 0 ? (
                <tr>
                  <td className="muted-sm">Nothing blocked or awaiting review.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Upcoming deadlines</h2>
          <table>
            <tbody>
              {visibleDeadlines.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/tasks/${t.id}`}>{t.title}</Link>
                    <div className="muted-sm">
                      Due {t.due_at ? new Date(t.due_at).toLocaleDateString() : '—'}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleDeadlines.length === 0 ? (
                <tr>
                  <td className="muted-sm">No deadlines in the next week.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-grid" style={{ marginTop: '1rem' }}>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Active projects</h2>
          <table>
            <tbody>
              {visibleProjects.map((p) => {
                const pct = STAGE_PROGRESS[p.stage] ?? STAGE_PROGRESS.open;
                return (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/projects/${p.id}`}>
                        {p.code} — {p.name}
                      </Link>
                      <div className="muted-sm">
                        {p.stage}
                        {p.target_end_on ? ` · target ${p.target_end_on}` : ''}
                      </div>
                      <div className="progress-bar" aria-label={`Progress ${pct}%`}>
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visibleProjects.length === 0 ? (
                <tr>
                  <td className="muted-sm">No open projects yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Staff workload</h2>
          <table>
            <tbody>
              {workload.map((w) => (
                <tr key={w.name}>
                  <td>
                    {w.name}
                    <div className="muted-sm">{w.openTasks} open tasks</div>
                    <div className="progress-bar">
                      <span style={{ width: `${Math.min(100, w.openTasks * 12)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              {workload.length === 0 ? (
                <tr>
                  <td className="muted-sm">No active assignments.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {canFinance ? (
          <>
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Finance by currency</h2>
              <p className="muted-sm">
                Totals are never mixed across currencies. Each card is a separate currency balance.
              </p>
              <div className="dash-currency-grid">
                {byCurrency.map((row) => (
                  <div key={row.currency} className="dash-currency-card">
                    <strong>{row.currency}</strong>
                    <div className="muted-sm">
                      Invoiced: {formatMoney(row.currency, row.invoiced)}
                      <br />
                      Paid: {formatMoney(row.currency, row.paid)}
                      <br />
                      Expenses: {formatMoney(row.currency, row.expenses)}
                      <br />
                      Outstanding: {formatMoney(row.currency, row.outstanding)}
                      <br />
                      Net (paid − expenses): {formatMoney(row.currency, row.paid - row.expenses)}
                    </div>
                  </div>
                ))}
                {byCurrency.length === 0 ? (
                  <p className="muted-sm">No finance records yet.</p>
                ) : null}
              </div>
              <Link to="/finance/invoices">Open invoices</Link>
            </div>
            <div className="panel">
              <h2 style={{ marginTop: 0 }}>Outstanding invoices</h2>
              <table>
                <tbody>
                  {outstanding.map((inv) => (
                    <tr key={inv.id}>
                      <td>
                        <Link to="/finance/invoices">{inv.invoice_number}</Link>
                        <div className="muted-sm">
                          {formatMoney(inv.currency_code, Number(inv.amount_outstanding))} ·{' '}
                          {inv.status}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {outstanding.length === 0 ? (
                    <tr>
                      <td className="muted-sm">No outstanding invoices.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Recently updated clients</h2>
          <table>
            <tbody>
              {visibleClients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/clients/${c.id}`}>
                      {c.client_code} — {c.legal_name}
                    </Link>
                    <div className="muted-sm">
                      {c.status} · {new Date(c.updated_at).toLocaleString()}
                    </div>
                  </td>
                </tr>
              ))}
              {visibleClients.length === 0 ? (
                <tr>
                  <td className="muted-sm">No clients yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
