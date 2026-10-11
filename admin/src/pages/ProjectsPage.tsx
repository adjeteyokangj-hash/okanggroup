import { FormEvent, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Client = { id: string; legal_name: string };
type Project = {
  id: string;
  code: string;
  name: string;
  stage: string;
  status: string;
  client_id: string;
};

export function ProjectsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [rows, setRows] = useState<Project[]>([]);
  const [clientId, setClientId] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [{ data: c }, { data: p, error: err }] = await Promise.all([
      supabase.from('clients').select('id, legal_name').order('legal_name'),
      supabase.from('projects').select('id, code, name, stage, status, client_id').order('name'),
    ]);
    setClients((c as Client[]) ?? []);
    if (err) setError(err.message);
    else setRows((p as Project[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const { error: err } = await supabase.from('projects').insert({
      client_id: clientId,
      code: code.trim(),
      name: name.trim(),
      category: 'general',
      stage: 'enquiry',
      status: 'open',
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
        <h1>Projects</h1>
        <p>Client delivery projects (no contract link in Release 1).</p>
      </header>
      <form className="inline-form" onSubmit={onCreate}>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
          <option value="">Client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.legal_name}
            </option>
          ))}
        </select>
        <input placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button type="submit">Add project</button>
      </form>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Name</th>
            <th>Stage</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.code}</td>
              <td>{r.name}</td>
              <td>{r.stage}</td>
              <td>{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
