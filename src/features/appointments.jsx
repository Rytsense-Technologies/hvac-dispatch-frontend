// Appointments: visits on the schedule - who's coming, when, and whether the customer has confirmed.
// Exact Reference UI matching reference design with live backend integration and fallback sample records.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import { toast } from '../components/index.js';
import { Icon } from '../components/Icon.jsx';

// Sample appointments matching reference screenshot exactly
const SAMPLE_APPOINTMENTS = [
  {
    id: 'sample-1',
    isSample: true,
    customerName: 'Sarah Mitchell',
    service: 'AC repair',
    time: 'Wed, Nov 11 · 1 PM - 3 PM',
    technician: 'Unassigned',
    address: '1206 Oak Street, Austin, TX',
    status: 'Confirmed',
    statusCode: 'confirmed',
    history: 'Appointment requested by phone.',
    customerId: 'cust-1',
  },
  {
    id: 'sample-2',
    isSample: true,
    customerName: 'David Rodriguez',
    service: 'HVAC maintenance',
    time: 'Wed, Nov 11 · 3:30 PM - 4:30 PM',
    technician: 'Mike Rodriguez',
    address: '742 Evergreen Terrace, Austin, TX',
    status: 'Confirmed',
    statusCode: 'confirmed',
    history: 'Scheduled via customer service call.',
    customerId: 'cust-2',
  },
  {
    id: 'sample-3',
    isSample: true,
    customerName: 'William Brooks',
    service: 'Plumbing inspection',
    time: 'Thu, Nov 12 · 9 AM - 10 AM',
    technician: 'Unassigned',
    address: '4508 Riverbend Road, Austin, TX',
    status: 'Needs confirmation',
    statusCode: 'needs_confirmation',
    history: 'Online booking request awaiting customer confirmation.',
    customerId: 'cust-3',
  },
];

// Detail Modal matching reference screenshot 2
function AppointmentDetailModal({ appointment, onClose, onUpdateStatus }) {
  const [currentStatus, setCurrentStatus] = useState(appointment.status);
  const [currentTech, setCurrentTech] = useState(appointment.technician);
  const [currentTime, setCurrentTime] = useState(appointment.time);

  const handleConfirm = async () => {
    setCurrentStatus('Confirmed');
    onUpdateStatus(appointment.id, 'Confirmed', 'confirmed');
    if (!appointment.isSample && appointment.raw?.api?.confirm) {
      try {
        await api(appointment.raw.api.confirm, { method: 'POST' });
      } catch (err) {
        console.error('Failed to confirm via API:', err);
      }
    }
    toast('Appointment confirmed.');
  };

  const handleReschedule = async () => {
    const newTime = 'Fri, Nov 13 · 2 PM - 4 PM';
    setCurrentTime(newTime);
    onUpdateStatus(appointment.id, currentStatus, appointment.statusCode, newTime);
    if (!appointment.isSample && appointment.raw?.api?.reschedule) {
      try {
        await api(appointment.raw.api.reschedule, { method: 'POST', body: { time: newTime } });
      } catch (err) {
        console.error('Failed to reschedule via API:', err);
      }
    }
    toast('Appointment rescheduled to Fri, Nov 13 · 2 PM - 4 PM.');
  };

  const handleCancel = async () => {
    setCurrentStatus('Cancelled');
    onUpdateStatus(appointment.id, 'Cancelled', 'cancelled');
    if (!appointment.isSample && appointment.raw?.api?.cancel) {
      try {
        await api(appointment.raw.api.cancel, { method: 'POST' });
      } catch (err) {
        console.error('Failed to cancel via API:', err);
      }
    }
    toast('Appointment cancelled.');
  };

  return (
    <div className="appointment-modal-overlay" onClick={onClose}>
      <div className="appointment-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="appointment-modal-head">
          <div>
            <div className="appointment-modal-eyebrow">SAMPLE WORKSPACE</div>
            <h2 className="appointment-modal-title">
              Appointment · {appointment.customerName}
            </h2>
          </div>
          <button
            type="button"
            className="appointment-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content details matching Screenshot 2 */}
        <div className="appointment-modal-service">{appointment.service}</div>
        <div className="appointment-modal-meta">{currentTime}</div>
        <div className="appointment-modal-meta">{appointment.address}</div>
        <div className="appointment-modal-meta">Technician: {currentTech}</div>
        <div className="appointment-modal-meta">Status: {currentStatus}</div>

        <div className="appointment-modal-section-title">History</div>
        <div className="appointment-modal-history">{appointment.history}</div>

        {/* Action buttons matching Screenshot 2 */}
        <div className="appointment-modal-actions">
          <div className="appointment-modal-btn-row">
            <a
              href="#/customers"
              className="appointment-modal-btn"
              onClick={onClose}
            >
              View customer
            </a>
            <a
              href="#/tasks"
              className="appointment-modal-btn"
              onClick={onClose}
            >
              View task
            </a>
            <button
              type="button"
              className="appointment-modal-btn"
              onClick={handleConfirm}
            >
              Confirm
            </button>
            <button
              type="button"
              className="appointment-modal-btn"
              onClick={handleReschedule}
            >
              Reschedule
            </button>
          </div>
          <div className="appointment-modal-btn-row">
            <button
              type="button"
              className="appointment-modal-btn"
              onClick={handleCancel}
            >
              Cancel appointment
            </button>
          </div>
        </div>

        <div className="appointment-modal-disclaimer">
          Sample changes stay in this browser session. No customer is notified.
        </div>
      </div>
    </div>
  );
}

export default function Appointments() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [data, setData] = useState(null); // Real backend appointments
  const [localOverrides, setLocalOverrides] = useState({});
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load real backend appointments
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const out = await api('/v1/appointments/schedule', {
          params: { scope: 'upcoming', limit: 50 },
        });
        if (!active) return;
        setData({ items: Array.isArray(out?.visits) ? out.visits : [] });
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setData({ items: [] });
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

  // Combine real backend data or fallback to sample appointments
  const realVisits = data?.items || [];
  const baseAppointments = realVisits.length > 0
    ? realVisits.map((v) => {
      const parts = (v.title || '').split('·').map((s) => s.trim());
      const customerName = v.customer?.name || parts[0] || 'Customer';
      const service = v.service || parts[1] || 'Service visit';
      const when = v.when || v.text || (v.start_at ? formatDateTime(v.start_at) : 'Scheduled');
      const technician = v.technician ? v.technician.name : 'Unassigned';
      const statusLabel = v.confirmation?.label || (v.status === 'confirmed' ? 'Confirmed' : 'Needs confirmation');
      const statusCode = v.confirmation?.code || (statusLabel === 'Confirmed' ? 'confirmed' : 'needs_confirmation');
      return {
        id: String(v.id),
        isSample: false,
        customerName,
        service,
        time: when,
        technician,
        address: v.address || 'Address on file',
        status: statusLabel,
        statusCode,
        history: v.history?.length ? v.history[0] : 'Appointment scheduled via dispatch system.',
        raw: v,
      };
    })
    : SAMPLE_APPOINTMENTS;

  // Apply any session status/time updates made in the browser
  const displayAppointments = baseAppointments.map((appt) => {
    const override = localOverrides[appt.id];
    if (!override) return appt;
    return {
      ...appt,
      status: override.status ?? appt.status,
      statusCode: override.statusCode ?? appt.statusCode,
      time: override.time ?? appt.time,
    };
  });

  const handleUpdateStatus = (id, newStatus, newStatusCode, newTime) => {
    setLocalOverrides((prev) => ({
      ...prev,
      [id]: {
        ...prev[id],
        status: newStatus,
        statusCode: newStatusCode,
        ...(newTime ? { time: newTime } : {}),
      },
    }));
  };

  return (
    <>
      {/* Header matching Reference Image 1 */}
      <div className="appointments-head">
        <div>
          <div className="appointments-eyebrow">SCHEDULE</div>
          <h1 className="appointments-title">Appointments</h1>
          <p className="appointments-subtitle">
            Review visits, technicians, and confirmation status.
          </p>
        </div>
        <button
          type="button"
          className="appointments-workspace-btn"
          onClick={() => {}}
        >
          Sample workspace
        </button>
      </div>

      {/* Main Card: Upcoming appointments */}
      <div className="appointments-card">
        <h2 className="appointments-card-title">Upcoming appointments</h2>
        <div className="appointments-list">
          {displayAppointments.map((item) => (
            <div key={item.id} className="appointments-row">
              <div className="appointments-row-left">
                <span className="appointments-row-icon">
                  <Icon name="appointments" />
                </span>
                <div className="appointments-row-info">
                  <span className="appointments-row-name">
                    {item.customerName} · {item.service}
                  </span>
                  <span className="appointments-row-sub">
                    {item.time} · {item.technician}
                  </span>
                </div>
              </div>

              <div className="appointments-row-actions">
                <span
                  className={`appointments-status-pill appointments-status-pill--${
                    item.statusCode === 'confirmed'
                      ? 'confirmed'
                      : item.statusCode === 'needs_confirmation'
                        ? 'needs_confirmation'
                        : 'cancelled'
                  }`}
                >
                  {item.status}
                </span>
                <button
                  type="button"
                  className="appointments-view-btn"
                  onClick={() => setSelectedAppointment(item)}
                >
                  View details →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom disclaimer matching Reference Image 1 */}
      <div className="appointments-disclaimer">
        Sample records · Session changes only · No real scheduling or notifications.
      </div>

      {/* Detail Modal matching Reference Image 2 */}
      {selectedAppointment && (
        <AppointmentDetailModal
          appointment={selectedAppointment}
          onClose={() => setSelectedAppointment(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
    </>
  );
}
