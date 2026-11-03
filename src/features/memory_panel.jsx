// What the AI remembers about a person, and what was said on each of their calls. Used under a request (click the customer) and on the Memory page.
// All text is rendered by React as text: nothing a caller said is ever put into the page as HTML.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import { ActionButton, Badge, Card, Empty, ErrorBox, Overlay, Spinner, toast } from '../components/index.js';

const WHO = { user: 'Customer', assistant: 'AI Assistant' };
const length = (seconds) => (seconds === null || seconds === undefined ? '' : seconds < 90 ? `${seconds} s` : `${Math.round(seconds / 60)} min`);
const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');

// One call's words, as a chat: the customer on one side and the AI on the other.
export function Conversation({ call }) {
  if (!call.turns.length) return <Empty text="No messages in this call." />;
  return (
    <div className="chat" role="log" aria-label="Conversation" style={{ maxHeight: '360px' }}>
      {call.turns.map((turn, i) => (
        <div className={`bubble bubble--${turn.role}`} key={i}>
          <small className="muted" style={{ display: 'block', marginBottom: '2px', fontSize: '0.74rem' }}>
            {[WHO[turn.role] || turn.role, clock(turn.at)].filter(Boolean).join(' · ')}
          </small>
          <p style={{ margin: 0 }}>{turn.text}</p>
        </div>
      ))}
    </div>
  );
}

function CallCard({ call, mine }) {
  return (
    <details className="call" open={mine || undefined}>
      <summary>
        <div className="call-summary-left">
          <Badge
            text={call.direction === 'outbound' ? 'Outbound' : 'Inbound'}
            tone={call.direction === 'outbound' ? 'info' : 'good'}
          />
          <span>{formatDateTime(call.started_at)}</span>
          {length(call.duration_seconds) ? (
            <small className="muted">({length(call.duration_seconds)})</small>
          ) : null}
          {call.service_request_id ? (
            <Badge text={`Request #${call.service_request_id}`} tone={mine ? 'good' : 'neutral'} />
          ) : null}
        </div>
        <div className="call-summary-right">
          <span>{call.turns.length} message{call.turns.length === 1 ? '' : 's'}</span>
          <span aria-hidden="true" style={{ fontSize: '0.85rem' }}>▾</span>
        </div>
      </summary>
      <div className="call-chat-wrap">
        <Conversation call={call} />
      </div>
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
        const [{ facts }, { calls }] = await Promise.all([
          api(`/v1/memory/${encodeURIComponent(userId)}`),
          api(`/v1/memory/${encodeURIComponent(userId)}/calls`),
        ]);
        if (current) setState({ facts, calls });
      } catch (error) {
        if (current) setState({ error });
      }
    })();
    return () => { current = false; };
  }, [userId]);

  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!state.facts) content = <Spinner text="Loading customer memory..." />;
  else if (erased) content = <Empty text="Customer memory and call recordings have been permanently erased." />;
  else {
    const { facts, calls } = state;
    content = (
      <>
        {/* Knowledge Facts Card */}
        <div className="drawer-card">
          <div className="between">
            <h4>What the AI Remembers</h4>
            <Badge text={`${facts.length} fact${facts.length === 1 ? '' : 's'}`} tone={facts.length ? 'good' : 'neutral'} />
          </div>
          {facts.length ? (
            <div className="memory-facts-grid">
              {facts.map((fact, i) => (
                <div key={i} className="memory-fact-item">
                  <span className="memory-fact-icon" aria-hidden="true">✦</span>
                  <span>{fact}</span>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="The AI has not learned any specific facts about this customer yet." />
          )}
        </div>

        {/* Call Transcripts Accordion */}
        <div className="drawer-card">
          <div className="between">
            <h4>Recorded Conversations ({calls.length})</h4>
            <small className="muted">Full transcripts of recorded phone calls</small>
          </div>
          {calls.length ? (
            <div className="stack" style={{ gap: '10px' }}>
              {calls.map((call, i) => (
                <CallCard key={i} call={call} mine={mine !== null && call.service_request_id === mine} />
              ))}
            </div>
          ) : (
            <Empty text="No call conversations have been preserved for this person yet." />
          )}
        </div>

        {/* Data Governance & Purge */}
        {can('admin') && (facts.length || calls.length) ? (
          <div className="between" style={{ padding: '10px 4px 0', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
            <div>
              <strong style={{ fontSize: '0.86rem', display: 'block' }}>Customer Privacy & Data Retention</strong>
              <small className="muted">Permanently erase all learned facts and call recordings for this caller.</small>
            </div>
            <button
              type="button"
              className="btn btn--danger btn--small"
              onClick={() => setErasing(true)}
            >
              Erase memory & calls
            </button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="stack">
      {content}
      {erasing && (
        <EraseDialog
          userId={userId}
          onClose={() => setErasing(false)}
          done={onErased || (() => setErased(true))}
        />
      )}
    </div>
  );
}

function EraseDialog({ userId, onClose, done }) {
  return (
    <Overlay title="Erase Customer Memory" onClose={onClose}>
      <div className="stack">
        <p style={{ margin: 0 }}>
          This will permanently purge all facts the AI assistant learned about this customer and delete every call conversation transcript on record.
        </p>
        <Note text="This action cannot be undone." tone="warn" />
        <div className="right">
          <ActionButton
            className="btn btn--danger"
            action={async () => {
              const out = await api(`/v1/memory/${encodeURIComponent(userId)}`, { method: 'DELETE' });
              onClose();
              toast(`Erased ${out.deleted} fact(s) and ${out.calls_deleted} call conversation(s).`);
              done();
            }}
          >
            Permanently Erase
          </ActionButton>
        </div>
      </div>
    </Overlay>
  );
}

// The memory of one person in its own panel (from the Memory page). Render while open.
export function MemoryOverlay({ person, onClose, onErased }) {
  const title = person.name ? `${person.name} (${person.user_id})` : person.user_id;
  return (
    <Overlay title={title} wide onClose={onClose}>
      <MemorySections userId={person.user_id} onErased={onErased} />
    </Overlay>
  );
}
