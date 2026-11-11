// Team & dispatch: team roster, roles & permissions, availability, and technician tracking.
// Exact Reference UI matching reference design with live backend integration and fallback sample records.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { toast, Overlay } from '../components/index.js';
import { Icon } from '../components/Icon.jsx';

// Sample team members matching reference screenshot 1
const SAMPLE_MEMBERS = [
  {
    id: 'mem-1',
    isSample: true,
    initials: 'MR',
    name: 'Mike Rodriguez',
    trade: 'HVAC',
    role: 'Technician',
    status: 'Available',
    statusTone: 'good',
    hasTimeOff: true,
  },
  {
    id: 'mem-2',
    isSample: true,
    initials: 'AB',
    name: 'Alicia Brown',
    trade: 'Plumbing',
    role: 'Technician',
    status: 'On a job',
    statusTone: 'good',
    hasTimeOff: true,
  },
  {
    id: 'mem-3',
    isSample: true,
    initials: 'JM',
    name: 'James Miller',
    trade: 'Office',
    role: 'Admin',
    status: 'Available',
    statusTone: 'good',
    hasTimeOff: false,
  },
];

// Sample roles matching reference screenshot 2
const SAMPLE_ROLES = [
  {
    id: 'owner',
    title: 'Owner',
    permissions: 'Manage team and roles · Manage business settings · View calls and customers · Assign jobs and schedules · View own schedule and job details · View reports and billing',
    details: [
      'Full administrative control over account, team members, and billing',
      'Manage company profile, hours, and business policies',
      'View customer databases and call logs',
      'Assign technicians and update appointment schedules',
      'View reporting metrics, financials, and dispatch performance',
    ],
  },
  {
    id: 'admin',
    title: 'Admin',
    permissions: 'Manage team and roles · Manage business settings · View calls and customers · Assign jobs and schedules · View own schedule and job details · View reports and billing',
    details: [
      'Manage team members, roles, and shift assignments',
      'Manage business configuration and office automation queues',
      'Inspect incoming calls, caller transcripts, and customer records',
      'Dispatch technicians and manage calendar appointments',
      'Access office metrics and activity history',
    ],
  },
  {
    id: 'dispatcher',
    title: 'Dispatcher',
    permissions: 'View calls and customers · Assign jobs and schedules · View own schedule and job details',
    details: [
      'Access dispatch board, technician schedules, and assignments',
      'Review calls, customer requests, and appointments',
      'Assign unassigned visits and coordinate emergency dispatch',
      'View live tracking feeds and technician status updates',
    ],
  },
  {
    id: 'technician',
    title: 'Technician',
    permissions: 'View assigned jobs and customers · View own schedule and job details',
    details: [
      'Access personal schedule, route, and visit details',
      'Update job status (Arrived, In progress, Completed)',
      'Add service notes and request time extensions',
      'Access customer location and contact information',
    ],
  },
];

// Modals
function AddMemberModal({ onClose, onAdd }) {
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('HVAC');
  const [role, setRole] = useState('Technician');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    const parts = name.trim().split(' ');
    const initials = parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();

    onAdd({
      id: `mem-${Date.now()}`,
      isSample: true,
      initials,
      name: name.trim(),
      trade,
      role,
      status: 'Available',
      statusTone: 'good',
      hasTimeOff: role === 'Technician',
    });
    toast('Team member added.');
    onClose();
  };

  return (
    <Overlay title="Add team member" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
            Full name
          </label>
          <input
            type="text"
            className="search"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Marcus Vance"
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
              Department / Trade
            </label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            >
              <option value="HVAC">HVAC</option>
              <option value="Plumbing">Plumbing</option>
              <option value="Electrical">Electrical</option>
              <option value="Office">Office</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
            >
              <option value="Technician">Technician</option>
              <option value="Dispatcher">Dispatcher</option>
              <option value="Admin">Admin</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" className="team-outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="team-add-btn">
            Add member
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function EditRoleModal({ member, onClose, onSave }) {
  const [role, setRole] = useState(member.role);
  const [trade, setTrade] = useState(member.trade);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(member.id, role, trade);
    toast('Role updated.');
    onClose();
  };

  return (
    <Overlay title={`Edit role · ${member.name}`} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>
          Change department or permissions role for {member.name}.
        </p>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
            Trade / Area
          </label>
          <input
            type="text"
            className="search"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
            Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
          >
            <option value="Technician">Technician</option>
            <option value="Dispatcher">Dispatcher</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" className="team-outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="team-add-btn">
            Save changes
          </button>
        </div>
      </form>
    </Overlay>
  );
}

function TimeOffModal({ member, onClose }) {
  const [dates, setDates] = useState('');
  return (
    <Overlay title={`Schedule time off · ${member.name}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b' }}>
          Mark dates when {member.name} is unavailable for service appointments.
        </p>
        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: 4 }}>
            Time off dates
          </label>
          <input
            type="text"
            className="search"
            placeholder="e.g. Nov 24 – Nov 27"
            value={dates}
            onChange={(e) => setDates(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" className="team-outline-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="team-add-btn"
            onClick={() => {
              toast('Time off saved.');
              onClose();
            }}
          >
            Save time off
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function RolePermissionsModal({ role, onClose }) {
  return (
    <Overlay title={`Permissions · ${role.title}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            ROLE ACCESS POLICY
          </span>
          <h3 style={{ margin: '4px 0 6px 0', fontSize: '1.1rem', color: '#0f172a' }}>
            {role.title} Permissions
          </h3>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b', lineHeight: 1.5 }}>
            {role.permissions}
          </p>
        </div>

        <div style={{ background: '#f8fafc', padding: 14, borderRadius: 8, border: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 8 }}>
            Included capabilities:
          </span>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem', color: '#334155', lineHeight: 1.6 }}>
            {role.details.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="team-add-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export default function Team() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [activeTab, setActiveTab] = useState('people'); // 'people' | 'roles' | 'availability' | 'tracking'
  const [members, setMembers] = useState(SAMPLE_MEMBERS);
  const [roles] = useState(SAMPLE_ROLES);
  const [availPeriod, setAvailPeriod] = useState('today'); // 'today' | 'week'
  const [simStep, setSimStep] = useState(1);
  const [isSimulating, setIsSimulating] = useState(false);

  // Modals state
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [timeOffMember, setTimeOffMember] = useState(null);
  const [reviewingRole, setReviewingRole] = useState(null);

  const initialized = useRef(false);

  // Load real backend team data
  useEffect(() => {
    if (!allowed) return;
    let active = true;

    (async () => {
      try {
        const res = await api('/v1/team');
        if (!active) return;
        if (res?.people?.length && !initialized.current) {
          const mapped = res.people.map((p) => {
            const parts = p.name.split(' ');
            const initials = parts.length > 1
              ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
              : p.name.slice(0, 2).toUpperCase();
            return {
              id: String(p.id),
              isSample: false,
              initials,
              name: p.name,
              trade: p.trade || (p.skills && p.skills[0]) || 'HVAC',
              role: p.text || (p.roles && p.roles[0]) || 'Technician',
              status: p.status?.label || 'Available',
              statusTone: p.status?.code === 'on_a_job' ? 'good' : 'good',
              hasTimeOff: (p.roles || []).includes('technician'),
            };
          });
          setMembers(mapped);
          initialized.current = true;
        }
      } catch {
        // Fall back gracefully to sample members
      }
    })();

    return () => { active = false; };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not available for your role</h1>
        <p className="muted">Ask an administrator if you need this section.</p>
      </div>
    );
  }

  const handleAddMember = (newMem) => {
    setMembers((prev) => [...prev, newMem]);
  };

  const handleEditRole = (id, newRole, newTrade) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, role: newRole, trade: newTrade } : m)));
  };

  const handleAdvanceSimulation = () => {
    setSimStep((prev) => (prev % 3) + 1);
    toast(`Simulation advanced to update #${(simStep % 3) + 1}.`);
  };

  return (
    <>
      {/* Header matching Reference */}
      <div className="team-head">
        <div>
          <div className="team-eyebrow">
            {activeTab === 'tracking' ? 'TEAM & DISPATCH' : 'PEOPLE & OPERATIONS'}
          </div>
          <h1 className="team-title">
            {activeTab === 'tracking' ? 'Technician tracking' : 'Team & dispatch'}
          </h1>
          <p className="team-subtitle">
            {activeTab === 'tracking'
              ? 'Follow location freshness and service status in one place.'
              : 'Manage your team, their access, and their schedule.'}
          </p>
        </div>

        {activeTab === 'tracking' ? (
          <button
            type="button"
            className="team-back-btn"
            onClick={() => setActiveTab('people')}
          >
            Back to team
          </button>
        ) : (
          <button
            type="button"
            className="team-add-btn"
            onClick={() => setShowAddMember(true)}
          >
            + Add team member
          </button>
        )}
      </div>

      {/* Pill Tabs matching Reference */}
      {activeTab !== 'tracking' && (
        <div className="team-tabs-bar">
          <button
            type="button"
            className={`team-tab-pill ${activeTab === 'people' ? 'team-tab-pill--active' : ''}`}
            onClick={() => setActiveTab('people')}
          >
            People
          </button>
          <button
            type="button"
            className={`team-tab-pill ${activeTab === 'roles' ? 'team-tab-pill--active' : ''}`}
            onClick={() => setActiveTab('roles')}
          >
            Roles & permissions
          </button>
          <button
            type="button"
            className={`team-tab-pill ${activeTab === 'availability' ? 'team-tab-pill--active' : ''}`}
            onClick={() => setActiveTab('availability')}
          >
            Availability
          </button>
          <button
            type="button"
            className={`team-tab-pill ${activeTab === 'tracking' ? 'team-tab-pill--active' : ''}`}
            onClick={() => setActiveTab('tracking')}
          >
            Tracking
          </button>
        </div>
      )}

      {/* Tab 1: People */}
      {activeTab === 'people' && (
        <>
          <div className="team-card">
            <div className="team-card-header">
              <div>
                <h2 className="team-card-title">Your team</h2>
                <p className="team-card-subtitle">
                  Manage office staff and field technicians
                </p>
              </div>
              <span className="team-badge-pill">
                {members.length} members
              </span>
            </div>

            <div className="team-list">
              {members.map((member) => (
                <div key={member.id} className="team-row">
                  <div className="team-row-left">
                    <span className="team-avatar">{member.initials}</span>
                    <div className="team-info">
                      <span className="team-name">{member.name}</span>
                      <span className="team-sub">{member.trade} · {member.role}</span>
                    </div>
                  </div>

                  <div className="team-actions">
                    <span className="team-status-pill">{member.status}</span>
                    <button
                      type="button"
                      className="team-outline-btn"
                      onClick={() => setEditingMember(member)}
                    >
                      Edit role
                    </button>
                    {member.hasTimeOff && (
                      <button
                        type="button"
                        className="team-outline-btn"
                        onClick={() => setTimeOffMember(member)}
                      >
                        Time off
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="team-note-text">
            Interactive design concept · Changes stay in this browser session and do not invite people, enforce access, or schedule real work.
          </div>

          <div className="team-card">
            <div className="team-card-header">
              <div>
                <h2 className="team-card-title">Technician time extensions</h2>
                <p className="team-card-subtitle">
                  Shared sample updates from the technician view in this browser
                </p>
              </div>
              <span className="team-badge-pill">0 updates</span>
            </div>
            <p style={{ margin: '0 0 6px 0', fontSize: '0.84rem', color: '#64748b' }}>
              No extensions yet. Open a current technician job, advance it to Arrived or In progress, then choose Extend job time.
            </p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
              Same-browser demo sync only. Other appointments keep their original times.
            </p>
          </div>
        </>
      )}

      {/* Tab 2: Roles & Permissions */}
      {activeTab === 'roles' && (
        <>
          <div className="team-card">
            <div className="team-card-header">
              <div>
                <h2 className="team-card-title">Roles & permissions</h2>
                <p className="team-card-subtitle">
                  Sample permissions only. Access is not enforced in this concept.
                </p>
              </div>
            </div>

            <div className="team-list">
              {roles.map((r) => (
                <div key={r.id} className="team-row">
                  <div className="team-info" style={{ flex: 1 }}>
                    <span className="team-name">{r.title}</span>
                    <span className="team-sub">{r.permissions}</span>
                  </div>
                  <div className="team-actions">
                    <button
                      type="button"
                      className="team-outline-btn"
                      onClick={() => setReviewingRole(r)}
                    >
                      Review permissions
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="team-note-text">
            Interactive design concept · Changes stay in this browser session and do not invite people, enforce access, or schedule real work.
          </div>

          <div className="team-card">
            <div className="team-card-header">
              <div>
                <h2 className="team-card-title">Technician time extensions</h2>
                <p className="team-card-subtitle">
                  Shared sample updates from the technician view in this browser
                </p>
              </div>
              <span className="team-badge-pill">0 updates</span>
            </div>
            <p style={{ margin: '0 0 6px 0', fontSize: '0.84rem', color: '#64748b' }}>
              No extensions yet. Open a current technician job, advance it to Arrived or In progress, then choose Extend job time.
            </p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
              Same-browser demo sync only. Other appointments keep their original times.
            </p>
          </div>
        </>
      )}

      {/* Tab 3: Availability */}
      {activeTab === 'availability' && (
        <>
          <div className="team-card">
            <div className="team-card-header">
              <div>
                <h2 className="team-card-title">Technician availability</h2>
                <p className="team-card-subtitle">
                  Sample schedule · Local business time
                </p>
              </div>
              <div className="team-avail-toggle">
                <button
                  type="button"
                  className={`team-avail-toggle-btn ${availPeriod === 'today' ? 'team-avail-toggle-btn--active' : ''}`}
                  onClick={() => setAvailPeriod('today')}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`team-avail-toggle-btn ${availPeriod === 'week' ? 'team-avail-toggle-btn--active' : ''}`}
                  onClick={() => setAvailPeriod('week')}
                >
                  Week
                </button>
              </div>
            </div>

            <div className="team-avail-legend">
              <span className="team-legend-item">
                <span className="team-legend-box" style={{ background: '#10b981' }} />
                <span>Available</span>
              </span>
              <span className="team-legend-item">
                <span className="team-legend-box" style={{ background: '#f97316' }} />
                <span>Booked</span>
              </span>
              <span className="team-legend-item">
                <span className="team-legend-box" style={{ background: '#94a3b8' }} />
                <span>Outside hours</span>
              </span>
            </div>

            {/* Mike Rodriguez */}
            <div className="team-avail-tech-block">
              <h3 className="team-avail-tech-title">
                Mike Rodriguez <span style={{ color: '#64748b', fontWeight: 400 }}>HVAC · 8:00 AM – 5:00 PM</span>
              </h3>
              <div className="team-avail-day-title">Wed, Nov 11</div>
              <div className="team-slot-available">8 AM - 3:30 PM · Available</div>
              <div className="team-slot-booked">3:30 PM - 4:30 PM · Booked: HVAC maintenance · David Rodriguez</div>
              <div className="team-slot-available">4:30 PM - 5 PM · Available</div>
              <div className="team-slot-outside">After 5 PM · Outside hours</div>
            </div>

            {/* Alicia Brown */}
            <div className="team-avail-tech-block">
              <h3 className="team-avail-tech-title">
                Alicia Brown <span style={{ color: '#64748b', fontWeight: 400 }}>Plumbing · 8:00 AM – 4:00 PM</span>
              </h3>
              <div className="team-avail-day-title">Wed, Nov 11</div>
              <div className="team-slot-available">8 AM - 4 PM · Available</div>
              <div className="team-slot-outside">After 4 PM · Outside hours</div>
            </div>

            <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 18 }}>
              Illustrative slots only. Actual booking should check working hours, job duration, travel time, time off and conflicts.
            </div>
          </div>

          <div className="team-note-text">
            Interactive design concept · Changes stay in this browser session and do not invite people, enforce access, or schedule real work.
          </div>

          <div className="team-card">
            <div className="team-card-header">
              <div>
                <h2 className="team-card-title">Technician time extensions</h2>
                <p className="team-card-subtitle">
                  Shared sample updates from the technician view in this browser
                </p>
              </div>
              <span className="team-badge-pill">0 updates</span>
            </div>
            <p style={{ margin: '0 0 6px 0', fontSize: '0.84rem', color: '#64748b' }}>
              No extensions yet. Open a current technician job, advance it to Arrived or In progress, then choose Extend job time.
            </p>
            <p style={{ margin: 0, fontSize: '0.74rem', color: '#94a3b8' }}>
              Same-browser demo sync only. Other appointments keep their original times.
            </p>
          </div>
        </>
      )}

      {/* Tab 4: Tracking */}
      {activeTab === 'tracking' && (
        <>
          <div className="tracking-top-bar">
            <span
              style={{
                background: '#fff7ed',
                color: '#c2410c',
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: '0.74rem',
                fontWeight: 600,
              }}
            >
              Simulated tracking · GPS not connected
            </span>
            <button
              type="button"
              className="team-outline-btn"
              onClick={() => {
                setIsSimulating(!isSimulating);
                toast(isSimulating ? 'Simulation paused.' : 'Simulation running.');
              }}
            >
              {isSimulating ? 'Pause simulation' : 'Start simulation'}
            </button>
            <button
              type="button"
              className="team-outline-btn"
              onClick={handleAdvanceSimulation}
            >
              Advance sample update
            </button>
          </div>

          <div className="tracking-grid">
            {/* Left Card: Sample route overview */}
            <div className="team-card" style={{ margin: 0 }}>
              <h2 className="team-card-title">Sample route overview</h2>
              <p className="team-card-subtitle">
                Schematic only · Not a geographic map or actual technician locations
              </p>

              <div className="tracking-map-box">
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 360 200"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ position: 'absolute', inset: 0 }}
                >
                  <path
                    d="M 60 140 L 160 140 L 160 70 L 300 70"
                    stroke="#cbd5e1"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Office pin */}
                  <circle cx="60" cy="140" r="14" fill="#0284c7" />
                  <text x="60" y="145" fill="#ffffff" fontSize="12" fontWeight="600" textAnchor="middle">
                    M
                  </text>
                  <text x="60" y="170" fill="#64748b" fontSize="11" textAnchor="middle">
                    Office
                  </text>

                  {/* Destination pin */}
                  <circle cx="300" cy="70" r="9" fill="#0369a1" />
                  <text x="300" y="52" fill="#0f172a" fontSize="11" fontWeight="500" textAnchor="middle">
                    Service job
                  </text>
                </svg>
              </div>
            </div>

            {/* Right Card: Technicians */}
            <div className="team-card" style={{ margin: 0 }}>
              <h2 className="team-card-title">Technicians</h2>
              <div className="team-list">
                <div className="team-row">
                  <div className="team-row-left">
                    <span className="team-avatar">M</span>
                    <div className="team-info">
                      <span className="team-name">Mike Rodriguez</span>
                      <span className="team-sub">Available · HVAC</span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        Sample update just now
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      background: '#ecfdf5',
                      color: '#047857',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 9999,
                    }}
                  >
                    Demo feed
                  </span>
                </div>

                <div className="team-row">
                  <div className="team-row-left">
                    <span className="team-avatar">A</span>
                    <div className="team-info">
                      <span className="team-name">Alicia Brown</span>
                      <span className="team-sub">Location sharing off · Plumbing</span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        No location available
                      </span>
                    </div>
                  </div>
                  <span
                    style={{
                      background: '#fff7ed',
                      color: '#c2410c',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: 9999,
                    }}
                  >
                    Offline
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="team-card" style={{ marginTop: 20 }}>
            <h2 className="team-card-title">Activity updates</h2>
            <p style={{ margin: '0 0 4px 0', fontSize: '0.86rem', fontWeight: 600, color: '#0f172a' }}>
              Sample update {simStep} · Mike Rodriguez · Available
            </p>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
              These updates do not change actual jobs, assignments, or GPS locations.
            </p>
          </div>

          <div className="team-note-text">
            Real tracking requires a technician app, location permission, a secure backend, and a location feed.
          </div>
        </>
      )}

      {/* Modals */}
      {showAddMember && (
        <AddMemberModal
          onClose={() => setShowAddMember(false)}
          onAdd={handleAddMember}
        />
      )}

      {editingMember && (
        <EditRoleModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSave={handleEditRole}
        />
      )}

      {timeOffMember && (
        <TimeOffModal
          member={timeOffMember}
          onClose={() => setTimeOffMember(null)}
        />
      )}

      {reviewingRole && (
        <RolePermissionsModal
          role={reviewingRole}
          onClose={() => setReviewingRole(null)}
        />
      )}
    </>
  );
}
