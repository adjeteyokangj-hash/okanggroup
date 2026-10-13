import { formatMoney } from '../lib/devRecords';
import { labelInvoiceStatus, type InvoiceLine } from '../lib/invoiceMath';

export type InvoiceDocumentModel = {
  invoice_number: string;
  status: string;
  currency_code: string;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number;
  tax_total: number;
  discount_total?: number;
  total: number;
  amount_paid: number;
  amount_credited: number;
  amount_outstanding: number;
  notes?: string | null;
  payment_instructions?: string | null;
  client_name: string;
  lines: InvoiceLine[];
  tax_label?: string;
  contract_number?: string | null;
  payments?: Array<{
    paid_on: string;
    amount: number;
    method: string;
    provider_ref?: string | null;
  }>;
  credits?: Array<{
    credit_number: string;
    amount: number;
    reason: string;
  }>;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function InvoiceDocument({ model }: { model: InvoiceDocumentModel }) {
  const ccy = model.currency_code || 'GBP';
  const discount = Number(model.discount_total) || 0;
  const original = Number(model.total) || 0;
  const paid = Number(model.amount_paid) || 0;
  const credited = Number(model.amount_credited) || 0;
  const outstanding = Number(model.amount_outstanding) || 0;
  const statusLabel = labelInvoiceStatus(model.status);

  return (
    <article className="quote-doc invoice-doc" aria-label={`Invoice ${model.invoice_number}`}>
      <header className="quote-doc-header" data-pdf-keep>
        <div>
          <div className="quote-doc-brand">OkangGroup</div>
          <div className="quote-doc-tagline">Tax invoice / statement</div>
        </div>
        <div className="quote-doc-meta">
          <h1>Invoice</h1>
          <p>
            <strong>{model.invoice_number}</strong>
          </p>
          <p className="quote-doc-status">Payment status: {statusLabel}</p>
        </div>
      </header>

      <div className="invoice-balance-banner" data-pdf-keep>
        <div>
          <span className="invoice-balance-label">Original invoice</span>
          <strong>{formatMoney(ccy, original)}</strong>
        </div>
        <div>
          <span className="invoice-balance-label">Payments received</span>
          <strong>{formatMoney(ccy, paid)}</strong>
        </div>
        <div>
          <span className="invoice-balance-label">Credits applied</span>
          <strong>{formatMoney(ccy, credited)}</strong>
        </div>
        <div className="invoice-balance-outstanding">
          <span className="invoice-balance-label">Outstanding balance</span>
          <strong>{formatMoney(ccy, outstanding)}</strong>
        </div>
        <div>
          <span className="invoice-balance-label">Status</span>
          <strong>{statusLabel}</strong>
        </div>
      </div>

      <div className="quote-doc-parties" data-pdf-keep>
        <div>
          <h2>Bill to</h2>
          <p className="quote-doc-client">{model.client_name}</p>
          {model.contract_number ? (
            <p className="quote-doc-notes">Contract {model.contract_number}</p>
          ) : null}
        </div>
        <div>
          <h2>Invoice details</h2>
          <dl className="quote-doc-dl">
            <div>
              <dt>Issue date</dt>
              <dd>{formatDate(model.issue_date)}</dd>
            </div>
            <div>
              <dt>Due date</dt>
              <dd>{formatDate(model.due_date)}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{ccy}</dd>
            </div>
            <div>
              <dt>Payment status</dt>
              <dd>{statusLabel}</dd>
            </div>
          </dl>
        </div>
      </div>

      <section className="quote-doc-section">
        <div data-pdf-keep className="contract-doc-keep">
          <h2>Charges</h2>
          <table className="quote-doc-table">
            <thead>
              <tr>
                <th scope="col">Description</th>
                <th scope="col">Qty</th>
                <th scope="col">Unit</th>
                <th scope="col">Amount</th>
              </tr>
            </thead>
            <tbody>
              {model.lines.map((l, i) => {
                const amount =
                  l.line_total != null ? Number(l.line_total) : Number(l.quantity) * Number(l.unit_amount);
                return (
                  <tr key={i} className="quote-doc-line">
                    <td>{l.description || 'Services'}</td>
                    <td>{l.quantity}</td>
                    <td>{formatMoney(ccy, l.unit_amount)}</td>
                    <td>{formatMoney(ccy, amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="quote-doc-totals">
            <div className="quote-doc-totals-row">
              <span>Subtotal</span>
              <span>{formatMoney(ccy, model.subtotal)}</span>
            </div>
            {discount > 0 ? (
              <div className="quote-doc-totals-row">
                <span>Discount</span>
                <span>−{formatMoney(ccy, discount)}</span>
              </div>
            ) : null}
            <div className="quote-doc-totals-row">
              <span>{model.tax_label || 'Tax'}</span>
              <span>{formatMoney(ccy, model.tax_total)}</span>
            </div>
            <div className="quote-doc-totals-row quote-doc-totals-grand">
              <span>Original invoice total</span>
              <span>{formatMoney(ccy, original)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="quote-doc-section">
        <div data-pdf-keep className="contract-doc-keep">
          <h2>Account balance</h2>
          <table className="quote-doc-table invoice-balance-table">
            <tbody>
              <tr className="quote-doc-line">
                <td>Original invoice amount</td>
                <td>{formatMoney(ccy, original)}</td>
              </tr>
              <tr className="quote-doc-line">
                <td>Payments received</td>
                <td>−{formatMoney(ccy, paid)}</td>
              </tr>
              <tr className="quote-doc-line">
                <td>Credit notes applied</td>
                <td>−{formatMoney(ccy, credited)}</td>
              </tr>
              <tr className="quote-doc-line invoice-balance-outstanding-row">
                <td>
                  <strong>Outstanding balance</strong>
                  <span className="invoice-balance-status"> · {statusLabel}</span>
                </td>
                <td>
                  <strong>{formatMoney(ccy, outstanding)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {model.payments && model.payments.length > 0 ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>Payments received</h2>
            <table className="quote-doc-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Method</th>
                  <th scope="col">Reference</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {model.payments.map((p, i) => (
                  <tr key={i} className="quote-doc-line">
                    <td>{formatDate(p.paid_on)}</td>
                    <td>{p.method.replace(/_/g, ' ')}</td>
                    <td>{p.provider_ref || '—'}</td>
                    <td>{formatMoney(ccy, p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {model.credits && model.credits.length > 0 ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>Credit notes</h2>
            <table className="quote-doc-table">
              <thead>
                <tr>
                  <th scope="col">Number</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {model.credits.map((c, i) => (
                  <tr key={i} className="quote-doc-line">
                    <td>{c.credit_number}</td>
                    <td>{c.reason}</td>
                    <td>{formatMoney(ccy, c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {model.payment_instructions ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>Payment instructions</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{model.payment_instructions}</p>
          </div>
        </section>
      ) : null}

      {model.notes ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>Notes</h2>
            <p className="quote-doc-notes">{model.notes}</p>
          </div>
        </section>
      ) : null}

      <footer className="quote-doc-footer" data-pdf-keep>
        <p>OkangGroup · Confidential · {model.invoice_number}</p>
      </footer>
    </article>
  );
}
