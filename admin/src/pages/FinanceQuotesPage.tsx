import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QuotationDocument, type QuotationDocumentModel } from '../components/QuotationDocument';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { formatMoney, looksLikeDevRecord } from '../lib/devRecords';
import { exportQuotationPdf } from '../lib/exportQuotationPdf';
import { loadShowDevRecords, saveShowDevRecords } from '../lib/showDevRecords';

type QuoteLine = {
  description: string;
  quantity: number;
  unit_amount: number;
  optional?: boolean;
};

/** Form draft keeps raw strings so users can clear/edit without zeros snapping back. */
type QuoteLineDraft = {
  description: string;
  quantity: string;
  unit_amount: string;
  optional?: boolean;
};

type Quote = {
  id: string;
  quote_number: string;
  status: string;
  currency_code: string;
  subtotal: number;
  tax_total: number;
  total: number;
  client_id: string;
  valid_until: string | null;
  notes: string | null;
  created_at?: string | null;
  lines_json: QuoteLine[];
  clients?: { legal_name: string } | null;
};

type Client = { id: string; legal_name: string };

const emptyLine = (): QuoteLineDraft => ({
  description: '',
  quantity: '1',
  unit_amount: '',
  optional: false,
});

function parseLines(raw: unknown): QuoteLine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [{ description: '', quantity: 1, unit_amount: 0, optional: false }];
  }
  return raw.map((l) => ({
    description: String((l as QuoteLine).description ?? ''),
    quantity: Number((l as QuoteLine).quantity ?? 1),
    unit_amount: Number((l as QuoteLine).unit_amount ?? 0),
    optional: Boolean((l as QuoteLine).optional),
  }));
}

function toDraftLines(raw: unknown): QuoteLineDraft[] {
  return parseLines(raw).map((l) => ({
    description: l.description,
    quantity: String(l.quantity ?? 1),
    unit_amount: l.unit_amount === 0 ? '' : String(l.unit_amount),
    optional: l.optional,
  }));
}

function numOrZero(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

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

export function FinanceQuotesPage() {
  const { can } = useAuth();
  const canManage = can('finance.quotes.manage');
  const [rows, setRows] = useState<Quote[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const [lines, setLines] = useState<QuoteLineDraft[]>([emptyLine()]);
  const [taxRate, setTaxRate] = useState('');
  const [discount, setDiscount] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('Due within 14 days of acceptance');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Quote | null>(null);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDev, setShowDev] = useState(loadShowDevRecords);

  const clientName =
    clients.find((c) => c.id === (viewing?.client_id ?? clientId))?.legal_name ??
    viewing?.clients?.legal_name ??
    'Client';
  const isReadOnlyView = Boolean(viewing && viewing.status !== 'draft');

  const liveTotals = useMemo(() => {
    const subtotal = lines.reduce(
      (s, l) => s + Math.max(0, numOrZero(l.quantity)) * Math.max(0, numOrZero(l.unit_amount)),
      0,
    );
    const disc = Math.min(Math.max(0, Number(discount) || 0), subtotal);
    const tax = ((subtotal - disc) * Math.max(0, Number(taxRate) || 0)) / 100;
    return {
      subtotal,
      discount: disc,
      tax,
      total: subtotal - disc + tax,
    };
  }, [lines, discount, taxRate]);

  async function load() {
    const [{ data, error: err }, { data: c }] = await Promise.all([
      supabase
        .from('quotations')
        .select(
          'id, quote_number, status, currency_code, subtotal, tax_total, total, client_id, valid_until, notes, created_at, lines_json, clients(legal_name)',
        )
        .order('created_at', { ascending: false }),
      supabase.from('clients').select('id, legal_name').order('legal_name'),
    ]);
    if (err) setError(err.message);
    else {
      setRows(
        ((data as unknown as Quote[]) ?? []).map((r) => ({
          ...r,
          clients: Array.isArray(r.clients) ? r.clients[0] : r.clients,
          lines_json: parseLines(r.lines_json),
        })),
      );
    }
    setClients((c as Client[]) ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  function resetBuilder() {
    setEditingId(null);
    setViewing(null);
    setClientId('');
    setCurrency('GBP');
    setLines([emptyLine()]);
    setTaxRate('');
    setDiscount('');
    setValidUntil('');
    setPaymentTerms('Due within 14 days of acceptance');
    setNotes('');
  }

  function openQuote(q: Quote) {
    setViewing(q);
    setEditingId(q.status === 'draft' && canManage ? q.id : null);
    setClientId(q.client_id);
    setCurrency(q.currency_code);
    setLines(toDraftLines(q.lines_json));
    setValidUntil(q.valid_until ?? '');
    setPaymentTerms(extractPaymentTerms(q.notes) || 'Due within 14 days of acceptance');
    setNotes(customerNotesOnly(q.notes));
    const discMatch = q.notes?.match(/Discount:\s*([\d.]+)/i);
    const taxMatch = q.notes?.match(/Tax rate:\s*([\d.]+)/i);
    setDiscount(discMatch?.[1] ?? '');
    setTaxRate(taxMatch?.[1] ?? '');
    setPreviewOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // After paint, focus print area for clarity
    window.setTimeout(() => {
      document.getElementById('quote-print-area')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }

  async function saveDraft(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    const { data, error: err } = await supabase.rpc('save_quotation_draft', {
      p_client_id: clientId,
      p_currency: currency,
      p_lines: lines.map((l) => ({
        description: l.description,
        quantity: Math.max(0, numOrZero(l.quantity)),
        unit_amount: Math.max(0, numOrZero(l.unit_amount)),
        optional: Boolean(l.optional),
      })),
      p_tax_rate: Number(taxRate) || 0,
      p_discount_amount: Number(discount) || 0,
      p_valid_until: validUntil || null,
      p_notes: notes || null,
      p_payment_terms: paymentTerms || null,
      p_quotation_id: editingId,
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      const saved = data as Quote;
      setMessage(
        editingId
          ? `Draft ${saved.quote_number ?? ''} updated.`
          : `Draft quotation ${saved.quote_number ?? ''} created.`,
      );
      await load();
      const client =
        clients.find((c) => c.id === saved.client_id) ??
        ({ legal_name: clientName } as Client);
      openQuote({
        ...saved,
        lines_json: parseLines(saved.lines_json),
        clients: { legal_name: client.legal_name },
      });
    }
  }

  function toDocumentModel(q: Quote): QuotationDocumentModel {
    return {
      quote_number: q.quote_number,
      status: q.status,
      currency_code: q.currency_code,
      subtotal: Number(q.subtotal) || 0,
      tax_total: Number(q.tax_total) || 0,
      total: Number(q.total) || 0,
      valid_until: q.valid_until,
      notes: q.notes,
      created_at: q.created_at ?? null,
      lines: parseLines(q.lines_json),
      client_name: q.clients?.legal_name ?? clients.find((c) => c.id === q.client_id)?.legal_name ?? 'Client',
    };
  }

  async function printSavedQuote() {
    if (!viewing) {
      setError('Save or open a quotation before printing. The PDF always uses the saved record.');
      return;
    }
    const source = document.getElementById('quote-print-area');
    if (!source) {
      setError('Quotation preview is not ready to print.');
      return;
    }

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Off-screen host: true PDF via jsPDF (no browser URL/title/date chrome, no blank page).
      const host = document.createElement('div');
      host.id = 'quote-print-host';
      host.className = 'quote-print-host quote-print-host-export';
      const clone = source.cloneNode(true) as HTMLElement;
      clone.id = 'quote-print-export-root';
      host.appendChild(clone);
      document.body.appendChild(host);

      const result = await exportQuotationPdf({
        element: clone,
        fileName: `${viewing.quote_number}.pdf`,
      });
      host.remove();
      setMessage(
        result.pages === 1
          ? `Downloaded ${result.fileName} as a single-page A4 quotation.`
          : `Downloaded ${result.fileName} (${result.pages} pages for longer content).`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: string) {
    const { error: err } = await supabase.from('quotations').update({ status }).eq('id', id);
    if (err) setError(err.message);
    else await load();
  }

  async function revise(id: string) {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('revise_quotation', { p_quotation_id: id });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setMessage(`Revision draft ${((data as Quote) ?? {}).quote_number ?? ''} created.`);
      await load();
      if (data) openQuote({ ...(data as Quote), clients: viewing?.clients ?? null });
    }
  }

  const visibleRows = showDev
    ? rows
    : rows.filter((r) => !looksLikeDevRecord(r.clients?.legal_name, r.quote_number, r.notes));

  const savedDocument = viewing ? toDocumentModel(viewing) : null;

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Quotations</h1>
          <p>Prepare professional, multi-line quotations with preview before sending.</p>
        </div>
        <div className="actions">
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
          <Link to="/finance/invoices">
            <button type="button" className="secondary">
              Invoices
            </button>
          </Link>
        </div>
      </header>
      {error ? <div className="error">{error}</div> : null}
      {message ? <div className="ok">{message}</div> : null}

      {(canManage || viewing) ? (
        <div className="quote-builder-grid">
          {canManage && !isReadOnlyView ? (
          <form className="panel form-compact" onSubmit={(e) => void saveDraft(e)}>
            <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit draft quotation' : 'Quotation builder'}</h2>
            <div className="row-2">
              <label>
                Client
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                  <option value="">Select…</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.legal_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Currency
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option value="GBP">GBP</option>
                  <option value="GHS">GHS</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </label>
            </div>

            <div className="table-scroll quote-lines-table">
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Qty</th>
                    <th>Unit price</th>
                    <th>Line</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const lineTotal =
                      Math.max(0, numOrZero(line.quantity)) * Math.max(0, numOrZero(line.unit_amount));
                    return (
                      <tr key={idx}>
                        <td>
                          <input
                            value={line.description}
                            placeholder="Service or deliverable"
                            onChange={(e) => {
                              const next = [...lines];
                              next[idx] = { ...line, description: e.target.value };
                              setLines(next);
                            }}
                            required
                          />
                        </td>
                        <td className="quote-num-cell">
                          <input
                            className="quote-num-input"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label="Quantity"
                            value={line.quantity}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^\d.]/g, '');
                              const next = [...lines];
                              next[idx] = { ...line, quantity: v };
                              setLines(next);
                            }}
                          />
                        </td>
                        <td className="quote-num-cell quote-price-cell">
                          <input
                            className="quote-num-input"
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            aria-label="Unit price"
                            placeholder="0.00"
                            value={line.unit_amount}
                            onChange={(e) => {
                              const v = e.target.value.replace(/[^\d.]/g, '');
                              const next = [...lines];
                              next[idx] = { ...line, unit_amount: v };
                              setLines(next);
                            }}
                          />
                        </td>
                        <td className="muted-sm">{formatMoney(currency, lineTotal)}</td>
                        <td>
                          <button
                            type="button"
                            className="linkish"
                            disabled={lines.length <= 1}
                            onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" className="secondary" onClick={() => setLines([...lines, emptyLine()])}>
              Add line
            </button>

            <div className="row-3">
              <label>
                Discount ({currency})
                <input
                  className="quote-num-input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                />
              </label>
              <label>
                Tax rate (%)
                <input
                  className="quote-num-input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ''))}
                />
              </label>
              <label>
                Valid until
                <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
              </label>
            </div>
            <label>
              Payment terms
              <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
            </label>
            <label>
              Customer notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </label>
            <div className="actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="submit" disabled={busy}>
                {editingId ? 'Save draft' : 'Create draft'}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setPreviewOpen((v) => !v)}
              >
                {previewOpen ? 'Hide preview' : 'Show preview'}
              </button>
              {editingId ? (
                <button type="button" className="secondary" onClick={resetBuilder}>
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
          ) : isReadOnlyView ? (
            <div className="panel no-print">
              <h2 style={{ marginTop: 0 }}>Viewing {viewing?.quote_number}</h2>
              <p className="muted-sm">
                Status: <span className="status-chip">{viewing?.status}</span>
                {' · '}
                PDF exports the saved quotation only (no admin chrome). Use Revise to create a new draft.
              </p>
              <div className="actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="quote-print-btn"
                  disabled={busy}
                  onClick={() => void printSavedQuote()}
                >
                  {busy ? 'Preparing PDF…' : 'Download PDF'}
                </button>
                <button type="button" className="secondary" onClick={resetBuilder}>
                  Close
                </button>
                {canManage && viewing && ['accepted', 'sent', 'rejected', 'expired'].includes(viewing.status) ? (
                  <button type="button" className="secondary" onClick={() => void revise(viewing.id)}>
                    Revise
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {savedDocument && (previewOpen || isReadOnlyView || Boolean(viewing)) ? (
            <div className="quote-preview-shell no-print-chrome">
              <div className="quote-preview-toolbar no-print">
                <p className="muted-sm" style={{ margin: 0 }}>
                  Preview of <strong>saved</strong> {savedDocument.quote_number} ({savedDocument.status})
                </p>
                <button
                  type="button"
                  className="quote-print-btn"
                  disabled={busy}
                  onClick={() => void printSavedQuote()}
                >
                  {busy ? 'Preparing PDF…' : 'Download PDF'}
                </button>
              </div>
              <div className="quote-print-root" id="quote-print-area">
                <QuotationDocument model={savedDocument} />
              </div>
            </div>
          ) : previewOpen && canManage && !viewing ? (
            <div className="quote-preview-shell no-print">
              <p className="muted-sm">
                Live draft estimate: {formatMoney(currency, liveTotals.total)}. Save the quotation to
                generate a customer PDF.
              </p>
              <p>
                Subtotal {formatMoney(currency, liveTotals.subtotal)} · Tax{' '}
                {formatMoney(currency, liveTotals.tax)} · Total {formatMoney(currency, liveTotals.total)}
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="panel no-print">
        <h2 style={{ marginTop: 0 }}>Quotations</h2>
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Client</th>
              <th>Total</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const isDev = looksLikeDevRecord(r.clients?.legal_name, r.quote_number);
              return (
                <tr
                  key={r.id}
                  className={`task-row is-clickable${viewing?.id === r.id ? ' row-selected' : ''}`}
                  tabIndex={0}
                  role="link"
                  aria-label={`View quotation ${r.quote_number}`}
                  onClick={() => openQuote(r)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openQuote(r);
                    }
                  }}
                >
                  <td>
                    <span className="title-link">{r.quote_number}</span>
                    {isDev ? <span className="dev-badge">Dev</span> : null}
                  </td>
                  <td>{r.clients?.legal_name ?? r.client_id}</td>
                  <td>{formatMoney(r.currency_code, Number(r.total))}</td>
                  <td>
                    <span className="status-chip">{r.status}</span>
                  </td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="linkish" onClick={() => openQuote(r)}>
                      {r.status === 'draft' && canManage ? 'Edit' : 'View / Print'}
                    </button>
                    {canManage && r.status === 'draft' ? (
                      <button type="button" className="linkish" onClick={() => void setStatus(r.id, 'sent')}>
                        Mark sent
                      </button>
                    ) : null}
                    {canManage && r.status === 'sent' ? (
                      <>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => void setStatus(r.id, 'accepted')}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => void setStatus(r.id, 'rejected')}
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                    {canManage && ['accepted', 'sent', 'rejected', 'expired'].includes(r.status) ? (
                      <button type="button" className="linkish" onClick={() => void revise(r.id)}>
                        Revise
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={5}>No quotations.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
