// Co-pilot: ask about jobs and technicians. It recommends, you confirm, a different person approves, and the system checks again.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, reasonText, short } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  Badge,
  Spinner,
  Empty,
  ErrorBox,
  PageHeader,
  DataTable,
  ProgressBadge,
  toast,
  ActionButton,
  Button,
  Icon,
} from '../components/index.js';

// The preview of a change: confirming sends it to Approvals, where a different person decides it.
function ConfirmationBox({ confirmation }) {
  const [submitted, setSubmitted] = useState(null);

  if (submitted) {
    return (
      <div className="note note--good stack" style={{ gap: '8px' }}>
        <div className="row" style={{ alignItems: 'center', gap: '8px' }}>
          <Badge text={submitted.status || 'Waiting'} tone="good" />
          <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
            Submitted for approval. A different person must review and approve it in the Approvals queue.
          </span>
        </div>
        <div>
          <a href="#/approvals" className="btn btn--outline btn--small">
            Open Approvals Queue →
          </a>
        </div>
      </div>
    );
  }

  if (can('dispatcher', 'admin')) {
    return (
      <div className="chat-preview-box">
        <h4>
          <Icon name="attention" />
          <span>Action Preview: Confirmation Required</span>
        </h4>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>
          This is an automated schedule preview. Confirming will generate a formal proposal in the Approvals queue. No changes are booked without a second person&apos;s approval.
        </p>
        <div style={{ marginTop: '4px' }}>
          <ActionButton
            className="btn btn--primary btn--small"
            action={async () => {
              const r = await api(`/v1/copilot/actions/${confirmation.action_id}/confirm`, { method: 'POST' });
              setSubmitted(r);
              toast('Submitted for approval. A different person must approve it.');
            }}
          >
            Confirm and submit for approval
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="note note--neutral">
      A dispatcher or administrator can confirm this preview.
    </div>
  );
}

// The reply is a sentence plus FACTS from the backend: tables, options, and (for a change) a preview with a confirm step.
function ResultView({ data, names }) {
  if (!data || !Object.keys(data).length) return null;
  const name = (id) => names[id] || `${short(id)}…`;
  const parts = [];

  if (data.technicians && data.technicians.length) {
    parts.push(
      <div key="technicians" style={{ marginTop: '10px' }}>
        <small className="muted" style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.74rem' }}>
          Technicians Roster ({data.technicians.length})
        </small>
        <DataTable
          head={['Technician', 'Status', 'Skills', 'Service Areas']}
          rows={data.technicians.map((t) => [
            <span key={t.id || t.name} style={{ fontWeight: 'var(--font-weight-medium)' }}>{t.name}</span>,
            <Badge key={`st-${t.name}`} text={t.available ? 'Available' : 'Unavailable'} tone={t.available ? 'good' : 'bad'} />,
            (t.skills || []).join(', ') || '—',
            (t.service_areas || []).join(', ') || '—',
          ])}
        />
      </div>,
    );
  }

  if (data.jobs && data.jobs.length) {
    parts.push(
      <div key="jobs" style={{ marginTop: '10px' }}>
        <small className="muted" style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.74rem' }}>
          Scheduled Jobs ({data.jobs.length})
        </small>
        <DataTable
          head={['Schedule Window', 'Assigned Tech', 'Progress', 'Job ID']}
          rows={data.jobs.map((j) => [
            formatDateTime(j.scheduled_at || j.window_start),
            j.technician_id ? name(j.technician_id) : <span className="muted">Unassigned</span>,
            <ProgressBadge key={j.id} progress={j.status} />,
            <span key={`code-${j.id}`} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{short(j.id)}</span>,
          ])}
        />
      </div>,
    );
  }

  if (data.approvals && data.approvals.length) {
    parts.push(
      <div key="approvals" style={{ marginTop: '10px' }}>
        <small className="muted" style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.74rem' }}>
          Pending Approvals ({data.approvals.length})
        </small>
        <DataTable
          head={['Action', 'Reason / Context']}
          rows={data.approvals.map((a, i) => [
            <Badge key={i} text={a.action.replaceAll('_', ' ')} tone="info" />,
            a.reason,
          ])}
        />
      </div>,
    );
  }

  if (data.assignments && data.assignments.length) {
    parts.push(
      <div key="assignments" style={{ marginTop: '10px' }}>
        <small className="muted" style={{ display: 'block', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.74rem' }}>
          Proposed Route Assignments ({data.assignments.length})
        </small>
        <DataTable
          head={['Job ID', 'Technician', 'Arrival Time', 'Completion']}
          rows={data.assignments.map((a, i) => [
            <span key={i} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{short(a.job_id)}</span>,
            name(a.technician_id),
            formatDateTime(a.arrival),
            formatDateTime(a.completion),
          ])}
        />
      </div>,
    );
  }

  if (data.rejected && data.rejected.length) {
    parts.push(
      <div key="rejected" className="note note--warn" style={{ marginTop: '10px' }}>
        <div className="row" style={{ alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Icon name="attention" />
          <span style={{ fontWeight: 'var(--font-weight-semibold)' }}>{`${data.rejected.length} Job(s) Cannot Be Placed:`}</span>
        </div>
        <ul style={{ margin: 0, paddingLeft: '20px' }}>
          {data.rejected.map((r, i) => (
            <li key={i}>{`Job ${short(r.job_id)}: ${(r.reasons || []).map(reasonText).join(', ')}`}</li>
          ))}
        </ul>
      </div>,
    );
  }

  if (data.id && data.window_start && !data.jobs) {
    parts.push(
      <div key="job" className="card" style={{ marginTop: '10px', padding: '14px 18px' }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontWeight: 'var(--font-weight-semibold)', fontSize: '0.95rem' }}>{`Job ${short(data.id)}`}</span>
          <Badge text={`${data.duration_minutes} min duration`} tone="neutral" />
        </div>
        <p style={{ margin: '0 0 6px', fontSize: '0.88rem', color: 'var(--muted)' }}>
          {`Customer window: ${formatDateTime(data.window_start)} – ${formatDateTime(data.window_end)}`}
        </p>
        <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text)' }}>
          {data.technician_id
            ? `Assigned to ${name(data.technician_id)}${data.scheduled_at ? ` at ${formatDateTime(data.scheduled_at)}` : ''}`
            : 'No technician assigned yet'}
        </p>
      </div>,
    );
  }

  if (data.confirmation) {
    parts.push(<ConfirmationBox key="confirmation" confirmation={data.confirmation} />);
  }

  return parts.length ? <div className="chat-result-wrap stack" style={{ gap: '10px' }}>{parts}</div> : null;
}

let messageCounter = 0;
const makeMessage = (role, content, data, names) => {
  messageCounter += 1;
  return { id: messageCounter, role, content, data, names, time: new Date() };
};

export default function Copilot() {
  const [thread, setThreadState] = useState(null);
  const threadRef = useRef(null);
  const namesRef = useRef({});
  const [log, setLog] = useState({ kind: 'intro' }); // intro | loading | error | chat
  const [messages, setMessages] = useState([]);
  const [threads, setThreads] = useState(null);
  const [threadFilter, setThreadFilter] = useState('');
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const waitingRef = useRef(false);
  const logEl = useRef(null);
  const openSeq = useRef(0);
  const threadsSeq = useRef(0);

  const suggestions = useMemo(() => [
    { label: 'List technicians', icon: 'technicians', desc: 'Inspect current roster & availability' },
    { label: "List today's jobs", icon: 'jobs', desc: "Review today's scheduled customer visits" },
    ...(can('approver', 'admin') ? [{ label: 'Show pending approvals', icon: 'approvals', desc: 'Review proposals waiting for decision' }] : []),
    { label: 'Show open problems', icon: 'attention', desc: 'Check scheduling and route violations' },
  ], []);

  const setThread = (id) => {
    threadRef.current = id;
    setThreadState(id);
  };

  const intro = () => {
    setLog({ kind: 'intro' });
    setMessages([]);
  };

  useEffect(() => {
    if (logEl.current) {
      logEl.current.scrollTop = logEl.current.scrollHeight;
    }
  }, [messages, waiting]);

  async function loadThreads() {
    threadsSeq.current += 1;
    const mine = threadsSeq.current;
    try {
      const { threads: list } = await api('/v1/copilot/threads');
      if (mine === threadsSeq.current) setThreads(list);
    } catch {
      if (mine === threadsSeq.current) setThreads(null);
    }
  }

  async function openThread(id) {
    openSeq.current += 1;
    const mine = openSeq.current;
    setThread(id);
    setMessages([]);
    setLog({ kind: 'loading' });
    try {
      const { messages: list } = await api(`/v1/copilot/threads/${id}`);
      if (mine !== openSeq.current) return;
      setLog({ kind: 'chat' });
      setMessages(list.map((m) => makeMessage(m.role === 'user' ? 'user' : 'assistant', m.content, m.data, namesRef.current)));
      if (!list.length) intro();
    } catch (error) {
      if (mine === openSeq.current) setLog({ kind: 'error', error });
    }
  }

  async function submit(message) {
    const body = message.trim();
    if (!body || waitingRef.current) return;
    setText('');
    openSeq.current += 1; // a thread still loading must not wipe this message
    setLog({ kind: 'chat' });
    setMessages((all) => [...all, makeMessage('user', body)]);
    waitingRef.current = true;
    setWaiting(true);
    try {
      const reply = await api('/v1/copilot/messages', { method: 'POST', body: { message: body, thread_id: threadRef.current } });
      setWaiting(false);
      setMessages((all) => [...all, makeMessage('assistant', reply.message, reply.data, namesRef.current)]);
      if (!threadRef.current) {
        setThread(reply.thread_id);
        loadThreads();
      }
    } catch (error) {
      setWaiting(false);
      setMessages((all) => all.slice(0, -1));
      setText(body);
      toast(error.message, 'bad');
    } finally {
      waitingRef.current = false;
    }
  }

  useEffect(() => {
    loadThreads();
    api('/v1/dispatch/technicians')
      .then(({ technicians }) => {
        namesRef.current = Object.fromEntries(technicians.map((t) => [t.id, t.name]));
      })
      .catch(() => {});
    return () => {
      openSeq.current += 1;
      threadsSeq.current += 1;
    };
  }, []);

  const filteredThreads = useMemo(() => {
    if (!threads) return [];
    const q = threadFilter.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => (t.title || '').toLowerCase().includes(q));
  }, [threads, threadFilter]);

  let logBody;
  if (log.kind === 'intro') {
    logBody = (
      <div className="chat-intro-hero">
        <div className="chat-intro-icon">
          <Icon name="copilot" />
        </div>
        <h2>AI Dispatch Co-pilot</h2>
        <p>
          Ask questions in natural language about technician availability, customer appointments, route planning, or proposed changes.
        </p>
        <div className="chat-suggestions-grid">
          {suggestions.map((s) => (
            <button
              key={s.label}
              type="button"
              className="chat-suggestion-card"
              onClick={() => submit(s.label)}
            >
              <Icon name={s.icon} />
              <div>
                <span style={{ display: 'block', fontWeight: 'var(--font-weight-medium)' }}>{s.label}</span>
                <small className="muted" style={{ fontSize: '0.78rem' }}>{s.desc}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  } else if (log.kind === 'loading') {
    logBody = <Spinner text="Loading conversation history…" />;
  } else if (log.kind === 'error') {
    logBody = <ErrorBox error={log.error} />;
  } else {
    logBody = (
      <>
        {messages.map((m) => (
          <div key={m.id} className={`chat-bubble-wrap chat-bubble-wrap--${m.role}`}>
            <div className="chat-bubble-meta">
              <span>{m.role === 'user' ? 'You' : 'Co-pilot'}</span>
            </div>
            <div className={`bubble bubble--${m.role}`}>
              <div className="bubble__text">{m.content}</div>
              {m.role === 'assistant' ? <ResultView data={m.data} names={m.names} /> : null}
            </div>
          </div>
        ))}
        {waiting ? (
          <div className="chat-bubble-wrap chat-bubble-wrap--assistant">
            <div className="chat-bubble-meta">
              <span>Co-pilot</span>
            </div>
            <div className="bubble bubble--assistant">
              <div className="bubble__text">
                <Spinner text="Analyzing schedule & compiling answer…" />
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <span className="row" style={{ alignItems: 'center', gap: '8px' }}>
            <Icon name="copilot" />
            <span>Dispatch Co-pilot</span>
          </span>
        }
        subtitle="AI dispatch assistant: query live schedules, inspect technician rosters, and preview route actions."
      />
      <div className="chat">
        <aside className="chat-side" aria-label="Conversation history">
          <div className="chat-side-header">
            <h2>Conversations</h2>
            {threads ? <Badge text={String(threads.length)} tone="neutral" /> : null}
          </div>

          <Button
            className="btn btn--primary btn--small btn--block"
            onClick={() => {
              openSeq.current += 1;
              setThread(null);
              intro();
              loadThreads();
            }}
          >
            ＋ New Conversation
          </Button>

          {threads && threads.length > 5 ? (
            <input
              type="search"
              className="chat-threads-search"
              placeholder="Filter conversations…"
              value={threadFilter}
              onChange={(e) => setThreadFilter(e.target.value)}
              aria-label="Filter conversations"
            />
          ) : null}

          <div className="chat-side-list">
            {threads ? (
              filteredThreads.length ? (
                filteredThreads.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    className={`chat-thread-item ${t.id === thread ? 'chat-thread-item--active' : ''}`}
                    onClick={() => openThread(t.id).then(loadThreads)}
                  >
                    <Icon name="requests" />
                    <span className="chat-thread-title">{t.title || 'Untitled conversation'}</span>
                  </button>
                ))
              ) : (
                <Empty text="No matching conversations." />
              )
            ) : null}
          </div>
        </aside>

        <section className="chat-main" aria-label="Chat canvas">
          <div className="chat-log" aria-live="polite" ref={logEl}>
            {logBody}
          </div>
          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <input
              type="text"
              className="chat-input"
              aria-label="Ask Co-pilot"
              placeholder="Ask about a job, technician schedule, or request route changes…"
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary chat-send-btn"
              aria-label="Send message"
              disabled={waiting || !text.trim()}
            >
              Send
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
