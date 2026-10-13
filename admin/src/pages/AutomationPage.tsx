import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Rule = {
  code: string;
  name: string;
  category: string;
  description: string | null;
  enabled: boolean;
  trigger_kind: string;
  schedule_every_hours: number | null;
  last_run_at: string | null;
};

type Run = {
  id: string;
  run_kind: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  stats_json: Record<string, unknown> | null;
  error_text: string | null;
};

type Outbox = {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  next_attempt_at: string;
};

type Settings = {
  automation_enabled: boolean;
  budget_warning_pct: number;
  task_due_soon_days: number;
  invoice_due_soon_days: number;
};

type ScheduleStatus = {
  schedule_enabled: boolean;
  automation_enabled: boolean;
  cron_expression: string;
  job_name: string;
  job_active: boolean;
  job_schedule: string | null;
  recent_cron_runs: Array<{
    runid: number;
    status: string;
    return_message: string | null;
    start_time: string;
    end_time: string | null;
  }>;
  email: {
    delivery_enabled: boolean;
    provider: string;
    from: string;
    provider_configured: boolean;
  };
};

function describeSchedule(cron: string | null | undefined): string {
  const c = (cron || '').trim();
  if (c === '0 * * * *') return 'Every hour';
  if (c === '0 */6 * * *') return 'Every 6 hours';
  if (c === '0 8 * * *') return 'Daily at 08:00 UTC';
  if (c === '*/15 * * * *') return 'Every 15 minutes';
  if (!c) return 'Not configured';
  return `Custom schedule (${c})`;
}

function nextHourLabel(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toLocaleString();
}

export function AutomationPage() {
  const { can } = useAuth();
  const canManage = can('automation.manage');
  const canRun = can('automation.run') || canManage;
  const [rules, setRules] = useState<Rule[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [outbox, setOutbox] = useState<Outbox[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);
  const [cronExpr, setCronExpr] = useState('0 * * * *');
  const [emailProvider, setEmailProvider] = useState('none');
  const [emailFrom, setEmailFrom] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [{ data: r, error: rErr }, { data: runsData }, { data: ob }, { data: setRows }, schedRes] =
      await Promise.all([
        supabase
          .from('automation_rules')
          .select(
            'code, name, category, description, enabled, trigger_kind, schedule_every_hours, last_run_at',
          )
          .order('category', { ascending: true }),
        supabase
          .from('automation_runs')
          .select('id, run_kind, status, started_at, finished_at, stats_json, error_text')
          .order('started_at', { ascending: false })
          .limit(20),
        supabase
          .from('notification_outbox')
          .select('id, channel, status, attempts, last_error, created_at, next_attempt_at')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('settings')
          .select('key, value_json')
          .in('key', [
            'automation_enabled',
            'budget_warning_pct',
            'task_due_soon_days',
            'invoice_due_soon_days',
          ]),
        supabase.rpc('get_automation_schedule_status'),
      ]);
    if (rErr) setError(rErr.message);
    setRules((r as Rule[]) ?? []);
    setRuns((runsData as Run[]) ?? []);
    setOutbox((ob as Outbox[]) ?? []);
    const map = Object.fromEntries(
      ((setRows as { key: string; value_json: unknown }[]) ?? []).map((s) => [s.key, s.value_json]),
    );
    setSettings({
      automation_enabled: map.automation_enabled !== false,
      budget_warning_pct: Number(map.budget_warning_pct ?? 80),
      task_due_soon_days: Number(map.task_due_soon_days ?? 3),
      invoice_due_soon_days: Number(map.invoice_due_soon_days ?? 7),
    });
    if (schedRes.error) setError(schedRes.error.message);
    else if (schedRes.data) {
      const s = schedRes.data as ScheduleStatus;
      setSchedule(s);
      setCronExpr(s.cron_expression || '0 * * * *');
      setEmailProvider(s.email?.provider || 'none');
      setEmailFrom(s.email?.from || '');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleRule(code: string, enabled: boolean) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('set_automation_rule_enabled', {
      p_code: code,
      p_enabled: enabled,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(`${enabled ? 'Enabled' : 'Disabled'}: ${code.replace(/_/g, ' ')}`);
      await load();
    }
  }

  async function runSweep() {
    if (!canRun) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('run_business_automation', { p_force: true });
    setBusy(false);
    if (err) setError(err.message);
    else {
      const stats = data as { notifications?: number; rules_run?: number; status?: string };
      setMessage(
        `Monitoring run completed${stats?.status ? ` (${stats.status})` : ''}. Rules processed; in-app alerts updated.`,
      );
      await load();
    }
  }

  async function saveSettings() {
    if (!canManage || !settings) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('update_automation_settings', {
      p_email_enabled: null,
      p_automation_enabled: settings.automation_enabled,
      p_budget_warning_pct: settings.budget_warning_pct,
      p_task_due_soon_days: settings.task_due_soon_days,
      p_invoice_due_soon_days: settings.invoice_due_soon_days,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage('Automation settings saved.');
      await load();
    }
  }

  async function toggleEngine(enabled: boolean) {
    if (!canManage || !settings) return;
    const next = { ...settings, automation_enabled: enabled };
    setSettings(next);
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('update_automation_settings', {
      p_email_enabled: null,
      p_automation_enabled: next.automation_enabled,
      p_budget_warning_pct: next.budget_warning_pct,
      p_task_due_soon_days: next.task_due_soon_days,
      p_invoice_due_soon_days: next.invoice_due_soon_days,
    });
    setBusy(false);
    if (err) setError(err.message);
    else setMessage(enabled ? 'Monitoring engine enabled.' : 'Monitoring engine disabled.');
    await load();
  }

  async function saveSchedule(enabled: boolean) {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('set_automation_schedule', {
      p_enabled: enabled,
      p_cron: cronExpr,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(enabled ? 'Automatic monitoring enabled.' : 'Automatic monitoring paused.');
      if (data) setSchedule(data as ScheduleStatus);
      await load();
    }
  }

  async function saveEmailPrep() {
    if (!canManage) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.rpc('configure_email_provider', {
      p_provider: emailProvider,
      p_from: emailFrom,
      p_configured: false,
      p_enable_delivery: false,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage('Email provider prepared. External sending remains off.');
      await load();
    }
  }

  const lastRun = runs[0] ?? null;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const monitoringActive = Boolean(
    schedule?.job_active && schedule?.schedule_enabled && settings?.automation_enabled !== false,
  );

  const visible = useMemo(
    () =>
      rules.filter(
        (r) =>
          !filter ||
          r.code.includes(filter.toLowerCase()) ||
          r.name.toLowerCase().includes(filter.toLowerCase()) ||
          r.category.includes(filter.toLowerCase()),
      ),
    [rules, filter],
  );

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Automation</h1>
          <p>Automatic business monitoring for tasks, invoices, budgets and recurring billing.</p>
        </div>
        <div className="page-head-actions">
          {canRun ? (
            <button type="button" disabled={busy} onClick={() => void runSweep()}>
              Run monitoring now
            </button>
          ) : null}
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="automation-status-banner">
        <div>
          <p className="headline">
            Automatic business monitoring:{' '}
            <span className={monitoringActive ? 'status-chip ok' : 'status-chip warn'}>
              {monitoringActive ? 'Active' : 'Paused'}
            </span>
          </p>
          <p className="muted-sm" style={{ margin: '0.35rem 0 0' }}>
            Frequency: {describeSchedule(schedule?.job_schedule || schedule?.cron_expression)}
            {monitoringActive ? ` · Next check around ${nextHourLabel()}` : ''}
            {lastRun
              ? ` · Last run ${new Date(lastRun.started_at).toLocaleString()} (${lastRun.status})`
              : ' · No runs yet'}
            {failedRuns ? ` · ${failedRuns} recent failure(s)` : ''}
          </p>
        </div>
        {settings ? (
          <label className="check-row check-row--inline automation-engine-toggle">
            <input
              type="checkbox"
              checked={settings.automation_enabled}
              disabled={!canManage || busy}
              onChange={(e) => void toggleEngine(e.target.checked)}
            />
            Engine enabled
          </label>
        ) : null}
        {canManage ? (
          <div className="actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" disabled={busy || monitoringActive} onClick={() => void saveSchedule(true)}>
              Enable
            </button>
            <button
              type="button"
              className="secondary"
              disabled={busy || !schedule?.schedule_enabled}
              onClick={() => void saveSchedule(false)}
            >
              Pause
            </button>
          </div>
        ) : null}
      </div>

      {settings ? (
        <div className="panel" style={{ marginBottom: '1rem' }}>
          <h2 style={{ marginTop: 0 }}>Alert thresholds</h2>
          <div className="row-3 form-compact" style={{ marginBottom: '0.75rem' }}>
            <label>
              Budget warning (%)
              <input
                type="number"
                min={1}
                max={100}
                value={settings.budget_warning_pct}
                disabled={!canManage}
                onChange={(e) =>
                  setSettings({ ...settings, budget_warning_pct: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Task due-soon (days)
              <input
                type="number"
                min={1}
                value={settings.task_due_soon_days}
                disabled={!canManage}
                onChange={(e) =>
                  setSettings({ ...settings, task_due_soon_days: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Invoice due-soon (days)
              <input
                type="number"
                min={1}
                value={settings.invoice_due_soon_days}
                disabled={!canManage}
                onChange={(e) =>
                  setSettings({ ...settings, invoice_due_soon_days: Number(e.target.value) })
                }
              />
            </label>
          </div>
          {canManage ? (
            <button type="button" disabled={busy} onClick={() => void saveSettings()}>
              Save thresholds
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="panel" style={{ marginBottom: '1rem' }}>
        <div className="notifications-head">
          <h2 style={{ margin: 0 }}>Monitoring rules</h2>
          <input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ maxWidth: 220 }}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Category</th>
              <th>Last checked</th>
              <th>On</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.code}>
                <td>
                  <strong>{r.name}</strong>
                  {r.description ? <div className="muted-sm">{r.description}</div> : null}
                </td>
                <td className="muted-sm">{r.category}</td>
                <td className="muted-sm">
                  {r.last_run_at ? new Date(r.last_run_at).toLocaleString() : '—'}
                </td>
                <td>
                  <input
                    type="checkbox"
                    className="table-check"
                    checked={r.enabled}
                    disabled={!canManage || busy}
                    onChange={(e) => void toggleRule(r.code, e.target.checked)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Recent activity</h2>
          <ul className="dense-list">
            {runs.slice(0, 5).map((run) => (
              <li key={run.id}>
                <span
                  className={`status-chip ${
                    run.status === 'succeeded' || run.status === 'success'
                      ? 'ok'
                      : run.status === 'failed'
                        ? 'danger'
                        : 'muted'
                  }`}
                >
                  {run.status}
                </span>
                <span className="muted-sm">{new Date(run.started_at).toLocaleString()}</span>
                {run.error_text ? <span className="dense-list-error">{run.error_text}</span> : null}
              </li>
            ))}
            {runs.length === 0 ? <li className="muted-sm">No runs yet.</li> : null}
          </ul>
          {runs.length > 5 ? (
            <p className="muted-sm" style={{ margin: '0.4rem 0 0' }}>
              Showing latest 5 of {runs.length} recent runs.
            </p>
          ) : null}
        </div>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Delivery queue</h2>
          <p className="muted-sm" style={{ margin: '0 0 0.4rem' }}>
            Email delivery remains prepared but not activated.
          </p>
          <ul className="dense-list">
            {outbox.slice(0, 5).map((o) => (
              <li key={o.id}>
                <strong>
                  {o.channel} · {o.status}
                </strong>
                <span className="muted-sm">
                  {o.attempts} attempt(s) · {new Date(o.created_at).toLocaleString()}
                </span>
                {o.last_error ? <span className="dense-list-error">{o.last_error}</span> : null}
              </li>
            ))}
            {outbox.length === 0 ? <li className="muted-sm">Queue empty.</li> : null}
          </ul>
        </div>
      </div>

      <details className="advanced-details">
        <summary>Advanced / diagnostics</summary>
        <p className="muted-sm">
          Technical controls for operators. Day-to-day monitoring does not require these settings.
        </p>

        {schedule ? (
          <div className="form-compact" style={{ marginBottom: '1rem' }}>
            <h3>Schedule expression</h3>
            <label>
              Cron expression
              <input
                value={cronExpr}
                disabled={!canManage}
                onChange={(e) => setCronExpr(e.target.value)}
                placeholder="0 * * * *"
              />
            </label>
            <p className="muted-sm">
              Job: {schedule.job_name} · Active: {schedule.job_active ? 'yes' : 'no'} · Setting:{' '}
              {schedule.schedule_enabled ? 'enabled' : 'disabled'}
            </p>
            {canManage ? (
              <button type="button" className="secondary" disabled={busy} onClick={() => void saveSchedule(true)}>
                Apply schedule expression
              </button>
            ) : null}
            {(schedule.recent_cron_runs?.length ?? 0) > 0 ? (
              <table style={{ marginTop: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Scheduler run</th>
                    <th>Status</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.recent_cron_runs.slice(0, 5).map((cr) => (
                    <tr key={String(cr.runid)}>
                      <td>{cr.start_time ? new Date(cr.start_time).toLocaleString() : '—'}</td>
                      <td>{cr.status}</td>
                      <td className="muted-sm">{cr.return_message || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        ) : null}

        {schedule ? (
          <div className="form-compact">
            <h3>Email provider prep (sending off)</h3>
            <div className="row-2">
              <label>
                Provider
                <select
                  value={emailProvider}
                  disabled={!canManage}
                  onChange={(e) => setEmailProvider(e.target.value)}
                >
                  <option value="none">None</option>
                  <option value="resend">Resend</option>
                  <option value="smtp">SMTP</option>
                </select>
              </label>
              <label>
                From address
                <input
                  value={emailFrom}
                  disabled={!canManage}
                  onChange={(e) => setEmailFrom(e.target.value)}
                  placeholder="ops@okanggroup.com"
                />
              </label>
            </div>
            <p className="muted-sm">
              Delivery enabled: {schedule.email.delivery_enabled ? 'yes' : 'no'} · Provider configured:{' '}
              {schedule.email.provider_configured ? 'yes' : 'no'}
            </p>
            {canManage ? (
              <button type="button" className="secondary" disabled={busy} onClick={() => void saveEmailPrep()}>
                Save email prep
              </button>
            ) : null}
          </div>
        ) : null}

        <div style={{ marginTop: '1rem' }}>
          <h3>Raw run stats</h3>
          <table>
            <tbody>
              {runs.slice(0, 5).map((run) => (
                <tr key={`raw-${run.id}`}>
                  <td className="muted-sm">
                    {run.run_kind} · {run.id.slice(0, 8)}
                    {run.stats_json ? (
                      <pre style={{ whiteSpace: 'pre-wrap', margin: '0.35rem 0 0' }}>
                        {JSON.stringify(run.stats_json, null, 2)}
                      </pre>
                    ) : (
                      ' —'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
