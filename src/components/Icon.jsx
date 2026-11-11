// A small, consistent set of line icons for the sidebar - plain SVG, no icon-font or library, so a
// section's icon is just a name. Every icon shares the same 20x20 grid and stroke weight.
const PATHS = {
  dashboard: (
    <>
      <rect x="3" y="3" width="6" height="6" rx="1.3" />
      <rect x="11" y="3" width="6" height="6" rx="1.3" />
      <rect x="3" y="11" width="6" height="6" rx="1.3" />
      <rect x="11" y="11" width="6" height="6" rx="1.3" />
    </>
  ),
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
  reports: (
    <>
      <line x1="4" y1="16" x2="4" y2="11" />
      <line x1="8.3" y1="16" x2="8.3" y2="6" />
      <line x1="12.6" y1="16" x2="12.6" y2="9" />
      <line x1="17" y1="16" x2="17" y2="3.5" />
    </>
  ),
  copilot: (
    <>
      <path d="M10 3l1.3 3.7L15 8l-3.7 1.3L10 13l-1.3-3.7L5 8l3.7-1.3L10 3z" />
      <path d="M15.5 12l.6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6.6-1.7z" />
    </>
  ),
  phone: (
    <path d="M5 3.5c0-.6.4-1 1-1h1.3c.5 0 .9.3 1 .8l.6 2.4c.1.4 0 .8-.3 1.1L7.3 8.1c1 2 2.6 3.6 4.6 4.6l1.3-1.3c.3-.3.7-.4 1.1-.3l2.4.6c.5.1.8.5.8 1V15c0 .6-.4 1-1 1h-1C8.9 16 4 11.1 4 5.5V3.5z" />
  ),
  signOut: (
    <>
      <path d="M8 4H4.5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1H8" />
      <path d="M12 6.5 15.5 10 12 13.5" />
      <line x1="15.2" y1="10" x2="7.3" y2="10" />
    </>
  ),
  // One person with a small key badge - who can sign in, distinct from the two-person "technicians" roster icon.
  users: (
    <>
      <circle cx="9.5" cy="7.3" r="3.3" />
      <path d="M3.5 17c0-3.4 2.7-5.6 6-5.6 1 0 1.9.2 2.8.6" />
      <circle cx="15.3" cy="14.5" r="2.1" />
      <path d="M16.8 13 18.5 11.3" />
      <path d="M17.6 10.5 18.6 11.5" />
    </>
  ),
  // A contact card: a person's record, distinct from "users" (who can sign in) and "technicians" (the roster).
  customers: (
    <>
      <rect x="2.5" y="3" width="15" height="14" rx="1.6" />
      <circle cx="8" cy="8.3" r="2.2" />
      <path d="M4.8 14c0-1.9 1.6-3 3.2-3s3.2 1.1 3.2 3" />
      <line x1="13" y1="7" x2="15.5" y2="7" />
      <line x1="13" y1="10" x2="15.5" y2="10" />
    </>
  ),
  // A clock face - a booked visit at a time - distinct from "plan"'s calendar grid.
  appointments: (
    <>
      <circle cx="10" cy="10.5" r="7" />
      <path d="M10 6.5v4l3 2" />
      <line x1="7" y1="2.3" x2="7" y2="4.3" />
      <line x1="13" y1="2.3" x2="13" y2="4.3" />
    </>
  ),
  campaigns: (
    <>
      <path d="M3 8.5v3a1 1 0 0 0 1 1h1.2l1.1 3.4a1 1 0 0 0 1.9-.3l-.6-3.1H9l6 3V5.5l-6 3H4a1 1 0 0 0-1 1z" />
      <path d="M15.5 8a3 3 0 0 1 0 4" />
    </>
  ),
  tasks: (
    <>
      <rect x="3" y="3" width="14" height="14" rx="1.6" />
      <polyline points="6,9.3 7.6,11 10.5,7.5" />
      <line x1="12" y1="9" x2="14.5" y2="9" />
      <line x1="6" y1="14" x2="14.5" y2="14" />
    </>
  ),
  // A verified shield - automated actions a person reviews and approves, distinct from "copilot"'s sparkle.
  automation: (
    <>
      <path d="M10 2.8 16.5 6v8L10 17.2 3.5 14V6z" />
      <polyline points="7,10 9,12 13,7.5" />
    </>
  ),
  settings: (
    <>
      <circle cx="10" cy="10" r="2.6" />
      <path d="M10 3.2v2M10 14.8v2M16.8 10h-2M5.2 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9" />
    </>
  ),
};

export function Icon({ name, className = '' }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg className={`icon ${className}`.trim()} width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {body}
    </svg>
  );
}
