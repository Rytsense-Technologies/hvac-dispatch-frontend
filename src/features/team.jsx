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
import {
  ContactDialog, ShiftsDialog, TimeOffDialog,
} from './technicians.jsx';
import {
  AddAdminDialog, AddTechnicianDialog, EditDialog,
  TechnicianLoginDialog, ResetPasswordDialog,
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
  time_off: 'neutral', unavailable: 'neutral', off_duty: 'neutral', not_on_shift: 'neutral',
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
        subtitle="Job-time updates reported from the technician view"
      >
        <Badge text={`${count} update${count === 1 ? '' : 's'}`} tone={count ? 'warn' : 'good'} />
      </PanelHead>
      {state.status === 'loading' ? <Spinner /> : null}
      {state.status === 'error' ? <ErrorBox error={state.error} /> : null}
      {state.status === 'ready' && !count ? (
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
      {state.status === 'ready' ? (
        <p className="sample-label">Extensions come from the team extensions API. Other appointments keep their original times until reviewed.</p>
      ) : null}
    </Panel>
  );
}

function PeopleTab({
  active, canManageUsers, canSchedule, onEditRole, onResetPassword, onCreateSignIn,
  onContact, onShifts, onTimeOff,
}) {
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
          {canManageUsers ? (
            <a className="btn btn--secondary agent-btn" href="/team/users">Manage accounts</a>
          ) : null}
        </PanelHead>
        {people.length ? people.map((person) => {
          const statusLabel = person.status?.label || person.availability || person.status || '—';
          const statusCode = person.status?.code || person.status;
          const statusDetail = person.status?.detail;
          const tech = personTech(person);
          const user = personUser(person);
          return (
            <div className="row-item team-person-row" key={person.id || person.email || person.name}>
              <span className="circle">{initials(person.name)}</span>
              <span className="rowmain">
                <strong>{person.name}</strong>
                <small className="muted">{personSubtitle(person)}</small>
                {statusDetail ? <small className="muted team-status-detail">{statusDetail}</small> : null}
              </span>
              <Badge text={statusLabel} tone={toneFor(statusCode)} />
              <div className="team-person-actions">
                {user && canManageUsers ? (
                  <>
                    <Button
                      className="btn btn--secondary agent-btn"
                      onClick={() => onEditRole(user)}
                    >
                      Edit role
                    </Button>
                    <Button
                      className="btn btn--secondary agent-btn"
                      onClick={() => onResetPassword(user)}
                    >
                      Reset password
                    </Button>
                  </>
                ) : null}
                {!user && tech && canManageUsers ? (
                  <Button
                    className="btn btn--secondary agent-btn"
                    onClick={() => onCreateSignIn(tech)}
                  >
                    Create sign-in
                  </Button>
                ) : null}
                {!user && !tech && canManageUsers ? (
                  <Button
                    className="btn btn--secondary agent-btn"
                    disabled
                    title="Needs a technician record or sign-in account first"
                    onClick={() => toast('Add this person as a technician or admin first.', 'warn')}
                  >
                    Edit role
                  </Button>
                ) : null}
                {tech && canManageUsers ? (
                  <>
                    <Button
                      className="btn btn--secondary agent-btn"
                      aria-label={`Update contact for ${person.name}`}
                      onClick={() => onContact(tech)}
                    >
                      Contact
                    </Button>
                    <Button
                      className="btn btn--secondary agent-btn"
                      aria-label={`Set shifts for ${person.name}`}
                      onClick={() => onShifts(tech)}
                    >
                      Set shifts
                    </Button>
                  </>
                ) : null}
                {tech && canSchedule ? (
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
        Adding people, creating sign-ins, editing roles, contact, shifts, and time off use your live account and dispatch APIs. Full account list is under Manage accounts. The extensions panel lists job-time updates from the technician view.
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
  const canSchedule = can('dispatcher', 'admin');

  // Refresh the People list without unmounting an open dialog (AddTechnician
  // reloads after creating the tech record, before the optional sign-in step).
  const refreshPeople = () => setPeopleTick((n) => n + 1);
  const closeDialog = () => setDialog(null);

  let body;
  if (!allowed && tab !== 'roles') {
    body = <Forbidden />;
  } else if (tab === 'tracking') {
    body = <TeamTracking active onBack={() => setTab('people')} />;
  } else if (tab === 'roles') {
    body = (
      <RolesTab
        active
        onReview={(role) => setDialog({ kind: 'role', role })}
      />
    );
  } else if (tab === 'people') {
    body = (
      <PeopleTab
        key={peopleTick}
        active
        canManageUsers={canManageUsers}
        canSchedule={canSchedule}
        onEditRole={(user) => setDialog({ kind: 'edit', user })}
        onResetPassword={(user) => setDialog({ kind: 'reset', user })}
        onCreateSignIn={(tech) => setDialog({ kind: 'techLogin', tech })}
        onContact={(tech) => setDialog({ kind: 'contact', tech })}
        onShifts={(tech) => setDialog({ kind: 'shifts', tech })}
        onTimeOff={(tech) => setDialog({ kind: 'timeoff', tech })}
      />
    );
  } else if (tab === 'availability') {
    body = <AvailabilityTab active />;
  } else {
    body = null;
  }

  // Tracking is a nested full-page view (no Team chrome) once allowed.
  if (tab === 'tracking' && allowed) {
    return body;
  }

  return (
    <div className="team-page">
      <PageHeader
        eyebrow="PEOPLE & OPERATIONS"
        title="Team & dispatch"
        subtitle="Manage your team, their access, and their schedule."
      >
        {canManageUsers ? (
          <>
            <a className="btn btn--secondary agent-btn" href="/team/users">Manage accounts</a>
            <Button className="btn btn--primary action" onClick={() => setDialog({ kind: 'add' })}>
              + Add team member
            </Button>
          </>
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
          onClose={closeDialog}
          onPick={(kind) => setDialog({ kind: kind === 'admin' ? 'addAdmin' : 'addTech' })}
        />
      ) : null}
      {dialog?.kind === 'addAdmin' ? <AddAdminDialog onClose={closeDialog} reload={refreshPeople} /> : null}
      {dialog?.kind === 'addTech' ? <AddTechnicianDialog onClose={closeDialog} reload={refreshPeople} /> : null}
      {dialog?.kind === 'techLogin' ? (
        <TechnicianLoginDialog tech={dialog.tech} onClose={closeDialog} reload={refreshPeople} />
      ) : null}
      {dialog?.kind === 'edit' ? <EditDialog user={dialog.user} onClose={closeDialog} reload={refreshPeople} /> : null}
      {dialog?.kind === 'reset' ? (
        <ResetPasswordDialog user={dialog.user} onClose={closeDialog} reload={refreshPeople} />
      ) : null}
      {dialog?.kind === 'contact' ? (
        <ContactDialog tech={dialog.tech} reload={refreshPeople} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === 'shifts' ? (
        <ShiftsDialog tech={dialog.tech} reload={refreshPeople} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === 'timeoff' ? (
        <TimeOffDialog tech={dialog.tech} reload={refreshPeople} onClose={closeDialog} />
      ) : null}
      {dialog?.kind === 'role' ? <RoleReviewDialog role={dialog.role} onClose={closeDialog} /> : null}
    </div>
  );
}
