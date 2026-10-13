import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Client = { id: string; legal_name: string };

export function ProjectFormPage() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(params.get('clientId') ?? '');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [targetEnd, setTargetEnd] = useState('');
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState('GBP');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from('clients')
      .select('id, legal_name')
      .order('legal_name')
      .then(({ data }) => setClients((data as Client[]) ?? []));
  }, []);

  if (!can('projects.manage')) {
    return <div className="error">You do not have permission to create projects.</div>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('projects')
      .insert({
        client_id: clientId,
        name: name.trim(),
        summary: summary.trim() || null,
        starts_on: startsOn || null,
        target_end_on: targetEnd || null,
        category: 'general',
        stage: 'enquiry',
        status: 'open',
        budget_amount: budgetAmount ? Number(budgetAmount) : null,
        budget_currency: budgetCurrency,
        created_by: user?.id,
      })
      .select('id')
      .single();
    setBusy(false);
    if (err || !data) {
      setError(err?.message ?? 'Create failed');
      return;
    }
    navigate(`/projects/${data.id}`, { replace: true });
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Add project</h1>
          <p>Project code is assigned automatically and is permanent.</p>
        </div>
        <Link to="/projects">
          <button type="button" className="secondary">
            Cancel
          </button>
        </Link>
      </header>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          Client
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.legal_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Project name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className="row-2">
          <label>
            Starts on
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </label>
          <label>
            Target completion
            <input type="date" value={targetEnd} onChange={(e) => setTargetEnd(e.target.value)} />
          </label>
        </div>
        <div className="row-2">
          <label>
            Budget amount
            <input
              type="number"
              step="0.01"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
            />
          </label>
          <label>
            Budget currency
            <select value={budgetCurrency} onChange={(e) => setBudgetCurrency(e.target.value)}>
              <option value="GBP">GBP</option>
              <option value="GHS">GHS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </label>
        </div>
        <label>
          Summary
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save project'}
        </button>
      </form>
    </section>
  );
}
