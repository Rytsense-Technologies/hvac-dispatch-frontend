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

        <section className="card">
          <label htmlFor="userIdInput">Your user ID</label>
          <input id="userIdInput" type="text" placeholder="e.g. jane-doe" autoComplete="off" ref={userIdRef} disabled={userIdLocked} />
          <p className="muted small">The assistant remembers you across calls by this ID. Change it to start as a new customer.</p>
        </section>

        <section className="card call-card">
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

        <section className="card">
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

      </main>

      <footer className="footer">
        <p>Test page - API at <code id="apiBaseLabel">{API_BASE || location.origin}</code></p>
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")).render(<CallPage />);
