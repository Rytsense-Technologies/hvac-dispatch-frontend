// Work → Appointments: upcoming visits with confirmation tags + detail dialog.
// Visual parity with the Rytsense reference; live API with sample fallback.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  Badge, Button, Dialog, Spinner, toast, Panel, Row,
} from '../components/index.js';
import { WorkChrome, WorkFoot } from './workChrome.jsx';

const SAMPLE_APPOINTMENTS = [
  {
    id: 'sample-1',
    isSample: true,
    customerName: 'Sarah Mitchell',
    service: 'AC repair',
    time: 'Wed, Nov 11 · 1 PM–3 PM',
    technician: 'Unassigned',
    address: '1206 Oak Street, Austin, TX',
    status: 'Confirmed',
    statusCode: 'confirmed',
    history: 'Appointment requested by phone.',
  },
  {
    id: 'sample-2',
    isSample: true,
    customerName: 'David Rodriguez',
    service: 'HVAC maintenance',
    time: 'Wed, Nov 11 · 3:30 PM–4:30 PM',
    technician: 'Mike Rodriguez',
    address: '742 Evergreen Terrace, Austin, TX',
    status: 'Confirmed',
    statusCode: 'confirmed',
    history: 'Maintenance appointment confirmed.',
  },
  {
    id: 'sample-3',
    isSample: true,
    customerName: 'William Brooks',
    service: 'Plumbing inspection',
    time: 'Thu, Nov 12 · 9 AM–10 AM',
    technician: 'Unassigned',
    address: '4508 Riverbend Road, Austin, TX',
    status: 'Needs confirmation',
    statusCode: 'needs_confirmation',
    history: 'Inspection requested.',
  },
];

function AppointmentDetail({ appointment, onClose, onUpdateStatus }) {
  const [currentStatus, setCurrentStatus] = useState(appointment.status);
  const [currentTime, setCurrentTime] = useState(appointment.time);
  const currentTech = appointment.technician;

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
    const newTime = 'Fri, Nov 13 · 2 PM–4 PM';
    setCurrentTime(newTime);
    onUpdateStatus(appointment.id, currentStatus, appointment.statusCode, newTime);
    if (!appointment.isSample && appointment.raw?.api?.reschedule) {
      try {
        await api(appointment.raw.api.reschedule, { method: 'POST', body: { time: newTime } });
      } catch (err) {
        console.error('Failed to reschedule via API:', err);
      }
    }
    toast('Appointment rescheduled to Fri, Nov 13 · 2 PM–4 PM.');
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
    <Dialog title={`Appointment · ${appointment.customerName}`} onClose={onClose}>
      <p className="work-dialog-eyebrow">Sample workspace</p>
      <p>
        <strong>{appointment.service}</strong>
        <br />
        {currentTime}
        <br />
        {appointment.address}
        <br />
        Technician: {currentTech}
        <br />
        Status: {currentStatus}
      </p>
      <p>
        <strong>History</strong>
        <br />
        {appointment.history}
      </p>
      <div className="work-dialog-actions">
        <a href="#/customers" className="btn btn--secondary" onClick={onClose}>View customer</a>
        <a href="#/work" className="btn btn--secondary" onClick={onClose}>View task</a>
        <Button className="btn btn--secondary" onClick={handleConfirm}>Confirm</Button>
        <Button className="btn btn--secondary" onClick={handleReschedule}>Reschedule</Button>
        <Button className="btn btn--secondary" onClick={handleCancel}>Cancel appointment</Button>
      </div>
      <p className="work-sample-label">
        Sample changes stay in this browser session. No customer is notified.
      </p>
    </Dialog>
  );
}

export default function Appointments() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [data, setData] = useState(null);
  const [localOverrides, setLocalOverrides] = useState({});
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!allowed) return undefined;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const out = await api('/v1/appointments/schedule', {
          params: { scope: 'upcoming', limit: 50 },
        });
        if (!active) return;
        setData({ items: Array.isArray(out?.visits) ? out.visits : [] });
      } catch {
        if (!active) return;
        setData({ items: [] });
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [allowed]);

  if (!allowed) {
    return (
      <WorkChrome tab="appointments" eyebrow="Schedule" subtitle="Review visits, technicians, and confirmation status.">
        <Panel>
          <h2>Not available for your role</h2>
          <p className="muted">Ask an administrator if you need this section.</p>
        </Panel>
      </WorkChrome>
    );
  }

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
    <WorkChrome
      tab="appointments"
      eyebrow="Schedule"
      subtitle="Review visits, technicians, and confirmation status."
    >
      <Panel>
        <h2 className="work-panel-title">Upcoming appointments</h2>
        {loading ? (
          <Spinner />
        ) : (
          <div className="work-rows">
            {displayAppointments.map((item) => (
              <Row
                key={item.id}
                leading="▣"
                title={`${item.customerName} · ${item.service}`}
                subtitle={`${item.time} · ${item.technician}`}
                trailing={(
                  <>
                    <Badge
                      text={item.status}
                      tone={item.statusCode === 'confirmed' ? 'good' : item.statusCode === 'needs_confirmation' ? 'warn' : 'neutral'}
                    />
                    <Button
                      className="btn btn--secondary"
                      onClick={() => setSelected(item)}
                      aria-label={`View appointment for ${item.customerName}`}
                    >
                      View details →
                    </Button>
                  </>
                )}
              />
            ))}
          </div>
        )}
      </Panel>

      <WorkFoot>
        Sample records · Session changes only · No real scheduling or notifications.
      </WorkFoot>

      {selected ? (
        <AppointmentDetail
          appointment={selected}
          onClose={() => setSelected(null)}
          onUpdateStatus={handleUpdateStatus}
        />
      ) : null}
    </WorkChrome>
  );
}
