// The console's sections: which hash each is at, what the menu calls it, its sidebar icon, which roles
// may open it, which sidebar group it falls under, and the lazy import that loads its code. Kept
// separate from App.jsx so the shell (sign-in, menu, routing) doesn't have to change every time a
// section is added, renamed or re-ordered. A section with no `group` sits in the main "Workspace" list.
import { lazy } from 'react';

export const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', view: lazy(() => import('../features/dashboard.jsx')) },
  { id: 'requests', label: 'Requests', icon: 'requests', view: lazy(() => import('../features/requests.jsx')) },
  { id: 'jobs', label: 'Jobs', icon: 'jobs', view: lazy(() => import('../features/jobs.jsx')) },
  { id: 'tracking', label: 'Tracking', icon: 'tracking', view: lazy(() => import('../features/tracking.jsx')) },
  // Quotes and invoices for a company's own customers: off, and not what this product bills for. Put the line back (and set BILLING_ENABLED=true) to use it.
  // { id: 'billing', label: 'Billing', icon: 'usage', view: lazy(() => import('../features/billing.jsx')) },
  { id: 'leads', label: 'Leads', icon: 'leads', view: lazy(() => import('../features/leads.jsx')) },
  { id: 'memory', label: 'Memory', icon: 'memory', view: lazy(() => import('../features/memory.jsx')) },
  { id: 'approvals', label: 'Approvals', icon: 'approvals', view: lazy(() => import('../features/approvals.jsx')) },
  { id: 'attention', label: 'Needs attention', icon: 'attention', view: lazy(() => import('../features/attention.jsx')) },
  { id: 'plan', label: 'Nightly plan', icon: 'plan', view: lazy(() => import('../features/plan.jsx')) },
  { id: 'usage', label: 'Usage and bill', icon: 'usage', group: 'manage', view: lazy(() => import('../features/usage.jsx')) },
  { id: 'users', label: 'Users', icon: 'users', group: 'manage', view: lazy(() => import('../features/users.jsx')) },
  { id: 'numbers', label: 'Phone number', icon: 'phone', group: 'manage', view: lazy(() => import('../features/numbers.jsx')) },
  { id: 'reports', label: 'Reports', icon: 'reports', group: 'manage', view: lazy(() => import('../features/reports.jsx')) },
  { id: 'copilot', label: 'Co-pilot', icon: 'copilot', group: 'manage', view: lazy(() => import('../features/copilot.jsx')) },
];
