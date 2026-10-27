// Leads: people who asked for service from an ad or form (and old leads to win back), the calls made to reach them, and how fast the first call goes out.
// It shows whether the system may call anyone at all (the dial mode is a server setting, never a button here), and never shows a lead a person's phone
// number to someone who may not see it: the server refuses viewers.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, percent } from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Empty, ErrorBox, Field, Note, Overlay, PageHeader, Select, Spinner, toast, useRun,
} from '../lib/ui.jsx';

const STATUS = {
  new: ['Waiting for first call', 'warn'], retry: ['Will try again', 'info'], dialing: ['Calling now', 'info'], contacted: ['Spoke to them', 'good'],
  qualified: ['Job details taken', 'good'], booked: ['Booked', 'good'], callback: ['Call back later', 'info'], not_interested: ['Not interested', 'neutral'],
  wrong_number: ['Wrong number', 'neutral'], opted_out: ['Asked to stop', 'bad'], no_answer: ['No answer', 'neutral'], blocked: ['Not allowed to call', 'bad'],
};
const StatusBadge = ({ status }) => { const [text, tone] = STATUS[status] || [status, 'neutral']; return <Badge text={text} tone={tone} />; };
const SOURCES = { meta: 'Meta ad', google: 'Google ad', web: 'Website', import: 'Imported', manual: 'Added by hand', jobber: 'Jobber' };
const seconds = (s) => (s === null || s === undefined ? '-' : s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
const MODE = {
  off: ['Calling is OFF', 'neutral', 'Nobody is called. Leads are collected and shown here.'],
  dry_run: ['Practice mode', 'warn', 'Every call is decided and recorded, but nothing is dialled.'],
  live: ['Calling is ON', 'good', 'Real calls are placed, only when the consent checks pass.'],
};

// Loads something and keeps the last result: { data } or { error }, empty until the first answer. A superseded request is ignored.
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

function ModeBanner({ status }) {
  const [title, tone, text] = MODE[status.dial_mode] || [status.dial_mode, 'neutral', ''];
  const warnings = [];
  if (!status.enabled) warnings.push('Leads are switched off in the server settings (LEADS_ENABLED).');
  if (status.dial_mode === 'live' && !status.consent_engine_on) warnings.push('The consent engine is off: live calling will not start.');
  if (!status.form_consent_wording_set) warnings.push('No consent wording is set for your forms, so ad leads will not be called until it is (LEADS_CONSENT_TEXT).');
  if (status.allow_list_active) warnings.push('A test allow-list is active: only the numbers on it can be dialled.');
  return (
    <section className="card stack" aria-label="Calling status">
      <div className="between"><h2>Calling</h2><Badge text={title} tone={tone} /></div>
      <p className="muted">{text}</p>
      <div className="row wrap">
        {Object.entries(status.platforms).map(([name, on]) => <Badge key={name} text={`${SOURCES[name] || name}: ${on ? 'connected' : 'not set up'}`} tone={on ? 'good' : 'neutral'} />)}
      </div>
      {warnings.map((w, i) => <Note key={i} text={w} tone="warn" />)}
    </section>
  );
}

function SummaryCards({ s }) {
  const sp = s.speed_to_lead;
  const Card = ({ title, value, hint }) => <div className="stat"><strong>{value}</strong><span>{title}</span>{hint ? <small className="muted">{hint}</small> : null}</div>;
  return (
    <section className="row wrap" aria-label="The last days">
      <Card title="Leads" value={String(s.leads)} hint={`last ${s.days} days`} />
      <Card title="First call, typical" value={seconds(sp.first_call_median_s)} hint={`promise: ${s.sla_seconds} s`} />
      <Card title="First call within the promise" value={percent(sp.first_call_within_sla_share)} hint={`${sp.first_call_within_sla} of ${sp.leads}`} />
      <Card title="Reached a person" value={percent(sp.reached_share)} hint={`${sp.reached} of ${sp.leads}`} />
      <Card title="Waiting past the promise now" value={String(s.waiting_past_sla_now)} hint={s.waiting_past_sla_now ? 'needs a look' : 'all on time'} />
    </section>
  );
}

// Jobber: a company that uses Jobber connects its own account once (it logs in at Jobber and clicks Allow; we never see its password), and every new request there becomes a lead.
// Admins only: the server refuses everyone else.
function JobberCard() {
  const [state, load] = useLoader(() => api('/v1/jobber/status'));
  useEffect(() => { load(); }, [load]);
  const s = state.data;
  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!s) content = <Spinner />;
  else if (!s.configured) {
    content = (
      <>
        <div className="between"><h2>Jobber</h2><Badge text="not set up on this server" tone="neutral" /></div>
        <p className="muted">To take in new requests from Jobber, the person who runs the product sets the Jobber keys on the server first (docs/JOBBER.md).</p>
      </>
    );
  } else {
    content = (
      <>
        <div className="between">
          <h2>Jobber</h2>
          {s.connected ? <Badge text={`connected: ${s.account_name || 'your account'}`} tone="good" /> : s.status === 'needs_reconnect' ? <Badge text="log in again" tone="bad" /> : <Badge text="not connected" tone="neutral" />}
        </div>
        {s.status === 'needs_reconnect' ? <Note text="Jobber no longer accepts the saved login. Press Connect again." tone="bad" /> : null}
        {s.connected ? <p className="muted">{`New requests in Jobber become leads here. Last checked: ${s.last_synced_at ? formatDateTime(s.last_synced_at) : 'not yet'}.`}</p>
          : <p className="muted">Connect your Jobber account and every new request there becomes a lead, with the same consent and calling-hours checks as every other lead.</p>}
        {s.last_error ? <Note text={s.last_error} tone="warn" /> : null}
        <div className="row wrap">
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              const out = await api('/v1/jobber/connect', { method: 'POST' });
              window.open(out.url, '_blank', 'noopener');
              toast('Jobber opened in a new tab. Log in there, click Allow, then come back and press Refresh.');
            }}
          >{s.connected ? 'Connect again' : 'Connect Jobber'}</ActionButton>
          <Button className="btn btn--outline" onClick={() => load()}>Refresh</Button>
          {s.connected ? (
            <ActionButton
              className="btn btn--outline"
              action={async () => {
                const out = await api('/v1/jobber/sync', { method: 'POST' });
                toast(out.skipped ? `Not checked: ${out.skipped}` : `${out.new} new request${out.new === 1 ? '' : 's'} taken in.`, out.skipped ? 'warn' : 'good');
                load();
              }}
            >Check for new requests now</ActionButton>
          ) : null}
          {s.connected ? (
            <ActionButton className="btn btn--ghost" action={async () => { await api('/v1/jobber/disconnect', { method: 'POST' }); toast('Jobber was disconnected.'); load(); }}>Disconnect</ActionButton>
          ) : null}
        </div>
      </>
    );
  }
  return <section className="card stack" aria-label="Jobber">{content}</section>;
}

const NOT_CALLABLE = ['dialing', 'opted_out', 'wrong_number'];

// Ask for this person to be called now. The same checks as the automatic flow still apply (consent, calling hours, the test allow-list); the button only skips the wait.
function CallDialog({ lead, reload, onClose }) {
  return (
    <Overlay title="Call this lead" onClose={onClose}>
      <div className="stack">
        <p>{`Call ${lead.name || lead.phone} now? The assistant rings them straight away.`}</p>
        <p className="muted">It still follows the consent, calling-hours and allow-list checks, so a call that is not allowed is refused with the reason.</p>
        <div className="right">
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              const out = await api(`/v1/leads/${lead.id}/call`, { method: 'POST' });
              onClose();
              toast(out.placed ? 'Calling now. The phone should ring within a few seconds.' : `Not called: ${out.reason}`, out.placed ? 'good' : 'warn');
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
    if (f.consent && !f.text.trim()) { toast('Say where or how they agreed to be called.', 'bad'); return; }
    run(async () => {
      const out = await api('/v1/leads', { method: 'POST', body: { phone: f.phone.trim(), name: f.name.trim() || null, interest: f.interest.trim() || null,
        address: f.address.trim() || null, campaign_id: f.campaign ? Number(f.campaign) : null, consent: f.consent, consent_text: f.text.trim() || null } });
      toast(out.consent_added ? 'That lead was already on the list: their consent is now recorded.' : out.duplicate ? 'That lead is already on the list.' : 'Lead added.', out.duplicate && !out.consent_added ? 'warn' : 'good');
      onClose();
      reload();
    });
  };
  return (
    <Overlay title="Add a lead" wide onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <div className="grid2">
          <Field label="Name"><input type="text" value={f.name} onChange={set('name')} /></Field>
          <Field label="Phone" hint="With area code, e.g. (803) 555-0142"><input type="text" inputMode="tel" value={f.phone} onChange={set('phone')} /></Field>
          <Field label="What they asked about"><input type="text" value={f.interest} onChange={set('interest')} /></Field>
          <Field label="Address"><input type="text" value={f.address} onChange={set('address')} /></Field>
          <Field label="Campaign"><Select options={[['', 'Default']].concat(campaigns.map((c) => [String(c.id), c.name]))} value={f.campaign} onChange={set('campaign')} /></Field>
        </div>
        <label className="check"><input type="checkbox" checked={f.consent} onChange={set('consent')} />They agreed to be called (including by an AI voice) about this</label>
        <Field label="Where or how they agreed" hint="Required if the box is ticked: kept as proof of consent"><input type="text" value={f.text} onChange={set('text')} /></Field>
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Add lead</button></div>
      </form>
    </Overlay>
  );
}

function ImportDialog({ campaigns, reload, onClose }) {
  const [text, setText] = useState('');
  const [campaign, setCampaign] = useState('');
  const [result, setResult] = useState(null);
  return (
    <Overlay title="Import old leads" wide onClose={onClose}>
      <div className="stack">
        <p className="muted">A header row, then one lead per line. Columns: name, phone (required), email, address, last_service, consent (yes), consent_text. Someone is only treated as having agreed to be called when the consent column says yes and the file says where; everyone else is kept but will not be called.</p>
        <Field label="Choose a file"><input type="file" accept=".csv,text/csv" onChange={async (e) => { const file = e.target.files[0]; if (file) setText(await file.text()); }} /></Field>
        <Field label="Or paste the text"><textarea rows={8} aria-label="CSV text" placeholder="name,phone,email,last_service,consent,consent_text" value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <Field label="Campaign"><Select options={[['', 'Default reactivation campaign']].concat(campaigns.filter((c) => c.kind === 'reactivation').map((c) => [String(c.id), c.name]))} value={campaign} onChange={(e) => setCampaign(e.target.value)} /></Field>
        <div>
          {result && (
            <>
              <Note text={`${result.imported} imported, ${result.duplicates} already there, ${result.rejected} refused, ${result.without_consent} without consent (kept, will not be called).`} tone={result.rejected ? 'warn' : 'good'} />
              {result.problems.length ? <ul>{result.problems.map((p, i) => <li key={i}>{`Line ${p.row}: ${p.problem}`}</li>)}</ul> : null}
            </>
          )}
        </div>
        <div className="right">
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              if (!text.trim()) { toast('Choose a file or paste the leads first.', 'bad'); return; }
              const out = await api('/v1/leads/import', { method: 'POST', body: { csv: text, campaign_id: campaign ? Number(campaign) : null } });
              setResult(out);
              reload();
            }}
          >Import</ActionButton>
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
    if (!f.name.trim()) { toast('Give the campaign a name.', 'bad'); return; }
    run(async () => {
      await api('/v1/leads/campaigns', { method: 'POST', body: { name: f.name.trim(), kind: f.kind, purpose: f.purpose, max_attempts: f.attempts ? Number(f.attempts) : null,
        retry_minutes: f.retry.trim() || null, calls_per_hour: f.pace ? Number(f.pace) : null, script_note: f.note.trim() || null } });
      toast('Campaign created.');
      onClose();
      reload();
    });
  };
  return (
    <Overlay title="New campaign" wide onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <div className="grid2">
          <Field label="Name"><input type="text" value={f.name} onChange={set('name')} /></Field>
          <Field label="Kind"><Select options={[['speed_to_lead', 'Speed to lead (a new ad lead, called within a minute)'], ['reactivation', 'Reactivation (calling old leads)']]} value={f.kind} onChange={set('kind')} /></Field>
          <Field label="Why they are called"><Select options={[['marketing', 'Marketing (needs written consent: the safe default)'], ['service', 'Service follow-up (follow up a request they made)']]} value={f.purpose} onChange={set('purpose')} /></Field>
          <Field label="Most attempts"><input type="number" min={1} max={10} placeholder="company default" value={f.attempts} onChange={set('attempts')} /></Field>
          <Field label="Waits between attempts" hint="Minutes, comma separated"><input type="text" placeholder="e.g. 5,60,1440 (minutes)" value={f.retry} onChange={set('retry')} /></Field>
          <Field label="Pace" hint="Most calls an hour for this campaign"><input type="number" min={1} max={600} placeholder="calls per hour" value={f.pace} onChange={set('pace')} /></Field>
        </div>
        <Field label="What the AI should say the call is about" hint="For example the spring tune-up offer"><textarea rows={3} value={f.note} onChange={set('note')} /></Field>
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Create campaign</button></div>
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
  else if (!l) content = <Spinner />;
  else {
    content = (
      <>
        <div className="row wrap"><StatusBadge status={l.status} /><Badge text={SOURCES[l.source] || l.source} />{l.has_consent ? <Badge text="consent on record" tone="good" /> : <Badge text="no consent on record" tone="warn" />}</div>
        {l.status_reason ? <Note text={l.status_reason} tone="info" /> : null}
        <Details rows={[['Name', l.name], ['Phone', l.phone], ['Email', l.email], ['Address', l.address], ['Asked about', l.interest], ['Arrived', formatDateTime(l.first_seen_at)],
          ['First call after', seconds(l.seconds_to_first_call)], ['Reached after', seconds(l.seconds_to_first_contact)], ['Attempts', String(l.attempts)],
          ['Next attempt', l.next_attempt_at ? formatDateTime(l.next_attempt_at) : null], ['Consent wording', l.consent_text]]} />
        <h3>Calls</h3>
        {l.attempt_log.length ? (
          <DataTable
            head={['#', 'When', 'What happened', 'How it ended']}
            rows={l.attempt_log.map((a) => [String(a.number), formatDateTime(a.started_at),
              [a.status, a.policy_code && a.policy_code !== 'ok' ? ` (${a.policy_code.replaceAll('_', ' ')})` : ''].join(''), [a.result, a.error || a.notes].filter(Boolean).join(': ') || '-'])}
          />
        ) : <Empty text="No call has been made yet." />}
        {can('dispatcher', 'admin') && ['blocked', 'no_answer', 'new', 'not_interested'].includes(l.status) ? (
          <ActionButton className="btn btn--outline" action={async () => { await api(`/v1/leads/${id}/requeue`, { method: 'POST' }); toast('Back in the queue.'); onClose(); reload(); }}>Put back in the queue</ActionButton>
        ) : null}
      </>
    );
  }
  return (
    <Overlay title="Lead" wide onClose={onClose}>
      <div className="stack">{content}</div>
    </Overlay>
  );
}

export default function Leads() {
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState(null); // { type: 'call', lead } | { type: 'lead', id } | { type: 'add' | 'import' | 'campaign' }
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

  let topContent = null;
  if (top.error) topContent = <ErrorBox error={top.error} />;
  else if (top.data) topContent = <><ModeBanner status={top.data.status} /><SummaryCards s={top.data.summary} /></>;

  let campaignsContent = null;
  if (camp.error) campaignsContent = <ErrorBox error={camp.error} />;
  else if (camp.data) {
    campaignsContent = camp.data.length ? (
      <DataTable
        head={['Campaign', 'Kind', 'State', 'Leads', 'Pace', '']}
        rows={camp.data.map((c) => [c.name, c.kind === 'reactivation' ? 'Reactivation' : 'Speed to lead', <Badge text={c.status} tone={c.status === 'active' ? 'good' : 'neutral'} />, String(c.leads), c.calls_per_hour ? `${c.calls_per_hour}/h` : '-',
          writer && c.status !== 'finished' ? (
            <ActionButton
              className="btn btn--outline btn--small"
              action={async () => { await api(`/v1/leads/campaigns/${c.id}/status`, { method: 'POST', body: { status: c.status === 'active' ? 'paused' : 'active' } }); loadCampaigns(); }}
            >{c.status === 'active' ? 'Pause' : 'Resume'}</ActionButton>
          ) : null])}
      />
    ) : <Empty text="No campaign yet: one is made automatically for the first lead." />;
  }

  let listContent;
  if (list.error) listContent = <ErrorBox error={list.error} />;
  else if (!list.data) listContent = <Spinner />;
  else if (!list.data.length) listContent = <Empty text="No leads yet." />;
  else {
    const rows = list.data;
    listContent = (
      <DataTable
        head={['Lead', 'Source', 'Asked about', 'Status', 'First call', 'Attempts', 'Arrived', '']}
        rows={rows.map((r) => [r.name || r.phone, SOURCES[r.source] || r.source, r.interest || '-', <StatusBadge status={r.status} />,
          seconds(r.seconds_to_first_call), String(r.attempts), formatDateTime(r.first_seen_at),
          writer && !NOT_CALLABLE.includes(r.status) ? <Button className="btn btn--outline btn--small" aria-label={`Call ${r.name || r.phone} now`} onClick={(event) => { event.stopPropagation(); setDialog({ type: 'call', lead: r }); }}>Call now</Button> : null])}
        onRow={(_c, i) => setDialog({ type: 'lead', id: rows[i].id })}
        label="Leads"
      />
    );
  }

  return (
    <>
      <PageHeader title="Leads" subtitle="New leads from your ads and old leads to win back, and how fast the first call goes out.">
        {writer && <Button className="btn btn--primary" onClick={() => setDialog({ type: 'add' })}>Add a lead</Button>}
        {writer && <Button className="btn btn--outline" onClick={() => setDialog({ type: 'import' })}>Import old leads</Button>}
        {writer && <Button className="btn btn--outline" onClick={() => setDialog({ type: 'campaign' })}>New campaign</Button>}
      </PageHeader>
      <div className="stack">{topContent}</div>
      {can('admin') ? <JobberCard /> : null}
      <section><h2>Campaigns</h2><div>{campaignsContent}</div></section>
      <section>
        <div className="between">
          <h2>Leads</h2>
          <Select options={[['', 'All leads'], ...Object.entries(STATUS).map(([k, v]) => [k, v[0]])]} value={status} aria-label="Show" onChange={(e) => setStatus(e.target.value)} />
        </div>
        <div>{listContent}</div>
      </section>
      {dialog?.type === 'call' && <CallDialog lead={dialog.lead} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'lead' && <LeadDialog id={dialog.id} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'add' && <AddDialog campaigns={campaigns} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'import' && <ImportDialog campaigns={campaigns} reload={reloadAll} onClose={close} />}
      {dialog?.type === 'campaign' && <CampaignDialog reload={reloadAll} onClose={close} />}
    </>
  );
}
