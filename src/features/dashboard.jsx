// Dashboard: a quick read of today (or this week) from /v1/overview - what needs the signed-in person
// right now, the headline numbers, the AI team, the latest calls and the open approvals - plus, further
// down, the fuller period breakdown (every stat, every technician) from /v1/dispatch/reports/summary.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { percent, hours, addDays, todayIn, reasonText, timeAgo } from '../lib/format.js';
import { session } from '../lib/session.js';
import { Spinner, ErrorBox, DataTable, Card, StatGrid, Badge, Empty, Icon, Tabs } from '../components/index.js';

const fetchOverview = (period) => api('/v1/overview', { params: { period } });
export const fetchSummary = (from, to) => api('/v1/dispatch/reports/summary', { params: { from, to } });

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

// One of the three "what needs you" cards - always shown, so "nothing waiting" is still an honest answer, not a gap.
function ActionCard({ icon, title, text, href }) {
  return (
    <a className="quick-action" href={href}>
      <span className="quick-action__icon quick-action__icon--info" aria-hidden="true"><Icon name={icon} /></span>
      <span className="quick-action__body"><strong>{title}</strong><small className="block muted">{text}</small></span>
      <span className="quick-action__go" aria-hidden="true">→</span>
    </a>
  );
}

const OUTCOME_TONE = { booked: 'good', completed: 'good', escalated: 'bad', follow_up: 'warn', cancelled: 'neutral', no_request: 'neutral' };

function RecentCalls({ calls }) {
  if (!calls.length) return <Empty text="No calls yet." />;
  return (
    <ul className="activity-list">
      {calls.map((c) => (
        <li key={c.id} className="activity-row">
          <span className="activity-avatar" aria-hidden="true">{(c.customer?.name || '?').slice(0, 1).toUpperCase()}</span>
          <span className="activity-body"><strong>{c.customer?.name || 'Unknown'}</strong><small className="block muted">{c.reason}</small></span>
          <span className="right">
            <Badge text={c.outcome?.label || c.outcome?.code} tone={OUTCOME_TONE[c.outcome?.code] || 'neutral'} />
            <small className="block muted">{timeAgo(c.started_at)}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function TodoList({ items }) {
  if (!items.length) return <Empty text="Nothing waiting for approval." />;
  return (
    <ul className="activity-list">
      {items.map((t) => (
        <li key={t.id} className="activity-row">
          <span className="activity-avatar activity-avatar--warn" aria-hidden="true"><Icon name="approvals" /></span>
          <span className="activity-body"><strong>{t.title}</strong><small className="block muted">{t.reason}</small></span>
          <small className="muted">{timeAgo(t.created_at)}</small>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const [period, setPeriod] = useState('today');
  const [overview, setOverview] = useState({ status: 'loading' });

  // A week back to a week ahead: visits are booked ahead, so a range that stops at today would hide them.
  const [range, setRange] = useState(() => ({ from: addDays(todayIn(), -7), to: addDays(todayIn(), 7) }));
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);

  useEffect(() => {
    let live = true;
    setOverview({ status: 'loading' });
    fetchOverview(period).then(
      (data) => { if (live) setOverview({ status: 'ready', data }); },
      (error) => { if (live) setOverview({ status: 'error', error }); },
    );
    return () => { live = false; };
  }, [period]);

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
  const o = overview.status === 'ready' ? overview.data : null;

  return (
    <>
      <div className="hero-head">
        <p className="eyebrow">Your operations center</p>
        <h1>{firstName ? `${greetingWord()}, ${firstName}` : greetingWord()}</h1>
        <p className="muted">Your team's day, in one clear view.</p>
      </div>

      <div className="hero-banner">
        <span className="hero-banner__icon" aria-hidden="true"><Icon name="requests" /></span>
        <div className="hero-banner__body">
          <h2>Your business is moving</h2>
          <p className="muted">Your AI team is handling the routine work. Here's where your team can help.</p>
        </div>
        <a className="btn btn--primary" href="#/calls">Review recent calls →</a>
      </div>

      {o ? (
        <div className="quick-actions">
          <ActionCard icon="tasks" title="Assign open work" text={`${o.queues.unassigned_jobs} job${o.queues.unassigned_jobs === 1 ? '' : 's'} need a technician`} href="#/tasks" />
          <ActionCard icon="approvals" title="Review AI actions" text={`${o.follow_ups ? o.follow_ups.total : o.queues.office_follow_ups} item${(o.follow_ups ? o.follow_ups.total : o.queues.office_follow_ups) === 1 ? '' : 's'} need review`} href="#/automation" />
          <ActionCard icon="technicians" title="Check your team" text={`${o.queues.technicians.available} of ${o.queues.technicians.total} technicians available`} href="#/team" />
        </div>
      ) : null}

      <div className="between">
        <h2>Today's overview</h2>
        <Tabs options={[['today', 'Today'], ['week', 'This week']]} value={period} onChange={setPeriod} label="Period" />
      </div>
      {overview.status === 'loading' ? <Spinner text="Loading the overview…" /> : overview.status === 'error' ? <ErrorBox error={overview.error} /> : (
        <>
          <p className="muted small">{`Updated ${timeAgo(o.generated_at)}`}</p>
          <StatGrid items={[
            ['Calls answered', o.counters.calls_answered, null, 'phone'],
            ['Appointments booked', o.counters.appointments_booked, null, 'appointments'],
            ['New customers', o.counters.customers.new, `${o.counters.customers.total} total`, 'customers'],
            ['AI actions to review', o.follow_ups ? o.follow_ups.total : null, null, 'automation'],
          ].filter(([, value]) => value !== null)} />

          <div className="grid2">
            <Card as="section">
              <Card.Title>Recent calls</Card.Title>
              <RecentCalls calls={o.recent_calls} />
              <p className="right"><a href="#/calls">View all →</a></p>
            </Card>
            <Card as="section">
              <Card.Title>Your to-do list</Card.Title>
              <TodoList items={o.todo} />
              <p className="right"><a href="#/approvals">View tasks →</a></p>
            </Card>
          </div>
        </>
      )}

      <div className="between">
        <h2>Operations detail</h2>
        <div className="page-actions">
          <label className="inline">From<input type="date" aria-label="From" value={range.from} onChange={change('from')} /></label>
          <label className="inline">To<input type="date" aria-label="To" value={range.to} onChange={change('to')} /></label>
        </div>
      </div>
      <div className="stack">{body}</div>
    </>
  );
}
