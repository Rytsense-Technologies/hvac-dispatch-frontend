// Nightly plan: prepares jobs for qualified requests and proposes a technician for each. It books nothing: a different person approves.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, addDays, todayIn, reasonText, short } from '../lib/format.js';
import { can } from '../lib/session.js';
import { PageHeader, Spinner, ErrorBox, Empty, Badge, Card, DataTable, ActionButton, useRun, toast } from '../components/index.js';

export function runLine(summary = {}) {
  const parts = [`${(summary.proposals || []).length} proposed`];
  if ((summary.unplaced || []).length) parts.push(`${summary.unplaced.length} could not be placed`);
  if ((summary.not_prepared || []).length) parts.push(`${summary.not_prepared.length} not ready`);
  if (summary.overflow) parts.push(`${summary.overflow} left for the next run`);
  return parts.join(', ');
}

function Result({ s }) {
  return (
    <section className="card stack" data-testid="plan-result">
      <h2>{`Plan for ${s.day}`}</h2>
      <p>{`${runLine(s)}. ${s.jobs_created} job(s) prepared from ${s.requests_considered} qualified request(s).`}</p>
      {s.engine ? <Badge text={s.engine === 'exact' ? 'Best plan' : 'Large-day planner'} tone="info" /> : null}
      {(s.unplaced || []).length ? <div><h3>Could not be placed</h3><ul>{s.unplaced.map((u, i) => <li key={i}>{`Job ${short(u.job_id)}: ${(u.reasons || []).map(reasonText).join(', ')}`}</li>)}</ul></div> : null}
      {(s.not_prepared || []).length ? <div><h3>Requests not ready to schedule</h3><ul>{s.not_prepared.map((n, i) => <li key={i}>{`Request ${n.request_id}: ${n.reason}`}</li>)}</ul></div> : null}
    </section>
  );
}

const APPROVE_TEXT = { off: 'a person approves every proposal', bookings: 'the system approves new bookings that pass its safety checks; a person approves moves', all: 'the system approves new bookings and the replacement of a late or unavailable technician' };

// Automatic dispatch: is it on, what has the system booked by itself, and which requests is it waiting on a person for.
function Automation({ reload }) {
  const [state, setState] = useState(null);
  const mounted = useRef(true);
  const draw = async () => {
    try {
      const s = await api('/v1/dispatch/auto/status');
      if (mounted.current) setState({ s });
    } catch (error) { if (mounted.current) setState({ error }); }
  };
  useEffect(() => { mounted.current = true; draw(); return () => { mounted.current = false; }; }, []);

  const runNow = async () => {
    const r = await api('/v1/dispatch/auto/run', { method: 'POST', body: {} });
    toast(`Checked ${r.considered} request(s): ${r.booked} booked, ${r.proposed} proposed, ${r.unplaced} need a person.`);
    reload(); await draw();
  };

  const s = state?.s;
  return (
    <section className="card stack" aria-label="Automatic dispatch">
      {state?.error ? <ErrorBox error={state.error} /> : null}
      {s ? (
        <>
          <div className="between"><h2>Automatic dispatch</h2><Badge text={s.assign ? 'On' : 'Off'} tone={s.assign ? 'good' : 'neutral'} /></div>
          <p className="muted">{s.assign
            ? `A saved call is picked up within about half a minute, the nearest qualified technician is worked out, and ${APPROVE_TEXT[s.approve]}.`
            : 'Off: a saved call waits for the nightly plan or a dispatcher. Turn it on in the server settings (DISPATCH_AUTO_ASSIGN).'}</p>
          {s.assign ? (
            <div className="row wrap"><Badge text={`${s.booked_by_system_24h} booked by the system in the last day`} tone="info" />
              <Badge text={`${s.proposals_waiting_for_a_person} proposal(s) waiting for a person`} tone={s.proposals_waiting_for_a_person ? 'warn' : 'neutral'} /></div>
          ) : null}
          {s.requests_it_could_not_place.length ? (
            <div><h3>Needs a person</h3>
              <ul>{s.requests_it_could_not_place.map((r, i) => <li key={i}>{`Request #${r.request_id}: ${r.reason}`}</li>)}</ul></div>
          ) : null}
          {s.assign && can('dispatcher', 'admin') ? <ActionButton className="btn btn--outline btn--small" action={runNow}>Run it now</ActionButton> : null}
        </>
      ) : null}
    </section>
  );
}

export default function Plan() {
  const [day, setDay] = useState(() => addDays(todayIn(), 1));
  const [outcome, setOutcome] = useState(null);
  const [runs, setRuns] = useState({ status: 'loading' });
  const [planning, setPlanning] = useState(false);
  const [busy, run] = useRun();
  const mounted = useRef(true);

  const loadRuns = async () => {
    try {
      const { runs: list } = await api('/v1/dispatch/planner/runs', { params: { limit: 20 } });
      if (mounted.current) setRuns({ status: 'ready', list });
    } catch (error) { if (mounted.current) setRuns({ status: 'error', error }); }
  };
  useEffect(() => { mounted.current = true; loadRuns(); return () => { mounted.current = false; }; }, []);

  const go = () => run(async () => {
    setPlanning(true);
    try {
      const summary = await api('/v1/dispatch/planner/run', { method: 'POST', body: { day } });
      if (mounted.current) setOutcome(summary);
      toast('Plan finished. Open Approvals to review the proposals.');
      loadRuns();
    } finally { if (mounted.current) setPlanning(false); }
  });

  let runsBody;
  if (runs.status === 'loading') runsBody = <Spinner />;
  else if (runs.status === 'error') runsBody = <ErrorBox error={runs.error} />;
  else if (runs.list.length) {
    runsBody = (
      <DataTable head={['Day', 'How', 'Status', 'Started', 'Result']} rows={runs.list.map((r) => [r.day, r.trigger === 'scheduled' ? 'Automatic' : `By ${r.started_by}`,
        <Badge text={r.status} tone={r.status === 'finished' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'} />, formatDateTime(r.started_at), r.error || runLine(r.summary)])} />
    );
  } else runsBody = <Empty text="The plan has not run yet." />;

  return (
    <>
      <PageHeader title="Nightly plan" subtitle="Prepares jobs for qualified requests and proposes a technician for each. It books nothing: a different person approves.">
        <input type="date" aria-label="Day to plan" min={todayIn()} value={day} onChange={(e) => setDay(e.target.value)} />
        <button type="button" className="btn btn--primary" disabled={busy} onClick={go}>{planning ? 'Planning…' : 'Run the plan now'}</button>
      </PageHeader>
      <div className="stack">
        <Automation reload={loadRuns} />
        {outcome ? <Result s={outcome} /> : null}
        <Card as="section"><Card.Title>Recent runs</Card.Title><div>{runsBody}</div></Card>
      </div>
    </>
  );
}
