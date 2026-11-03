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
// The staff API key is NOT stored in this file (anyone who can load the page could read it). It is asked for
// once and kept for this browser tab only. Leave the prompt empty if the backend has no API_KEY set.
const API_KEY_STORAGE_KEY = "voice_support_api_key";
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

function getApiKey() {
  try {
    let key = sessionStorage.getItem(API_KEY_STORAGE_KEY);
    if (key === null) {
      key = window.prompt("Staff API key (kept in this browser tab only; leave empty if the server has none):") || "";
      sessionStorage.setItem(API_KEY_STORAGE_KEY, key);
    }
    return key;
  } catch {
    return "";
  }
}

function forgetApiKey() {
  try { sessionStorage.removeItem(API_KEY_STORAGE_KEY); } catch { /* nothing to forget */ }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable - fine */ }
}

// ---------- API ----------

async function fetchVoiceToken(userId) {
  const res = await fetch(`${API_BASE}/v1/voice/token?user_id=${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: getApiKey() ? { "X-API-Key": getApiKey() } : {},
  });
  if (res.status === 401) forgetApiKey(); // a wrong key is asked for again next time
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
// The texts WE send on our own (the same ones the real system sends); picking one shows it, nothing is actually sent.
const OUTBOUND_KINDS = [["confirmation", "Appointment confirmation"], ["reminder", "Appointment reminder"], ["on_the_way", "Technician on the way"]];

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
  const [direction, setDirection] = useState("in");
  const [kind, setKind] = useState(OUTBOUND_KINDS[0][0]);
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

  // The other direction: the system texts the customer first (confirmation, reminder, "on the way"). Shown, not sent.
  async function sendOutbound(event) {
    event.preventDefault();
    if (busy) return;
    if (phone.replace(/\D/g, "").length < 7) { setNote("Enter the customer's phone number, with the country code."); return; }
    safeStorageSet(SMS_PHONE_STORAGE_KEY, phone.trim());
    setBusy(true);
    setNote("");
    try {
      const out = await smsApi("/v1/sms-bot/test-outbound", { method: "POST", body: { phone: phone.trim(), kind }, csrf: csrf.current });
      add(false, out.text, `Outbound text: ${out.label}. Shown here, not actually sent. Switch to "Inbound" to reply.`);
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
        <div className="mode-tabs direction" role="group" aria-label="Direction">
          <button type="button" className="mode-tab" aria-pressed={String(direction === "in")} onClick={() => setDirection("in")}>Inbound: customer texts us</button>
          <button type="button" className="mode-tab" aria-pressed={String(direction === "out")} onClick={() => setDirection("out")}>Outbound: we text the customer</button>
        </div>
        {direction === "in" ? (
          <form className="sms-form" onSubmit={send}>
            <input type="text" aria-label="Text message" placeholder="Type a text message" maxLength={1000} autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} disabled={signedIn === false} />
            <button className="send-btn" type="submit" disabled={busy || signedIn === false || !text.trim()}>Send</button>
          </form>
        ) : (
          <form className="out-row" onSubmit={sendOutbound}>
            <select aria-label="Which text we send" value={kind} onChange={(e) => setKind(e.target.value)} disabled={signedIn === false}>
              {OUTBOUND_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button className="send-btn" type="submit" disabled={busy || signedIn === false}>Show the text</button>
          </form>
        )}
        {signedIn === false ? <p className="muted small">Sign in to the console first, then reload this page. <a href="index.html">Open the console</a></p> : null}
        <p className="muted small status-line" role="status">{note}</p>
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
          <button type="button" className="mode-tab" aria-pressed={String(mode === "sms")} onClick={() => setMode("sms")}>Text messages</button>
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

        {mode === "sms" ? <SmsTest /> : null}

      </main>

      <footer className="footer">
        <p>Test page - API at <code id="apiBaseLabel">{API_BASE || location.origin}</code></p>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(<CallPage />);
