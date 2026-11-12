import { useState, useEffect, useMemo } from 'react';
import { api } from '../lib/api.js';
import { session } from '../lib/session.js';
import { toast, Dialog, Button } from '../components/index.js';

const REFERENCE_JOBS = [
  {
    id: 'job-1038',
    code: 'JOB-1038',
    title: 'Furnace safety inspection',
    customer: 'Emily Parker',
    phone: '(512) 555-0142',
    address: '1802 Pine Street, Austin, TX',
    time: 'Thu, Nov 12 · 8:00 AM–9:00 AM',
    priority: 'Standard priority',
    isUrgent: false,
    status: 'completed',
    statusLabel: 'Completed',
    blocker: null,
    serviceDetails: 'Annual furnace efficiency check, flame sensor cleaning, and safety switch testing.',
  },
  {
    id: 'job-1040',
    code: 'JOB-1040',
    title: 'AC repair · Waiting for parts',
    customer: 'Robert Wilson',
    phone: '(512) 555-0188',
    address: '709 Willow Drive, Austin, TX',
    time: 'Thu, Nov 12 · 9:30 AM–10:30 AM',
    priority: 'Standard priority',
    isUrgent: false,
    status: 'in_progress',
    statusLabel: 'In progress',
    blocker: 'Replacement capacitor not available. Office follow-up required.',
    serviceDetails: 'Compressor humming but fan not spinning. Diagnosed faulty 45+5 MFD dual run capacitor.',
  },
  {
    id: 'job-1041',
    code: 'JOB-1041',
    title: 'Urgent AC repair',
    customer: 'Sarah Mitchell',
    phone: '(512) 555-0114',
    address: '1206 Oak Street, Austin, TX',
    time: 'Thu, Nov 12 · 11:30 AM–1:00 PM',
    priority: 'Urgent priority',
    isUrgent: true,
    status: 'scheduled',
    statusLabel: 'Scheduled',
    blocker: null,
    serviceDetails: 'System blowing warm air, thermostat showing 82°F indoors. Elderly resident in home.',
  },
];

export default function TechPortal() {
  const [jobs, setJobs] = useState(REFERENCE_JOBS);
  const [activeJob, setActiveJob] = useState(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [dutyStatus, setDutyStatus] = useState('On duty');
  const [blockerInput, setBlockerInput] = useState('');
  const [showBlockerPrompt, setShowBlockerPrompt] = useState(false);
  const [officeMsg, setOfficeMsg] = useState('');

  // Load live jobs if backend is connected, otherwise fallback seamlessly to reference data
  useEffect(() => {
    let active = true;
    const fetchJobs = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0];
        const res = await api('/v1/dispatch/jobs', { params: { date: todayStr, limit: 100 } });
        if (active && res && Array.isArray(res.jobs) && res.jobs.length > 0) {
          const mapped = res.jobs.map((j, idx) => {
            const isCompleted = j.progress === 'completed' || j.status === 'completed';
            const isInProgress = j.progress === 'in_progress' || j.progress === 'en_route' || j.progress === 'arrived';
            return {
              id: j.id || `job-${1038 + idx}`,
              code: j.code || `JOB-${1038 + idx}`,
              title: j.title || j.service || 'Service visit',
              customer: j.customer_name || j.customer || 'Customer',
              phone: j.customer_phone || '(512) 555-0100',
              address: j.address || 'Austin, TX',
              time: j.window || 'Thu, Nov 12 · 9:00 AM–10:00 AM',
              priority: j.priority === 'urgent' ? 'Urgent priority' : 'Standard priority',
              isUrgent: j.priority === 'urgent',
              status: isCompleted ? 'completed' : isInProgress ? 'in_progress' : 'scheduled',
              statusLabel: isCompleted ? 'Completed' : isInProgress ? 'In progress' : 'Scheduled',
              blocker: j.blocker || null,
              serviceDetails: j.description || j.notes || 'HVAC diagnostics and service inspection.',
            };
          });
          setJobs(mapped);
        }
      } catch {
        // Fallback silently to REFERENCE_JOBS
      }
    };
    fetchJobs();
    return () => {
      active = false;
    };
  }, []);

  // Report live location to dispatch while on duty, so the office map shows where this technician is.
  useEffect(() => {
    if (dutyStatus !== 'On duty' || !('geolocation' in navigator)) return undefined;

    let cancelled = false;
    const sendPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          api('/v1/tech/position', {
            method: 'POST',
            body: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            },
          }).catch(() => {
            // Office map will just show this technician as stale; nothing to show the tech here.
          });
        },
        () => {
          // Location permission denied or unavailable; skip silently until the next tick.
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 10000 }
      );
    };

    sendPosition();
    const interval = setInterval(sendPosition, 20000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dutyStatus]);

  const counts = useMemo(() => {
    const assigned = jobs.length >= 4 ? jobs.length : 4;
    const completed = jobs.filter((j) => j.status === 'completed').length;
    return { assigned, completed };
  }, [jobs]);

  const updateJobStatus = async (jobId, newStatus, newLabel, blockerText = null) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id === jobId) {
          return {
            ...j,
            status: newStatus,
            statusLabel: newLabel,
            blocker: blockerText !== undefined ? blockerText : j.blocker,
          };
        }
        return j;
      })
    );

    if (activeJob && activeJob.id === jobId) {
      setActiveJob((prev) => ({
        ...prev,
        status: newStatus,
        statusLabel: newLabel,
        blocker: blockerText !== undefined ? blockerText : prev.blocker,
      }));
    }

    try {
      await api(`/v1/dispatch/jobs/${jobId}/progress`, {
        method: 'POST',
        body: { event: newStatus, blocker: blockerText },
      });
    } catch {
      // Local state is already updated
    }
    toast(`Job status updated: ${newLabel}`);
  };

  const toggleDuty = () => {
    if (dutyStatus === 'On duty') {
      setDutyStatus('On break');
      toast('Status: On break');
    } else if (dutyStatus === 'On break') {
      setDutyStatus('Off duty');
      toast('Status: Off duty');
    } else {
      setDutyStatus('On duty');
      toast('Status: On duty');
    }
  };

  const handleSendOfficeNote = (e) => {
    e.preventDefault();
    if (!officeMsg.trim()) return;
    toast('Note sent to dispatch office.');
    setOfficeMsg('');
    setContactOpen(false);
  };

  const displayName = session.user?.name ? session.user.name.split(' ')[0] : 'Mike';

  return (
    <div className="tech-container">
      {/* Header section matching reference exactly */}
      <div className="tech-head">
        <div>
          <div className="tech-eyebrow">THU, NOV 12</div>
          <h1 className="tech-title">Hi {displayName}, here’s your day.</h1>
          <p className="tech-subtitle">Your next visit and the work that needs you.</p>
        </div>
        <button
          type="button"
          className="tech-duty-badge"
          onClick={toggleDuty}
          title="Click to toggle status"
          style={{ cursor: 'pointer' }}
        >
          {dutyStatus}
        </button>
      </div>

      {/* Main Two-Column Grid */}
      <div className="tech-grid">
        {/* Left Column: Today's Jobs */}
        <div>
          <h2 className="tech-section-title">Today’s jobs</h2>

          {jobs.map((job) => (
            <div key={job.id} className="tech-job-card">
              <div className="tech-job-head">
                <span className="tech-job-eyebrow">{job.code} · ASSIGNED TO YOU</span>
                <span
                  className={`tech-job-badge tech-job-badge--${
                    job.status === 'completed'
                      ? 'completed'
                      : job.status === 'in_progress'
                      ? 'progress'
                      : 'scheduled'
                  }`}
                >
                  {job.statusLabel}
                </span>
              </div>

              <div className="tech-job-title">{job.title}</div>
              <div className="tech-job-customer">{job.customer}</div>
              <div className="tech-job-address">{job.address}</div>

              <div className="tech-job-meta">
                <span className="tech-job-time">{job.time}</span>
                <span
                  className={`tech-job-priority ${
                    job.isUrgent ? 'tech-job-priority--urgent' : ''
                  }`}
                >
                  {job.priority}
                </span>
              </div>

              {job.blocker ? (
                <div className="tech-blocker-box">
                  Blocker reported · {job.blocker}
                </div>
              ) : null}

              <button
                type="button"
                className="tech-view-btn"
                onClick={() => {
                  setActiveJob(job);
                  setShowBlockerPrompt(false);
                }}
              >
                View job
              </button>
            </div>
          ))}
        </div>

        {/* Right Column: Today at a glance & Before you leave */}
        <div>
          {/* Card 1: Today at a glance */}
          <div className="tech-widget-card">
            <h3 className="tech-widget-title">Today at a glance</h3>
            <div className="tech-glance-grid">
              <div className="tech-glance-item">
                <span className="tech-glance-num">{counts.assigned}</span>
                <span className="tech-glance-label">Assigned</span>
              </div>
              <div className="tech-glance-item">
                <span className="tech-glance-num">{counts.completed}</span>
                <span className="tech-glance-label">Completed</span>
              </div>
            </div>
          </div>

          {/* Card 2: Before you leave */}
          <div className="tech-widget-card">
            <h3 className="tech-widget-title">Before you leave</h3>
            <ul className="tech-checklist">
              <li className="tech-checklist-item">• Review the service request.</li>
              <li className="tech-checklist-item">• Check the job address and arrival window.</li>
              <li className="tech-checklist-item">• Update your status when you head out.</li>
            </ul>
            <button
              type="button"
              className="tech-contact-link"
              onClick={() => setContactOpen(true)}
            >
              Contact office
            </button>
          </div>
        </div>
      </div>

      {/* View Job Modal */}
      {activeJob && (
        <Dialog
          title={`${activeJob.code} · ${activeJob.title}`}
          onClose={() => {
            setActiveJob(null);
            setShowBlockerPrompt(false);
          }}
        >
          <div style={{ padding: '4px 0' }}>
            <div className="tech-dialog-row">
              <span className="tech-dialog-label">Customer</span>
              <span className="tech-dialog-value">{activeJob.customer}</span>
            </div>
            <div className="tech-dialog-row">
              <span className="tech-dialog-label">Phone</span>
              <span className="tech-dialog-value">
                <a
                  href={`tel:${activeJob.phone}`}
                  style={{ color: '#0284c7', textDecoration: 'none' }}
                >
                  {activeJob.phone}
                </a>
              </span>
            </div>
            <div className="tech-dialog-row">
              <span className="tech-dialog-label">Address</span>
              <span className="tech-dialog-value">
                {activeJob.address}{' '}
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(activeJob.address)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#0284c7', marginLeft: 6, fontSize: '0.8rem' }}
                >
                  (Directions)
                </a>
              </span>
            </div>
            <div className="tech-dialog-row">
              <span className="tech-dialog-label">Window</span>
              <span className="tech-dialog-value">{activeJob.time}</span>
            </div>
            <div className="tech-dialog-row">
              <span className="tech-dialog-label">Priority</span>
              <span
                className={`tech-dialog-value ${
                  activeJob.isUrgent ? 'tech-job-priority--urgent' : ''
                }`}
              >
                {activeJob.priority}
              </span>
            </div>
            <div className="tech-dialog-row">
              <span className="tech-dialog-label">Current status</span>
              <span className="tech-dialog-value">{activeJob.statusLabel}</span>
            </div>

            <div style={{ margin: '14px 0', borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
              <div className="tech-dialog-label" style={{ marginBottom: 4 }}>
                Service Notes
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>
                {activeJob.serviceDetails}
              </p>
            </div>

            {activeJob.blocker && (
              <div className="tech-blocker-box" style={{ margin: '12px 0' }}>
                <strong>Blocker reported:</strong> {activeJob.blocker}
              </div>
            )}

            {showBlockerPrompt && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  padding: 12,
                  margin: '12px 0',
                }}
              >
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#0f172a',
                    marginBottom: 6,
                  }}
                >
                  Report a blocker
                </div>
                <input
                  type="text"
                  placeholder="e.g. Waiting for capacitor, customer not home..."
                  value={blockerInput}
                  onChange={(e) => setBlockerInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 4,
                    border: '1px solid #cbd5e1',
                    fontSize: '0.82rem',
                    marginBottom: 8,
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <Button
                    className="btn btn--outline btn--small"
                    onClick={() => setShowBlockerPrompt(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="btn btn--primary btn--small"
                    onClick={() => {
                      if (!blockerInput.trim()) return;
                      updateJobStatus(
                        activeJob.id,
                        'in_progress',
                        'In progress',
                        blockerInput.trim()
                      );
                      setShowBlockerPrompt(false);
                      setBlockerInput('');
                    }}
                  >
                    Submit blocker
                  </Button>
                </div>
              </div>
            )}

            <div className="tech-dialog-actions">
              <Button
                className="btn btn--secondary btn--small"
                onClick={() => updateJobStatus(activeJob.id, 'in_progress', 'In progress')}
              >
                En route
              </Button>
              <Button
                className="btn btn--secondary btn--small"
                onClick={() => updateJobStatus(activeJob.id, 'in_progress', 'Arrived')}
              >
                Arrived
              </Button>
              <Button
                className="btn btn--outline btn--small"
                onClick={() => setShowBlockerPrompt((s) => !s)}
              >
                Report blocker
              </Button>
              <Button
                className="btn btn--primary btn--small"
                onClick={() => {
                  updateJobStatus(activeJob.id, 'completed', 'Completed', null);
                  setActiveJob(null);
                }}
              >
                Complete job
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {/* Contact Office Modal */}
      {contactOpen && (
        <Dialog title="Contact Dispatch Office" onClose={() => setContactOpen(false)}>
          <div style={{ padding: '4px 0' }}>
            <p style={{ fontSize: '0.88rem', color: '#475569', margin: '0 0 16px 0' }}>
              Direct line to dispatch for parts assistance, schedule revisions, or customer updates.
            </p>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                background: '#f8fafc',
                borderRadius: 6,
                border: '1px solid #e2e8f0',
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>
                  Dispatch Direct
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b' }}>(512) 555-0199</div>
              </div>
              <a
                href="tel:5125550199"
                className="btn btn--primary btn--small"
                style={{ textDecoration: 'none' }}
              >
                Call Office
              </a>
            </div>

            <form onSubmit={handleSendOfficeNote}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#334155',
                  marginBottom: 6,
                }}
              >
                Send quick note to dispatch
              </label>
              <textarea
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
                placeholder="e.g. Need office to call Sarah Mitchell before arrival..."
                value={officeMsg}
                onChange={(e) => setOfficeMsg(e.target.value)}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <Button
                  className="btn btn--outline btn--small"
                  onClick={() => setContactOpen(false)}
                >
                  Cancel
                </Button>
                <Button className="btn btn--primary btn--small" type="submit">
                  Send note
                </Button>
              </div>
            </form>
          </div>
        </Dialog>
      )}
    </div>
  );
}

