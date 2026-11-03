// Dashboard: how dispatch is doing over a period, as a few big numbers and one table per technician -
// plus a short greeting, what needs the signed-in person's attention right now, and the latest activity.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { percent, hours, addDays, todayIn, reasonText } from '../lib/format.js';
import { session } from '../lib/session.js';
import { Spinner, ErrorBox, DataTable, Card, StatGrid, StatusBadge, Empty, Icon } from '../components/index.js';
import { proposalText } from './attention.jsx';

export const fetchSummary = (from, to) => api('/v1/dispatch/reports/summary', { params: { from, to } });
const fetchRecentRequests = () => api('/v1/service-requests', { params: { limit: 5 } });
const fetchOpenAttention = () => api('/v1/dispatch/violations', { params: { status: 'open' } });

export function cards(summary) {
  const waiting = Object.values(summary.proposals || {}).reduce((sum, p) => sum + (p.pending || 0), 0);
  return [
    ['Booked jobs', summary.jobs.total, null, 'jobs'], ['Done', summary.jobs.by_progress.completed, null, 'approvals'],
    ['On time', percent(summary.jobs.on_time_share), null, 'tracking'], ['Inside promised window', percent(summary.jobs.inside_window_share), null, 'plan'],
    ['Requests', summary.requests.total, null, 'requests'], ['Emergencies (people handle)', summary.requests.emergencies, null, 'attention'],
    ['Requests booked', percent(summary.requests.booked_share), null, 'approvals'], ['Proposals waiting', waiting, null, 'leads'], ['Problems still open', summary.problems.still_open, null, 'attention'],
  ];
}

export function technicianTable(rows) {
  if (!rows.length) return <p className="empty">No technicians set up yet.</p>;
  return (
    <DataTable head={['Technician', 'Jobs', 'Done', 'Available (h)', 'Booked (h)', 'Busy', 'On time']}
      rows={rows.map((t) => [<strong>{t.name}</strong>, t.jobs, t.completed, hours(t.available_minutes), hours(t.booked_minutes), percent(t.utilisation), percent(t.on_time_share)])} />
  );
}

function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// A row linking straight to a section that needs the person's attention, shown only while its count is above zero.
function QuickAction({ icon, tone, count, label, href }) {
  if (!count) return null;
  return (
    <a className="quick-action" href={href}>
      <span className={`quick-action__icon quick-action__icon--${tone}`} aria-hidden="true"><Icon name={icon} /></span>
      <span className="quick-action__body"><strong>{count}</strong> {label}</span>
      <span className="quick-action__go" aria-hidden="true">→</span>
    </a>
  );
}

function RecentRequests({ items }) {
  if (!items.length) return <Empty text="No requests yet." />;
  return (
    <ul className="activity-list">
      {items.map((item) => {
        const r = item.service_request;
        const name = item.customer.name || 'Unknown';
        return (
          <li key={r.id} className="activity-row">
            <span className="activity-avatar" aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
            <span className="activity-body"><strong>{name}</strong><small className="block muted">{r.service_type || r.category || 'Request'}</small></span>
            <StatusBadge status={r.status} />
          </li>
        );
      })}
    </ul>
  );
}

function AttentionList({ items }) {
  if (!items.length) return <Empty text="Nothing needs attention. Every booked job fits its technician." />;
  return (
    <ul className="activity-list">
      {items.map((v, i) => (
        <li key={v.job_id || i} className="activity-row">
          <span className="activity-avatar activity-avatar--warn" aria-hidden="true"><Icon name="attention" /></span>
          <span className="activity-body"><strong>{v.summary?.service_type || 'Job'}</strong><small className="block muted">{proposalText(v)}</small></span>
          {v.technician_name ? <small className="muted">{v.technician_name}</small> : null}
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  // A week back to a week ahead: visits are booked ahead, so a range that stops at today would hide them.
  const [range, setRange] = useState(() => ({ from: addDays(todayIn(), -7), to: addDays(todayIn(), 7) }));
  const [state, setState] = useState({ status: 'loading' });
  const [extra, setExtra] = useState({ status: 'loading' });
  const latest = useRef(0);

  useEffect(() => {
    latest.current += 1;
    const mine = latest.current;
    setState({ status: 'loading' });
    fetchSummary(range.from, range.to).then(
      (data) => { if (mine === latest.current) setState({ status: 'ready', data }); },
      (error) => { if (mine === latest.current) setState({ status: 'error', error }); },
    );
    return () => { latest.current += 1; };
  }, [range]);

  useEffect(() => {
    let live = true;
    Promise.all([fetchRecentRequests(), fetchOpenAttention()]).then(([requests, violations]) => {
      if (live) setExtra({ status: 'ready', requests: requests.service_requests.slice(0, 5), violations: violations.violations });
    }, (error) => { if (live) setExtra({ status: 'error', error }); });
    return () => { live = false; };
  }, []);

  const change = (key) => (e) => {
    const value = e.target.value;
    if (!value) return;
    setRange((r) => {
      const next = { ...r, [key]: value };
      if (next.from > next.to) next[key === 'from' ? 'to' : 'from'] = value;
      return next;
    });
  };

  let body;
  if (state.status === 'loading') body = <Spinner text="Loading the numbers…" />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else {
    const data = state.data;
    body = (
      <>
        <StatGrid items={cards(data)} />
        <Card as="section"><Card.Title>Technicians</Card.Title>{technicianTable(data.technicians)}</Card>
        <Card as="section"><Card.Title>Problems found</Card.Title>
          <p>{`${data.problems.opened} found, ${data.problems.still_open} still open. `}{Object.entries(data.problems.by_reason).map(([k, v]) => `${reasonText(k)} ${v}`).join(', ')}</p>
        </Card>
      </>
    );
  }

  const firstName = (session.user?.name || session.actor || '').split(' ')[0];
  const waitingApprovals = state.status === 'ready' ? Object.values(state.data.proposals || {}).reduce((sum, p) => sum + (p.pending || 0), 0) : 0;

  return (
    <>
      <div className="hero-head">
        <p className="eyebrow">Your dispatch workspace</p>
        <h1>{firstName ? `${greetingWord()}, ${firstName}` : greetingWord()}</h1>
        <p className="muted">Here's what's happening with requests, jobs and your team.</p>
      </div>

      <div className="hero-banner">
        <span className="hero-banner__icon" aria-hidden="true"><Icon name="requests" /></span>
        <div className="hero-banner__body">
          <h2>Requests, jobs and technicians in one place</h2>
          <p className="muted">Review what needs you, and let the planner handle the rest.</p>
        </div>
        <a className="btn btn--primary" href="#/requests">Review requests →</a>
      </div>

      {state.status === 'ready' ? (
        <div className="quick-actions">
          <QuickAction icon="attention" tone="warn" count={state.data.problems.still_open} label="jobs need attention" href="#/attention" />
          <QuickAction icon="approvals" tone="info" count={waitingApprovals} label="replacements waiting for approval" href="#/approvals" />
          <QuickAction icon="requests" tone="bad" count={state.data.requests.emergencies} label="emergencies need a person" href="#/requests" />
        </div>
      ) : null}

      <div className="between">
        <h2>Today's overview</h2>
        <div className="page-actions">
          <label className="inline">From<input type="date" aria-label="From" value={range.from} onChange={change('from')} /></label>
          <label className="inline">To<input type="date" aria-label="To" value={range.to} onChange={change('to')} /></label>
        </div>
      </div>
      <div className="stack">
        {body}
        <div className="grid2">
          <Card as="section">
            <Card.Title>Recent requests</Card.Title>
            {extra.status === 'ready' ? <RecentRequests items={extra.requests} /> : extra.status === 'error' ? <ErrorBox error={extra.error} /> : <Spinner />}
            <p className="right"><a href="#/requests">See all requests →</a></p>
          </Card>
          <Card as="section">
            <Card.Title>Needs attention</Card.Title>
            {extra.status === 'ready' ? <AttentionList items={extra.violations.slice(0, 5)} /> : extra.status === 'error' ? <ErrorBox error={extra.error} /> : <Spinner />}
            <p className="right"><a href="#/attention">See all →</a></p>
          </Card>
        </div>
      </div>
    </>
  );
}
