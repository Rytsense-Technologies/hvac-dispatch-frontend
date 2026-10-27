// Usage and bill: what the product costs this company: its call minutes for a month, the charges from its plan, and the same for every company (for the operator).
// The numbers are the bill: the monthly fee, the minutes included, then each extra minute. Download it as a spreadsheet to attach to the invoice.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatMinor, formatDateTime } from '../lib/format.js';
import { Badge, Spinner, Note, Empty, ErrorBox, PageHeader, DataTable, Select, toast, Overlay, ActionButton, Button } from '../lib/ui.jsx';

const monthLabel = (month) => new Date(`${month}-01T12:00:00`).toLocaleString('en-US', { month: 'long', year: 'numeric' });
const money = (minor, currency) => (minor === null || minor === undefined ? '-' : formatMinor(minor, currency));

function lastMonths(count = 12) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

const SUBSCRIPTION = {
  created: ['Waiting for the company to authorise the payment', 'warn'], authenticated: ['Authorised, waiting for the first charge', 'info'], active: ['Active: charged every month', 'good'],
  pending: ['A charge is pending', 'warn'], halted: ['Stopped: charges kept failing', 'bad'], paused: ['Paused', 'neutral'], cancelled: ['Cancelled', 'neutral'],
  completed: ['Finished', 'neutral'], expired: ['Expired', 'neutral'],
};
function SubscriptionBadge({ status }) {
  const [text, tone] = SUBSCRIPTION[status] || [status, 'neutral'];
  return <Badge text={text} tone={tone} />;
}

// Ask before anything that moves money or stops it.
function ConfirmDialog({ title, text, label, action, done, onClose }) {
  const go = async () => { const out = await action(); onClose(); done(out); };
  return (
    <Overlay title={title} onClose={onClose}>
      <div className="stack">
        <p>{text}</p>
        <div className="right"><ActionButton className="btn btn--primary" action={go}>{label}</ActionButton></div>
      </div>
    </Overlay>
  );
}

async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); toast('The authorisation link is copied: send it to the company.'); } catch { toast(`Send this link to the company: ${url}`, 'warn'); }
}

function Card({ title, value, hint }) {
  return (
    <div className="stat"><strong>{value}</strong><span>{title}</span>{hint ? <small className="muted">{hint}</small> : null}</div>
  );
}

function Statement({ month, tick }) {
  const [state, setState] = useState({ loading: true });
  const seq = useRef(0);
  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    setState({ loading: true });
    (async () => {
      try {
        const [s, history] = await Promise.all([api('/v1/product-billing/statement', { params: { month } }), api('/v1/product-billing/history', { params: { months: 6 } })]);
        if (mine === seq.current) setState({ s, history });
      } catch (error) {
        if (mine === seq.current) setState({ error });
      }
    })();
    return () => { seq.current += 1; };
  }, [month, tick]);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBox error={state.error} />;
  const { s, history } = state;
  const u = s.usage;
  const c = s.charges;
  return (
    <>
      {s.in_progress ? <Note text="This month is still running, so these are the numbers so far." tone="info" /> : null}
      {!s.plan_set ? <Note text="No plan is set for this company yet, so only the usage is shown. The person who runs the product sets the price (PRODUCT_PLANS)." tone="warn" /> : null}
      <section className="row wrap" aria-label="This month">
        <Card title="Calls" value={String(u.calls)} hint={`${u.inbound_calls} in, ${u.outbound_calls} out`} />
        <Card title="Minutes used" value={String(u.minutes)} hint="each call rounded up to a full minute" />
        {c ? <Card title="Included in the plan" value={String(c.included_minutes)} hint={c.plan} /> : null}
        {c ? <Card title="Extra minutes" value={String(c.extra_minutes)} hint={c.extra_minutes ? 'charged below' : 'none'} /> : null}
        {c ? <Card title="Amount due" value={money(c.total_minor, s.currency)} hint="for the month" /> : null}
      </section>
      {c ? (
        <section>
          <h2>The charges</h2>
          <DataTable label="Charges" head={['', 'Quantity', 'Unit price', 'Amount']} rows={[
            ...c.lines.map((line) => [line.description, String(line.quantity), money(line.unit_minor, s.currency), money(line.amount_minor, s.currency)]),
            ...(c.tax_bps ? [[`Tax (${c.tax_bps / 100}%)`, '', '', money(c.tax_minor, s.currency)]] : []),
            [<strong>Total</strong>, '', '', <strong>{money(c.total_minor, s.currency)}</strong>]]} />
        </section>
      ) : null}
      <section>
        <h2>Day by day</h2>
        {u.by_day.length ? <DataTable label="Usage by day" head={['Day', 'Calls', 'Minutes']} rows={u.by_day.map((d) => [d.date, String(d.calls), String(d.minutes)])} /> : <Empty text="No calls this month." />}
      </section>
      <section>
        <h2>The last months</h2>
        <DataTable label="History" head={['Month', 'Calls', 'Minutes', 'Amount due']}
          rows={history.months.map((m) => [monthLabel(m.month), String(m.calls), String(m.minutes), m.total_minor === null ? '-' : money(m.total_minor, history.currency)])} />
      </section>
    </>
  );
}

// This company's own subscription: whether the monthly fee is being charged, and the extra-minute charges put on it.
function Mine({ tick }) {
  const [state, setState] = useState(null);
  const seq = useRef(0);
  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    (async () => {
      try {
        const { subscription, addons, plan_set: planSet } = await api('/v1/product-billing/subscription');
        if (mine === seq.current) setState({ sub: subscription, addons, planSet });
      } catch (error) {
        if (mine === seq.current) setState({ error });
      }
    })();
    return () => { seq.current += 1; };
  }, [tick]);

  if (!state) return null;
  if (state.error) return <ErrorBox error={state.error} />;
  const { sub, addons, planSet } = state;
  return (
    <section>
      <h2>Monthly fee subscription</h2>
      {sub ? (
        <div className="stack">
          <div className="row wrap"><SubscriptionBadge status={sub.status} /><Badge text={`${money(sub.amount_minor, sub.currency)} a month`} tone="neutral" /></div>
          <p className="muted">{[sub.next_charge_at ? `Next charge: ${formatDateTime(sub.next_charge_at)}.` : '', sub.last_paid_at ? ` Last paid: ${formatDateTime(sub.last_paid_at)}.` : ''].join('')}</p>
          {sub.authorise_url ? <Note text="The company must open its authorisation link once so PayPal can charge it every month. The person who runs the product sends it." tone="warn" /> : null}
        </div>
      ) : <Note text={planSet ? 'No subscription yet: the fee is invoiced by hand from the statement.' : 'No plan is set, so there is nothing to charge.'} tone="neutral" />}
      {addons.length ? <DataTable label="Extra-minute charges" head={['Month', 'Extra minutes charge', 'State']} rows={addons.map((a) => [monthLabel(a.month), money(a.amount_minor, 'USD'), a.status + (a.error ? `: ${a.error}` : '')])} /> : null}
    </section>
  );
}

function Everyone({ month, tick, refresh }) {
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  const seq = useRef(0);
  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    (async () => {
      try {
        const [out, subs] = await Promise.all([api('/v1/product-billing/companies', { params: { month } }), api('/v1/product-billing/subscriptions')]);
        if (mine === seq.current) setData({ out, subs, month });
      } catch (error) {
        if (mine === seq.current) setData(null); // not the operator: that part is simply not shown
      }
    })();
    return () => { seq.current += 1; };
  }, [month, tick]);

  if (!data) return null;
  const { out, subs } = data;
  const by = Object.fromEntries(subs.companies.map((c) => [c.company, c]));
  const confirm = (props) => setDialog(props);
  const rows = out.companies.map((r) => {
    const sub = by[r.company] || {};
    const live = ['created', 'authenticated', 'active', 'pending', 'paused'].includes(sub.status);
    const start = !live && sub.plan_set ? <Button className="btn btn--outline btn--small" onClick={() => confirm({ title: 'Start a subscription',
      text: `Create a monthly PayPal subscription for ${r.company}. You will get a link to send them; they open it once to authorise the payment.`, label: 'Create it',
      action: () => api(`/v1/product-billing/subscriptions/${encodeURIComponent(r.company)}`, { method: 'POST' }),
      done: (made) => { toast('Subscription created.'); if (made.authorise_url) copyLink(made.authorise_url); refresh(); } })}>Start subscription</Button> : null;
    const stop = live ? <Button className="btn btn--ghost btn--small" onClick={() => confirm({ title: 'Cancel the subscription',
      text: `${r.company} will not be charged again, starting now. This cannot be undone: a new subscription would need a new authorisation.`, label: 'Cancel it',
      action: () => api(`/v1/product-billing/subscriptions/${encodeURIComponent(r.company)}/cancel`, { method: 'POST' }), done: () => { toast('Cancellation requested.'); refresh(); } })}>Cancel</Button> : null;
    const extra = sub.status === 'active' && r.total_minor !== null ? <Button className="btn btn--outline btn--small" onClick={() => confirm({ title: 'Charge the extra minutes',
      text: `Put ${monthLabel(month)}'s minutes beyond the plan on ${r.company}'s subscription. PayPal charges the company for them straight away. This can only be done once for a month, and only after the month has ended.`,
      label: 'Charge them', action: () => api(`/v1/product-billing/subscriptions/${encodeURIComponent(r.company)}/overage`, { method: 'POST', params: { month } }),
      done: (res) => { toast(res.status === 'nothing_owed' ? 'Nothing is owed for that month.' : res.already ? 'That month was already charged.' : 'The extra minutes were charged.'); refresh(); } })}>Charge extra minutes</Button> : null;
    return [r.company, r.plan || 'no plan', String(r.calls), String(r.minutes), money(r.total_minor, out.currency), sub.status ? <SubscriptionBadge status={sub.status} /> : '-', <span className="row">{start}{extra}{stop}</span>];
  });
  return (
    <>
      <section>
        <h2>{`Every company: ${monthLabel(data.month)}`} <Badge text="operator" tone="info" /></h2>
        <DataTable label="Companies" head={['Company', 'Plan', 'Calls', 'Minutes', 'Amount due', 'Subscription', '']} rows={rows} />
      </section>
      {dialog ? <ConfirmDialog {...dialog} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

export default function Usage() {
  const [months] = useState(() => lastMonths());
  const [month, setMonth] = useState(() => lastMonths(1)[0]);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  return (
    <>
      <PageHeader title="Usage and bill" subtitle="What the product costs: call minutes for the month and the charges from the plan.">
        <a className="btn btn--outline" href={`/v1/product-billing/statement.csv?month=${month}`} download="">Download as a spreadsheet</a>
        <Button className="btn btn--outline" onClick={() => window.print()}>Print</Button>
      </PageHeader>
      <div className="row"><Select options={months.map((m) => [m, monthLabel(m)])} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" /></div>
      <div className="stack"><Statement month={month} tick={tick} /></div>
      <div><Mine tick={tick} /></div>
      <div><Everyone month={month} tick={tick} refresh={refresh} /></div>
    </>
  );
}
