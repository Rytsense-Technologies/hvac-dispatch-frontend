// Tracking: booked versus what really happened on one day. Who is on the way, who has arrived, who is late.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { percent, todayIn, addDays, formatTime, lateness, PROGRESS } from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import { PageHeader, Spinner, ErrorBox, Empty, Badge, ProgressBadge, ArrivalBadge, DataTable, Button } from '../lib/ui.jsx';

export default function Tracking() {
  const [day, setDay] = useState(todayIn);
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);
  const dayRef = useRef(day);
  dayRef.current = day;

  const load = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    const current = dayRef.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const [summary, list] = await Promise.all([api('/v1/dispatch/tracking/summary', { params: { date: current } }), api('/v1/dispatch/jobs', { params: { date: current, limit: 500 } })]);
      const jobs = (list.jobs || []).filter((j) => j.status !== 'pending').sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
      if (mine === latest.current) setState({ status: 'ready', summary, jobs });
    } catch (error) {
      if (mine === latest.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { latest.current += 1; }; }, [day]);
  useEvery(() => load(true), 30000);

  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else {
    const { summary, jobs } = state;
    body = (
      <>
        <div className="cards">
          {Object.entries(PROGRESS).filter(([key]) => key in summary.by_progress).map(([key, [label]]) => <div className="card stat" key={key}><h3>{label}</h3><p className="stat__value">{summary.by_progress[key]}</p></div>)}
          <div className="card stat"><h3>Average lateness</h3><p className="stat__value">{summary.average_minutes_late === null ? '-' : `${summary.average_minutes_late} min`}</p></div>
          <div className="card stat"><h3>{`On time (within ${summary.grace_minutes} min)`}</h3><p className="stat__value">{percent(summary.on_time_share)}</p></div>
        </div>
        <section className="card"><h2>Visits</h2>
          {jobs.length ? (
            <DataTable head={['Technician', 'Customer', 'Planned', 'Progress', 'On the way', 'Arrived', 'Finished', 'Against plan']}
              rows={jobs.map((j) => [<strong>{j.technician_name || '-'}</strong>, j.customer_name || '-', formatTime(j.scheduled_at), <ProgressBadge progress={j.progress} />,
                formatTime(j.en_route_at), formatTime(j.arrived_at), formatTime(j.completed_at),
                j.arrived_at ? <span className="row wrap"><Badge text={lateness(j.minutes_late)} tone={j.within_window === false || j.minutes_late > summary.grace_minutes ? 'bad' : 'good'} /><ArrivalBadge check={j.arrival_check} metres={j.arrival_distance_meters} /></span> : '-'])} />
          ) : <Empty text="No booked visits on this day." />}
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tracking" subtitle="Booked against actual, updated as technicians report in">
        <Button className="btn btn--ghost" aria-label="Previous day" onClick={() => setDay((d) => addDays(d, -1))}>‹</Button>
        <input type="date" aria-label="Day" value={day} onChange={(e) => { if (e.target.value) setDay(e.target.value); }} />
        <Button className="btn btn--ghost" aria-label="Next day" onClick={() => setDay((d) => addDays(d, 1))}>›</Button>
        <Button className="btn btn--ghost" onClick={() => setDay(todayIn())}>Today</Button>
      </PageHeader>
      <div className="stack">{body}</div>
    </>
  );
}
