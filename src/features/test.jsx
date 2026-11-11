// Test module: Voice call (LiveKit) + SMS texts (HTTP text-chat).
// Same endpoints and admin-session auth as the pre-design call.html page,
// rendered inside the console shell with current design tokens.
import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { api } from '../lib/api.js';
import { Note, PageHeader, Panel, PanelHead, Tabs } from '../components/index.js';

const USER_ID_STORAGE_KEY = 'voice_support_user_id';
const TEXT_CALL_PHONE_KEY = 'text_call_phone';
const TRANSCRIPTION_TOPIC = 'lk.transcription';
const AGENT_STATE_ATTRIBUTE = 'lk.agent.state';
const AGENT_JOIN_TIMEOUT_MS = 15000;

const STATE_LABELS = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  initializing: 'Assistant is joining…',
  listening: 'Listening — speak anytime',
  thinking: 'Thinking…',
  speaking: 'Assistant is speaking',
};

function randomUserId() {
  return `guest-${Math.random().toString(36).slice(2, 8)}`;
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}

async function fetchVoiceToken(userId) {
  // api() already attaches CSRF from the console session.
  return api(`/v1/voice/token?user_id=${encodeURIComponent(userId)}`, { method: 'POST' });
}

function explainTextError(error) {
  if (error.status === 403) return 'Only an admin can use the text test.';
  if (error.status === 401) return 'Sign in to the console first, then try again.';
  return error.message;
}

// ---------- SMS texts tab ----------
function TextCall() {
  const [outbound, setOutbound] = useState(false);
  const [phone, setPhone] = useState(() => safeStorageGet(TEXT_CALL_PHONE_KEY) || '');
  const [leadName, setLeadName] = useState('');
  const [interest, setInterest] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [startBusy, setStartBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [ended, setEnded] = useState('');
  const counter = useRef(0);
  const box = useRef(null);
  const sessionRef = useRef(null);
  const outboundRef = useRef(false);

  useEffect(() => { outboundRef.current = outbound; }, [outbound]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [items, waiting]);

  // Leaving the tab or the page closes the test on the server.
  useEffect(() => () => {
    const id = sessionRef.current;
    sessionRef.current = null;
    if (id) api(`/v1/voice/text-chat/${id}`, { method: 'DELETE' }).catch(() => {});
  }, []);

  const addBubble = (mine, message) => setItems((prev) => [...prev, { id: counter.current++, mine, message }]);

  function apply(result) {
    (result.replies || []).forEach((reply) => addBubble(false, reply));
    if ((result.events || []).length) {
      setEvents((prev) => [...prev, ...result.events.map((event) => ({ id: counter.current++, ...event }))]);
    }
    if (result.ended) {
      sessionRef.current = null;
      setSessionId(null);
      setStatus('');
      setEnded('The call has ended (the assistant ended it).');
    }
  }

  async function startCall() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
      setNote('Enter the phone number with the country code (8 to 15 digits).');
      return;
    }
    safeStorageSet(TEXT_CALL_PHONE_KEY, phone.trim());
    setNote('');
    setEnded('');
    setItems([]);
    setEvents([]);
    setStartBusy(true);
    setStatus('Starting the assistant…');
    try {
      const made = await api('/v1/voice/text-chat', {
        method: 'POST',
        body: {
          direction: outbound ? 'outbound' : 'inbound',
          phone: phone.trim(),
          name: outbound ? leadName.trim() || null : null,
          interest: outbound ? interest.trim() || null : null,
        },
      });
      sessionRef.current = made.session_id;
      setSessionId(made.session_id);
      apply(made);
      if (!made.ended) setStatus('Connected. Type as the caller.');
    } catch (error) {
      setStatus('');
      setNote(explainTextError(error));
    } finally {
      setStartBusy(false);
    }
  }

  async function hangUp() {
    const id = sessionRef.current;
    sessionRef.current = null;
    setSessionId(null);
    setStatus('');
    setEnded('Call ended by you.');
    if (id) await api(`/v1/voice/text-chat/${id}`, { method: 'DELETE' }).catch(() => {});
  }

  async function send(event) {
    event.preventDefault();
    const message = text.trim();
    const id = sessionRef.current;
    if (!message || !id || waiting) return;
    setText('');
    setNote('');
    addBubble(true, message);
    setWaiting(true);
    try {
      apply(await api(`/v1/voice/text-chat/${id}/say`, { method: 'POST', body: { text: message } }));
    } catch (error) {
      if (error.status === 404) {
        sessionRef.current = null;
        setSessionId(null);
        setEnded('This text test is no longer open. Start a new one.');
      } else {
        setNote(explainTextError(error));
      }
    } finally {
      setWaiting(false);
    }
  }

  function chooseDirection(value) {
    if (sessionId) return;
    setOutbound(value);
    setItems([]);
    setEvents([]);
    setEnded('');
  }

  const running = sessionId !== null;
  const emptyHint = outbound
    ? 'Start the test. The assistant opens the way it does when it contacts a lead; answer as the lead, for example "Yes, this is Jordan".'
    : 'Start the test. The assistant answers the way it does when a customer contacts us; then say what is wrong, for example "My AC is not cooling".';

  return (
    <div className="test-grid">
      <Panel className="test-panel">
        <PanelHead
          title="SMS texts"
          subtitle="Real phone assistant as a text conversation — same prompts, tools, and database; no speech or Twilio."
        />
        <Tabs
          options={[['inbound', 'Inbound: customer texts us'], ['outbound', 'Outbound: we text a lead']]}
          value={outbound ? 'outbound' : 'inbound'}
          onChange={(id) => chooseDirection(id === 'outbound')}
          label="Call direction"
          variant="pill"
        />
        <div className="field">
          <label htmlFor="tcPhone">{outbound ? "Lead's phone number" : "Customer's phone number"}</label>
          <input
            id="tcPhone"
            type="text"
            inputMode="tel"
            placeholder="+1 803 555 0101"
            autoComplete="off"
            value={phone}
            disabled={running}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        {outbound ? (
          <div className="test-lead-row">
            <div className="field">
              <label htmlFor="tcName">Lead's name</label>
              <input id="tcName" type="text" placeholder="Jordan" maxLength={80} autoComplete="off" value={leadName} disabled={running} onChange={(e) => setLeadName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="tcInterest">What they asked about</label>
              <input id="tcInterest" type="text" placeholder="AC repair" maxLength={120} autoComplete="off" value={interest} disabled={running} onChange={(e) => setInterest(e.target.value)} />
            </div>
          </div>
        ) : null}
        <div className="test-controls">
          <button type="button" className={`btn ${running ? 'btn--danger' : 'btn--primary'}`} disabled={startBusy} onClick={() => (running ? hangUp() : startCall())}>
            {running ? 'End test' : 'Start test'}
          </button>
        </div>
        {status ? <p className="muted small" role="status">{status}</p> : null}
        {note ? <Note text={note} tone="bad" /> : null}
      </Panel>

      <Panel className="test-panel">
        <PanelHead title="Conversation">
          <button type="button" className="btn btn--ghost btn--small" disabled={running} onClick={() => { setItems([]); setEvents([]); setEnded(''); }}>Clear</button>
        </PanelHead>
        <div className="test-transcript" aria-live="polite" ref={box}>
          {items.length === 0 ? <p className="muted empty">{emptyHint}</p> : null}
          {items.map((item) => (
            <div key={item.id} className={`test-bubble ${item.mine ? 'test-bubble--user' : 'test-bubble--agent'}`}>
              <span className="test-bubble__who">{item.mine ? (outboundRef.current ? 'Lead (you)' : 'Customer (you)') : 'Assistant'}</span>
              <span className="test-bubble__body">{item.message}</span>
            </div>
          ))}
          {waiting ? <p className="muted small">The assistant is answering…</p> : null}
        </div>
        {ended ? <p className="note" role="status">{ended}</p> : null}
        <form className="test-compose" onSubmit={send}>
          <input
            type="text"
            aria-label="Your text message"
            placeholder="Type your text message"
            maxLength={1000}
            autoComplete="off"
            value={text}
            disabled={!running || waiting}
            onChange={(e) => setText(e.target.value)}
          />
          <button className="btn btn--primary" type="submit" disabled={!running || waiting || !text.trim()}>Send</button>
        </form>
        <h3 className="test-events-title">What the assistant did</h3>
        <ul className="test-events" aria-label="Tools the assistant used">
          {events.length === 0 ? <li className="muted small">No tools used yet.</li> : null}
          {events.map((event) => (
            <li key={event.id} className={event.error ? 'test-events--bad' : undefined}>
              <strong>{event.tool || 'tool'}</strong>
              <span className="muted small">{` ${event.arguments ? `(${event.arguments})` : ''} → ${event.result || ''}`}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

// ---------- Voice call tab ----------
function VoiceCall() {
  const [agentState, setAgentStateValue] = useState('idle');
  const [status, setStatus] = useState('');
  const [active, setActive] = useState(false);
  const [micMuted, setMicMutedValue] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [userIdLocked, setUserIdLocked] = useState(false);
  const [bubbles, setBubbles] = useState([]);
  const [hintVisible, setHintVisible] = useState(true);

  const roomRef = useRef(null);
  const micMutedRef = useRef(false);
  const agentJoinTimerRef = useRef(null);
  const userIdRef = useRef(null);
  const transcriptRef = useRef(null);

  function setMicMuted(value) {
    micMutedRef.current = value;
    setMicMutedValue(value);
  }

  useEffect(() => {
    const input = userIdRef.current;
    if (!input) return undefined;
    input.value = safeStorageGet(USER_ID_STORAGE_KEY) || randomUserId();
    safeStorageSet(USER_ID_STORAGE_KEY, input.value);
    const onChange = () => {
      if (!input.value.trim()) input.value = randomUserId();
      safeStorageSet(USER_ID_STORAGE_KEY, input.value.trim());
    };
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, []);

  useEffect(() => () => {
    clearTimeout(agentJoinTimerRef.current);
    const activeRoom = roomRef.current;
    roomRef.current = null;
    if (activeRoom) activeRoom.disconnect();
    document.querySelectorAll('audio[data-agent-audio]').forEach((node) => node.remove());
  }, []);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [bubbles]);

  async function onMuteClick() {
    const room = roomRef.current;
    if (!room) return;
    setMuteBusy(true);
    try {
      await room.localParticipant.setMicrophoneEnabled(micMutedRef.current);
      setMicMuted(!micMutedRef.current);
    } catch (err) {
      setStatus(`Couldn't change mic: ${err.message}`);
    } finally {
      setMuteBusy(false);
    }
  }

  function resetCallUI() {
    clearTimeout(agentJoinTimerRef.current);
    document.querySelectorAll('audio[data-agent-audio]').forEach((node) => node.remove());
    setActive(false);
    setUserIdLocked(false);
    setMicMuted(false);
    setAgentStateValue('idle');
  }

  async function handleTranscriptStream(streamRoom, reader, participantInfo) {
    const attributes = reader.info.attributes || {};
    const segmentId = attributes['lk.segment_id'] || reader.info.id;
    const isFinal = attributes['lk.transcription_final'] === 'true';
    const isUser = participantInfo.identity === streamRoom.localParticipant.identity;

    let text = '';
    for await (const chunk of reader) {
      if (streamRoom !== roomRef.current) return;
      text += chunk;
      renderBubble(segmentId, isUser, text, !isFinal && isUser);
    }
    if (streamRoom === roomRef.current && text) renderBubble(segmentId, isUser, text, false);
  }

  function renderBubble(segmentId, isUser, text, interim) {
    if (!text.trim()) return;
    setHintVisible(false);
    setBubbles((prev) => {
      const index = prev.findIndex((bubble) => bubble.id === segmentId);
      if (index === -1) return [...prev, { id: segmentId, isUser, text, interim }];
      const next = prev.slice();
      next[index] = { ...prev[index], text, interim };
      return next;
    });
  }

  async function startCall() {
    const userId = userIdRef.current?.value.trim();
    if (!userId) return;

    setCallBusy(true);
    setAgentStateValue('connecting');
    setStatus('');

    const newRoom = new Room();
    try {
      const { token, url } = await fetchVoiceToken(userId);

      newRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (newRoom !== roomRef.current || track.kind !== Track.Kind.Audio) return;
        const audio = track.attach();
        audio.dataset.agentAudio = 'true';
        document.body.appendChild(audio);
      });
      newRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((node) => node.remove());
      });
      newRoom.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
        if (newRoom !== roomRef.current || participant.isLocal) return;
        if (AGENT_STATE_ATTRIBUTE in changed) {
          clearTimeout(agentJoinTimerRef.current);
          setStatus('');
          setAgentStateValue(changed[AGENT_STATE_ATTRIBUTE]);
        }
      });
      newRoom.on(RoomEvent.Disconnected, () => {
        if (newRoom !== roomRef.current) return;
        roomRef.current = null;
        resetCallUI();
      });
      newRoom.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, participantInfo) =>
        handleTranscriptStream(newRoom, reader, participantInfo));

      await newRoom.connect(url, token);
      roomRef.current = newRoom;
      await newRoom.localParticipant.setMicrophoneEnabled(true);
      setMicMuted(false);

      setAgentStateValue('initializing');
      agentJoinTimerRef.current = setTimeout(() => {
        if (newRoom !== roomRef.current) return;
        setStatus('The assistant hasn\'t joined. Make sure the voice worker is running (look for "registered worker" in its logs), then end this call and start a new one.');
      }, AGENT_JOIN_TIMEOUT_MS);
      setActive(true);
      setUserIdLocked(true);
      setHintVisible(false);
    } catch (err) {
      roomRef.current = null;
      await newRoom.disconnect();
      resetCallUI();
      setStatus(`Couldn't connect: ${err.message}`);
    } finally {
      setCallBusy(false);
    }
  }

  async function endCall() {
    const activeRoom = roomRef.current;
    roomRef.current = null;
    if (activeRoom) await activeRoom.disconnect();
    resetCallUI();
    setStatus('Call ended — the assistant will remember this conversation next time.');
  }

  return (
    <div className="test-grid">
      <Panel className="test-panel">
        <PanelHead title="Voice call" subtitle="LiveKit room via POST /v1/voice/token. Uses the console session cookie and CSRF token." />
        <div className="field">
          <label htmlFor="userIdInput">Your user ID</label>
          <input id="userIdInput" type="text" placeholder="e.g. jane-doe" autoComplete="off" ref={userIdRef} disabled={userIdLocked} />
          <small className="muted">The assistant remembers you across calls by this ID. Change it to start as a new customer.</small>
        </div>
        <div className={`test-agent-state test-agent-state--${agentState}`} data-state={agentState}>
          <span className="test-agent-state__dot" aria-hidden="true" />
          <span>{STATE_LABELS[agentState] || agentState}</span>
        </div>
        <div className="test-controls">
          <button
            type="button"
            className={`btn ${active ? 'btn--danger' : 'btn--primary'}`}
            disabled={callBusy}
            aria-pressed={active ? 'true' : 'false'}
            onClick={() => (roomRef.current ? endCall() : startCall())}
          >
            {active ? 'End call' : 'Start call'}
          </button>
          {active ? (
            <button
              type="button"
              className="btn btn--secondary"
              aria-pressed={String(micMuted)}
              disabled={muteBusy}
              onClick={onMuteClick}
            >
              {micMuted ? 'Mic off' : 'Mic on'}
            </button>
          ) : null}
        </div>
        {status ? <p className="muted small" role="status">{status}</p> : null}
      </Panel>

      <Panel className="test-panel">
        <PanelHead title="Conversation">
          <button type="button" className="btn btn--ghost btn--small" onClick={() => { setBubbles([]); setHintVisible(true); }}>Clear</button>
        </PanelHead>
        <div className="test-transcript" aria-live="polite" ref={transcriptRef}>
          {hintVisible ? <p className="muted empty">Start a call and ask about an order, refund, billing or account issue.</p> : null}
          {bubbles.map((bubble) => (
            <div key={bubble.id} className={`test-bubble ${bubble.isUser ? 'test-bubble--user' : 'test-bubble--agent'}${bubble.interim ? ' test-bubble--interim' : ''}`}>
              <span className="test-bubble__who">{bubble.isUser ? 'You' : 'Assistant'}</span>
              <span className="test-bubble__body">{bubble.text}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

export default function TestPage() {
  const [mode, setMode] = useState('voice');

  return (
    <div className="test-page">
      <PageHeader
        eyebrow="Workspace"
        title="Test"
        subtitle="Try the phone assistant: LiveKit voice or the same assistant over plain HTTP text."
      />
      <Tabs
        options={[['voice', 'Voice call'], ['sms', 'SMS texts']]}
        value={mode}
        onChange={setMode}
        label="Test mode"
        variant="section"
      />
      {mode === 'voice' ? <VoiceCall /> : <TextCall />}
      <p className="muted small test-foot">
        Endpoints: voice token, text-chat start/say/end (same as the former call page).
        Auth: console session cookie + CSRF (admin). Legacy entry: <a href="call.html">call.html</a>.
      </p>
    </div>
  );
}
