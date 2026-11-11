// The staff console's shell: sign in (email + password), register the first admin, forgot password,
// the menu (by role) and moving between sections. The server answers sign-in with an HttpOnly cookie
// this script cannot read, plus a CSRF token kept in memory. See FRONTEND_LOGIN.md for the full flow.
// The sections themselves (what they are, which role may open them) live in ./routes.js.
import { Component, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { api, setCsrf, onSessionExpired } from '../lib/api.js';
import { setZone } from '../lib/format.js';
import { session, can, SECTION_ROLES } from '../lib/session.js';
import { Badge, Icon, SectionTabs, Toasts } from '../components/index.js';
import {
  MOBILE_MORE,
  MOBILE_PRIMARY,
  NAV_ITEMS,
  SECTION_TABS,
  findSection,
  sectionIdFromHash,
} from './routes.js';

const allowedIn = (section) => !SECTION_ROLES[section.id] || can(...SECTION_ROLES[section.id]);

function currentSection() {
  return findSection(sectionIdFromHash(location.hash));
}

function crumbFor(section) {
  const root = section.group === 'manage' ? 'Manage' : 'Workspace';
  // Reference crumb: "Workspace / Work / Tasks" (or Appointments).
  if (section.sectionGroup === 'work') return { root, strong: `Work / ${section.label}` };
  if (section.sectionGroup === 'calls') return { root, strong: 'Calls' };
  if (section.id === 'automation') return { root, strong: 'Settings / Admin automation' };
  return { root, strong: section.label };
}

function navIsActive(item, sectionId) {
  return (item.match || [item.id]).includes(sectionId);
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

// On plain http at an address that is not this computer the server does not mark the sign-in cookie Secure (a browser would drop it), so signing in works, but nothing is encrypted:
// say so on the sign-in page. (https and localhost are secure contexts: no notice.)
const INSECURE_ADDRESS = typeof window !== 'undefined' && window.isSecureContext === false;

function LoginForm({ message, setupOpen, signupOpen, onSignedIn, onRegister, onSignup, onForgot }) {
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
    <form id="loginForm" className="card login__box" onSubmit={submit}>
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
      {INSECURE_ADDRESS ? <p id="insecureNote" className="note" role="note">This page is not encrypted (plain http). That is fine for testing, but anyone on the network can read what you type: use an <strong>https</strong> address for real use.</p> : null}
      <p id="loginMessage" className="note-line" role="alert">{text}{techLink ? <> <a href="/tech">Open the technician page</a>.</> : null}</p>
      <button className="btn btn--primary" type="submit" disabled={busy}>Sign in</button>
      <p className="muted small row between">
        <a href="#" onClick={(e) => { e.preventDefault(); onForgot(); }}>Forgot your password?</a>
        {setupOpen ? <a href="#" onClick={(e) => { e.preventDefault(); onRegister(); }}>Register the first admin</a> : null}
      </p>
      {signupOpen ? <p className="muted small">New company? <a href="#" onClick={(e) => { e.preventDefault(); onSignup(); }}>Create your company</a></p> : null}
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
    if (f.password.length < 8 || f.password.length > 128) { setText('The password must be 8 to 128 characters.'); return; }
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
      <div className="field"><label htmlFor="regPassword">Password</label><input id="regPassword" type="password" autoComplete="new-password" required maxLength={128} {...bind('password')} /><small className="muted">8 to 128 characters, not all digits, and not a common password.</small></div>
      <div className="field"><label htmlFor="regConfirm">Password again</label><input id="regConfirm" type="password" autoComplete="new-password" required maxLength={128} {...bind('confirm')} /></div>
      {codeRequired ? <div className="field"><label htmlFor="regCode">Setup code</label><input id="regCode" type="text" required maxLength={200} {...bind('setup_code')} /></div> : null}
      <p className="note-line" role="alert">{text}</p>
      <button className="btn btn--primary" type="submit" disabled={busy}>Register and sign in</button>
      <p className="muted small"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Back to sign in</a></p>
    </form>
  );
}

// A company signs itself up: its name, and the first admin. Nothing is created until the emailed link is opened (the server says so, and so does this screen).
function SignupForm({ onBack }) {
  const [f, setF] = useState({ company: '', name: '', email: '', password: '', confirm: '' });
  const [text, setText] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });

  const submit = async (event) => {
    event.preventDefault();
    setText('');
    if (f.password.length < 8 || f.password.length > 128) { setText('The password must be 8 to 128 characters.'); return; }
    if (f.password !== f.confirm) { setText('The passwords do not match.'); return; }
    setBusy(true);
    try {
      const data = await api('/v1/auth/signup', { method: 'POST', body: { company_name: f.company.trim(), name: f.name.trim(), email: f.email.trim(), password: f.password } });
      setF({ company: '', name: '', email: '', password: '', confirm: '' });
      setDone(data.message || 'Check your email. We sent a link to confirm your company.');
    } catch (error) {
      setF({ ...f, password: '', confirm: '' }); // never leave a password in the field after a failure
      setText(error.message);
    } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="card login__box">
        <h1>Check your email</h1>
        <p role="status">{done}</p>
        <p className="muted small"><a href="#" onClick={(e) => { e.preventDefault(); onBack(); }}>Back to sign in</a></p>
      </div>
    );
  }
  return (
    <form className="card login__box" autoComplete="off" onSubmit={submit}>
      <h1>Create your company</h1>
      <p className="muted">Your company gets its own private space: its people and its data are never shown to any other company. We email you a link to confirm; nothing is created until you open it.</p>
      <div className="field"><label htmlFor="suCompany">Company name</label><input id="suCompany" type="text" autoComplete="organization" required maxLength={120} {...bind('company')} /></div>
      <div className="field"><label htmlFor="suName">Your name</label><input id="suName" type="text" autoComplete="name" required maxLength={160} {...bind('name')} /></div>
      <div className="field"><label htmlFor="suEmail">Your email (this is your username)</label><input id="suEmail" type="email" autoComplete="username" required maxLength={255} {...bind('email')} /></div>
      <div className="field"><label htmlFor="suPassword">Password</label><input id="suPassword" type="password" autoComplete="new-password" required maxLength={128} {...bind('password')} /><small className="muted">8 to 128 characters, not all digits, and not a common password.</small></div>
      <div className="field"><label htmlFor="suConfirm">Password again</label><input id="suConfirm" type="password" autoComplete="new-password" required maxLength={128} {...bind('confirm')} /></div>
      <p className="note-line" role="alert">{text}</p>
      <button className="btn btn--primary" type="submit" disabled={busy}>Create my company</button>
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
  const [signupOpen, setSignupOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api('/v1/auth/setup-status').then((data) => { if (live) setSetup(data); }).catch(() => { if (live) setSetup({ open: false, code_required: false }); });
    return () => { live = false; };
  }, []);

  // Offer "Create your company" only while the server says sign-up is open (switched on, email works, today's limit not used up).
  useEffect(() => {
    let live = true;
    api('/v1/auth/signup-status').then((data) => { if (live) setSignupOpen(!!data.open); }).catch(() => { if (live) setSignupOpen(false); });
    return () => { live = false; };
  }, []);

  return (
    <main id="login" className="login">
      {view === 'login' && <LoginForm message={message} setupOpen={!!setup?.open} signupOpen={signupOpen} onSignedIn={onSignedIn} onRegister={() => setView('register')} onSignup={() => setView('signup')} onForgot={() => setView('forgot')} />}
      {view === 'signup' && <SignupForm onBack={() => setView('login')} />}
      {view === 'register' && <RegisterForm codeRequired={!!setup?.code_required} onRegistered={onSignedIn} onBack={() => setView('login')} />}
      {view === 'forgot' && <ForgotForm onBack={() => setView('login')} />}
    </main>
  );
}

// ---------- the signed-in shell ----------

function getInitials(name) {
  if (!name) return 'JM';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function Shell({ timezone, onSignOut }) {
  const [hash, setHash] = useState(location.hash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef(null);
  const moreRef = useRef(null);
  const page = useRef(null);
  useEffect(() => {
    const onHash = () => {
      setHash(location.hash);
      setMoreOpen(false);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!menuOpen && !moreOpen) return;
    const onDocClick = (e) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [menuOpen, moreOpen]);

  const section = currentSection();
  const allowed = allowedIn(section);
  const View = section.view;
  const crumb = crumbFor(section);
  const sectionTabs = section.sectionGroup ? SECTION_TABS[section.sectionGroup] : null;

  useEffect(() => { page.current?.focus({ preventScroll: true }); }, [hash]);

  const displayName = session.user?.name || session.actor || 'James M.';
  const initials = getInitials(displayName);
  const workspaceNav = NAV_ITEMS.filter((item) => item.group !== 'manage');
  const manageNav = NAV_ITEMS.filter((item) => item.group === 'manage');
  const moreActive = MOBILE_MORE.some((item) => item.id === section.id || (item.id === 'settings' && section.id === 'automation'));

  const navLink = (item) => {
    const on = navIsActive(item, section.id);
    return (
      <a key={item.id} href={item.href} className={`menu-item ${on ? 'menu-item--on' : ''}`} aria-current={on ? 'page' : undefined}>
        <span className="menu-item__icon" aria-hidden="true"><Icon name={item.icon} /></span>
        <span>{item.label}</span>
      </a>
    );
  };

  return (
    <div id="shell" className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand__glyph" aria-hidden="true">◈</span><span className="brand__name">rytsense</span></div>
        <nav id="menu" className="menu" aria-label="Sections">
          <div className="menu-group-label">WORKSPACE</div>
          {workspaceNav.map(navLink)}
          {manageNav.length ? <div className="menu-group-label">MANAGE</div> : null}
          {manageNav.map(navLink)}
        </nav>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="topbar__crumb"><span>{crumb.root}</span><span aria-hidden="true">/</span><strong>{crumb.strong}</strong></div>
          <div className="topbar__right">
            <a href="#/agents" className="topbar__status-pill" title="AI agents">
              <span className="topbar__status-dot" aria-hidden="true" />
              <span>AI team active</span>
            </a>
            <a href="#/team" className="topbar__icon-btn" title="Notifications" aria-label="Notifications">
              <Icon name="attention" />
            </a>
            <div className="identity-wrap" ref={menuRef}>
              <button
                type="button"
                className={`identity ${menuOpen ? 'identity--open' : ''}`}
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="true"
                data-testid="identity"
              >
                <span className="identity__avatar" aria-hidden="true">{initials}</span>
                <span className="identity__name">
                  {displayName}
                  <svg className="identity__chevron" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2.5 4.5l3.5 3.5 3.5-3.5" />
                  </svg>
                </span>
              </button>
              {menuOpen && (
                <div className="identity__menu" role="menu">
                  <div className="identity__menu-header">
                    <strong>{displayName}</strong>
                    <Badge text={session.role || 'admin'} tone="info" />
                    <small className="block muted">{`${session.actor || ''} · ${timezone || ''}`}</small>
                  </div>
                  <a href="#/settings" className="identity__menu-item" role="menuitem" onClick={() => setMenuOpen(false)}>
                    <Icon name="settings" />
                    <span>Settings</span>
                  </a>
                  <button type="button" className="identity__menu-item identity__menu-item--danger" role="menuitem" onClick={() => { setMenuOpen(false); onSignOut(); }}>
                    <Icon name="signOut" />
                    <span>Sign out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="page" className="page" tabIndex={-1} ref={page}>
          {/* Work owns section tabs inside the page (after PageHeader) for reference order. */}
          {sectionTabs && section.sectionGroup !== 'work' ? (
            <SectionTabs
              options={sectionTabs.map((tab) => [tab.id, tab.label, tab.href])}
              value={section.id}
            />
          ) : null}
          {allowed ? (
            <SectionBoundary key={`${section.id}${hash}`}>
              <Suspense fallback={null}><View /></Suspense>
            </SectionBoundary>
          ) : (
            <div className="panel"><h1>Not available for your role</h1><p className="muted">Ask an administrator if you need this section.</p></div>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Primary">
        {MOBILE_PRIMARY.map((item) => {
          const on = navIsActive(item, section.id);
          return (
            <a key={item.id} href={item.href} className={`mobile-nav__item ${on ? 'mobile-nav__item--on' : ''}`} aria-current={on ? 'page' : undefined}>
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </a>
          );
        })}
        <div className="mobile-nav__more" ref={moreRef}>
          <button
            type="button"
            className={`mobile-nav__item ${moreActive || moreOpen ? 'mobile-nav__item--on' : ''}`}
            aria-expanded={moreOpen}
            aria-haspopup="true"
            onClick={() => setMoreOpen((o) => !o)}
          >
            <Icon name="more" />
            <span>More</span>
          </button>
          {moreOpen ? (
            <div className="mobile-more" role="menu">
              {MOBILE_MORE.map((item) => (
                <a key={item.id} href={item.href} className="mobile-more__item" role="menuitem" onClick={() => setMoreOpen(false)}>{item.label}</a>
              ))}
            </div>
          ) : null}
        </div>
      </nav>
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
