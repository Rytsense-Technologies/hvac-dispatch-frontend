// Settings: the company profile and hours, the read-only notifications and connected-systems lists, a small team summary,
// billing (plan, subscription, this month's usage) and integrations (Jobber, and ServiceTitan's "wish list" since it cannot
// really be connected yet). Everything here is admin only - the server would refuse anyone else, this page just does not
// bother asking it to. Each card fetches and fails on its own, so one broken part (say, billing not being set up) never
// takes the rest of the page down with it.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  Badge, Card, DataTable, Details, Empty, ErrorBox, Field, Note, PageHeader, Select, Spinner, toast, useRun, ActionButton, Icon,
} from '../components/index.js';

// The server's hours form wants 'mon'..'sun' day codes, not the numeric weekday codes WEEKDAYS (format.js) uses for
// shift pickers elsewhere - so this is its own small table rather than a reuse of WEEKDAYS.
const DAY_CODES = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120].map((n) => [n, `${n} minutes`]);

function sameValue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// ---------- Profile ----------

function ProfileCard({ profile, onSaved }) {
  const [name, setName] = useState(profile.name || '');
  const [busy, run] = useRun();
  const writer = can('admin');
  const dirty = name.trim() !== (profile.name || '') && name.trim().length >= 2 && name.trim().length <= 120;
  const save = () => run(async () => {
    const out = await api('/v1/settings/profile', { method: 'PATCH', body: { name: name.trim() } });
    toast('Saved.');
    onSaved(out);
  });
  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="users" /><span>Profile</span></span></Card.Title>
      <div className="grid2">
        <Field label="Company name" hint="2-120 characters.">
          <input type="text" minLength={2} maxLength={120} disabled={!writer || busy} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Name used in texts"><input type="text" disabled value={profile.name_in_texts || '-'} /></Field>
      </div>
      <p className="muted small">{profile.text}</p>
      {writer ? (
        <div className="right"><ActionButton className="btn btn--primary" disabled={!dirty} action={save}>Save</ActionButton></div>
      ) : null}
    </Card>
  );
}

// ---------- Hours ----------

function holidaysToText(list) { return (list || []).join('\n'); }
function textToHolidays(text) { return [...new Set(String(text || '').split('\n').map((s) => s.trim()).filter(Boolean))]; }

function HoursCard() {
  const [state, setState] = useState({ status: 'loading' });
  const [form, setForm] = useState(null);
  const [holidaysText, setHolidaysText] = useState('');
  const [busy, run] = useRun();
  const writer = can('admin');
  const seq = useRef(0);

  const load = async () => {
    seq.current += 1;
    const mine = seq.current;
    setState((s) => ({ status: 'loading', data: s.data }));
    try {
      const data = await api('/v1/settings/hours');
      if (mine !== seq.current) return;
      setState({ status: 'ready', data });
      setForm(data.values);
      setHolidaysText(holidaysToText(data.values.holidays));
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

  const { status, data, error } = state;
  if (status === 'loading' && !data) return <Card as="section"><Card.Title><span className="row"><Icon name="plan" /><span>Hours</span></span></Card.Title><Spinner /></Card>;
  if (status === 'error') return <Card as="section"><Card.Title><span className="row"><Icon name="plan" /><span>Hours</span></span></Card.Title><ErrorBox error={error} /></Card>;

  const overridden = data.overridden || [];
  const overrideHint = (field, base) => (overridden.includes(field) ? `${base ? `${base} ` : ''}(changed from your server's default: ${data.server[field] ?? ''})` : base);
  const nextValues = form ? { ...form, holidays: textToHolidays(holidaysText) } : null;
  const changed = form ? Object.fromEntries(Object.entries(nextValues).filter(([key, value]) => !sameValue(value, data.values[key]))) : {};

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
  const reset = () => api('/v1/settings/hours', { method: 'DELETE' }).then((out) => {
    toast('Hours reset to your server defaults.');
    setState({ status: 'ready', data: out });
    setForm(out.values);
    setHolidaysText(holidaysToText(out.values.holidays));
  });

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="plan" /><span>Hours</span></span></Card.Title>
      <p className="muted small">{data.text}</p>
      <form className="stack" noValidate onSubmit={save}>
        <div className="field">
          <span className="label">Days open</span>
          <div className="row wrap">
            {DAY_CODES.map(([code, label]) => (
              <label key={code} className="check">
                <input type="checkbox" disabled={!writer || busy} checked={form.days.includes(code)}
                  onChange={(e) => set('days')(e.target.checked ? [...form.days, code] : form.days.filter((d) => d !== code))} />
                {label}
              </label>
            ))}
          </div>
          {overridden.includes('days') ? <small className="muted">{`Changed from your server's default: ${(data.server.days || []).join(', ')}.`}</small> : null}
        </div>
        <div className="grid2">
          <Field label="Opens" hint={overrideHint('open')}><input type="time" disabled={!writer || busy} value={form.open} onChange={(e) => set('open')(e.target.value)} /></Field>
          <Field label="Closes" hint={overrideHint('close')}><input type="time" disabled={!writer || busy} value={form.close} onChange={(e) => set('close')(e.target.value)} /></Field>
          <Field label="Slot length" hint={overrideHint('slot_minutes')}>
            <Select options={SLOT_MINUTES} disabled={!writer || busy} value={form.slot_minutes} onChange={(e) => set('slot_minutes')(Number(e.target.value))} />
          </Field>
          <Field label="Minimum notice (minutes)" hint={overrideHint('min_notice_minutes', '0-10080')}>
            <input type="number" min={0} max={10080} disabled={!writer || busy} value={form.min_notice_minutes} onChange={(e) => set('min_notice_minutes')(Number(e.target.value))} />
          </Field>
          <Field label="Book up to how many days ahead" hint={overrideHint('max_days_ahead', '1-365')}>
            <input type="number" min={1} max={365} disabled={!writer || busy} value={form.max_days_ahead} onChange={(e) => set('max_days_ahead')(Number(e.target.value))} />
          </Field>
          <Field label="Timezone" hint={overrideHint('timezone', 'An IANA name, e.g. America/Chicago')}>
            <input type="text" disabled={!writer || busy} value={form.timezone} onChange={(e) => set('timezone')(e.target.value)} />
          </Field>
        </div>
        <Field label="Holidays" hint={overrideHint('holidays', 'One date per line, YYYY-MM-DD. At most 100.')}>
          <textarea rows={4} disabled={!writer || busy} value={holidaysText} onChange={(e) => setHolidaysText(e.target.value)} />
        </Field>
        {overridden.length ? <Note tone="neutral" text={`Customized for your company: ${overridden.join(', ')}.`} /> : null}
        {writer ? (
          <div className="between">
            <ActionButton className="btn btn--ghost" action={reset}>Reset to defaults</ActionButton>
            <button type="submit" className="btn btn--primary" disabled={busy || !Object.keys(changed).length}>Save</button>
          </div>
        ) : null}
      </form>
    </Card>
  );
}

// ---------- Notifications (read-only) ----------

function NotificationsCard({ notifications }) {
  if (!notifications) return null;
  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="attention" /><span>Notifications</span></span></Card.Title>
      <p className="muted small">{notifications.text}</p>
      {notifications.items?.length ? (
        <DataTable label="Notifications" head={['Notification', 'Detail', 'Status']} rows={notifications.items.map((n) => [
          n.name, n.detail || '-', <Badge text={n.on ? 'On' : 'Off'} tone={n.on ? 'good' : 'neutral'} />,
        ])} />
      ) : <Empty text="No notifications configured." />}
      <p className="small muted row wrap">
        <span>{`Email: ${notifications.email_ready ? 'ready' : 'not set up'}`}</span>
        <span>{`Text: ${notifications.text_ready ? 'ready' : 'not set up'}`}</span>
      </p>
    </Card>
  );
}

// ---------- Connected systems (read-only) ----------

function ConnectedCard({ connected }) {
  if (!connected) return null;
  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="phone" /><span>Connected systems</span></span></Card.Title>
      <p className="muted small">{connected.text}</p>
      {connected.items?.length ? (
        <DataTable label="Connected systems" head={['System', 'Detail', 'Status']} rows={connected.items.map((c) => [
          c.name, c.detail || '-', <Badge text={c.connected ? 'Connected' : 'Not connected'} tone={c.connected ? 'good' : 'neutral'} />,
        ])} />
      ) : <Empty text="Nothing connected yet." />}
    </Card>
  );
}

// ---------- Team (small summary) ----------

function TeamCard({ team }) {
  if (!team) return null;
  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="technicians" /><span>Team</span></span></Card.Title>
      <p>{team.text}</p>
      {team.by_role ? (
        <div className="row wrap">
          {Object.entries(team.by_role).map(([role, count]) => <Badge key={role} text={`${role}: ${count}`} tone="info" />)}
        </div>
      ) : null}
    </Card>
  );
}

// ---------- Billing ----------

function BillingCard({ billing }) {
  if (!billing) return <Card as="section"><Card.Title><span className="row"><Icon name="usage" /><span>Billing</span></span></Card.Title><Note text="Billing information is not available." /></Card>;
  const { plan, state, provider, subscription, this_month: month, manage } = billing;
  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="usage" /><span>Billing</span></span></Card.Title>
      {plan ? (
        <div className="stack">
          <p><strong>{plan.text}</strong></p>
          <p className="small muted">{`${plan.included_minutes} minutes included, then ${plan.extra_minute_price} per extra minute. ${plan.monthly_fee} / month.`}</p>
        </div>
      ) : <Note tone="warn" text="No billing plan is assigned." />}
      <Card.Row>
        <Badge text={state?.state || 'unknown'} tone={state?.state === 'active' ? 'good' : state?.state === 'no_plan' ? 'neutral' : 'warn'} />
        {state?.detail ? <span className="small muted">{state.detail}</span> : null}
      </Card.Row>
      {provider ? (
        <p className="small muted">{`Payment provider: ${provider.name}${provider.mode ? ` (${provider.mode})` : ''} - ${provider.connected ? 'connected' : 'not connected'}.`}</p>
      ) : null}
      {subscription ? (
        <Details rows={[
          ['Subscription status', subscription.status || '-'],
          ['Payments made', String(subscription.paid_count ?? 0)],
          ['Last paid', subscription.last_paid_at ? formatDateTime(subscription.last_paid_at) : '-'],
          ['Next charge', subscription.next_charge_at ? formatDateTime(subscription.next_charge_at) : '-'],
        ]} />
      ) : <p className="small muted">No subscription on file.</p>}
      {month ? (
        <Details rows={[
          ['Month', month.month || '-'],
          ['Minutes used', String(month.minutes ?? 0)],
          ['Included', String(month.included_minutes ?? 0)],
          ['Extra minutes', String(month.extra_minutes ?? 0)],
          ['Amount due', month.amount_due ?? '-'],
          ['In progress', month.in_progress ? 'Yes - still running' : 'No - final'],
        ]} />
      ) : null}
      {manage?.action === 'authorise' && manage.url ? (
        <div className="right"><a className="btn btn--primary" href={manage.url} target="_blank" rel="noopener noreferrer">Authorise billing</a></div>
      ) : null}
      {manage?.action === 'statement' ? <Note text="See the Usage and bill page for the full statement." /> : null}
    </Card>
  );
}

// ---------- Integrations: Jobber ----------

const JOBBER_TONE = { connected: 'good', not_connected: 'neutral', needs_login: 'warn', unavailable: 'bad', unknown: 'neutral' };

function JobberCard({ item }) {
  const [data, setData] = useState(item);
  const writer = can('admin');
  if (!data) return null;

  const refresh = async () => { try { setData(await api('/v1/jobber/status')); } catch { /* keep showing what we had */ } };
  const connect = async () => {
    const out = await api('/v1/jobber/connect', { method: 'POST' });
    if (out?.url) { window.open(out.url, '_blank', 'noopener'); toast('Finish signing in to Jobber in the new tab.'); }
    await refresh();
  };
  const sync = async () => { await api('/v1/jobber/sync', { method: 'POST' }); toast('Sync started.'); await refresh(); };
  const disconnect = async () => { await api('/v1/jobber/disconnect', { method: 'POST' }); toast('Jobber disconnected.'); await refresh(); };

  return (
    <Card as="section">
      <div className="between">
        <h3 className="row"><Icon name="jobs" /><span>Jobber</span></h3>
        <Badge text={data.state} tone={JOBBER_TONE[data.state] || 'neutral'} />
      </div>
      <p className="small muted">{data.detail}</p>
      {data.state === 'connected' ? (
        <Details rows={[
          ['Account', data.account_name || '-'],
          ['Connected since', data.connected_since ? formatDateTime(data.connected_since) : '-'],
          ['Last synced', data.last_synced_at ? formatDateTime(data.last_synced_at) : '-'],
          ['Last error', data.last_error || '-'],
        ]} />
      ) : null}
      {data.syncs ? <p className="small muted">{data.syncs}</p> : null}
      {data.not_yet ? <p className="small muted">{data.not_yet}</p> : null}
      {writer ? (
        <Card.Row>
          {data.available && (data.state === 'not_connected' || data.state === 'needs_login') ? <ActionButton className="btn btn--primary" action={connect}>Connect Jobber</ActionButton> : null}
          {data.state === 'connected' ? <ActionButton className="btn btn--outline" action={sync}>Sync now</ActionButton> : null}
          {data.state === 'connected' ? <ActionButton className="btn btn--ghost" action={disconnect}>Disconnect</ActionButton> : null}
        </Card.Row>
      ) : null}
    </Card>
  );
}

// ---------- Integrations: ServiceTitan (a recorded wish - nothing is actually connected) ----------

const ST_RECORDS = [['customers', 'Customers'], ['jobs_appointments', 'Jobs & appointments'], ['team_availability', 'Team availability']];

function ServiceTitanCard({ item }) {
  const [plan, setPlan] = useState(item?.plan || null);
  const [records, setRecords] = useState(item?.plan?.records || []);
  const [preference, setPreference] = useState(item?.plan?.update_preference || 'review_before_sync');
  const [busy, run] = useRun();
  const writer = can('admin');
  if (!item) return null;

  const save = () => run(async () => {
    const out = await api('/v1/settings/integrations/servicetitan/plan', { method: 'PUT', body: { records, update_preference: preference } });
    setPlan(out?.plan || { records, update_preference: preference });
    toast('Saved. This only records what you want - it does not connect anything.');
  });
  const remove = () => run(async () => {
    await api('/v1/settings/integrations/servicetitan/plan', { method: 'DELETE' });
    setPlan(null);
    setRecords([]);
    toast('Removed.');
  });

  return (
    <Card as="section">
      <div className="between">
        <h3 className="row"><Icon name="jobs" /><span>ServiceTitan</span></h3>
        <Badge text="Not available" tone="neutral" />
      </div>
      <p className="small muted">{item.detail}</p>
      <Note tone="neutral" text="ServiceTitan cannot be connected yet. This only records what you'd want, for later - it does not connect or sync anything now." />
      {plan ? <p className="small muted">{`Currently recorded: ${plan.records?.join(', ') || 'nothing'}, preference: ${plan.update_preference}${plan.updated_at ? ` (updated ${formatDateTime(plan.updated_at)})` : ''}.`}</p> : null}
      {writer ? (
        <div className="stack">
          <div className="field">
            <span className="label">What you'd want recorded</span>
            <div className="row wrap">
              {ST_RECORDS.map(([code, label]) => (
                <label key={code} className="check">
                  <input type="checkbox" disabled={busy} checked={records.includes(code)}
                    onChange={(e) => setRecords(e.target.checked ? [...records, code] : records.filter((r) => r !== code))} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Field label="If it ever connects, how should updates be applied?">
            <Select options={[['review_before_sync', 'Review before syncing'], ['automatic', 'Automatic']]} disabled={busy} value={preference} onChange={(e) => setPreference(e.target.value)} />
          </Field>
          <div className="between">
            {plan ? <ActionButton className="btn btn--ghost" action={remove}>Remove</ActionButton> : <span />}
            <ActionButton className="btn btn--primary" disabled={!records.length} action={save}>Save</ActionButton>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function IntegrationsCard({ integrations }) {
  if (!integrations) return <Card as="section"><Card.Title><span className="row"><Icon name="jobs" /><span>Integrations</span></span></Card.Title><Note text="Integrations are not available." /></Card>;
  const jobber = integrations.items?.find((i) => i.id === 'jobber');
  const servicetitan = integrations.items?.find((i) => i.id === 'servicetitan');
  return (
    <Card as="section">
      <Card.Title><span className="row"><Icon name="jobs" /><span>Integrations</span></span></Card.Title>
      <p className="muted small">{integrations.text}</p>
      <div className="stack">
        {jobber ? <JobberCard item={jobber} /> : null}
        {servicetitan ? <ServiceTitanCard item={servicetitan} /> : null}
      </div>
    </Card>
  );
}

// ---------- Page ----------

export default function Settings() {
  const [state, setState] = useState({ status: 'loading' });
  const seq = useRef(0);

  const load = async () => {
    seq.current += 1;
    const mine = seq.current;
    setState((s) => ({ status: 'loading', data: s.data }));
    try {
      const data = await api('/v1/settings');
      if (mine === seq.current) setState({ status: 'ready', data });
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

  if (!can('admin')) {
    return (
      <>
        <PageHeader title="Settings" />
        <Note tone="warn" text="Not available for your role." />
      </>
    );
  }

  const { status, data, error } = state;
  return (
    <>
      <PageHeader title="Settings" subtitle="Your company's profile and hours, notifications, connected systems, billing and integrations." />
      {status === 'loading' && !data ? <Spinner /> : status === 'error' ? <ErrorBox error={error} /> : (
        <div className="stack">
          <ProfileCard profile={data.profile} onSaved={(out) => setState((s) => ({ ...s, data: { ...s.data, profile: { ...s.data.profile, ...out } } }))} />
          <HoursCard />
          <NotificationsCard notifications={data.notifications} />
          <ConnectedCard connected={data.connected} />
          <TeamCard team={data.team} />
          <BillingCard billing={data.billing} />
          <IntegrationsCard integrations={data.integrations} />
        </div>
      )}
    </>
  );
}
