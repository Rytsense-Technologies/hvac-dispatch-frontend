// Users and technicians, on one page: who can sign in (admins to the console, technicians to the phone page) with the links that let them choose a password,
// and the technicians who can be sent (skills, areas, working days). One form adds a technician and their sign-in together.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, timeAgo, parseList, buildShifts, shiftProblems } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  Badge, Spinner, Empty, ErrorBox, Note, PageHeader, DataTable, Field, Select, Overlay, ActionButton, Button, toast, useRun, Card, Icon,
} from '../components/index.js';
import { ProblemsBox, ShiftFields, newShifts, readShifts, ContactDialog, ShiftsDialog, UnavailableDialog } from './technicians.jsx';

async function copyLink(url) {
  try { await navigator.clipboard.writeText(url); toast('The link is copied: send it to them.'); } catch { toast(`Send this link to them: ${url}`, 'warn'); }
}

// Shown once after a user is created or re-invited: an email was sent, or - if the server has no mailer
// configured - the one-time link itself, which only ever appears here.
function LinkResult({ emailSent, link, onDone }) {
  return (
    <div className="stack">
      {emailSent ? <Note text="An email with the one-time link is on its way." tone="good" /> : (
        <>
          <Note text="No email was sent. Copy this one-time link and pass it on yourself - it works once, for 24 hours." tone="warn" />
          <div className="row wrap">
            <input className="link-field" readOnly value={link} onFocus={(e) => e.target.select()} />
            <Button className="btn btn--outline" onClick={() => copyLink(link)}>Copy</Button>
          </div>
        </>
      )}
      <div className="right"><Button className="btn btn--primary" onClick={onDone}>Done</Button></div>
    </div>
  );
}

function AddAdminDialog({ onClose, reload }) {
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [result, setResult] = useState(null);
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      const out = await api('/v1/users', { method: 'POST', body: { role: 'admin', email: f.email.trim(), name: f.name.trim(), phone: f.phone.trim() || null } });
      setResult(out);
    });
  };
  const done = () => { onClose(); reload(); };
  return (
    <Overlay title="Add an admin" onClose={onClose}>
      {result ? <LinkResult emailSent={result.email_sent} link={result.link} onDone={done} /> : (
        <form className="stack" noValidate onSubmit={submit}>
          <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
          <Field label="Email" hint="Becomes their username"><input type="email" required maxLength={255} {...bind('email')} /></Field>
          <Field label="Phone" hint="Optional"><input type="text" maxLength={40} {...bind('phone')} /></Field>
          <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Add admin</button></div>
        </form>
      )}
    </Overlay>
  );
}

const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/;

// One form: the technician's details AND their sign-in. The technician is saved first; if the sign-in step then fails, pressing the button again only retries the sign-in.
function AddTechnicianDialog({ onClose, reload }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', lat: '', lon: '', skills: 'hvac', areas: '' });
  const [withLogin, setWithLogin] = useState(true);
  const [shifts, setShifts] = useState(newShifts);
  const [problems, setProblems] = useState([]);
  const [techId, setTechId] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const done = () => { onClose(); reload(); };

  const submit = (event) => {
    event.preventDefault();
    const lat = Number(f.lat);
    const lon = Number(f.lon);
    const found = techId ? [] : [
      ...(f.name.trim() ? [] : ["Enter the technician's name."]),
      ...(f.lat.trim() !== '' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? [] : ['Latitude must be a number between -90 and 90.']),
      ...(f.lon.trim() !== '' && Number.isFinite(lon) && lon >= -180 && lon <= 180 ? [] : ['Longitude must be a number between -180 and 180.']),
      ...(parseList(f.skills, true).length ? [] : ['Enter at least one skill.']),
      ...(parseList(f.areas).length ? [] : ['Enter at least one service area.']),
      ...shiftProblems(readShifts(shifts)),
    ];
    if (withLogin && !EMAIL_OK.test(f.email.trim())) found.push('Enter a valid email address: it is their sign-in username.');
    setProblems(found);
    if (found.length) return;
    run(async () => {
      let id = techId;
      if (!id) {
        const made = await api('/v1/dispatch/technicians', { method: 'POST', body: {
          name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, base_latitude: lat, base_longitude: lon,
          skills: parseList(f.skills, true), credentials: [], service_areas: parseList(f.areas), shifts: buildShifts(readShifts(shifts)),
        } });
        id = made.technician_id;
        setTechId(id);
        reload();                                         // the technician exists now, whatever happens to the sign-in step
      }
      if (!withLogin) { toast(`${f.name.trim()} added.`); onClose(); return; }
      setResult(await api('/v1/users', { method: 'POST', body: { role: 'technician', technician_id: id, email: f.email.trim(), name: f.name.trim(), phone: f.phone.trim() || null } }));
    });
  };

  return (
    <Overlay title="Add a technician" wide onClose={result ? done : onClose}>
      {result ? <LinkResult emailSent={result.email_sent} link={result.link} onDone={done} /> : (
        <form className="stack" noValidate onSubmit={submit}>
          {techId ? <Note text="The technician is saved. Only the sign-in is left: press the button to try it again." tone="warn" /> : null}
          <div className="grid2">
            <Field label="Name"><input type="text" disabled={!!techId} {...bind('name')} /></Field>
            <Field label="Phone" hint="Texted when a job is booked for them"><input type="text" disabled={!!techId} {...bind('phone')} /></Field>
            <Field label="Email" hint="Their sign-in username, and the Google account their calendar of visits is shared with"><input type="email" disabled={!!techId} {...bind('email')} /></Field>
            <Field label="Skills" hint="Comma separated, e.g. hvac, plumbing"><input type="text" disabled={!!techId} {...bind('skills')} /></Field>
            <Field label="Home or depot latitude" hint="Where their day starts and ends"><input type="text" inputMode="decimal" disabled={!!techId} {...bind('lat')} /></Field>
            <Field label="Home or depot longitude"><input type="text" inputMode="decimal" disabled={!!techId} {...bind('lon')} /></Field>
            <Field label="Service areas" hint="Comma separated codes from your company file, e.g. SC"><input type="text" disabled={!!techId} {...bind('areas')} /></Field>
          </div>
          {techId ? null : <ShiftFields value={shifts} onChange={setShifts} />}
          <label className="check">
            <input type="checkbox" checked={withLogin} onChange={(e) => setWithLogin(e.target.checked)} />
            Also create their sign-in (they are emailed a one-time link to choose a password; no password is ever sent)
          </label>
          <ProblemsBox list={problems} />
          <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>{techId ? 'Create the sign-in' : 'Add technician'}</button></div>
        </form>
      )}
    </Overlay>
  );
}

// A technician who was added without a sign-in (or before this page existed) gets one here.
function TechnicianLoginDialog({ tech, onClose, reload }) {
  const [f, setF] = useState({ name: tech.name || '', email: tech.email || '', phone: tech.phone || '' });
  const [result, setResult] = useState(null);
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const done = () => { onClose(); reload(); };
  const submit = (event) => {
    event.preventDefault();
    if (!EMAIL_OK.test(f.email.trim())) { toast('Enter a valid email address: it is their sign-in username.', 'warn'); return; }
    run(async () => {
      setResult(await api('/v1/users', { method: 'POST', body: { role: 'technician', technician_id: tech.id, email: f.email.trim(), name: f.name.trim(), phone: f.phone.trim() || null } }));
    });
  };
  return (
    <Overlay title={`Create a sign-in: ${tech.name}`} onClose={result ? done : onClose}>
      {result ? <LinkResult emailSent={result.email_sent} link={result.link} onDone={done} /> : (
        <form className="stack" noValidate onSubmit={submit}>
          <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
          <Field label="Email" hint="Becomes their username"><input type="email" required maxLength={255} {...bind('email')} /></Field>
          <Field label="Phone" hint="Optional"><input type="text" maxLength={40} {...bind('phone')} /></Field>
          <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Create the sign-in</button></div>
        </form>
      )}
    </Overlay>
  );
}

function EditDialog({ user, onClose, reload }) {
  const [f, setF] = useState({ name: user.name || '', phone: user.phone || '', role: user.role });
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      await api(`/v1/users/${user.id}`, { method: 'PATCH', body: { name: f.name.trim(), phone: f.phone.trim() || null, role: f.role } });
      toast('Saved.');
      onClose();
      reload();
    });
  };
  return (
    <Overlay title={`Edit: ${user.name || user.email}`} onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
        <Field label="Phone" hint="Optional"><input type="text" maxLength={40} {...bind('phone')} /></Field>
        <Field label="Role"><Select options={[['admin', 'Admin'], ['technician', 'Technician']]} {...bind('role')} /></Field>
        {f.role !== user.role ? <Note text="Changing the role does not change which technician record this login is linked to." tone="warn" /> : null}
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Save</button></div>
      </form>
    </Overlay>
  );
}

// Signs the person out and sends a fresh one-time link - asked for up front since it's immediate and cannot be undone from here.
function ResetPasswordDialog({ user, onClose, reload }) {
  const go = async () => {
    await api(`/v1/users/${user.id}/reset-password`, { method: 'POST' });
    toast('They are signed out, and a reset link is on its way.');
    onClose();
    reload();
  };
  return (
    <Overlay title="Reset their password" onClose={onClose}>
      <div className="stack">
        <p>{`${user.name || user.email} will be signed out right away, and a new one-time link is sent. This cannot be undone.`}</p>
        <div className="right"><ActionButton className="btn btn--primary" action={go}>Reset password</ActionButton></div>
      </div>
    </Overlay>
  );
}

const STATUS_TONE = { active: 'good', disabled: 'bad' };

export default function Users() {
  const [state, setState] = useState({ status: 'loading' });
  const [techs, setTechs] = useState({ status: 'loading' });
  const [dialog, setDialog] = useState(null);
  const seq = useRef(0);
  const techSeq = useRef(0);

  const load = async () => {
    seq.current += 1;
    const mine = seq.current;
    setState((s) => ({ status: 'loading', list: s.list }));
    try {
      const { users: list } = await api('/v1/users');
      if (mine === seq.current) setState({ status: 'ready', list });
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', error });
    }
  };
  const loadTechs = async () => {
    techSeq.current += 1;
    const mine = techSeq.current;
    setTechs((s) => ({ status: 'loading', list: s.list }));
    try {
      const { technicians: list } = await api('/v1/dispatch/technicians');
      if (mine === techSeq.current) setTechs({ status: 'ready', list });
    } catch (error) {
      if (mine === techSeq.current) setTechs({ status: 'error', error });
    }
  };
  const reloadAll = () => { load(); loadTechs(); };
  useEffect(() => { load(); loadTechs(); return () => { seq.current += 1; techSeq.current += 1; }; }, []);

  const toggle = (user) => async () => {
    await api(`/v1/users/${user.id}/${user.status === 'active' ? 'disable' : 'enable'}`, { method: 'POST' });
    toast(user.status === 'active' ? `${user.name || user.email} is disabled.` : `${user.name || user.email} can sign in again.`);
    load();
  };
  const invite = (user) => async () => {
    await api(`/v1/users/${user.id}/invite`, { method: 'POST' });
    toast('Invitation sent.');
  };

  let body;
  if (state.status === 'loading' && !state.list) body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (!state.list.length) body = <Empty text="No one else can sign in yet. Add an admin or a technician to get started." />;
  else {
    body = (
      <DataTable head={['Name', 'Email', 'Role', 'Status', 'Last signed in', '']} rows={state.list.map((u) => [
        u.name || '-',
        u.email,
        <Badge text={u.role} tone={u.role === 'admin' ? 'info' : 'neutral'} />,
        <span className="row wrap">
          <Badge text={u.status} tone={STATUS_TONE[u.status] || 'neutral'} />
          {u.locked ? <Badge text="Locked" tone="bad" /> : null}
        </span>,
        u.last_login_at ? <span title={formatDateTime(u.last_login_at)}>{timeAgo(u.last_login_at)}</span> : 'Never',
        <span className="row wrap">
          <button type="button" className="btn btn--outline btn--small" onClick={() => setDialog({ kind: 'edit', user: u })}>Edit</button>
          {u.status === 'invited' ? <ActionButton className="btn btn--outline btn--small" action={invite(u)}>Invite</ActionButton> : null}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setDialog({ kind: 'reset', user: u })}>Reset password</button>
          <ActionButton className="btn btn--ghost btn--small" action={toggle(u)}>{u.status === 'active' ? 'Disable' : 'Enable'}</ActionButton>
        </span>,
      ])} />
    );
  }

  // The technicians who can be sent, with whether each can sign in (the person on the users list whose technician_id is theirs).
  const loginOf = (techId) => (state.list || []).find((u) => u.technician_id === techId);
  let techBody;
  if (techs.status === 'loading' && !techs.list) techBody = <Spinner />;
  else if (techs.status === 'error') techBody = <ErrorBox error={techs.error} />;
  else if (!techs.list.length) techBody = <Empty text="No technicians yet. Add the first one to start scheduling." />;
  else {
    techBody = (
      <DataTable head={['Name', 'Status', 'Sign-in', 'Skills', 'Areas', 'Upcoming shift days', '']} rows={techs.list.map((t) => {
        const login = loginOf(t.id);
        return [
          <span>
            <strong>{t.name}</strong>
            {t.phone ? <small className="block muted">{t.phone}</small> : null}
            {t.email ? <small className="block muted">{`${t.email}${t.has_calendar ? ' (calendar shared)' : ''}`}</small> : null}
          </span>,
          <Badge text={t.available ? 'Available' : 'Unavailable'} tone={t.available ? 'good' : 'bad'} />,
          login ? <Badge text={login.status} tone={STATUS_TONE[login.status] || 'neutral'} />
            : (can('admin') ? <button type="button" className="btn btn--outline btn--small" onClick={() => setDialog({ kind: 'techLogin', tech: t })}>Create sign-in</button> : '-'),
          <span className="row wrap">{t.skills.map((s, i) => <Badge key={i} text={s} tone="info" />)}</span>,
          t.service_areas.join(', ') || '-',
          t.shift_dates.length ? `${t.shift_dates.length} (next ${t.shift_dates[0]})` : 'None',
          <span className="row">
            {can('admin') ? <button type="button" className="btn btn--outline btn--small" onClick={() => setDialog({ kind: 'contact', tech: t })}>Contact</button> : null}
            {can('admin') ? <button type="button" className="btn btn--outline btn--small" onClick={() => setDialog({ kind: 'shifts', tech: t })}>Set shifts</button> : null}
            {can('dispatcher', 'admin') ? <button type="button" className="btn btn--ghost btn--small" onClick={() => setDialog({ kind: 'unavailable', tech: t })}>Mark unavailable</button> : null}
          </span>,
        ];
      })} />
    );
  }

  const close = () => setDialog(null);
  return (
    <>
      <PageHeader title="Users" subtitle="Who can sign in, and the technicians who can be sent: their skills, areas and working days.">
        <Button className="btn btn--outline" onClick={() => setDialog({ kind: 'addTechnician' })}>Add technician</Button>
        <Button className="btn btn--primary" onClick={() => setDialog({ kind: 'addAdmin' })}>Add admin</Button>
      </PageHeader>
      <Card as="section">
        <Card.Title><span className="row"><Icon name="users" /><span>Users</span></span></Card.Title>
        {body}
      </Card>
      <Card as="section">
        <Card.Title><span className="row"><Icon name="technicians" /><span>Technicians</span></span></Card.Title>
        {techBody}
      </Card>
      {dialog?.kind === 'addAdmin' ? <AddAdminDialog onClose={close} reload={load} /> : null}
      {dialog?.kind === 'addTechnician' ? <AddTechnicianDialog onClose={close} reload={reloadAll} /> : null}
      {dialog?.kind === 'techLogin' ? <TechnicianLoginDialog tech={dialog.tech} onClose={close} reload={reloadAll} /> : null}
      {dialog?.kind === 'edit' ? <EditDialog user={dialog.user} onClose={close} reload={load} /> : null}
      {dialog?.kind === 'reset' ? <ResetPasswordDialog user={dialog.user} onClose={close} reload={load} /> : null}
      {dialog?.kind === 'contact' ? <ContactDialog tech={dialog.tech} reload={loadTechs} onClose={close} /> : null}
      {dialog?.kind === 'shifts' ? <ShiftsDialog tech={dialog.tech} reload={loadTechs} onClose={close} /> : null}
      {dialog?.kind === 'unavailable' ? <UnavailableDialog tech={dialog.tech} reload={loadTechs} onClose={close} /> : null}
    </>
  );
}
