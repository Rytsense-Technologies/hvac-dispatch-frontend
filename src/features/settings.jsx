// Settings: reference-aligned workspace rows + Billing, Integrations, Admin automation panels.
// Live profile/hours/Jobber/billing APIs stay wired; copy distinguishes live writes from illustrative panels.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Dialog, ErrorBox, Field, Note,
  PageHeader, Panel, PanelHead, Row, Select, Spinner, toast, useRun,
} from '../components/index.js';

const DAY_CODES = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const SLOT_MINUTES = [15, 20, 30, 45, 60, 90, 120].map((n) => [n, `${n} minutes`]);
const ST_RECORDS = [['customers', 'Customers'], ['jobs_appointments', 'Jobs & appointments'], ['team_availability', 'Team availability']];
const ST_PREFERENCES = [
  ['review_before_sync', 'Review before syncing'],
  ['automatic', 'Automatic'],
  ['import_only', 'Import to Rytsense only'],
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
  if (!data) return [];
  const profile = data.profile;
  const profileSub = [profile?.name, profile?.city || profile?.location || profile?.name_in_texts]
    .filter(Boolean).join(' · ') || profile?.text || 'No profile details yet';
  const hoursSub = formatHoursSummary(data.hours?.values) || data.hours?.text || 'Hours not configured';
  const notif = data.notifications;
  const notifSub = notif?.items?.length
    ? `${notif.items.filter((n) => n.on).length} of ${notif.items.length} on · ${notif.email_ready ? 'Email ready' : 'Email not set up'}${notif.text_ready != null ? ` · ${notif.text_ready ? 'Text ready' : 'Text not set up'}` : ''}`
    : (notif?.text || 'No notifications configured');
  const connected = data.connected;
  const connectedCount = connected?.items?.filter((c) => c.connected)?.length || 0;
  const connectedSub = connected?.items?.length
    ? (connectedCount ? `${connectedCount} connected` : 'No systems connected')
    : (connected?.text || 'No systems connected');
  const team = data.team;
  const teamCount = team?.total ?? (team?.by_role ? Object.values(team.by_role).reduce((a, b) => a + Number(b || 0), 0) : null);
  const teamSub = teamCount != null
    ? `${teamCount} ${teamCount === 1 ? 'member' : 'members'}`
    : (team?.text || 'No team summary yet');
  return [
    { id: 'profile', title: 'Business profile', subtitle: profileSub },
    { id: 'hours', title: 'Business hours', subtitle: hoursSub },
    { id: 'notifications', title: 'Notifications', subtitle: notifSub },
    { id: 'connected', title: 'Connected systems', subtitle: connectedSub },
    { id: 'team', title: 'Team access', subtitle: teamSub },
  ];
}

function planTitleFromBilling(billing) {
  if (!billing?.plan) return 'No plan assigned';
  const name = billing.plan.name || billing.plan.text || 'Plan';
  return String(name);
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
      <p className="sub">Changes save to your company profile.</p>
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

function HoursEditor({ onClose, onSaved }) {
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
        <ErrorBox error={state.error} />
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

  const applyHours = (out) => {
    setState({ status: 'ready', data: out });
    setForm(out.values);
    setHolidaysText(holidaysToText(out.values.holidays));
    onSaved?.(out);
  };

  const save = (event) => {
    event.preventDefault();
    if (!Object.keys(changed).length) return;
    run(async () => {
      const out = await api('/v1/settings/hours', { method: 'PATCH', body: changed });
      toast('Saved.');
      applyHours(out);
    });
  };

  const reset = () => run(async () => {
    const out = await api('/v1/settings/hours', { method: 'DELETE' });
    toast('Hours reset to your server defaults.');
    applyHours(out);
  });

  return (
    <form className="stack" noValidate onSubmit={save}>
      <p className="sub">{data.text || formatHoursSummary(form)}</p>
      <p className="sample-label">Saving updates your live business hours.</p>
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
      <Field label="Holidays" hint={overrideHint('holidays', 'One YYYY-MM-DD per line')}>
        <textarea rows={3} disabled={!writer || busy} value={holidaysText} onChange={(e) => setHolidaysText(e.target.value)} />
      </Field>
      {overridden.length ? <Note tone="neutral" text={`Customized for your company: ${overridden.join(', ')}.`} /> : null}
      <div className="dialog-actions">
        {writer ? <ActionButton className="btn btn--ghost" action={reset}>Reset to defaults</ActionButton> : null}
        {writer ? <button type="submit" className="btn btn--primary action" disabled={busy || !Object.keys(changed).length}>Save</button> : null}
        <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
      </div>
    </form>
  );
}

function SimpleListDialog({ title, text, items, columns, empty, onClose, extra, footnote }) {
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="stack">
        {text ? <p className="sub">{text}</p> : null}
        {items?.length ? (
          <DataTable label={title} head={columns} rows={items} />
        ) : <p className="sub empty-inline">{empty}</p>}
        {extra}
        {footnote ? <p className="sample-label">{footnote}</p> : null}
        <div className="dialog-actions">
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

// ---------- Billing dialog ----------

function BillingDialog({ billing, onClose }) {
  if (!billing) {
    return (
      <Dialog title="Billing & payments" onClose={onClose}>
        <div className="stack">
          <Note text="Billing information is not available." />
          <div className="dialog-actions">
            <a className="btn btn--secondary agent-btn" href="#/usage">Open usage &amp; statement</a>
            <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
          </div>
        </div>
      </Dialog>
    );
  }

  const { plan, state, provider, subscription, this_month: month, manage } = billing;
  const planLabel = planTitleFromBilling(billing);
  const paymentSub = provider?.connected
    ? `${provider.name}${provider.mode ? ` (${provider.mode})` : ''} connected`
    : (provider ? `${provider.name || 'Provider'} not connected` : 'No payment provider connected');
  const invoiceSub = subscription?.paid_count > 0
    ? `${subscription.paid_count} payment${subscription.paid_count === 1 ? '' : 's'} recorded${subscription.last_paid_at ? ` · last ${formatDateTime(subscription.last_paid_at)}` : ''}`
    : (subscription ? 'No invoices yet. Receipts will appear after actual billing begins.' : 'Invoice history unavailable.');

  return (
    <Dialog title="Billing & payments" onClose={onClose} wide>
      <div className="stack">
        <div className="filters" role="presentation">
          <span className="badge badge--neutral">Subscription</span>
          <span className="badge badge--neutral">Payment method</span>
          <span className="badge badge--neutral">Invoices</span>
        </div>
        <h3>{planLabel}</h3>
        {plan ? (
          <p className="sub">
            {[
              plan.included_minutes != null ? `${plan.included_minutes} minutes included` : null,
              plan.extra_minute_price ? `${plan.extra_minute_price} per extra minute` : null,
              plan.monthly_fee ? `${plan.monthly_fee} / month` : null,
            ].filter(Boolean).join(' · ') || plan.text || 'Plan details on file.'}
          </p>
        ) : (
          <Note tone="warn" text="No billing plan is assigned." />
        )}
        <CardRowStatus state={state} />
        {subscription ? (
          <Details rows={[
            ['Subscription status', subscription.status || '-'],
            ['Payments made', String(subscription.paid_count ?? 0)],
            ['Last paid', subscription.last_paid_at ? formatDateTime(subscription.last_paid_at) : '-'],
            ['Next charge', subscription.next_charge_at ? formatDateTime(subscription.next_charge_at) : '-'],
          ]} />
        ) : <p className="sub">No subscription on file.</p>}
        {month ? (
          <Details rows={[
            ['Month', month.month || '-'],
            ['Minutes used', String(month.minutes ?? 0)],
            ['Included', String(month.included_minutes ?? 0)],
            ['Extra minutes', String(month.extra_minutes ?? 0)],
            ['Amount due', month.amount_due ?? '-'],
            ['In progress', month.in_progress ? 'Yes — still running' : 'No — final'],
          ]} />
        ) : null}
        <Row title="Payment method" subtitle={paymentSub} />
        <Row title="Billing email" subtitle={billing.email || subscription?.email || 'Not set'} />
        <Row title="Invoices" subtitle={invoiceSub} />
        <div className="dialog-actions">
          <a className="btn btn--secondary agent-btn" href="#/usage">Open usage &amp; statement</a>
          {manage?.action === 'authorise' && manage.url ? (
            <a className="btn btn--primary action" href={manage.url} target="_blank" rel="noopener noreferrer">Authorise billing</a>
          ) : null}
          {manage?.action === 'statement' ? <Note text="See Usage & Billing for the full statement." /> : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Dialog>
  );
}

function CardRowStatus({ state }) {
  if (!state) return null;
  return (
    <div className="row wrap">
      <Badge text={state.state || 'unknown'} tone={state.state === 'active' ? 'good' : state.state === 'no_plan' ? 'neutral' : 'warn'} />
      {state.detail ? <span className="sub">{state.detail}</span> : null}
    </div>
  );
}

// ---------- Integrations ----------

const JOBBER_TONE = { connected: 'good', not_connected: 'neutral', needs_login: 'warn', unavailable: 'bad', unknown: 'neutral' };

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
        <div className="row wrap">
          {data?.state ? <Badge text={data.state} tone={JOBBER_TONE[data.state] || 'neutral'} /> : null}
        </div>
        <p>Connect your business account through a supported provider integration.</p>
        <p className="sub">{data?.detail || 'Supported data and permissions to be confirmed with the provider.'}</p>
        {data?.state === 'connected' ? (
          <Details rows={[
            ['Account', data.account_name || '-'],
            ['Connected since', data.connected_since ? formatDateTime(data.connected_since) : '-'],
            ['Last synced', data.last_synced_at ? formatDateTime(data.last_synced_at) : '-'],
            ['Last error', data.last_error || '-'],
          ]} />
        ) : null}
        {data?.syncs ? <p className="sub">{data.syncs}</p> : null}
        {data?.not_yet ? <p className="sub">{data.not_yet}</p> : null}
        <div className="dialog-actions">
          {writer && data?.available && (data.state === 'not_connected' || data.state === 'needs_login') ? (
            <ActionButton className="btn btn--primary action" action={connect}>Connect Jobber</ActionButton>
          ) : null}
          {writer && data?.state === 'connected' ? <ActionButton className="btn btn--secondary agent-btn" action={sync}>Sync now</ActionButton> : null}
          {writer && data?.state === 'connected' ? <ActionButton className="btn btn--ghost" action={disconnect}>Disconnect</ActionButton> : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
        <p className="sample-label">Live Jobber connect uses your company credentials when the provider is available.</p>
      </div>
    </Dialog>
  );
}

function ServiceTitanSetupDialog({ item, onClose, onSaved }) {
  const existingPref = item?.plan?.update_preference || 'review_before_sync';
  const [plan, setPlan] = useState(item?.plan || null);
  const [records, setRecords] = useState(item?.plan?.records || []);
  const [preference, setPreference] = useState(existingPref);
  const [busy, run] = useRun();
  const writer = can('admin');

  const preferenceOptions = ST_PREFERENCES.some(([v]) => v === preference)
    ? ST_PREFERENCES
    : [...ST_PREFERENCES, [preference, preference]];

  const save = () => run(async () => {
    const out = await api('/v1/settings/integrations/servicetitan/plan', {
      method: 'PUT',
      body: { records, update_preference: preference },
    });
    const nextPlan = out?.plan || { records, update_preference: preference, updated_at: new Date().toISOString() };
    setPlan(nextPlan);
    onSaved?.(nextPlan);
    toast('Saved. This only records what you want — it does not connect anything.');
  });

  const remove = () => run(async () => {
    await api('/v1/settings/integrations/servicetitan/plan', { method: 'DELETE' });
    setPlan(null);
    setRecords([]);
    setPreference('review_before_sync');
    onSaved?.(null);
    toast('Removed.');
  });

  return (
    <Dialog title="ServiceTitan integration" onClose={onClose}>
      <div className="stack">
        <p>ServiceTitan cannot be connected yet. You can record a connection plan for later — no credentials are collected and nothing syncs.</p>
        {plan ? (
          <p className="sub">
            Currently recorded: {(plan.records || []).join(', ') || 'nothing'}, preference: {plan.update_preference}
            {plan.updated_at ? ` (updated ${formatDateTime(plan.updated_at)})` : ''}.
          </p>
        ) : null}
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
                options={preferenceOptions}
                disabled={busy}
                value={preference}
                onChange={(e) => setPreference(e.target.value)}
              />
            </Field>
          </>
        ) : null}
        <div className="dialog-actions">
          {writer && plan ? <ActionButton className="btn btn--ghost" action={remove}>Remove</ActionButton> : null}
          {writer ? <ActionButton className="btn btn--primary action" disabled={!records.length} action={save}>Save connection plan</ActionButton> : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
        <p className="sample-label">Proposed options only — not a statement of provider capabilities.</p>
      </div>
    </Dialog>
  );
}

function integrationSubtitle(item) {
  if (!item) return 'Not connected · Supported data and permissions to be confirmed with the provider';
  if (item.id === 'servicetitan' || item.name === 'ServiceTitan') {
    if (item.plan) return `Plan recorded · ${item.plan.update_preference || 'review_before_sync'} · Not connected`;
    return item.detail || 'Not connected · Supported data and permissions to be confirmed with the provider';
  }
  const status = item.state === 'connected' ? 'Connected' : (item.state === 'needs_login' ? 'Needs login' : 'Not connected');
  const detail = item.detail || 'Supported data and permissions to be confirmed with the provider';
  return `${status} · ${detail}`;
}

function patchIntegrationsItem(data, id, patch) {
  if (!data?.integrations) return data;
  const items = (data.integrations.items || []).map((item) => (item.id === id ? { ...item, ...patch } : item));
  const found = items.some((item) => item.id === id);
  return {
    ...data,
    integrations: {
      ...data.integrations,
      items: found ? items : [...items, { id, ...patch }],
    },
  };
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
      // Keep prior data when a reload fails so live rows do not flip to invented samples.
      if (mine === seq.current) setState((s) => ({ status: 'error', error, data: s.data }));
    }
  };
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

  // Integrations state
  const [stPreference, setStPreference] = useState('review_before_sync');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api('/v1/settings');
        if (!active) return;
        setData(res);

        if (res?.profile?.name) {
          setProfileName(res.profile.name);
          const loc = res.profile.city ? `${res.profile.city}, ${res.profile.state || 'TX'}` : (res.profile.address || 'Austin, Texas');
          setProfileLocation(loc);
        }

        if (res?.hours?.values) {
          const h = res.hours.values;
          const daysStr = Array.isArray(h.days) && h.days.length === 5 ? 'Monday–Friday' : 'Monday–Saturday';
          const openStr = h.open ? `${h.open}` : '8:00 AM';
          const closeStr = h.close ? `${h.close}` : '5:00 PM';
          setProfileHours(`${daysStr} · ${openStr}–${closeStr}`);
        }

        if (res?.notifications) {
          const n = res.notifications;
          if (n.items?.length) {
            setProfileNotifications(`${n.items.length} active notification channels`);
          }
        }

        if (res?.connected?.items) {
          const conn = res.connected.items.filter((c) => c.connected);
          setConnectedCount(conn.length > 0 ? `${conn.length} systems connected` : 'No systems connected');
        }

        if (res?.team?.total) {
          setTeamMemberCount(`${res.team.total} sample members`);
        }

        if (res?.billing?.plan?.name) {
          setBillingPlanName(`${res.billing.plan.name} · Example plan`);
        }
        if (res?.billing?.provider) {
          setPaymentProviderStatus(res.billing.provider.connected ? `Connected (${res.billing.provider.name})` : 'No payment provider connected');
        }

        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => { active = false; };
  }, []);

  if (!allowed) {
    return (
      <>
        <PageHeader eyebrow="WORKSPACE" title="Settings" subtitle="Company profile, hours, billing, and integrations." />
        <Note tone="warn" text="Not available for your role." />
      </>
    );
  }

  const { status, data, error } = state;
  const rows = settingsRowsFromData(data);
  const billing = data?.billing;
  const planTitle = planTitleFromBilling(billing);
  const providerConnected = !!billing?.provider?.connected;
  const stItem = data?.integrations?.items?.find((i) => i.id === 'servicetitan');
  const automationCount = data?.automation?.needs_review?.total
    ?? data?.automation_pending
    ?? null;
  const billingState = billing?.state?.state;
  const billingBadge = billingState === 'active'
    ? { text: billingState, tone: 'good' }
    : billingState === 'no_plan'
      ? { text: billingState, tone: 'neutral' }
      : providerConnected
        ? { text: 'Connected', tone: 'good' }
        : billing
          ? { text: billingState || 'unknown', tone: 'warn' }
          : { text: 'Unavailable', tone: 'neutral' };

  const openRow = (id) => setDialog({ kind: id });
  const close = () => setDialog(null);

  const onHoursSaved = (out) => {
    setState((s) => ({
      ...s,
      data: {
        ...s.data,
        hours: out,
      },
    }));
  };

  const onServiceTitanSaved = (plan) => {
    setState((s) => ({
      ...s,
      data: patchIntegrationsItem(s.data, 'servicetitan', {
        id: 'servicetitan',
        name: 'ServiceTitan',
        state: 'not_connected',
        plan,
        detail: plan
          ? `Plan recorded · ${plan.update_preference || 'review_before_sync'}`
          : 'Not connected · Supported data and permissions to be confirmed with the provider',
      }),
    }));
  };

  const onJobberChanged = (next) => {
    setJobber(next);
    setState((s) => ({
      ...s,
      data: patchIntegrationsItem(s.data, 'jobber', { ...next, id: 'jobber', name: 'Jobber' }),
    }));
  };

  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE"
        title="Settings"
        subtitle="Company profile, hours, notifications, billing, and integrations."
        meta={<span className="date">Live workspace</span>}
      />

      {status === 'loading' && !data ? <Spinner /> : null}
      {status === 'error' ? <ErrorBox error={error} /> : null}

      {data ? (
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
          <p className="foot">Profile and hours edits save to your company. Billing and integration status come from live APIs when available.</p>

          <Panel className="settings-panel">
            <PanelHead title="Billing & payments" subtitle="Manage your product subscription and billing details">
              <button type="button" className="btn btn--secondary agent-btn" onClick={() => setDialog({ kind: 'billing' })}>
                Manage billing
              </button>
            </PanelHead>
            <Row
              title={planTitle}
              subtitle={providerConnected ? `${billing.provider.name} connected` : (billing?.provider ? 'No payment provider connected' : (billing ? 'No payment provider connected' : 'Billing unavailable'))}
              trailing={<Badge text={billingBadge.text} tone={billingBadge.tone} />}
            />
          </Panel>

          <Panel className="settings-panel">
            <PanelHead title="Integrations" subtitle="Connect your field-service software" />
            <Row
              title="ServiceTitan"
              subtitle={integrationSubtitle(stItem)}
              trailing={(
                <button type="button" className="btn btn--secondary agent-btn" onClick={() => setDialog({ kind: 'servicetitan' })}>
                  {stItem?.plan ? 'Manage' : 'Set up'}
                </button>
              )}
            />
            <Row
              title="Jobber"
              subtitle={integrationSubtitle(jobber)}
              trailing={(
                <button type="button" className="btn btn--secondary agent-btn" onClick={() => setDialog({ kind: 'jobber' })}>
                  {jobber?.state === 'connected' ? 'Manage' : 'Set up'}
                </button>
              )}
            />
            <p className="sample-label settings-panel__note">ServiceTitan plans are recorded only. Jobber can connect when the provider is available.</p>
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
            profile={data?.profile || {}}
            onSaved={(out) => setState((s) => ({ ...s, data: { ...s.data, profile: { ...s.data?.profile, ...out } } }))}
            onClose={close}
          />
        </Dialog>
      ) : null}
      {dialog?.kind === 'hours' ? (
        <Dialog title="Business hours" onClose={close} wide>
          <HoursEditor onClose={close} onSaved={onHoursSaved} />
        </Dialog>
      ) : null}
      {dialog?.kind === 'notifications' ? (
        <SimpleListDialog
          title="Notifications"
          text={data?.notifications?.text}
          columns={['Notification', 'Detail', 'Status']}
          items={(data?.notifications?.items || []).map((n) => [
            n.name, n.detail || '-', <Badge text={n.on ? 'On' : 'Off'} tone={n.on ? 'good' : 'neutral'} />,
          ])}
          empty="No notifications configured."
          extra={(
            <p className="sub row wrap">
              <span>{`Email: ${data?.notifications?.email_ready ? 'ready' : 'not set up'}`}</span>
              <span>{`Text: ${data?.notifications?.text_ready ? 'ready' : 'not set up'}`}</span>
            </p>
          )}
          footnote="Read-only notification configuration from your workspace."
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
          footnote="Read-only connected-systems list from your workspace."
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
            <p className="sample-label">Team members are managed on Team &amp; dispatch.</p>
            <div className="dialog-actions">
              <a className="btn btn--secondary agent-btn" href="#/team" onClick={close}>Open team management</a>
              <Button className="btn btn--secondary agent-btn" onClick={close}>Close</Button>
            </div>
          </div>
        </Dialog>
      ) : null}
      {dialog?.kind === 'billing' ? <BillingDialog billing={billing} onClose={close} /> : null}
      {dialog?.kind === 'jobber' ? (
        <JobberSetupDialog item={jobber} onClose={close} onChanged={onJobberChanged} />
      ) : null}
      {dialog?.kind === 'servicetitan' ? (
        <ServiceTitanSetupDialog item={stItem} onClose={close} onSaved={onServiceTitanSaved} />
      ) : null}
    </>
  );
}
