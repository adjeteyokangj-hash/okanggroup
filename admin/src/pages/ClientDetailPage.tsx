import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Client = {
  id: string;
  client_code: string;
  legal_name: string;
  trading_name: string | null;
  primary_email: string | null;
  notes_internal: string | null;
  status: string;
  account_manager_profile_id: string | null;
};

type Contact = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  is_primary: boolean;
};

type Project = { id: string; code: string; name: string; stage: string; status: string };
type Service = { id: string; service_code: string; status: string };
type Activity = { id: string; activity_type: string; body: string; created_at: string };
type StaffOpt = { id: string; full_name: string };

export function ClientDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const canManage = can('clients.manage');
  const navigate = useNavigate();
  const [client, setClient] = useState<Client | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [staff, setStaff] = useState<StaffOpt[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [serviceCode, setServiceCode] = useState('');
  const [noteBody, setNoteBody] = useState('');

  async function load() {
    if (!id) return;
    const [
      { data: c, error: cErr },
      { data: notes },
      { data: ct },
      { data: p },
      { data: svc },
      { data: act },
      { data: st },
    ] = await Promise.all([
      supabase
        .from('clients')
        .select(
          'id, client_code, legal_name, trading_name, primary_email, status, account_manager_profile_id',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.rpc('get_client_private_notes', { p_client_id: id }),
      supabase
        .from('client_contacts')
        .select('id, full_name, email, phone, role_title, is_primary')
        .eq('client_id', id)
        .order('full_name'),
      supabase
        .from('projects')
        .select('id, code, name, stage, status')
        .eq('client_id', id)
        .order('name'),
      supabase
        .from('client_services')
        .select('id, service_code, status')
        .eq('client_id', id)
        .order('service_code'),
      supabase
        .from('client_activities')
        .select('id, activity_type, body, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('profiles').select('id, full_name').eq('account_kind', 'staff').eq('account_status', 'active'),
    ]);
    if (cErr || !c) {
      setError(cErr?.message ?? 'Client not found');
      return;
    }
    setClient({ ...(c as Client), notes_internal: (notes as string | null) ?? null });
    setContacts((ct as Contact[]) ?? []);
    setProjects((p as Project[]) ?? []);
    setServices((svc as Service[]) ?? []);
    setActivities((act as Activity[]) ?? []);
    setStaff((st as StaffOpt[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function saveClient(e: FormEvent) {
    e.preventDefault();
    if (!client || !canManage) return;
    setError(null);
    const { error: err } = await supabase
      .from('clients')
      .update({
        legal_name: client.legal_name,
        trading_name: client.trading_name,
        primary_email: client.primary_email,
        status: client.status,
        account_manager_profile_id: client.account_manager_profile_id,
        updated_by: user?.id,
      })
      .eq('id', client.id);
    if (err) {
      setError(err.message);
      return;
    }
    const { error: notesErr } = await supabase.rpc('set_client_private_notes', {
      p_client_id: client.id,
      p_notes: client.notes_internal,
    });
    if (notesErr) setError(notesErr.message);
    else setMessage('Client updated.');
  }

  async function addContact(e: FormEvent) {
    e.preventDefault();
    if (!client || !canManage) return;
    setError(null);
    const { error: err } = await supabase.from('client_contacts').insert({
      client_id: client.id,
      full_name: contactName.trim(),
      email: contactEmail.trim() || null,
      phone: contactPhone.trim() || null,
      is_primary: contacts.length === 0,
      status: 'active',
    });
    if (err) {
      setError(err.message);
      return;
    }
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    await load();
  }

  async function makePrimary(contactId: string) {
    if (!client || !canManage) return;
    await supabase.from('client_contacts').update({ is_primary: false }).eq('client_id', client.id);
    await supabase.from('client_contacts').update({ is_primary: true }).eq('id', contactId);
    await load();
  }

  async function addService(e: FormEvent) {
    e.preventDefault();
    if (!client || !canManage) return;
    const { error: err } = await supabase.from('client_services').insert({
      client_id: client.id,
      service_code: serviceCode.trim(),
      status: 'active',
    });
    if (err) setError(err.message);
    else {
      setServiceCode('');
      await load();
    }
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!client || !canManage || !noteBody.trim()) return;
    const { error: err } = await supabase.from('client_activities').insert({
      client_id: client.id,
      activity_type: 'note',
      body: noteBody.trim(),
      created_by: user?.id,
    });
    if (err) setError(err.message);
    else {
      setNoteBody('');
      await load();
    }
  }

  if (!client) return <div className="center">{error ?? 'Loading…'}</div>;

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{client.legal_name}</h1>
          <p>
            {client.client_code} · permanent reference code
          </p>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => navigate('/clients')}>
            Back to directory
          </button>
          {can('projects.manage') ? (
            <Link to={`/projects/new?clientId=${client.id}`}>
              <button type="button">New project</button>
            </Link>
          ) : null}
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <form className="form-grid" onSubmit={saveClient}>
        <div className="row-2">
          <label>
            Legal name
            <input
              value={client.legal_name}
              disabled={!canManage}
              onChange={(e) => setClient({ ...client, legal_name: e.target.value })}
              required
            />
          </label>
          <label>
            Trading name
            <input
              value={client.trading_name ?? ''}
              disabled={!canManage}
              onChange={(e) => setClient({ ...client, trading_name: e.target.value || null })}
            />
          </label>
        </div>
        <div className="row-2">
          <label>
            Primary email
            <input
              type="email"
              value={client.primary_email ?? ''}
              disabled={!canManage}
              onChange={(e) => setClient({ ...client, primary_email: e.target.value || null })}
            />
          </label>
          <label>
            Status
            <select
              value={client.status}
              disabled={!canManage}
              onChange={(e) => setClient({ ...client, status: e.target.value })}
            >
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <label>
          Account manager
          <select
            value={client.account_manager_profile_id ?? ''}
            disabled={!canManage}
            onChange={(e) =>
              setClient({ ...client, account_manager_profile_id: e.target.value || null })
            }
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Internal notes
          <textarea
            value={client.notes_internal ?? ''}
            disabled={!canManage}
            onChange={(e) => setClient({ ...client, notes_internal: e.target.value || null })}
          />
        </label>
        {canManage ? (
          <div className="actions">
            <button type="submit">Save changes</button>
          </div>
        ) : null}
      </form>

      <div className="panel-grid">
        <div className="panel">
          <h2>Contacts</h2>
          {canManage ? (
            <form className="inline-form" onSubmit={addContact}>
              <input
                placeholder="Name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
              />
              <input
                type="email"
                placeholder="Email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
              <input
                placeholder="Phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
              <button type="submit">Add</button>
            </form>
          ) : null}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Primary</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>
                    {c.is_primary ? (
                      'Yes'
                    ) : canManage ? (
                      <button type="button" className="linkish" onClick={() => void makePrimary(c.id)}>
                        Make primary
                      </button>
                    ) : (
                      'No'
                    )}
                  </td>
                </tr>
              ))}
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={4}>No contacts yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Projects</h2>
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
              {projects.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}>
                  <td>{p.code}</td>
                  <td>{p.name}</td>
                  <td>{p.stage}</td>
                  <td>{p.status}</td>
                </tr>
              ))}
              {projects.length === 0 ? (
                <tr>
                  <td colSpan={4}>No projects yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel-grid">
        <div className="panel">
          <h2>Services</h2>
          {canManage ? (
            <form className="inline-form" onSubmit={addService}>
              <input
                placeholder="Service code"
                value={serviceCode}
                onChange={(e) => setServiceCode(e.target.value)}
                required
              />
              <button type="submit">Add</button>
            </form>
          ) : null}
          <ul>
            {services.map((s) => (
              <li key={s.id}>
                {s.service_code} · {s.status}
              </li>
            ))}
            {services.length === 0 ? <li className="muted-sm">No services recorded.</li> : null}
          </ul>
        </div>
        <div className="panel">
          <h2>Activity</h2>
          {canManage ? (
            <form className="inline-form" onSubmit={addNote}>
              <input
                placeholder="Add note…"
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                required
              />
              <button type="submit">Add</button>
            </form>
          ) : null}
          <ul>
            {activities.map((a) => (
              <li key={a.id}>
                <strong>{a.activity_type}</strong> · {a.body}
                <div className="muted-sm">{new Date(a.created_at).toLocaleString()}</div>
              </li>
            ))}
            {activities.length === 0 ? <li className="muted-sm">No activity yet.</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
}
