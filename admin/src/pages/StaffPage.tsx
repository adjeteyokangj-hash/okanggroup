import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  account_status: string;
  employment_status: string;
  employment_type: string | null;
  mfa_required: boolean;
  privileged: boolean;
};

type Role = { id: string; code: string; name: string };
type Dept = { id: string; name: string; code: string };
type JobTitle = { id: string; title: string };
type Client = { id: string; legal_name: string; client_code: string };
type Project = { id: string; name: string; client_id: string; code: string };

type GrantDraft = {
  role_code: string;
  scope_type: 'platform' | 'client' | 'project';
  client_id: string;
  project_id: string;
};

const EMPLOYMENT = [
  { value: 'employee', label: 'Employee' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'freelancer', label: 'Freelancer' },
] as const;

async function invokeStaff(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('invite-staff', { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    let detail = error.message;
    if (ctx) {
      try {
        const j = await ctx.json();
        detail = j.error ?? detail;
      } catch {
        /* keep */
      }
    }
    throw new Error(detail);
  }
  if (data?.error) throw new Error(data.error as string);
  return data;
}

function loginLabel(status: string) {
  if (status === 'pending_setup' || status === 'invited') return 'Setup pending';
  if (status === 'active') return 'Login active';
  if (status === 'suspended') return 'Suspended';
  if (status === 'offboarded') return 'Offboarded';
  return status;
}

function loginTone(status: string) {
  if (status === 'active') return 'ok';
  if (status === 'pending_setup' || status === 'invited') return 'warn';
  return 'muted';
}

export function StaffPage() {
  const { can, user } = useAuth();
  const canManage = can('org.staff.manage');
  const canInvite = can('org.staff.invite');
  const canRoles = can('platform.roles.manage');

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [employmentType, setEmploymentType] = useState<'employee' | 'contractor' | 'freelancer'>(
    'employee',
  );
  const [employmentStatus, setEmploymentStatus] = useState<'active' | 'inactive'>('active');
  const [departmentId, setDepartmentId] = useState('');
  const [jobTitleId, setJobTitleId] = useState('');
  const [mfaRequired, setMfaRequired] = useState(true);
  const [grants, setGrants] = useState<GrantDraft[]>([
    { role_code: 'staff', scope_type: 'client', client_id: '', project_id: '' },
  ]);

  async function load() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select(
        'id, full_name, email, account_status, employment_status, employment_type, mfa_required',
      )
      .eq('account_kind', 'staff')
      .order('full_name');
    if (err) {
      setError(err.message);
      return;
    }

    const { data: grantRows } = await supabase
      .from('role_grants')
      .select('profile_id, roles!inner(code), access_scopes!inner(scope_type)')
      .eq('status', 'active');

    const privilegedIds = new Set(
      ((grantRows as Array<{
        profile_id: string;
        roles: { code: string } | { code: string }[];
        access_scopes: { scope_type: string } | { scope_type: string }[];
      }>) ?? [])
        .filter((g) => {
          const role = Array.isArray(g.roles) ? g.roles[0]?.code : g.roles?.code;
          const scope = Array.isArray(g.access_scopes)
            ? g.access_scopes[0]?.scope_type
            : g.access_scopes?.scope_type;
          return scope === 'platform' && (role === 'owner' || role === 'platform_admin');
        })
        .map((g) => g.profile_id),
    );

    setRows(
      ((data as Omit<StaffRow, 'privileged'>[]) ?? []).map((r) => ({
        ...r,
        employment_status: r.employment_status ?? 'active',
        privileged: privilegedIds.has(r.id),
      })),
    );

    const [
      { data: roleData },
      { data: deptData },
      { data: titleData },
      { data: clientData },
      { data: projectData },
    ] = await Promise.all([
      supabase.from('roles').select('id, code, name').eq('status', 'active').order('name'),
      supabase.from('departments').select('id, name, code').eq('status', 'active').order('name'),
      supabase.from('job_titles').select('id, title').eq('status', 'active').order('title'),
      supabase.from('clients').select('id, legal_name, client_code').order('legal_name'),
      supabase.from('projects').select('id, name, client_id, code').order('name'),
    ]);

    setRoles(
      ((roleData as Role[]) ?? []).filter(
        (r) => !['owner', 'client_admin', 'client_user'].includes(r.code),
      ),
    );
    setDepartments((deptData as Dept[]) ?? []);
    setJobTitles((titleData as JobTitle[]) ?? []);
    setClients((clientData as Client[]) ?? []);
    setProjects((projectData as Project[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  function resetCreateForm() {
    setFullName('');
    setEmail('');
    setPhone('');
    setEmploymentType('employee');
    setEmploymentStatus('active');
    setDepartmentId('');
    setJobTitleId('');
    setMfaRequired(true);
    setGrants([{ role_code: 'staff', scope_type: 'client', client_id: '', project_id: '' }]);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!canInvite || !user) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const cleanedGrants = grants
        .filter((g) => g.role_code)
        .map((g) => ({
          role_code: g.role_code,
          scope_type: g.scope_type,
          client_id: g.scope_type === 'platform' ? null : g.client_id || null,
          project_id: g.scope_type === 'project' ? g.project_id || null : null,
        }))
        .filter((g) => {
          if (g.scope_type === 'client' && !g.client_id) return false;
          if (g.scope_type === 'project' && (!g.client_id || !g.project_id)) return false;
          return true;
        });

      const data = await invokeStaff({
        action: 'create_staff',
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        employment_type: employmentType,
        employment_status: employmentStatus,
        department_id: departmentId || null,
        job_title_id: jobTitleId || null,
        mfa_required: mfaRequired,
        grants: canRoles ? cleanedGrants : [],
      });

      setMessage(
        `${fullName.trim()} created. Login stays pending until you send account setup.${
          data?.profile_id ? '' : ''
        }`,
      );
      resetCreateForm();
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const filtered = rows.filter((r) => {
    const hay = `${r.full_name} ${r.email} ${r.employment_type ?? ''}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <section className="staff-page">
      <header className="page-head">
        <div>
          <h1>Staff</h1>
          <p>Directory and profiles — open a person for employment, permissions, MFA and offboarding.</p>
        </div>
        <div className="page-head-actions">
          {(canManage || canInvite) && (
            <Link to="/staff/settings">
              <button type="button" className="secondary">
                Org settings
              </button>
            </Link>
          )}
          {canInvite ? (
            <button type="button" onClick={() => setShowCreate((v) => !v)}>
              {showCreate ? 'Close' : '+ Add staff'}
            </button>
          ) : null}
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {canInvite && showCreate ? (
        <form className="form-grid staff-create" onSubmit={(e) => void onCreate(e)}>
          <div className="staff-create-head">
            <h2>New staff member</h2>
            <p className="muted-sm">Saves the record only — does not email or activate login.</p>
          </div>

          <div className="row-2">
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="row-2">
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label>
              Employment type
              <select
                value={employmentType}
                onChange={(e) =>
                  setEmploymentType(e.target.value as 'employee' | 'contractor' | 'freelancer')
                }
                required
              >
                {EMPLOYMENT.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row-2">
            <label>
              Job title
              <select value={jobTitleId} onChange={(e) => setJobTitleId(e.target.value)}>
                <option value="">None</option>
                {jobTitles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Department
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">None</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row-2">
            <label>
              Employment
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value as 'active' | 'inactive')}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={mfaRequired}
                onChange={(e) => setMfaRequired(e.target.checked)}
              />
              Require MFA after activation
            </label>
          </div>

          {canRoles ? (
            <fieldset className="staff-grants">
              <legend>Access</legend>
              {grants.map((g, idx) => (
                <div className="grant-row" key={idx}>
                  <label>
                    Role
                    <select
                      value={g.role_code}
                      onChange={(e) => {
                        const next = [...grants];
                        next[idx] = { ...g, role_code: e.target.value };
                        setGrants(next);
                      }}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Scope
                    <select
                      value={g.scope_type}
                      onChange={(e) => {
                        const next = [...grants];
                        next[idx] = {
                          ...g,
                          scope_type: e.target.value as GrantDraft['scope_type'],
                        };
                        setGrants(next);
                      }}
                    >
                      <option value="platform">Platform</option>
                      <option value="client">Client</option>
                      <option value="project">Project</option>
                    </select>
                  </label>
                  {g.scope_type !== 'platform' ? (
                    <label>
                      Client
                      <select
                        value={g.client_id}
                        onChange={(e) => {
                          const next = [...grants];
                          next[idx] = { ...g, client_id: e.target.value, project_id: '' };
                          setGrants(next);
                        }}
                        required
                      >
                        <option value="">Select…</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.client_code} — {c.legal_name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {g.scope_type === 'project' ? (
                    <label>
                      Project
                      <select
                        value={g.project_id}
                        onChange={(e) => {
                          const next = [...grants];
                          next[idx] = { ...g, project_id: e.target.value };
                          setGrants(next);
                        }}
                        required
                      >
                        <option value="">Select…</option>
                        {projects
                          .filter((p) => p.client_id === g.client_id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} — {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              ))}
              <div className="actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    setGrants([
                      ...grants,
                      { role_code: 'staff', scope_type: 'client', client_id: '', project_id: '' },
                    ])
                  }
                >
                  Add grant
                </button>
                {grants.length > 1 ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => setGrants(grants.slice(0, -1))}
                  >
                    Remove last
                  </button>
                ) : null}
              </div>
            </fieldset>
          ) : null}

          <div className="staff-create-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create staff'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                resetCreateForm();
                setShowCreate(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="panel staff-directory">
        <div className="toolbar staff-directory-toolbar">
          <h2>Directory</h2>
          <input
            placeholder="Search name or email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search staff"
          />
        </div>
        <div className="table-scroll staff-table-wrap">
          <table className="staff-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Type</th>
                <th>Employment</th>
                <th>Login</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/staff/${r.id}`} className="staff-name-link">
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="staff-email">{r.email}</td>
                  <td>{r.employment_type ?? '—'}</td>
                  <td>
                    <span className={`status-chip ${r.employment_status === 'active' ? 'ok' : 'muted'}`}>
                      {r.employment_status}
                    </span>
                  </td>
                  <td>
                    <span className={`status-chip ${loginTone(r.account_status)}`}>
                      {loginLabel(r.account_status)}
                    </span>
                  </td>
                  <td className="actions">
                    <Link to={`/staff/${r.id}`}>Open</Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6}>No staff match this search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
