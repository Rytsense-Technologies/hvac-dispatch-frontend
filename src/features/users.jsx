// Users: who can sign in - admins to the console, technicians to the phone page - and the links that let
// them choose a password. See FRONTEND_LOGIN.md for the two-step technician flow this mirrors.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, timeAgo } from '../lib/format.js';
import {
  Badge, Spinner, Empty, ErrorBox, Note, PageHeader, DataTable, Field, Select, Overlay, ActionButton, Button, toast, useRun, Card, Icon,
} from '../components/index.js';

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

function AddTechnicianLoginDialog({ onClose, reload, users }) {
  const [state, setState] = useState({ status: 'loading' });
  const [techId, setTechId] = useState('');
  const [f, setF] = useState({ name: '', email: '', phone: '' });
  const [result, setResult] = useState(null);
  const [busy, run] = useRun();

  useEffect(() => {
    api('/v1/dispatch/technicians').then(({ technicians }) => {
      const taken = new Set(users.map((u) => u.technician_id).filter(Boolean));
      setState({ status: 'ready', list: technicians.filter((t) => !taken.has(t.id)) });
    }).catch((error) => setState({ status: 'error', error }));
  }, [users]);

  const choose = (id) => {
    setTechId(id);
    const t = (state.list || []).find((x) => x.id === id);
    setF({ name: t?.name || '', email: t?.email || '', phone: t?.phone || '' });
  };
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });

  const submit = (event) => {
    event.preventDefault();
    if (!techId) { toast('Choose a technician first.', 'warn'); return; }
    run(async () => {
      const out = await api('/v1/users', { method: 'POST', body: { role: 'technician', technician_id: techId, email: f.email.trim(), name: f.name.trim(), phone: f.phone.trim() || null } });
      setResult(out);
    });
  };
  const done = () => { onClose(); reload(); };

  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (!state.list.length) body = <Note text="Every technician already has a login. Add the technician's record first, on the Technicians page, if you need another." tone="neutral" />;
  else {
    body = (
      <form className="stack" noValidate onSubmit={submit}>
        <Field label="Technician" hint="One technician has one login">
          <Select options={[['', 'Choose one…'], ...state.list.map((t) => [t.id, t.name])]} value={techId} onChange={(e) => choose(e.target.value)} />
        </Field>
        {techId ? (
          <>
            <Field label="Email" hint="Becomes their username"><input type="email" required maxLength={255} {...bind('email')} /></Field>
            <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
            <Field label="Phone" hint="Optional"><input type="text" maxLength={40} {...bind('phone')} /></Field>
          </>
        ) : null}
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy || !techId}>Add technician login</button></div>
      </form>
    );
  }

  return <Overlay title="Add a technician login" onClose={onClose}>{result ? <LinkResult emailSent={result.email_sent} link={result.link} onDone={done} /> : body}</Overlay>;
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
  const [dialog, setDialog] = useState(null);
  const seq = useRef(0);

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
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

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
  else if (!state.list.length) body = <Empty text="No one else can sign in yet. Add an admin or a technician login to get started." />;
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
          <ActionButton className="btn btn--outline btn--small" action={invite(u)}>Invite</ActionButton>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => setDialog({ kind: 'reset', user: u })}>Reset password</button>
          <ActionButton className="btn btn--ghost btn--small" action={toggle(u)}>{u.status === 'active' ? 'Disable' : 'Enable'}</ActionButton>
        </span>,
      ])} />
    );
  }

  const close = () => setDialog(null);
  return (
    <>
      <PageHeader title="Users" subtitle="Who can sign in: admins to this console, technicians to the phone page.">
        <Button className="btn btn--outline" onClick={() => setDialog({ kind: 'addTechnician' })}>Add technician login</Button>
        <Button className="btn btn--primary" onClick={() => setDialog({ kind: 'addAdmin' })}>Add admin</Button>
      </PageHeader>
      <Card as="section">
        <Card.Title><span className="row"><Icon name="users" /><span>Users</span></span></Card.Title>
        {body}
      </Card>
      {dialog?.kind === 'addAdmin' ? <AddAdminDialog onClose={close} reload={load} /> : null}
      {dialog?.kind === 'addTechnician' ? <AddTechnicianLoginDialog onClose={close} reload={load} users={state.list || []} /> : null}
      {dialog?.kind === 'edit' ? <EditDialog user={dialog.user} onClose={close} reload={load} /> : null}
      {dialog?.kind === 'reset' ? <ResetPasswordDialog user={dialog.user} onClose={close} reload={load} /> : null}
    </>
  );
}
