// The technician building blocks used by the Users page (features/users.jsx): the working-days fields and the dialogs to change a technician's
// contact, set shifts, or mark them unavailable (preview first, then ask for approval). Adding a technician, with their sign-in, is on the Users page.
import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  todayIn, formatDateTime, reasonText, buildShifts, shiftProblems, WEEKDAYS,
} from '../lib/format.js';
import {
  Field, Overlay, ActionButton, toast, useRun, Card,
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
