// Technician portal (/tech): the signed-in technician's own day, from the technician-only APIs
// (/v1/tech/*). These never see another technician's jobs - a wrong id just 404s.
import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, formatTime, formatDay, leaveRangeText, summarizeLeaveResult } from '../lib/format.js';
import { toast, Dialog, Button, ActionButton, Spinner, Note } from '../components/index.js';

const EMPTY_LEAVE_FORM = { date: '', from_time: '', to_time: '', reason: '' };

const ACTION_LABELS = {
  en_route: 'On the way',
  arrived: 'Arrived',
  in_progress: 'Start job',
  completed: 'Mark complete',
};

const STATUS_BADGE_TONE = {
  completed: 'completed',
  cancelled: 'completed',
  in_progress: 'progress',
  en_route: 'progress',
  arrived: 'progress',
};

function actionCode(action) {
  if (typeof action === 'string') return action;
  return action?.code || action?.event || action?.action || '';
}

function actionLabel(action) {
  if (action && typeof action === 'object' && action.label) return action.label;
  const code = actionCode(action);
  return ACTION_LABELS[code] || String(code).replaceAll('_', ' ');
}

function jobWindowText(job) {
  if (job.when) return job.when;
  if (job.window_start && job.window_end) return `${formatDateTime(job.window_start)} – ${formatTime(job.window_end)}`;
  if (job.scheduled_at) return formatDateTime(job.scheduled_at);
  return 'Time not set';
}

function isUrgentPriority(priority) {
  return /urgent|emergency/i.test(String(priority || ''));
}

function priorityLabel(priority) {
  if (!priority) return 'Standard priority';
  const text = String(priority).replaceAll('_', ' ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} priority`;
}

function blockerText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.reason || value.text || value.note || JSON.stringify(value);
}

function mapsHref(job) {
  if (job.latitude != null && job.longitude != null) return `https://maps.google.com/?q=${job.latitude},${job.longitude}`;
  if (job.address) return `https://maps.google.com/?q=${encodeURIComponent(job.address)}`;
  return null;
}

// Best-effort, short-timeout location for a progress update. Resolves to null rather than
// rejecting, so a denied/unavailable location never blocks sending the progress event itself.
function getPositionQuick() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy_meters: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 5000 }
    );
  });
}

export default function TechPortal() {
  const [today, setToday] = useState({ status: 'loading', data: null, error: null });
  const [onDuty, setOnDuty] = useState(null);
  const [workStatus, setWorkStatus] = useState(null);

  const [activeJobId, setActiveJobId] = useState(null);
  const [jobDetail, setJobDetail] = useState({ status: 'idle' });
  const [noteInput, setNoteInput] = useState('');
  const [actionBusy, setActionBusy] = useState(null);
  const detailSeq = useRef(0);

  const [contactOpen, setContactOpen] = useState(false);
  const [officeMsg, setOfficeMsg] = useState('');

  const [leave, setLeave] = useState([]);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState(EMPTY_LEAVE_FORM);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);

  const loadToday = async () => {
    setToday((s) => ({ ...s, status: 'loading' }));
    try {
      const data = await api('/v1/tech/today');
      setToday({ status: 'ready', data, error: null });
      if (typeof data?.on_duty === 'boolean') setOnDuty(data.on_duty);
      if (data?.work_status) setWorkStatus(data.work_status);
    } catch (error) {
      setToday({ status: 'error', data: null, error });
    }
  };

  useEffect(() => {
    loadToday();
  }, []);

  const loadLeave = async () => {
    try {
      const res = await api('/v1/tech/leave');
      setLeave(Array.isArray(res?.leave) ? res.leave : []);
    } catch {
      // Leave not available yet; list just stays empty.
    }
  };

  useEffect(() => {
    loadLeave();
  }, []);

  // Report live location while actually working, so the office map shows where this technician is.
  const isWorkingNow = workStatus ? workStatus.working_now : !!onDuty;
  useEffect(() => {
    if (!isWorkingNow || !('geolocation' in navigator)) return undefined;

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
  }, [isWorkingNow]);

  const toggleDuty = async () => {
    const next = !onDuty;
    try {
      const res = await api('/v1/tech/duty', { method: 'POST', body: { on_duty: next } });
      setOnDuty(typeof res?.on_duty === 'boolean' ? res.on_duty : next);
      if (res?.work_status) setWorkStatus(res.work_status);
      toast(`Status: ${next ? 'On duty' : 'Off duty'}`);
    } catch (error) {
      toast(error.message, 'bad');
    }
  };

  const fetchJobDetail = async (id) => {
    const mine = (detailSeq.current += 1);
    setJobDetail({ status: 'loading' });
    try {
      const data = await api(`/v1/tech/jobs/${id}`);
      if (mine === detailSeq.current) setJobDetail({ status: 'ready', data });
    } catch (error) {
      if (mine === detailSeq.current) setJobDetail({ status: 'error', error });
    }
  };

  const openJob = (job) => {
    setNoteInput('');
    setActiveJobId(job.id);
    fetchJobDetail(job.id);
  };

  const closeJobDialog = () => {
    setActiveJobId(null);
    setJobDetail({ status: 'idle' });
    setNoteInput('');
  };

  const handleAction = async (action) => {
    if (!activeJobId) return;
    const code = actionCode(action);
    setActionBusy(code);
    try {
      const pos = await getPositionQuick();
      const body = { event: code };
      if (pos) {
        body.latitude = pos.latitude;
        body.longitude = pos.longitude;
        body.accuracy_meters = pos.accuracy_meters;
      }
      const note = noteInput.trim();
      if (note) body.note = note;
      await api(`/v1/tech/jobs/${activeJobId}/progress`, { method: 'POST', body });
      toast(`${actionLabel(action)} saved.`);
      setNoteInput('');
      await fetchJobDetail(activeJobId);
      loadToday();
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      setActionBusy(null);
    }
  };

  const handleSendOfficeNote = (e) => {
    e.preventDefault();
    if (!officeMsg.trim()) return;
    toast('Note sent to dispatch office.');
    setOfficeMsg('');
    setContactOpen(false);
  };

  const handleSubmitLeave = async (e) => {
    e.preventDefault();
    if (!leaveForm.date) {
      toast('Pick a date.', 'bad');
      return;
    }
    if ((leaveForm.from_time && !leaveForm.to_time) || (!leaveForm.from_time && leaveForm.to_time)) {
      toast('Give both a start and end time, or leave both blank for the whole day.', 'bad');
      return;
    }
    setLeaveSubmitting(true);
    try {
      const body = { date: leaveForm.date, reason: leaveForm.reason.trim() };
      if (leaveForm.from_time && leaveForm.to_time) {
        body.from_time = leaveForm.from_time;
        body.to_time = leaveForm.to_time;
      }
      const res = await api('/v1/tech/leave', { method: 'POST', body });
      if (res?.leave) setLeave((prev) => [...prev, res.leave].sort((a, b) => (a.date > b.date ? 1 : -1)));
      else await loadLeave();
      const summary = summarizeLeaveResult(res);
      toast(summary ? `Leave saved. ${summary}.` : 'Leave saved.');
      setLeaveForm(EMPTY_LEAVE_FORM);
      setLeaveOpen(false);
      loadToday();
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      setLeaveSubmitting(false);
    }
  };

  const handleCancelLeave = async (leaveId) => {
    await api(`/v1/tech/leave/${leaveId}`, { method: 'DELETE' });
    setLeave((prev) => prev.filter((l) => l.id !== leaveId));
    toast('Leave cancelled.');
    loadToday();
  };

  const data = today.data;
  const jobs = data?.jobs || [];
  const glance = data?.glance || {};
  const beforeYouLeave = data?.before_you_leave || [];

  return (
    <div className="tech-container">
      <div className="tech-head">
        <div>
          <div className="tech-eyebrow">{data?.date_text || ''}</div>
          <h1 className="tech-title">{today.status === 'loading' ? 'Loading your day…' : (data?.greeting || 'Your day')}</h1>
          <p className="tech-subtitle">{data?.subtitle || ''}</p>
        </div>
        {today.status === 'ready' ? (
          <div className="tech-duty-wrap">
            <button
              type="button"
              className={`tech-duty-badge${
                workStatus?.state === 'on_leave' ? ' tech-duty-badge--leave' : !onDuty ? ' tech-duty-badge--off' : ''
              }`}
              onClick={toggleDuty}
              title="Click to toggle your duty switch"
              style={{ cursor: 'pointer' }}
            >
              {workStatus?.label || (onDuty ? 'On duty' : 'Off duty')}
            </button>
            {workStatus?.text ? <span className="tech-duty-sub">{workStatus.text}</span> : null}
          </div>
        ) : null}
      </div>

      {today.status === 'error' ? (
        <div className="tech-widget-card">
          <Note tone="bad" text={today.error.message} />
          <Button className="btn btn--primary btn--small" onClick={loadToday}>Retry</Button>
        </div>
      ) : (
        <div className="tech-grid">
          {/* Left Column: Today's Jobs */}
          <div>
            <h2 className="tech-section-title">Today’s jobs</h2>

            {today.status === 'loading' ? <Spinner /> : null}
            {today.status === 'ready' && jobs.length === 0 ? (
              <p className="muted">No jobs today.</p>
            ) : null}

            {jobs.map((job) => (
              <div key={job.id} className="tech-job-card">
                <div className="tech-job-head">
                  <span className="tech-job-eyebrow">{job.code} · ASSIGNED TO YOU</span>
                  <span className={`tech-job-badge tech-job-badge--${STATUS_BADGE_TONE[job.status?.code] || 'scheduled'}`}>
                    {job.status?.label || job.status?.code || '—'}
                  </span>
                </div>

                <div className="tech-job-title">{job.title}</div>
                <div className="tech-job-customer">{job.customer_name}</div>
                <div className="tech-job-address">{job.address}</div>

                <div className="tech-job-meta">
                  <span className="tech-job-time">{jobWindowText(job)}</span>
                  <span className={`tech-job-priority ${isUrgentPriority(job.priority) ? 'tech-job-priority--urgent' : ''}`}>
                    {priorityLabel(job.priority)}
                  </span>
                </div>

                {job.blocker ? (
                  <div className="tech-blocker-box">
                    Blocker reported · {blockerText(job.blocker)}
                  </div>
                ) : null}

                <button type="button" className="tech-view-btn" onClick={() => openJob(job)}>
                  View job
                </button>
              </div>
            ))}
          </div>

          {/* Right Column: Today at a glance, Time off, Before you leave */}
          <div>
            <div className="tech-widget-card">
              <h3 className="tech-widget-title">Today at a glance</h3>
              <div className="tech-glance-grid">
                <div className="tech-glance-item">
                  <span className="tech-glance-num">{glance.assigned ?? jobs.length}</span>
                  <span className="tech-glance-label">Assigned</span>
                </div>
                <div className="tech-glance-item">
                  <span className="tech-glance-num">{glance.completed ?? 0}</span>
                  <span className="tech-glance-label">Completed</span>
                </div>
                {glance.blocked !== undefined ? (
                  <div className="tech-glance-item">
                    <span className="tech-glance-num">{glance.blocked}</span>
                    <span className="tech-glance-label">Blocked</span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="tech-widget-card">
              <h3 className="tech-widget-title">Time off</h3>
              {leave.length === 0 ? (
                <p style={{ fontSize: '0.82rem', color: '#64748b', margin: '0 0 12px 0' }}>No upcoming leave.</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: '0 0 12px 0', padding: 0 }}>
                  {leave.map((l) => (
                    <li
                      key={l.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '8px 0',
                        borderBottom: '1px solid #f1f5f9',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: '#0f172a' }}>
                          {formatDay(l.date)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          {leaveRangeText(l)}
                          {l.reason ? ` · ${l.reason}` : ''}
                        </div>
                      </div>
                      <ActionButton className="btn btn--outline btn--small" action={() => handleCancelLeave(l.id)}>
                        Cancel
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              )}
              <button type="button" className="tech-contact-link" onClick={() => setLeaveOpen(true)}>
                Request leave
              </button>
            </div>

            <div className="tech-widget-card">
              <h3 className="tech-widget-title">Before you leave</h3>
              {beforeYouLeave.length ? (
                <ul className="tech-checklist">
                  {beforeYouLeave.map((item, i) => (
                    <li key={i} className="tech-checklist-item">• {typeof item === 'string' ? item : item.text || item.label}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Nothing flagged.</p>
              )}
              <button type="button" className="tech-contact-link" onClick={() => setContactOpen(true)}>
                Contact office
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Job Modal */}
      {activeJobId && (
        <Dialog
          title={jobDetail.data ? `${jobDetail.data.code} · ${jobDetail.data.title}` : 'Job'}
          onClose={closeJobDialog}
        >
          <div style={{ padding: '4px 0' }}>
            {jobDetail.status === 'loading' ? <Spinner /> : null}
            {jobDetail.status === 'error' ? (
              <div className="stack">
                <Note tone="bad" text={jobDetail.error.message} />
                <Button className="btn btn--outline btn--small" onClick={() => fetchJobDetail(activeJobId)}>Retry</Button>
              </div>
            ) : null}

            {jobDetail.status === 'ready' ? (
              <>
                <div className="tech-dialog-row">
                  <span className="tech-dialog-label">Customer</span>
                  <span className="tech-dialog-value">{jobDetail.data.customer_name}</span>
                </div>
                <div className="tech-dialog-row">
                  <span className="tech-dialog-label">Phone</span>
                  <span className="tech-dialog-value">
                    {jobDetail.data.customer_phone ? (
                      <a href={`tel:${jobDetail.data.customer_phone}`} style={{ color: '#0284c7', textDecoration: 'none' }}>
                        {jobDetail.data.customer_phone}
                      </a>
                    ) : '—'}
                  </span>
                </div>
                <div className="tech-dialog-row">
                  <span className="tech-dialog-label">Address</span>
                  <span className="tech-dialog-value">
                    {jobDetail.data.address || '—'}{' '}
                    {mapsHref(jobDetail.data) ? (
                      <a
                        href={mapsHref(jobDetail.data)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#0284c7', marginLeft: 6, fontSize: '0.8rem' }}
                      >
                        (Directions)
                      </a>
                    ) : null}
                  </span>
                </div>
                <div className="tech-dialog-row">
                  <span className="tech-dialog-label">Window</span>
                  <span className="tech-dialog-value">{jobWindowText(jobDetail.data)}</span>
                </div>
                <div className="tech-dialog-row">
                  <span className="tech-dialog-label">Priority</span>
                  <span className={`tech-dialog-value ${isUrgentPriority(jobDetail.data.priority) ? 'tech-job-priority--urgent' : ''}`}>
                    {priorityLabel(jobDetail.data.priority)}
                  </span>
                </div>
                <div className="tech-dialog-row">
                  <span className="tech-dialog-label">Current status</span>
                  <span className="tech-dialog-value">{jobDetail.data.status?.label || jobDetail.data.status?.code || '—'}</span>
                </div>

                {jobDetail.data.description || jobDetail.data.service_notes ? (
                  <div style={{ margin: '14px 0', borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
                    <div className="tech-dialog-label" style={{ marginBottom: 4 }}>Service Notes</div>
                    {jobDetail.data.description ? (
                      <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>{jobDetail.data.description}</p>
                    ) : null}
                    {jobDetail.data.service_notes ? (
                      <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#334155', lineHeight: 1.5 }}>{jobDetail.data.service_notes}</p>
                    ) : null}
                    {jobDetail.data.notes_count ? (
                      <p className="muted small" style={{ marginTop: 6 }}>{jobDetail.data.notes_count} note{jobDetail.data.notes_count === 1 ? '' : 's'} on file.</p>
                    ) : null}
                  </div>
                ) : null}

                {Array.isArray(jobDetail.data.steps) && jobDetail.data.steps.length ? (
                  <div style={{ margin: '14px 0' }}>
                    <div className="tech-dialog-label" style={{ marginBottom: 4 }}>Steps</div>
                    <ul className="tech-checklist">
                      {jobDetail.data.steps.map((step, i) => (
                        <li key={i} className="tech-checklist-item">
                          • {typeof step === 'string' ? step : step.text || step.label || step.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {jobDetail.data.blocker ? (
                  <div className="tech-blocker-box" style={{ margin: '12px 0' }}>
                    <strong>Blocker reported:</strong> {blockerText(jobDetail.data.blocker)}
                  </div>
                ) : null}

                <div style={{ margin: '14px 0' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                    Add a note (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Waiting for capacitor, customer not home..."
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div className="tech-dialog-actions">
                  {(jobDetail.data.actions || []).map((action) => {
                    const code = actionCode(action);
                    return (
                      <Button
                        key={code}
                        className={`btn btn--small ${code === 'completed' ? 'btn--primary' : 'btn--secondary'}`}
                        disabled={actionBusy !== null}
                        onClick={() => handleAction(action)}
                      >
                        {actionBusy === code ? 'Saving…' : actionLabel(action)}
                      </Button>
                    );
                  })}
                  {!jobDetail.data.actions?.length ? (
                    <p className="muted small">No actions available for this job right now.</p>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>
        </Dialog>
      )}

      {/* Request Leave Modal */}
      {leaveOpen && (
        <Dialog title="Request leave" onClose={() => setLeaveOpen(false)}>
          <form onSubmit={handleSubmitLeave}>
            <div style={{ padding: '4px 0' }}>
              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Date
              </label>
              <input
                type="date"
                value={leaveForm.date}
                onChange={(e) => setLeaveForm((f) => ({ ...f, date: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 4,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.82rem',
                  marginBottom: 12,
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                    From (optional)
                  </label>
                  <input
                    type="time"
                    value={leaveForm.from_time}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, from_time: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                    To (optional)
                  </label>
                  <input
                    type="time"
                    value={leaveForm.to_time}
                    onChange={(e) => setLeaveForm((f) => ({ ...f, to_time: e.target.value }))}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 4,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '0 0 12px 0' }}>
                Leave both times blank for the whole working day. Give both times or neither.
              </p>

              <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Reason
              </label>
              <input
                type="text"
                maxLength={200}
                placeholder="e.g. Dentist appointment"
                value={leaveForm.reason}
                onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
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

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <Button
                  className="btn btn--outline btn--small"
                  onClick={() => {
                    setLeaveOpen(false);
                    setLeaveForm(EMPTY_LEAVE_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button className="btn btn--primary btn--small" type="submit" disabled={leaveSubmitting}>
                  {leaveSubmitting ? 'Saving…' : 'Submit leave'}
                </Button>
              </div>
            </div>
          </form>
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
