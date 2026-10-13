import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { looksLikeDevRecord } from '../lib/devRecords';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';

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
  summary: string | null;
  created_at: string;
  converted_client_id: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  new: 'New',
  qualified: 'Qualified',
  quoted: 'Quoted',
  won: 'Won',
  lost: 'Lost',
  converted: 'Converted',
};

export function EnquiriesPage() {
  const { can, user } = useAuth();
  const canManage = can('enquiries.manage');
  const navigate = useNavigate();
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [summary, setSummary] = useState('');
  const [source, setSource] = useState('direct');
  const [enquiryType, setEnquiryType] = useState('other');
  const [statusFilter, setStatusFilter] = useState('open');
  const [q, setQ] = useState('');
  const [showDev, setShowDev] = useState(loadShowDevRecords);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const { data, error: err } = await supabase
      .from('business_enquiries')
      .select(
        'id, enquiry_number, status, source, enquiry_type, organisation_name, contact_name, contact_email, contact_phone, summary, created_at, converted_client_id',
      )
      .order('created_at', { ascending: false });
    if (err) setError(err.message);
    else setRows((data as Enquiry[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function createEnquiry(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setError(null);
    const { error: err } = await supabase.from('business_enquiries').insert({
      organisation_name: org.trim(),
      contact_name: contact.trim(),
      contact_email: email.trim(),
      contact_phone: phone.trim() || null,
      summary: summary.trim(),
      source,
      enquiry_type: enquiryType,
      created_by: user?.id,
    });
    if (err) setError(err.message);
    else {
      setOrg('');
      setContact('');
      setEmail('');
      setPhone('');
      setSummary('');
      setShowForm(false);
      await load();
    }
  }

  async function convert(id: string) {
    setError(null);
    const { data, error: err } = await supabase.rpc('convert_enquiry_to_client', {
      p_enquiry_id: id,
    });
    if (err) setError(err.message);
    else if (data) navigate(`/clients/${data}`);
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showDev && looksLikeDevRecord(r.organisation_name, r.contact_name, r.enquiry_number)) {
        return false;
      }
      if (statusFilter === 'open' && ['converted', 'lost'].includes(r.status)) return false;
      if (statusFilter !== 'open' && statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!needle) return true;
      return [r.organisation_name, r.contact_name, r.contact_email, r.enquiry_number, r.summary]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [rows, q, statusFilter, showDev]);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Enquiries</h1>
          <p>Capture leads, track follow-up status and convert into clients.</p>
        </div>
        {canManage ? (
          <button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Close form' : 'New enquiry'}
          </button>
        ) : null}
      </header>
      {error ? <div className="error">{error}</div> : null}

      {canManage && showForm ? (
        <form className="panel form-compact" onSubmit={createEnquiry} style={{ marginBottom: '1rem', maxWidth: 760 }}>
          <h2 style={{ marginTop: 0 }}>New enquiry</h2>
          <div className="row-2">
            <label>
              Organisation
              <input value={org} onChange={(e) => setOrg(e.target.value)} required />
            </label>
            <label>
              Contact name
              <input value={contact} onChange={(e) => setContact(e.target.value)} required />
            </label>
          </div>
          <div className="row-3">
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Source
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="direct">Direct contact</option>
                <option value="website">Website</option>
                <option value="referral">Referral</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <div className="row-2">
            <label>
              Type
              <select value={enquiryType} onChange={(e) => setEnquiryType(e.target.value)}>
                <option value="new_website">New website</option>
                <option value="cms_management">CMS management</option>
                <option value="support">Support</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Summary
              <input value={summary} onChange={(e) => setSummary(e.target.value)} required />
            </label>
          </div>
          <button type="submit">Create enquiry</button>
        </form>
      ) : null}

      <div className="toolbar">
        <input placeholder="Search organisation or contact…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="open">Open pipeline</option>
          <option value="all">All statuses</option>
          <option value="new">New</option>
          <option value="qualified">Qualified</option>
          <option value="quoted">Quoted</option>
          <option value="converted">Converted</option>
          <option value="lost">Lost</option>
        </select>
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
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Organisation</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const isDev = looksLikeDevRecord(r.organisation_name, r.enquiry_number);
              return (
                <tr key={r.id}>
                  <td>
                    <Link to={`/enquiries/${r.id}`}>{r.enquiry_number}</Link>
                    {isDev ? <span className="dev-badge">Dev</span> : null}
                  </td>
                  <td>
                    {r.organisation_name}
                    {r.summary ? <div className="muted-sm">{r.summary}</div> : null}
                  </td>
                  <td>
                    {r.contact_name}
                    <div className="muted-sm">
                      {r.contact_email}
                      {r.contact_phone ? ` · ${r.contact_phone}` : ''}
                    </div>
                  </td>
                  <td className="muted-sm">{r.enquiry_type.replace(/_/g, ' ')}</td>
                  <td>
                    <span className="status-chip">{STATUS_LABEL[r.status] ?? r.status}</span>
                  </td>
                  <td className="actions">
                    <Link to={`/enquiries/${r.id}`}>Open</Link>
                    {canManage && r.status !== 'converted' && r.status !== 'lost' ? (
                      <button type="button" className="linkish" onClick={() => void convert(r.id)}>
                        Convert to client
                      </button>
                    ) : r.converted_client_id ? (
                      <Link to={`/clients/${r.converted_client_id}`}>Open client</Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6}>No enquiries match this filter.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
