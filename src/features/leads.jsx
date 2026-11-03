// Leads: people who asked for service from an ad or form (and old leads to win back), the calls made to reach them, and how fast the first call goes out.
// It shows whether the system may call anyone at all (the dial mode is a server setting, never a button here), and never shows a lead a person's phone
// number to someone who may not see it: the server refuses viewers.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, percent } from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, Card, DataTable, Details, Empty, ErrorBox, Field, Note, Overlay, PageHeader, Select, Spinner, StatGrid, Tabs, toast, useRun, Icon,
} from '../components/index.js';

export const STATUS = {
  new: ['Waiting for first call', 'warn'],
  retry: ['Will try again', 'info'],
  dialing: ['Calling now', 'info'],
  contacted: ['Spoke to them', 'good'],
  qualified: ['Job details taken', 'good'],
  booked: ['Booked', 'good'],
  callback: ['Call back later', 'info'],
  not_interested: ['Not interested', 'neutral'],
  wrong_number: ['Wrong number', 'neutral'],
  opted_out: ['Asked to stop', 'bad'],
  no_answer: ['No answer', 'neutral'],
  blocked: ['Not allowed to call', 'bad'],
};

export const StatusBadge = ({ status }) => {
  const [text, tone] = STATUS[status] || [status, 'neutral'];
  return <Badge text={text} tone={tone} />;
};

export const SOURCES = {
  meta: 'Meta ad',
  google: 'Google ad',
  web: 'Website',
  import: 'Imported',
  manual: 'Added by hand',
  jobber: 'Jobber',
};

export const seconds = (s) => (s === null || s === undefined ? '-' : s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);

export const MODE = {
  off: ['Calling is OFF', 'neutral', 'Nobody is called. Leads are collected and shown here.'],
  dry_run: ['Practice mode', 'warn', 'Every call is decided and recorded, but nothing is dialled.'],
  live: ['Calling is ON', 'good', 'Real calls are placed, only when the consent checks pass.'],
};

function useLoader(fetcher) {
  const [state, setState] = useState({});
  const seq = useRef(0);
  const latest = useRef(fetcher);
  latest.current = fetcher;
  const load = useCallback(async () => {
    const n = ++seq.current;
    try {
      const data = await latest.current();
      if (n === seq.current) setState({ data });
    } catch (error) {
      if (n === seq.current) setState({ error });
    }
  }, []);
  return [state, load];
}

export function ModeBanner({ status }) {
  const [title, tone, text] = MODE[status.dial_mode] || [status.dial_mode, 'neutral', ''];
  const warnings = [];
  if (!status.enabled) warnings.push('Leads are switched off in the server settings (LEADS_ENABLED).');
  if (status.dial_mode === 'live' && !status.consent_engine_on) warnings.push('The consent engine is off: live calling will not start.');
  if (!status.form_consent_wording_set) warnings.push('No consent wording is set for your forms, so ad leads will not be called until it is (LEADS_CONSENT_TEXT).');
  if (status.allow_list_active) warnings.push('A test allow-list is active: only the numbers on it can be dialled.');

  return (
    <Card as="section" aria-label="Calling status">
      <div className="between" style={{ marginBottom: '8px' }}>
        <div>
          <h2>Automated Dialer</h2>
          <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.86rem' }}>{text}</p>
        </div>
        <Badge text={title} tone={tone} />
      </div>

      <div style={{ marginTop: '14px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '0.04em' }}>Connected Platforms</h4>
        <div className="row wrap">
          {Object.entries(status.platforms).map(([name, on]) => (
            <span key={name} className={`leads-platform-pill ${on ? 'leads-platform-pill--on' : ''}`}>
              <span className="dot" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />
              <span>{SOURCES[name] || name}</span>
            </span>
          ))}
        </div>
      </div>

      {warnings.length ? (
        <div className="stack" style={{ marginTop: '14px' }}>
          {warnings.map((w, i) => <Note key={i} text={w} tone="warn" />)}
        </div>
      ) : null}
    </Card>
  );
}

export function SummaryCards({ s }) {
  const sp = s.speed_to_lead;
  const items = [
    ['Total Leads', String(s.leads), `Last ${s.days} days`, 'leads'],
    ['Median First Call', seconds(sp.first_call_median_s), `SLA promise: ${s.sla_seconds} s`, 'phone'],
    ['Within Promise SLA', percent(sp.first_call_within_sla_share), `${sp.first_call_within_sla} of ${sp.leads} on time`, 'tracking'],
    ['Contact Rate', percent(sp.reached_share), `${sp.reached} people reached`, 'users'],
    ['Waiting Past Promise', String(s.waiting_past_sla_now), s.waiting_past_sla_now ? 'Needs attention' : 'All on time', 'attention'],
  ];

  return <StatGrid items={items} />;
}

export function JobberCard() {
  const [state, load] = useLoader(() => api('/v1/jobber/status'));
  useEffect(() => { load(); }, [load]);
  const s = state.data;
  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!s) content = <Spinner />;
  else if (!s.configured) {
    content = (
      <>
        <div className="between" style={{ marginBottom: '8px' }}>
          <div>
            <h2>Jobber Integration</h2>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.86rem' }}>Sync requests directly from your Jobber account.</p>
          </div>
          <Badge text="Not configured" tone="neutral" />
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>To take in new requests from Jobber, set the Jobber API credentials in your server environment.</p>
      </>
    );
  } else {
    content = (
      <>
        <div className="between" style={{ marginBottom: '8px' }}>
          <div>
            <h2>Jobber Integration</h2>
            <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.86rem' }}>
              {s.connected ? `Connected: ${s.account_name || 'Active Account'}` : 'Connect your account to automatically import client requests as leads.'}
            </p>
          </div>
          {s.connected ? <Badge text="Connected" tone="good" /> : s.status === 'needs_reconnect' ? <Badge text="Needs Reconnect" tone="bad" /> : <Badge text="Not Connected" tone="neutral" />}
        </div>
        {s.status === 'needs_reconnect' ? <Note text="Jobber authorization expired. Reconnect your account." tone="bad" /> : null}
        {s.connected ? <p className="muted" style={{ fontSize: '0.84rem' }}>{`Last synchronized: ${s.last_synced_at ? formatDateTime(s.last_synced_at) : 'Not synced yet'}.`}</p> : null}
        {s.last_error ? <Note text={s.last_error} tone="warn" /> : null}
        <div className="row wrap" style={{ marginTop: '12px' }}>
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              const out = await api('/v1/jobber/connect', { method: 'POST' });
              window.open(out.url, '_blank', 'noopener');
              toast('Jobber authorization opened in a new tab.');
            }}
          >{s.connected ? 'Reconnect Jobber' : 'Connect Jobber'}</ActionButton>
          <Button className="btn btn--outline" onClick={() => load()}>Refresh</Button>
          {s.connected ? (
            <ActionButton
              className="btn btn--outline"
              action={async () => {
                const out = await api('/v1/jobber/sync', { method: 'POST' });
                toast(out.skipped ? `Not checked: ${out.skipped}` : `${out.new} new request${out.new === 1 ? '' : 's'} imported.`, out.skipped ? 'warn' : 'good');
                load();
              }}
            >Sync requests now</ActionButton>
          ) : null}
          {s.connected ? (
            <ActionButton className="btn btn--ghost" action={async () => { await api('/v1/jobber/disconnect', { method: 'POST' }); toast('Jobber disconnected.'); load(); }}>Disconnect</ActionButton>
          ) : null}
        </div>
      </>
    );
  }
  return <Card as="section" aria-label="Jobber">{content}</Card>;
}

const NOT_CALLABLE = ['dialing', 'opted_out', 'wrong_number'];

function CallDialog({ lead, reload, onClose }) {
  return (
    <Overlay title="Call this lead" onClose={onClose}>
      <div className="stack">
        <p style={{ margin: 0 }}>{`Call ${lead.name || lead.phone} immediately? The voice assistant will place the call within seconds.`}</p>
        <p className="muted" style={{ fontSize: '0.86rem' }}>Subject to consent verification, allowed calling hours, and allow-list rules.</p>
        <div className="right">
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              const out = await api(`/v1/leads/${lead.id}/call`, { method: 'POST' });
              onClose();
              toast(out.placed ? 'Calling now. The phone should ring within seconds.' : `Call not placed: ${out.reason}`, out.placed ? 'good' : 'warn');
              reload();
            }}
          >Call now</ActionButton>
        </div>
      </div>
    </Overlay>
  );
}

function AddDialog({ campaigns, reload, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', interest: '', address: '', campaign: '', consent: false, text: '' });
  const set = (key) => (e) => setF((v) => ({ ...v, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const [busy, run] = useRun();
  const submit = (event) => {
    event.preventDefault();
    if (!f.phone.trim()) { toast('Enter a phone number.', 'bad'); return; }
    if (f.consent && !f.text.trim()) { toast('Specify how consent was obtained.', 'bad'); return; }
    run(async () => {
      const out = await api('/v1/leads', { method: 'POST', body: { phone: f.phone.trim(), name: f.name.trim() || null, interest: f.interest.trim() || null,
        address: f.address.trim() || null, campaign_id: f.campaign ? Number(f.campaign) : null, consent: f.consent, consent_text: f.text.trim() || null } });
      toast(out.consent_added ? 'Lead was already recorded; consent updated.' : out.duplicate ? 'Lead already exists on this list.' : 'Lead added successfully.', out.duplicate && !out.consent_added ? 'warn' : 'good');
      onClose();
      reload();
    });
  };
  return (
    <Overlay title="Add New Lead" wide onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <div className="grid2">
          <Field label="Full Name"><input type="text" placeholder="John Doe" value={f.name} onChange={set('name')} /></Field>
          <Field label="Phone Number" hint="With area code, e.g. (803) 555-0142"><input type="text" inputMode="tel" placeholder="(803) 555-0142" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="Interest / Service Needed"><input type="text" placeholder="e.g. AC Repair" value={f.interest} onChange={set('interest')} /></Field>
          <Field label="Address"><input type="text" placeholder="123 Main St, City" value={f.address} onChange={set('address')} /></Field>
          <Field label="Campaign"><Select options={[['', 'Default Campaign']].concat(campaigns.map((c) => [String(c.id), c.name]))} value={f.campaign} onChange={set('campaign')} /></Field>
        </div>
        <label className="check" style={{ marginTop: '4px' }}>
          <input type="checkbox" checked={f.consent} onChange={set('consent')} />
          Customer provided express consent to be contacted (including automated voice calls)
        </label>
        <Field label="Consent Source / Proof" hint="Required when consent is checked (e.g. Website lead form opt-in checkbox)"><input type="text" placeholder="e.g. Online contact form opt-in" value={f.text} onChange={set('text')} /></Field>
        <div className="right" style={{ marginTop: '8px' }}>
          <button type="submit" className="btn btn--primary" disabled={busy}>Add lead</button>
        </div>
      </form>
    </Overlay>
  );
}

function ImportDialog({ campaigns, reload, onClose }) {
  const [text, setText] = useState('');
  const [campaign, setCampaign] = useState('');
  const [result, setResult] = useState(null);
  return (
    <Overlay title="Import Leads (CSV)" wide onClose={onClose}>
      <div className="stack">
        <p className="muted" style={{ fontSize: '0.86rem', margin: 0 }}>
          Upload or paste a CSV with columns: <code>name, phone, email, address, last_service, consent, consent_text</code>. Leads with consent marked <code>yes</code> will be enrolled for outreach.
        </p>
        <Field label="Upload CSV File"><input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files[0]; if (file) setText(await file.text()); }} /></Field>
        <Field label="Or Paste CSV Data"><textarea rows={6} aria-label="CSV text" placeholder="name,phone,email,last_service,consent,consent_text" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <Field label="Assign Campaign"><Select options={[['', 'Default reactivation campaign']].concat(campaigns.filter((c) => c.kind === 'reactivation').map((c) => [String(c.id), c.name]))} value={campaign} onChange={setCampaign} /></Field>
        {result ? (
          <div>
            <Note text={`${result.imported} imported, ${result.duplicates} duplicates, ${result.rejected} rejected, ${result.without_consent} without consent.`} tone={result.rejected ? 'warn' : 'good'} />
            {result.problems?.length ? <ul>{result.problems.map((p, i) => <li key={i}>{`Line ${p.row}: ${p.problem}`}</li>)}</ul> : null}
          </div>
        ) : null}
        <div className="right">
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              if (!text.trim()) { toast('Provide CSV data first.', 'bad'); return; }
              const out = await api('/v1/leads/import', { method: 'POST', body: { csv: text, campaign_id: campaign ? Number(campaign) : null } });
              setResult(out);
              reload();
            }}
          >Import leads</ActionButton>
        </div>
      </div>
    </Overlay>
  );
}

function CampaignDialog({ reload, onClose }) {
  const [f, setF] = useState({ name: '', kind: 'speed_to_lead', purpose: 'marketing', attempts: '', retry: '', pace: '', note: '' });
  const set = (key) => (e) => setF((v) => ({ ...v, [key]: e.target.value }));
  const [busy, run] = useRun();
  const submit = (event) => {
    event.preventDefault();
    if (!f.name.trim()) { toast('Please enter a campaign name.', 'bad'); return; }
    run(async () => {
      await api('/v1/leads/campaigns', { method: 'POST', body: { name: f.name.trim(), kind: f.kind, purpose: f.purpose, max_attempts: f.attempts ? Number(f.attempts) : null,
        retry_minutes: f.retry.trim() || null, calls_per_hour: f.pace ? Number(f.pace) : null, script_note: f.note.trim() || null } });
      toast('Campaign created.');
      onClose();
      reload();
    });
  };
  return (
    <Overlay title="Create Outreach Campaign" wide onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <div className="grid2">
          <Field label="Campaign Name"><input type="text" placeholder="e.g. Google Ads Spring Rush" value={f.name} onChange={set('name')} /></Field>
          <Field label="Campaign Type"><Select options={[['speed_to_lead', 'Speed to lead (Instant outreach to new ad leads)'], ['reactivation', 'Reactivation (Win back past customers)']]} value={f.kind} onChange={set('kind')} /></Field>
          <Field label="Outreach Purpose"><Select options={[['marketing', 'Marketing / Promotion (requires written consent)'], ['service', 'Service follow-up (inquiry callback)']]} value={f.purpose} onChange={set('purpose')} /></Field>
          <Field label="Max Attempts"><input type="number" min={1} max={10} placeholder="3" value={f.attempts} onChange={set('attempts')} /></Field>
          <Field label="Retry Intervals (minutes)" hint="e.g. 5, 60, 1440"><input type="text" placeholder="5, 60, 1440" value={f.retry} onChange={set('retry')} /></Field>
          <Field label="Dialing Pace" hint="Max outbound calls/hour"><input type="number" min={1} max={600} placeholder="30" value={f.pace} onChange={set('pace')} /></Field>
        </div>
        <Field label="Assistant Script Instructions" hint="What should the voice assistant emphasize during the call?"><textarea rows={3} placeholder="e.g. Mention our free seasonal inspection special..." value={f.note} onChange={set('note')} /></Field>
        <div className="right">
          <button type="submit" className="btn btn--primary" disabled={busy}>Create campaign</button>
        </div>
      </form>
    </Overlay>
  );
}

function LeadDialog({ id, reload, onClose }) {
  const [state, setState] = useState({});
  useEffect(() => {
    let current = true;
    setState({});
    (async () => {
      try {
        const l = await api(`/v1/leads/${id}`);
        if (current) setState({ lead: l });
      } catch (error) {
        if (current) setState({ error });
      }
    })();
    return () => { current = false; };
  }, [id]);

  const l = state.lead;
  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!l) content = <Spinner text="Loading lead record..." />;
  else {
    content = (
      <>
        <div className="drawer-header-pill">
          <StatusBadge status={l.status} />
          <Badge text={SOURCES[l.source] || l.source} tone="neutral" />
          {l.has_consent ? <Badge text="Consent on record" tone="good" /> : <Badge text="No consent on record" tone="warn" />}
        </div>

        {l.status_reason ? <Note text={l.status_reason} tone="info" /> : null}

        <div className="drawer-card">
          <h4>Lead Details</h4>
          <Details rows={[
            ['Full Name', l.name],
            ['Phone Number', l.phone],
            ['Email Address', l.email],
            ['Address', l.address],
            ['Service Interest', l.interest],
            ['First Seen', formatDateTime(l.first_seen_at)],
            ['Consent Documentation', l.consent_text],
          ]} />
        </div>

        <div className="drawer-card">
          <h4>Outreach Performance</h4>
          <Details rows={[
            ['Time to First Call', seconds(l.seconds_to_first_call)],
            ['Time to Contact', seconds(l.seconds_to_first_contact)],
            ['Total Attempts', String(l.attempts)],
            ['Next Scheduled Attempt', l.next_attempt_at ? formatDateTime(l.next_attempt_at) : 'None planned'],
          ]} />
        </div>

        <div className="drawer-card">
          <h4>Call Attempt History</h4>
          {l.attempt_log?.length ? (
            <DataTable
              head={['#', 'Date & Time', 'Status / Code', 'Result / Notes']}
              rows={l.attempt_log.map((a) => [
                String(a.number),
                formatDateTime(a.started_at),
                [a.status, a.policy_code && a.policy_code !== 'ok' ? ` (${a.policy_code.replaceAll('_', ' ')})` : ''].join(''),
                [a.result, a.error || a.notes].filter(Boolean).join(': ') || '-',
              ])}
            />
          ) : <Empty text="No call attempts recorded yet." />}
        </div>

        {can('dispatcher', 'admin') && ['blocked', 'no_answer', 'new', 'not_interested'].includes(l.status) ? (
          <div className="right">
            <ActionButton
              className="btn btn--outline"
              action={async () => {
                await api(`/v1/leads/${id}/requeue`, { method: 'POST' });
                toast('Lead restored to dialing queue.');
                onClose();
                reload();
              }}
            >Re-queue for calling</ActionButton>
          </div>
        ) : null}
      </>
    );
  }
  return (
    <Overlay title={l?.name ? `Lead: ${l.name}` : 'Lead Details'} wide onClose={onClose}>
      <div className="stack">{content}</div>
    </Overlay>
  );
}

export default function Leads() {
  const [activeTab, setActiveTab] = useState('leads');
  const [status, setStatus] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const writer = can('dispatcher', 'admin');
  const campaignsSeen = useRef([]);

  const [top, loadTop] = useLoader(async () => {
    const [s, summary] = await Promise.all([api('/v1/leads/status'), api('/v1/leads/summary')]);
    return { status: s, summary };
  });

  const [camp, loadCampaigns] = useLoader(async () => {
    const out = (await api('/v1/leads/campaigns')).campaigns;
    campaignsSeen.current = out;
    return out;
  });

  const [list, loadList] = useLoader(async () => (await api('/v1/leads', { params: { status: status || undefined, limit: 100 } })).leads);
  const reloadAll = () => { loadTop(); loadCampaigns(); loadList(); };

  useEffect(() => { loadTop(); loadCampaigns(); }, [loadTop, loadCampaigns]);
  useEffect(() => { loadList(); }, [status, loadList]);
  useEvery(() => { loadTop(); loadList(); }, 10000);

  const close = () => setDialog(null);
  const campaigns = campaignsSeen.current;

  // Search filter across leads
  const filteredLeads = useMemo(() => {
    const all = list.data || [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => {
      const matchName = (r.name || '').toLowerCase().includes(q);
      const matchPhone = (r.phone || '').includes(q);
      const matchInterest = (r.interest || '').toLowerCase().includes(q);
      const matchSource = (r.source || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchInterest || matchSource;
    });
  }, [list.data, searchQuery]);

  // Lead status category counts for fast filtering
  const statusCounts = useMemo(() => {
    const counts = {};
    (list.data || []).forEach((r) => {
      counts[r.status] = (counts[r.status] || 0) + 1;
    });
    return counts;
  }, [list.data]);

  return (
    <div className="leads-container">
      <PageHeader title="Leads & Outreach" subtitle="Speed-to-lead automated callbacks, campaign management and acquisition metrics">
        {writer && (
          <div className="row wrap">
            <Button className="btn btn--primary" onClick={() => setDialog({ type: 'add' })}>
              <span>+ Add Lead</span>
            </Button>
            <Button className="btn btn--outline" onClick={() => setDialog({ type: 'import' })}>
              <span>Import CSV</span>
            </Button>
            <Button className="btn btn--outline" onClick={() => setDialog({ type: 'campaign' })}>
              <span>+ New Campaign</span>
            </Button>
          </div>
        )}
      </PageHeader>

      {/* Speed-to-lead performance metrics strip */}
      {top.data ? <SummaryCards s={top.data.summary} /> : top.error ? <ErrorBox error={top.error} /> : null}

      {/* Tabbed workspace view */}
      <Tabs
        options={[
          ['leads', `Leads Queue (${list.data?.length || 0})`],
          ['campaigns', `Campaigns (${camp.data?.length || 0})`],
          ['settings', 'Dialer & Integrations'],
        ]}
        value={activeTab}
        onChange={setActiveTab}
        label="Leads navigation"
      />

      {/* Tab 1: Leads Queue */}
      {activeTab === 'leads' && (
        <Card as="section">
          <div className="leads-toolbar">
            <div className="row wrap" style={{ flex: 1, minWidth: '240px' }}>
              <input
                type="search"
                className="leads-search-input"
                placeholder="Search by name, phone or interest..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Select
                options={[['', 'All Statuses'], ...Object.entries(STATUS).map(([k, v]) => [k, `${v[0]} (${statusCounts[k] || 0})`])]}
                value={status}
                aria-label="Filter status"
                onChange={(e) => setStatus(e.target.value)}
              />
            </div>

            <span className="muted small">
              {filteredLeads.length} {filteredLeads.length === 1 ? 'lead' : 'leads'} found
            </span>
          </div>

          {/* Quick filter pills */}
          <div className="jobs-status-strip" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`jobs-status-chip ${status === '' ? 'jobs-status-chip--active' : ''}`}
              onClick={() => setStatus('')}
            >
              <span>All</span>
              <span className="jobs-status-chip__count">{list.data?.length || 0}</span>
            </button>
            {['new', 'dialing', 'retry', 'contacted', 'qualified', 'booked'].map((st) => {
              const count = statusCounts[st] || 0;
              if (count === 0 && status !== st) return null;
              return (
                <button
                  key={st}
                  type="button"
                  className={`jobs-status-chip ${status === st ? 'jobs-status-chip--active' : ''}`}
                  onClick={() => setStatus((curr) => (curr === st ? '' : st))}
                >
                  <span className="jobs-status-chip__dot" />
                  <span>{STATUS[st][0]}</span>
                  <span className="jobs-status-chip__count">{count}</span>
                </button>
              );
            })}
          </div>

          {list.error ? (
            <ErrorBox error={list.error} />
          ) : !list.data ? (
            <Spinner text="Loading leads..." />
          ) : !filteredLeads.length ? (
            <Empty text={searchQuery ? 'No leads matched your search query.' : 'No leads recorded yet.'} />
          ) : (
            <DataTable
              head={['Lead Contact', 'Source', 'Service Interest', 'Status', 'First Call', 'Attempts', 'Arrived', 'Action']}
              rows={filteredLeads.map((r) => [
                <div key={r.id} className="leads-user-cell">
                  <span className="leads-avatar">{(r.name || r.phone || '?').slice(0, 1).toUpperCase()}</span>
                  <div className="leads-user-info">
                    <strong>{r.name || 'Unnamed Lead'}</strong>
                    <small>{r.phone}</small>
                  </div>
                </div>,
                <Badge key="src" text={SOURCES[r.source] || r.source} tone="neutral" />,
                r.interest || '-',
                <StatusBadge key="st" status={r.status} />,
                seconds(r.seconds_to_first_call),
                <span key="att" className="badge badge--neutral" style={{ padding: '2px 7px', fontSize: '0.74rem' }}>{r.attempts}</span>,
                formatDateTime(r.first_seen_at),
                writer && !NOT_CALLABLE.includes(r.status) ? (
                  <Button
                    key="act"
                    className="btn btn--outline btn--small"
                    aria-label={`Call ${r.name || r.phone} now`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDialog({ type: 'call', lead: r });
                    }}
                  >
                    <span>Call Now</span>
                  </Button>
                ) : null,
              ])}
              onRow={(_c, i) => setDialog({ type: 'lead', id: filteredLeads[i].id })}
              label="Leads Table"
            />
          )}
        </Card>
      )}

      {/* Tab 2: Campaigns */}
      {activeTab === 'campaigns' && (
        <Card as="section">
          <div className="between" style={{ marginBottom: '14px' }}>
            <div>
              <h2>Active Outreach Campaigns</h2>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: '0.86rem' }}>
                Speed-to-lead automated calls for new inquiries and win-back campaigns for past customers.
              </p>
            </div>
            {writer && (
              <Button className="btn btn--primary btn--small" onClick={() => setDialog({ type: 'campaign' })}>
                + New Campaign
              </Button>
            )}
          </div>

          {camp.error ? (
            <ErrorBox error={camp.error} />
          ) : !camp.data ? (
            <Spinner text="Loading campaigns..." />
          ) : !camp.data.length ? (
            <Empty text="No campaigns yet. One is automatically initialized when your first lead is received." />
          ) : (
            <DataTable
              head={['Campaign Name', 'Type', 'Status', 'Total Leads', 'Dialing Pace', 'Action']}
              rows={camp.data.map((c) => [
                <strong>{c.name}</strong>,
                <Badge text={c.kind === 'reactivation' ? 'Reactivation' : 'Speed to Lead'} tone={c.kind === 'reactivation' ? 'info' : 'neutral'} />,
                <Badge text={c.status} tone={c.status === 'active' ? 'good' : 'neutral'} />,
                String(c.leads),
                c.calls_per_hour ? `${c.calls_per_hour}/hr` : 'Default',
                writer && c.status !== 'finished' ? (
                  <ActionButton
                    className="btn btn--outline btn--small"
                    action={async () => {
                      await api(`/v1/leads/campaigns/${c.id}/status`, {
                        method: 'POST',
                        body: { status: c.status === 'active' ? 'paused' : 'active' },
                      });
                      loadCampaigns();
                    }}
                  >
                    {c.status === 'active' ? 'Pause' : 'Resume'}
                  </ActionButton>
                ) : null,
              ])}
              label="Campaigns Table"
            />
          )}
        </Card>
      )}

      {/* Tab 3: Dialer & Integrations */}
      {activeTab === 'settings' && (
        <div className="leads-integrations-grid">
          {top.data ? <ModeBanner status={top.data.status} /> : null}
          {can('admin') ? <JobberCard /> : null}
        </div>
      )}

      {/* Dialog Overlays */}
      {dialog?.type === 'call' && <CallDialog lead={dialog.lead} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'lead' && <LeadDialog id={dialog.id} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'add' && <AddDialog campaigns={campaigns} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'import' && <ImportDialog campaigns={campaigns} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'campaign' && <CampaignDialog reload={reloadAll} onClose={close} />}
    </div>
  );
}
