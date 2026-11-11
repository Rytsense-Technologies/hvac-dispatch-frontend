// Console sections + sidebar IA for the Rytsense reference shell (Phase 0).
// Hash routing stays location.hash (e.g. #/work, #/calls/numbers).
// WORKSPACE nav: Overview, AI agents, Campaigns, Calls, Work, Team & dispatch, Customers, Test
// MANAGE nav: AI Coworker, Reports, Settings
// Work → Tasks | Appointments (section tabs). Calls → history | phone numbers.
// Automation is reachable via #/automation (Settings deep-link), not top-level nav.
// Test restores the pre-design call.html voice + SMS text-chat flows inside the shell.
// Approvals (#/approvals) is a Work deep-link for live dispatch proposals from Coworker confirm.
import { lazy } from 'react';

export const SECTIONS = [
  // WORKSPACE
  { id: 'overview', label: 'Overview', icon: 'overview', view: lazy(() => import('../features/dashboard.jsx')) },
  { id: 'agents', label: 'AI agents', icon: 'agents', view: lazy(() => import('../features/agents.jsx')) },
  { id: 'campaigns', label: 'Campaigns', icon: 'campaigns', view: lazy(() => import('../features/campaigns.jsx')) },
  { id: 'calls', label: 'Calls', icon: 'calls', view: lazy(() => import('../features/calls.jsx')), sectionGroup: 'calls' },
  { id: 'numbers', label: 'Phone numbers', icon: 'calls', view: lazy(() => import('../features/numbers.jsx')), hideNav: true, sectionGroup: 'calls', crumbParent: 'Calls' },
  { id: 'tasks', label: 'Tasks', icon: 'work', view: lazy(() => import('../features/tasks.jsx')), hideNav: true, sectionGroup: 'work', crumbParent: 'Work' },
  { id: 'appointments', label: 'Appointments', icon: 'work', view: lazy(() => import('../features/appointments.jsx')), hideNav: true, sectionGroup: 'work', crumbParent: 'Work' },
  // Live dispatch proposals (opened from Coworker confirm / Attention / Plan). Hidden from nav per reference IA.
  { id: 'approvals', label: 'Approvals', icon: 'approvals', hideNav: true, crumbParent: 'Work', view: lazy(() => import('../features/approvals.jsx')) },
  { id: 'team', label: 'Team & dispatch', icon: 'team', view: lazy(() => import('../features/team.jsx')) },
  { id: 'users', label: 'Accounts & technicians', icon: 'team', view: lazy(() => import('../features/users.jsx')), hideNav: true, crumbParent: 'Team & dispatch' },
  { id: 'customers', label: 'Customers', icon: 'customers', view: lazy(() => import('../features/customers.jsx')) },
  { id: 'test', label: 'Test', icon: 'test', view: lazy(() => import('../features/test.jsx')) },

  // MANAGE
  { id: 'copilot', label: 'AI Coworker', icon: 'copilot', group: 'manage', view: lazy(() => import('../features/copilot.jsx')) },
  { id: 'reports', label: 'Reports', icon: 'reports', group: 'manage', view: lazy(() => import('../features/reports.jsx')) },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'manage', view: lazy(() => import('../features/settings.jsx')) },
  { id: 'automation', label: 'Admin automation', icon: 'automation', group: 'manage', hideNav: true, crumbParent: 'Settings', view: lazy(() => import('../features/automation.jsx')) },
  { id: 'usage', label: 'Usage & Billing', icon: 'settings', group: 'manage', hideNav: true, crumbParent: 'Settings', view: lazy(() => import('../features/usage.jsx')) },
];

/** Sidebar entries (order + href). `match` lists section ids that keep this item active. */
export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'overview', href: '#/overview', match: ['overview'] },
  { id: 'agents', label: 'AI agents', icon: 'agents', href: '#/agents', match: ['agents'] },
  { id: 'campaigns', label: 'Campaigns', icon: 'campaigns', href: '#/campaigns', match: ['campaigns'] },
  { id: 'calls', label: 'Calls', icon: 'calls', href: '#/calls', match: ['calls', 'numbers'] },
  { id: 'work', label: 'Work', icon: 'work', href: '#/work', match: ['tasks', 'appointments', 'approvals'] },
  { id: 'team', label: 'Team & dispatch', icon: 'team', href: '#/team', match: ['team', 'users'] },
  { id: 'customers', label: 'Customers', icon: 'customers', href: '#/customers', match: ['customers'] },
  { id: 'test', label: 'Test', icon: 'test', href: '#/test', match: ['test'] },
  { id: 'copilot', label: 'AI Coworker', icon: 'copilot', href: '#/copilot', group: 'manage', match: ['copilot'] },
  { id: 'reports', label: 'Reports', icon: 'reports', href: '#/reports', group: 'manage', match: ['reports'] },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '#/settings', group: 'manage', match: ['settings', 'automation', 'usage'] },
];

export const SECTION_TABS = {
  work: [
    { id: 'tasks', label: 'Tasks', href: '#/work' },
    { id: 'appointments', label: 'Appointments', href: '#/work/appointments' },
  ],
  calls: [
    { id: 'calls', label: 'Call history', href: '#/calls' },
    { id: 'numbers', label: 'Phone numbers', href: '#/calls/numbers' },
  ],
};

export const MOBILE_PRIMARY = [
  { id: 'overview', label: 'Home', icon: 'overview', href: '#/overview', match: ['overview'] },
  { id: 'work', label: 'Work', icon: 'work', href: '#/work', match: ['tasks', 'appointments', 'approvals'] },
  { id: 'calls', label: 'Calls', icon: 'calls', href: '#/calls', match: ['calls', 'numbers'] },
  { id: 'team', label: 'Team', icon: 'team', href: '#/team', match: ['team', 'users'] },
];

export const MOBILE_MORE = [
  { id: 'agents', label: 'AI agents', href: '#/agents' },
  { id: 'campaigns', label: 'Campaigns', href: '#/campaigns' },
  { id: 'customers', label: 'Customers', href: '#/customers' },
  { id: 'test', label: 'Test', href: '#/test' },
  { id: 'copilot', label: 'AI Coworker', href: '#/copilot' },
  { id: 'reports', label: 'Reports', href: '#/reports' },
  { id: 'settings', label: 'Settings', href: '#/settings' },
];

const HASH_ALIASES = {
  '': 'overview',
  dashboard: 'overview',
  work: 'tasks',
  'work/tasks': 'tasks',
  'work/appointments': 'appointments',
  'calls/history': 'calls',
  'calls/numbers': 'numbers',
  'team/users': 'users',
  users: 'users',
};

/** Resolve location.hash to a SECTIONS id. */
export function sectionIdFromHash(hash = typeof location !== 'undefined' ? location.hash : '') {
  const raw = (String(hash).replace(/^#\/?/, '') || '').split('?')[0];
  const path = raw.replace(/^\/+|\/+$/g, '');
  if (HASH_ALIASES[path] !== undefined) return HASH_ALIASES[path];
  const first = path.split('/')[0];
  return first || 'overview';
}

export function findSection(id) {
  return SECTIONS.find((s) => s.id === id) || SECTIONS[0];
}
