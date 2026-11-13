// Technician building blocks used by Team & dispatch and Accounts (/team/users): working-days fields and dialogs to change
// contact, set shifts, or mark unavailable (preview first, then ask for approval). Adding a technician with sign-in is on Team / Accounts.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  todayIn, formatDateTime, formatDay, reasonText, buildShifts, shiftProblems, WEEKDAYS,
  leaveRangeText, summarizeLeaveResult,
} from '../lib/format.js';
import {
  Field, Overlay, ActionButton, Button, toast, useRun, Card,
} from '../components/index.js';

export const ProblemsBox = ({ list }) => <ul className="note note--bad" role="alert" hidden={!list.length}>{list.map((p, i) => <li key={i}>{p}</li>)}</ul>;

// The shift fields shared by "add" and "set shifts": first day, how many days, which weekdays, start and end.
export const newShifts = () => ({ from: todayIn(), days: '14', start: '08:00', end: '17:00', checked: Object.fromEntries(WEEKDAYS.map(([value]) => [value, value >= 1 && value <= 5])) });

export const readShifts = (s) => ({ from: s.from, days: Number(s.days), start: s.start, end: s.end, weekdays: WEEKDAYS.filter(([value]) => s.checked[value]).map(([value]) => value) });

export function ShiftFields({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <fieldset className="stack"><legend>Working days</legend>
      <div className="grid2">
        <Field label="First day"><input type="date" value={value.from} onChange={(e) => set({ from: e.target.value })} /></Field>
        <Field label="Number of days" hint="At most 60"><input type="number" min={1} max={60} value={value.days} onChange={(e) => set({ days: e.target.value })} /></Field>
        <Field label="Starts"><input type="time" value={value.start} onChange={(e) => set({ start: e.target.value })} /></Field>
        <Field label="Ends"><input type="time" value={value.end} onChange={(e) => set({ end: e.target.value })} /></Field>
      </div>
      <div className="row wrap">
        {WEEKDAYS.map(([day, label]) => (
          <label className="check" key={day}>
            <input type="checkbox" checked={value.checked[day]} onChange={(e) => set({ checked: { ...value.checked, [day]: e.target.checked } })} />{label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ContactDialog({ tech, reload, onClose }) {
  const [phone, setPhone] = useState(tech.phone || '');
  const [email, setEmail] = useState(tech.email || '');
  const [busy, run] = useRun();
  const submit = (event) => {
    event.preventDefault();
    const address = email.trim();
    if (address && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) { toast('That email address does not look right.', 'bad'); return; }
    run(async () => {
      await api(`/v1/dispatch/technicians/${tech.id}/contact`, { method: 'POST', body: { phone: phone.trim() || null, email: address || null } });
      toast('Saved.');
      onClose();
      reload();
    });
  };
  return (
    <Overlay title={`Contact: ${tech.name}`} onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <p className="muted">The phone is texted when a job is booked for them. The email is the Google account their own calendar of visits is shared with; a new address gets a new calendar with the next booking.</p>
        <div className="grid2">
          <Field label="Phone" hint="With country code, e.g. +18035550142"><input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          <Field label="Email (Google account)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </div>
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Save</button></div>
      </form>
    </Overlay>
  );
}

export function ShiftsDialog({ tech, reload, onClose }) {
  const [shifts, setShifts] = useState(newShifts);
  const [problems, setProblems] = useState([]);
  const [busy, run] = useRun();
  const submit = (event) => {
    event.preventDefault();
    const found = shiftProblems(readShifts(shifts));
    setProblems(found);
    if (found.length) return;
    run(async () => {
      const r = await api(`/v1/dispatch/technicians/${tech.id}/shifts`, { method: 'POST', body: { shifts: buildShifts(readShifts(shifts)) } });
      toast(`${r.dates_saved} day(s) saved for ${tech.name}.`);
      onClose();
      reload();
    });
  };
  return (
    <Overlay title={`Set shifts: ${tech.name}`} onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <p className="muted">These days are added or replaced. A day that already has booked jobs is refused, and changes to it go through an approved schedule change.</p>
        <ShiftFields value={shifts} onChange={setShifts} />
        <ProblemsBox list={problems} />
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Save shifts</button></div>
      </form>
    </Overlay>
  );
}

// First SEE which booked jobs would move and where, then ask for approval.
// Team People "Time off" uses the same flow (alias keeps the dispatch CTA name clear).
export function TimeOffDialog(props) {
  return <UnavailableDialog {...props} />;
}

export function UnavailableDialog({ tech, reload, onClose }) {
  const [date, setDate] = useState(todayIn);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const [canAsk, setCanAsk] = useState(false);
  const [lookBusy, runLook] = useRun();
  const seq = useRef(0);
  const minDay = useRef(todayIn()).current;
  const send = (requestApproval) => api(`/v1/dispatch/technicians/${tech.id}/unavailable`, { method: 'POST', body: { date, reason: reason.trim(), request_approval: requestApproval } });
  const changeDate = (value) => { seq.current += 1; setDate(value); setPreview(null); setCanAsk(false); };
  const look = () => {
    if (!reason.trim() || !date) { toast('Enter a day and a reason.', 'warn'); return; }
    runLook(async () => {
      const mine = seq.current;
      const [result, { jobs }] = await Promise.all([send(false), api('/v1/dispatch/jobs', { params: { date, limit: 500 } })]);
      if (mine !== seq.current) return;
      const byId = Object.fromEntries(jobs.map((j) => [j.id, j]));
      const affected = (result.affected_jobs || []).length;
      const blocked = (result.rejected || []).length > 0;
      setPreview({ result, byId, affected, blocked });
      setCanAsk(!blocked);
    });
  };
  return (
    <Overlay title={`${tech.name} unavailable`} wide onClose={onClose}>
      <div className="stack">
        <div className="grid2">
          <Field label="Day"><input type="date" value={date} min={minDay} onChange={(e) => changeDate(e.target.value)} /></Field>
          <Field label="Reason"><input type="text" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </div>
        <button type="button" className="btn btn--outline" disabled={lookBusy} onClick={look}>See what would change</button>
        <div>
          {preview ? (
            <Card className="stack" data-testid="unavailable-preview">
              {preview.affected === 0 ? <p>No booked jobs on that day, so nothing needs to move.</p> : (
                <>
                  <p><strong>{`${preview.affected} booked job(s) would move:`}</strong></p>
                  <ul>
                    {(preview.result.assignments || []).map((a, i) => (
                      <li key={i}>{`${preview.byId[a.job_id]?.service_type || 'Job'}${preview.byId[a.job_id]?.customer_name ? ` for ${preview.byId[a.job_id].customer_name}` : ''} → technician ${a.technician_id.slice(0, 6)}… at ${formatDateTime(a.arrival)}`}</li>
                    ))}
                  </ul>
                  {preview.blocked ? <p className="note note--warn" role="alert">{`Some jobs cannot be moved safely (${preview.result.rejected.map((r) => (r.reasons || []).map(reasonText).join(', ')).join('; ')}). A person has to handle those; nothing will be queued.`}</p> : null}
                </>
              )}
            </Card>
          ) : null}
        </div>
        <div className="right">
          <ActionButton className="btn btn--primary" disabled={!canAsk} action={async () => {
            await send(true);
            toast('Approval requested. A different person must approve it.');
            onClose();
            reload();
          }}>Ask for approval</ActionButton>
        </div>
      </div>
    </Overlay>
  );
}

// Dispatcher-side leave: separate from UnavailableDialog (no preview/approval step — the leave API
// moves jobs or flags them as needs_staff immediately, same as the technician's own /tech/leave).
export function RecordLeaveDialog({ tech, reload, onClose }) {
  const [leave, setLeave] = useState([]);
  const [leaveStatus, setLeaveStatus] = useState('loading');
  const [date, setDate] = useState(todayIn);
  const [fromTime, setFromTime] = useState('');
  const [toTime, setToTime] = useState('');
  const [reason, setReason] = useState('');
  const [busy, run] = useRun();
  const minDay = useRef(todayIn()).current;

  const load = async () => {
    setLeaveStatus('loading');
    try {
      const res = await api(`/v1/dispatch/technicians/${tech.id}/leave`);
      setLeave(Array.isArray(res?.leave) ? res.leave : []);
      setLeaveStatus('ready');
    } catch {
      setLeaveStatus('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!date) { toast('Pick a date.', 'warn'); return; }
    if (Boolean(fromTime) !== Boolean(toTime)) { toast('Give both a start and end time, or leave both blank for the whole day.', 'warn'); return; }
    run(async () => {
      const body = { date, reason: reason.trim() };
      if (fromTime && toTime) { body.from_time = fromTime; body.to_time = toTime; }
      const res = await api(`/v1/dispatch/technicians/${tech.id}/leave`, { method: 'POST', body });
      const summary = summarizeLeaveResult(res);
      toast(summary ? `Leave recorded. ${summary}.` : 'Leave recorded.');
      setDate(todayIn());
      setFromTime('');
      setToTime('');
      setReason('');
      await load();
      reload();
    });
  };

  const cancelLeave = async (leaveId) => {
    await api(`/v1/dispatch/technicians/${tech.id}/leave/${leaveId}`, { method: 'DELETE' });
    setLeave((prev) => prev.filter((l) => l.id !== leaveId));
    toast('Leave cancelled.');
    reload();
  };

  return (
    <Overlay title={`Record leave: ${tech.name}`} wide onClose={onClose}>
      <div className="stack">
        <p className="muted">
          Nobody is planned onto this time. A job already booked in it moves automatically to the next
          best available technician, or stays flagged for the office to place.
        </p>

        <form className="stack" noValidate onSubmit={submit}>
          <div className="grid2">
            <Field label="Date"><input type="date" value={date} min={minDay} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Reason" hint="Optional, up to 200 characters">
              <input type="text" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Field label="From (optional)"><input type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} /></Field>
            <Field label="To (optional)"><input type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} /></Field>
          </div>
          <p className="muted small">Leave both times blank for the whole working day. Give both times or neither.</p>
          <div className="right">
            <button type="submit" className="btn btn--primary" disabled={busy}>Record leave</button>
          </div>
        </form>

        <div>
          <h4 style={{ margin: '8px 0' }}>Upcoming leave</h4>
          {leaveStatus === 'loading' ? <p className="muted">Loading…</p> : null}
          {leaveStatus === 'error' ? <p className="note note--bad" role="alert">Could not load upcoming leave.</p> : null}
          {leaveStatus === 'ready' && !leave.length ? <p className="muted">No upcoming leave.</p> : null}
          {leaveStatus === 'ready' && leave.length ? (
            <ul className="plain">
              {leave.map((l) => (
                <li key={l.id} className="row-item">
                  <span className="rowmain">
                    <strong>{formatDay(l.date)}</strong>
                    <small className="muted">{leaveRangeText(l)}{l.reason ? ` · ${l.reason}` : ''}</small>
                  </span>
                  <Button className="btn btn--outline btn--small" onClick={() => cancelLeave(l.id)}>Cancel</Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </Overlay>
  );
}
