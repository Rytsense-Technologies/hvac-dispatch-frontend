// Technicians: who can be sent, with what skills and in which areas, and the days they work.
// Admins add people and set shifts; dispatchers can mark someone unavailable (preview first, then ask for approval).
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  todayIn, formatDateTime, reasonText, parseList, buildShifts, shiftProblems, WEEKDAYS,
} from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  Badge, Spinner, Empty, ErrorBox, PageHeader, DataTable, Field, Overlay, ActionButton, toast, useRun,
} from '../lib/ui.jsx';

const ProblemsBox = ({ list }) => <ul className="note note--bad" role="alert" hidden={!list.length}>{list.map((p, i) => <li key={i}>{p}</li>)}</ul>;

// The shift fields shared by "add" and "set shifts": first day, how many days, which weekdays, start and end.
const newShifts = () => ({ from: todayIn(), days: '14', start: '08:00', end: '17:00', checked: Object.fromEntries(WEEKDAYS.map(([value]) => [value, value >= 1 && value <= 5])) });

const readShifts = (s) => ({ from: s.from, days: Number(s.days), start: s.start, end: s.end, weekdays: WEEKDAYS.filter(([value]) => s.checked[value]).map(([value]) => value) });

function ShiftFields({ value, onChange }) {
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

function AddDialog({ reload, onClose }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', lat: '', lon: '', skills: 'hvac', areas: '' });
  const [shifts, setShifts] = useState(newShifts);
  const [problems, setProblems] = useState([]);
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    const lat = Number(f.lat);
    const lon = Number(f.lon);
    const found = [
      ...(f.name.trim() ? [] : ["Enter the technician's name."]),
      ...(f.lat.trim() !== '' && Number.isFinite(lat) && lat >= -90 && lat <= 90 ? [] : ['Latitude must be a number between -90 and 90.']),
      ...(f.lon.trim() !== '' && Number.isFinite(lon) && lon >= -180 && lon <= 180 ? [] : ['Longitude must be a number between -180 and 180.']),
      ...(parseList(f.skills, true).length ? [] : ['Enter at least one skill.']),
      ...(parseList(f.areas).length ? [] : ['Enter at least one service area.']),
      ...shiftProblems(readShifts(shifts)),
    ];
    setProblems(found);
    if (found.length) return;
    run(async () => {
      await api('/v1/dispatch/technicians', { method: 'POST', body: {
        name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, base_latitude: lat, base_longitude: lon,
        skills: parseList(f.skills, true), credentials: [], service_areas: parseList(f.areas), shifts: buildShifts(readShifts(shifts)),
      } });
      toast(`${f.name.trim()} added.`);
      onClose();
      reload();
    });
  };
  return (
    <Overlay title="Add a technician" wide onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <div className="grid2">
          <Field label="Name"><input type="text" {...bind('name')} /></Field>
          <Field label="Phone" hint="Texted when a job is booked for them"><input type="text" {...bind('phone')} /></Field>
          <Field label="Email (Google account)" hint="Their own calendar of visits is shared with this address"><input type="email" {...bind('email')} /></Field>
          <Field label="Home or depot latitude" hint="Where their day starts and ends"><input type="text" inputMode="decimal" {...bind('lat')} /></Field>
          <Field label="Home or depot longitude"><input type="text" inputMode="decimal" {...bind('lon')} /></Field>
          <Field label="Skills" hint="Comma separated, e.g. hvac, plumbing"><input type="text" {...bind('skills')} /></Field>
          <Field label="Service areas" hint="Comma separated codes from your company file, e.g. SC"><input type="text" {...bind('areas')} /></Field>
        </div>
        <ShiftFields value={shifts} onChange={setShifts} />
        <ProblemsBox list={problems} />
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Add technician</button></div>
      </form>
    </Overlay>
  );
}

function ContactDialog({ tech, reload, onClose }) {
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

function ShiftsDialog({ tech, reload, onClose }) {
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
function UnavailableDialog({ tech, reload, onClose }) {
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
            <div className="card stack" data-testid="unavailable-preview">
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
            </div>
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

export default function Technicians() {
  const [state, setState] = useState({ status: 'loading' });
  const [dialog, setDialog] = useState(null);
  const seq = useRef(0);

  const load = async () => {
    seq.current += 1;
    const mine = seq.current;
    setState({ status: 'loading' });
    try {
      const { technicians: list } = await api('/v1/dispatch/technicians');
      if (mine === seq.current) setState({ status: 'ready', list });
    } catch (error) {
      if (mine === seq.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { seq.current += 1; }; }, []);

  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (!state.list.length) body = <Empty text="No technicians yet. Add the first one to start scheduling." />;
  else {
    body = (
      <DataTable head={['Name', 'Status', 'Skills', 'Areas', 'Upcoming shift days', '']} rows={state.list.map((t) => [
        <span>
          <strong>{t.name}</strong>
          {t.phone ? <small className="block muted">{t.phone}</small> : null}
          {t.email ? <small className="block muted">{`${t.email}${t.has_calendar ? ' (calendar shared)' : ''}`}</small> : null}
        </span>,
        <Badge text={t.available ? 'Available' : 'Unavailable'} tone={t.available ? 'good' : 'bad'} />,
        <span className="row wrap">{t.skills.map((s, i) => <Badge key={i} text={s} tone="info" />)}</span>,
        t.service_areas.join(', ') || '-',
        t.shift_dates.length ? `${t.shift_dates.length} (next ${t.shift_dates[0]})` : 'None',
        <span className="row">
          {can('admin') ? <button type="button" className="btn btn--outline btn--small" onClick={() => setDialog({ kind: 'contact', tech: t })}>Contact</button> : null}
          {can('admin') ? <button type="button" className="btn btn--outline btn--small" onClick={() => setDialog({ kind: 'shifts', tech: t })}>Set shifts</button> : null}
          {can('dispatcher', 'admin') ? <button type="button" className="btn btn--ghost btn--small" onClick={() => setDialog({ kind: 'unavailable', tech: t })}>Mark unavailable</button> : null}
        </span>,
      ])} />
    );
  }

  const close = () => setDialog(null);
  return (
    <>
      <PageHeader title="Technicians" subtitle="Who can be sent, with what skills and in which areas, and the days they work.">
        {can('admin') ? <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'add' })}>Add technician</button> : null}
      </PageHeader>
      <div>{body}</div>
      {dialog?.kind === 'add' ? <AddDialog reload={load} onClose={close} /> : null}
      {dialog?.kind === 'contact' ? <ContactDialog tech={dialog.tech} reload={load} onClose={close} /> : null}
      {dialog?.kind === 'shifts' ? <ShiftsDialog tech={dialog.tech} reload={load} onClose={close} /> : null}
      {dialog?.kind === 'unavailable' ? <UnavailableDialog tech={dialog.tech} reload={load} onClose={close} /> : null}
    </>
  );
}
