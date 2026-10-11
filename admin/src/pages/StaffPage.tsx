import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type StaffRow = {
  id: string;
  full_name: string;
  email: string;
  account_status: string;
  mfa_required: boolean;
};

export function StaffPage() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('profiles')
        .select('id, full_name, email, account_status, mfa_required')
        .eq('account_kind', 'staff')
        .order('full_name');
      if (err) setError(err.message);
      else setRows((data as StaffRow[]) ?? []);
    })();
  }, []);

  return (
    <section>
      <header className="page-head">
        <h1>Staff</h1>
        <p>Staff directory. Scoped invitations (PA-06) are not required for Owner bootstrap.</p>
      </header>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>MFA required</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.full_name}</td>
              <td>{r.email}</td>
              <td>{r.account_status}</td>
              <td>{r.mfa_required ? 'Yes' : 'No'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
