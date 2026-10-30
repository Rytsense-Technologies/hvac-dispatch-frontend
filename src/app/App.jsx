// The staff console's shell: sign in (email + password), register the first admin, forgot password,
// the menu (by role) and moving between sections. The server answers sign-in with an HttpOnly cookie
// this script cannot read, plus a CSRF token kept in memory. See FRONTEND_LOGIN.md for the full flow.
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

// ---------- sign in ----------

function LoginForm({ message, setupOpen, onSignedIn, onRegister, onForgot }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [text, setText] = useState(message || '');
  const [techLink, setTechLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const field = useRef(null);

  useEffect(() => { setText(message || ''); field.current?.focus(); }, [message]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setText('');
    setTechLink(false);
    try {
      const data = await api('/v1/auth/login', { method: 'POST', body: { email: email.trim(), password } });
      if (data.identity?.role !== 'admin') {
        // This console is for admins only; a technician's own sign-in is the phone page, not here.
        try { await api('/v1/auth/session', { method: 'DELETE' }); } catch { /* best effort */ }
        setPassword('');
        setText('That sign-in is for a technician.');
        setTechLink(true);
        return;
      }
      setPassword('');
      onSignedIn(data);
    } catch (error) {
      setPassword(''); // never leave a password in the field after a failure
      setText(error.message);
    } finally { setBusy(false); }
  };

  return (
    <form id="loginForm" className="card login__box" autoComplete="off" onSubmit={submit}>
      <h1>HVAC Dispatch</h1>
      <p className="muted">Sign in with your email and password.</p>
      <div className="field">
        <label htmlFor="loginEmail">Email</label>
        <input id="loginEmail" ref={field} type="email" autoComplete="username" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="loginPassword">Password</label>
        <input id="loginPassword" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <p id="loginMessage" className="note-line" role="alert">{text}{techLink ? <> <a href="/tech">Open the technician page</a>.</> : null}</p>
      <button className="btn btn--primary" type="submit" disabled={busy}>Sign in</button>
      <p className="muted small row between">
        <a href="#" onClick={(e) => { e.preventDefault(); onForgot(); }}>Forgot your password?</a>
        {setupOpen ? <a href="#" onClick={(e) => { e.preventDefault(); onRegister(); }}>Register the first admin</a> : null}
      </p>
      <p className="muted small">Test the phone assistant: <a href="call.html">test call page</a></p>
    </form>
  );
}

// 12-128 characters is the one rule a form can check without the server; the rest (not all digits, five
// distinct characters, not a common password, not containing the email) is enforced server-side and its
// message is shown as-is.
function RegisterForm({ codeRequired, onRegistered, onBack }) {
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', setup_code: '' });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });

  const submit = async (event) => {
    event.preventDefault();
    setText('');
    if (f.password.length < 12 || f.password.length > 128) { setText('The password must be 12 to 128 characters.'); return; }
    if (f.password !== f.confirm) { setText('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const body = { name: f.name.trim(), email: f.email.trim(), password: f.password };
      if (codeRequired) body.setup_code = f.setup_code.trim();
      const data = await api('/v1/auth/register', { method: 'POST', body });
      onRegistered(data);
    } catch (error) {
      setText(error.message);
    } finally { setBusy(false); }
  };

  return (
    <form className="card login__box" autoComplete="off" onSubmit={submit}>
      <h1>Register the first admin</h1>
      <p className="muted">This sets up the console. It only works once - as soon as an admin exists, this page closes for good.</p>
      <div className="field"><label htmlFor="regName">Name</label><input id="regName" type="text" required maxLength={160} {...bind('name')} /></div>
      <div className="field"><label htmlFor="regEmail">Email</label><input id="regEmail" type="email" autoComplete="username" required maxLength={255} {...bind('email')} /></div>
      <div className="field"><label htmlFor="regPassword">Password</label><input id="regPassword" type="password" autoComplete="new-password" required maxLength={128} {...bind('password')} /><small className="muted">12 to 128 characters, not all digits, and not a common password.</small></div>
      <div className="field"><label htmlFor="regConfirm">Password again</label><input id="regConfirm" type="password" autoComplete="new-password" required maxLength={128} {...bind('confirm')} /></div>
      {codeRequired ? <div className="field"><label htmlFor="regCode">Setup code</label><input id="regCode" type="text" required maxLength={200} {...bind('setup_code')} /></div> : null}
      <p className="note-line" role="alert">{text}</p>
      <button className="btn btn--primary" type="submit" disabled={busy}>Register and sign in</button>
      <p className="muted small"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Back to sign in</a></p>
    </form>
  );
}

function ForgotForm({ onBack }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setText('');
    try {
      await api('/v1/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setSent(true); // always the same message - the server never says whether the address exists
    } catch (error) {
      setText(error.message);
    } finally { setBusy(false); }
  };

  return (
    <form className="card login__box" autoComplete="off" onSubmit={submit}>
      <h1>Forgot your password?</h1>
      {sent ? (
        <p>If that email has an account, a reset link is on its way. It works once, for 24 hours.</p>
      ) : (
        <>
          <p className="muted">Enter the email you sign in with.</p>
          <div className="field"><label htmlFor="forgotEmail">Email</label><input id="forgotEmail" type="email" autoComplete="username" required maxLength={255} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <p className="note-line" role="alert">{text}</p>
          <button className="btn btn--primary" type="submit" disabled={busy}>Send the link</button>
        </>
      )}
      <p className="muted small"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Back to sign in</a></p>
    </form>
  );
}

// Decides which of the three forms to show, and whether "Register the first admin" is offered at all.
function AuthScreen({ message, onSignedIn }) {
  const [view, setView] = useState('login');
  const [setup, setSetup] = useState(null);

  useEffect(() => {
    let live = true;
    api('/v1/auth/setup-status').then((data) => { if (live) setSetup(data); }).catch(() => { if (live) setSetup({ open: false, code_required: false }); });
    return () => { live = false; };
  }, []);

  return (
    <main id="login" className="login">
      {view === 'login' && <LoginForm message={message} setupOpen={!!setup?.open} onSignedIn={onSignedIn} onRegister={() => setView('register')} onForgot={() => setView('forgot')} />}
      {view === 'register' && <RegisterForm codeRequired={!!setup?.code_required} onRegistered={onSignedIn} onBack={() => setView('login')} />}
      {view === 'forgot' && <ForgotForm onBack={() => setView('login')} />}
    </main>
  );
}

// ---------- the signed-in shell ----------

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

  const displayName = session.user?.name || session.actor;

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
            <span className="who__avatar" aria-hidden="true">{(displayName || '?').slice(0, 1).toUpperCase()}</span>
            <span className="who__body">
              <strong>{displayName}</strong> <Badge text={session.role} tone="info" />
              <small className="block muted">{`${session.actor} · ${timezone}`}</small>
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
    session.role = session.actor = session.tenant = session.user = null;
    setCsrf(null);
    setState({ phase: 'out', message: message || '', timezone: '' });
  }, []);

  const enter = useCallback((data) => {
    session.role = data.identity.role;
    session.actor = data.identity.actor_id;
    session.tenant = data.identity.tenant_id;
    session.user = data.user || null;
    setCsrf(data.csrf_token);
    setZone(data.timezone);
    setState({ phase: 'in', message: '', timezone: data.timezone });
  }, []);

  useEffect(() => {
    // A 401 anywhere else means the session ended (timed out, disabled, or the password was reset elsewhere).
    let expiredShown = false;
    onSessionExpired(() => {
      if (!session.role || expiredShown) return;
      expiredShown = true;
      leave('Your session ended. Sign in again.');
      setTimeout(() => { expiredShown = false; }, 1000);
    });
    // A refresh keeps the server-side session: ask once whether there is one. (/v1/auth/me only ever
    // answers for an admin session - a technician's session cannot use this console at all.)
    api('/v1/auth/me').then(enter).catch(() => leave(''));
  }, [enter, leave]);

  const signOut = async () => {
    try { await api('/v1/auth/session', { method: 'DELETE' }); } catch { /* signing out locally is enough */ }
    leave('You are signed out.');
  };

  return (
    <>
      {state.phase === 'out' && <AuthScreen message={state.message} onSignedIn={enter} />}
      {state.phase === 'in' && <Shell timezone={state.timezone} onSignOut={signOut} />}
      <Toasts />
    </>
  );
}
