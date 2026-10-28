// Co-pilot: ask about jobs and technicians. It recommends, you confirm, a different person approves, and the system checks again.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, reasonText, short } from '../lib/format.js';
import { can } from '../lib/session.js';
import { Badge, Spinner, Empty, ErrorBox, PageHeader, DataTable, ProgressBadge, toast, ActionButton, Button, Icon } from '../components/index.js';

// The preview of a change: confirming sends it to Approvals, where a different person decides it.
function ConfirmationBox({ confirmation }) {
  const [submitted, setSubmitted] = useState(null);
  let body;
  if (submitted) body = <p>{`Submitted. It is now ${submitted.status || 'waiting'} in Approvals, where a different person decides it.`}</p>;
  else if (can('dispatcher', 'admin')) {
    body = (
      <>
        <p>This is a preview. Confirming sends it to Approvals; it does not book anything.</p>
        <ActionButton className="btn btn--primary btn--small" action={async () => {
          const r = await api(`/v1/copilot/actions/${confirmation.action_id}/confirm`, { method: 'POST' });
          setSubmitted(r);
          toast('Submitted for approval. A different person must approve it.');
        }}>Confirm and submit for approval</ActionButton>
      </>
    );
  } else body = <p>A dispatcher or administrator can confirm this preview.</p>;
  return <div className="note note--info">{body}</div>;
}

// The reply is a sentence plus FACTS from the backend: tables, options, and (for a change) a preview with a confirm step.
function ResultView({ data, names }) {
  if (!data || !Object.keys(data).length) return null;
  const name = (id) => names[id] || `${short(id)}…`;
  const parts = [];
  if (data.technicians) parts.push(<DataTable key="technicians" head={['Technician', 'Status', 'Skills', 'Areas']} rows={data.technicians.map((t) => [<strong>{t.name}</strong>, <Badge text={t.available ? 'Available' : 'Unavailable'} tone={t.available ? 'good' : 'bad'} />, (t.skills || []).join(', '), (t.service_areas || []).join(', ')])} />);
  if (data.jobs) parts.push(<DataTable key="jobs" head={['When', 'Technician', 'Progress', 'Job']} rows={data.jobs.map((j) => [formatDateTime(j.scheduled_at || j.window_start), j.technician_id ? name(j.technician_id) : '-', <ProgressBadge progress={j.status} />, short(j.id)])} />);
  if (data.approvals) parts.push(<DataTable key="approvals" head={['What', 'Why']} rows={data.approvals.map((a) => [a.action.replaceAll('_', ' '), a.reason])} />);
  if (data.assignments && data.assignments.length) parts.push(<DataTable key="assignments" head={['Job', 'Technician', 'Arrives', 'Finishes']} rows={data.assignments.map((a) => [short(a.job_id), name(a.technician_id), formatDateTime(a.arrival), formatDateTime(a.completion)])} />);
  if (data.rejected && data.rejected.length) parts.push(<ul key="rejected" className="note note--warn">{data.rejected.map((r, i) => <li key={i}>{`Job ${short(r.job_id)} cannot be placed: ${(r.reasons || []).map(reasonText).join(', ')}`}</li>)}</ul>);
  if (data.id && data.window_start && !data.jobs) {
    parts.push(
      <div key="job" className="card">
        <strong>{`Job ${short(data.id)}`}</strong>
        <p>{`Customer window ${formatDateTime(data.window_start)} – ${formatDateTime(data.window_end)} · ${data.duration_minutes} min`}</p>
        <p>{data.technician_id ? `With ${name(data.technician_id)}${data.scheduled_at ? ` at ${formatDateTime(data.scheduled_at)}` : ''}` : 'No technician yet'}</p>
      </div>,
    );
  }
  if (data.confirmation) parts.push(<ConfirmationBox key="confirmation" confirmation={data.confirmation} />);
  return parts.length ? <div className="result stack">{parts}</div> : null;
}

let messageCounter = 0;
const makeMessage = (role, content, data, names) => { messageCounter += 1; return { id: messageCounter, role, content, data, names }; };

export default function Copilot() {
  const [thread, setThreadState] = useState(null);
  const threadRef = useRef(null);
  const namesRef = useRef({});
  const [log, setLog] = useState({ kind: 'intro' }); // intro | loading | error | chat
  const [messages, setMessages] = useState([]);
  const [threads, setThreads] = useState(null);
  const [text, setText] = useState('');
  const [waiting, setWaiting] = useState(false);
  const waitingRef = useRef(false);
  const logEl = useRef(null);
  const openSeq = useRef(0);
  const threadsSeq = useRef(0);
  const suggestions = ['List technicians', "List today's jobs", ...(can('approver', 'admin') ? ['Show pending approvals'] : [])];

  const setThread = (id) => { threadRef.current = id; setThreadState(id); };
  const intro = () => { setLog({ kind: 'intro' }); setMessages([]); };

  useEffect(() => { if (logEl.current) logEl.current.scrollTop = logEl.current.scrollHeight; }, [messages]);

  async function loadThreads() {
    threadsSeq.current += 1;
    const mine = threadsSeq.current;
    try {
      const { threads: list } = await api('/v1/copilot/threads');
      if (mine === threadsSeq.current) setThreads(list);
    } catch { if (mine === threadsSeq.current) setThreads(null); }
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
    } catch (error) { if (mine === openSeq.current) setLog({ kind: 'error', error }); }
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
      if (!threadRef.current) { setThread(reply.thread_id); loadThreads(); }
    } catch (error) {
      setWaiting(false);
      setMessages((all) => all.slice(0, -1));
      setText(body);
      toast(error.message, 'bad');
    } finally { waitingRef.current = false; }
  }

  useEffect(() => {
    loadThreads();
    api('/v1/dispatch/technicians').then(({ technicians }) => { namesRef.current = Object.fromEntries(technicians.map((t) => [t.id, t.name])); }).catch(() => {});
    return () => { openSeq.current += 1; threadsSeq.current += 1; };
  }, []);

  let logBody;
  if (log.kind === 'intro') {
    logBody = (
      <div className="stack">
        <Empty text="Try one of these, or ask in your own words." />
        <div className="row wrap center">{suggestions.map((s) => <Button key={s} className="btn btn--outline btn--small" onClick={() => submit(s)}>{s}</Button>)}</div>
      </div>
    );
  } else if (log.kind === 'loading') logBody = <Spinner text="Loading the conversation…" />;
  else if (log.kind === 'error') logBody = <ErrorBox error={log.error} />;
  else {
    logBody = (
      <>
        {messages.map((m) => (
          <div key={m.id} className={`bubble bubble--${m.role}`}>
            <div className="bubble__text">{m.content}</div>
            {m.role === 'assistant' ? <ResultView data={m.data} names={m.names} /> : null}
          </div>
        ))}
        {waiting ? <Spinner text="Thinking…" /> : null}
      </>
    );
  }

  return (
    <>
      <PageHeader title={<span className="row"><Icon name="copilot" /><span>Co-pilot</span></span>} subtitle="Ask about jobs and technicians. It recommends, you confirm, a different person approves, and the system checks again." />
      <div className="chat">
        <aside className="chat-side" aria-label="Conversations">
          <Button className="btn btn--outline btn--small" onClick={() => { openSeq.current += 1; setThread(null); intro(); loadThreads(); }}>New conversation</Button>
          <div className="side-list">
            {threads ? (threads.length ? threads.map((t) => (
              <button type="button" key={t.id} className={`side-item ${t.id === thread ? 'side-item--on' : ''}`} onClick={() => openThread(t.id).then(loadThreads)}>{t.title}</button>
            )) : <Empty text="No conversations yet." />) : null}
          </div>
        </aside>
        <section className="chat-main" aria-label="Chat">
          <div className="chat-log" aria-live="polite" ref={logEl}>{logBody}</div>
          <form className="chat-form" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <input type="text" aria-label="Message" placeholder="Ask about a job or technician…" maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="btn btn--primary" aria-label="Send" disabled={waiting}>Send</button>
          </form>
        </section>
      </div>
    </>
  );
}
