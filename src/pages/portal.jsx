// Customer portal: log in with a phone number + a texted code, then see your own details.
// Everything that came from a customer's own words is rendered as TEXT (never as HTML).
import { Fragment, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "../styles/portal.css";

const API = window.PORTAL_API_BASE || `${location.protocol}//${location.hostname}:8010`;
const TOKEN_KEY = "portal_token";

const session = {
  get token() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(value) { try { value ? sessionStorage.setItem(TOKEN_KEY, value) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

const STATUS = {
  NEW: ["Received", "muted"], QUALIFYING: ["Gathering details", "muted"], QUALIFIED: ["Ready to schedule", ""],
  APPOINTMENT_BOOKED: ["Visit booked", "ok"], IN_PROGRESS: ["In progress", ""], COMPLETED: ["Completed", "ok"],
  CANCELLED: ["Cancelled", "muted"],
};
const STEPS = [["NEW", "Received"], ["QUALIFIED", "Details collected"], ["APPOINTMENT_BOOKED", "Visit booked"],
  ["IN_PROGRESS", "In progress"], ["COMPLETED", "Completed"]];
const ORDER = ["NEW", "QUALIFYING", "QUALIFIED", "APPOINTMENT_BOOKED", "IN_PROGRESS", "COMPLETED"];
const DETAIL_LABELS = {
  equipment_type: "Equipment", brand: "Brand", age: "Age", symptoms: "What is happening", location_in_home: "Where",
  severity: "How bad", started: "Started", water_shutoff: "Water shut off", safety_concern: "Safety concern",
};
const TABS = [["overview", "Overview"], ["requests", "Requests"], ["appointments", "Appointments"], ["memory", "What we remember"], ["profile", "Profile"]];

// ---- talking to the API -------------------------------------------------------------------------
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }

// Set by the App component: what to do when the server says the session is over.
let onSignedOut = () => {};

async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`;
  let response;
  try {
    response = await fetch(`${API}/v1/portal${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check your connection and try again.");
  }
  let data = null;
  try { data = await response.json(); } catch { /* no body */ }
  if (response.status === 401 && auth) { onSignedOut(); throw new ApiError(401, "Your session ended. Please log in again."); }
  if (!response.ok) {
    const detail = data && typeof data.detail === "string" ? data.detail : "Something went wrong. Please try again.";
    throw new ApiError(response.status, detail);
  }
  return data;
}

// ---- formatting --------------------------------------------------------------------------------------
function when(iso, timezone) {
  if (!iso) return "";
  const options = { dateStyle: "medium", timeStyle: "short" };
  try { return new Date(iso).toLocaleString(undefined, { ...options, timeZone: timezone }); }
  catch { return new Date(iso).toLocaleString(undefined, options); }
}
const asText = (value) => (Array.isArray(value) ? value.join(", ") : String(value));
const firstName = (name) => (name || "").trim().split(/\s+/)[0] || "";

function Chip({ text, kind = "" }) { return <span className={`chip ${kind ? `chip--${kind}` : ""}`}>{text}</span>; }

function Notice({ text, kind = "" }) { return <div className={`notice ${kind ? `notice--${kind}` : ""}`} role={kind === "error" ? "alert" : "status"}>{text}</div>; }

// ---- login -----------------------------------------------------------------------------------------------
function PhoneStep({ initialPhone, message, onPhone, onCode, onFail }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { inputRef.current.focus(); }, []);

  async function onSubmit(event) {
    event.preventDefault();
    const phone = inputRef.current.value.trim();
    onPhone(phone);
    if (!phone) return;
    setBusy(true);
    try {
      const answer = await api("/request-code", { method: "POST", body: { phone }, auth: false });
      onCode(phone, answer);
    } catch (error) { setBusy(false); onFail(phone, error.message); }
  }

  return (
    <>
      <h1>Log in</h1>
      <p className="muted">Enter the phone number you call us from. We will text you a one-time code.</p>
      <form noValidate onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="phone">Your phone number</label>
          <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" defaultValue={initialPhone} required ref={inputRef} />
        </div>
        <button className="btn" type="submit" style={{ width: "100%" }} disabled={busy}>Send me a code</button>
      </form>
      {message ? <Notice text={message} kind="error" /> : null}
    </>
  );
}

function CodeStep({ phone, answer, message, onVerified, onAnswer, onFail, onChangeNumber }) {
  const inputRef = useRef(null);
  const tickRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(30);

  useEffect(() => {
    inputRef.current.focus();
    tickRef.current = setInterval(() => {
      setCooldown((value) => {
        const next = value - 1;
        if (next <= 0) clearInterval(tickRef.current);
        return next;
      });
    }, 1000);
    return () => clearInterval(tickRef.current);
  }, []);

  async function onResend() {
    clearInterval(tickRef.current);
    try { onAnswer(await api("/request-code", { method: "POST", body: { phone }, auth: false })); }
    catch (error) { onFail(error.message); }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api("/verify", { method: "POST", body: { phone, code: inputRef.current.value.trim() }, auth: false });
      clearInterval(tickRef.current);
      onVerified(result.token);
    } catch (error) { setBusy(false); clearInterval(tickRef.current); onFail(error.message); }
  }

  return (
    <>
      <h1>Check your messages</h1>
      <p className="muted">{answer.message || "If this number is registered with us, a code has been sent to it."}</p>
      {answer.dev_code ? <Notice text={`Test mode: your code is ${answer.dev_code}`} kind="dev" /> : null}
      <form noValidate onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="code">Enter the 6-digit code</label>
          <input id="code" className="code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]*" aria-label="6-digit code" required ref={inputRef} />
        </div>
        <button className="btn" type="submit" style={{ width: "100%" }} disabled={busy}>Log in</button>
      </form>
      {message ? <Notice text={message} kind="error" /> : null}
      <div className="row row--between" style={{ marginTop: "1rem" }}>
        <button className="btn btn--link" type="button" disabled={cooldown > 0} onClick={onResend}>
          {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
        </button>
        <button className="btn btn--link" type="button" onClick={() => { clearInterval(tickRef.current); onChangeNumber(); }}>Use a different number</button>
      </div>
    </>
  );
}

function Login({ onVerified }) {
  const phoneRef = useRef("");
  // `key` makes every step a fresh element, like re-rendering the card from scratch.
  const [step, setStep] = useState({ name: "phone", key: 0 });
  const next = (rest) => setStep((prev) => ({ ...rest, key: prev.key + 1 }));

  return (
    <section className="card card--narrow">
      {step.name === "phone" ? (
        <PhoneStep key={step.key} initialPhone={phoneRef.current} message={step.message}
          onPhone={(phone) => { phoneRef.current = phone; }}
          onCode={(phone, answer) => next({ name: "code", answer })}
          onFail={(phone, message) => next({ name: "phone", message })} />
      ) : (
        <CodeStep key={step.key} phone={phoneRef.current} answer={step.answer} message={step.message}
          onVerified={onVerified}
          onAnswer={(answer) => next({ name: "code", answer })}
          onFail={(message) => next({ name: "code", answer: step.answer, message })}
          onChangeNumber={() => next({ name: "phone" })} />
      )}
    </section>
  );
}

// ---- the signed-in app ---------------------------------------------------------------------------------------

// Load a view's data once; a 401 has already sent the user back to the login screen.
function useLoad(load) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    let alive = true;
    load().then(
      (data) => { if (alive) setState({ data, error: null }); },
      (error) => { if (alive && error.status !== 401) setState({ data: null, error }); },
    );
    return () => { alive = false; };
  }, []);
  return state;
}

function Loading() { return <p className="muted">Loading…</p>; }

function AppointmentCard({ a, me }) {
  const cancelled = a.status !== "confirmed";
  return (
    <article className="card">
      <div className="row row--between">
        <h3>{a.purpose || "Appointment"}</h3>
        <Chip text={cancelled ? "Cancelled" : (a.upcoming ? "Confirmed" : "Done")} kind={cancelled ? "muted" : (a.upcoming ? "ok" : "muted")} />
      </div>
      <p className="muted">{`${when(a.start_at, me && me.timezone)} – ${new Date(a.end_at).toLocaleTimeString(undefined, { timeStyle: "short", timeZone: me && me.timezone })}`}</p>
    </article>
  );
}

function RequestCard({ r, me }) {
  const [label, kind] = STATUS[r.status] || [r.status, "muted"];
  const reached = r.status === "CANCELLED" ? -1 : ORDER.indexOf(r.status);
  const stepDone = (key) => reached >= 0 && ORDER.indexOf(key) <= reached;
  const details = Object.entries(r.details || {});
  const timezone = me && me.timezone;
  return (
    <article className="card">
      <div className="row row--between">
        <h3>{r.service_type || r.category}</h3>
        <div className="chips">
          {r.is_emergency ? <Chip text="Emergency" kind="emergency" /> : (r.priority === "high" ? <Chip text="High priority" kind="high" /> : null)}
          <Chip text={label} kind={kind} />
        </div>
      </div>
      <p className="muted small">{`${r.category} · requested ${when(r.created_at, timezone)}`}</p>
      <p>{r.description}</p>
      {r.status === "CANCELLED" ? null : (
        <ol className="steps" aria-label="Progress">
          {STEPS.map(([key, text]) => <li key={key} className={stepDone(key) ? "done" : ""}>{text}</li>)}
        </ol>
      )}
      {details.length ? (
        <dl className="kv">
          {details.map(([k, v]) => <Fragment key={k}><dt>{DETAIL_LABELS[k] || k}</dt><dd>{asText(v)}</dd></Fragment>)}
        </dl>
      ) : null}
      {r.preferred_time ? <p className="small muted" style={{ marginTop: ".75rem" }}>{`Preferred time: ${r.preferred_time}`}</p> : null}
      {r.appointment ? <p className="small" style={{ marginTop: ".75rem" }}>{`Visit: ${when(r.appointment.start_at, timezone)} (${r.appointment.status})`}</p> : null}
    </article>
  );
}

function OverviewView({ me, onTab }) {
  const { data, error } = useLoad(() => Promise.all([api("/requests"), api("/appointments")]));
  if (error) return <Notice text={error.message} kind="error" />;
  if (!data) return <Loading />;
  const [requests, appointments] = data;
  const counts = me.counts;
  const tile = (n, label, tab) => (
    <button className="tile" type="button" onClick={() => onTab(tab)}>
      <span className="tile__n">{n}</span><span className="tile__label">{label}</span>
    </button>
  );
  const next = appointments.appointments.filter((a) => a.upcoming).sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  const latest = requests.requests[0];
  return (
    <>
      <h1>{me.customer && me.customer.name ? `Hello, ${firstName(me.customer.name)}` : "Hello"}</h1>
      <p className="muted">Here is everything we have for the number you called from.</p>
      <div className="tiles">
        {tile(counts.open_requests, "Open requests", "requests")}
        {tile(counts.upcoming_appointments, "Upcoming visits", "appointments")}
        {tile(counts.remembered_facts, "Things we remember", "memory")}
      </div>
      <div className="section-title">Next visit</div>
      {next ? <AppointmentCard a={next} me={me} /> : <div className="card empty">No visit is booked right now.</div>}
      <div className="section-title">Latest request</div>
      {latest ? <RequestCard r={latest} me={me} /> : <div className="card empty">You have no service requests yet.</div>}
    </>
  );
}

function RequestsView({ me }) {
  const { data, error } = useLoad(() => api("/requests"));
  if (error) return <Notice text={error.message} kind="error" />;
  if (!data) return <Loading />;
  const { requests } = data;
  return (
    <>
      <h1>Your service requests</h1>
      {requests.length
        ? <div>{requests.map((r, i) => <RequestCard key={i} r={r} me={me} />)}</div>
        : <div className="card empty">You have no service requests yet. Call us and the assistant will take your details.</div>}
    </>
  );
}

function AppointmentsView({ me }) {
  const { data, error } = useLoad(() => api("/appointments"));
  if (error) return <Notice text={error.message} kind="error" />;
  if (!data) return <Loading />;
  const { appointments } = data;
  const upcoming = appointments.filter((a) => a.upcoming).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const past = appointments.filter((a) => !a.upcoming);
  return (
    <>
      <h1>Your appointments</h1>
      <div className="section-title">Upcoming</div>
      {upcoming.length ? upcoming.map((a, i) => <AppointmentCard key={i} a={a} me={me} />) : <div className="card empty">No upcoming visits.</div>}
      {past.length ? [<div key="title" className="section-title">Past and cancelled</div>, past.map((a, i) => <AppointmentCard key={i} a={a} me={me} />)] : null}
    </>
  );
}

function MemoryView({ onForgotten }) {
  const { data, error } = useLoad(() => api("/memory"));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  if (error) return <Notice text={error.message} kind="error" />;
  if (!data) return <Loading />;
  const { facts } = data;

  async function forget() {
    if (!confirm("Forget everything the assistant remembers about you? This cannot be undone.")) return;
    setBusy(true);
    try { await api("/memory", { method: "DELETE" }); onForgotten(await api("/me")); }
    catch (err) { setBusy(false); setErrors((prev) => [err.message, ...prev]); }
  }

  return (
    <>
      {errors.map((message, i) => <Notice key={i} text={message} kind="error" />)}
      <h1>What we remember about you</h1>
      <p className="muted">These short notes come from your earlier calls, so you do not have to repeat yourself. You can erase them at any time.</p>
      {facts.length
        ? <div className="card"><ul className="plain">{facts.map((fact, i) => <li key={i}>{fact}</li>)}</ul></div>
        : <div className="card empty">Nothing is remembered about you.</div>}
      {facts.length ? <div style={{ marginTop: "1rem" }}><button className="btn btn--danger" type="button" disabled={busy} onClick={forget}>Forget everything</button></div> : null}
    </>
  );
}

function ProfileView({ me }) {
  const c = me.customer || {};
  const row = (label, value) => [<dt key="dt">{label}</dt>, <dd key="dd">{value || "Not on file"}</dd>];
  return (
    <>
      <h1>Your details</h1>
      <div className="card"><dl className="kv">{row("Name", c.name)}{row("Phone", me.phone)}{row("Email", c.email)}{row("Service address", c.address)}</dl></div>
      <p className="muted small" style={{ marginTop: ".75rem" }}>To change these, just tell the assistant on your next call.</p>
    </>
  );
}

function Panel({ tab, me, onTab, onForgotten }) {
  return (
    <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {tab === "overview" ? <OverviewView me={me} onTab={onTab} />
        : tab === "requests" ? <RequestsView me={me} />
        : tab === "appointments" ? <AppointmentsView me={me} />
        : tab === "memory" ? <MemoryView onForgotten={onForgotten} />
        : <ProfileView me={me} />}
    </div>
  );
}

function PortalApp() {
  // screen: "login" | "loading" | "error" | "app"
  const [screen, setScreen] = useState(session.token ? "loading" : "login");
  const [errorMessage, setErrorMessage] = useState("");
  const [me, setMe] = useState(null);
  // `n` changes on every show(), so a tab (or the same tab) is loaded afresh.
  const [view, setView] = useState({ tab: "overview", n: 0 });
  const tabRef = useRef("overview");

  function show(tab) {
    tabRef.current = tab;
    setView((prev) => ({ tab, n: prev.n + 1 }));
  }

  function showLogin() {
    setMe(null);
    setScreen("login");
  }

  function signOut() {
    session.token = null;
    showLogin();
  }

  async function start() {
    setScreen("loading");
    let result;
    try {
      result = await api("/me");
    } catch (error) {
      if (error.status !== 401) { setErrorMessage(error.message); setScreen("error"); }
      return;
    }
    setMe(result);
    setScreen("app");
    show(tabRef.current);
  }

  onSignedOut = signOut;

  useEffect(() => {
    if (session.token) start();
    return () => { onSignedOut = () => {}; };
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand"><span className="brand__mark" aria-hidden="true">&#9881;</span> My Service Portal</div>
          <div id="session" className="session" hidden={screen !== "app"}>
            <span id="sessionPhone" className="session__phone">{screen === "app" && me ? me.phone : ""}</span>
            <button id="signOut" className="btn btn--ghost" type="button" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </header>

      <main id="app" className="page" aria-live="polite">
        {screen === "login" ? <Login onVerified={(token) => { session.token = token; start(); }} />
          : screen === "loading" ? <p className="muted">Loading your details…</p>
          : screen === "error" ? <Notice text={errorMessage} kind="error" />
          : (
            <>
              <div className="tabs" role="tablist">
                {TABS.map(([id, label]) => (
                  <button key={id} className="tab" role="tab" id={`tab-${id}`} aria-selected={id === view.tab ? "true" : "false"} onClick={() => show(id)}>{label}</button>
                ))}
              </div>
              <Panel key={view.n} tab={view.tab} me={me} onTab={show}
                onForgotten={(newMe) => { setMe(newMe); show("memory"); }} />
            </>
          )}
      </main>
    </>
  );
}

createRoot(document.getElementById("root")).render(<PortalApp />);
