import { formatMoney } from '../lib/devRecords';
import { quotationDiscount } from '../lib/quotationMath';

export type QuotationDocumentLine = {
  description: string;
  quantity: number;
  unit_amount: number;
  line_total?: number;
  optional?: boolean;
};

export type QuotationDocumentModel = {
  quote_number: string;
  status: string;
  currency_code: string;
  subtotal: number;
  tax_total: number;
  total: number;
  valid_until: string | null;
  notes: string | null;
  created_at?: string | null;
  lines: QuotationDocumentLine[];
  client_name: string;
};

function extractPaymentTerms(notes: string | null): string {
  if (!notes) return '';
  const m = notes.match(/Payment terms:\s*(.+?)(?:\n---\n|$)/i);
  return m?.[1]?.trim() ?? '';
}

function customerNotesOnly(notes: string | null): string {
  if (!notes) return '';
  return notes
    .split(/\n---\n/)
    .map((p) => p.trim())
    .filter((p) => p && !/^Payment terms:/i.test(p) && !/^Discount:/i.test(p) && !/^Tax rate:/i.test(p))
    .join('\n')
    .trim();
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Professional quotation document — screen preview and print/PDF share this markup. */
export function QuotationDocument({ model }: { model: QuotationDocumentModel }) {
  const discount = quotationDiscount(model);
  const paymentTerms = extractPaymentTerms(model.notes);
  const notes = customerNotesOnly(model.notes);
  const ccy = model.currency_code || 'GBP';

  return (
    <article className="quote-doc" aria-label={`Quotation ${model.quote_number}`}>
      <header className="quote-doc-header">
        <div>
          <div className="quote-doc-brand">OkangGroup</div>
          <div className="quote-doc-tagline">Business solutions</div>
        </div>
        <div className="quote-doc-meta">
          <h1>Quotation</h1>
          <p>
            <strong>{model.quote_number}</strong>
          </p>
          <p className="quote-doc-status">Status: {model.status}</p>
        </div>
      </header>

      <div className="quote-doc-parties">
        <div>
          <h2>Prepared for</h2>
          <p className="quote-doc-client">{model.client_name}</p>
        </div>
        <div>
          <h2>Details</h2>
          <dl className="quote-doc-dl">
            <div>
              <dt>Issue date</dt>
              <dd>{formatDate(model.created_at)}</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{formatDate(model.valid_until)}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{ccy}</dd>
            </div>
          </dl>
        </div>
      </div>

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
            const qty = Number(l.quantity) || 0;
            const unit = Number(l.unit_amount) || 0;
            const amount = l.line_total != null ? Number(l.line_total) : qty * unit;
            return (
              <tr key={i} className="quote-doc-line">
                <td>
                  {l.description || 'Services'}
                  {l.optional ? <span className="quote-doc-optional"> (optional)</span> : null}
                </td>
                <td>{qty}</td>
                <td>{formatMoney(ccy, unit)}</td>
                <td>{formatMoney(ccy, amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="quote-doc-totals">
        <div className="quote-doc-totals-row">
          <span>Subtotal</span>
          <span>{formatMoney(ccy, Number(model.subtotal) || 0)}</span>
        </div>
        {discount > 0 ? (
          <div className="quote-doc-totals-row">
            <span>Discount</span>
            <span>{formatMoney(ccy, discount)}</span>
          </div>
        ) : null}
        <div className="quote-doc-totals-row">
          <span>Tax</span>
          <span>{formatMoney(ccy, Number(model.tax_total) || 0)}</span>
        </div>
        <div className="quote-doc-totals-row quote-doc-totals-grand">
          <span>Total</span>
          <span>{formatMoney(ccy, Number(model.total) || 0)}</span>
        </div>
      </div>

      {paymentTerms ? (
        <section className="quote-doc-section">
          <h2>Payment terms</h2>
          <p>{paymentTerms}</p>
        </section>
      ) : null}

      {notes ? (
        <section className="quote-doc-section">
          <h2>Notes</h2>
          <p className="quote-doc-notes">{notes}</p>
        </section>
      ) : null}

      <footer className="quote-doc-footer">
        <p>OkangGroup · This quotation was prepared for {model.client_name}.</p>
      </footer>
    </article>
  );
}
