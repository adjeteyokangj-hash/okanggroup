import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Enquiry = {
  id: string;
  enquiry_number: string;
  status: string;
  source: string;
  enquiry_type: string;
  organisation_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  summary: string;
  notes_internal: string | null;
  converted_client_id: string | null;
};

const STATUSES = ['new', 'qualified', 'quoted', 'won', 'lost', 'converted'];

export function EnquiryDetailPage() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const canManage = can('enquiries.manage');
  const navigate = useNavigate();
  const [row, setRow] = useState<Enquiry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const { data, error: err } = await supabase
      .from('business_enquiries')
      .select(
        'id, enquiry_number, status, source, enquiry_type, organisation_name, contact_name, contact_email, contact_phone, summary, notes_internal, converted_client_id',
      )
      .eq('id', id)
      .maybeSingle();
    if (err || !data) setError(err?.message ?? 'Not found');
    else setRow(data as Enquiry);
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!row || !canManage || row.status === 'converted') return;
    const { error: err } = await supabase
      .from('business_enquiries')
      .update({
        status: row.status,
        source: row.source,
        enquiry_type: row.enquiry_type,
        organisation_name: row.organisation_name,
        contact_name: row.contact_name,
        contact_email: row.contact_email,
        contact_phone: row.contact_phone,
        summary: row.summary,
        notes_internal: row.notes_internal,
        updated_by: user?.id,
      })
      .eq('id', row.id);
    if (err) setError(err.message);
    else setMessage('Enquiry updated.');
  }

  async function convert() {
    if (!row) return;
    const { data, error: err } = await supabase.rpc('convert_enquiry_to_client', {
      p_enquiry_id: row.id,
    });
    if (err) setError(err.message);
    else if (data) navigate(`/clients/${data}`);
  }

  if (!row) return <div className="center">{error ?? 'Loading…'}</div>;

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>{row.enquiry_number}</h1>
          <p>{row.organisation_name}</p>
        </div>
        <div className="actions">
          <Link to="/enquiries">
            <button type="button" className="secondary">
              Back
            </button>
          </Link>
          {canManage && row.status !== 'converted' && row.status !== 'lost' ? (
            <button type="button" onClick={() => void convert()}>
              Convert to client
            </button>
          ) : null}
          {row.converted_client_id ? (
            <Link to={`/clients/${row.converted_client_id}`}>
              <button type="button">Open client</button>
            </Link>
          ) : null}
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}
      <form className="form-grid" onSubmit={save}>
        <div className="row-2">
          <label>
            Status
            <select
              value={row.status}
              disabled={!canManage || row.status === 'converted'}
              onChange={(e) => setRow({ ...row, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label>
            Source
            <input
              value={row.source}
              disabled={!canManage || row.status === 'converted'}
              onChange={(e) => setRow({ ...row, source: e.target.value })}
            />
          </label>
        </div>
        <div className="row-2">
          <label>
            Organisation
            <input
              value={row.organisation_name}
              disabled={!canManage || row.status === 'converted'}
              onChange={(e) => setRow({ ...row, organisation_name: e.target.value })}
            />
          </label>
          <label>
            Contact
            <input
              value={row.contact_name}
              disabled={!canManage || row.status === 'converted'}
              onChange={(e) => setRow({ ...row, contact_name: e.target.value })}
            />
          </label>
        </div>
        <div className="row-2">
          <label>
            Email
            <input
              value={row.contact_email}
              disabled={!canManage || row.status === 'converted'}
              onChange={(e) => setRow({ ...row, contact_email: e.target.value })}
            />
          </label>
          <label>
            Phone
            <input
              value={row.contact_phone ?? ''}
              disabled={!canManage || row.status === 'converted'}
              onChange={(e) => setRow({ ...row, contact_phone: e.target.value || null })}
            />
          </label>
        </div>
        <label>
          Summary
          <textarea
            value={row.summary}
            disabled={!canManage || row.status === 'converted'}
            onChange={(e) => setRow({ ...row, summary: e.target.value })}
          />
        </label>
        <label>
          Internal notes
          <textarea
            value={row.notes_internal ?? ''}
            disabled={!canManage || row.status === 'converted'}
            onChange={(e) => setRow({ ...row, notes_internal: e.target.value || null })}
          />
        </label>
        {canManage && row.status !== 'converted' ? (
          <button type="submit">Save</button>
        ) : null}
      </form>
    </section>
  );
}
