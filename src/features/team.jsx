// Team & dispatch: a read-only companion view across the people roster, staff roles, technician
// availability and live tracking. Editing stays where it already lives - people on /v1/users,
// time off/shifts on /v1/dispatch/technicians/{id}/... - this page only looks, never writes.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  PageHeader, Card, DataTable, Select, Badge, Spinner, Empty, ErrorBox, Tabs, Note, StatGrid,
} from '../components/index.js';

const TABS = [
  ['people', 'People'],
  ['roles', 'Roles & permissions'],
  ['availability', 'Availability'],
  ['tracking', 'Tracking'],
];

// Status codes come from technicians (on_a_job, time_off, unavailable, off_duty, available) and
// office logins (active, invited, disabled) - one badge tone map covers both.
const STATUS_TONE = {
  available: 'good', active: 'good',
  on_a_job: 'info', invited: 'info',
  time_off: 'neutral', unavailable: 'neutral', off_duty: 'neutral',
  disabled: 'bad',
};
const toneFor = (code) => STATUS_TONE[code] || 'neutral';

const joinOrDash = (list) => (Array.isArray(list) && list.length ? list.join(', ') : '-');
const hoursText = (value) => (value === null || value === undefined ? '-' : `${value} h`);

// Fetches `path` with `params` once the surrounding tab is first shown, and again whenever
// `params` changes while it stays shown. `active` false skips the request entirely (a tab a
// role cannot see, or one not yet opened).
function useTabData(path, params, active) {
  const [state, setState] = useState({ status: 'idle' });
  const seq = useRef(0);
  const key = JSON.stringify(params || {});
  useEffect(() => {
    if (!active) return undefined;
    const mine = (seq.current += 1);
    setState({ status: 'loading' });
    (async () => {
      try {
        const data = await api(path, { params });
        if (mine === seq.current) setState({ status: 'ready', data });
      } catch (error) {
        if (mine === seq.current) setState({ status: 'error', error });
      }
    })();
    return () => { seq.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, path, key]);
  return state;
}

function Forbidden() {
  return <Note tone="warn" text="Your role cannot see this tab." />;
}

// ---------- People ----------

function PeopleTab({ active }) {
  const state = useTabData('/v1/team', undefined, active);
  if (state.status !== 'ready') {
    return state.status === 'error' ? <ErrorBox error={state.error} /> : <Spinner />;
  }
  const { people, text } = state.data;
  return (
    <div className="stack">
      <Note tone="neutral" text="Add a person or change their role on the Users page. Time off and shifts are set on the Technicians page." />
      <Card as="section">
        <Card.Title>{text || 'People'}</Card.Title>
        {people.length ? (
          <DataTable
            label="People"
            head={['Name', 'Role', 'Status', 'Hours today', 'Skills', 'Service areas', 'Login status']}
            rows={people.map((p) => [
              <span><strong>{p.name}</strong><small className="block muted">{[p.email, p.phone].filter(Boolean).join(' · ')}</small></span>,
              p.text,
              <Badge text={p.status?.label || '-'} tone={toneFor(p.status?.code)} />,
              hoursText(p.hours_today),
              joinOrDash(p.skills),
              joinOrDash(p.service_areas),
              p.login ? (
                <span>
                  <Badge text={p.login.status} tone={toneFor(p.login.status)} />
                  {p.login.last_login_at ? <small className="block muted">{`Last in ${timeAgo(p.login.last_login_at)}`}</small> : null}
                </span>
              ) : '-',
            ])}
          />
        ) : <Empty text="No team members yet." />}
      </Card>
    </div>
  );
}

// ---------- Roles & permissions ----------

function RolesTab({ active }) {
  const state = useTabData('/v1/team/roles', undefined, active);
  if (state.status !== 'ready') {
    return state.status === 'error' ? <ErrorBox error={state.error} /> : <Spinner />;
  }
  const { roles } = state.data;
  return (
    <div className="stack">
      <Note tone="neutral" text="People sign in as admin or technician, set on the Users page. Dispatcher, approver and viewer are staff access-key roles, not sign-in accounts. There is no owner - a company's first admin is just an admin." />
      {roles.length ? roles.map((role) => (
        <Card as="section" key={role.id}>
          <Card.Title>{role.label}</Card.Title>
          <p className="muted">{role.kind}</p>
          {role.what ? <p>{role.what}</p> : null}
          {role.permissions?.length ? (
            <ul className="plain">{role.permissions.map((perm, i) => <li key={i}>{perm}</li>)}</ul>
          ) : <p className="muted">No permissions listed.</p>}
        </Card>
      )) : <Empty text="No roles to show." />}
    </div>
  );
}

// ---------- Availability ----------

function AvailabilityTab({ active }) {
  const [period, setPeriod] = useState('today');
  const state = useTabData('/v1/team/availability', { period }, active);
  return (
    <div className="stack">
      <div className="toolbar">
        <Select options={[['today', 'Today'], ['week', 'This week']]} value={period} aria-label="Period" onChange={(e) => setPeriod(e.target.value)} />
      </div>
      {state.status === 'error' ? <ErrorBox error={state.error} /> : null}
      {state.status === 'loading' ? <Spinner /> : null}
      {state.status === 'ready' ? (
        state.data.technicians?.length ? state.data.technicians.map((tech) => (
          <Card as="section" key={tech.id}>
            <Card.Title>{tech.name}</Card.Title>
            <p className="muted">{[tech.trade, hoursText(tech.hours)].filter(Boolean).join(' · ')}</p>
            <div className="stack">
              {tech.days.map((day, i) => (
                <div key={i}>
                  <strong>{day.label}</strong>
                  {day.segments?.length ? (
                    <ul className="plain">{day.segments.map((seg, j) => <li key={j}>{seg.text}</li>)}</ul>
                  ) : <p className="muted small">No shift this day</p>}
                </div>
              ))}
            </div>
          </Card>
        )) : <Empty text="No technicians to show." />
      ) : null}
    </div>
  );
}

// ---------- Tracking ----------

function TrackingTab({ active }) {
  const state = useTabData('/v1/team/tracking', undefined, active);
  if (state.status !== 'ready') {
    return state.status === 'error' ? <ErrorBox error={state.error} /> : <Spinner />;
  }
  const { enabled, note, summary, technicians } = state.data;
  if (!enabled) return <Note tone="neutral" text={note || 'Tracking is not turned on.'} />;
  const list = technicians || [];
  return (
    <div className="stack">
      {summary ? (
        <StatGrid items={[
          ['Live', summary.live], ['Stale', summary.stale], ['Off', summary.off], ['On a job', summary.on_a_job],
        ]} />
      ) : null}
      <Card as="section">
        <Card.Title>Technicians</Card.Title>
        {list.length ? (
          <DataTable
            label="Tracking"
            head={['Name', 'Tracking', 'Status', 'Current job', 'ETA']}
            rows={list.map((t) => [
              t.name,
              t.tracking_text || t.tracking,
              <Badge text={t.status?.label || t.status || '-'} tone={toneFor(t.status?.code || t.status)} />,
              t.job?.service || '-',
              t.eta_seconds === null || t.eta_seconds === undefined ? '-' : `${Math.round(t.eta_seconds / 60)} min`,
            ])}
          />
        ) : <Empty text="No technicians to show." />}
      </Card>
    </div>
  );
}

// ---------- the page ----------

export default function Team() {
  const [tab, setTab] = useState('people');
  const allowed = can('admin', 'dispatcher', 'approver');

  let body;
  if (tab === 'roles') body = <RolesTab active={tab === 'roles'} />;
  else if (!allowed) body = <Forbidden />;
  else if (tab === 'people') body = <PeopleTab active />;
  else if (tab === 'availability') body = <AvailabilityTab active />;
  else body = <TrackingTab active />;

  return (
    <>
      <PageHeader title="Team & dispatch" subtitle="Who is on the roster, what they can do, when they are free, and where they are now." />
      <Tabs options={TABS} value={tab} onChange={setTab} label="Team & dispatch" />
      <div className="stack">{body}</div>
    </>
  );
}
