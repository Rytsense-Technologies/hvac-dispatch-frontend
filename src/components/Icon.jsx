// A small, consistent set of line icons for the sidebar - plain SVG, no icon-font or library, so a
// section's icon is just a name. Every icon shares the same 20x20 grid and stroke weight.
const PATHS = {
  // WORKSPACE: Overview (grid table)
  overview: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" />
      <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" />
      <line x1="12.5" y1="3.5" x2="12.5" y2="16.5" />
    </>
  ),
  dashboard: (
    <>
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
      <line x1="2.5" y1="10" x2="17.5" y2="10" />
      <line x1="7.5" y1="3.5" x2="7.5" y2="16.5" />
      <line x1="12.5" y1="3.5" x2="12.5" y2="16.5" />
    </>
  ),
  // WORKSPACE: AI agents (sparkle star)
  agents: (
    <path d="M10 2.5C10 6.6 13.4 10 17.5 10C13.4 10 10 13.4 10 17.5C10 13.4 6.6 10 2.5 10C6.6 10 10 6.6 10 2.5Z" />
  ),
  // WORKSPACE: Campaigns (diagonal arrow northeast)
  campaigns: (
    <>
      <line x1="5.5" y1="14.5" x2="14.5" y2="5.5" />
      <polyline points="8.5,5.5 14.5,5.5 14.5,11.5" />
    </>
  ),
  // WORKSPACE: Calls (concentric circle / bullseye)
  calls: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <circle cx="10" cy="10" r="2.8" />
    </>
  ),
  // WORKSPACE: Appointments (square with centered square)
  appointments: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <rect x="7.5" y="7.5" width="5" height="5" rx="0.8" />
    </>
  ),
  // WORKSPACE: Admin automation (amber / orange lightning bolt)
  automation: (
    <polygon points="11 2 4.5 10.5 9.5 10.5 8.5 18 16 9 11 9 12 2" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
  ),
  // WORKSPACE: Work / Tasks (checkbox with checkmark)
  work: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <polyline points="6.5,10.2 9,12.7 13.8,7.3" />
    </>
  ),
  tasks: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <polyline points="6.5,10.2 9,12.7 13.8,7.3" />
    </>
  ),
  more: (
    <>
      <circle cx="4" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  // WORKSPACE: Team & dispatch (trefoil / club matching reference)
  team: (
    <>
      <circle cx="10" cy="6" r="2.7" />
      <circle cx="6.8" cy="11.6" r="2.7" />
      <circle cx="13.2" cy="11.6" r="2.7" />
      <path d="M10 11v5M8.2 16h3.6" />
    </>
  ),
  // WORKSPACE: Customers (trefoil / club matching reference)
  customers: (
    <>
      <circle cx="10" cy="6" r="2.7" />
      <circle cx="6.8" cy="11.6" r="2.7" />
      <circle cx="13.2" cy="11.6" r="2.7" />
      <path d="M10 11v5M8.2 16h3.6" />
    </>
  ),
  // MANAGE: AI Coworker (sparkle star)
  copilot: (
    <path d="M10 2.5C10 6.6 13.4 10 17.5 10C13.4 10 10 13.4 10 17.5C10 13.4 6.6 10 2.5 10C6.6 10 10 6.6 10 2.5Z" />
  ),
  // MANAGE: Reports (bar chart inside container)
  reports: (
    <>
      <rect x="3" y="3.5" width="14" height="13" rx="1.5" />
      <line x1="6.5" y1="3.5" x2="6.5" y2="16.5" />
      <line x1="10" y1="3.5" x2="10" y2="16.5" />
      <line x1="13.5" y1="3.5" x2="13.5" y2="16.5" />
    </>
  ),
  // MANAGE: Settings (gear)
  settings: (
    <>
      <circle cx="10" cy="10" r="2.8" />
      <path d="M10 2.8v2M10 15.2v2M17.2 10h-2M4.8 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9" />
    </>
  ),
  van: (
    <>
      <path d="M2.5 13V6a1 1 0 0 1 1-1h9l3.5 3.5V13a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1z" />
      <circle cx="6" cy="14" r="1.8" />
      <circle cx="13" cy="14" r="1.8" />
      <line x1="9" y1="5" x2="9" y2="10" />
      <line x1="2.5" y1="10" x2="16" y2="10" />
    </>
  ),
  wrench: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l1-1a5 5 0 0 1-6.5-6.5l1 1a1 1 0 0 0 0 1.4L11 6.4 5.3 12.1a2 2 0 0 0 0 2.8l.8.8a2 2 0 0 0 2.8 0L14.7 10z" />
  ),
  checkCircle: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <polyline points="6.8,10 9,12.2 13.5,7.7" />
    </>
  ),
  clock: (
    <>
      <circle cx="10" cy="10" r="7.5" />
      <polyline points="10,5.5 10,10 13,11.5" />
    </>
  ),
  snowflake: (
    <>
      <line x1="10" y1="3" x2="10" y2="17" />
      <line x1="4" y1="6.5" x2="16" y2="13.5" />
      <line x1="4" y1="13.5" x2="16" y2="6.5" />
      <circle cx="10" cy="10" r="1.5" />
    </>
  ),
  heart: (
    <path d="M10 16.5s-6-3.8-6-7.8a4.2 4.2 0 0 1 6-3.7 4.2 4.2 0 0 1 6 3.7c0 4-6 7.8-6 7.8z" />
  ),
  plus: (
    <>
      <line x1="10" y1="4" x2="10" y2="16" />
      <line x1="4" y1="10" x2="16" y2="10" />
    </>
  ),

  // Fallback and utility icons used in internal cards / topbar
  requests: (
    <>
      <rect x="4" y="2.5" width="12" height="15" rx="1.5" />
      <line x1="7" y1="7" x2="13" y2="7" />
      <line x1="7" y1="10.3" x2="13" y2="10.3" />
      <line x1="7" y1="13.6" x2="11" y2="13.6" />
    </>
  ),
  jobs: (
    <>
      <rect x="2.5" y="7" width="15" height="10" rx="1.5" />
      <path d="M7 7V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 13 5.5V7" />
      <line x1="2.5" y1="11.5" x2="17.5" y2="11.5" />
    </>
  ),
  tracking: (
    <>
      <path d="M10 18s6-5.6 6-10.2A6 6 0 1 0 4 7.8C4 12.4 10 18 10 18z" />
      <circle cx="10" cy="7.8" r="2.1" />
    </>
  ),
  leads: (
    <path d="M5 3.5c0-.6.4-1 1-1h1.3c.5 0 .9.3 1 .8l.6 2.4c.1.4 0 .8-.3 1.1L7.3 8.1c1 2 2.6 3.6 4.6 4.6l1.3-1.3c.3-.3.7-.4 1.1-.3l2.4.6c.5.1.8.5.8 1V15c0 .6-.4 1-1 1h-1C8.9 16 4 11.1 4 5.5V3.5z" />
  ),
  memory: (
    <>
      <ellipse cx="10" cy="5.2" rx="6" ry="2.2" />
      <path d="M4 5.2v9.6c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V5.2" />
      <path d="M4 10c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2" />
    </>
  ),
  usage: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" />
      <line x1="2.5" y1="8" x2="17.5" y2="8" />
      <line x1="5" y1="12.3" x2="9" y2="12.3" />
    </>
  ),
  approvals: (
    <>
      <circle cx="10" cy="10" r="7.3" />
      <polyline points="6.7,10.2 9,12.5 13.5,7.8" />
    </>
  ),
  attention: (
    <>
      <path d="M10 3.3 18 16.7H2L10 3.3z" />
      <line x1="10" y1="8.3" x2="10" y2="12" />
      <circle cx="10" cy="14.3" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  plan: (
    <>
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <line x1="3" y1="8" x2="17" y2="8" />
      <line x1="7" y1="2.3" x2="7" y2="5.3" />
      <line x1="13" y1="2.3" x2="13" y2="5.3" />
    </>
  ),
  technicians: (
    <>
      <circle cx="7.3" cy="7" r="2.4" />
      <path d="M2.5 16.5c0-2.6 2.1-4.3 4.8-4.3s4.8 1.7 4.8 4.3" />
      <circle cx="14" cy="6.3" r="2" />
      <path d="M12.3 12.6c.5-.2 1.1-.3 1.7-.3 2.3 0 4.2 1.4 4.2 3.8" />
    </>
  ),
  phone: (
    <path d="M5 3.5c0-.6.4-1 1-1h1.3c.5 0 .9.3 1 .8l.6 2.4c.1.4 0 .8-.3 1.1L7.3 8.1c1 2 2.6 3.6 4.6 4.6l1.3-1.3c.3-.3.7-.4 1.1-.3l2.4.6c.5.1.8.5.8 1V15c0 .6-.4 1-1 1h-1C8.9 16 4 11.1 4 5.5V3.5z" />
  ),
  // WORKSPACE: Test (handset + pulse)
  test: (
    <>
      <path d="M5 3.5c0-.6.4-1 1-1h1.3c.5 0 .9.3 1 .8l.6 2.4c.1.4 0 .8-.3 1.1L7.3 8.1c1 2 2.6 3.6 4.6 4.6l1.3-1.3c.3-.3.7-.4 1.1-.3l2.4.6c.5.1.8.5.8 1V15c0 .6-.4 1-1 1h-1C8.9 16 4 11.1 4 5.5V3.5z" />
      <circle cx="15.5" cy="4.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  signOut: (
    <>
      <path d="M8 4H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1H8" />
      <path d="M12 6.5 15.5 10 12 13.5" />
      <line x1="15.2" y1="10" x2="7.3" y2="10" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="7.3" r="3.3" />
      <path d="M3.5 17c0-3.4 2.7-5.6 6-5.6 1 0 1.9.2 2.8.6" />
      <circle cx="15.3" cy="14.5" r="2.1" />
      <path d="M16.8 13 18.5 11.3" />
      <path d="M17.6 10.5 18.6 11.5" />
    </>
  ),
};

export function Icon({ name, className = '' }) {
  const body = PATHS[name];
  if (!body) return null;
  const isAuto = name === 'automation' ? 'icon--automation' : '';
  return (
    <svg className={`icon ${isAuto} ${className}`.trim()} width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {body}
    </svg>
  );
}
