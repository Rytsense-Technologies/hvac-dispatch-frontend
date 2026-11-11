// Overview: operations center matching the reference design, with pre-design live data.
// Greeting → priority queues → metrics → AI team strip → recent calls + to-dos →
// extensions → operations detail (dispatch reports summary + date range, below the reference layout).
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  addDays,
  formatDay,
  formatTime,
  hours,
  percent,
  reasonText,
  timeAgo,
  todayIn,
} from '../lib/format.js';
import { session } from '../lib/session.js';
import {
  Badge,
  DataTable,
  Empty,
  ErrorBox,
  Icon,
  PageHeader,
  Panel,
  PanelHead,
  Row,
  Spinner,
  StatGrid,
} from '../components/index.js';

export const fetchSummary = (from, to) => api('/v1/dispatch/reports/summary', { params: { from, to } });
const fetchOverview = (period) => api('/v1/overview', { params: { period } });
const fetchExtensions = () => api('/v1/team/extensions', { params: { status: 'new', limit: 20 } });

export function cards(summary) {
  const waiting = Object.values(summary.proposals || {}).reduce((sum, p) => sum + (p.pending || 0), 0);
  return [
    ['Booked jobs', summary.jobs?.total ?? 0, null, 'jobs'],
    ['Done', summary.jobs?.by_progress?.completed ?? 0, null, 'approvals'],
    ['On time', percent(summary.jobs?.on_time_share), null, 'tracking'],
    ['Inside promised window', percent(summary.jobs?.inside_window_share), null, 'plan'],
    ['Requests', summary.requests?.total ?? 0, null, 'requests'],
    ['Emergencies (people handle)', summary.requests?.emergencies ?? 0, null, 'attention'],
    ['Requests booked', percent(summary.requests?.booked_share), null, 'approvals'],
    ['Proposals waiting', waiting, null, 'leads'],
    ['Problems still open', summary.problems?.still_open ?? 0, null, 'attention'],
  ];
}

export function technicianTable(rows) {
  if (!rows?.length) return <Empty text="No technicians set up yet." />;
  return (
    <DataTable
      head={['Technician', 'Jobs', 'Done', 'Available (h)', 'Booked (h)', 'Busy', 'On time']}
      rows={rows.map((t) => [
        <strong key="name">{t.name}</strong>,
        t.jobs,
        t.completed,
        hours(t.available_minutes),
        hours(t.booked_minutes),
        percent(t.utilisation),
        percent(t.on_time_share),
      ])}
    />
  );
}

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

function extensionEntries(data) {
  if (!data) return [];
  if (Array.isArray(data.updates)) return data.updates;
  return data.extensions || data.items || data.entries || [];
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

function ExtensionsPanel({ state }) {
  const entries = state.status === 'ready' ? extensionEntries(state.data) : [];
  const count = typeof state.data?.updates === 'number'
    ? state.data.updates
    : entries.length;

  return (
    <Panel className="overview-extensions">
      <PanelHead
        title="Technician time extensions"
        subtitle="Updates from technicians extending job time"
      >
        <span className="overview-extensions__actions">
          <Badge text={`${count} update${count === 1 ? '' : 's'}`} tone={count ? 'warn' : 'good'} />
          <a className="link" href="#/team">View team →</a>
        </span>
      </PanelHead>
      {state.status === 'loading' ? <Spinner text="Loading extensions…" /> : null}
      {state.status === 'error' ? <ErrorBox error={state.error} /> : null}
      {state.status === 'ready' && !entries.length ? (
        <Empty text="No extensions yet. Open a current technician job, advance it to Arrived or In progress, then choose Extend job time." />
      ) : null}
      {entries.length ? entries.slice(0, 5).map((x, i) => (
        <Row
          key={x.id || i}
          title={[x.service, x.customer].filter(Boolean).join(' · ') || x.title || 'Time extension'}
          subtitle={[
            x.technician || x.technician_name || 'Technician',
            x.reason,
            x.added_minutes != null ? `+${x.added_minutes} minutes` : null,
          ].filter(Boolean).join(' · ')}
          trailing={(
            <Badge
              text={x.conflicts?.length || x.warning ? 'Schedule conflict' : (x.label || 'Extended')}
              tone={x.conflicts?.length || x.warning ? 'warn' : 'good'}
            />
          )}
        />
      )) : null}
    </Panel>
  );
}

function OperationsDetail({ range, onChange, state }) {
  let body;
  if (state.status === 'loading') body = <Spinner text="Loading the numbers…" />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else {
    const data = state.data;
    const problems = data.problems || {};
    const byReason = Object.entries(problems.by_reason || {})
      .map(([k, v]) => `${reasonText(k)} ${v}`)
      .join(', ');
    body = (
      <div className="overview-detail__body stack">
        <StatGrid items={cards(data)} />
        <Panel>
          <PanelHead title="Technicians" subtitle="Workload across the selected range" />
          {technicianTable(data.technicians || [])}
        </Panel>
        <Panel>
          <PanelHead title="Problems found" subtitle="Dispatch issues opened in this range" />
          <p className="overview-detail__problems">
            {`${problems.opened ?? 0} found, ${problems.still_open ?? 0} still open.`}
            {byReason ? ` ${byReason}` : ''}
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <section className="overview-detail" aria-label="Operations detail">
      <div className="sectionhead">
        <h2>Operations detail</h2>
        <div className="overview-detail__filters page-actions">
          <label className="inline">
            From
            <input type="date" aria-label="From" value={range.from} onChange={onChange('from')} />
          </label>
          <label className="inline">
            To
            <input type="date" aria-label="To" value={range.to} onChange={onChange('to')} />
          </label>
        </div>
      </div>
      {body}
    </section>
  );
}

function teamAvailabilityText(queues) {
  const available = queues?.technicians?.available;
  const total = queues?.technicians?.total;
  if (available == null || total == null) return 'View technician availability';
  return `${available} of ${total} technicians available`;
}

export default function Dashboard() {
  const [period, setPeriod] = useState('today');
  const [overview, setOverview] = useState({ status: 'loading' });
  const [extensions, setExtensions] = useState({ status: 'loading' });
  // A week back to a week ahead: visits are booked ahead, so a range that stops at today would hide them.
  const [range, setRange] = useState(() => ({ from: addDays(todayIn(), -7), to: addDays(todayIn(), 7) }));
  const [summary, setSummary] = useState({ status: 'loading' });
  const latestSummary = useRef(0);

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
    let live = true;
    setExtensions({ status: 'loading' });
    fetchExtensions().then(
      (data) => { if (live) setExtensions({ status: 'ready', data }); },
      (error) => { if (live) setExtensions({ status: 'error', error }); },
    );
    return () => { live = false; };
  }, []);

  useEffect(() => {
    latestSummary.current += 1;
    const mine = latestSummary.current;
    setSummary({ status: 'loading' });
    fetchSummary(range.from, range.to).then(
      (data) => { if (mine === latestSummary.current) setSummary({ status: 'ready', data }); },
      (error) => { if (mine === latestSummary.current) setSummary({ status: 'error', error }); },
    );
    return () => { latestSummary.current += 1; };
  }, [range]);

  const changeRange = (key) => (e) => {
    const value = e.target.value;
    if (!value) return;
    setRange((r) => {
      const next = { ...r, [key]: value };
      if (next.from > next.to) next[key === 'from' ? 'to' : 'from'] = value;
      return next;
    });
  };

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
              text={teamAvailabilityText(o?.queues)}
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
            <a className="link sectionhead__meta" href="#/agents">View agents →</a>
          </div>
          <p className="overview-agents-meta muted">Example agents · Proposed capabilities</p>
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

      <ExtensionsPanel state={extensions} />

      <OperationsDetail range={range} onChange={changeRange} state={summary} />
    </div>
  );
}
