import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import {
  assertGenerateResponseHasPassword,
  nextOneTimePasswordAfterLoad,
  type LoadPasswordOptions,
} from '../lib/tempPasswordDisplay';

type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  account_status: string;
  employment_status: string;
  employment_type: string | null;
  mfa_required: boolean;
  must_change_password: boolean;
  created_by: string | null;
};

type GrantRow = {
  id: string;
  status: string;
  roles: { code: string; name: string } | { code: string; name: string }[];
  access_scopes:
    | { id: string; scope_type: string; client_id: string | null; project_id: string | null }
    | { id: string; scope_type: string; client_id: string | null; project_id: string | null }[];
};

type Role = { id: string; code: string; name: string };
type Dept = { id: string; name: string };
type JobTitle = { id: string; title: string };
type Client = { id: string; legal_name: string; client_code: string };
type Project = { id: string; name: string; client_id: string; code: string };
type Membership = {
  id: string;
  department_id: string | null;
  job_title_id: string | null;
  status: string;
};

function one<T>(v: T | T[]): T {
  return Array.isArray(v) ? v[0] : v;
}

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
  return status;
}

export function StaffDetailPage() {
  const { id } = useParams();
  const { can, mfaRequired: sessionMfaRequired } = useAuth();
  const canManage = can('org.staff.manage');
  const canInvite = can('org.staff.invite');
  const canRoles = can('platform.roles.manage');

  const [profile, setProfile] = useState<Profile | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [privileged, setPrivileged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [credMethod, setCredMethod] = useState<'email' | 'temp'>('email');
  const [oneTimePassword, setOneTimePassword] = useState<string | null>(null);
  const [showPasswordPanel, setShowPasswordPanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [credentialsReady, setCredentialsReady] = useState(false);
  const [authUserExists, setAuthUserExists] = useState(false);
  const [credentialNote, setCredentialNote] = useState<string | null>(null);
  const [credentialCheckFailed, setCredentialCheckFailed] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [employmentType, setEmploymentType] = useState('');
  const [employmentStatus, setEmploymentStatus] = useState('active');
  const [departmentId, setDepartmentId] = useState('');
  const [jobTitleId, setJobTitleId] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);

  const [newRole, setNewRole] = useState('staff');
  const [newScope, setNewScope] = useState<'platform' | 'client' | 'project'>('client');
  const [newClient, setNewClient] = useState('');
  const [newProject, setNewProject] = useState('');

  async function verifyCredentials(profileId: string) {
    if (!canInvite && !canManage) {
      setCredentialsReady(false);
      setAuthUserExists(false);
      setCredentialCheckFailed(false);
      setCredentialNote(null);
      return;
    }
    try {
      const data = await invokeStaff({
        action: 'verify_staff_account',
        profile_id: profileId,
      });
      setCredentialsReady(Boolean(data?.credentials_ready));
      setAuthUserExists(Boolean(data?.auth_user_exists));
      setCredentialCheckFailed(false);
      setCredentialNote((data?.note as string) ?? null);
    } catch (err) {
      setCredentialsReady(false);
      setAuthUserExists(false);
      setCredentialCheckFailed(true);
      setCredentialNote(err instanceof Error ? err.message : String(err));
    }
  }

  async function load(options: LoadPasswordOptions = {}) {
    if (!id) return;
    setError(null);
    if (options.clearOneTimePassword !== false) {
      setMessage(null);
      setShowPasswordPanel(false);
      setCopied(false);
    }
    setOneTimePassword((current) => nextOneTimePasswordAfterLoad(current, options));
    setCredentialsReady(false);
    setAuthUserExists(false);
    setCredentialCheckFailed(false);
    setCredentialNote(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select(
        'id, full_name, email, phone, account_status, employment_status, employment_type, mfa_required, must_change_password, created_by',
      )
      .eq('id', id)
      .eq('account_kind', 'staff')
      .maybeSingle();
    if (err || !data) {
      setProfile(null);
      setError(err?.message ?? 'Staff not found');
      return;
    }
    const p = data as Profile;
    setProfile(p);
    setFullName(p.full_name);
    setPhone(p.phone ?? '');
    setEmploymentType(p.employment_type ?? '');
    setEmploymentStatus(p.employment_status ?? 'active');
    setMfaRequired(p.mfa_required);

    const { data: grantRows } = await supabase
      .from('role_grants')
      .select(
        'id, status, roles!inner(code, name), access_scopes!inner(id, scope_type, client_id, project_id)',
      )
      .eq('profile_id', id)
      .order('created_at', { ascending: false });
    setGrants((grantRows as GrantRow[]) ?? []);

    const isPriv = ((grantRows as GrantRow[]) ?? []).some((g) => {
      if (g.status !== 'active') return false;
      const role = one(g.roles);
      const scope = one(g.access_scopes);
      return scope.scope_type === 'platform' && (role.code === 'owner' || role.code === 'platform_admin');
    });
    setPrivileged(isPriv);

    const { data: mem } = await supabase
      .from('staff_memberships')
      .select('id, department_id, job_title_id, status')
      .eq('profile_id', id)
      .eq('status', 'active')
      .order('is_primary', { ascending: false })
      .limit(1)
      .maybeSingle();
    setMembership((mem as Membership) ?? null);
    setDepartmentId((mem as Membership | null)?.department_id ?? '');
    setJobTitleId((mem as Membership | null)?.job_title_id ?? '');

    const [{ data: roleData }, { data: deptData }, { data: titleData }, { data: clientData }, { data: projectData }] =
      await Promise.all([
        supabase.from('roles').select('id, code, name').eq('status', 'active').order('name'),
        supabase.from('departments').select('id, name').eq('status', 'active').order('name'),
        supabase.from('job_titles').select('id, title').eq('status', 'active').order('title'),
        supabase.from('clients').select('id, legal_name, client_code').order('legal_name'),
        supabase.from('projects').select('id, name, client_id, code').order('name'),
      ]);
    setRoles(
      ((roleData as Role[]) ?? []).filter((r) => !['client_admin', 'client_user'].includes(r.code)),
    );
    setDepartments((deptData as Dept[]) ?? []);
    setJobTitles((titleData as JobTitle[]) ?? []);
    setClients((clientData as Client[]) ?? []);
    setProjects((projectData as Project[]) ?? []);

    await verifyCredentials(p.id);
  }

  useEffect(() => {
    void load();
  }, [id]);

  async function saveDetails(e: FormEvent) {
    e.preventDefault();
    if (!canManage || !profile) return;
    setBusy(true);
    setError(null);
    setMessage(null);

    const { error: err } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        employment_type: employmentType || null,
        employment_status: employmentStatus,
        mfa_required: privileged ? true : mfaRequired,
      })
      .eq('id', profile.id);

    if (err) {
      setError(err.message);
      setBusy(false);
      return;
    }

    if (departmentId || jobTitleId) {
      if (membership) {
        await supabase
          .from('staff_memberships')
          .update({
            department_id: departmentId || null,
            job_title_id: jobTitleId || null,
          })
          .eq('id', membership.id);
      } else {
        await supabase.from('staff_memberships').insert({
          profile_id: profile.id,
          department_id: departmentId || null,
          job_title_id: jobTitleId || null,
          is_primary: true,
          started_at: new Date().toISOString().slice(0, 10),
          status: 'active',
        });
      }
    }

    setMessage('Staff details saved.');
    setBusy(false);
    await load();
  }

  async function sendSetup() {
    if (!profile || (!canInvite && !canManage)) return;
    setBusy(true);
    setError(null);
    setOneTimePassword(null);
    try {
      const data = await invokeStaff({
        action: 'send_setup',
        profile_id: profile.id,
        redirect_to: `${window.location.origin}/admin/reset-password`,
      });
      setMessage(data?.note ?? 'Account setup email sent.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateTempPassword() {
    if (!profile || (!canInvite && !canManage) || busy) return;
    // Protected already enforces MFA for privileged sessions; belt-and-braces for credential issuance.
    if (sessionMfaRequired) {
      setError('Complete MFA before generating staff credentials.');
      return;
    }
    setBusy(true);
    setError(null);
    setOneTimePassword(null);
    setShowPasswordPanel(false);
    setCopied(false);
    setMessage(null);
    try {
      const verify = await invokeStaff({
        action: 'verify_staff_account',
        profile_id: profile.id,
      });
      if (!verify?.profile_id) {
        throw new Error('Staff account could not be verified. Password was not generated.');
      }
      if (verify?.account_status === 'suspended' || verify?.account_status === 'offboarded') {
        throw new Error(`Cannot generate password while login is ${verify.account_status}.`);
      }
      if (verify?.auth_user_exists && verify?.auth_email_matches === false) {
        throw new Error(
          'Staff profile and Auth email do not match. Password was not generated.',
        );
      }

      const data = await invokeStaff({
        action: 'generate_temp_password',
        profile_id: profile.id,
      });
      const pw = assertGenerateResponseHasPassword(data ?? {});
      // Set password BEFORE refresh. load must preserve it (clearOneTimePassword: false).
      setOneTimePassword(pw);
      setShowPasswordPanel(true);
      setMessage('Temporary password generated successfully. Copy it now — it will not be shown again.');
      await load({ clearOneTimePassword: false });
    } catch (err) {
      setOneTimePassword(null);
      setShowPasswordPanel(false);
      setError(err instanceof Error ? err.message : String(err));
      setCredentialsReady(false);
      setMessage(null);
    } finally {
      setBusy(false);
    }
  }

  async function copyTempPassword() {
    if (!oneTimePassword) return;
    try {
      await navigator.clipboard.writeText(oneTimePassword);
      setCopied(true);
      setMessage('Password copied. Clear your clipboard when finished.');
    } catch {
      setError('Could not copy — select the password and copy manually.');
    }
  }

  function dismissPasswordPanel() {
    setOneTimePassword(null);
    setShowPasswordPanel(false);
    setCopied(false);
    setMessage(
      'Password panel closed. The temporary password cannot be retrieved again — generate a new one if needed.',
    );
  }

  async function addGrant(e: FormEvent) {
    e.preventDefault();
    if (!canRoles || !profile) return;
    setBusy(true);
    setError(null);
    try {
      const { data: scopeId, error: scopeErr } = await supabase.rpc('ensure_access_scope', {
        p_scope_type: newScope,
        p_client_id: newScope === 'platform' ? null : newClient || null,
        p_project_id: newScope === 'project' ? newProject || null : null,
      });
      if (scopeErr) throw scopeErr;

      const role = roles.find((r) => r.code === newRole);
      if (!role) throw new Error('Role not found');

      const { error: gErr } = await supabase.from('role_grants').insert({
        profile_id: profile.id,
        role_id: role.id,
        access_scope_id: scopeId,
        granted_by: (await supabase.auth.getUser()).data.user?.id,
        status: 'active',
      });
      if (gErr) throw gErr;
      setMessage('Grant added (usable only after login activation).');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function revokeGrant(grantId: string) {
    if (!canRoles) return;
    const { error: err } = await supabase
      .from('role_grants')
      .update({ status: 'revoked' })
      .eq('id', grantId);
    if (err) setError(err.message);
    else {
      setMessage('Grant revoked.');
      await load();
    }
  }

  async function setLoginStatus(action: 'suspend' | 'offboard' | 'reactivate_auth') {
    if (!canManage || !profile || privileged) return;
    setBusy(true);
    setError(null);
    try {
      const data = await invokeStaff({
        action,
        profile_id: profile.id,
        reason: action,
      });
      setMessage(
        action === 'reactivate_auth'
          ? (data?.note ?? 'Reactivated.')
          : `Account ${action === 'suspend' ? 'suspended' : 'offboarded'}. History retained.`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <section>
        {error ? <div className="error">{error}</div> : <p>Loading…</p>}
        <Link to="/staff">Back to staff</Link>
      </section>
    );
  }

  const needsSetup =
    profile.account_status === 'pending_setup' || profile.account_status === 'invited';

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="muted-sm">
            <Link to="/staff">Staff</Link> / {profile.full_name}
          </p>
          <h1>{profile.full_name}</h1>
          <p>
            {profile.email} · Employment: {profile.employment_status} · Login:{' '}
            {loginLabel(profile.account_status)}
            {privileged ? ' · Owner/Platform Admin (protected)' : ''}
          </p>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {(canInvite || canManage) && !privileged ? (
        <div className="panel">
          <h2>Account Credentials</h2>
          <p className="muted-sm">
            Login email: <strong>{profile.email}</strong>
            <br />
            Login status: <strong>{loginLabel(profile.account_status)}</strong>
            {profile.must_change_password ? (
              <>
                {' '}
                · <strong>Must change password on next login</strong>
              </>
            ) : null}
          </p>
          <p className="muted-sm">
            Password setup method — email lets staff choose their own password; temporary password
            is shown once to you and must be changed on first login. Passwords are never stored in
            OkangGroup tables.
          </p>
          <label className="check-row">
            <span>
              <input
                type="radio"
                name="credMethod"
                checked={credMethod === 'email'}
                onChange={() => setCredMethod('email')}
              />{' '}
              Send secure setup email
            </span>
          </label>
          <label className="check-row">
            <span>
              <input
                type="radio"
                name="credMethod"
                checked={credMethod === 'temp'}
                onChange={() => setCredMethod('temp')}
              />{' '}
              Generate temporary password
            </span>
          </label>
          <p className="muted-sm">☑ Require password change on first login (enforced for temporary passwords)</p>
          {credentialNote ? (
            <p
              className={credentialCheckFailed ? 'error' : 'muted-sm'}
              style={{ marginTop: '0.5rem' }}
            >
              {credentialCheckFailed ? credentialNote : `Account check: ${credentialNote}`}
            </p>
          ) : null}
          <div className="actions">
            {credMethod === 'email' ? (
              <button type="button" disabled={busy || credentialCheckFailed || !credentialsReady} onClick={() => void sendSetup()}>
                {needsSetup ? 'Send Account Setup' : 'Resend Setup'}
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  busy ||
                  showPasswordPanel ||
                  credentialCheckFailed ||
                  (!credentialsReady && authUserExists)
                }
                onClick={() => void generateTempPassword()}
              >
                {busy ? 'Generating…' : 'Generate Password'}
              </button>
            )}
          </div>
          {showPasswordPanel && oneTimePassword ? (
            <div className="password-reveal" role="status" aria-live="polite">
              <h3>Temporary Password Generated Successfully</h3>
              <dl className="password-reveal-grid">
                <div>
                  <dt>Staff</dt>
                  <dd>{profile.full_name}</dd>
                </div>
                <div>
                  <dt>Login email</dt>
                  <dd>{profile.email}</dd>
                </div>
                <div className="password-reveal-secret">
                  <dt>Temporary password</dt>
                  <dd>
                    <input type="text" readOnly value={oneTimePassword} aria-label="Temporary password" />
                  </dd>
                </div>
                <div>
                  <dt>Security</dt>
                  <dd>Must change password on first login</dd>
                </div>
              </dl>
              <p className="muted-sm">
                This password is shown once and is not stored in OkangGroup. Closing this panel
                removes it from view permanently.
              </p>
              <div className="actions">
                <button type="button" onClick={() => void copyTempPassword()}>
                  {copied ? 'Copied' : 'Copy Password'}
                </button>
                <button type="button" className="secondary" onClick={dismissPasswordPanel}>
                  Close
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {canManage ? (
        <form className="form-grid" onSubmit={(e) => void saveDetails(e)}>
          <h2 style={{ margin: 0, color: '#fff' }}>Edit staff</h2>
          <div className="row-2">
            <label>
              Full name
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </label>
            <label>
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <div className="row-2">
            <label>
              Employment type
              <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
                <option value="">—</option>
                <option value="employee">Employee</option>
                <option value="contractor">Contractor</option>
                <option value="freelancer">Freelancer</option>
              </select>
            </label>
            <label>
              Employment status
              <select
                value={employmentStatus}
                onChange={(e) => setEmploymentStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>
          <div className="row-2">
            <label>
              Department
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Job title
              <select value={jobTitleId} onChange={(e) => setJobTitleId(e.target.value)}>
                <option value="">—</option>
                {jobTitles.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            MFA required after login activation
            <select
              value={privileged || mfaRequired ? 'yes' : 'no'}
              disabled={privileged}
              onChange={(e) => setMfaRequired(e.target.value === 'yes')}
            >
              <option value="yes">Yes{privileged ? ' (locked)' : ''}</option>
              <option value="no">No</option>
            </select>
          </label>
          <button type="submit" disabled={busy}>
            Save details
          </button>
        </form>
      ) : null}

      {canRoles ? (
        <div className="panel">
          <h2>Access grants</h2>
          <p className="muted-sm">
            Backend RLS enforces scopes. Grants do not grant login until account setup completes.
          </p>
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Scope</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {grants.map((g) => {
                const role = one(g.roles);
                const scope = one(g.access_scopes);
                return (
                  <tr key={g.id}>
                    <td>
                      {role.name} ({role.code})
                    </td>
                    <td>
                      {scope.scope_type}
                      {scope.client_id ? ` · client ${scope.client_id.slice(0, 8)}…` : ''}
                      {scope.project_id ? ` · project ${scope.project_id.slice(0, 8)}…` : ''}
                    </td>
                    <td>{g.status}</td>
                    <td>
                      {g.status === 'active' && role.code !== 'owner' ? (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void revokeGrant(g.id)}
                        >
                          Revoke
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {!privileged ? (
            <form className="inline-form" onSubmit={(e) => void addGrant(e)} style={{ marginTop: '1rem' }}>
              <h3>Add grant</h3>
              <div className="row-2">
                <label>
                  Role
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                    {roles
                      .filter((r) => r.code !== 'owner')
                      .map((r) => (
                        <option key={r.id} value={r.code}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Scope
                  <select
                    value={newScope}
                    onChange={(e) => setNewScope(e.target.value as typeof newScope)}
                  >
                    <option value="platform">Platform</option>
                    <option value="client">Client</option>
                    <option value="project">Project</option>
                  </select>
                </label>
                {newScope !== 'platform' ? (
                  <label>
                    Client
                    <select value={newClient} onChange={(e) => setNewClient(e.target.value)} required>
                      <option value="">Select…</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.client_code} — {c.legal_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {newScope === 'project' ? (
                  <label>
                    Project
                    <select
                      value={newProject}
                      onChange={(e) => setNewProject(e.target.value)}
                      required
                    >
                      <option value="">Select…</option>
                      {projects
                        .filter((p) => p.client_id === newClient)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.code} — {p.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <button type="submit" disabled={busy}>
                Add grant
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {canManage && !privileged ? (
        <div className="panel">
          <h2>Login control</h2>
          <p className="muted-sm">
            Suspend/offboard blocks login and revokes grants. Employment history and tasks are kept.
          </p>
          <div className="actions">
            {profile.account_status === 'active' ? (
              <button type="button" disabled={busy} onClick={() => void setLoginStatus('suspend')}>
                Suspend Account
              </button>
            ) : null}
            {profile.account_status !== 'offboarded' ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void setLoginStatus('offboard')}
              >
                Offboard
              </button>
            ) : null}
            {profile.account_status === 'suspended' || profile.account_status === 'offboarded' ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void setLoginStatus('reactivate_auth')}
              >
                Reactivate Account
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
