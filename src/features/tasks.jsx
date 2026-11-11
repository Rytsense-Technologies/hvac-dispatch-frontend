// Tasks: work that needs attention and assignment - unassigned jobs, assigned jobs, and office follow-ups.
// Exact Reference UI matching reference design with live backend integration and fallback sample records.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { toast, Overlay } from '../components/index.js';
import { Icon } from '../components/Icon.jsx';

// Sample unassigned jobs matching reference screenshot
const SAMPLE_UNASSIGNED = [
  {
    id: 'task-un-1',
    isSample: true,
    service: 'AC repair',
    customer: 'Sarah Mitchell',
    title: 'AC repair · Sarah Mitchell',
    subtitle: 'Wed, Nov 11 · 1 PM - 3 PM · Austin, TX · Urgent · Unassigned',
    time: 'Wed, Nov 11 · 1 PM - 3 PM',
    location: 'Austin, TX',
    priority: 'Urgent',
    status: 'Unassigned',
  },
  {
    id: 'task-un-2',
    isSample: true,
    service: 'Plumbing inspection',
    customer: 'William Brooks',
    title: 'Plumbing inspection · William Brooks',
    subtitle: 'Thu, Nov 12 · 9 AM - 10 AM · Round Rock, TX · Standard · Unassigned',
    time: 'Thu, Nov 12 · 9 AM - 10 AM',
    location: 'Round Rock, TX',
    priority: 'Standard',
    status: 'Unassigned',
  },
];

// Sample office follow-ups matching reference screenshot
const SAMPLE_FOLLOWUPS = [
  {
    id: 'task-fu-1',
    isSample: true,
    title: 'Invoice follow-up',
    customer: 'Sarah Mitchell',
    subtitle: 'Sarah Mitchell · Needs approval',
    status: 'Needs approval',
    proposed: 'Hi Sarah, this is a friendly reminder that invoice #1048 for $240 is overdue. Please contact our office if you have questions.',
  },
  {
    id: 'task-fu-2',
    isSample: true,
    title: 'Customer record update',
    customer: 'David Rodriguez',
    subtitle: 'David Rodriguez · Needs review',
    status: 'Needs review',
    proposed: 'Update contact phone to (512) 555-0189 and record morning availability.',
  },
  {
    id: 'task-fu-3',
    isSample: true,
    title: 'Job documentation',
    customer: 'William Brooks',
    subtitle: 'William Brooks · Needs review',
    status: 'Needs review',
    proposed: 'Plumbing inspection completed. Water pressure valve replacement estimate prepared.',
  },
  {
    id: 'task-fu-4',
    isSample: true,
    title: 'Estimate follow-up',
    customer: 'Jessica Taylor',
    subtitle: 'Jessica Taylor · Needs approval',
    status: 'Needs approval',
    proposed: 'Hi Jessica, following up on your heat pump replacement estimate from Apex Air Solutions.',
  },
];

const AVAILABLE_TECH_CHOICES = [
  { id: 'tech-1', name: 'Mike Rodriguez', role: 'HVAC Specialist', status: 'Available' },
  { id: 'tech-2', name: 'Alex Chen', role: 'Senior Technician', status: 'Available' },
  { id: 'tech-3', name: 'Sam Taylor', role: 'Plumbing Specialist', status: 'Available' },
];

// Modal to assign a technician
function AssignModal({ job, onClose, onAssign }) {
  const [selectedTech, setSelectedTech] = useState(AVAILABLE_TECH_CHOICES[0].id);

  const handleConfirm = () => {
    const tech = AVAILABLE_TECH_CHOICES.find((t) => t.id === selectedTech);
    onAssign(job, tech);
    toast(`Assigned to ${tech.name}.`);
    onClose();
  };

  return (
    <Overlay title={`Assign technician · ${job.customer}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Job details:</span>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.92rem', fontWeight: 600, color: '#0f172a' }}>
            {job.title}
          </p>
          <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            {job.subtitle}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
            Select available technician
          </span>
          {AVAILABLE_TECH_CHOICES.map((t) => (
            <label
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                border: selectedTech === t.id ? '1px solid #0284c7' : '1px solid #e2e8f0',
                borderRadius: 8,
                background: selectedTech === t.id ? '#f0f9ff' : '#ffffff',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="radio"
                  name="technician"
                  value={t.id}
                  checked={selectedTech === t.id}
                  onChange={() => setSelectedTech(t.id)}
                />
                <div>
                  <strong style={{ display: 'block', fontSize: '0.88rem', color: '#0f172a' }}>
                    {t.name}
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{t.role}</span>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: '#047857',
                  background: '#ecfdf5',
                  padding: '2px 8px',
                  borderRadius: 9999,
                }}
              >
                {t.status}
              </span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            className="tasks-action-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="automation-btn-primary"
            onClick={handleConfirm}
          >
            Confirm assignment
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// Modal for Follow-up Review
function TaskReviewModal({ item, onClose, onHandle }) {
  return (
    <Overlay title={`Review · ${item.title}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>
            {item.customer}
          </span>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
            Status: {item.status}
          </p>
        </div>

        <div>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#0f172a' }}>
            Proposed action:
          </span>
          <div
            style={{
              marginTop: 6,
              padding: 12,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              fontSize: '0.85rem',
              color: '#334155',
              lineHeight: 1.5,
            }}
          >
            {item.proposed}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            className="tasks-action-btn"
            onClick={onClose}
          >
            Close
          </button>
          <button
            type="button"
            className="automation-btn-primary"
            onClick={() => {
              onHandle(item.id);
              toast('Follow-up handled.');
              onClose();
            }}
          >
            Mark handled
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export default function Tasks() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [data, setData] = useState(null);
  const [unassignedJobs, setUnassignedJobs] = useState(SAMPLE_UNASSIGNED);
  const [assignedJobs, setAssignedJobs] = useState([]);
  const [followups, setFollowups] = useState(SAMPLE_FOLLOWUPS);
  const [assigningJob, setAssigningJob] = useState(null);
  const [reviewingItem, setReviewingItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  // Load real backend tasks
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const res = await api('/v1/tasks');
        if (!active) return;
        setData(res);

        if (!initialized.current) {
          if (res?.unassigned_work?.items?.length) {
            setUnassignedJobs(
              res.unassigned_work.items.map((item) => ({
                id: String(item.id),
                isSample: false,
                service: item.title || 'Service visit',
                customer: item.customer?.name || 'Customer',
                title: `${item.title || 'Service'} · ${item.customer?.name || 'Customer'}`,
                subtitle: `${item.when || 'Upcoming'} · ${item.place || 'Austin, TX'} · ${item.priority?.label || 'Standard'} · Unassigned`,
                time: item.when || 'Upcoming',
                location: item.place || 'Austin, TX',
                priority: item.priority?.label || 'Standard',
                status: 'Unassigned',
                raw: item,
              }))
            );
          }
          if (res?.assigned_work?.items?.length) {
            setAssignedJobs(
              res.assigned_work.items.map((item) => ({
                id: String(item.id),
                isSample: false,
                service: item.title || 'Service visit',
                customer: item.customer?.name || 'Customer',
                title: `${item.title || 'Service'} · ${item.customer?.name || 'Customer'}`,
                subtitle: `${item.when || 'Upcoming'} · ${item.place || 'Austin, TX'} · Technician: ${item.technician?.name || 'Assigned'}`,
                time: item.when || 'Upcoming',
                location: item.place || 'Austin, TX',
                technicianName: item.technician?.name || 'Assigned',
                status: 'Assigned',
                raw: item,
              }))
            );
          }
          initialized.current = true;
        }
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoading(false);
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

  const handleAssignTechnician = (job, tech) => {
    setUnassignedJobs((prev) => prev.filter((j) => j.id !== job.id));
    setAssignedJobs((prev) => [
      ...prev,
      {
        ...job,
        status: 'Assigned',
        technicianName: tech.name,
        subtitle: `${job.time || 'Today'} · ${job.location || 'Austin, TX'} · Technician: ${tech.name}`,
      },
    ]);
  };

  const handleDismissFollowup = (id) => {
    setFollowups((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <>
      {/* Header matching Reference */}
      <div className="tasks-head">
        <div>
          <div className="tasks-eyebrow">YOUR WORK QUEUE</div>
          <h1 className="tasks-title">Tasks</h1>
          <p className="tasks-subtitle">
            See work that needs attention and assign the right person.
          </p>
        </div>
        <button
          type="button"
          className="tasks-workspace-btn"
          onClick={() => {}}
        >
          Sample workspace
        </button>
      </div>

      {/* Top 3 Stat Cards */}
      <div className="tasks-stat-grid">
        <div className="tasks-stat-card">
          <span className="tasks-stat-label">Unassigned work</span>
          <span className="tasks-stat-value">{unassignedJobs.length}</span>
          <span className="tasks-stat-hint">Ready for assignment</span>
        </div>
        <div className="tasks-stat-card">
          <span className="tasks-stat-label">Assigned jobs</span>
          <span className="tasks-stat-value">{assignedJobs.length}</span>
          <span className="tasks-stat-hint">In this example queue</span>
        </div>
        <div className="tasks-stat-card">
          <span className="tasks-stat-label">Office follow-ups</span>
          <span className="tasks-stat-value">{followups.length}</span>
          <span className="tasks-stat-hint">Sample tasks</span>
        </div>
      </div>

      {/* Section 1: Unassigned work */}
      <div className="tasks-card">
        <div className="tasks-card-header">
          <div>
            <h2 className="tasks-card-title">Unassigned work</h2>
            <p className="tasks-card-subtitle">
              Assign a technician directly from the task
            </p>
          </div>
          {unassignedJobs.length > 0 && (
            <span className="tasks-unassigned-badge">
              {unassignedJobs.length} unassigned
            </span>
          )}
        </div>

        {unassignedJobs.length === 0 ? (
          <p className="tasks-empty-text">No unassigned work at the moment.</p>
        ) : (
          <div className="tasks-list">
            {unassignedJobs.map((job) => (
              <div key={job.id} className="tasks-row">
                <div className="tasks-row-left">
                  <span className="tasks-row-icon">
                    <Icon name="appointments" />
                  </span>
                  <div className="tasks-row-info">
                    <span className="tasks-row-name">{job.title}</span>
                    <span className="tasks-row-sub">{job.subtitle}</span>
                  </div>
                </div>

                <div className="tasks-row-actions">
                  <span className="tasks-status-pill tasks-status-pill--unassigned">
                    Unassigned
                  </span>
                  <button
                    type="button"
                    className="tasks-action-btn"
                    onClick={() => setAssigningJob(job)}
                  >
                    Assign technician →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Assigned work */}
      <div className="tasks-card">
        <div className="tasks-card-header">
          <div>
            <h2 className="tasks-card-title">Assigned work</h2>
            <p className="tasks-card-subtitle">
              Sample jobs with a technician
            </p>
          </div>
        </div>

        {assignedJobs.length === 0 ? (
          <p className="tasks-empty-text">Assigned jobs will appear here.</p>
        ) : (
          <div className="tasks-list">
            {assignedJobs.map((job) => (
              <div key={job.id} className="tasks-row">
                <div className="tasks-row-left">
                  <span
                    className="tasks-row-icon"
                    style={{ background: '#ecfdf5', color: '#047857' }}
                  >
                    <Icon name="checkCircle" />
                  </span>
                  <div className="tasks-row-info">
                    <span className="tasks-row-name">{job.title}</span>
                    <span className="tasks-row-sub">{job.subtitle}</span>
                  </div>
                </div>

                <div className="tasks-row-actions">
                  <span className="tasks-status-pill tasks-status-pill--assigned">
                    Assigned
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3: Office follow-ups */}
      <div className="tasks-card">
        <div className="tasks-card-header">
          <div>
            <h2 className="tasks-card-title">Office follow-ups</h2>
            <p className="tasks-card-subtitle">
              AI actions awaiting review and campaign callbacks
            </p>
          </div>
        </div>

        {followups.length === 0 ? (
          <p className="tasks-empty-text">No pending office follow-ups.</p>
        ) : (
          <div className="tasks-list">
            {followups.map((item) => (
              <div key={item.id} className="tasks-row">
                <div className="tasks-row-left">
                  <span className="tasks-row-icon">
                    <Icon name="agents" />
                  </span>
                  <div className="tasks-row-info">
                    <span className="tasks-row-name">{item.title}</span>
                    <span className="tasks-row-sub">{item.subtitle}</span>
                  </div>
                </div>

                <div className="tasks-row-actions">
                  <button
                    type="button"
                    className="tasks-action-btn"
                    onClick={() => setReviewingItem(item)}
                  >
                    Review
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom disclaimer matching Reference */}
      <div className="tasks-disclaimer">
        Design concept · Assignments are sample data and last only for this browser session.
      </div>

      {/* Modals */}
      {assigningJob && (
        <AssignModal
          job={assigningJob}
          onClose={() => setAssigningJob(null)}
          onAssign={handleAssignTechnician}
        />
      )}

      {reviewingItem && (
        <TaskReviewModal
          item={reviewingItem}
          onClose={() => setReviewingItem(null)}
          onHandle={handleDismissFollowup}
        />
      )}
    </>
  );
}
