// Calls: every call the AI front desk has taken, newest first - who called, what they wanted, and what it led to.
// Conversations hold personal data, so only admin, dispatcher and approver may see this page; the server would
// refuse anyone else (403) and this screen hides the section rather than let them hit that wall.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  Overlay, Badge, Spinner, ErrorBox, Note, Details,
} from '../components/index.js';
import { Icon } from '../components/Icon.jsx';

const OUTCOME_TONE = {
  booked: 'good',
  completed: 'good',
  follow_up: 'warn',
  escalated: 'bad',
  cancelled: 'neutral',
  no_request: 'neutral',
};

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatCallTime(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return dateStr;
  }
}

// Turn line for transcripts
function TurnLine({ turn }) {
  if (turn === null || turn === undefined) return null;
  if (typeof turn !== 'object') return <p className="small">{String(turn)}</p>;
  const speaker = turn.speaker ?? turn.role ?? turn.from ?? turn.who ?? turn.author ?? 'Unknown';
  const text = turn.text ?? turn.message ?? turn.content ?? turn.utterance ?? turn.transcript ?? '';
  return (
    <div style={{ marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 2 }}>
        {String(speaker)}
      </span>
      <p style={{ margin: 0, fontSize: '0.84rem', color: '#334155', lineHeight: 1.45 }}>
        {text ? String(text) : <span className="muted">(no text)</span>}
      </p>
    </div>
  );
}

// Sample conversations matching reference screenshot exactly
const SAMPLE_CALLS = [
  {
    id: 'sample-1',
    isSample: true,
    customer: { name: 'Sarah Mitchell', phone: '(512) 555-0142' },
    reason: 'AC not cooling',
    outcome: { label: 'Appointment booked', code: 'booked' },
    time: '10:42 AM',
    summary: 'Customer called stating AC unit stopped cooling upstairs bedrooms. System running but blowing warm air. AI booked an appointment for technician inspection today at 2:00 PM.',
    started_at: '2026-11-11T10:42:00',
    duration_seconds: 165,
    turns: [
      { speaker: 'AI Receptionist', text: 'Thank you for calling Apex Air Solutions! How can I assist you with your home comfort today?' },
      { speaker: 'Sarah Mitchell', text: 'Hi, my air conditioning is running, but it\'s only blowing warm air upstairs. It\'s getting pretty hot.' },
      { speaker: 'AI Receptionist', text: 'I understand how uncomfortable that is, Sarah. I can get one of our certified HVAC technicians out to inspect your system today. Would 2:00 PM work for you?' },
      { speaker: 'Sarah Mitchell', text: 'Yes, 2:00 PM would be great. Thank you!' },
      { speaker: 'AI Receptionist', text: 'Perfect! I have you booked for 2:00 PM today with our technician. You\'ll receive a confirmation text shortly.' },
    ],
  },
  {
    id: 'sample-2',
    isSample: true,
    customer: { name: 'David Rodriguez', phone: '(512) 555-0189' },
    reason: 'HVAC maintenance',
    outcome: { label: 'Appointment booked', code: 'booked' },
    time: '9:58 AM',
    summary: 'Annual seasonal tune-up inquiry. AI scheduled routine preventive maintenance service for tomorrow morning at 10:00 AM.',
    started_at: '2026-11-11T09:58:00',
    duration_seconds: 142,
    turns: [
      { speaker: 'AI Receptionist', text: 'Thank you for calling Apex Air Solutions. How can I help you today?' },
      { speaker: 'David Rodriguez', text: 'Hello, I\'m calling to schedule our annual AC maintenance before the summer rush.' },
      { speaker: 'AI Receptionist', text: 'We\'d love to take care of that for you, David. Our 21-point inspection keeps your system running at peak efficiency. We have an opening tomorrow morning at 10:00 AM. Does that time suit you?' },
      { speaker: 'David Rodriguez', text: 'Tomorrow at 10:00 AM works well for me.' },
      { speaker: 'AI Receptionist', text: 'Wonderful, you are confirmed for tomorrow at 10:00 AM. We look forward to seeing you!' },
    ],
  },
  {
    id: 'sample-3',
    isSample: true,
    customer: { name: 'Jessica Taylor', phone: '(512) 555-0218' },
    reason: 'Pricing inquiry',
    outcome: { label: 'Follow up needed', code: 'follow_up' },
    time: '9:21 AM',
    summary: 'Customer inquiring about heat pump replacement options and financing plans. Needs estimator follow-up with customized quote.',
    started_at: '2026-11-11T09:21:00',
    duration_seconds: 210,
    turns: [
      { speaker: 'AI Receptionist', text: 'Apex Air Solutions, how may I help you today?' },
      { speaker: 'Jessica Taylor', text: 'Hi, I was wondering how much it typically costs to replace a heat pump in a 2,200 sq ft home?' },
      { speaker: 'AI Receptionist', text: 'Heat pump installations typically range depending on efficiency rating and ductwork requirements. I can have our senior estimator call you back with a detailed quote and financing options.' },
      { speaker: 'Jessica Taylor', text: 'That would be great, please have them call this afternoon.' },
      { speaker: 'AI Receptionist', text: 'I have logged this for our estimator team to follow up with you this afternoon. Have a wonderful day!' },
    ],
  },
];

function CallDrawer({ call, onClose }) {
  const [state, setState] = useState({ loading: !call.isSample, data: call.isSample ? call : null });
  const seq = useRef(0);

  useEffect(() => {
    if (call.isSample) {
      setState({ loading: false, data: call });
      return;
    }
    const n = ++seq.current;
    setState({ loading: true });
    (async () => {
      try {
        const data = await api(`/v1/calls/${call.id}`);
        if (n === seq.current) setState({ loading: false, data });
      } catch (error) {
        if (n === seq.current) setState({ loading: false, error });
      }
    })();
    return () => { seq.current += 1; };
  }, [call]);

  let body;
  if (state.loading) body = <Spinner />;
  else if (state.error) body = <ErrorBox error={state.error} />;
  else {
    const c = state.data || call;
    const [tone, label] = c.outcome
      ? [OUTCOME_TONE[c.outcome.code] || 'neutral', c.outcome.label || c.outcome]
      : ['neutral', 'Completed'];

    body = (
      <div className="stack" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Badge text={c.direction || 'Inbound'} tone="neutral" />
          <Badge text={c.channel || 'Voice'} tone="neutral" />
          {label ? <Badge text={label} tone={tone} /> : null}
        </div>

        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Customer</h3>
          <Details rows={[
            ['Name', c.customer?.name || 'Unknown'],
            ['Phone', c.customer?.phone || 'Not provided'],
          ]} />
        </div>

        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Call details</h3>
          <Details rows={[
            ['Time', c.time || formatCallTime(c.started_at) || formatDateTime(c.started_at)],
            ['Duration', formatDuration(c.duration_seconds)],
            ['Reason', c.reason || 'General inquiry'],
            ['Summary', c.summary || 'Summary unavailable'],
          ]} />
        </div>

        {c.appointment ? (
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Appointment</h3>
            <Details rows={[
              ['Status', c.appointment.status],
              ['Start', formatDateTime(c.appointment.start_at)],
              ['End', formatDateTime(c.appointment.end_at)],
            ]} />
          </div>
        ) : null}

        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Conversation Transcript</h3>
          {Array.isArray(c.turns) && c.turns.length ? (
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
              {c.turns.map((t, i) => <TurnLine key={i} turn={t} />)}
            </div>
          ) : (
            <Note text="No audio transcript recorded for this call." />
          )}
        </div>
      </div>
    );
  }

  return (
    <Overlay
      title={`Call with ${call.customer?.name || 'Customer'}`}
      wide
      onClose={onClose}
    >
      {body}
    </Overlay>
  );
}

// Modal for "Find a number"
function FindNumberModal({ onClose, onSelectNumber }) {
  const [areaCode, setAreaCode] = useState('512');
  const [numbers] = useState([
    { number: '(512) 890-2134', location: 'Austin, TX', type: 'Local number' },
    { number: '(512) 402-9811', location: 'Austin, TX', type: 'Local number' },
    { number: '(512) 331-7782', location: 'Austin, TX', type: 'Local number' },
  ]);

  return (
    <Overlay title="Find a new phone number" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.45 }}>
          Search available US phone numbers for your AI front desk and choose your preferred local area code.
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <input
            type="text"
            className="search"
            value={areaCode}
            placeholder="Area code (e.g. 512)"
            onChange={(e) => setAreaCode(e.target.value)}
            style={{ width: 140 }}
          />
          <button type="button" className="phone-btn-primary" style={{ padding: '6px 14px' }}>
            Search numbers
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a' }}>Available numbers</span>
          {numbers.map((item) => (
            <div
              key={item.number}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#ffffff',
              }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: '0.92rem', color: '#0f172a' }}>{item.number}</strong>
                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{item.location} · {item.type}</span>
              </div>
              <button
                type="button"
                className="campaign-view-btn"
                onClick={() => onSelectNumber(item.number)}
              >
                Select number
              </button>
            </div>
          ))}
        </div>
      </div>
    </Overlay>
  );
}

// Modal for "Connect a number"
function ConnectNumberModal({ onClose }) {
  return (
    <Overlay title="Use your existing number" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b', lineHeight: 1.45 }}>
          Keep your existing business phone number and automatically forward calls to your AI team when you are busy or after hours.
        </p>

        <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#0f172a' }}>Standard carrier forwarding:</h4>
          <ol style={{ margin: 0, paddingLeft: 20, fontSize: '0.84rem', color: '#334155', lineHeight: 1.6 }}>
            <li>Dial <strong>*71</strong> followed by your dedicated AI forwarding number.</li>
            <li>Press <strong>Call</strong> and wait for the confirmation tone.</li>
            <li>Incoming calls not answered after 3 rings will be seamlessly handled by your AI receptionist.</li>
          </ol>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" className="phone-btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export default function Calls() {
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'numbers'
  const [data, setData] = useState(null); // { items: [] }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCall, setSelectedCall] = useState(null);
  const [showFindModal, setShowFindModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectedNumber, setConnectedNumber] = useState(null);

  const allowed = can('admin', 'dispatcher', 'approver');

  // Load real backend calls
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const out = await api('/v1/calls', { params: { limit: 50 } });
        if (!active) return;
        setData({ items: Array.isArray(out?.calls) ? out.calls : [] });
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err);
        setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not available for your role</h1>
        <p className="muted">Ask an administrator if you need this section.</p>
      </div>
    );
  }

  // Determine list to show: if backend has real calls, use them, otherwise use sample calls
  const realCalls = data?.items || [];
  const displayCalls = realCalls.length > 0
    ? realCalls.map((c) => ({
      ...c,
      isSample: false,
      displayName: c.customer?.name || (c.customer?.phone ? c.customer.phone : 'Caller'),
      displaySub: `${c.reason || 'General inquiry'} · ${c.outcome?.label || c.outcome?.code || 'Completed'} · ${formatCallTime(c.started_at) || 'Recent'}`,
    }))
    : SAMPLE_CALLS.map((s) => ({
      ...s,
      displayName: s.customer.name,
      displaySub: `${s.reason} · ${s.outcome.label} · ${s.time}`,
    }));

  return (
    <>
      {/* Dynamic Header matching Reference */}
      <div className="calls-head">
        <div>
          <div className="calls-eyebrow">
            {activeTab === 'history' ? 'CONVERSATIONS' : 'CALL SETUP'}
          </div>
          <h1 className="calls-title">
            {activeTab === 'history' ? 'Calls' : 'Phone numbers'}
          </h1>
          <p className="calls-subtitle">
            {activeTab === 'history'
              ? 'Review calls and follow up on customer needs.'
              : 'Choose how customers reach your AI team.'}
          </p>
        </div>
        <button
          type="button"
          className="calls-workspace-btn"
          onClick={() => { }}
        >
          Sample workspace
        </button>
      </div>

      {/* Underline Tabs Bar */}
      <div className="calls-tabs-bar">
        <button
          type="button"
          className={`calls-tab-item ${activeTab === 'history' ? 'calls-tab-item--active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Call history
        </button>
        <button
          type="button"
          className={`calls-tab-item ${activeTab === 'numbers' ? 'calls-tab-item--active' : ''}`}
          onClick={() => setActiveTab('numbers')}
        >
          Phone numbers
        </button>
      </div>

      {/* Tab 1: Call History */}
      {activeTab === 'history' && (
        <>
          <div className="calls-card">
            <h2 className="calls-card-title">Recent conversations</h2>
            <div className="calls-list">
              {displayCalls.map((call) => (
                <div key={call.id} className="calls-row">
                  <div className="calls-row-left">
                    <span className="calls-row-icon">
                      <Icon name="phone" />
                    </span>
                    <div className="calls-row-info">
                      <span className="calls-row-name">{call.displayName}</span>
                      <span className="calls-row-sub">{call.displaySub}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="calls-view-btn"
                    onClick={() => setSelectedCall(call)}
                  >
                    View call
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="calls-disclaimer">
            Sample summaries; recordings and transcripts are illustrative.
          </div>
        </>
      )}

      {/* Tab 2: Phone Numbers */}
      {activeTab === 'numbers' && (
        <>
          <div className="phone-numbers-grid">
            {/* Card 1: Get a new number */}
            <div className="phone-option-card">
              <span className="phone-option-icon phone-option-icon--blue">
                <Icon name="plus" />
              </span>
              <h2 className="phone-option-title">Get a new number</h2>
              <p className="phone-option-desc">
                Search example US numbers by area code, review your selection, and preview checkout.
              </p>
              <button
                type="button"
                className="phone-btn-primary"
                onClick={() => setShowFindModal(true)}
              >
                Find a number
              </button>
            </div>

            {/* Card 2: Use your existing number */}
            <div className="phone-option-card">
              <span className="phone-option-icon phone-option-icon--gray">
                <Icon name="campaigns" />
              </span>
              <h2 className="phone-option-title">Use your existing number</h2>
              <p className="phone-option-desc">
                Keep your current business number and choose how to connect calls to your AI team.
              </p>
              <button
                type="button"
                className="phone-btn-outline"
                onClick={() => setShowConnectModal(true)}
              >
                Connect a number
              </button>
            </div>
          </div>

          {/* Bottom Card: Your numbers */}
          <div className="your-numbers-card">
            <h3 className="your-numbers-title">Your numbers</h3>
            <p className="your-numbers-sub">Sample status for this browser session</p>
            {connectedNumber ? (
              <div className="your-number-active-badge">
                <Icon name="checkCircle" />
                <span>Active number: <strong>{connectedNumber}</strong> · Ready for calls</span>
              </div>
            ) : (
              <p className="your-numbers-empty">
                No numbers added yet. Select an option above to preview setup.
              </p>
            )}
          </div>

          <div className="calls-disclaimer">
            Design concept · No real numbers are searched, purchased, transferred, verified, or connected.
          </div>
        </>
      )}

      {/* Modals */}
      {selectedCall && (
        <CallDrawer
          call={selectedCall}
          onClose={() => setSelectedCall(null)}
        />
      )}

      {showFindModal && (
        <FindNumberModal
          onClose={() => setShowFindModal(false)}
          onSelectNumber={(num) => {
            setConnectedNumber(num);
            setShowFindModal(false);
          }}
        />
      )}

      {showConnectModal && (
        <ConnectNumberModal
          onClose={() => setShowConnectModal(false)}
        />
      )}
    </>
  );
}
