// AI Coworker: ask about jobs and technicians. It recommends, you confirm,
// a different person approves, and the system checks again.
// Visual layout matches the Rytsense reference AI Coworker screen.
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
  Panel,
} from '../components/index.js';

// Live starter prompts (pre-design Co-pilot). Chips POST to /v1/copilot/messages.
function liveSuggestionChips() {
  return [
    { label: 'List technicians', question: 'List technicians' },
    { label: "List today's jobs", question: "List today's jobs" },
    ...(can('approver', 'admin')
      ? [{ label: 'Show pending approvals', question: 'Show pending approvals' }]
      : []),
    { label: 'Show open problems', question: 'Show open problems' },
  ];
}

// Illustrative sample rows — CTAs are section navigation (not deep links to named records).
const SUGGESTED_ACTIONS = [
  {
    title: 'Invoice follow-up',
    subtitle: 'Sarah Mitchell · Needs approval',
    cta: 'Open automation',
    href: '#/automation',
  },
  {
    title: 'Customer record update',
    subtitle: 'David Rodriguez · Needs review',
    cta: 'Open automation',
    href: '#/automation',
  },
  {
    title: 'Assign AC repair · Sarah Mitchell',
    subtitle: 'Unassigned work',
    cta: 'Open Work',
    href: '#/work',
  },
  {
    title: 'Assign Plumbing inspection · William Brooks',
    subtitle: 'Unassigned work',
    cta: 'Open Work',
    href: '#/work',
  },
  {
    title: 'Explore existing campaigns',
    subtitle: 'Sample outreach',
    cta: 'Open Campaigns',
    href: '#/campaigns',
  },
];

// The preview of a change: confirming sends it to Approvals, where a different person decides it.
function ConfirmationBox({ confirmation }) {
  const [submitted, setSubmitted] = useState(null);

  if (submitted) {
    return (
      <div className="note note--good stack" style={{ gap: '8px' }}>
        <div className="row" style={{ alignItems: 'center', gap: '8px' }}>
          <Badge text={submitted.status || 'Waiting'} tone="good" />
          <span style={{ fontWeight: 'var(--font-weight-medium)' }}>
            Live Approvals proposal submitted. A different person must review and approve it before any booking changes.
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
          This preview is connected to your workspace. Confirming will POST a live Approvals proposal that another person must approve before any schedule change is booked.
        </p>
        <div style={{ marginTop: '4px' }}>
          <ActionButton
            className="btn btn--primary btn--small"
            action={async () => {
              const r = await api(`/v1/copilot/actions/${confirmation.action_id}/confirm`, { method: 'POST' });
              setSubmitted(r);
              toast('Live Approvals proposal submitted. A different person must approve it.');
            }}
          >
            Confirm — submit live Approvals proposal
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

function applyChip(question, setText, submit) {
  setText(question);
  submit(question);
}

function normalizeSuggestionChips(payload) {
  const raw = payload?.suggestions || payload?.starter || payload?.questions || payload;
  if (!Array.isArray(raw)) return null;
  const chips = raw
    .map((item) => {
      if (typeof item === 'string') return { label: item, question: item };
      const question = item?.question || item?.prompt || item?.label || item?.text;
      if (!question) return null;
      return { label: item.label || item.text || question, question };
    })
    .filter(Boolean);
  return chips.length ? chips : null;
}

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
  const [suggestionChips, setSuggestionChips] = useState(() => liveSuggestionChips());

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
  }, [messages, waiting, log.kind]);

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
    api('/v1/copilot/suggestions')
      .then((payload) => {
        const chips = normalizeSuggestionChips(payload);
        if (chips) setSuggestionChips(chips);
      })
      .catch(() => {
        setSuggestionChips(liveSuggestionChips());
      });
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

  let conversationBody;
  if (log.kind === 'intro') {
    conversationBody = (
      <div className="agent-banner">
        Ask about technician availability, today&apos;s jobs, pending approvals, or open scheduling problems.
      </div>
    );
  } else if (log.kind === 'loading') {
    conversationBody = <Spinner text="Loading conversation history…" />;
  } else if (log.kind === 'error') {
    conversationBody = <ErrorBox error={log.error} />;
  } else {
    conversationBody = (
      <div className="coworker-conversation" aria-live="polite" ref={logEl}>
        {messages.map((m) => (
          <div key={m.id} className={`agent-banner coworker-turn coworker-turn--${m.role}`}>
            <strong>{m.role === 'user' ? 'You' : 'Assistant'}: </strong>
            <span>{m.content}</span>
            {m.role === 'assistant' ? <ResultView data={m.data} names={m.names} /> : null}
          </div>
        ))}
        {waiting ? (
          <div className="agent-banner coworker-turn coworker-turn--assistant">
            <Spinner text="Analyzing schedule & compiling answer…" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="YOUR AI WORKSPACE"
        title="AI Coworker"
        subtitle="Query live schedules, inspect technician rosters, and preview route proposals."
        meta={<span className="date">Live workspace</span>}
      />

      <div className="layout coworker-layout">
        <Panel className="coworker-chat-panel" aria-label="AI Coworker chat">
          <div className="coworker-panel-head">
            <h2>How can I help?</h2>
            {thread || log.kind !== 'intro' ? (
              <Button
                className="btn btn--ghost btn--small"
                onClick={() => {
                  openSeq.current += 1;
                  setThread(null);
                  intro();
                  loadThreads();
                }}
              >
                New chat
              </Button>
            ) : null}
          </div>

          <div id="coworker-conversation">
            {conversationBody}
          </div>

          <div className="filters coworker-filters" role="group" aria-label="Suggested questions">
            {suggestionChips.map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="filter"
                disabled={waiting}
                onClick={() => applyChip(chip.question, setText, submit)}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <form
            className="coworker-ask"
            onSubmit={(e) => {
              e.preventDefault();
              submit(text);
            }}
          >
            <input
              type="text"
              id="coworker-ask-input"
              aria-label="Ask the AI Coworker"
              placeholder="Ask about a job, technician schedule, or request route changes…"
              maxLength={4000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={waiting}
            />
            <button
              type="submit"
              className="action"
              aria-label="Send message"
              disabled={waiting || !text.trim()}
            >
              Send
            </button>
          </form>

          <p className="sample-label">
            Suggestion chips, chat, threads, and confirmations use live APIs — confirming a change creates a live Approvals proposal at #/approvals. Suggested action rows on the right are illustrative section navigation only.
          </p>

          {threads && threads.length ? (
            <details className="coworker-history">
              <summary>Past conversations {threads ? `(${threads.length})` : ''}</summary>
              {threads.length > 5 ? (
                <input
                  type="search"
                  className="chat-threads-search"
                  placeholder="Filter conversations…"
                  value={threadFilter}
                  onChange={(e) => setThreadFilter(e.target.value)}
                  aria-label="Filter conversations"
                />
              ) : null}
              <div className="coworker-history-list">
                {filteredThreads.length ? (
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
                )}
              </div>
            </details>
          ) : null}
        </Panel>

        <Panel className="coworker-actions-panel" aria-label="Suggested actions">
          <h2>Suggested actions</h2>
          {SUGGESTED_ACTIONS.map((action) => (
            <div key={action.title} className="row-item coworker-action-row">
              <span className="rowmain">
                <strong>{action.title}</strong>
                <small className="muted">{action.subtitle}</small>
              </span>
              <a href={action.href} className="btn btn--secondary agent-btn coworker-action-btn">
                {action.cta}
              </a>
            </div>
          ))}
          <p className="sample-label">
            Illustrative examples — buttons open the section list, not a specific record.
          </p>
        </Panel>
      </div>
    </>
  );
}
