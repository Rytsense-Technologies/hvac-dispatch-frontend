// Settings: reference-aligned workspace rows + Billing, Integrations, Admin automation panels.
// Live profile/hours/Jobber/billing APIs stay wired behind View / Set up / Manage dialogs.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Dialog, Empty, ErrorBox, Field, Note,
  PageHeader, Panel, PanelHead, Row, Select, Spinner, toast, useRun,
} from '../components/index.js';

const DAY_CODES = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120].map((n) => [n, `${n} minutes`]);
const ST_RECORDS = [['customers', 'Customers'], ['jobs_appointments', 'Jobs & appointments'], ['team_availability', 'Team availability']];
const SAMPLE_ROWS = [
  ['profile', 'Business profile', 'Comfort Home Services · Austin, Texas'],
  ['hours', 'Business hours', 'Monday–Friday · 8:00 AM–5:00 PM'],
  ['notifications', 'Notifications', 'Example email notifications'],
  ['connected', 'Connected systems', 'No systems connected'],
  ['team', 'Team access', '3 sample members'],
];

function sameValue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function holidaysToText(list) { return (list || []).join('\n'); }
function textToHolidays(text) { return [...new Set(String(text || '').split('\n').map((s) => s.trim()).filter(Boolean))]; }

function formatHoursSummary(values) {
  if (!values) return null;
  const days = values.days || [];
  const weekday = ['mon', 'tue', 'wed', 'thu', 'fri'].every((d) => days.includes(d))
    && !days.includes('sat') && !days.includes('sun');
  const dayLabel = weekday
    ? 'Monday–Friday'
    : (days.map((d) => (DAY_CODES.find(([c]) => c === d) || [d, d])[1]).join(', ') || 'Custom days');
  const open = values.open || '08:00';
  const close = values.close || '17:00';
  const pretty = (t) => {
    const [h, m] = String(t).split(':').map(Number);
    if (Number.isNaN(h)) return t;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(m || 0).padStart(2, '0')} ${ampm}`;
  };
  return `${dayLabel} · ${pretty(open)}–${pretty(close)}`;
}

function settingsRowsFromData(data) {
  if (!data) return SAMPLE_ROWS.map(([id, title, subtitle]) => ({ id, title, subtitle }));
  const profile = data.profile;
  const profileSub = [profile?.name, profile?.city || profile?.location || profile?.name_in_texts]
    .filter(Boolean).join(' · ') || profile?.text || SAMPLE_ROWS[0][2];
  const hoursSub = formatHoursSummary(data.hours?.values) || data.hours?.text || SAMPLE_ROWS[1][2];
  const notif = data.notifications;
  const notifSub = notif?.items?.length
    ? `${notif.items.filter((n) => n.on).length} of ${notif.items.length} on · ${notif.email_ready ? 'Email ready' : 'Email not set up'}`
    : (notif?.text || SAMPLE_ROWS[2][2]);
  const connected = data.connected;
  const connectedCount = connected?.items?.filter((c) => c.connected)?.length || 0;
  const connectedSub = connected?.items?.length
    ? (connectedCount ? `${connectedCount} connected` : 'No systems connected')
    : (connected?.text || SAMPLE_ROWS[3][2]);
  const team = data.team;
  const teamCount = team?.total ?? (team?.by_role ? Object.values(team.by_role).reduce((a, b) => a + Number(b || 0), 0) : null);
  const teamSub = teamCount != null
    ? `${teamCount} ${teamCount === 1 ? 'member' : 'members'}`
    : (team?.text || SAMPLE_ROWS[4][2]);
  return [
    { id: 'profile', title: 'Business profile', subtitle: profileSub },
    { id: 'hours', title: 'Business hours', subtitle: hoursSub },
    { id: 'notifications', title: 'Notifications', subtitle: notifSub },
    { id: 'connected', title: 'Connected systems', subtitle: connectedSub },
    { id: 'team', title: 'Team access', subtitle: teamSub },
  ];
}

// ---------- Profile / hours editors (dialogs) ----------

function ProfileEditor({ profile, onSaved, onClose }) {
  const [name, setName] = useState(profile?.name || '');
  const [busy, run] = useRun();
  const writer = can('admin');
  const dirty = name.trim() !== (profile?.name || '') && name.trim().length >= 2 && name.trim().length <= 120;
  const save = () => run(async () => {
    const out = await api('/v1/settings/profile', { method: 'PATCH', body: { name: name.trim() } });
    toast('Saved.');
    onSaved?.(out);
    onClose?.();
  });
  return (
    <div className="stack">
      <p className="sample-label">Preview only. No live settings or integration are connected.</p>
      <Field label="Company name" hint="2–120 characters.">
        <input type="text" minLength={2} maxLength={120} disabled={!writer || busy} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Name used in texts"><input type="text" disabled value={profile?.name_in_texts || '-'} /></Field>
      {profile?.text ? <p className="sub">{profile.text}</p> : null}
      <div className="dialog-actions">
        {writer ? <ActionButton className="btn btn--primary action" disabled={!dirty} action={save}>Save</ActionButton> : null}
        <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}

function HoursEditor({ onClose }) {
  const [state, setState] = useState({ status: 'loading' });
  const [form, setForm] = useState(null);
  const [holidaysText, setHolidaysText] = useState('');
  const [busy, run] = useRun();
  const writer = can('admin');
  const seq = useRef(0);

  useEffect(() => {
    seq.current += 1;
    const mine = seq.current;
    (async () => {
      try {
        const data = await api('/v1/settings/hours');
        if (mine !== seq.current) return;
        setState({ status: 'ready', data });
        setForm(data.values);
        setHolidaysText(holidaysToText(data.values.holidays));
      } catch (error) {
        if (mine === seq.current) setState({ status: 'error', error });
      }
    })();
    return () => { seq.current += 1; };
  }, []);

  if (state.status === 'loading') return <Spinner />;
  if (state.status === 'error') {
    return (
      <div className="stack">
        <p>Monday–Friday · 8:00 AM–5:00 PM</p>
        <p className="sample-label">Preview only. Hours could not be loaded from the server.</p>
        <div className="dialog-actions"><Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button></div>
      </div>
    );
  }

  const { data } = state;
  const overridden = data.overridden || [];
  const overrideHint = (field, base) => (overridden.includes(field) ? `${base ? `${base} ` : ''}(changed from default: ${data.server[field] ?? ''})` : base);
  const nextValues = form ? { ...form, holidays: textToHolidays(holidaysText) } : null;
  const changed = form ? Object.fromEntries(Object.entries(nextValues).filter(([key, value]) => !sameValue(value, data.values[key]))) : {};
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = (event) => {
    event.preventDefault();
    if (!Object.keys(changed).length) return;
    run(async () => {
      const out = await api('/v1/settings/hours', { method: 'PATCH', body: changed });
      toast('Saved.');
      setState({ status: 'ready', data: out });
      setForm(out.values);
      setHolidaysText(holidaysToText(out.values.holidays));
    });
  };

  return (
    <form className="stack" noValidate onSubmit={save}>
      <p className="sub">{data.text || formatHoursSummary(form)}</p>
      <div className="field">
        <span className="label">Days open</span>
        <div className="row wrap">
          {DAY_CODES.map(([code, label]) => (
            <label key={code} className="check">
              <input
                type="checkbox"
                disabled={!writer || busy}
                checked={form.days.includes(code)}
                onChange={(e) => set('days')(e.target.checked ? [...form.days, code] : form.days.filter((d) => d !== code))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
      <div className="grid2">
        <Field label="Opens" hint={overrideHint('open')}><input type="time" disabled={!writer || busy} value={form.open} onChange={(e) => set('open')(e.target.value)} /></Field>
        <Field label="Closes" hint={overrideHint('close')}><input type="time" disabled={!writer || busy} value={form.close} onChange={(e) => set('close')(e.target.value)} /></Field>
        <Field label="Slot length" hint={overrideHint('slot_minutes')}>
          <Select options={SLOT_MINUTES} disabled={!writer || busy} value={form.slot_minutes} onChange={(e) => set('slot_minutes')(Number(e.target.value))} />
        </Field>
        <Field label="Timezone" hint={overrideHint('timezone')}>
          <input type="text" disabled={!writer || busy} value={form.timezone} onChange={(e) => set('timezone')(e.target.value)} />
        </Field>
      </div>
      <Field label="Holidays" hint={overrideHint('holidays', 'One YYYY-MM-DD per line')}>
        <textarea rows={3} disabled={!writer || busy} value={holidaysText} onChange={(e) => setHolidaysText(e.target.value)} />
      </Field>
      <div className="dialog-actions">
        {writer ? <button type="submit" className="btn btn--primary action" disabled={busy || !Object.keys(changed).length}>Save</button> : null}
        <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
      </div>
    </form>
  );
}

function SimpleListDialog({ title, text, items, columns, empty, onClose, extra }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="stack">
        {text ? <p className="sub">{text}</p> : null}
        {items?.length ? (
          <DataTable label={title} head={columns} rows={items} />
        ) : <p className="sub empty-inline">{empty}</p>}
        {extra}
        <p className="sample-label">Preview only. No live settings or integration are connected.</p>
        <div className="dialog-actions">
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------- Billing dialog ----------

function BillingDialog({ billing, onClose }) {
  const planName = billing?.plan?.name || billing?.plan?.text || 'Professional';
  const planLabel = String(planName).includes('Example') ? planName : `${planName} · Example plan`;
  return (
    <Dialog title="Billing & payments" onClose={onClose} wide>
      <div className="stack">
        <div className="filters" role="presentation">
          <span className="badge badge--neutral">Subscription</span>
          <span className="badge badge--neutral">Payment method</span>
          <span className="badge badge--neutral">Invoices</span>
        </div>
        <h3>{planLabel}</h3>
        <p className="sub">Recurring charges, usage, taxes, and plan pricing will be shown after a billing provider is connected.</p>
        {billing?.plan ? (
          <p className="sub">
            {billing.plan.included_minutes != null ? `${billing.plan.included_minutes} minutes included` : null}
            {billing.plan.monthly_fee ? ` · ${billing.plan.monthly_fee} / month` : null}
          </p>
        ) : null}
        <Row
          title="Payment method"
          subtitle={billing?.provider?.connected ? `${billing.provider.name} connected` : 'No card saved'}
          trailing={<Button className="btn btn--secondary agent-btn" onClick={() => toast('Payment setup is not connected in this preview.', 'warn')}>Add payment method</Button>}
        />
        <Row
          title="Billing email"
          subtitle={billing?.email || billing?.subscription?.email || 'Not set'}
          trailing={<span className="sub">Edit in Usage</span>}
        />
        <Row title="Invoices" subtitle="No invoices yet. Receipts will appear after actual billing begins." />
        <div className="dialog-actions">
          <a className="btn btn--secondary agent-btn" href="#/usage">Open usage &amp; statement</a>
          {billing?.manage?.action === 'authorise' && billing.manage.url ? (
            <a className="btn btn--primary action" href={billing.manage.url} target="_blank" rel="noopener noreferrer">Authorise billing</a>
          ) : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
        <p className="sample-label">Design concept only. No charges, payment methods, or subscriptions are created.</p>
      </div>
    </Dialog>
  );
}

// ---------- Integrations ----------

function JobberSetupDialog({ item, onClose, onChanged }) {
  const [data, setData] = useState(item);
  const writer = can('admin');
  const refresh = async () => {
    try {
      const next = await api('/v1/jobber/status');
      setData(next);
      onChanged?.(next);
    } catch { /* keep current */ }
  };
  const connect = async () => {
    const out = await api('/v1/jobber/connect', { method: 'POST' });
    if (out?.url) {
      window.open(out.url, '_blank', 'noopener');
      toast('Finish signing in to Jobber in the new tab.');
    }
    await refresh();
  };
  const sync = async () => { await api('/v1/jobber/sync', { method: 'POST' }); toast('Sync started.'); await refresh(); };
  const disconnect = async () => { await api('/v1/jobber/disconnect', { method: 'POST' }); toast('Jobber disconnected.'); await refresh(); };

  return (
    <Dialog title="Jobber integration" onClose={onClose}>
      <div className="stack">
        <p>Connect your business account through a supported provider integration. Access, API availability, and supported records must be verified for your account.</p>
        <p className="sub">{data?.detail || 'Supported data and permissions to be confirmed with the provider.'}</p>
        {data?.state === 'connected' ? (
          <Details rows={[
            ['Account', data.account_name || '-'],
            ['Connected since', data.connected_since ? formatDateTime(data.connected_since) : '-'],
            ['Last synced', data.last_synced_at ? formatDateTime(data.last_synced_at) : '-'],
          ]} />
        ) : null}
        <div className="dialog-actions">
          {writer && data?.available && (data.state === 'not_connected' || data.state === 'needs_login') ? (
            <ActionButton className="btn btn--primary action" action={connect}>Connect Jobber</ActionButton>
          ) : null}
          {writer && data?.state === 'connected' ? <ActionButton className="btn btn--secondary agent-btn" action={sync}>Sync now</ActionButton> : null}
          {writer && data?.state === 'connected' ? <ActionButton className="btn btn--ghost" action={disconnect}>Disconnect</ActionButton> : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
        <p className="sample-label">Connection previews only when the provider is unavailable. Live Jobber connect uses your company credentials.</p>
      </div>
    </Dialog>
  );
}

function ServiceTitanSetupDialog({ item, onClose }) {
  const [records, setRecords] = useState(item?.plan?.records || []);
  const [preference, setPreference] = useState(item?.plan?.update_preference || 'review_before_sync');
  const [busy, run] = useRun();
  const writer = can('admin');

  const save = () => run(async () => {
    await api('/v1/settings/integrations/servicetitan/plan', { method: 'PUT', body: { records, update_preference: preference } });
    toast('Saved. This only records what you want — it does not connect anything.');
    onClose?.();
  });

  return (
    <Dialog title="ServiceTitan integration" onClose={onClose}>
      <div className="stack">
        <p>Connect your business account through a supported provider integration. Access, API availability, and supported records must be verified for your account.</p>
        <Note tone="neutral" text="ServiceTitan cannot be connected yet. This only records a sample connection plan — no credentials are collected and nothing syncs." />
        {writer ? (
          <>
            <div className="field">
              <span className="label">Proposed records to sync</span>
              <div className="row wrap">
                {ST_RECORDS.map(([code, label]) => (
                  <label key={code} className="check">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={records.includes(code)}
                      onChange={(e) => setRecords(e.target.checked ? [...records, code] : records.filter((r) => r !== code))}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Update preference">
              <Select
                options={[['review_before_sync', 'Review before sync'], ['import_only', 'Import to Rytsense only']]}
                disabled={busy}
                value={preference}
                onChange={(e) => setPreference(e.target.value)}
              />
            </Field>
          </>
        ) : null}
        <div className="dialog-actions">
          {writer ? <ActionButton className="btn btn--primary action" disabled={!records.length} action={save}>Save sample connection plan</ActionButton> : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
        <p className="sample-label">These are proposed options, not a statement of provider capabilities.</p>
      </div>
    </Dialog>
  );
}

function integrationSubtitle(item, fallbackName) {
  if (!item) return `Not connected · Supported data and permissions to be confirmed with the provider`;
  const status = item.state === 'connected' ? 'Connected' : (item.state === 'needs_login' ? 'Needs login' : 'Not connected');
  const detail = item.detail || 'Supported data and permissions to be confirmed with the provider';
  return `${status} · ${detail}`;
}

// ---------- Page ----------

export default function Settings() {
  const [state, setState] = useState({ status: 'loading' });
  const [dialog, setDialog] = useState(null);
  const [jobber, setJobber] = useState(null);
  const seq = useRef(0);

  const load = async () => {
    seq.current += 1;
    const mine = seq.current;
    setState((s) => ({ status: 'loading', data: s.data }));
    try {
      const data = await api('/v1/settings');
      if (mine !== seq.current) return;
      setState({ status: 'ready', data });
      const jb = data.integrations?.items?.find((i) => i.id === 'jobber');
      setJobber(jb || null);
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

  if (!can('admin')) {
    return (
      <>
        <PageHeader eyebrow="WORKSPACE" title="Settings" subtitle="Review sample workspace settings." meta={<span className="date">Preview only</span>} />
        <Note tone="warn" text="Not available for your role." />
      </>
    );
  }

  const { status, data, error } = state;
  const rows = settingsRowsFromData(data);
  const billing = data?.billing;
  const planName = billing?.plan?.name || billing?.plan?.text || 'Professional';
  const planTitle = String(planName).includes('Example') || String(planName).includes('·')
    ? String(planName)
    : `${planName} · Example plan`;
  const providerConnected = !!billing?.provider?.connected;
  const stItem = data?.integrations?.items?.find((i) => i.id === 'servicetitan');
  const automationCount = data?.automation?.needs_review?.total
    ?? data?.automation_pending
    ?? null;

  const openRow = (id) => setDialog({ kind: id });
  const close = () => setDialog(null);

  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Settings"
        subtitle="Review sample workspace settings."
        meta={<span className="date">Preview only</span>}
      />

      {status === 'loading' && !data ? <Spinner /> : null}
      {status === 'error' && !data ? <ErrorBox error={error} /> : null}

      {(data || status !== 'loading') ? (
        <>
          <Panel>
            {rows.map((row) => (
              <Row
                key={row.id}
                title={row.title}
                subtitle={row.subtitle}
                trailing={(
                  <button type="button" className="btn btn--secondary agent-btn" onClick={() => openRow(row.id)}>
                    View
                  </button>
                )}
              />
            ))}
          </Panel>
          <p className="foot">Sample settings; changes are not connected to a real business.</p>

          <Panel className="settings-panel">
            <PanelHead title="Billing & payments" subtitle="Manage your product subscription and billing details">
              <button type="button" className="btn btn--secondary agent-btn" onClick={() => setDialog({ kind: 'billing' })}>
                Manage billing
              </button>
            </PanelHead>
            <Row
              title={planTitle}
              subtitle={providerConnected ? `${billing.provider.name} connected` : 'No payment provider connected'}
              trailing={<Badge text="Demo account" tone="warn" />}
            />
          </Panel>

          <Panel className="settings-panel">
            <PanelHead title="Integrations" subtitle="Connect your field-service software" />
            <Row
              title="ServiceTitan"
              subtitle={integrationSubtitle(stItem, 'ServiceTitan')}
              trailing={(
                <button type="button" className="btn btn--secondary agent-btn" onClick={() => setDialog({ kind: 'servicetitan' })}>
                  {stItem?.plan ? 'Manage' : 'Set up'}
                </button>
              )}
            />
            <Row
              title="Jobber"
              subtitle={integrationSubtitle(jobber, 'Jobber')}
              trailing={(
                <button type="button" className="btn btn--secondary agent-btn" onClick={() => setDialog({ kind: 'jobber' })}>
                  {jobber?.state === 'connected' ? 'Manage' : 'Set up'}
                </button>
              )}
            />
            <p className="sample-label settings-panel__note">Connection previews only. No account authorization or data synchronization occurs.</p>
          </Panel>

          <Panel className="settings-panel">
            <PanelHead title="Admin automation" subtitle="Review office workflows and AI-prepared actions">
              <a className="btn btn--secondary agent-btn" href="#/automation">Manage automation</a>
            </PanelHead>
            <p className="sub settings-automation-copy">
              {automationCount != null
                ? `${automationCount} actions awaiting review · Invoice reminders, customer updates, documentation, and estimate follow-ups.`
                : 'Invoice reminders, customer updates, documentation, and estimate follow-ups.'}
            </p>
          </Panel>
        </>
      ) : null}

      {dialog?.kind === 'profile' ? (
        <Dialog title="Business profile" onClose={close}>
          <ProfileEditor
            profile={data?.profile || { name: 'Comfort Home Services', name_in_texts: 'Comfort Home' }}
            onSaved={(out) => setState((s) => ({ ...s, data: { ...s.data, profile: { ...s.data?.profile, ...out } } }))}
            onClose={close}
          />
        </Dialog>
      ) : null}
      {dialog?.kind === 'hours' ? (
        <Dialog title="Business hours" onClose={close} wide>
          <HoursEditor onClose={close} />
        </Dialog>
      ) : null}
      {dialog?.kind === 'notifications' ? (
        <SimpleListDialog
          title="Notifications"
          text={data?.notifications?.text || 'Example email notifications'}
          columns={['Notification', 'Detail', 'Status']}
          items={(data?.notifications?.items || []).map((n) => [
            n.name, n.detail || '-', <Badge text={n.on ? 'On' : 'Off'} tone={n.on ? 'good' : 'neutral'} />,
          ])}
          empty="No notifications configured."
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'connected' ? (
        <SimpleListDialog
          title="Connected systems"
          text={data?.connected?.text}
          columns={['System', 'Detail', 'Status']}
          items={(data?.connected?.items || []).map((c) => [
            c.name, c.detail || '-', <Badge text={c.connected ? 'Connected' : 'Not connected'} tone={c.connected ? 'good' : 'neutral'} />,
          ])}
          empty="Nothing connected yet."
          onClose={close}
        />
      ) : null}
      {dialog?.kind === 'team' ? (
        <Dialog title="Team access" onClose={close}>
          <div className="stack">
            <p>{rows.find((r) => r.id === 'team')?.subtitle}</p>
            {data?.team?.by_role ? (
              <div className="row wrap">
                {Object.entries(data.team.by_role).map(([role, count]) => (
                  <Badge key={role} text={`${role}: ${count}`} tone="info" />
                ))}
              </div>
            ) : null}
            <p className="sample-label">Preview only. No live settings or integration are connected.</p>
            <div className="dialog-actions">
              <a className="btn btn--secondary agent-btn" href="#/team" onClick={close}>Open team management</a>
              <Button className="btn btn--secondary agent-btn" onClick={close}>Close</Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {dialog?.kind === 'billing' ? <BillingDialog billing={billing} onClose={close} /> : null}
      {dialog?.kind === 'jobber' ? (
        <JobberSetupDialog item={jobber} onClose={close} onChanged={setJobber} />
      ) : null}
      {dialog?.kind === 'servicetitan' ? (
        <ServiceTitanSetupDialog item={stItem} onClose={close} />
      ) : null}
    </>
  );
}
