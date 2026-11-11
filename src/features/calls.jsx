// Calls: every call the AI front desk has taken, newest first - who called, what they wanted, and what it led to.
// Conversations hold personal data, so only admin, dispatcher and approver may see this page; the server would
// refuse anyone else (403) and this screen hides the section rather than let them hit that wall.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, timeAgo } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  PageHeader, DataTable, Select, Overlay, Badge, Spinner, Empty, ErrorBox, Note, Details, Button,
} from '../components/index.js';

const PAGE = 50;

const OUTCOME_TONE = {
  booked: 'good', completed: 'good', follow_up: 'warn', escalated: 'bad', cancelled: 'neutral', no_request: 'neutral',
};

const DIRECTIONS = [['', 'Any direction'], ['inbound', 'Inbound'], ['outbound', 'Outbound']];

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// A plain object's own fields as [label, value] rows, for a shape the backend hasn't pinned down exactly (escalation).
function objectRows(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .map(([k, v]) => [k.replaceAll('_', ' '), Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')])
    .filter(([, v]) => v.trim());
}

// One line of the transcript. The exact shape of a "turn" isn't pinned down, so this reads whatever
// text-like and speaker-like field is actually there and never throws on a missing one.
function TurnLine({ turn }) {
  if (turn === null || turn === undefined) return null;
  if (typeof turn !== 'object') return <p className="small">{String(turn)}</p>;
  const speaker = turn.speaker ?? turn.role ?? turn.from ?? turn.who ?? turn.author ?? 'Unknown';
  const text = turn.text ?? turn.message ?? turn.content ?? turn.utterance ?? turn.transcript ?? '';
  return (
    <p className="small">
      <strong>{String(speaker)}:</strong> {text ? String(text) : <span className="muted">(no text)</span>}
    </p>
  );
}

function CallDrawer({ id, onClose }) {
  const [state, setState] = useState({ loading: true });
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setState({ loading: true });
    (async () => {
      try {
        const data = await api(`/v1/calls/${id}`);
        if (n === seq.current) setState({ data });
      } catch (error) {
        if (n === seq.current) setState({ error });
      }
    })();
    return () => { seq.current += 1; };
  }, [id]);

  let body;
  if (state.loading) body = <Spinner />;
  else if (state.error) body = <ErrorBox error={state.error} />;
  else {
    const c = state.data;
    const [tone, label] = c.outcome ? [OUTCOME_TONE[c.outcome.code] || 'neutral', c.outcome.label] : ['neutral', ''];
    body = (
      <div className="stack">
        <div className="row">
          <Badge text={c.direction} tone="neutral" />
          <Badge text={c.channel} tone="neutral" />
          {label ? <Badge text={label} tone={tone} /> : null}
        </div>

        <h3>Customer</h3>
        <Details rows={[['Name', c.customer?.name], ['Phone', c.customer?.phone]]} />

        <h3>Call</h3>
        <Details rows={[
          ['Started', formatDateTime(c.started_at)],
          ['Duration', formatDuration(c.duration_seconds)],
          ['Reason', c.reason],
          ['Summary', c.summary],
        ]} />

        {c.escalation ? (
          <>
            <h3>Escalation</h3>
            <Note tone="bad" text="This call was escalated: an emergency, handled by a person." />
            <Details rows={objectRows(c.escalation)} />
          </>
        ) : null}

        {c.request ? (
          <>
            <h3>Request</h3>
            <Details rows={[
              ['Status', c.request.status], ['Priority', c.request.priority],
              ['Category', c.request.category], ['Service', c.request.service],
              ['Description', c.request.description],
            ]} />
          </>
        ) : null}

        {c.appointment ? (
          <>
            <h3>Appointment</h3>
            <Details rows={[
              ['Status', c.appointment.status],
              ['Start', formatDateTime(c.appointment.start_at)],
              ['End', formatDateTime(c.appointment.end_at)],
            ]} />
          </>
        ) : null}

        {Array.isArray(c.turns) && c.turns.length ? (
          <>
            <h3>Transcript</h3>
            <div className="stack">
              {c.turns.map((t, i) => <TurnLine key={i} turn={t} />)}
            </div>
          </>
        ) : (
          <Note text="No transcript recorded for this call." />
        )}
      </div>
    );
  }

  return <Overlay title={state.data ? `Call with ${state.data.customer?.name || 'Unknown'}` : 'Call'} wide onClose={onClose}>{body}</Overlay>;
}

function CallsTable({ rows, open }) {
  const head = ['Customer', 'Direction', 'Channel', 'Reason', 'Outcome', 'When', 'Duration'];
  const lines = rows.map((c) => [
    <span><strong>{c.customer?.name || 'Unknown'}</strong><small className="block muted">{c.customer?.phone}</small></span>,
    c.direction === 'inbound' ? 'Inbound' : c.direction === 'outbound' ? 'Outbound' : c.direction,
    c.channel,
    c.reason,
    c.outcome ? <Badge text={c.outcome.label} tone={OUTCOME_TONE[c.outcome.code] || 'neutral'} /> : <span className="muted">-</span>,
    <span>{formatDateTime(c.started_at)}<small className="block muted">{timeAgo(c.started_at)}</small></span>,
    formatDuration(c.duration_seconds),
  ]);
  return <DataTable head={head} rows={lines} onRow={(_cells, index) => open(rows[index])} label="Calls" />;
}

export default function Calls() {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null); // { items, offset } of the last successful load
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // the call id shown in the drawer
  const seq = useRef(0);
  const latest = useRef({});
  latest.current = { search, direction, from, to, offset };

  const allowed = can('admin', 'dispatcher', 'approver');

  useEffect(() => {
    if (!allowed) return undefined; // the server would refuse (403): don't even ask
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      const { search: q, direction: d, from: f, to: t, offset: o } = latest.current;
      try {
        const out = await api('/v1/calls', { params: { search: q, direction: d, from: f, to: t, limit: PAGE, offset: o } });
        if (n !== seq.current) return;
        setData({ items: out.calls, offset: o });
        setLoading(false);
      } catch (e) {
        if (n !== seq.current) return;
        setError(e);
        setLoading(false);
      }
    }, 250);
    return () => { seq.current += 1; clearTimeout(timer); };
  }, [search, direction, from, to, offset, allowed]);

  if (!allowed) {
    return <div className="card"><h1>Not available for your role</h1><p className="muted">Ask an administrator if you need this section.</p></div>;
  }

  const items = data ? data.items : [];
  let list;
  if (loading && !data) list = <Spinner />;
  else if (error) list = <ErrorBox error={error} />;
  else if (!items.length) list = <Empty text="No calls match." />;
  else list = <CallsTable rows={items} open={(call) => setOpen(call.id)} />;

  return (
    <>
      <PageHeader title="Calls" subtitle="Every call the AI front desk has taken - no recordings, just what happened." />
      <div className="toolbar">
        <input
          type="text"
          aria-label="Search"
          placeholder="Search name, number, service…"
          className="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
        />
        <Select options={DIRECTIONS} value={direction} aria-label="Direction" onChange={(e) => { setDirection(e.target.value); setOffset(0); }} />
        <label className="inline">From<input type="date" aria-label="From" value={from} onChange={(e) => { setFrom(e.target.value); setOffset(0); }} /></label>
        <label className="inline">To<input type="date" aria-label="To" value={to} onChange={(e) => { setTo(e.target.value); setOffset(0); }} /></label>
        <span className="spacer" />
        <Button className="btn btn--ghost" aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹</Button>
        <span className="muted">{data ? (data.items.length ? `${data.offset + 1}-${data.offset + data.items.length}` : '0') : ''}</span>
        <Button className="btn btn--ghost" aria-label="Next page" disabled={data ? data.items.length < PAGE : true} onClick={() => setOffset((o) => o + PAGE)}>›</Button>
      </div>
      <div>{list}</div>
      {open ? <CallDrawer id={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
