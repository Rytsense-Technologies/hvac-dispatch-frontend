// Team & dispatch — People / Roles / Availability / Tracking, matched to the Rytsense reference.
// Writes reuse Users + Technicians dialogs; Tracking is a nested view (not a sidebar item).
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import {
  PageHeader, Panel, PanelHead, FilterChips, Badge, Spinner, Empty, ErrorBox,
  Button, Dialog, Note, toast,
} from '../components/index.js';
import { ScheduleTech } from './schedule.jsx';
import { TimeOffDialog } from './technicians.jsx';
import {
  AddAdminDialog, AddTechnicianDialog, EditDialog,
} from './users.jsx';
import TeamTracking from './tracking.jsx';

const FILTERS = [
  ['people', 'People'],
  ['roles', 'Roles & permissions'],
  ['availability', 'Availability'],
  ['tracking', 'Tracking'],
];

const STATUS_TONE = {
  available: 'good', active: 'good',
  on_a_job: 'info', invited: 'info',
  time_off: 'neutral', unavailable: 'neutral', off_duty: 'neutral',
  disabled: 'bad',
};
const toneFor = (code) => STATUS_TONE[String(code || '').toLowerCase()] || 'neutral';

const hoursText = (value) => (value === null || value === undefined ? null : `${value} h`);

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

function personSubtitle(person) {
  const trade = person.trade || person.department || (Array.isArray(person.skills) && person.skills[0]) || '';
  const role = person.text || person.role_label || person.role || '';
  if (trade && role) return `${trade} · ${role}`;
  return trade || role || [person.email, person.phone].filter(Boolean).join(' · ') || 'Team member';
}

function personUser(person) {
  if (person.login?.id) {
    return {
      id: person.login.id,
      name: person.name,
      email: person.email || person.login.email,
      phone: person.phone || person.login.phone,
      role: person.login.role || person.role || 'technician',
    };
  }
  if (person.user_id || (person.id && person.login)) {
    return {
      id: person.user_id || person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      role: person.role || 'technician',
    };
  }
  return null;
}

function personTech(person) {
  const id = person.technician_id || (person.role === 'technician' || /technician/i.test(person.text || '') ? person.id : null);
  if (!id) return null;
  return { id, name: person.name, phone: person.phone, email: person.email };
}

// Fetches `path` with `params` once the surrounding tab is first shown, and again whenever
// `params` changes while it stays shown. `active` false skips the request entirely.
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

function ExtensionsPanel({ active }) {
  const state = useTabData('/v1/team/extensions', undefined, active);
  const entries = state.status === 'ready'
    ? (state.data.extensions || state.data.items || state.data.updates || [])
    : [];
  const count = entries.length;
  return (
    <Panel className="team-extensions" as="section">
      <PanelHead
        title="Technician time extensions"
        subtitle="Shared sample updates from the technician view in this browser"
      >
        <Badge text={`${count} update${count === 1 ? '' : 's'}`} tone={count ? 'warn' : 'good'} />
      </PanelHead>
      {state.status === 'loading' ? <Spinner /> : null}
      {state.status === 'error' && state.error?.status && state.error.status >= 500 ? (
        <ErrorBox error={state.error} />
      ) : null}
      {(state.status === 'ready' && !count)
        || (state.status === 'error' && !(state.error?.status >= 500)) ? (
        <p className="sub">No extensions yet. Open a current technician job, advance it to Arrived or In progress, then choose Extend job time.</p>
      ) : null}
      {count ? entries.map((x, i) => (
        <div className="row-item" key={x.id || i}>
          <span className="rowmain">
            <strong>{[x.service, x.customer].filter(Boolean).join(' · ') || x.title || 'Time extension'}</strong>
            <small className="muted">
              {[x.technician, x.technician_name].filter(Boolean).join('') || 'Technician'}
              {x.reason ? ` · ${x.reason}` : ''}
              {x.added_minutes != null ? ` · +${x.added_minutes} minutes` : ''}
            </small>
          </span>
          <Badge
            text={x.conflicts?.length ? 'Schedule conflict' : (x.label || 'Extended')}
            tone={x.conflicts?.length ? 'warn' : 'good'}
          />
        </div>
      )) : null}
      <p className="sample-label">Same-browser demo sync only. Other appointments keep their original times.</p>
    </Panel>
  );
}

function PeopleTab({ active, onEditRole, onTimeOff }) {
  const state = useTabData('/v1/team', undefined, active);
  if (!active) return null;
  if (state.status !== 'ready') {
    return state.status === 'error' ? <ErrorBox error={state.error} /> : <Spinner />;
  }
  const people = state.data.people || [];
  return (
    <div className="team-people stack">
      <Panel as="section">
        <PanelHead
          title="Your team"
          subtitle="Manage office staff and field technicians"
        >
          <Badge text={`${people.length} member${people.length === 1 ? '' : 's'}`} tone="good" />
        </PanelHead>
        {people.length ? people.map((person) => {
          const statusLabel = person.status?.label || person.availability || person.status || '—';
          const statusCode = person.status?.code || person.status;
          const tech = personTech(person);
          const user = personUser(person);
          return (
            <div className="row-item team-person-row" key={person.id || person.email || person.name}>
              <span className="circle">{initials(person.name)}</span>
              <span className="rowmain">
                <strong>{person.name}</strong>
                <small className="muted">{personSubtitle(person)}</small>
              </span>
              <Badge text={statusLabel} tone={toneFor(statusCode)} />
              <div className="team-person-actions">
                <Button
                  className="btn btn--secondary agent-btn"
                  disabled={!user}
                  title={user ? 'Edit role' : 'Needs a sign-in account before role can be edited'}
                  onClick={() => (user ? onEditRole(user) : toast('Create a sign-in for this person on Users before editing their role.', 'warn'))}
                >
                  Edit role
                </Button>
                {tech ? (
                  <Button
                    className="btn btn--secondary agent-btn"
                    aria-label={`Manage time off for ${person.name}`}
                    onClick={() => onTimeOff(tech)}
                  >
                    Time off
                  </Button>
                ) : null}
              </div>
            </div>
          );
        }) : <Empty text="No team members yet." />}
      </Panel>
      <p className="page-foot">
        Interactive design concept · Changes stay in this browser session and do not invite people, enforce access, or schedule real work.
      </p>
      <ExtensionsPanel active={active} />
    </div>
  );
}

// ---------- Roles & permissions ----------

function RolesTab({ active, onReview }) {
  const state = useTabData('/v1/team/roles', undefined, active);
  if (!active) return null;
  if (state.status !== 'ready') {
    return state.status === 'error' ? <ErrorBox error={state.error} /> : <Spinner />;
  }
  const roles = state.data.roles || [];
  return (
    <div className="stack">
      <Panel as="section">
        <PanelHead
          title="Roles & permissions"
          subtitle="People sign in as admin or technician. Other labels describe staff access keys — not separate sign-in accounts."
        />
        {roles.length ? roles.map((role) => (
          <div className="row-item" key={role.id || role.label}>
            <span className="rowmain">
              <strong>{role.label}</strong>
              <small className="muted">
                {[role.kind, ...(role.permissions || []).slice(0, 4)].filter(Boolean).join(' · ')
                  || role.what
                  || 'No permissions listed'}
              </small>
            </span>
            <Button
              className="btn btn--secondary agent-btn"
              onClick={() => onReview(role)}
              aria-label={`Review ${role.label} permissions`}
            >
              Review permissions
            </Button>
          </div>
        )) : <Empty text="No roles to show." />}
      </Panel>
      <p className="page-foot">Illustrative access model; actual permissions are enforced by the backend.</p>
    </div>
  );
}

// ---------- Availability ----------

function AvailabilityTab({ active }) {
  const [period, setPeriod] = useState('today');
  const state = useTabData('/v1/team/availability', { period }, active);
  if (!active) return null;
  return (
    <div className="stack">
      <Panel as="section">
        <PanelHead
          title="Technician availability"
          subtitle="Working hours and booked windows · local business time"
        >
          <FilterChips
            label="Availability period"
            options={[['today', 'Today'], ['week', 'This week']]}
            value={period}
            onChange={setPeriod}
          />
        </PanelHead>
        <div className="schedule-legend" aria-hidden="true">
          <span><i className="legend-swatch legend-swatch--available" /> Available</span>
          <span><i className="legend-swatch legend-swatch--booked" /> Booked</span>
          <span><i className="legend-swatch legend-swatch--outside" /> Outside hours</span>
        </div>
        {state.status === 'error' ? <ErrorBox error={state.error} /> : null}
        {state.status === 'loading' ? <Spinner /> : null}
        {state.status === 'ready' ? (
          state.data.technicians?.length ? (
            <div className="schedule-list">
              {state.data.technicians.map((tech) => (
                <ScheduleTech
                  key={tech.id}
                  name={tech.name}
                  meta={[tech.trade, hoursText(tech.hours)].filter(Boolean).join(' · ')}
                  days={(tech.days || []).map((day, i) => ({
                    key: `${tech.id}-${i}`,
                    label: day.label,
                    segments: day.segments || [],
                  }))}
                />
              ))}
            </div>
          ) : <Empty text="No technicians to show." />
        ) : null}
        <p className="sub" style={{ marginTop: 14 }}>
          Slots reflect the availability feed. Booking still checks working hours, job duration, travel time, time off, and conflicts.
        </p>
      </Panel>
    </div>
  );
}

// ---------- Add member chooser ----------

function AddMemberChooser({ onClose, onPick }) {
  return (
    <Dialog title="Add team member" onClose={onClose}>
      <p>Choose who you are adding. Technicians can be scheduled; admins sign in to this console.</p>
      <div className="dialog-actions">
        <Button className="btn btn--primary action" onClick={() => onPick('technician')}>Add technician</Button>
        <Button className="btn btn--secondary agent-btn" onClick={() => onPick('admin')}>Add admin</Button>
      </div>
    </Dialog>
  );
}

function RoleReviewDialog({ role, onClose }) {
  return (
    <Dialog title={`${role.label} permissions`} onClose={onClose}>
      <p className="sample-label">Read-only view of what the API reports for this role.</p>
      {role.what ? <p>{role.what}</p> : null}
      {role.kind ? <p className="muted">{role.kind}</p> : null}
      {role.permissions?.length ? (
        <ul className="plain">
          {role.permissions.map((perm, i) => <li key={i}>{perm}</li>)}
        </ul>
      ) : <p className="muted">No permissions listed.</p>}
      <div className="dialog-actions">
        <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
      </div>
    </Dialog>
  );
}

// ---------- the page ----------

export default function Team() {
  const [tab, setTab] = useState('people');
  const [dialog, setDialog] = useState(null);
  const [peopleTick, setPeopleTick] = useState(0);
  const allowed = can('admin', 'dispatcher', 'approver');
  const canManageUsers = can('admin');

  const reloadPeople = () => {
    setDialog(null);
    setPeopleTick((n) => n + 1);
  };

  if (tab === 'tracking') {
    return <TeamTracking active onBack={() => setTab('people')} />;
  }

  let body;
  if (tab === 'roles') {
    body = (
      <RolesTab
        active
        onReview={(role) => setDialog({ kind: 'role', role })}
      />
    );
  } else if (!allowed) {
    body = <Forbidden />;
  } else if (tab === 'people') {
    body = (
      <PeopleTab
        key={peopleTick}
        active
        onEditRole={(user) => setDialog({ kind: 'edit', user })}
        onTimeOff={(tech) => setDialog({ kind: 'timeoff', tech })}
      />
    );
  } else if (tab === 'availability') {
    body = <AvailabilityTab active />;
  } else {
    body = null;
  }

  const close = () => setDialog(null);

  return (
    <div className="team-page">
      <PageHeader
        eyebrow="PEOPLE & OPERATIONS"
        title="Team & dispatch"
        subtitle="Manage your team, their access, and their schedule."
      >
        {canManageUsers ? (
          <Button className="btn btn--primary action" onClick={() => setDialog({ kind: 'add' })}>
            + Add team member
          </Button>
        ) : null}
      </PageHeader>

      <FilterChips
        label="Team & dispatch"
        options={FILTERS}
        value={tab}
        onChange={setTab}
      />

      <div className="team-body stack">{body}</div>

      {dialog?.kind === 'add' ? (
        <AddMemberChooser
          onClose={close}
          onPick={(kind) => setDialog({ kind: kind === 'admin' ? 'addAdmin' : 'addTech' })}
        />
      ) : null}
      {dialog?.kind === 'addAdmin' ? <AddAdminDialog onClose={close} reload={reloadPeople} /> : null}
      {dialog?.kind === 'addTech' ? <AddTechnicianDialog onClose={close} reload={reloadPeople} /> : null}
      {dialog?.kind === 'edit' ? <EditDialog user={dialog.user} onClose={close} reload={reloadPeople} /> : null}
      {dialog?.kind === 'timeoff' ? (
        <TimeOffDialog tech={dialog.tech} reload={reloadPeople} onClose={close} />
      ) : null}
      {dialog?.kind === 'role' ? <RoleReviewDialog role={dialog.role} onClose={close} /> : null}
    </div>
  );
}
