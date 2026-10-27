// Find a technician for a job: the dispatcher calculates the feasible options, a person picks one and says why, and it goes to
// Approvals. Nothing is booked here: a DIFFERENT person approves it, and the system checks it again then.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, formatTime, reasonText } from '../lib/format.js';
import { can } from '../lib/session.js';
import { ActionButton, ErrorBox, Field, Note, Spinner, toast } from '../lib/ui.jsx';

export async function technicianNames() {
  const { technicians } = await api('/v1/dispatch/technicians');
  return Object.fromEntries(technicians.map((t) => [t.id, t.name]));
}

// <ScheduleFlow jobId onDone /> (was scheduleFlow(jobId, onDone), which returned a DOM node)
export function ScheduleFlow({ jobId, onDone }) {
  const [state, setState] = useState({ phase: 'loading' });
  const [chosen, setChosen] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let current = true;
    setState({ phase: 'loading' });
    (async () => {
      try {
        const [options, names] = await Promise.all([api(`/v1/dispatch/jobs/${jobId}/available-windows`), technicianNames()]);
        const mine = (options.assignments || []).filter((a) => a.job_id === jobId);
        const why = ((options.rejected || []).find((r) => r.job_id === jobId) || {}).reasons || [];
        if (current) setState({ phase: 'ready', mine, why, names });
      } catch (error) {
        if (current) setState({ phase: 'error', error });
      }
    })();
    return () => { current = false; };
  }, [jobId]);

  if (state.phase === 'loading') return <div className="stack"><Spinner text="Working out who can take this job…" /></div>;
  if (state.phase === 'error') return <div className="stack"><ErrorBox error={state.error} /></div>;
  const { mine, why, names } = state;
  if (!mine.length) {
    return (
      <div className="stack">
        <div className="note note--warn" role="status">
          <strong>No technician can take this job.</strong>
          {why.length ? <p>{`${why.map(reasonText).join(', ')}.`}</p> : null}
          <p>Add shifts or widen the arrival windows, then try again.</p>
        </div>
      </div>
    );
  }
  const submit = (
    <ActionButton
      className="btn btn--primary"
      disabled={chosen === null || !reason.trim()}
      action={async () => {
        const option = mine[chosen];
        await api(`/v1/dispatch/jobs/${jobId}/assign`, { method: 'POST', body: { technician_id: option.technician_id, arrival: option.arrival, reason: reason.trim() } });
        toast('Approval requested. A different person must approve it.');
        if (onDone) onDone();
      }}
    >Request approval</ActionButton>
  );
  return (
    <div className="stack">
      <fieldset className="stack">
        <legend>Choose a technician and arrival time</legend>
        {mine.map((option, index) => (
          <label className="choice" key={index}>
            <input type="radio" name="option" checked={chosen === index} onChange={() => setChosen(index)} />
            <span>
              <strong>{names[option.technician_id] || option.technician_id}</strong>
              <small className="block muted">{`arrives ${formatDateTime(option.arrival)}, finishes about ${formatTime(option.completion)}`}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Why this option (required)"><textarea maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {can('dispatcher', 'admin') ? submit : <Note text="Your role can look at options but not request them." />}
    </div>
  );
}
