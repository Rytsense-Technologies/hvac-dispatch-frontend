// What the AI remembers about a person, and what was said on each of their calls. Used under a request (click the customer) and on the Memory page.
// All text is rendered by React as text: nothing a caller said is ever put into the page as HTML.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import { ActionButton, Badge, Empty, ErrorBox, Overlay, Spinner, toast } from '../lib/ui.jsx';

const WHO = { user: 'Customer', assistant: 'AI' };
const length = (seconds) => (seconds === null || seconds === undefined ? '' : seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`);
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

// One call's words, as a chat: the customer on one side and the AI on the other. (Was conversation(call), returning a DOM node.)
export function Conversation({ call }) {
  if (!call.turns.length) return <Empty text="Nothing was said." />;
  return (
    <div className="chat" role="log" aria-label="Conversation">
      {call.turns.map((turn, i) => (
        <div className={`bubble bubble--${turn.role}`} key={i}>
          <small className="muted">{[WHO[turn.role] || turn.role, clock(turn.at)].filter(Boolean).join(' · ')}</small>
          <p>{turn.text}</p>
        </div>
      ))}
    </div>
  );
}

function CallCard({ call, mine }) {
  const parts = [formatDateTime(call.started_at), call.direction === 'outbound' ? 'we called them' : 'they called us', length(call.duration_seconds)].filter(Boolean);
  return (
    <details className="call" open={mine || undefined}>
      <summary>
        <span>{parts.join(' · ')}</span>{' '}
        {call.service_request_id ? <Badge text={`Request #${call.service_request_id}`} tone={mine ? 'good' : 'info'} /> : null}
        {` ${call.turns.length} messages`}
      </summary>
      <Conversation call={call} />
    </details>
  );
}

// The facts and the calls of one person. `mine` is a request id whose call is opened by default.
export function MemorySections({ userId, mine = null, onErased = null }) {
  const [state, setState] = useState({});
  const [erasing, setErasing] = useState(false);
  const [erased, setErased] = useState(false);

  useEffect(() => {
    let current = true;
    setState({});
    (async () => {
      try {
        const [{ facts }, { calls }] = await Promise.all([api(`/v1/memory/${encodeURIComponent(userId)}`), api(`/v1/memory/${encodeURIComponent(userId)}/calls`)]);
        if (current) setState({ facts, calls });
      } catch (error) {
        if (current) setState({ error });
      }
    })();
    return () => { current = false; };
  }, [userId]);

  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!state.facts) content = <Spinner />;
  else if (erased) content = <Empty text="Erased." />;
  else {
    const { facts, calls } = state;
    content = (
      <>
        <h3>What the AI remembers</h3>
        {facts.length ? <ul className="facts">{facts.map((fact, i) => <li key={i}>{fact}</li>)}</ul> : <Empty text="Nothing remembered about this person yet." />}
        <h3>{`Conversations (${calls.length})`}</h3>
        {calls.length
          ? <div className="stack">{calls.map((call, i) => <CallCard key={i} call={call} mine={mine !== null && call.service_request_id === mine} />)}</div>
          : <Empty text="No conversation has been kept for this person yet. Calls are kept from the moment this feature was switched on." />}
        {can('admin') && (facts.length || calls.length)
          ? <button type="button" className="btn btn--outline btn--small" onClick={() => setErasing(true)}>Erase memory and conversations</button> : null}
      </>
    );
  }
  return (
    <div className="stack">
      {content}
      {erasing && <EraseDialog userId={userId} onClose={() => setErasing(false)} done={onErased || (() => setErased(true))} />}
    </div>
  );
}

function EraseDialog({ userId, onClose, done }) {
  return (
    <Overlay title="Erase this person's memory" onClose={onClose}>
      <div className="stack">
        <p>This erases what the AI remembers about this person and every conversation kept for them. It cannot be undone.</p>
        <div className="right">
          <ActionButton
            className="btn btn--danger"
            action={async () => {
              const out = await api(`/v1/memory/${encodeURIComponent(userId)}`, { method: 'DELETE' });
              onClose();
              toast(`Erased ${out.deleted} remembered fact(s) and ${out.calls_deleted} conversation(s).`);
              done();
            }}
          >Erase it for good</ActionButton>
        </div>
      </div>
    </Overlay>
  );
}

// The memory of one person in its own panel (from the Memory page). Render while open. (Was openMemory(person, reload).)
export function MemoryOverlay({ person, onClose, onErased }) {
  const title = person.name ? `${person.name} (${person.user_id})` : person.user_id;
  return (
    <Overlay title={title} wide onClose={onClose}>
      <MemorySections userId={person.user_id} onErased={onErased} />
    </Overlay>
  );
}
