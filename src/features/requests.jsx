// Requests (the CSR side): what the AI front desk took on each call: who, what, how urgent, and what has happened since.
// Tabs: all requests, emergencies (a person must handle these), and the log of alerts sent to staff.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { CHANNELS, PRIORITIES, STATUS, formatDateTime, timeAgo } from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Empty, ErrorBox, Field, Overlay, PageHeader, Select, Spinner, StatusBadge, Tabs, toast,
} from '../components/index.js';
import { ScheduleFlow } from './schedule.jsx';
import { MemorySections } from './memory_panel.jsx';

const PAGE = 50;

// ---- rules (plain functions, nothing here touches the page) ----

export function matches(item, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const { customer, service_request: r } = item;
  const hay = [customer.name, customer.phone, customer.address, r.service_type, r.category, r.description, String(r.id)].join(' ').toLowerCase();
  return needle.split(/\s+/).every((word) => hay.includes(word));
}

export function alertSummary(alerts = []) {
  if (!alerts.length) return ['neutral', 'No alert recorded'];
  const failed = alerts.filter((a) => a.status === 'failed').length;
  if (failed === alerts.length) return ['bad', 'Alert failed'];
  if (failed) return ['warn', `Alert sent on ${alerts.length - failed} of ${alerts.length}`];
  return ['good', 'Alert sent'];
}

export const canSchedule = (item) => item.service_request.status === 'QUALIFIED' && !item.service_request.is_emergency && !item.appointment_id;

export function detailRows(values = {}) {
  return Object.entries(values)
    .map(([key, value]) => [key.replaceAll('_', ' '), Array.isArray(value) ? value.join(', ') : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')])
    .filter(([, value]) => value.trim());
}

const groupAlerts = (alerts) => { const out = {}; for (const a of alerts) (out[a.service_request_id] ||= []).push(a); return out; };
const priorityTone = (r) => (r.is_emergency ? 'bad' : r.priority === 'high' ? 'warn' : 'neutral');

// ---- the drawer for one request ----

function RequestDrawer({ item, alerts, reload, onClose }) {
  const r = item.service_request;
  const [, summaryText] = alertSummary(alerts);
  const failed = alerts.filter((a) => a.status === 'failed');
  const canEdit = can('dispatcher', 'approver', 'admin');
  const [status, setStatus] = useState(r.status);
  const [priority, setPriority] = useState(r.priority);
  const [notes, setNotes] = useState('');
  const [job, setJob] = useState(null);

  return (
    <Overlay title={`Request #${r.id}`} wide onClose={onClose}>
      <div className="stack">
        {r.is_emergency && (
          <div className="note note--bad" role="alert">
            <strong>Emergency: a person must handle this.</strong>
            <p>{`It is never scheduled by the planner. ${summaryText}.`}</p>
            {canEdit && failed.length ? (
              <ActionButton
                className="btn btn--danger"
                action={async () => {
                  const out = await api(`/v1/alerts/emergency/${r.id}/resend`, { method: 'POST' });
                  toast(`Alert sent again (${Object.entries(out.results || {}).map(([c, v]) => `${CHANNELS[c] || c}: ${v}`).join(', ') || 'done'}).`);
                  reload();
                }}
              >Send the alert again</ActionButton>
            ) : null}
          </div>
        )}

        <div className="row">
          <StatusBadge status={r.status} />
          <Badge text={r.priority} tone={priorityTone(r)} />
          {r.priority_source ? <Badge text={`priority from ${r.priority_source}`} tone="info" /> : null}
        </div>
        <h3>Customer</h3>
        <Details rows={[['Name', item.customer.name], ['Phone', item.customer.phone], ['Email', item.customer.email], ['Address', item.customer.address]]} />
        <h3>Request</h3>
        <Details rows={[
          ['Service', [r.service_type, r.category].filter(Boolean).join(' · ')], ['What they said', r.description], ['Preferred time', r.preferred_time],
          ['Appointment', item.appointment ? `${formatDateTime(item.appointment.start_at)} (${item.appointment.status})` : item.appointment_id ? `#${item.appointment_id}` : ''],
          ...detailRows(item.job_details).map(([k, v]) => [k.charAt(0).toUpperCase() + k.slice(1), v]),
        ]} />
        <h3>Where it came from</h3>
        <Details rows={[['Channel', item.source.channel], ['Call', item.source.call_id]]} />

        {/* What the AI remembers about this customer and what was said on each of their calls (staff roles only: conversations hold personal data). */}
        {item.customer.phone && can('dispatcher', 'approver', 'admin') && (
          <>
            <h2 className="section-title">{`${item.customer.name || 'This customer'}: memory and conversations`}</h2>
            <MemorySections userId={item.customer.phone} mine={r.id} />
          </>
        )}

        {alerts.length > 0 && (
          <>
            <h3>Alerts sent to staff</h3>
            <ul className="plain">
              {alerts.map((a, i) => (
                <li key={i}>
                  <Badge text={a.status} tone={a.status === 'sent' ? 'good' : 'bad'} />
                  {` ${CHANNELS[a.channel] || a.channel}, ${a.kind === 'new' ? 'new emergency' : 'details'}, ${timeAgo(a.updated_at)}`}
                  {a.error ? <span className="bad-text">{` (${a.error})`}</span> : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {canEdit && (
          <section className="card stack">
            <h3>Update</h3>
            <div className="grid2">
              <Field label="Status"><Select options={Object.entries(STATUS).map(([k, [text]]) => [k, text])} value={status} onChange={(e) => setStatus(e.target.value)} /></Field>
              <Field label="Priority"><Select options={PRIORITIES.map((p) => [p, p])} value={priority} onChange={(e) => setPriority(e.target.value)} /></Field>
            </div>
            <Field label="Add a note"><textarea maxLength={300} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <div className="right">
              <ActionButton
                className="btn btn--primary"
                action={async () => {
                  const body = {};
                  if (status !== r.status) body.status = status;
                  if (priority !== r.priority) body.priority = priority;
                  if (notes.trim()) body.notes = notes.trim();
                  if (!Object.keys(body).length) { toast('Nothing has changed.', 'warn'); return; }
                  await api(`/v1/service-requests/${r.id}`, { method: 'PATCH', body });
                  toast('Request updated.');
                  onClose();
                  reload();
                }}
              >Save changes</ActionButton>
            </div>
          </section>
        )}

        {canSchedule(item) && can('dispatcher', 'admin') && (
          <section className="card stack">
            <h3>Schedule</h3>
            {job ? <ScheduleFlow jobId={job.job_id} onDone={() => { onClose(); reload(); }} /> : (
              <>
                <p className="muted">Prepare the job from this request, see who can take it, and ask for approval. Nothing is booked until a different person approves.</p>
                <ActionButton
                  className="btn btn--primary"
                  action={async () => { setJob(await api(`/v1/dispatch/requests/${r.id}/job`, { method: 'POST', body: {} })); }}
                >Prepare the job</ActionButton>
              </>
            )}
          </section>
        )}
        {item.appointment_id ? <p><a href="#/jobs">See it on the Jobs screen</a></p> : null}
      </div>
    </Overlay>
  );
}

// ---- the screens ----

function RequestTable({ rows, alerts, showAlert, open }) {
  const head = ['#', 'Customer', 'Service', 'Priority', 'Status', ...(showAlert ? ['Alert'] : []), 'Channel'];
  const lines = rows.map((item) => {
    const r = item.service_request;
    const [tone, text] = alertSummary(alerts[r.id]);
    return [r.id, <span><strong>{item.customer.name || 'Unknown'}</strong><small className="block muted">{item.customer.phone}</small></span>,
      <span>{r.service_type || r.category}<small className="block muted clip">{r.description}</small></span>,
      <Badge text={r.priority} tone={priorityTone(r)} />, <StatusBadge status={r.status} />, ...(showAlert ? [<Badge text={text} tone={tone} />] : []), item.source.channel];
  });
  return <DataTable head={head} rows={lines} onRow={(cells) => open(rows.find((i) => i.service_request.id === cells[0]))} label="Requests" />;
}

function AlertLog() {
  const [filter, setFilter] = useState('');
  const [state, setState] = useState({ loading: true });
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setState({ loading: true });
    (async () => {
      try {
        const { alerts } = await api('/v1/alerts', { params: { status: filter, limit: 200 } });
        if (n === seq.current) setState({ alerts });
      } catch (error) {
        if (n === seq.current) setState({ error });
      }
    })();
    return () => { seq.current += 1; };
  }, [filter]);

  let list;
  if (state.loading) list = <Spinner />;
  else if (state.error) list = <ErrorBox error={state.error} />;
  else if (!state.alerts.length) list = <Empty text="No alerts yet." />;
  else {
    list = (
      <DataTable
        head={['Request', 'What', 'Channel', 'Result', 'Tries', 'When']}
        rows={state.alerts.map((a) => [`#${a.service_request_id}`, a.kind === 'new' ? 'New emergency' : 'More details',
          CHANNELS[a.channel] || a.channel, <span><Badge text={a.status} tone={a.status === 'sent' ? 'good' : 'bad'} />{a.error ? <small className="bad-text">{` ${a.error}`}</small> : null}</span>, a.attempts, timeAgo(a.updated_at)])}
      />
    );
  }
  return (
    <>
      <div className="toolbar"><Select options={[['', 'All alerts'], ['failed', 'Failed only'], ['sent', 'Sent only']]} value={filter} aria-label="Show alerts" onChange={(e) => setFilter(e.target.value)} /></div>
      <div>{list}</div>
    </>
  );
}

const TABS = [['all', 'All requests'], ['emergencies', 'Emergencies'], ['alerts', 'Alert log']];

export default function Requests() {
  const [tab, setTab] = useState('all');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState(null); // { items, alerts, offset } of the last successful load
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // the request shown in the drawer, as it was when opened
  const seq = useRef(0);
  const latest = useRef({});
  latest.current = { tab, status, offset };

  const load = useCallback(async (quiet) => {
    const { tab: t, status: s, offset: o } = latest.current;
    if (t === 'alerts') return;
    const n = ++seq.current;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const [out, alerts] = await Promise.all([
        api('/v1/service-requests', { params: { status: s, priority: t === 'emergencies' ? 'emergency' : '', limit: PAGE, offset: o } }),
        api('/v1/alerts', { params: { limit: 200 } }),
      ]);
      if (n !== seq.current) return;
      setData({ items: out.service_requests, alerts: groupAlerts(alerts.alerts), offset: o });
      setError(null);
      setLoading(false);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'alerts') { seq.current += 1; return undefined; }
    load();
    return () => { seq.current += 1; };
  }, [tab, status, offset, nonce, load]);
  useEvery(() => load(true), 30000);

  const items = data ? data.items : [];
  const alertsByRequest = data ? data.alerts : {};
  const rows = items.filter((i) => matches(i, search));
  let list;
  if (loading) list = <Spinner />;
  else if (error) list = <ErrorBox error={error} />;
  else if (!items.length) list = <Empty text={tab === 'emergencies' ? 'No emergencies.' : 'No requests yet.'} />;
  else if (!rows.length) list = <Empty text="No request matches that search." />;
  else {
    list = <RequestTable rows={rows} alerts={alertsByRequest} showAlert={tab === 'emergencies'} open={(item) => setOpen({ item, alerts: alertsByRequest[item.service_request.id] || [] })} />;
  }

  return (
    <>
      <PageHeader title="Requests" subtitle="What the AI front desk took on each call: who, what, how urgent, and what has happened since." />
      <Tabs options={TABS} value={tab} onChange={(id) => { setTab(id); setOffset(0); setStatus(''); setSearch(''); setNonce((v) => v + 1); }} />
      <div className="toolbar" hidden={tab === 'alerts'}>
        <input type="text" aria-label="Search" placeholder="Search name, number, address, service…" className="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select options={[['', 'Any status'], ...Object.entries(STATUS).map(([k, [text]]) => [k, text])]} value={status} aria-label="Status" onChange={(e) => { setStatus(e.target.value); setOffset(0); }} />
        <span className="spacer" />
        <Button className="btn btn--ghost" aria-label="Previous page" disabled={data ? data.offset === 0 : false} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹</Button>
        <span className="muted">{data ? (data.items.length ? `${data.offset + 1}–${data.offset + data.items.length}` : '0') : ''}</span>
        <Button className="btn btn--ghost" aria-label="Next page" disabled={data ? data.items.length < PAGE : false} onClick={() => setOffset((o) => o + PAGE)}>›</Button>
      </div>
      <div>{tab === 'alerts' ? <AlertLog /> : list}</div>
      {open && <RequestDrawer item={open.item} alerts={open.alerts} reload={() => load(true)} onClose={() => setOpen(null)} />}
    </>
  );
}
