// The staff console's shell: sign-in, the menu (by role) and moving between sections.
// Sign-in sends the staff key once; the server answers with an HttpOnly cookie this script cannot read, plus a CSRF token kept in memory.
// The sections themselves (what they are, which role may open them) live in ./routes.js.
import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, setCsrf, onSessionExpired } from '../lib/api.js';
import { setZone } from '../lib/format.js';
import { session, can, SECTION_ROLES } from '../lib/session.js';
import { Badge, Icon, Toasts } from '../components/index.js';
import { SECTIONS } from './routes.js';

const allowedIn = (section) => !SECTION_ROLES[section.id] || can(...SECTION_ROLES[section.id]);

function currentSection() {
  const id = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  return SECTIONS.find((s) => s.id === id) || SECTIONS[0];
}

// A section whose code could not be loaded (or that crashed) shows the same message the original console did.
class SectionBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <p className="note note--bad" role="alert">{`This section could not be loaded: ${this.state.error.message}`}</p>;
    return this.props.children;
  }
}

function Login({ message, onSignedIn }) {
  const [key, setKey] = useState('');
  const [text, setText] = useState(message || '');
  const [busy, setBusy] = useState(false);
  const field = useRef(null);

  useEffect(() => { setText(message || ''); field.current?.focus(); }, [message]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setText('');
    try {
      const data = await api('/v1/copilot/session', { method: 'POST', headers: { 'X-API-Key': key }, body: {} });
      setKey('');
      if (!data.csrf_token) throw new Error('The server did not start a session.');
      onSignedIn(data);
    } catch (error) {
      setKey(''); // never leave a key in the field after a failure
      setText(error.status === 401 ? 'That key was not accepted.' : error.message);
    } finally { setBusy(false); }
  };

  return (
    <main id="login" className="login">
      <form id="loginForm" className="card login__box" autoComplete="off" onSubmit={submit}>
        <h1>HVAC Dispatch</h1>
        <p className="muted">Sign in with your staff key. Your role decides what you can do.</p>
        <div className="field">
          <label htmlFor="credential">Staff key</label>
          <input id="credential" ref={field} type="password" autoComplete="off" required value={key} onChange={(e) => setKey(e.target.value)} />
        </div>
        <p id="loginMessage" className="note-line" role="alert">{text}</p>
        <button className="btn btn--primary" type="submit" disabled={busy}>Sign in</button>
        <p className="muted small">Test the phone assistant: <a href="call.html">test call page</a></p>
      </form>
    </main>
  );
}

function Shell({ timezone, onSignOut }) {
  const [hash, setHash] = useState(location.hash);
  const page = useRef(null);
  useEffect(() => {
    const onHash = () => setHash(location.hash);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const section = currentSection();
  const allowed = allowedIn(section);
  const View = section.view;

  useEffect(() => { page.current?.focus({ preventScroll: true }); }, [hash]);

  return (
    <div id="shell" className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand__mark" aria-hidden="true">HD</span> HVAC Dispatch</div>
        <nav id="menu" className="menu" aria-label="Sections">
          {SECTIONS.filter(allowedIn).map((s) => (
            <a key={s.id} href={`#/${s.id}`} className={`menu-item ${s.id === section.id ? 'menu-item--on' : ''}`} aria-current={s.id === section.id ? 'page' : undefined}>
              <Icon name={s.icon} /><span>{s.label}</span>
            </a>
          ))}
        </nav>
        <div className="sidebar__foot">
          <a className="menu-item" href="call.html"><Icon name="phone" /><span>Test call</span></a>
          <div id="who" className="who" data-testid="identity">
            <span className="who__avatar" aria-hidden="true">{(session.actor || '?').slice(0, 1).toUpperCase()}</span>
            <span className="who__body">
              <strong>{session.actor}</strong> <Badge text={session.role} tone="info" />
              <small className="block muted">{`${session.tenant} · ${timezone}`}</small>
            </span>
          </div>
          <button id="signout" className="btn btn--outline btn--block" type="button" onClick={onSignOut}><Icon name="signOut" /><span>Sign out</span></button>
        </div>
      </aside>
      <main id="page" className="page" tabIndex={-1} ref={page}>
        {allowed ? (
          <SectionBoundary key={`${section.id}${hash}`}>
            <Suspense fallback={null}><View /></Suspense>
          </SectionBoundary>
        ) : (
          <div className="card"><h1>Not available for your role</h1><p className="muted">Ask an administrator if you need this section.</p></div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  // 'checking' until the first session lookup answers; then 'in' or 'out'.
  const [state, setState] = useState({ phase: 'checking', message: '', timezone: '' });

  const leave = useCallback((message) => {
    session.role = session.actor = session.tenant = null;
    setCsrf(null);
    setState({ phase: 'out', message: message || '', timezone: '' });
  }, []);

  const enter = useCallback((data) => {
    session.role = data.identity.role;
    session.actor = data.identity.actor_id;
    session.tenant = data.identity.tenant_id;
    setCsrf(data.csrf_token);
    setZone(data.timezone);
    setState({ phase: 'in', message: '', timezone: data.timezone });
  }, []);

  useEffect(() => {
    // A 401 anywhere else means the session ended (timed out, or the key was removed).
    let expiredShown = false;
    onSessionExpired(() => {
      if (!session.role || expiredShown) return;
      expiredShown = true;
      leave('Your session ended. Sign in again.');
      setTimeout(() => { expiredShown = false; }, 1000);
    });
    // A refresh keeps the server-side session: ask once whether there is one.
    api('/v1/copilot/session').then((data) => { if (data.csrf_token) enter(data); else leave(''); }).catch(() => leave(''));
  }, [enter, leave]);

  const signOut = async () => {
    try { await api('/v1/copilot/session', { method: 'DELETE' }); } catch { /* signing out locally is enough */ }
    leave('You are signed out.');
  };

  return (
    <>
      {state.phase === 'out' && <Login message={state.message} onSignedIn={enter} />}
      {state.phase === 'in' && <Shell timezone={state.timezone} onSignOut={signOut} />}
      <Toasts />
    </>
  );
}
