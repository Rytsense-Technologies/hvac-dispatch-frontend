// Sample frontend for the voice customer support agent.
// Flow: POST /v1/voice/token -> join the LiveKit room -> publish the mic.
// The voice worker joins the same room, talks back over an audio track,
// publishes live transcripts on the "lk.transcription" text stream topic,
// and reports its state (listening/thinking/speaking) via the
// "lk.agent.state" participant attribute.
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Room, RoomEvent, Track } from "livekit-client";
import "../styles/call.css";

// Same address as this page (the frontend server forwards /v1 to the API); set a full URL here to call another host.
const API_BASE = "";
const USER_ID_STORAGE_KEY = "voice_support_user_id";

const TRANSCRIPTION_TOPIC = "lk.transcription";
const AGENT_STATE_ATTRIBUTE = "lk.agent.state";

const STATE_LABELS = {
  idle: "Not connected",
  connecting: "Connecting...",
  initializing: "Assistant is joining...",
  listening: "Listening - speak anytime",
  thinking: "Thinking...",
  speaking: "Assistant is speaking",
};

// LiveKit only dispatches an agent when the room is created - if no voice
// worker was registered at that moment, none will ever join this call.
const AGENT_JOIN_TIMEOUT_MS = 15000;

// ---------- user id ----------

function randomUserId() {
  return "guest-" + Math.random().toString(36).slice(2, 8);
}

function safeStorageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// The call uses the console sign-in (the session cookie plus its CSRF token), exactly like the text-message test box below. There is no key to type.
let voiceCsrf = null;

async function sessionHeaders() {
  if (voiceCsrf === null) {
    const me = await fetch(`${API_BASE}/v1/auth/me`, { credentials: "same-origin", headers: { Accept: "application/json" } });
    if (!me.ok) throw new Error("Sign in to the console first, then reload this page.");
    voiceCsrf = ((await me.json().catch(() => ({}))).csrf_token) || "";
  }
  return voiceCsrf ? { "X-CSRF-Token": voiceCsrf } : {};
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable - fine */ }
}

// ---------- API ----------

async function fetchVoiceToken(userId) {
  const res = await fetch(`${API_BASE}/v1/voice/token?user_id=${encodeURIComponent(userId)}`, {
    method: "POST",
    credentials: "same-origin",
    headers: await sessionHeaders(),
  });
  if (res.status === 401 || res.status === 403) voiceCsrf = null; // the session ended: it is checked again next time
  if (res.status === 401) throw new Error("Sign in to the console first, then reload this page.");
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? " - " + body : ""}`);
  }
  return res.json();
}

// ---------- text-message test ----------
// Type a text as the customer and see what the SMS assistant would answer. Signed in as an admin (the console's session cookie);
// nothing is sent to anyone and staff are not alerted.
const SMS_PHONE_STORAGE_KEY = "sms_test_phone";
async function smsApi(path, { method = "GET", body, csrf } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data && data.detail;
    const error = new Error(typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d) => d.msg).join("; ") : `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

function SmsTest() {
  const [phone, setPhone] = useState(() => safeStorageGet(SMS_PHONE_STORAGE_KEY) || "");
  const [text, setText] = useState("");
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [signedIn, setSignedIn] = useState(null);
  const csrf = useRef(null);
  const box = useRef(null);
  const counter = useRef(0);

  useEffect(() => {
    smsApi("/v1/auth/me").then((data) => { csrf.current = data.csrf_token; setSignedIn(true); }).catch(() => setSignedIn(false));
  }, []);
  useEffect(() => { box.current.scrollTop = box.current.scrollHeight; }, [items]);

  const add = (mine, message, flag) => setItems((prev) => [...prev, { id: counter.current++, mine, message, flag }]);

  async function send(event) {
    event.preventDefault();
    const message = text.trim();
    if (!message || busy) return;
    if (phone.replace(/\D/g, "").length < 7) { setNote("Enter the customer's phone number, with the country code."); return; }
    safeStorageSet(SMS_PHONE_STORAGE_KEY, phone.trim());
    setBusy(true);
    setNote("");
    add(true, message);
    setText("");
    try {
      const out = await smsApi("/v1/sms-bot/test", { method: "POST", body: { phone: phone.trim(), message }, csrf: csrf.current });
      if (out.reply) add(false, out.reply, out.needs_a_person ? "A real text would also alert your team." : "");
      else setNote(out.note || "No reply.");
    } catch (error) {
      if (error.status === 401) setSignedIn(false);
      setNote(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <label htmlFor="smsPhone">Customer's phone number</label>
        <input id="smsPhone" type="text" inputMode="tel" placeholder="+1 803 555 0101" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <p className="muted small">The assistant answers from the visits it finds for this number. This is a test box: nothing is sent to anyone and your team is not alerted.</p>
      </section>

      <section className="card">
        <div className="transcript-header">
          <h2>Text conversation</h2>
          <button className="link-btn" type="button" onClick={() => { setItems([]); setNote(""); }}>Clear</button>
        </div>
        <div className="transcript" aria-live="polite" ref={box}>
          {items.length === 0 ? <p className="muted empty-hint">Type a text as the customer, for example "What time is my technician coming?"</p> : null}
          {items.map((item) => (
            <div key={item.id} className={`bubble ${item.mine ? "user" : "agent"}`}>
              <span className="who">{item.mine ? "Customer" : "Assistant"}</span>
              <span className="body">{item.message}</span>
              {item.flag ? <span className="flag">{item.flag}</span> : null}
            </div>
          ))}
        </div>
        <form className="sms-form" onSubmit={send}>
          <input type="text" aria-label="Text message" placeholder="Type a text message" maxLength={1000} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} disabled={signedIn === false} />
          <button className="send-btn" type="submit" disabled={busy || signedIn === false || !text.trim()}>Send</button>
        </form>
        {signedIn === false ? <p className="muted small">Sign in to the console first, then reload this page. <a href="index.html">Open the console</a></p> : null}
        <p className="muted small status-line" role="status">{note}</p>
      </section>
    </>
  );
}

// ---------- text call ----------
// The real phone assistant, typed instead of spoken (the "Text call" tab). The server starts the same voice worker in a room with the speech turned off (voice/text_call.py):
// the same instructions, tools, opening and endings as a voice call, with no speech-to-text or text-to-speech cost. Inbound = you are a customer who phoned in; outbound = you are the lead
// the assistant is calling. Admin only (the console's session cookie plus its CSRF token). Everything the server sends is shown as text, never as HTML.
const TEXT_CALL_PHONE_KEY = "text_call_phone";
const CHAT_TOPIC = "lk.chat";
const EVENTS_TOPIC_FALLBACK = "test-call-events";
const TEXT_JOIN_WAIT_MS = 25000;

function TextCall() {
  const [outbound, setOutbound] = useState(false);
  const [phone, setPhone] = useState(() => safeStorageGet(TEXT_CALL_PHONE_KEY) || "");
  const [leadName, setLeadName] = useState("");
  const [interest, setInterest] = useState("");
  const [running, setRunning] = useState(false);
  const [startBusy, setStartBusy] = useState(false);
  const [heard, setHeard] = useState(false);
  const [items, setItems] = useState([]);
  const [events, setEvents] = useState([]);
  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [ended, setEnded] = useState("");
  const roomRef = useRef(null);
  const csrf = useRef(null);
  const eventsTopic = useRef(EVENTS_TOPIC_FALLBACK);
  const joinTimer = useRef(null);
  const heardRef = useRef(false);
  const counter = useRef(0);
  const outboundRef = useRef(false);
  const box = useRef(null);

  useEffect(() => { outboundRef.current = outbound; }, [outbound]);
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [items]);
  // Leaving the tab or the page ends the call.
  useEffect(() => () => {
    clearTimeout(joinTimer.current);
    const room = roomRef.current;
    roomRef.current = null;
    if (room) room.disconnect();
  }, []);

  const addBubble = (mine, message) => setItems((prev) => [...prev, { id: counter.current++, mine, message }]);

  function finished(message) {
    clearTimeout(joinTimer.current);
    roomRef.current = null;
    heardRef.current = false;
    setHeard(false);
    setRunning(false);
    setStatus("");
    setEnded(message);
  }

  async function hangUp(message) {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) await room.disconnect().catch(() => {});
    finished(message);
  }

  async function startCall() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) { setNote("Enter the phone number with the country code (8 to 15 digits)."); return; }
    safeStorageSet(TEXT_CALL_PHONE_KEY, phone.trim());
    setNote("");
    setEnded("");
    setItems([]);
    setEvents([]);
    heardRef.current = false;
    setHeard(false);
    setStartBusy(true);
    const room = new Room();
    try {
      if (csrf.current === null) {                                  // the same console sign-in as the other tabs
        const me = await smsApi("/v1/auth/me");
        csrf.current = me.csrf_token;
      }
      const made = await smsApi("/v1/voice/text-call", {
        method: "POST",
        csrf: csrf.current,
        body: { direction: outbound ? "outbound" : "inbound", phone: phone.trim(), name: outbound ? leadName.trim() || null : null, interest: outbound ? interest.trim() || null : null },
      });
      eventsTopic.current = made.events_topic || EVENTS_TOPIC_FALLBACK;
      roomRef.current = room;
      room.registerTextStreamHandler(TRANSCRIPTION_TOPIC, async (reader) => {
        let said = "";
        for await (const chunk of reader) said += chunk;
        if (!said.trim() || room !== roomRef.current) return;
        addBubble(false, said.trim());
        if (!heardRef.current) {
          heardRef.current = true;
          clearTimeout(joinTimer.current);
          setStatus("Connected. Type as the caller.");
          setHeard(true);
        }
      });
      room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        if (topic !== eventsTopic.current || room !== roomRef.current) return;
        try {
          const event = JSON.parse(new TextDecoder().decode(payload));
          setEvents((prev) => [...prev, { id: counter.current++, ...event }]);
        } catch { /* a message that is not ours is ignored */ }
      });
      room.on(RoomEvent.Disconnected, () => { if (room === roomRef.current) finished("The call has ended (the assistant ended it, or the connection closed)."); });
      await room.connect(made.url, made.token);
      setRunning(true);
      setStatus("Connecting the assistant...");
      joinTimer.current = setTimeout(() => {
        if (roomRef.current === room && !heardRef.current) setStatus("The assistant has not joined. Make sure the voice worker is running, then end this call and start again.");
      }, TEXT_JOIN_WAIT_MS);
    } catch (error) {
      roomRef.current = null;
      await room.disconnect().catch(() => {});
      setNote(error.status === 403 ? "Only an admin can start a text call." : error.status === 401 ? "Sign in to the console first, then reload this page." : error.message);
      setRunning(false);
    } finally {
      setStartBusy(false);
    }
  }

  async function send(event) {
    event.preventDefault();
    const message = text.trim();
    const room = roomRef.current;
    if (!message || !room || !heard) return;
    setText("");
    addBubble(true, message);
    try {
      await room.localParticipant.sendText(message, { topic: CHAT_TOPIC });
    } catch (error) {
      setNote(`Could not send: ${error.message}`);
    }
  }

  function chooseDirection(value) {
    if (running) return;
    setOutbound(value);
    setItems([]);
    setEvents([]);
    setEnded("");
  }

  const emptyHint = outbound
    ? "Start the call. The assistant opens the way it does when it phones a lead; answer as the lead, for example \"Yes, this is Jordan\"."
    : "Start the call. The assistant answers the way it does when a customer phones in; then say what is wrong, for example \"My AC is not cooling\".";

  return (
    <>
      <section className="card">
        <h2>Text call: the same phone assistant, typed</h2>
        <p className="muted small">This is the real phone assistant, with the same instructions, tools and endings as a voice call, but you type instead of speaking, so it costs no speech-to-text or text-to-speech.
          Like a real call, its tools work on real records for the number you enter, so use a test number. A text call is not billed as a call and saves no memory.</p>
        <div className="mode-tabs direction" role="group" aria-label="Call direction">
          <button type="button" className="mode-tab" aria-pressed={String(!outbound)} disabled={running} onClick={() => chooseDirection(false)}>Inbound: a customer phones us</button>
          <button type="button" className="mode-tab" aria-pressed={String(outbound)} disabled={running} onClick={() => chooseDirection(true)}>Outbound: we phone a lead</button>
        </div>
        <label htmlFor="tcPhone">{outbound ? "The lead's phone number (the number being called)" : "The customer's phone number (the number calling us)"}</label>
        <input id="tcPhone" type="text" inputMode="tel" placeholder="+1 803 555 0101" autoComplete="off" value={phone} disabled={running} onChange={(e) => setPhone(e.target.value)} />
        {outbound ? (
          <div className="lead-row">
            <div><label htmlFor="tcName">Lead's name</label><input id="tcName" type="text" placeholder="Jordan" maxLength={80} autoComplete="off" value={leadName} disabled={running} onChange={(e) => setLeadName(e.target.value)} /></div>
            <div><label htmlFor="tcInterest">What they asked about</label><input id="tcInterest" type="text" placeholder="AC repair" maxLength={120} autoComplete="off" value={interest} disabled={running} onChange={(e) => setInterest(e.target.value)} /></div>
          </div>
        ) : null}
        <div className="call-controls">
          <button className="send-btn" type="button" aria-pressed={String(running)} disabled={startBusy} onClick={() => (roomRef.current ? hangUp("Call ended by you.") : startCall())}>{running ? "End call" : "Start call"}</button>
        </div>
        <p className="muted small status-line" role="status">{status}</p>
      </section>

      <section className="card">
        <div className="transcript-header">
          <h2>Conversation</h2>
          <button className="link-btn" type="button" onClick={() => { if (!running) { setItems([]); setEvents([]); setEnded(""); } }}>Clear</button>
        </div>
        <div className="transcript" aria-live="polite" ref={box}>
          {items.length === 0 ? <p className="muted empty-hint">{emptyHint}</p> : null}
          {items.map((item) => (
            <div key={item.id} className={`bubble ${item.mine ? "user" : "agent"}`}>
              <span className="who">{item.mine ? (outboundRef.current ? "Lead (you)" : "Customer (you)") : "Assistant"}</span>
              <span className="body">{item.message}</span>
            </div>
          ))}
        </div>
        {ended ? <p className="ended-banner" role="status">{ended}</p> : null}
        <form className="sms-form" onSubmit={send}>
          <input type="text" aria-label="What you say on the call" placeholder="Type what you say on the call" maxLength={1000} autoComplete="off" value={text} disabled={!heard} onChange={(e) => setText(e.target.value)} />
          <button className="send-btn" type="submit" disabled={!heard || !text.trim()}>Send</button>
        </form>
        <p className="muted small status-line" role="status">{note}</p>
        <h3 className="events-title">What the assistant did</h3>
        <ul className="events" aria-label="Tools the assistant used">
          {events.map((event) => (
            <li key={event.id} className={event.error ? "bad" : undefined}>
              <strong>{event.tool || "tool"}</strong>
              <span className="muted small">{` ${event.arguments ? "(" + event.arguments + ")" : ""} → ${event.result || ""}`}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function CallPage() {
  const [agentState, setAgentStateValue] = useState("idle");
  const [status, setStatus] = useState("");
  const [active, setActive] = useState(false);
  const [micMuted, setMicMutedValue] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [muteBusy, setMuteBusy] = useState(false);
  const [userIdLocked, setUserIdLocked] = useState(false);
  // segment id -> bubble, so interim transcripts update in place.
  const [bubbles, setBubbles] = useState([]);
  const [hintVisible, setHintVisible] = useState(true);
  const [mode, setMode] = useState("voice");

  const roomRef = useRef(null);
  const micMutedRef = useRef(false);
  const agentJoinTimerRef = useRef(null);
  const userIdRef = useRef(null);
  const transcriptRef = useRef(null);

  function setMicMuted(value) {
    micMutedRef.current = value;
    setMicMutedValue(value);
  }

  // ---------- user id ----------

  useEffect(() => {
    const input = userIdRef.current;
    input.value = safeStorageGet(USER_ID_STORAGE_KEY) || randomUserId();
    safeStorageSet(USER_ID_STORAGE_KEY, input.value);
    const onChange = () => {
      if (!input.value.trim()) input.value = randomUserId();
      safeStorageSet(USER_ID_STORAGE_KEY, input.value.trim());
    };
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, []);

  // Leaving the page: drop the call, the remote audio elements and the timer.
  useEffect(() => () => {
    clearTimeout(agentJoinTimerRef.current);
    const activeRoom = roomRef.current;
    roomRef.current = null;
    if (activeRoom) activeRoom.disconnect();
    document.querySelectorAll("audio[data-agent-audio]").forEach((node) => node.remove());
  }, []);

  useEffect(() => {
    const transcript = transcriptRef.current;
    transcript.scrollTop = transcript.scrollHeight;
  }, [bubbles]);

  // ---------- call lifecycle ----------

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

  async function startCall() {
    const userId = userIdRef.current.value.trim();
    if (!userId) return;

    setCallBusy(true);
    setAgentStateValue("connecting");
    setStatus("");

    const newRoom = new Room();
    try {
      const { token, url } = await fetchVoiceToken(userId);

      newRoom.on(RoomEvent.TrackSubscribed, (track) => {
        if (newRoom !== roomRef.current || track.kind !== Track.Kind.Audio) return;
        const audio = track.attach();
        audio.dataset.agentAudio = "true";
        document.body.appendChild(audio);
      });
      newRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((node) => node.remove());
      });
      newRoom.on(RoomEvent.ParticipantAttributesChanged, (changed, participant) => {
        if (newRoom !== roomRef.current || participant.isLocal) return;
        if (AGENT_STATE_ATTRIBUTE in changed) {
          clearTimeout(agentJoinTimerRef.current);
          setStatus("");
          setAgentStateValue(changed[AGENT_STATE_ATTRIBUTE]);
        }
      });
      newRoom.on(RoomEvent.Disconnected, () => {
        if (newRoom !== roomRef.current) return; // cleanup of an abandoned room, not the active call
        roomRef.current = null;
        resetCallUI();
      });
      newRoom.registerTextStreamHandler(TRANSCRIPTION_TOPIC, (reader, participantInfo) =>
        handleTranscriptStream(newRoom, reader, participantInfo)
      );

      await newRoom.connect(url, token);
      // Set before enabling the mic so a denied mic permission can still be
      // cleaned up in the catch block below.
      roomRef.current = newRoom;
      await newRoom.localParticipant.setMicrophoneEnabled(true);
      setMicMuted(false);

      setAgentStateValue("initializing");
      agentJoinTimerRef.current = setTimeout(() => {
        if (newRoom !== roomRef.current) return;
        setStatus("The assistant hasn't joined. Make sure the voice worker is running (look for \"registered worker\" in its logs), then end this call and start a new one.");
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
    setStatus("Call ended - the assistant will remember this conversation next time.");
  }

  function resetCallUI() {
    clearTimeout(agentJoinTimerRef.current);
    document.querySelectorAll("audio[data-agent-audio]").forEach((node) => node.remove());
    setActive(false);
    setUserIdLocked(false);
    setMicMuted(false);
    setAgentStateValue("idle");
  }

  // ---------- live transcript ----------

  // Each stream carries one transcript segment. User segments arrive as
  // several streams (interim updates, then a final one) that share a segment
  // id; agent replies stream in word by word within a single stream. Either
  // way, the bubble's text is replaced with the stream's accumulated text.
  async function handleTranscriptStream(streamRoom, reader, participantInfo) {
    const attributes = reader.info.attributes || {};
    const segmentId = attributes["lk.segment_id"] || reader.info.id;
    const isFinal = attributes["lk.transcription_final"] === "true";
    const isUser = participantInfo.identity === streamRoom.localParticipant.identity;

    let text = "";
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

  function clearTranscript() {
    setBubbles([]);
    setHintVisible(true);
  }

  return (
    <>
      <header className="topbar">
        <h1>🎧 Test call <span className="badge">voice assistant</span> <a className="back" href="index.html">Back to the console</a></h1>
      </header>

      <main className="content">

        <div className="mode-tabs" role="group" aria-label="Test mode">
          <button type="button" className="mode-tab" aria-pressed={String(mode === "voice")} onClick={() => setMode("voice")}>Voice call</button>
          <button type="button" className="mode-tab" aria-pressed={String(mode === "textcall")} onClick={() => setMode("textcall")}>Text call</button>
          <button type="button" className="mode-tab" aria-pressed={String(mode === "sms")} onClick={() => setMode("sms")}>SMS texts</button>
        </div>

        <section className="card" hidden={mode !== "voice"}>
          <label htmlFor="userIdInput">Your user ID</label>
          <input id="userIdInput" type="text" placeholder="e.g. jane-doe" autoComplete="off" ref={userIdRef} disabled={userIdLocked} />
          <p className="muted small">The assistant remembers you across calls by this ID. Change it to start as a new customer.</p>
        </section>

        <section className="card call-card" hidden={mode !== "voice"}>
          <div id="agentState" className="agent-state" data-state={agentState}>
            <span className="dot"></span>
            <span id="agentStateLabel">{STATE_LABELS[agentState] || agentState}</span>
          </div>

          <div className="call-controls">
            <button id="callBtn" className="call-btn" aria-pressed={active ? "true" : "false"} disabled={callBusy}
              onClick={() => (roomRef.current ? endCall() : startCall())}>
              <span id="callIcon">{active ? "📴" : "📞"}</span>
              <span id="callLabel">{active ? "End call" : "Start call"}</span>
            </button>
            <button id="muteBtn" className="mute-btn" aria-pressed={String(micMuted)} hidden={!active} disabled={muteBusy}
              onClick={onMuteClick}>
              <span id="muteIcon">{micMuted ? "🔇" : "🎤"}</span>
              <span id="muteLabel">{micMuted ? "Mic off" : "Mic on"}</span>
            </button>
          </div>
          <p id="callStatus" className="muted small status-line">{status}</p>
        </section>

        <section className="card" hidden={mode !== "voice"}>
          <div className="transcript-header">
            <h2>Conversation</h2>
            <button id="clearBtn" className="link-btn" onClick={clearTranscript}>Clear</button>
          </div>
          <div id="transcript" className="transcript" aria-live="polite" ref={transcriptRef}>
            {hintVisible ? <p className="muted empty-hint">Start a call and ask about an order, refund, billing or account issue.</p> : null}
            {bubbles.map((bubble) => (
              <div key={bubble.id} className={`bubble ${bubble.isUser ? "user" : "agent"}${bubble.interim ? " interim" : ""}`}>
                <span className="who">{bubble.isUser ? "You" : "Assistant"}</span>
                <span className="body">{bubble.text}</span>
              </div>
            ))}
          </div>
        </section>

        {mode === "textcall" ? <TextCall /> : null}
        {mode === "sms" ? <SmsTest /> : null}

      </main>

      <footer className="footer">
        <p>Test page - API at <code id="apiBaseLabel">{API_BASE || location.origin}</code></p>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(<CallPage />);
