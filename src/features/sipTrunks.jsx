// Connect the number the company ALREADY has, at any phone provider, over a SIP trunk. Admins only; the server decides everything.
// The provider is told where to send the calls (a SIP address) and, for a password trunk, a username and a password that are shown ONCE.
import { useState } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import {
  Badge, Note, Field, Select, Dialog, ActionButton, Button, toast, useRun, Panel, PanelHead, Row,
} from '../components/index.js';

function CopyField({ label, value }) {
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); toast(`${label} copied.`); } catch { toast(`Copy this by hand: ${value}`, 'warn'); }
  };
  return (
    <Field label={label}>
      <span className="row"><input className="mono" readOnly value={value} onFocus={(e) => e.target.select()} /><Button className="btn btn--outline btn--small" onClick={copy}>Copy</Button></span>
    </Field>
  );
}

// What the company types into its provider. The password is present only when it was just made.
export function SettingsDialog({ trunk, title, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="stack">
        <CopyField label="Send calls to (SIP address)" value={trunk.sip_uri} />
        <CopyField label="Server" value={trunk.host} />
        <p className="muted">{`Port ${trunk.port}, UDP or TCP. Use the number exactly as shown, with the + and the country code. Audio: G.711 (PCMU or PCMA).`}</p>
        {trunk.auth_mode === 'password' ? (
          <>
            <CopyField label="Username" value={trunk.username} />
            {trunk.password ? (
              <>
                <CopyField label="Password" value={trunk.password} />
                <Note tone="warn" text="This password is shown only now. Copy it into your provider before you close this. If you lose it, make a new one." />
              </>
            ) : <p className="muted">The password was shown when you connected. If you lost it, choose "New password".</p>}
          </>
        ) : <p className="muted">{`Only calls from ${trunk.allowed_addresses.join(', ')} are accepted.`}</p>}
        <div className="dialog-actions"><Button className="btn btn--primary action" onClick={onClose}>Done</Button></div>
      </div>
    </Dialog>
  );
}

export function ConnectDialog({ onClose, onConnected }) {
  const [f, setF] = useState({ number: '', provider: '', mode: 'password', addresses: '' });
  const [problem, setProblem] = useState('');
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    setProblem('');
    run(async () => {
      const made = await api('/v1/sip-trunks', { method: 'POST', body: { phone_number: f.number.trim(), provider: f.provider.trim(), auth_mode: f.mode, allowed_addresses: f.addresses.trim() } });
      onConnected(made);
    }, (error) => setProblem(error.message));
  };
  return (
    <Dialog title="Connect a number you already have" onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <p className="muted">Use the number you already have at your phone provider. Your provider sends its calls to us over SIP, and your assistant answers them. You keep paying your provider as now.</p>
        <Field label="Your phone number" hint="With the + and country code."><input type="text" placeholder="+918012345678" autoComplete="off" required maxLength={20} {...bind('number')} /></Field>
        <Field label="Your phone provider"><input type="text" placeholder="e.g. Exotel, Twilio, Telnyx" maxLength={80} {...bind('provider')} /></Field>
        <Field label="How should your provider prove a call is yours?">
          <Select options={[['password', 'A username and password (we make them)'], ['ip', 'Only my provider addresses']]} {...bind('mode')} />
        </Field>
        <Field label="Provider addresses" hint="Required for the second option. For the first it adds protection if your provider has fixed addresses.">
          <textarea rows={3} maxLength={1000} placeholder="One or more, separated by commas: 52.1.2.3, 34.200.10.0/24" {...bind('addresses')} />
        </Field>
        {problem ? <Note tone="bad" text={problem} /> : null}
        <div className="dialog-actions"><button type="submit" className="btn btn--primary action" disabled={busy}>Connect this number</button></div>
      </form>
    </Dialog>
  );
}

function Confirm({ title, text, label, tone, action, onClose }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="stack">
        <p>{text}</p>
        <div className="dialog-actions">
          <ActionButton className={`btn ${tone === 'bad' ? 'btn--danger' : 'btn--primary'} action`} action={async () => { if ((await action()) !== 'keep') onClose(); }}>{label}</ActionButton>
          <Button className="btn agent-btn" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Dialog>
  );
}

function trunkStatus(t) {
  if (t.calls_total > 0) {
    return <Badge text={`Receiving · last ${timeAgo(t.last_call_at)}`} tone="good" />;
  }
  return <Badge text="Waiting for first call" tone="warn" />;
}

export function SipCard({ sip, reload }) {
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);
  return (
    <Panel className="sip-panel">
      <PanelHead
        title="A number you already have"
        subtitle="Connect a number you keep with your provider over SIP. Password credentials are shown once."
      />
      {sip.trunks.length ? (
        <div className="sip-list">
          {sip.trunks.map((t) => (
            <Row
              key={t.id}
              leading="☎"
              title={t.phone_number}
              subtitle={[t.provider || 'Provider', t.auth_mode === 'password' ? 'Password' : 'Provider addresses'].join(' · ')}
              trailing={(
                <span className="row wrap sip-actions">
                  {trunkStatus(t)}
                  <Button className="btn agent-btn" onClick={() => setDialog({ kind: 'settings', trunk: t })}>Settings</Button>
                  {t.auth_mode === 'password' ? (
                    <Button className="btn agent-btn" onClick={() => setDialog({ kind: 'password', trunk: t })}>New password</Button>
                  ) : null}
                  <Button className="btn agent-btn" onClick={() => setDialog({ kind: 'disconnect', trunk: t })}>Disconnect</Button>
                </span>
              )}
            />
          ))}
        </div>
      ) : <Note text="No number connected yet." />}
      {sip.can_connect ? (
        <div className="dialog-actions sip-connect">
          <Button className="btn btn--primary action" onClick={() => setDialog({ kind: 'connect' })}>Connect a number</Button>
        </div>
      ) : (
        <p className="muted">{`A company can connect ${sip.max_numbers} number${sip.max_numbers === 1 ? '' : 's'}. Disconnect one to connect a different one.`}</p>
      )}

      {dialog?.kind === 'connect' ? (
        <ConnectDialog
          onClose={close}
          onConnected={(made) => {
            reload();
            setDialog({ kind: 'created', trunk: made, title: 'Now enter this at your provider' });
          }}
        />
      ) : null}
      {dialog?.kind === 'created' ? <SettingsDialog trunk={dialog.trunk} title={dialog.title} onClose={close} /> : null}
      {dialog?.kind === 'settings' ? <SettingsDialog trunk={dialog.trunk} title="Settings for your provider" onClose={close} /> : null}
      {dialog?.kind === 'password' ? (
        <Confirm
          title="Make a new password"
          label="Make a new password"
          tone="good"
          onClose={close}
          text="The old password stops working at once, so calls fail until you enter the new one at your provider."
          action={async () => {
            const made = await api(`/v1/sip-trunks/${dialog.trunk.id}/new-password`, { method: 'POST' });
            reload();
            setDialog({ kind: 'created', trunk: made, title: 'Your new password' });
            return 'keep';
          }}
        />
      ) : null}
      {dialog?.kind === 'disconnect' ? (
        <Confirm
          title="Disconnect this number"
          label="Disconnect"
          tone="bad"
          onClose={close}
          text={`Calls to ${dialog.trunk.phone_number} stop reaching your assistant at once. Your number stays with your provider.`}
          action={async () => {
            await api(`/v1/sip-trunks/${dialog.trunk.id}`, { method: 'DELETE' });
            toast('Number disconnected.');
            reload();
          }}
        />
      ) : null}
    </Panel>
  );
}
