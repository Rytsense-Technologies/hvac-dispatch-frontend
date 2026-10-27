// Who is signed in. Set by main.js after sign-in; the screens read it to decide what to offer.
export const session = { role: null, actor: null, tenant: null };

// Does the signed-in person have one of these roles? (The server decides for real; this only hides what it would refuse.)
export const can = (...roles) => roles.includes(session.role);

// Roles that may open each section. A viewer can look at the rest.
export const SECTION_ROLES = { approvals: ['approver', 'admin'], plan: ['dispatcher', 'admin'], leads: ['dispatcher', 'approver', 'admin'], memory: ['dispatcher', 'approver', 'admin'], usage: ['admin'] };
