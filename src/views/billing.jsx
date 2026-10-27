// Billing: quotes, invoices and payments. The staff side of docs/BILLING.md.
// Quote: draft -> sent -> accepted -> invoice (draft -> issued -> paid). The customer answers and pays through a private link; staff can also
// record a phone answer and money received in person. Every amount is whole paise/cents; every payment action carries its own Idempotency-Key.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, formatDay, todayIn, parseMoney, parsePercent, formatMinor, minorToInput, bpsToInput, newKey } from '../lib/format.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import { Badge, Spinner, Note, Empty, ErrorBox, PageHeader, DataTable, Field, Select, Details, toast, Overlay, ActionButton, Button } from '../lib/ui.jsx';

const QUOTE_TONE = { draft: 'neutral', sent: 'info', accepted: 'good', declined: 'bad', expired: 'warn', void: 'bad' };
const INVOICE_TONE = { draft: 'neutral', unpaid: 'info', partial: 'warn', overdue: 'bad', paid: 'good', void: 'bad' };
const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card (in person)'], ['bank_transfer', 'Bank transfer'], ['cheque', 'Cheque'], ['other', 'Other']];

const canWriteQuotes = () => can('dispatcher', 'admin');
const canSend = () => can('dispatcher', 'approver', 'admin');
const canTakePayment = () => can('dispatcher', 'approver', 'admin');
const canRefund = () => can('approver', 'admin');

// ---- a link the customer is given: shown once, so make it easy to copy ----

function LinkBox({ title, url, token, kind }) {
  const full = url || `${location.origin}/billing/${kind}/${token}`;
  const box = useRef(null);
  const copy = async () => {
    try { await navigator.clipboard.writeText(full); toast('Link copied.'); } catch { box.current?.select(); toast('Press Ctrl+C to copy.', 'warn'); }
  };
  return (
    <div className="card stack" data-testid="customer-link">
      <strong>{title}</strong>
      <div className="row">
        <input ref={box} type="text" readOnly value={full} aria-label={title} className="link-field" />
        <Button className="btn btn--outline btn--small" onClick={copy}>Copy</Button>
      </div>
      <p className="muted">This link is shown once. Anyone who has it can open this document, so send it only to the customer.</p>
    </div>
  );
}

// ---- the quote editor (create or change a draft) ----

let lineCounter = 0;
const newLine = (line = {}) => {
  lineCounter += 1;
  return {
    key: lineCounter,
    description: line.description || '',
    quantity: String(line.quantity ?? '1'),
    price: line.unit_price_minor === undefined ? '' : minorToInput(line.unit_price_minor),
    tax: line.tax_bps === undefined ? '' : bpsToInput(line.tax_bps),
  };
};

function readLine(line) {
  const unit = parseMoney(line.price);
  const bps = line.tax.trim() === '' ? undefined : parsePercent(line.tax);
  if (!line.description.trim()) throw new Error('Each line needs a description.');
  if (unit === null) throw new Error(`"${line.price || 'blank'}" is not a price. Use digits with up to two decimals, like 500 or 499.50.`);
  if (bps === null) throw new Error(`"${line.tax}" is not a tax rate between 0 and 100.`);
  if (!/^\d+(\.\d{1,2})?$/.test(line.quantity.trim())) throw new Error('Quantity must be a number with up to two decimals.');
  const out = { description: line.description.trim(), quantity: line.quantity.trim(), unit_price_minor: unit };
  if (bps !== undefined) out.tax_bps = bps;
  return out;
}

function LineRow({ line, currency, onChange, onRemove }) {
  return (
    <div className="line-row">
      <input type="text" value={line.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="What the customer pays for" maxLength={200} aria-label="Description" />
      <input type="text" value={line.quantity} onChange={(e) => onChange({ quantity: e.target.value })} inputMode="decimal" aria-label="Quantity" className="narrow" />
      <input type="text" value={line.price} onChange={(e) => onChange({ price: e.target.value })} inputMode="decimal" placeholder="0.00" aria-label={`Unit price (${currency})`} className="narrow" />
      <input type="text" value={line.tax} onChange={(e) => onChange({ tax: e.target.value })} inputMode="decimal" placeholder="0" aria-label="Tax %" className="narrow" />
      <Button className="btn btn--ghost btn--small" onClick={onRemove}>Remove</Button>
    </div>
  );
}

export function QuoteEditor({ quote, jobId, currency, onSaved, onClose }) {
  const editing = !!quote;
  const [lines, setLines] = useState(() => (editing ? quote.lines.map((l) => newLine({ ...l, quantity: l.quantity })) : [newLine()]));
  const [discount, setDiscount] = useState(editing ? minorToInput(quote.discount_minor) : '0');
  const [notes, setNotes] = useState(editing ? quote.notes || '' : '');
  const [usePriceBook, setUsePriceBook] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setError('');
    let readLines;
    let discountMinor;
    try {
      readLines = lines.map(readLine);
      discountMinor = parseMoney(discount || '0');
      if (discountMinor === null) throw new Error('The discount must be an amount like 0 or 250.00.');
    } catch (e) {
      if (!(!editing && usePriceBook)) { setError(e.message); return; }
    }
    const body = !editing && usePriceBook ? { job_id: jobId, discount_minor: discountMinor ?? 0, notes } : { lines: readLines, discount_minor: discountMinor, notes };
    const saved = editing ? await api(`/v1/billing/quotes/${quote.id}`, { method: 'PUT', body }) : await api('/v1/billing/quotes', { method: 'POST', body: { job_id: jobId, ...body } });
    toast(editing ? 'Quote updated.' : 'Quote created as a draft.');
    onClose();
    onSaved(saved);
  };

  return (
    <Overlay title={editing ? 'Change quote (draft)' : 'New quote'} wide onClose={onClose}>
      <div className="stack">
        <div className="line-head"><span>Description</span><span>Qty</span><span>{`Price (${currency})`}</span><span>Tax %</span><span /></div>
        <div className="stack">
          {lines.map((line) => (
            <LineRow key={line.key} line={line} currency={currency}
              onChange={(patch) => setLines((all) => all.map((l) => (l.key === line.key ? { ...l, ...patch } : l)))}
              onRemove={() => setLines((all) => all.filter((l) => l.key !== line.key))} />
          ))}
        </div>
        <Button className="btn btn--outline btn--small" onClick={() => setLines((all) => [...all, newLine()])}>+ Add a line</Button>
        {!editing ? (
          <label className="check">
            <input type="checkbox" id="pricebook" checked={usePriceBook} onChange={(e) => setUsePriceBook(e.target.checked)} />
            Ignore these lines and use the price book for this service
          </label>
        ) : null}
        <div className="grid2">
          <Field label={`Discount (${currency})`} hint="Taken off the subtotal, shared across the lines. A large discount needs a second person to send.">
            <input type="text" value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="decimal" aria-label={`Discount (${currency})`} className="narrow" />
          </Field>
          <Field label="Note for the customer">
            <textarea rows={3} maxLength={2000} aria-label="Note for the customer" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <p className="note note--bad" role="alert" hidden={!error}>{error}</p>
        <div className="right"><ActionButton className="btn btn--primary" action={save}>{editing ? 'Save changes' : 'Create the quote'}</ActionButton></div>
      </div>
    </Overlay>
  );
}

// ---- one quote ----

function LinesTable({ doc }) {
  return (
    <DataTable label="Lines" head={['Description', 'Qty', 'Price', 'Tax', 'Total']} rows={[
      ...doc.lines.map((l) => [l.description, l.quantity, formatMinor(l.unit_price_minor, doc.currency), `${l.tax_bps / 100}%`, formatMinor(l.net_minor - l.discount_minor + l.tax_minor, doc.currency)]),
      ['', '', '', <strong>Subtotal</strong>, formatMinor(doc.subtotal_minor, doc.currency)],
      ...(doc.discount_minor ? [['', '', '', 'Discount', `-${formatMinor(doc.discount_minor, doc.currency)}`]] : []),
      ['', '', '', 'Tax', formatMinor(doc.tax_minor, doc.currency)],
      ['', '', '', <strong>Total</strong>, <strong>{formatMinor(doc.total_minor, doc.currency)}</strong>],
    ]} />
  );
}

function AnswerDialog({ q, accept, refresh, onClose }) {
  const [name, setName] = useState('');
  const [said, setSaid] = useState('');
  const go = async () => {
    if (!name.trim() || !said.trim()) { toast('Say who answered and what they said.', 'warn'); return; }
    await api(`/v1/billing/quotes/${q.id}/${accept ? 'accept' : 'decline'}`, { method: 'POST', body: { customer_name: name.trim(), note: said.trim() } });
    toast(accept ? 'Recorded as accepted.' : 'Recorded as declined.');
    onClose();
    await refresh();
  };
  return (
    <Overlay title={accept ? 'Customer accepted' : 'Customer declined'} onClose={onClose}>
      <div className="stack">
        <p className="muted">Record what the customer told you. This is kept with your name and cannot be changed.</p>
        <Field label="Who answered"><input type="text" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="What they said, and how (phone, in person)"><textarea rows={3} maxLength={1000} value={said} onChange={(e) => setSaid(e.target.value)} /></Field>
        <div className="right"><ActionButton className="btn btn--primary" action={go}>{accept ? 'Record: accepted' : 'Record: declined'}</ActionButton></div>
      </div>
    </Overlay>
  );
}

// Opens the quote; "Create the invoice" swaps this panel for the invoice's.
export function QuotePanel({ id, reload, onClose }) {
  const [q, setQ] = useState(null);
  const [error, setError] = useState(null);
  const [extra, setExtra] = useState(null);
  const [editing, setEditing] = useState(null);
  const [answering, setAnswering] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);
  const seq = useRef(0);

  const draw = useCallback(async (extraNode) => {
    seq.current += 1;
    const mine = seq.current;
    try {
      const data = await api(`/v1/billing/quotes/${id}`);
      if (mine !== seq.current) return;
      setQ(data); setError(null); setExtra(extraNode || null);
    } catch (e) {
      if (mine === seq.current) setError(e);
    }
  }, [id]);
  useEffect(() => { draw(); return () => { seq.current += 1; }; }, [draw]);
  const refresh = async (extraNode) => {
    reload();
    await draw(extraNode);
  };

  if (invoiceId) return <InvoicePanel id={invoiceId} reload={reload} onClose={onClose} />;

  const actions = [];
  const act = (label, cls, fn) => actions.push(<ActionButton key={label} className={`btn ${cls}`} action={fn}>{label}</ActionButton>);
  if (q) {
    if (q.status === 'draft' && canWriteQuotes()) act('Change', 'btn--outline', async () => setEditing(q));
    if (q.status === 'draft' && canSend()) act('Send to the customer', 'btn--primary', async () => {
      const sent = await api(`/v1/billing/quotes/${q.id}/send`, { method: 'POST', body: {} });
      toast(`Quote ${sent.number} sent. Copy the customer's link below.`);
      await refresh(<LinkBox title="Link for the customer to accept or decline" url={sent.acceptance_url} token={sent.acceptance_token} kind="quotes" />);
    });
    if (q.status === 'sent' && canSend()) act('New link', 'btn--outline', async () => {
      const l = await api(`/v1/billing/quotes/${q.id}/link`, { method: 'POST', body: {} });
      await draw(<LinkBox title="New link (the old one no longer works)" url={l.acceptance_url} token={l.acceptance_token} kind="quotes" />);
    });
    if (q.status === 'sent' && canWriteQuotes()) {
      act('Customer said yes (by phone)', 'btn--outline', async () => setAnswering(true));
      act('Customer said no', 'btn--ghost', async () => setAnswering(false));
    }
    if (['sent', 'declined', 'expired', 'accepted'].includes(q.status) && canWriteQuotes()) act('Revise', 'btn--outline', async () => {
      await api(`/v1/billing/quotes/${q.id}/revise`, { method: 'POST', body: {} });
      toast('A new draft was made; this quote is now void.');
      onClose(); reload();
    });
    if (q.status === 'accepted' && canWriteQuotes()) act('Create the invoice', 'btn--primary', async () => {
      const inv = await api('/v1/billing/invoices', { method: 'POST', body: { quote_id: q.id } });
      toast('Invoice drafted.');
      reload(); setInvoiceId(inv.id);
    });
    if (['draft', 'sent', 'accepted'].includes(q.status) && canSend()) act('Void', 'btn--ghost', async () => {
      const reason = window.prompt('Why is this quote being voided?');
      if (!reason || !reason.trim()) return;
      await api(`/v1/billing/quotes/${q.id}/void`, { method: 'POST', body: { reason: reason.trim() } });
      toast('Quote voided.'); onClose(); reload();
    });
  }

  return (
    <>
      <Overlay title="Quote" wide onClose={onClose}>
        <div className="stack">
          {error ? <ErrorBox error={error} /> : !q ? <Spinner /> : (
            <>
              <div className="row wrap">
                <Badge text={q.status} tone={QUOTE_TONE[q.status]} />
                {q.number ? <strong>{q.number}</strong> : <Badge text="not numbered yet" />}
                {q.revision > 1 ? <Badge text={`revision ${q.revision}`} tone="info" /> : null}
                <span className="spacer" />
                <strong className="big-total">{q.total}</strong>
              </div>
              {extra}
              <LinesTable doc={q} />
              <Details rows={[['Valid until', q.valid_until && formatDay(`${q.valid_until}T12:00:00Z`)], ['Created by', q.created_by], ['Sent', q.sent_at && `${formatDateTime(q.sent_at)} by ${q.sent_by}`],
                ['Answered', q.responded_at && `${formatDateTime(q.responded_at)} · ${q.responded_by} (${q.responded_via === 'staff' ? 'recorded by staff' : 'customer link'})`],
                ['What was said', q.response_note], ['Note for the customer', q.notes], ['Why void', q.void_reason], ['Discount', q.discount_minor ? `${formatMinor(q.discount_minor, q.currency)} (${q.discount_percent}%)` : '']]} />
              {actions.length ? <div className="row wrap">{actions}</div> : null}
            </>
          )}
        </div>
      </Overlay>
      {editing ? <QuoteEditor quote={editing} currency={editing.currency} onSaved={() => refresh()} onClose={() => setEditing(null)} /> : null}
      {answering !== null && q ? <AnswerDialog q={q} accept={answering} refresh={refresh} onClose={() => setAnswering(null)} /> : null}
    </>
  );
}

// ---- one invoice ----

function PaymentDialog({ inv, refresh, onClose }) {
  const [amount, setAmount] = useState(minorToInput(inv.balance_minor));
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [memo, setMemo] = useState('');
  const [key] = useState(() => newKey()); // one key for this dialog: pressing Save twice, or retrying after a lost reply, can never take it twice
  const go = async () => {
    const minor = parseMoney(amount);
    if (minor === null || minor <= 0) { toast('Enter the amount received, like 500 or 499.50.', 'warn'); return; }
    if (minor > inv.balance_minor) { toast(`That is more than the balance of ${inv.balance}.`, 'warn'); return; }
    await api(`/v1/billing/invoices/${inv.id}/payments`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: { amount_minor: minor, method, reference, note: memo } });
    toast('Payment recorded.');
    onClose();
    await refresh();
  };
  return (
    <Overlay title="Record a payment" onClose={onClose}>
      <div className="stack">
        <p className="muted">{`Balance: ${inv.balance}. This records money you have received; it cannot be edited afterwards (a mistake is corrected by a refund).`}</p>
        <div className="grid2">
          <Field label={`Amount received (${inv.currency})`}><input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount received" /></Field>
          <Field label="Method"><Select options={METHODS} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method" /></Field>
        </div>
        <Field label="Reference (optional)"><input type="text" maxLength={128} placeholder="Cheque no., bank reference, receipt no." value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Note (optional)"><input type="text" maxLength={500} value={memo} onChange={(e) => setMemo(e.target.value)} /></Field>
        <div className="right"><ActionButton className="btn btn--primary" action={go}>Record payment</ActionButton></div>
      </div>
    </Overlay>
  );
}

function RefundDialog({ inv, payment, refresh, onClose }) {
  const [amount, setAmount] = useState(minorToInput(payment.amount_minor));
  const [method, setMethod] = useState('cash');
  const [reason, setReason] = useState('');
  const [key] = useState(() => newKey());
  const go = async () => {
    const minor = parseMoney(amount);
    if (minor === null || minor <= 0 || !reason.trim()) { toast('Enter the amount and the reason.', 'warn'); return; }
    await api(`/v1/billing/invoices/${inv.id}/refunds`, { method: 'POST', headers: { 'Idempotency-Key': key }, body: { payment_id: payment.id, amount_minor: minor, method, reason: reason.trim() } });
    toast('Refund recorded.');
    onClose();
    await refresh();
  };
  return (
    <Overlay title="Refund a payment" onClose={onClose}>
      <div className="stack">
        <p className="muted">This records money returned to the customer. Return the money itself in cash, by transfer, or in the payment provider's dashboard. By default the refund must be recorded by someone other than the person who recorded the payment.</p>
        <div className="grid2">
          <Field label={`Amount (${inv.currency})`}><input type="text" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" aria-label="Amount to refund" /></Field>
          <Field label="How it is returned"><Select options={METHODS} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="How it is returned" /></Field>
        </div>
        <Field label="Reason (required)"><textarea rows={3} maxLength={1000} aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <div className="right"><ActionButton className="btn btn--danger" action={go}>Record refund</ActionButton></div>
      </div>
    </Overlay>
  );
}

export function InvoicePanel({ id, reload, onClose }) {
  const [inv, setInv] = useState(null);
  const [error, setError] = useState(null);
  const [extra, setExtra] = useState(null);
  const [paying, setPaying] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const seq = useRef(0);

  const draw = useCallback(async (extraNode) => {
    seq.current += 1;
    const mine = seq.current;
    try {
      const data = await api(`/v1/billing/invoices/${id}`);
      if (mine !== seq.current) return;
      setInv(data); setError(null); setExtra(extraNode || null);
    } catch (e) {
      if (mine === seq.current) setError(e);
    }
  }, [id]);
  useEffect(() => { draw(); return () => { seq.current += 1; }; }, [draw]);
  const refresh = async (extraNode) => { reload(); await draw(extraNode); };

  const actions = [];
  const act = (label, cls, fn) => actions.push(<ActionButton key={label} className={`btn ${cls}`} action={fn}>{label}</ActionButton>);
  if (inv) {
    if (inv.status === 'draft' && canWriteQuotes()) act('Issue the invoice', 'btn--primary', async () => {
      const issued = await api(`/v1/billing/invoices/${inv.id}/issue`, { method: 'POST', body: {} });
      toast(`Invoice ${issued.number} issued. Copy the customer's link below.`);
      await refresh(<LinkBox title="Link for the customer to see the invoice and pay" url={issued.pay_url} token={issued.pay_token} kind="invoices" />);
    });
    if (inv.status === 'issued' && canTakePayment()) {
      act('Record a payment received', 'btn--primary', async () => setPaying(inv));
      act('Online payment link', 'btn--outline', async () => {
        const out = await api(`/v1/billing/invoices/${inv.id}/checkout`, { method: 'POST', headers: { 'Idempotency-Key': newKey() } });
        await draw(<LinkBox title={`Online payment link for ${formatMinor(out.amount_minor, inv.currency)}`} url={out.url} token="" kind="invoices" />);
      });
      act('New customer link', 'btn--ghost', async () => {
        const l = await api(`/v1/billing/invoices/${inv.id}/link`, { method: 'POST', body: {} });
        await draw(<LinkBox title="New link (the old one no longer works)" url={l.pay_url} token={l.pay_token} kind="invoices" />);
      });
    }
    if (['draft', 'issued'].includes(inv.status) && canRefund()) act('Void', 'btn--ghost', async () => {
      const reason = window.prompt('Why is this invoice being voided?');
      if (!reason || !reason.trim()) return;
      await api(`/v1/billing/invoices/${inv.id}/void`, { method: 'POST', body: { reason: reason.trim() } });
      toast('Invoice voided.'); await refresh();
    });
  }
  const payments = inv ? inv.payments.map((p) => [formatDateTime(p.completed_at || p.created_at), p.kind === 'refund' ? 'Refund' : 'Payment', `${p.kind === 'refund' ? '-' : ''}${p.amount}`,
    p.method, <span><Badge text={p.status} tone={p.status === 'succeeded' ? 'good' : p.status === 'review' ? 'warn' : p.status === 'pending' ? 'info' : 'bad'} /></span>,
    p.reference || p.note || '', p.recorded_by,
    p.kind === 'payment' && ['succeeded', 'review'].includes(p.status) && canRefund() ? <Button className="btn btn--ghost btn--small" onClick={() => setRefunding({ inv, payment: p })}>Refund</Button> : '']) : [];

  return (
    <>
      <Overlay title="Invoice" wide onClose={onClose}>
        <div className="stack">
          {error ? <ErrorBox error={error} /> : !inv ? <Spinner /> : (
            <>
              <div className="row wrap">
                <Badge text={inv.state} tone={INVOICE_TONE[inv.state]} />
                {inv.number ? <strong>{inv.number}</strong> : <Badge text="not numbered yet" />}
                <span className="spacer" />
                <strong className="big-total">{inv.total}</strong>
              </div>
              {extra}
              <LinesTable doc={inv} />
              <Details rows={[['Paid so far', formatMinor(inv.paid_minor, inv.currency)], ['Balance', <strong>{inv.balance}</strong>], ['Due', inv.due_date && formatDay(`${inv.due_date}T12:00:00Z`)],
                ['Issued', inv.issued_at && `${formatDateTime(inv.issued_at)} by ${inv.issued_by}`], ['Paid in full', inv.paid_at && formatDateTime(inv.paid_at)], ['Note', inv.notes], ['Why void', inv.void_reason]]} />
              {payments.length ? (
                <>
                  <h3>Payments</h3>
                  <DataTable label="Payments" head={['When', 'What', 'Amount', 'Method', 'Status', 'Reference', 'By', '']} rows={payments} />
                </>
              ) : null}
              {actions.length ? <div className="row wrap">{actions}</div> : null}
            </>
          )}
        </div>
      </Overlay>
      {paying ? <PaymentDialog inv={paying} refresh={refresh} onClose={() => setPaying(null)} /> : null}
      {refunding ? <RefundDialog inv={refunding.inv} payment={refunding.payment} refresh={refresh} onClose={() => setRefunding(null)} /> : null}
    </>
  );
}

// ---- new quote: pick the finished job ----

function NewQuoteDialog({ onContinue, onClose }) {
  const [date, setDate] = useState(todayIn());
  const [options, setOptions] = useState([['', 'Loading…']]);
  const [jobId, setJobId] = useState('');
  const [hint, setHint] = useState('');
  const [ready, setReady] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    setReady(false);
    (async () => {
      try {
        const { jobs: list } = await api('/v1/dispatch/jobs', { params: { date, limit: 500 } });
        if (mine !== seq.current) return;
        const done = list.filter((j) => j.progress === 'completed');
        const opts = done.length ? done.map((j) => [j.id, `${j.service_type || 'Job'} · ${j.customer_name || 'customer'} · ${j.technician_name || ''}`]) : [['', 'No finished job on this day']];
        setOptions(opts);
        setJobId(opts[0][0]);
        setHint(done.length ? 'Only a finished job can be quoted and invoiced.' : 'Quotes are made for finished visits. Pick another day, or finish the visit first.');
        setReady(!!done.length);
      } catch (e) {
        if (mine === seq.current) setHint(e.message);
      }
    })();
    return () => { seq.current += 1; };
  }, [date]);

  return (
    <Overlay title="New quote" onClose={onClose}>
      <div className="stack">
        <Field label="Day of the job"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Day of the job" /></Field>
        <Field label="Job"><Select options={options} value={jobId} onChange={(e) => setJobId(e.target.value)} aria-label="Job" /></Field>
        <p className="muted">{hint}</p>
        <div className="right"><Button className="btn btn--primary" disabled={!ready} onClick={() => onContinue(jobId)}>Continue</Button></div>
      </div>
    </Overlay>
  );
}

// ---- the page ----

const quoteOptions = [['', 'Any status'], ['draft', 'Draft'], ['sent', 'Sent'], ['accepted', 'Accepted'], ['declined', 'Declined'], ['expired', 'Expired'], ['void', 'Void']];
const invoiceOptions = [['', 'Any status'], ['draft', 'Draft'], ['issued', 'Issued (owing)'], ['paid', 'Paid'], ['void', 'Void'], ['overdue', 'Overdue only']];

export default function Billing() {
  const [tab, setTab] = useState('quotes');
  const [status, setStatus] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [currency, setCurrency] = useState('INR');
  const [summary, setSummary] = useState(null);
  const [list, setList] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  const [view, setView] = useState(null); // { kind: 'new' | 'editor' | 'quote' | 'invoice', ... }
  const summarySeq = useRef(0);
  const listSeq = useRef(0);

  const reloadAll = useCallback(() => setTick((t) => t + 1), []);
  useEvery(reloadAll, 60000);

  useEffect(() => {
    summarySeq.current += 1;
    const mine = summarySeq.current;
    (async () => {
      try {
        const s = await api('/v1/billing/summary');
        if (mine !== summarySeq.current) return;
        setCurrency(s.currency);
        setSummary(s);
      } catch (error) {
        if (mine === summarySeq.current && error.status === 404) setSummary(null);
      }
    })();
    return () => { summarySeq.current += 1; };
  }, [tick]);

  useEffect(() => {
    listSeq.current += 1;
    const mine = listSeq.current;
    setList({ loading: true });
    (async () => {
      try {
        if (tab === 'quotes') {
          const { quotes } = await api('/v1/billing/quotes', { params: { status } });
          if (mine === listSeq.current) setList({ kind: 'quotes', quotes });
        } else {
          const { invoices } = await api('/v1/billing/invoices', { params: { status: overdue ? 'issued' : status, overdue: overdue || undefined } });
          if (mine === listSeq.current) setList({ kind: 'invoices', invoices });
        }
      } catch (error) {
        if (mine === listSeq.current) setList({ error });
      }
    })();
    return () => { listSeq.current += 1; };
  }, [tab, status, overdue, tick]);

  const closeView = () => setView(null);
  const openQuote = (id) => setView({ kind: 'quote', id });

  let listBody;
  if (list.loading) listBody = <Spinner />;
  else if (list.error) listBody = list.error.status === 404 ? <Note text="Billing is switched off for this company (BILLING_ENABLED is not true on the server)." tone="warn" /> : <ErrorBox error={list.error} />;
  else if (list.kind === 'quotes') {
    listBody = list.quotes.length ? (
      <DataTable label="Quotes" head={['Number', 'Status', 'Total', 'Job', 'Valid until', 'Created']}
        rows={list.quotes.map((q) => [q.number || '(draft)', <Badge text={q.status} tone={QUOTE_TONE[q.status]} />, q.total,
          q.job_id ? q.job_id.slice(0, 8) : '-', q.valid_until ? formatDay(`${q.valid_until}T12:00:00Z`) : '-', formatDateTime(q.created_at)])}
        onRow={(cells, i) => openQuote(list.quotes[i].id)} />
    ) : <Empty text='No quotes yet. Finish a job, then use "New quote".' />;
  } else {
    listBody = list.invoices.length ? (
      <DataTable label="Invoices" head={['Number', 'State', 'Total', 'Balance', 'Due', 'Issued']}
        rows={list.invoices.map((i) => [i.number || '(draft)', <Badge text={i.state} tone={INVOICE_TONE[i.state]} />, i.total, i.balance,
          i.due_date ? formatDay(`${i.due_date}T12:00:00Z`) : '-', i.issued_at ? formatDateTime(i.issued_at) : '-'])}
        onRow={(cells, i) => setView({ kind: 'invoice', id: list.invoices[i].id })} />
    ) : <Empty text="No invoices yet. Accept a quote, then create the invoice from it." />;
  }

  return (
    <>
      <PageHeader title="Billing" subtitle="Quotes the customer agrees to, invoices for finished work, and the money received.">
        {canWriteQuotes() ? <Button className="btn btn--primary" onClick={() => setView({ kind: 'new' })}>New quote</Button> : null}
      </PageHeader>
      <div className="cards">
        {summary ? [['Invoiced (30 days)', summary.invoiced.total], ['Collected (net)', summary.collected.net], ['Still owed', summary.outstanding.balance], ['Overdue', summary.overdue.balance],
          ['Quotes accepted', summary.quotes.accept_rate === null ? '-' : `${Math.round(summary.quotes.accept_rate * 100)}%`], ['Payments to review', summary.payments_needing_review]]
          .map(([label, value]) => <div key={label} className="card stat"><h3>{label}</h3><p className="stat__value">{value}</p></div>) : null}
      </div>
      <div className="tabs" role="tablist">
        {[['quotes', 'Quotes'], ['invoices', 'Invoices']].map(([id, label]) => (
          <button key={id} type="button" role="tab" className={`tab ${tab === id ? 'tab--on' : ''}`} aria-selected={String(tab === id)}
            onClick={() => { setTab(id); setStatus(''); setOverdue(false); }}>{label}</button>
        ))}
      </div>
      <div className="toolbar">
        <Select options={tab === 'quotes' ? quoteOptions : invoiceOptions} value={overdue ? 'overdue' : status} aria-label="Status"
          onChange={(e) => { const isOverdue = e.target.value === 'overdue'; setOverdue(isOverdue); setStatus(isOverdue ? '' : e.target.value); }} />
      </div>
      <div>{listBody}</div>
      {view?.kind === 'new' ? <NewQuoteDialog onClose={closeView} onContinue={(jobId) => setView({ kind: 'editor', jobId })} /> : null}
      {view?.kind === 'editor' ? <QuoteEditor jobId={view.jobId} currency={currency} onClose={closeView} onSaved={(q) => { reloadAll(); openQuote(q.id); }} /> : null}
      {view?.kind === 'quote' ? <QuotePanel key={view.id} id={view.id} reload={reloadAll} onClose={closeView} /> : null}
      {view?.kind === 'invoice' ? <InvoicePanel key={view.id} id={view.id} reload={reloadAll} onClose={closeView} /> : null}
    </>
  );
}
