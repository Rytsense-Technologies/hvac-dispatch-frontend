// The console's sections: which hash each is at, what the menu calls it, its sidebar icon, which roles
// may open it, which sidebar group it falls under, and the lazy import that loads its code.
// Exactly matches the reference navigation structure:
// WORKSPACE: Overview, AI agents, Campaigns, Calls, Appointments, Admin automation, Tasks, Team & dispatch, Customers
// MANAGE: AI Coworker, Reports, Settings
import { lazy } from 'react';

export const SECTIONS = [
  // WORKSPACE
  { id: 'overview', label: 'Overview', icon: 'overview', view: lazy(() => import('../features/dashboard.jsx')) },
  { id: 'agents', label: 'AI agents', icon: 'agents', view: lazy(() => import('../features/agents.jsx')) },
  { id: 'campaigns', label: 'Campaigns', icon: 'campaigns', view: lazy(() => import('../features/campaigns.jsx')) },
  { id: 'calls', label: 'Calls', icon: 'calls', view: lazy(() => import('../features/calls.jsx')) },
  { id: 'appointments', label: 'Appointments', icon: 'appointments', view: lazy(() => import('../features/appointments.jsx')) },
  { id: 'automation', label: 'Admin automation', icon: 'automation', view: lazy(() => import('../features/automation.jsx')) },
  { id: 'tasks', label: 'Tasks', icon: 'tasks', view: lazy(() => import('../features/tasks.jsx')) },
  { id: 'team', label: 'Team & dispatch', icon: 'team', view: lazy(() => import('../features/team.jsx')) },
  { id: 'customers', label: 'Customers', icon: 'customers', view: lazy(() => import('../features/customers.jsx')) },

  // MANAGE
  { id: 'copilot', label: 'AI Coworker', icon: 'copilot', group: 'manage', view: lazy(() => import('../features/copilot.jsx')) },
  { id: 'reports', label: 'Reports', icon: 'reports', group: 'manage', view: lazy(() => import('../features/reports.jsx')) },
  { id: 'settings', label: 'Settings', icon: 'settings', group: 'manage', view: lazy(() => import('../features/settings.jsx')) },
];
