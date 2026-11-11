// Calls: Call history tab under the shell Calls section (tabs owned by App).
// Layout matches the Rytsense reference: eyebrow + H1, panel rows with View call, centered Dialog detail.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, timeAgo } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  PageHeader, Badge, Spinner, Empty, ErrorBox, Note, Details, Button, Dialog, Row, Panel,
} from '../components/index.js';

const PAGE = 50;

const OUTCOME_TONE = {
  booked: 'good', completed: 'good', follow_up: 'warn', escalated: 'bad', cancelled: 'neutral', no_request: 'neutral',
};

const SAMPLE_CALLS = [
  {
    id: 'sample-sarah',
    sample: true,
    customer: { name: 'Sarah Mitchell', phone: '' },
    reason: 'AC not cooling',
    outcome: { code: 'booked', label: 'Appointment booked' },
    started_label: '10:42 AM',
    summary: 'The customer contacted the office about ac not cooling. Appointment booked.',
  },
  {
    id: 'sample-david',
    sample: true,
    customer: { name: 'David Rodriguez', phone: '' },
    reason: 'HVAC maintenance',
    outcome: { code: 'booked', label: 'Appointment booked' },
    started_label: '9:58 AM',
    summary: 'The customer contacted the office about hvac maintenance. Appointment booked.',
  },
  {
    id: 'sample-jessica',
    sample: true,
    customer: { name: 'Jessica Taylor', phone: '' },
    reason: 'Pricing inquiry',
    outcome: { code: 'follow_up', label: 'Follow-up needed' },
    started_label: '9:21 AM',
    summary: 'The customer contacted the office about pricing inquiry. Follow-up needed.',
  },
];

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function objectRows(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value)
    .map(([k, v]) => [k.replaceAll('_', ' '), Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '')])
    .filter(([, v]) => v.trim());
}

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

function callSubtitle(call) {
  if (call.sample) {
    return [call.reason, call.outcome?.label, call.started_label].filter(Boolean).join(' · ');
  }
  const when = call.started_at ? (formatDateTime(call.started_at).split(',').pop()?.trim() || timeAgo(call.started_at)) : '';
  return [call.reason, call.outcome?.label, when].filter(Boolean).join(' · ') || 'No summary yet';
}

function SampleCallDialog({ call, onClose }) {
  return (
    <Dialog title={`Call · ${call.customer?.name || 'Unknown'}`} onClose={onClose}>
      <p>
        <strong>Reason:</strong> {call.reason}
        <br />
        <strong>Outcome:</strong> {call.outcome?.label}
        <br />
        <strong>Escalation:</strong> None in this example
      </p>
      <div className="agent-banner">
        <strong>Sample summary</strong>
        <br />
        {call.summary}
      </div>
      <p className="sample-label">No recording or transcript is available in this demonstration.</p>
      <div className="dialog-actions">
        <a className="btn agent-btn" href="#/customers">Customer</a>
        <a className="btn agent-btn" href="#/work/appointments">Appointments</a>
        <a className="btn agent-btn" href="#/work">Follow-up tasks</a>
      </div>
    </Dialog>
  );
}

function CallDialog({ id, onClose }) {
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
      <>
        <p>
          <strong>Reason:</strong> {c.reason || '—'}
          <br />
          <strong>Outcome:</strong> {label || '—'}
          <br />
          <strong>Escalation:</strong> {c.escalation ? 'Yes' : 'None'}
        </p>
        <div className="agent-banner">
          <strong>Summary</strong>
          <br />
          {c.summary || 'No summary recorded for this call.'}
        </div>
        <div className="stack">
          <div className="row wrap">
            <Badge text={c.direction} tone="neutral" />
            <Badge text={c.channel} tone="neutral" />
            {label ? <Badge text={label} tone={tone} /> : null}
          </div>
          <Details rows={[
            ['Name', c.customer?.name],
            ['Phone', c.customer?.phone],
            ['Started', formatDateTime(c.started_at)],
            ['Duration', formatDuration(c.duration_seconds)],
          ]} />
          {c.escalation ? (
            <>
              <Note tone="bad" text="This call was escalated: an emergency, handled by a person." />
              <Details rows={objectRows(c.escalation)} />
            </>
          ) : null}
          {Array.isArray(c.turns) && c.turns.length ? (
            <div className="stack">
              <h3>Transcript</h3>
              {c.turns.map((t, i) => <TurnLine key={i} turn={t} />)}
            </div>
          ) : (
            <p className="sample-label">No recording or transcript is available for this call.</p>
          )}
        </div>
        <div className="dialog-actions">
          <a className="btn agent-btn" href="#/customers">Customer</a>
          <a className="btn agent-btn" href="#/work/appointments">Appointments</a>
          <a className="btn agent-btn" href="#/work">Follow-up tasks</a>
        </div>
      </>
    );
  }

  return (
    <Dialog title={state.data ? `Call · ${state.data.customer?.name || 'Unknown'}` : 'Call'} wide onClose={onClose}>
      {body}
    </Dialog>
  );
}

export default function Calls() {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const seq = useRef(0);

  const allowed = can('admin', 'dispatcher', 'approver');

  useEffect(() => {
    if (!allowed) return undefined;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const out = await api('/v1/calls', { params: { limit: PAGE, offset } });
        if (n !== seq.current) return;
        setData({ items: out.calls || [], offset });
        setLoading(false);
      } catch (e) {
        if (n !== seq.current) return;
        setError(e);
        setLoading(false);
      }
    })();
    return () => { seq.current += 1; };
  }, [offset, allowed]);

  if (!allowed) {
    return (
      <div className="calls-page">
        <PageHeader eyebrow="Conversations" title="Calls" subtitle="Review calls and follow up on customer needs." />
        <div className="calls-body">
          <Panel><p className="muted">Ask an administrator if you need this section.</p></Panel>
        </div>
      </div>
    );
  }

  const apiItems = data ? data.items : [];
  const usingSample = !loading && !error && apiItems.length === 0;
  const items = usingSample ? SAMPLE_CALLS : apiItems;

  let list;
  if (loading && !data) list = <Spinner />;
  else if (error && !usingSample) list = <ErrorBox error={error} />;
  else if (!items.length) list = <Empty text="No calls yet." />;
  else {
    list = (
      <div className="calls-list">
        {items.map((call) => (
          <Row
            key={call.id}
            leading="☎"
            title={call.customer?.name || 'Unknown'}
            subtitle={callSubtitle(call)}
            trailing={(
              <Button
                className="btn agent-btn"
                aria-label={`Review call with ${call.customer?.name || 'Unknown'}`}
                onClick={() => setOpen(call)}
              >
                View call
              </Button>
            )}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="calls-page">
      <PageHeader
        eyebrow="Conversations"
        title="Calls"
        subtitle="Review calls and follow up on customer needs."
      >
        <button type="button" className="btn date-chip" onClick={() => {}}>
          Sample workspace
        </button>
      </PageHeader>

      <div className="calls-body">
        <Panel className="calls-panel">
          <h2 className="calls-panel__title">Recent conversations</h2>
          {list}
          {!usingSample && data && (data.items.length >= PAGE || offset > 0) ? (
            <div className="calls-pager">
              <Button className="btn btn--ghost" aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹</Button>
              <span className="muted">{data.items.length ? `${data.offset + 1}-${data.offset + data.items.length}` : '0'}</span>
              <Button className="btn btn--ghost" aria-label="Next page" disabled={data.items.length < PAGE} onClick={() => setOffset((o) => o + PAGE)}>›</Button>
            </div>
          ) : null}
        </Panel>
        <p className="page-foot">Sample summaries; recordings and transcripts are illustrative.</p>
      </div>

      {open?.sample ? <SampleCallDialog call={open} onClose={() => setOpen(null)} /> : null}
      {open && !open.sample ? <CallDialog id={open.id} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
