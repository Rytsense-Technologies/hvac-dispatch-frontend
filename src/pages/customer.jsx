// The customer's page: opened from the private link they were sent (/billing/quotes/<token> or /billing/invoices/<token>).
// No sign-in: the long random token in the address IS the permission. Nothing here is stored in the browser.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/console.css';
import { api } from '../lib/api.js';
import { formatMinor, formatDay } from '../lib/format.js';
import { Badge, Note, Field, DataTable, ActionButton, toast, Card } from '../components/index.js';

const match = /^\/billing\/(quotes|invoices)\/([^/]+)$/.exec(location.pathname);

function Lines({ doc }) {
  const money = (minor) => formatMinor(minor, doc.currency);
  return (
    <DataTable label="What is included" head={['Description', 'Qty', 'Price', 'Tax', 'Total']} rows={[
      ...doc.lines.map((l) => [l.description, l.quantity, money(l.unit_price_minor), `${l.tax_bps / 100}%`, money(l.net_minor - l.discount_minor + l.tax_minor)]),
      ['', '', '', 'Subtotal', money(doc.subtotal_minor)],
      ...(doc.discount_minor ? [['', '', '', 'Discount', `-${money(doc.discount_minor)}`]] : []),
      ['', '', '', 'Tax', money(doc.tax_minor)],
      ['', '', '', <strong>Total</strong>, <strong>{money(doc.total_minor)}</strong>],
    ]} />
  );
}

const date = (iso) => (iso ? formatDay(`${iso}T12:00:00Z`) : '');

function QuotePage({ token, initial }) {
  const [q, setQ] = useState(initial);
  const [name, setName] = useState('');
  const nameRef = useRef(null);
  const answer = (accept) => (
    <ActionButton className={accept ? 'btn btn--primary' : 'btn btn--outline'} action={async () => {
      if (!name.trim()) { toast('Please type your name to confirm.', 'warn'); nameRef.current?.focus(); return; }
      await api(`/billing/quotes/${token}/${accept ? 'accept' : 'decline'}`, { method: 'POST', body: { name: name.trim() } });
      setQ(await api(`/billing/quotes/${token}`));
      setName('');
    }}>{accept ? 'Accept this quote' : 'Decline'}</ActionButton>
  );
  const status = { sent: ['Waiting for your answer', 'info'], accepted: ['Accepted: thank you', 'good'], declined: ['Declined', 'bad'], expired: ['This quote has expired', 'warn'], void: ['This quote was withdrawn', 'bad'], draft: ['Not ready yet', 'neutral'] }[q.status] || [q.status, 'neutral'];
  return (
    <>
      <Card className="stack">
        <h1>{`Quote ${q.number || ''}`.trim()}</h1>
        <div className="row wrap"><Badge text={status[0]} tone={status[1]} /><span className="spacer" /><strong className="big-total">{formatMinor(q.total_minor, q.currency)}</strong></div>
      </Card>
      <Lines doc={q} />
      {q.notes ? <p>{q.notes}</p> : null}
      {q.valid_until ? <p className="muted">{`Valid until ${date(q.valid_until)}.`}</p> : null}
      {q.can_answer ? (
        <section className="card stack"><h2>Your answer</h2>
          <Field label="Your full name (this confirms it is you)"><input type="text" ref={nameRef} maxLength={120} aria-label="Your full name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="row wrap">{answer(true)}{answer(false)}</div>
        </section>
      ) : null}
      {q.status === 'expired' ? <Note text="Please ask the company for a new quote." tone="warn" /> : null}
    </>
  );
}

function InvoicePage({ token, i }) {
  const money = (minor) => formatMinor(minor, i.currency);
  const pay = async () => {
    const out = await api(`/billing/invoices/${token}/pay`, { method: 'POST', body: {} });
    const target = new URL(out.url, location.origin);
    if (!['https:', 'http:'].includes(target.protocol)) throw new Error('The payment page address was not valid.');
    location.href = target.href; // the provider's own page: card and UPI details are never entered here
  };
  const state = { paid: ['Paid in full: thank you', 'good'], void: ['This invoice was cancelled', 'bad'], issued: [i.state === 'overdue' ? 'Overdue' : 'Waiting for payment', i.state === 'overdue' ? 'bad' : 'info'], draft: ['Not ready yet', 'neutral'] }[i.status] || [i.status, 'neutral'];
  return (
    <>
      <Card className="stack">
        <h1>{`Invoice ${i.number || ''}`.trim()}</h1>
        <div className="row wrap"><Badge text={state[0]} tone={state[1]} /><span className="spacer" /><strong className="big-total">{money(i.total_minor)}</strong></div>
      </Card>
      <Lines doc={i} />
      <p>{`Paid so far: ${money(i.paid_minor)}. `}<strong>{`Balance: ${money(i.balance_minor)}.`}</strong>{i.due_date ? ` Due ${date(i.due_date)}.` : ''}</p>
      {i.notes ? <p>{i.notes}</p> : null}
      {i.can_pay && i.balance_minor > 0 ? <ActionButton className="btn btn--primary" action={pay}>{`Pay ${money(i.balance_minor)}`}</ActionButton> : null}
      {i.status === 'issued' && !i.can_pay ? <Note text="To pay, please contact the company: cash, UPI or bank transfer are accepted and they will mark it paid." /> : null}
    </>
  );
}

function Customer() {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    if (!match) return undefined;
    let current = true;
    api(`/billing/${match[1]}/${match[2]}`).then(
      (data) => { if (current) setState({ status: 'ready', data }); },
      (error) => { if (current) setState({ status: 'error', error }); },
    );
    return () => { current = false; };
  }, []);

  if (!match) return <Note text="This link is not valid." tone="bad" />;
  if (state.status === 'loading') return <p className="loading">Loading…</p>;
  if (state.status === 'error') {
    const error = state.error;
    return (
      <>
        <h1>We could not open this</h1>
        <Note text={error.status === 404 ? 'This link is not valid, or it has been replaced by a newer one. Please ask the company to send it again.' : error.message} tone="bad" />
      </>
    );
  }
  return match[1] === 'quotes' ? <QuotePage token={match[2]} initial={state.data} /> : <InvoicePage token={match[2]} i={state.data} />;
}

createRoot(document.getElementById('root')).render(<main className="customer" aria-live="polite"><Customer /></main>);
