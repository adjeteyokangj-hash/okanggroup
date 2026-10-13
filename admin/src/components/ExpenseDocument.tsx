import { formatMoney } from '../lib/devRecords';
import { labelExpenseStatus, methodLabel } from '../lib/expenseMath';

export type ExpenseDocumentModel = {
  title: string;
  status: string;
  currency_code: string;
  spent_on: string | null;
  reference_number?: string | null;
  category_name?: string | null;
  vendor_name?: string | null;
  client_name?: string | null;
  project_name?: string | null;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  amount: number;
  payment_method?: string | null;
  payment_status?: string | null;
  paid_on?: string | null;
  description?: string | null;
  notes?: string | null;
  rejection_reason?: string | null;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ExpenseDocument({ model }: { model: ExpenseDocumentModel }) {
  const ccy = model.currency_code || 'GBP';
  const statusLabel = labelExpenseStatus(model.status);

  return (
    <article className="quote-doc invoice-doc" aria-label={`Expense ${model.title}`}>
      <header className="quote-doc-header" data-pdf-keep>
        <div>
          <div className="quote-doc-brand">OkangGroup</div>
          <div className="quote-doc-tagline">Expense record</div>
        </div>
        <div className="quote-doc-meta">
          <h1>Expense</h1>
          <p>
            <strong>{model.title}</strong>
          </p>
          <p className="quote-doc-status">Status: {statusLabel}</p>
        </div>
      </header>

      <div className="invoice-balance-banner" data-pdf-keep>
        <div>
          <span className="invoice-balance-label">Net</span>
          <strong>{formatMoney(ccy, Number(model.net_amount) || 0)}</strong>
        </div>
        <div>
          <span className="invoice-balance-label">
            Tax{model.tax_rate > 0 ? ` (${model.tax_rate}%)` : ''}
          </span>
          <strong>{formatMoney(ccy, Number(model.tax_amount) || 0)}</strong>
        </div>
        <div className="invoice-balance-outstanding">
          <span className="invoice-balance-label">Total</span>
          <strong>{formatMoney(ccy, Number(model.amount) || 0)}</strong>
        </div>
        <div>
          <span className="invoice-balance-label">Payment</span>
          <strong>{model.payment_status === 'paid' ? 'Paid' : 'Unpaid'}</strong>
        </div>
      </div>

      <div className="quote-doc-parties" data-pdf-keep>
        <div>
          <h2>Vendor / payee</h2>
          <p className="quote-doc-client">{model.vendor_name || '—'}</p>
          {model.category_name ? <p className="quote-doc-notes">Category: {model.category_name}</p> : null}
        </div>
        <div>
          <h2>Details</h2>
          <p>Date: {formatDate(model.spent_on)}</p>
          {model.reference_number ? <p>Reference: {model.reference_number}</p> : null}
          <p>Method: {methodLabel(model.payment_method)}</p>
          {model.paid_on ? <p>Paid on: {formatDate(model.paid_on)}</p> : null}
          {model.client_name ? <p>Client: {model.client_name}</p> : null}
          {model.project_name ? <p>Project: {model.project_name}</p> : null}
        </div>
      </div>

      {model.description ? (
        <section data-pdf-keep>
          <h2>Description</h2>
          <p className="quote-doc-notes">{model.description}</p>
        </section>
      ) : null}

      {model.notes ? (
        <section data-pdf-keep>
          <h2>Notes</h2>
          <p className="quote-doc-notes">{model.notes}</p>
        </section>
      ) : null}

      {model.rejection_reason ? (
        <section data-pdf-keep>
          <h2>Rejection reason</h2>
          <p className="quote-doc-notes">{model.rejection_reason}</p>
        </section>
      ) : null}

      <footer className="quote-doc-footer" data-pdf-keep>
        <p>Generated from OkangGroup admin · currencies are never combined across codes.</p>
      </footer>
    </article>
  );
}
