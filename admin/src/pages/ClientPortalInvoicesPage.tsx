import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type Invoice = {
  id: string;
  invoice_number: string;
  status: string;
  currency_code: string;
  total: number;
  amount_outstanding: number;
  issue_date: string | null;
  due_date: string | null;
};

export function ClientPortalInvoicesPage() {
  const [rows, setRows] = useState<Invoice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error: err } = await supabase
        .from('invoices')
        .select(
          'id, invoice_number, status, currency_code, total, amount_outstanding, issue_date, due_date',
        )
        .order('created_at', { ascending: false });
      if (err) setError(err.message);
      else setRows((data as Invoice[]) ?? []);
    })();
  }, []);

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Invoices</h1>
          <p>Issued invoices for your organisation. Contact OkangGroup for payment queries.</p>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>Issued</th>
            <th>Due</th>
            <th>Total</th>
            <th>Outstanding</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.invoice_number}</td>
              <td>{r.issue_date ?? '—'}</td>
              <td>{r.due_date ?? '—'}</td>
              <td>
                {r.currency_code} {Number(r.total).toFixed(2)}
              </td>
              <td>{Number(r.amount_outstanding).toFixed(2)}</td>
              <td>{r.status}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6}>No invoices yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="muted-sm">
        <Link to="/portal">Back to portal home</Link>
      </p>
    </section>
  );
}
