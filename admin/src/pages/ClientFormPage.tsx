import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export function ClientFormPage() {
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [legalName, setLegalName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('active');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!can('clients.manage')) {
    return <div className="error">You do not have permission to create clients.</div>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('clients')
      .insert({
        legal_name: legalName.trim(),
        trading_name: tradingName.trim() || null,
        primary_email: email.trim() || null,
        status,
        created_by: user?.id,
      })
      .select('id, client_code')
      .single();
    if (err || !data) {
      setBusy(false);
      setError(err?.message ?? 'Create failed');
      return;
    }
    if (notes.trim()) {
      const { error: notesErr } = await supabase.rpc('set_client_private_notes', {
        p_client_id: data.id,
        p_notes: notes.trim(),
      });
      if (notesErr) {
        setBusy(false);
        setError(notesErr.message);
        return;
      }
    }
    setBusy(false);
    navigate(`/clients/${data.id}`, { replace: true });
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Add client</h1>
          <p>Client code is assigned automatically (OKG-CL-######) and cannot be changed later.</p>
        </div>
        <Link to="/clients">
          <button type="button" className="secondary">
            Cancel
          </button>
        </Link>
      </header>
      <form className="form-grid" onSubmit={onSubmit}>
        <p className="muted-sm" style={{ margin: 0 }}>
          <span className="req">*</span> Required. Client code is generated on save (OKG-CL-######)
          and cannot be edited afterwards.
        </p>
        <label>
          Legal name <span className="req">*</span>
          <input value={legalName} onChange={(e) => setLegalName(e.target.value)} required />
        </label>
        <div className="row-2">
          <label>
            Trading name
            <input value={tradingName} onChange={(e) => setTradingName(e.target.value)} />
          </label>
          <label>
            Primary email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </div>
        <label>
          Status <span className="req">*</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} required>
            <option value="prospect">Prospect</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <label>
          Internal notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <div className="actions">
          <button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save client'}
          </button>
        </div>
      </form>
    </section>
  );
}
