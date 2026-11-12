// Usage and bill: what the product costs this company: its call minutes for a month, the charges from its plan, and the same for every company (for the operator).
// The numbers are the bill: the monthly fee, the minutes included, then each extra minute. Download it as a spreadsheet to attach to the invoice.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatMinor, formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  Badge,
  Spinner,
  Note,
  Empty,
  ErrorBox,
  PageHeader,
  DataTable,
  Select,
  Field,
  toast,
  Overlay,
  ActionButton,
  Button,
  Card,
  StatGrid,
  Tabs,
  Icon,
} from '../components/index.js';

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
  created: ['Pending Auth', 'warn'],
  authenticated: ['Authorised', 'info'],
  active: ['Active', 'good'],
  pending: ['Charge Pending', 'warn'],
  halted: ['Halted', 'bad'],
  paused: ['Paused', 'neutral'],
  cancelled: ['Cancelled', 'neutral'],
  completed: ['Finished', 'neutral'],
  expired: ['Expired', 'neutral'],
};

const SUBSCRIPTION_DESC = {
  created: 'Waiting for payment authorisation',
  authenticated: 'Authorised, awaiting initial charge',
  active: 'Active: monthly recurring billing',
  pending: 'Charge pending processing',
  halted: 'Halted: recurring charges failing',
  paused: 'Subscription paused',
  cancelled: 'Cancelled',
  completed: 'Finished',
  expired: 'Expired',
};

function SubscriptionBadge({ status }) {
  const [text, tone] = SUBSCRIPTION[status] || [status, 'neutral'];
  const title = SUBSCRIPTION_DESC[status] || text;
  return <span title={title}><Badge text={text} tone={tone} /></span>;
}

// Ask before anything that moves money or stops it.
function ConfirmDialog({ title, text, label, action, done, onClose, danger = false }) {
  const go = async () => {
    const out = await action();
    onClose();
    done(out);
  };
  return (
    <Overlay title={title} onClose={onClose}>
      <div className="stack" style={{ gap: '16px' }}>
        <p style={{ margin: 0, fontSize: '0.92rem', lineHeight: '1.5' }}>{text}</p>
        <div className="right" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button className="btn btn--ghost" onClick={onClose}>
            Dismiss
          </Button>
          <ActionButton className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} action={go}>
            {label}
          </ActionButton>
        </div>
      </div>
    </Overlay>
  );
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    toast('The authorisation link has been copied to your clipboard.');
  } catch {
    toast(`Send this link to the company: ${url}`, 'warn');
  }
}

function Statement({ month, tick }) {
  const [state, setState] = useState({ loading: true });
  const [activityTab, setActivityTab] = useState('daily');
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    setState({ loading: true });
    (async () => {
      try {
        const [s, history] = await Promise.all([
          api('/v1/product-billing/statement', { params: { month } }),
          api('/v1/product-billing/history', { params: { months: 6 } }),
        ]);
        if (mine === seq.current) setState({ s, history });
      } catch (error) {
        if (mine === seq.current) setState({ error });
      }
    })();
    return () => {
      seq.current += 1;
    };
  }, [month, tick]);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorBox error={state.error} />;
  const { s, history } = state;
  const u = s.usage;
  const c = s.charges;

  const statItems = [
    ['Total Calls', String(u.calls), `${u.inbound_calls} incoming, ${u.outbound_calls} outgoing`, 'phone'],
    ['Minutes Used', String(u.minutes), 'Rounded up per billable call', 'usage'],
    ...(c ? [['Included in Plan', String(c.included_minutes), c.plan ? `Plan: ${c.plan}` : 'Base allocation', 'plan']] : []),
    ...(c ? [['Extra Minutes', String(c.extra_minutes), c.extra_minutes ? 'Charged on statement' : 'Within plan allowance', 'attention']] : []),
    ...(c ? [['Amount Due', money(c.total_minor, s.currency), s.in_progress ? 'Current month estimate' : 'Final total for the month', 'reports']] : []),
  ];

  return (
    <>
      {s.in_progress ? (
        <Note text="This billing cycle is still running. Usage figures and charges will update as calls occur." tone="info" />
      ) : null}
      {!s.plan_set ? (
        <Note text="No pricing plan is assigned to this company yet. Set pricing in the server settings (PRODUCT_PLANS)." tone="warn" />
      ) : null}

      <section aria-label="Usage overview">
        <StatGrid items={statItems} />
      </section>

      {c ? (
        <Card as="section" className="usage-invoice-card">
          <div className="usage-invoice-header">
            <div>
              <Card.Title>Statement Charges</Card.Title>
              <small className="muted">{c.plan ? `Pricing Plan: ${c.plan}` : 'Standard Product Rates'}</small>
            </div>
            <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
              <Badge text={s.in_progress ? 'Estimate (In Progress)' : 'Final Statement'} tone={s.in_progress ? 'info' : 'good'} />
              <Badge text={`Currency: ${s.currency || 'USD'}`} tone="neutral" />
            </div>
          </div>
          <DataTable
            label="Charges"
            head={['Line Item', 'Quantity', 'Unit price', 'Amount']}
            rows={[
              ...c.lines.map((line) => [
                line.description,
                String(line.quantity),
                money(line.unit_minor, s.currency),
                money(line.amount_minor, s.currency),
              ]),
              ...(c.tax_bps ? [[`Tax (${c.tax_bps / 100}%)`, '', '', money(c.tax_minor, s.currency)]] : []),
              [
                <span key="total-label" style={{ fontWeight: 'var(--font-weight-semibold)' }}>Total Due</span>,
                '',
                '',
                <span key="total-val" style={{ fontWeight: 'var(--font-weight-semibold)', color: 'var(--text)' }}>
                  {money(c.total_minor, s.currency)}
                </span>,
              ],
            ]}
          />
        </Card>
      ) : null}

      <Card as="section">
        <div className="between" style={{ alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <Card.Title>Usage Activity & Trends</Card.Title>
          <Tabs
            options={[
              ['daily', `Daily Breakdown (${u.by_day.length} days)`],
              ['history', `6-Month History (${history.months.length} months)`],
            ]}
            value={activityTab}
            onChange={setActivityTab}
            label="Activity view options"
          />
        </div>

        {activityTab === 'daily' ? (
          u.by_day.length ? (
            <DataTable
              label="Usage by day"
              head={['Date', 'Calls Recorded', 'Total Minutes', 'Avg Call Duration']}
              rows={u.by_day.map((d) => [
                d.date,
                String(d.calls),
                `${d.minutes} min`,
                `${(d.minutes / (d.calls || 1)).toFixed(1)} min`,
              ])}
            />
          ) : (
            <Empty text="No call activity recorded for this month." />
          )
        ) : (
          <DataTable
            label="Historical usage"
            head={['Month', 'Total Calls', 'Total Minutes', 'Amount Due']}
            rows={history.months.map((m) => [
              monthLabel(m.month),
              String(m.calls),
              `${m.minutes} min`,
              m.total_minor === null ? '-' : money(m.total_minor, history.currency),
            ])}
          />
        )}
      </Card>
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
    return () => {
      seq.current += 1;
    };
  }, [tick]);

  if (!state) return null;
  if (state.error) return <ErrorBox error={state.error} />;
  const { sub, addons, planSet } = state;

  return (
    <Card as="section">
      <div className="between" style={{ alignItems: 'center', marginBottom: '12px' }}>
        <Card.Title>Monthly Fee Subscription</Card.Title>
        {sub ? <SubscriptionBadge status={sub.status} /> : null}
      </div>

      {sub ? (
        <div className="stack" style={{ gap: '14px' }}>
          <div className="usage-sub-grid">
            <div className="usage-sub-item">
              <span className="usage-sub-label">Monthly Rate</span>
              <span className="usage-sub-value">{`${money(sub.amount_minor, sub.currency)} / month`}</span>
            </div>
            <div className="usage-sub-item">
              <span className="usage-sub-label">Subscription Status</span>
              <span className="usage-sub-value">
                <SubscriptionBadge status={sub.status} />
              </span>
            </div>
            <div className="usage-sub-item">
              <span className="usage-sub-label">Next Scheduled Charge</span>
              <span className="usage-sub-value">{sub.next_charge_at ? formatDateTime(sub.next_charge_at) : 'Not scheduled'}</span>
            </div>
            <div className="usage-sub-item">
              <span className="usage-sub-label">Last Payment</span>
              <span className="usage-sub-value">{sub.last_paid_at ? formatDateTime(sub.last_paid_at) : 'None recorded'}</span>
            </div>
          </div>

          {sub.authorise_url ? (
            <div className="usage-auth-box">
              <div className="usage-auth-info">
                <h4>PayPal Payment Authorisation Required</h4>
                <p>The company must open its authorisation link to activate automated monthly billing.</p>
              </div>
              <div className="row" style={{ gap: '8px' }}>
                <ActionButton className="btn btn--primary btn--small" action={() => copyLink(sub.authorise_url)}>
                  Copy Link
                </ActionButton>
                <a href={sub.authorise_url} target="_blank" rel="noopener noreferrer" className="btn btn--outline btn--small">
                  Open in PayPal ↗
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <Note
          text={planSet ? 'No active subscription: the monthly fee is invoiced manually from the statement.' : 'No plan is assigned, so there is nothing to charge.'}
          tone="neutral"
        />
      )}

      {addons && addons.length ? (
        <div style={{ marginTop: '16px' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 'var(--font-weight-semibold)', marginBottom: '8px' }}>
            Extra-Minute Addon Charges
          </h3>
          <DataTable
            label="Extra-minute charges"
            head={['Billing Month', 'Extra Minutes Charge', 'Payment State']}
            rows={addons.map((a) => [
              monthLabel(a.month),
              money(a.amount_minor, 'USD'),
              <span key={a.month}>
                <Badge text={a.status} tone={a.status === 'completed' || a.status === 'paid' ? 'good' : a.error ? 'bad' : 'warn'} />
                {a.error ? <small className="muted" style={{ display: 'block' }}>{a.error}</small> : null}
              </span>,
            ])}
          />
        </div>
      ) : null}
    </Card>
  );
}

// The self-service plan catalog + PayPal checkout (/v1/plans/*), separate from the operator-assigned
// subscription above (/v1/product-billing). A paid plan never turns callers away - extra calls beyond
// the included amount are billed, never blocked, so every plan card says so.
const PLAN_SUB_STATUS = {
  active: ['Active', 'good'],
  authenticated: ['Active', 'good'],
  created: ['Waiting for payment', 'warn'],
  pending: ['Waiting for payment', 'warn'],
  cancelled: ['Cancelled', 'neutral'],
  canceled: ['Cancelled', 'neutral'],
};

function EnterpriseDialog({ onClose }) {
  const [f, setF] = useState({ name: '', contact_email: '', phone: '', expected_calls: '', message: '' });
  const [busy, setBusy] = useState(false);
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/v1/plans/enterprise-request', {
        method: 'POST',
        body: { ...f, expected_calls: f.expected_calls ? Number(f.expected_calls) : null },
      });
      toast('Request sent. Our team will reach out.');
      onClose();
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay title="Talk to us about Enterprise" onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
        <Field label="Email"><input type="email" required maxLength={255} {...bind('contact_email')} /></Field>
        <Field label="Phone"><input type="tel" maxLength={40} {...bind('phone')} /></Field>
        <Field label="Expected calls per month"><input type="number" min={0} {...bind('expected_calls')} /></Field>
        <Field label="Message"><textarea rows={3} maxLength={1000} {...bind('message')} /></Field>
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Send request</button></div>
      </form>
    </Overlay>
  );
}

function PlanCard({ plan, currentPlanId, isAdmin, onChoose, busy }) {
  const isCurrent = plan.id === currentPlanId;
  const isEnterprise = plan.id === 'enterprise';
  return (
    <Card as="section" className="plan-card">
      <div className="between" style={{ alignItems: 'flex-start' }}>
        <Card.Title>{plan.name}</Card.Title>
        {isCurrent ? <Badge text="Current plan" tone="good" /> : null}
      </div>
      <p style={{ fontSize: '1.5rem', fontWeight: 'var(--font-weight-semibold)', margin: '4px 0' }}>
        {plan.price_minor != null ? `${money(plan.price_minor, plan.currency || 'USD')}/mo` : 'Custom pricing'}
      </p>
      <p className="muted small">{plan.included_calls != null ? `${plan.included_calls} calls included` : 'Volume pricing for your call count'}</p>
      <p className="muted small">Extra calls are billed, never turned away.</p>
      {isEnterprise ? (
        <Button className="btn btn--outline" onClick={onChoose}>Talk to us</Button>
      ) : isAdmin ? (
        <ActionButton className="btn btn--primary" disabled={isCurrent || busy} action={onChoose}>
          {isCurrent ? 'Current plan' : 'Choose plan'}
        </ActionButton>
      ) : (
        <p className="muted small">Only an admin can change the plan.</p>
      )}
    </Card>
  );
}

function Plans() {
  const isAdmin = can('admin');
  const [state, setState] = useState({ status: 'loading' });
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
  const [invoices, setInvoices] = useState(null);

  const load = async () => {
    try {
      const [catalog, current] = await Promise.all([api('/v1/plans'), api('/v1/plans/current')]);
      setState({ status: 'ready', catalog, current });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  useEffect(() => {
    // Returning from PayPal lands back here (PRODUCT_PAYPAL_RETURN_URL): ask PayPal for the latest
    // status first, then show the current plan - never show success/failure before that answers.
    (async () => {
      try { await api('/v1/plans/subscription/refresh', { method: 'POST' }); } catch { /* best effort; show whatever /current already has */ }
      load();
    })();
    api('/v1/plans/invoices').then((res) => setInvoices(res.invoices || res.items || [])).catch(() => setInvoices(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error') return <ErrorBox error={state.error} />;

  const { catalog, current } = state;
  const plans = catalog.plans || catalog.items || [];
  const currentPlan = current.plan || null;
  const usage = current.usage || {};
  const sub = current.subscription || {};
  const subStatus = sub.status || current.status;
  const [subLabel, subTone] = PLAN_SUB_STATUS[subStatus] || (subStatus ? [subStatus, 'neutral'] : [null, 'neutral']);
  const usedShare = usage.limit ? usage.used / usage.limit : null;

  const choosePlan = async (planId) => {
    try {
      const out = await api('/v1/plans/checkout', { method: 'POST', body: { plan: planId } });
      if (out.approve_url) { window.location.assign(out.approve_url); return; }
      if (out.resumed) toast('Continuing your unfinished checkout.');
      load();
    } catch (error) {
      toast(error.message, 'bad');
    }
  };

  const cancelPlan = async () => {
    try {
      await api('/v1/plans/cancel', { method: 'POST' });
      toast('Plan cancelled.');
      load();
    } catch (error) {
      toast(error.message, 'bad');
    }
  };

  return (
    <Card as="section">
      <div className="between" style={{ alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <Card.Title>Plan</Card.Title>
        <div className="row wrap" style={{ gap: '8px' }}>
          <Badge text={currentPlan?.name || 'Free trial'} tone="info" />
          {subLabel ? <Badge text={subLabel} tone={subTone} /> : null}
        </div>
      </div>

      {!currentPlan ? (
        <Note text="Free trial: 7 days, 10 calls, 1 minute per call." tone="info" />
      ) : null}

      {usage.limit ? (
        <p className="muted">{`${usage.used ?? 0} of ${usage.limit} calls used this period.`}</p>
      ) : null}
      {usedShare !== null && usedShare >= 1 ? (
        <Note text="All included calls for this period are used. Extra calls are billed, never turned away." tone="bad" />
      ) : usedShare !== null && usedShare >= 0.8 ? (
        <Note text="You're near the included calls for this plan. Extra calls are billed." tone="warn" />
      ) : null}
      {(current.warnings || []).map((w, i) => <Note key={i} text={w} tone="warn" />)}

      <div className="plan-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', margin: '16px 0' }}>
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            currentPlanId={currentPlan?.id}
            isAdmin={isAdmin}
            onChoose={() => (plan.id === 'enterprise' ? setEnterpriseOpen(true) : choosePlan(plan.id))}
          />
        ))}
      </div>

      {isAdmin && currentPlan ? (
        <ActionButton className="btn btn--ghost" action={cancelPlan}>Cancel plan</ActionButton>
      ) : null}

      {invoices && invoices.length ? (
        <div style={{ marginTop: '18px' }}>
          <h3 style={{ fontSize: '0.92rem', fontWeight: 'var(--font-weight-semibold)', marginBottom: '8px' }}>Plan invoices</h3>
          <DataTable
            label="Plan invoices"
            head={['Date', 'Amount', 'Status']}
            rows={invoices.map((inv) => [
              inv.created_at ? formatDateTime(inv.created_at) : '-',
              money(inv.amount_minor, inv.currency || 'USD'),
              inv.status || '-',
            ])}
          />
        </div>
      ) : null}

      {enterpriseOpen ? <EnterpriseDialog onClose={() => setEnterpriseOpen(false)} /> : null}
    </Card>
  );
}

function Everyone({ month, tick, refresh }) {
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [search, setSearch] = useState('');
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    (async () => {
      try {
        const [out, subs] = await Promise.all([
          api('/v1/product-billing/companies', { params: { month } }),
          api('/v1/product-billing/subscriptions'),
        ]);
        if (mine === seq.current) setData({ out, subs, month });
      } catch {
        if (mine === seq.current) setData(null); // not the operator: that part is simply not shown
      }
    })();
    return () => {
      seq.current += 1;
    };
  }, [month, tick]);

  const stats = useMemo(() => {
    if (!data) return null;
    const companies = data.out.companies || [];
    const subs = data.subs.companies || [];
    const totalCalls = companies.reduce((sum, c) => sum + (c.calls || 0), 0);
    const totalMinutes = companies.reduce((sum, c) => sum + (c.minutes || 0), 0);
    const activeSubs = subs.filter((c) => c.status === 'active').length;

    return {
      count: companies.length,
      totalCalls,
      totalMinutes,
      activeSubs,
    };
  }, [data]);

  if (!data) return null;
  const { out, subs } = data;
  const by = Object.fromEntries(subs.companies.map((c) => [c.company, c]));
  const confirm = (props) => setDialog(props);

  const filtered = out.companies.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (r.company || '').toLowerCase().includes(q) || (r.plan || '').toLowerCase().includes(q);
  });

  const rows = filtered.map((r) => {
    const sub = by[r.company] || {};
    const live = ['created', 'authenticated', 'active', 'pending', 'paused'].includes(sub.status);

    const start = !live && sub.plan_set ? (
      <Button
        className="btn btn--outline btn--small"
        onClick={() =>
          confirm({
            title: 'Start Subscription',
            text: `Create a monthly PayPal subscription for ${r.company}. You will receive a link to send them; they open it once to authorise the payment.`,
            label: 'Create Subscription',
            action: () => api(`/v1/product-billing/subscriptions/${encodeURIComponent(r.company)}`, { method: 'POST' }),
            done: (made) => {
              toast('Subscription created.');
              if (made.authorise_url) copyLink(made.authorise_url);
              refresh();
            },
          })
        }
      >
        Start subscription
      </Button>
    ) : null;

    const stop = live ? (
      <Button
        className="btn btn--ghost btn--small"
        onClick={() =>
          confirm({
            title: 'Cancel Subscription',
            text: `${r.company} will not be charged again, starting now. This cannot be undone: a new subscription would need a new authorisation.`,
            label: 'Cancel Subscription',
            danger: true,
            action: () => api(`/v1/product-billing/subscriptions/${encodeURIComponent(r.company)}/cancel`, { method: 'POST' }),
            done: () => {
              toast('Cancellation requested.');
              refresh();
            },
          })
        }
      >
        Cancel
      </Button>
    ) : null;

    const extra =
      sub.status === 'active' && r.total_minor !== null ? (
        <Button
          className="btn btn--outline btn--small"
          onClick={() =>
            confirm({
              title: 'Charge Extra Minutes',
              text: `Put ${monthLabel(month)}'s minutes beyond the plan on ${r.company}'s subscription. PayPal charges the company for them straight away. This can only be done once for a month, and only after the month has ended.`,
              label: 'Charge Extra Minutes',
              action: () => api(`/v1/product-billing/subscriptions/${encodeURIComponent(r.company)}/overage`, { method: 'POST', params: { month } }),
              done: (res) => {
                toast(
                  res.status === 'nothing_owed'
                    ? 'Nothing is owed for that month.'
                    : res.already
                    ? 'That month was already charged.'
                    : 'The extra minutes were charged.'
                );
                refresh();
              },
            })
          }
        >
          Charge extra
        </Button>
      ) : null;

    return [
      <span key={`comp-${r.company}`} style={{ fontWeight: 'var(--font-weight-medium)' }}>
        {r.company}
      </span>,
      r.plan ? <Badge key={`plan-${r.company}`} text={r.plan} tone="info" /> : <span className="muted">No plan</span>,
      String(r.calls),
      `${r.minutes} min`,
      money(r.total_minor, out.currency),
      sub.status ? <SubscriptionBadge key={`sub-${r.company}`} status={sub.status} /> : <span className="muted">—</span>,
      <span key={`actions-${r.company}`} className="usage-action-cell">
        {start}
        {extra}
        {stop}
      </span>,
    ];
  });

  return (
    <>
      <Card as="section">
        <div className="between" style={{ alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div className="row" style={{ alignItems: 'center', gap: '10px' }}>
            <Card.Title>{`All Companies — ${monthLabel(data.month)}`}</Card.Title>
            <Badge text="Operator View" tone="info" />
          </div>
          {stats ? (
            <div className="row wrap" style={{ gap: '8px' }}>
              <Badge text={`${stats.count} companies`} tone="neutral" />
              <Badge text={`${stats.totalCalls} total calls`} tone="neutral" />
              <Badge text={`${stats.totalMinutes} total min`} tone="neutral" />
              <Badge text={`${stats.activeSubs} active subs`} tone="good" />
            </div>
          ) : null}
        </div>

        <div className="usage-operator-toolbar">
          <input
            type="search"
            className="usage-operator-search"
            placeholder="Search companies or plans…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter companies"
          />
          <small className="muted">
            {filtered.length === out.companies.length ? `Showing all ${out.companies.length} companies` : `Showing ${filtered.length} of ${out.companies.length}`}
          </small>
        </div>

        <DataTable
          label="Companies billing"
          head={['Company', 'Plan', 'Calls', 'Minutes', 'Amount Due', 'Subscription', '']}
          rows={rows}
        />
      </Card>
      {dialog ? <ConfirmDialog {...dialog} onClose={() => setDialog(null)} /> : null}
    </>
  );
}

export default function Usage() {
  const [months] = useState(() => lastMonths());
  const [month, setMonth] = useState(() => lastMonths(1)[0]);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  const currIndex = months.indexOf(month);
  const canGoNewer = currIndex > 0;
  const canGoOlder = currIndex < months.length - 1;

  const goNewer = () => {
    if (canGoNewer) setMonth(months[currIndex - 1]);
  };
  const goOlder = () => {
    if (canGoOlder) setMonth(months[currIndex + 1]);
  };

  return (
    <>
      <p className="settings-back"><a className="link" href="/settings">← Back to Settings</a></p>
      <PageHeader
        eyebrow="BILLING"
        title="Usage & Billing"
        subtitle="Voice minutes, subscription billing, and statement charges across your account."
        meta={<span className="date">Live statement</span>}
      >
        <div className="usage-header-bar">
          <div className="usage-month-nav" aria-label="Month navigator">
            <button
              type="button"
              className="usage-month-btn"
              disabled={!canGoOlder}
              onClick={goOlder}
              title="Previous Month"
              aria-label="Previous Month"
            >
              ‹
            </button>
            <Select
              className="usage-month-select"
              options={months.map((m) => [m, monthLabel(m)])}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="Select billing month"
            />
            <button
              type="button"
              className="usage-month-btn"
              disabled={!canGoNewer}
              onClick={goNewer}
              title="Next Month"
              aria-label="Next Month"
            >
              ›
            </button>
          </div>
          <a
            className="btn btn--secondary agent-btn"
            href={`/v1/product-billing/statement.csv?month=${month}`}
            download=""
            title="Download CSV statement for selected month"
          >
            Download CSV
          </a>
          <Button className="btn btn--secondary agent-btn" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </PageHeader>

      <div className="stack">
        <Plans />
        <Statement month={month} tick={tick} />
        <Mine tick={tick} />
        <Everyone month={month} tick={tick} refresh={refresh} />
      </div>
    </>
  );
}
