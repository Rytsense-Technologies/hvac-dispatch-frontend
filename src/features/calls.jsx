// Calls: Call history tab under the shell Calls section (tabs owned by App).
// Layout matches the Rytsense reference: eyebrow + H1, panel rows with View call, centered Dialog detail.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, timeAgo } from '../lib/format.js';
import { can, session } from '../lib/session.js';
import {
  PageHeader, Badge, Spinner, Empty, ErrorBox, Note, Details, Button, Dialog, Row, Panel, Select, Icon, toast,
} from '../components/index.js';

const PAGE = 50;
const MY_PHONE_KEY = 'hvac_staff_phone';

function safeGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

const OUTCOME_TONE = {
  booked: 'good', completed: 'good', follow_up: 'warn', escalated: 'bad', cancelled: 'neutral', no_request: 'neutral',
};

const DIRECTIONS = [['', 'Any direction'], ['inbound', 'Inbound'], ['outbound', 'Outbound']];

const SAMPLE_CALLS = [
  {
    id: 'sample-sarah',
    sample: true,
    customer: { name: 'Sarah Mitchell', phone: '(512) 555-0142' },
    reason: 'AC not cooling',
    outcome: { code: 'booked', label: 'Appointment booked' },
    started_label: '10:42 AM',
    summary: 'The customer contacted the office about ac not cooling. Appointment booked.',
  },
  {
    id: 'sample-david',
    sample: true,
    customer: { name: 'David Rodriguez', phone: '(512) 555-0188' },
    reason: 'HVAC maintenance',
    outcome: { code: 'booked', label: 'Appointment booked' },
    started_label: '9:58 AM',
    summary: 'The customer contacted the office about hvac maintenance. Appointment booked.',
  },
  {
    id: 'sample-jessica',
    sample: true,
    customer: { name: 'Jessica Taylor', phone: '(512) 555-0165' },
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

export function getCallPhoneNumber(call) {
  if (!call) return '';
  const raw =
    call.customer?.phone ||
    call.customer_phone ||
    call.phone ||
    call.from ||
    call.to ||
    call.caller_number ||
    call.caller_id ||
    '';
  return String(raw).trim();
}

export function isRealPhoneNumber(phone) {
  if (!phone) return false;
  if (phone.toLowerCase().startsWith('guest-')) return false;
  return /\d{4,}/.test(phone);
}

export function formatDisplayPhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return raw;
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
    return [call.customer?.phone, call.reason, call.outcome?.label, call.started_label].filter(Boolean).join(' · ');
  }
  const when = call.started_at ? (formatDateTime(call.started_at).split(',').pop()?.trim() || timeAgo(call.started_at)) : '';
  // Pre-design table showed phone under the name; keep it in the row subtitle.
  return [call.customer?.phone, call.reason, call.outcome?.label, when].filter(Boolean).join(' · ') || 'No summary yet';
}

function CallActionDialog({ call, onClose }) {
  const initialPhone = getCallPhoneNumber(call);
  const isReal = isRealPhoneNumber(initialPhone);
  const [customPhone, setCustomPhone] = useState(isReal ? initialPhone : '');
  const [myPhone, setMyPhone] = useState(() => safeGet(MY_PHONE_KEY) || session.user?.phone || '');
  const [needsMyPhone, setNeedsMyPhone] = useState(false);
  const [serverUnavailable, setServerUnavailable] = useState(false);
  const [dialing, setDialing] = useState(false);

  const customerName = call.customer?.name || 'Customer';
  const activePhone = customPhone.trim() || initialPhone;
  const displayPhone = formatDisplayPhone(activePhone);
  // A call row has a usable id to look up on the server only when we also have a real phone for it;
  // otherwise (web-chat callers, typed-in numbers) send the number the dispatcher is looking at instead.
  const hasRealCallId = call.id && !String(call.id).startsWith('sample-');

  const updateMyPhone = (value) => {
    setMyPhone(value);
    safeSet(MY_PHONE_KEY, value.trim());
  };

  const handleDial = async () => {
    if (!activePhone) {
      toast('Please enter a phone number to call.', 'warn');
      return;
    }
    setDialing(true);
    setServerUnavailable(false);
    try {
      const body = {};
      if (isReal && hasRealCallId) body.call_id = call.id;
      else body.phone = activePhone.trim();
      const myPhoneTrimmed = myPhone.trim();
      if (myPhoneTrimmed) body.my_phone = myPhoneTrimmed;
      const res = await api('/v1/calls/callback', { method: 'POST', body });
      toast(res?.message || 'Calling you now. Pick up your phone and you will be connected.');
      onClose();
    } catch (error) {
      if (error.status === 503) setServerUnavailable(true);
      if (error.status === 422 && /profile|add your phone/i.test(error.message)) setNeedsMyPhone(true);
      toast(error.message, 'bad');
    } finally {
      setDialing(false);
    }
  };

  const handleCopy = () => {
    if (!activePhone) return;
    navigator.clipboard?.writeText(activePhone);
    toast('Phone number copied to clipboard.');
  };

  return (
    <Dialog title={`Call · ${customerName}`} onClose={onClose}>
      <div className="stack" style={{ gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
          Connect directly with <strong>{customerName}</strong> via phone or AI assistant.
        </p>

        {isReal ? (
          <div
            style={{
              padding: '14px 16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Phone Number
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginTop: 2 }}>
                {displayPhone}
              </div>
              {call.reason ? (
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>
                  Topic: {call.reason}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="btn btn--outline btn--small"
              onClick={handleCopy}
              title="Copy number"
              style={{ flexShrink: 0 }}
            >
              Copy
            </button>
          </div>
        ) : (
          <div
            style={{
              padding: '14px 16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
            }}
          >
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8 }}>
              {initialPhone ? (
                <>Originating session: <strong>{initialPhone}</strong> (Web assistant caller)</>
              ) : (
                <>No phone number on record for this caller.</>
              )}
            </div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 4 }}>
              Enter phone number to call:
            </label>
            <input
              type="tel"
              className="input"
              placeholder="e.g. (512) 555-0199 or 15392164290"
              value={customPhone}
              onChange={(e) => setCustomPhone(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
          </div>
        )}

        {needsMyPhone ? (
          <div style={{ padding: '14px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
              Your phone number
            </label>
            <input
              type="tel"
              className="input"
              placeholder="e.g. (512) 555-0199"
              value={myPhone}
              onChange={(e) => updateMyPhone(e.target.value)}
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #fcd34d', borderRadius: 6, fontSize: '0.9rem', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: '0.76rem', color: '#92400e', marginTop: 6 }}>
              The server rings you here first, then connects you to the customer. Saved on this browser for next time.
            </div>
          </div>
        ) : null}

        {serverUnavailable ? (
          <Note tone="warn" text="Calling from the console is not set up on this server yet. Use your own phone instead." />
        ) : null}

        <div className="dialog-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn btn--primary"
            disabled={dialing || !activePhone}
            onClick={handleDial}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="phone" />
            <span>{dialing ? 'Calling…' : 'Call'}</span>
          </button>

          {serverUnavailable && activePhone ? (
            <a
              className="btn btn--outline"
              href={`tel:${activePhone.replace(/\s+/g, '')}`}
              title="Call with your own phone app"
            >
              Call on this device
            </a>
          ) : null}

          <a
            className="btn agent-btn"
            href="/test"
            title="Open AI Phone Assistant"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="test" />
            <span>Call with AI Assistant</span>
          </a>

          {activePhone && isReal ? (
            <a
              className="btn btn--ghost"
              href={`sms:${activePhone.replace(/\s+/g, '')}`}
              title="Send text message"
            >
              Send SMS
            </a>
          ) : null}

          <button
            type="button"
            className="btn btn--ghost"
            onClick={onClose}
            style={{ marginLeft: 'auto' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}

function SampleCallDialog({ call, onCall, canCall, onClose }) {
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
        {canCall ? (
          <Button className="btn btn--primary agent-btn" onClick={() => onCall?.(call)}>
            Call customer
          </Button>
        ) : null}
        <a className="btn agent-btn" href="/customers">Customer</a>
        <a className="btn agent-btn" href="/work/appointments">Appointments</a>
        <a className="btn agent-btn" href="/work">Follow-up tasks</a>
      </div>
    </Dialog>
  );
}

function CallDialog({ id, onCall, canCall, onClose }) {
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
          {c.request ? (
            <>
              <h3>Request</h3>
              <Details rows={[
                ['Status', c.request.status],
                ['Priority', c.request.priority],
                ['Category', c.request.category],
                ['Service', c.request.service],
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
            <div className="stack">
              <h3>Transcript</h3>
              {c.turns.map((t, i) => <TurnLine key={i} turn={t} />)}
            </div>
          ) : (
            <p className="sample-label">No recording or transcript is available for this call.</p>
          )}
        </div>
        <div className="dialog-actions">
          {canCall ? (
            <Button className="btn btn--primary agent-btn" onClick={() => onCall?.(c)}>
              Call customer
            </Button>
          ) : null}
          <a className="btn agent-btn" href="/customers">Customer</a>
          <a className="btn agent-btn" href="/work/appointments">Appointments</a>
          <a className="btn agent-btn" href="/work">Follow-up tasks</a>
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
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);
  const [calling, setCalling] = useState(null);
  const seq = useRef(0);
  const latest = useRef({});
  latest.current = { search, direction, from, to, offset };

  const allowed = can('admin', 'dispatcher', 'approver');
  const canCall = can('admin', 'dispatcher');

  useEffect(() => {
    if (!allowed) return undefined;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      const { search: q, direction: d, from: f, to: t, offset: o } = latest.current;
      try {
        const out = await api('/v1/calls', { params: { search: q, direction: d, from: f, to: t, limit: PAGE, offset: o } });
        if (n !== seq.current) return;
        setData({ items: out.calls || [], offset: o });
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
  const filtersIdle = !search && !direction && !from && !to;
  // Samples only for a successful empty first page with no filters — never on later pager pages.
  const usingSample = !loading && !error && apiItems.length === 0 && offset === 0 && filtersIdle;
  const items = usingSample ? SAMPLE_CALLS : apiItems;
  const showPager = !usingSample && data && (data.items.length >= PAGE || offset > 0);

  let list;
  if (loading && !data) list = <Spinner />;
  else if (error) list = <ErrorBox error={error} />;
  else if (!items.length) list = <Empty text={offset > 0 ? 'No more calls on this page.' : 'No calls match.'} />;
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
              <>
                {canCall ? (
                  <Button
                    className="btn agent-btn"
                    aria-label={`Call ${call.customer?.name || 'customer'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCalling(call);
                    }}
                  >
                    Call
                  </Button>
                ) : (
                  <Button
                    className="btn agent-btn"
                    disabled
                    title="Your role cannot do that."
                    onClick={(e) => {
                      e.stopPropagation();
                      toast('Your role cannot do that.', 'warn');
                    }}
                  >
                    Call
                  </Button>
                )}
                <Button
                  className="btn agent-btn"
                  aria-label={`Review call with ${call.customer?.name || 'Unknown'}`}
                  onClick={() => setOpen(call)}
                >
                  View call
                </Button>
              </>
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
        meta={<span className="date">{usingSample ? 'Sample workspace' : 'Live workspace'}</span>}
      />

      <div className="calls-body">
        <div className="toolbar calls-toolbar">
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
        </div>

        <Panel className="calls-panel">
          <h2 className="calls-panel__title">Recent conversations</h2>
          {list}
          {showPager ? (
            <div className="calls-pager">
              <Button className="btn btn--ghost" aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹</Button>
              <span className="muted">{data.items.length ? `${data.offset + 1}-${data.offset + data.items.length}` : `${offset + 1}+`}</span>
              <Button className="btn btn--ghost" aria-label="Next page" disabled={data.items.length < PAGE} onClick={() => setOffset((o) => o + PAGE)}>›</Button>
            </div>
          ) : null}
        </Panel>
        <p className="page-foot">
          {usingSample
            ? 'Sample summaries; recordings and transcripts are illustrative.'
            : 'Live call history from this workspace. Open a row for request, appointment, and transcript details.'}
        </p>
      </div>

      {calling && canCall ? <CallActionDialog call={calling} onClose={() => setCalling(null)} /> : null}
      {open?.sample ? (
        <SampleCallDialog
          call={open}
          canCall={canCall}
          onCall={(c) => {
            setOpen(null);
            setCalling(c);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open && !open.sample ? (
        <CallDialog
          id={open.id}
          canCall={canCall}
          onCall={(c) => {
            setOpen(null);
            setCalling(c);
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
