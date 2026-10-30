// Who is signed in. Set by App.jsx after sign-in; the screens read it to decide what to offer.
// `user` is the fuller profile (name, email, phone, status...) the login/me/register calls return -
// role/actor/tenant stay the three fields every screen already keyed off before the email+password login existed.
export const session = { role: null, actor: null, tenant: null, user: null };

// Does the signed-in person have one of these roles? (The server decides for real; this only hides what it would refuse.)
export const can = (...roles) => roles.includes(session.role);

// Roles that may open each section. A viewer can look at the rest. (The console now only ever signs in
// people with role "admin" - see FRONTEND_LOGIN.md - so these no longer narrow anything in practice; they're
// left in place in case the backend starts sending finer-grained roles again.)
export const SECTION_ROLES = { approvals: ['approver', 'admin'], plan: ['dispatcher', 'admin'], leads: ['dispatcher', 'approver', 'admin'], memory: ['dispatcher', 'approver', 'admin'], usage: ['admin'] };
