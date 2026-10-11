import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Client = {
  id: string;
  client_code: string;
  legal_name: string;
  trading_name: string | null;
  status: string;
};

export function ClientsPage() {
  const [rows, setRows] = useState<Client[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error: err } = await supabase
      .from('clients')
      .select('id, client_code, legal_name, trading_name, status')
      .order('legal_name');
    if (err) setError(err.message);
    else setRows((data as Client[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('clients').insert({
      client_code: code.trim(),
      legal_name: name.trim(),
      status: 'active',
    });
    if (err) {
      setError(err.message);
      return;
    }
    setCode('');
    setName('');
    await load();
  }

  return (
    <section>
      <header className="page-head">
        <h1>Clients</h1>
        <p>Client register for authorised staff.</p>
      </header>
      <form className="inline-form" onSubmit={onCreate}>
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input placeholder="Legal name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Add client</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.client_code}</td>
              <td>{r.trading_name || r.legal_name}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
