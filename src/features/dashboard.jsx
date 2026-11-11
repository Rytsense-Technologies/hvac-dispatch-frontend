// Overview: operations center matching the reference design.
// Greeting → priority queues → metrics → AI team strip → recent calls + to-dos → extensions.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDay, formatTime, timeAgo } from '../lib/format.js';
import { session } from '../lib/session.js';
import {
  Badge,
  Empty,
  ErrorBox,
  Icon,
  PageHeader,
  Panel,
  PanelHead,
  Row,
  Spinner,
} from '../components/index.js';

export const fetchSummary = (from, to) => api('/v1/dispatch/reports/summary', { params: { from, to } });
const fetchOverview = (period) => api('/v1/overview', { params: { period } });

const PERIODS = [
  ['today', 'Today'],
  ['week', 'This week'],
];

const OUTCOME_TONE = {
  booked: 'good',
  completed: 'good',
  escalated: 'bad',
  follow_up: 'warn',
  cancelled: 'neutral',
  no_request: 'neutral',
};

const AI_TEAM = [
  { id: 'service', name: 'Customer service', icon: 'phone', status: 'active', summary: 'Answers calls and captures service requests.' },
  { id: 'scheduling', name: 'Scheduling', icon: 'appointments', status: 'active', summary: 'Helps coordinate bookings and reminders.' },
  { id: 'estimate', name: 'Estimate follow-up', icon: 'campaigns', status: 'review', summary: 'Keeps track of estimates needing follow-up.' },
  { id: 'office', name: 'Office assistant', icon: 'tasks', status: 'active', summary: 'Organizes administrative tasks for your team.' },
];

function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0] || ''}${parts[1]?.[0] || ''}`.toUpperCase();
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function PeriodChip({ period, onChange }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const label = PERIODS.find(([id]) => id === period)?.[1] || 'Today';

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  return (
    <div className="date-chip" ref={wrap}>
      <button
        type="button"
        className="date-chip__btn"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="appointments" />
        <span>{label}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2.5 4.5l3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <div className="date-chip__menu" role="listbox" aria-label="Period">
          {PERIODS.map(([id, text]) => (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={id === period}
              className={`date-chip__option${id === period ? ' date-chip__option--on' : ''}`}
              onClick={() => { onChange(id); setOpen(false); }}
            >
              {text}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PriorityItem({ href, icon, warm, title, text }) {
  return (
    <a className="priority-item" href={href}>
      <span className={`priority-icon${warm ? ' priority-icon--warm' : ''}`} aria-hidden="true">
        <Icon name={icon} />
      </span>
      <span className="priority-copy">
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
      <span className="priority-chevron" aria-hidden="true">›</span>
    </a>
  );
}

function MetricCard({ href, label, value, hint, icon }) {
  return (
    <a className="card stat" href={href}>
      <div className="stat__head">
        <h3>{label}</h3>
        <span className="stat__icon" aria-hidden="true"><Icon name={icon} /></span>
      </div>
      <p className="stat__value">{value}</p>
      {hint ? <small className="muted">{hint}</small> : null}
    </a>
  );
}

function AgentStripCard({ agent }) {
  const review = agent.status === 'review';
  return (
    <div className="agent-strip-card">
      <div className="agent-strip-card__top">
        <span className="agent-strip-card__name">
          <span className="symbol-tile" aria-hidden="true"><Icon name={agent.icon} /></span>
          <h3>{agent.name}</h3>
        </span>
        <Badge text={review ? 'Review' : 'Active'} tone={review ? 'warn' : 'good'} />
      </div>
      <p className="muted">{agent.summary}</p>
    </div>
  );
}

function callWhen(iso, period) {
  if (!iso) return '—';
  const time = formatTime(iso);
  if (!time || time === '-') return timeAgo(iso) || '—';
  if (period === 'week') {
    const day = formatDay(iso);
    return day && day !== '-' ? `${day}, ${time}` : time;
  }
  return time;
}

function RecentCalls({ calls, period }) {
  if (!calls.length) return <Empty text="No calls yet." />;
  return calls.map((c) => {
    const name = c.customer?.name || 'Unknown';
    const tone = OUTCOME_TONE[c.outcome?.code] || 'neutral';
    const label = c.outcome?.label || c.outcome?.code || 'Open';
    return (
      <Row
        key={c.id}
        leading={initials(name)}
        title={name}
        subtitle={c.reason || 'Customer call'}
        trailing={(
          <span className="row-trailing">
            <Badge text={label} tone={tone} />
            <small className="muted">{callWhen(c.started_at, period)}</small>
          </span>
        )}
      />
    );
  });
}

function TodoRows({ items }) {
  if (!items.length) return <Empty text="Nothing waiting for review." />;
  return items.map((t) => (
    <Row
      key={t.id}
      title={t.title}
      subtitle={t.reason || t.customer || 'Needs review'}
      trailing={(
        <a className="btn btn--secondary btn--small" href="#/automation">Review</a>
      )}
    />
  ));
}

export default function Dashboard() {
  const [period, setPeriod] = useState('today');
  const [overview, setOverview] = useState({ status: 'loading' });

  useEffect(() => {
    let live = true;
    setOverview({ status: 'loading' });
    fetchOverview(period).then(
      (data) => { if (live) setOverview({ status: 'ready', data }); },
      (error) => { if (live) setOverview({ status: 'error', error }); },
    );
    return () => { live = false; };
  }, [period]);

  const rawName = session.user?.name || session.actor || '';
  const firstName = rawName.split(/\s+/)[0] || 'there';
  const o = overview.status === 'ready' ? overview.data : null;

  const unassigned = o?.queues?.unassigned_jobs ?? 0;
  const reviewCount = o?.follow_ups?.total ?? o?.queues?.office_follow_ups ?? 0;
  const callsCount = o?.counters?.calls_answered ?? 0;
  const apptCount = o?.counters?.appointments_booked ?? 0;
  const customersNew = o?.counters?.customers?.new;
  const customersTotal = o?.counters?.customers?.total ?? 0;
  const recentCalls = o?.recent_calls || [];
  const todos = o?.todo || [];
  const isWeek = period === 'week';
  const overviewHeading = isWeek ? "This week's overview" : "Today's overview";
  const prioritySubtitle = isWeek ? "A focused view of this week's work" : "A focused view of today's work";
  const updatedHint = o?.generated_at
    ? `Updated ${timeAgo(o.generated_at)}`
    : isWeek ? 'This week' : 'Today';
  const customerHint = customersNew != null
    ? `${customersNew} new · ${isWeek ? 'this week' : 'today'}`
    : 'Customer profiles';

  return (
    <div className="overview">
      <PageHeader
        eyebrow="YOUR OPERATIONS CENTER"
        title={`${greetingWord()}, ${firstName}`}
        subtitle="Your team's day, in one clear view."
      >
        <PeriodChip period={period} onChange={setPeriod} />
      </PageHeader>

      <Panel className="priority">
        <div className="priority__head">
          <div>
            <p className="priority__eyebrow">YOUR NEXT MOVES</p>
            <h2>Start with what needs you</h2>
            <p className="sub">{prioritySubtitle}</p>
          </div>
          <Badge text="Action queues" tone="warn" />
        </div>
        {overview.status === 'loading' ? <Spinner text="Loading queues…" /> : overview.status === 'error' ? (
          <ErrorBox error={overview.error} />
        ) : (
          <div className="priority-grid">
            <PriorityItem
              href="#/work"
              icon="work"
              title="Assign open work"
              text={plural(unassigned, 'unassigned job', 'unassigned jobs')}
            />
            <PriorityItem
              href="#/automation"
              icon="checkCircle"
              warm
              title="Review AI actions"
              text={plural(reviewCount, 'item needs review', 'items need review')}
            />
            <PriorityItem
              href="#/team"
              icon="team"
              title="Check your team"
              text="View technician availability"
            />
          </div>
        )}
      </Panel>

      <div className="sectionhead">
        <h2>{overviewHeading}</h2>
        <span className="sectionhead__meta muted">{updatedHint}</span>
      </div>

      {overview.status === 'loading' ? <Spinner text="Loading the overview…" /> : overview.status === 'error' ? (
        <ErrorBox error={overview.error} />
      ) : (
        <>
          <div className="cards">
            <MetricCard
              href="#/calls"
              label="Calls answered"
              value={callsCount}
              hint="Conversations shown in Calls"
              icon="phone"
            />
            <MetricCard
              href="#/work/appointments"
              label="Appointments booked"
              value={apptCount}
              hint={isWeek ? 'Appointments this week' : 'Appointments today'}
              icon="appointments"
            />
            <MetricCard
              href="#/customers"
              label="Customers"
              value={customersTotal}
              hint={customerHint}
              icon="customers"
            />
            <MetricCard
              href="#/automation"
              label="AI actions to review"
              value={reviewCount}
              hint="Items awaiting office review"
              icon="clock"
            />
          </div>

          <div className="sectionhead">
            <h2>Your AI team</h2>
            <span className="sectionhead__meta muted">Example agents · Proposed capabilities</span>
          </div>
          <div className="agent-strip">
            {AI_TEAM.map((agent) => <AgentStripCard key={agent.id} agent={agent} />)}
          </div>

          <div className="overview-layout">
            <Panel>
              <PanelHead title="Recent calls" subtitle="The latest conversations with your customers">
                <a className="link" href="#/calls">View all →</a>
              </PanelHead>
              <RecentCalls calls={recentCalls.slice(0, 4)} period={period} />
            </Panel>

            <Panel>
              <PanelHead title="Your to-do list" subtitle="Administrative work that needs a look">
                <a className="link" href="#/work">View tasks →</a>
              </PanelHead>
              <TodoRows items={todos.slice(0, 5)} />
            </Panel>
          </div>
        </>
      )}

      <p className="overview-foot muted">Operational view · Counts refresh with your live workspace data.</p>

      <Panel className="overview-extensions">
        <PanelHead
          title="Technician time extensions"
          subtitle="Updates from technicians extending job time"
        >
          <Badge text="0 updates" tone="good" />
        </PanelHead>
        <Empty text="No extensions yet. Open a current technician job, advance it to Arrived or In progress, then choose Extend job time." />
      </Panel>
    </div>
  );
}
