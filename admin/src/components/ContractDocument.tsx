import { formatMoney } from '../lib/devRecords';
import type { ContractBody } from '../lib/contractBody';
import { jurisdictionLabel, labelContractStatus, parseJurisdiction } from '../lib/contractBody';

export type ContractDocumentModel = {
  contract_number: string;
  title: string;
  status: string;
  currency_code: string;
  value_amount: number | null;
  subtotal: number;
  tax_total: number;
  payment_terms: string | null;
  effective_on: string | null;
  ends_on: string | null;
  version_no: number;
  template_name?: string | null;
  client_name: string;
  body: ContractBody;
  quotation_snapshot?: {
    quote_number?: string;
    currency_code?: string;
    total?: number;
    snapshotted_at?: string;
  } | null;
  acceptance?: {
    accepted_by_name?: string;
    accepted_by_email?: string | null;
    method?: string;
    recorded_at?: string;
    document_version?: number;
    legal_esignature?: boolean;
    disclaimer?: string;
  } | null;
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function termLines(text: string): string[] {
  return String(text || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Professional service agreement — shared by screen preview and A4 PDF export. */
export function ContractDocument({ model }: { model: ContractDocumentModel }) {
  const ccy = model.currency_code || 'GBP';
  const body = model.body;
  const total =
    model.value_amount != null
      ? Number(model.value_amount)
      : Number(body.total) || Number(model.subtotal) + Number(model.tax_total);
  const hasQuotation = Boolean(model.quotation_snapshot?.quote_number);
  const jurisdiction = parseJurisdiction(body.governing_jurisdiction);

  return (
    <article className="quote-doc contract-doc" aria-label={`Agreement ${model.contract_number}`}>
      <header className="quote-doc-header" data-pdf-keep>
        <div>
          <div className="quote-doc-brand">OkangGroup</div>
          <div className="quote-doc-tagline">Service agreement</div>
        </div>
        <div className="quote-doc-meta">
          <h1>Service Agreement</h1>
          <p>
            <strong>{model.contract_number}</strong>
          </p>
          <p className="quote-doc-status">
            Status: {labelContractStatus(model.status)} · v{model.version_no}
          </p>
        </div>
      </header>

      <div className="quote-doc-parties" data-pdf-keep>
        <div>
          <h2>Client</h2>
          <p className="quote-doc-client">{model.client_name}</p>
          <p className="quote-doc-notes">{model.title}</p>
        </div>
        <div>
          <h2>Agreement details</h2>
          <dl className="quote-doc-dl">
            <div>
              <dt>Effective</dt>
              <dd>{formatDate(model.effective_on)}</dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>{formatDate(model.ends_on)}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>{ccy}</dd>
            </div>
            <div>
              <dt>Governing law</dt>
              <dd>{jurisdictionLabel(jurisdiction)}</dd>
            </div>
            {model.template_name ? (
              <div>
                <dt>Template</dt>
                <dd>{model.template_name}</dd>
              </div>
            ) : null}
            {hasQuotation ? (
              <div>
                <dt>Accepted quotation</dt>
                <dd>
                  {model.quotation_snapshot!.quote_number} (
                  {formatMoney(
                    model.quotation_snapshot!.currency_code || ccy,
                    Number(model.quotation_snapshot!.total) || 0,
                  )}
                  )
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {body.scope_of_work ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>1. Scope of work</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{body.scope_of_work}</p>
          </div>
        </section>
      ) : null}

      {body.services.length > 0 ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>2. Schedule of services</h2>
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
                {body.services.map((l, i) => {
                  const amount = l.line_total != null ? Number(l.line_total) : l.quantity * l.unit_amount;
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
                <span>{formatMoney(ccy, model.subtotal || body.subtotal || 0)}</span>
              </div>
              <div className="quote-doc-totals-row">
                <span>
                  Tax
                  {body.tax_mode === 'percent' && body.tax_rate
                    ? ` (${body.tax_rate}%)`
                    : body.tax_mode === 'fixed'
                      ? ' (fixed)'
                      : ''}
                </span>
                <span>{formatMoney(ccy, model.tax_total || body.tax_total || 0)}</span>
              </div>
              <div className="quote-doc-totals-row quote-doc-totals-grand">
                <span>Contract value</span>
                <span>{formatMoney(ccy, total)}</span>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>2. Contract value</h2>
            <p>
              <strong>{formatMoney(ccy, total)}</strong>
            </p>
          </div>
        </section>
      )}

      {body.deliverables.some((d) => d.title || d.description) ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>3. Deliverables</h2>
            <ul className="contract-doc-list">
              {body.deliverables.map((d, i) => (
                <li key={i}>
                  <strong>{d.title || 'Deliverable'}</strong>
                  {d.description ? ` — ${d.description}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {body.milestones.some((m) => m.title || m.description) ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>4. Milestones</h2>
            <ul className="contract-doc-list">
              {body.milestones.map((m, i) => (
                <li key={i}>
                  <strong>{m.title || 'Milestone'}</strong>
                  {m.due_offset_days != null ? ` (target +${m.due_offset_days} days)` : ''}
                  {m.due_on ? ` · due ${formatDate(m.due_on)}` : ''}
                  {m.description ? ` — ${m.description}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {body.payment_schedule.length > 0 ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>5. Payment schedule</h2>
            {model.payment_terms ? <p className="quote-doc-notes">{model.payment_terms}</p> : null}
            <table className="quote-doc-table">
              <thead>
                <tr>
                  <th scope="col">Instalment</th>
                  <th scope="col">%</th>
                  <th scope="col">Trigger</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {body.payment_schedule.map((p, i) => (
                  <tr key={i} className="quote-doc-line">
                    <td>{p.label}</td>
                    <td>{p.percent}%</td>
                    <td>{p.trigger.replace(/_/g, ' ')}</td>
                    <td>{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="quote-doc-section">
        {body.okang_responsibilities ? (
          <div data-pdf-keep className="contract-doc-keep">
            <h2>6. Responsibilities</h2>
            <h3 className="contract-doc-h3">OkangGroup</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{body.okang_responsibilities}</p>
          </div>
        ) : body.client_responsibilities ? (
          <div data-pdf-keep className="contract-doc-keep">
            <h2>6. Responsibilities</h2>
            <h3 className="contract-doc-h3">Client</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{body.client_responsibilities}</p>
          </div>
        ) : (
          <div data-pdf-keep className="contract-doc-keep">
            <h2>6. Responsibilities</h2>
          </div>
        )}
        {body.okang_responsibilities && body.client_responsibilities ? (
          <div data-pdf-keep className="contract-doc-keep">
            <h3 className="contract-doc-h3">Client</h3>
            <p style={{ whiteSpace: 'pre-wrap' }}>{body.client_responsibilities}</p>
          </div>
        ) : null}
      </section>

      {body.terms_and_conditions ? (
        <section className="quote-doc-section">
          {(() => {
            const lines = termLines(body.terms_and_conditions);
            if (!lines.length) return null;
            const [first, ...rest] = lines;
            return (
              <>
                <div data-pdf-keep className="contract-doc-keep">
                  <h2>7. Terms and conditions</h2>
                  <p className="contract-doc-term" style={{ whiteSpace: 'pre-wrap' }}>
                    {first}
                  </p>
                </div>
                {rest.map((line, i) => (
                  <p key={i} data-pdf-keep className="contract-doc-term" style={{ whiteSpace: 'pre-wrap' }}>
                    {line}
                  </p>
                ))}
              </>
            );
          })()}
        </section>
      ) : null}

      {model.acceptance?.accepted_by_name ? (
        <section className="quote-doc-section">
          <div data-pdf-keep className="contract-doc-keep">
            <h2>Acceptance record</h2>
            <dl className="quote-doc-dl">
              <div>
                <dt>Accepted by</dt>
                <dd>
                  {model.acceptance.accepted_by_name}
                  {model.acceptance.accepted_by_email ? ` · ${model.acceptance.accepted_by_email}` : ''}
                </dd>
              </div>
              <div>
                <dt>Recorded</dt>
                <dd>{formatDate(model.acceptance.recorded_at)}</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>{(model.acceptance.method || 'recorded_in_okanggroup').replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt>Document version</dt>
                <dd>v{model.acceptance.document_version ?? model.version_no}</dd>
              </div>
            </dl>
            <p className="quote-doc-notes">
              {model.acceptance.disclaimer ||
                'Recorded acceptance evidence in OkangGroup — not a certified electronic signature.'}
            </p>
          </div>
        </section>
      ) : null}

      <footer className="quote-doc-footer" data-pdf-keep>
        <p>OkangGroup · Confidential commercial agreement · {model.contract_number}</p>
      </footer>
    </article>
  );
}
