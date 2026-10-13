import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type Dept = { id: string; code: string; name: string; status: string; description: string | null };
type JobTitle = { id: string; title: string; status: string };

function slugCode(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
}

export function StaffOrgSettingsPage() {
  const { can } = useAuth();
  const canManageDepts = can('org.departments.manage');
  const canManageStaff = can('org.staff.manage');
  const canRead = can('org.staff.read') || canManageStaff || canManageDepts;

  const [departments, setDepartments] = useState<Dept[]>([]);
  const [titles, setTitles] = useState<JobTitle[]>([]);
  const [deptCounts, setDeptCounts] = useState<Record<string, number> | null>(null);
  const [titleCounts, setTitleCounts] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [titleName, setTitleName] = useState('');

  async function load() {
    setError(null);
    const [{ data: d, error: dErr }, { data: t, error: tErr }] = await Promise.all([
      supabase.from('departments').select('id, code, name, status, description').order('name'),
      supabase.from('job_titles').select('id, title, status').order('title'),
    ]);
    if (dErr) setError(dErr.message);
    else setDepartments((d as Dept[]) ?? []);
    if (tErr) setError(tErr.message);
    else setTitles((t as JobTitle[]) ?? []);

    // Lightweight staff counts (single query). Hidden if the caller cannot read profiles.
    const { data: staffRows, error: sErr } = await supabase
      .from('profiles')
      .select('department_id, job_title_id')
      .eq('account_kind', 'staff');
    if (sErr || !staffRows) {
      setDeptCounts(null);
      setTitleCounts(null);
    } else {
      const dc: Record<string, number> = {};
      const tc: Record<string, number> = {};
      for (const row of staffRows as Array<{ department_id: string | null; job_title_id: string | null }>) {
        if (row.department_id) dc[row.department_id] = (dc[row.department_id] ?? 0) + 1;
        if (row.job_title_id) tc[row.job_title_id] = (tc[row.job_title_id] ?? 0) + 1;
      }
      setDeptCounts(dc);
      setTitleCounts(tc);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function addDepartment(e: FormEvent) {
    e.preventDefault();
    if (!canManageDepts) return;
    setError(null);
    setMessage(null);
    const code = (deptCode.trim() || slugCode(deptName)).slice(0, 40);
    const { error: err } = await supabase.from('departments').insert({
      code,
      name: deptName.trim(),
      status: 'active',
    });
    if (err) {
      setError(err.message);
      return;
    }
    setDeptName('');
    setDeptCode('');
    setMessage('Department created.');
    await load();
  }

  async function addTitle(e: FormEvent) {
    e.preventDefault();
    if (!canManageStaff) return;
    setError(null);
    setMessage(null);
    const { error: err } = await supabase.from('job_titles').insert({
      title: titleName.trim(),
      status: 'active',
    });
    if (err) {
      setError(err.message);
      return;
    }
    setTitleName('');
    setMessage('Job title created.');
    await load();
  }

  async function setDeptStatus(id: string, status: string) {
    if (!canManageDepts) return;
    const { error: err } = await supabase.from('departments').update({ status }).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function setTitleStatus(id: string, status: string) {
    if (!canManageStaff) return;
    const { error: err } = await supabase.from('job_titles').update({ status }).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  if (!canRead) {
    return (
      <section>
        <p>You do not have access to organisation settings.</p>
        <Link to="/staff">Back to staff</Link>
      </section>
    );
  }

  function statusButton(active: boolean, onToggle: (next: 'active' | 'inactive') => void) {
    return active ? (
      <button type="button" className="secondary org-status-btn is-deactivate" onClick={() => onToggle('inactive')}>
        Deactivate
      </button>
    ) : (
      <button type="button" className="org-status-btn is-activate" onClick={() => onToggle('active')}>
        Activate
      </button>
    );
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="muted-sm">
            <Link to="/staff">Staff</Link> / Settings
          </p>
          <h1>Departments &amp; Job Titles</h1>
          <p>Owner-managed lists used when creating and editing staff. Not hard-coded.</p>
        </div>
        <div className="page-head-actions">
          <Link to="/staff">
            <button type="button" className="secondary">
              Back to staff
            </button>
          </Link>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      <div className="org-settings-grid">
        <div className="panel">
          <h2>Departments</h2>
          {canManageDepts ? (
            <form className="form-compact org-create-form" onSubmit={(e) => void addDepartment(e)}>
              <div className="row-3 org-row-action">
                <label>
                  Name
                  <input
                    value={deptName}
                    onChange={(e) => {
                      setDeptName(e.target.value);
                      if (!deptCode) setDeptCode(slugCode(e.target.value));
                    }}
                    placeholder="Software Development"
                    required
                  />
                </label>
                <label>
                  Code
                  <input
                    value={deptCode}
                    onChange={(e) => setDeptCode(e.target.value)}
                    placeholder="software_dev"
                    required
                  />
                </label>
                <button type="submit">Add department</button>
              </div>
            </form>
          ) : (
            <p className="muted-sm">You can view departments. org.departments.manage is required to edit.</p>
          )}
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                {deptCounts ? <th>Staff</th> : null}
                <th>Status</th>
                {canManageDepts ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.code}</td>
                  {deptCounts ? <td>{deptCounts[d.id] ?? 0}</td> : null}
                  <td>
                    <span className={`status-chip ${d.status === 'active' ? 'ok' : 'muted'}`}>{d.status}</span>
                  </td>
                  {canManageDepts ? (
                    <td className="actions">
                      {statusButton(d.status === 'active', (next) => void setDeptStatus(d.id, next))}
                    </td>
                  ) : null}
                </tr>
              ))}
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={5} className="muted-sm">
                    No departments yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <h2>Job titles</h2>
          {canManageStaff ? (
            <form className="form-compact org-create-form" onSubmit={(e) => void addTitle(e)}>
              <div className="row-2 org-row-action">
                <label>
                  Title
                  <input
                    value={titleName}
                    onChange={(e) => setTitleName(e.target.value)}
                    placeholder="Senior Developer"
                    required
                  />
                </label>
                <button type="submit">Add job title</button>
              </div>
            </form>
          ) : (
            <p className="muted-sm">You can view titles. org.staff.manage is required to edit.</p>
          )}
          <table>
            <thead>
              <tr>
                <th>Title</th>
                {titleCounts ? <th>Staff</th> : null}
                <th>Status</th>
                {canManageStaff ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {titles.map((t) => (
                <tr key={t.id}>
                  <td>{t.title}</td>
                  {titleCounts ? <td>{titleCounts[t.id] ?? 0}</td> : null}
                  <td>
                    <span className={`status-chip ${t.status === 'active' ? 'ok' : 'muted'}`}>{t.status}</span>
                  </td>
                  {canManageStaff ? (
                    <td className="actions">
                      {statusButton(t.status === 'active', (next) => void setTitleStatus(t.id, next))}
                    </td>
                  ) : null}
                </tr>
              ))}
              {titles.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted-sm">
                    No job titles yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
