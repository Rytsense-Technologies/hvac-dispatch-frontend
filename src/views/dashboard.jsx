// Dashboard: how dispatch is doing over a period, as a few big numbers and one table per technician.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { percent, hours, addDays, todayIn, reasonText } from '../lib/format.js';
import { PageHeader, Spinner, ErrorBox, DataTable } from '../lib/ui.jsx';

export const fetchSummary = (from, to) => api('/v1/dispatch/reports/summary', { params: { from, to } });

export function cards(summary) {
  const waiting = Object.values(summary.proposals || {}).reduce((sum, p) => sum + (p.pending || 0), 0);
  return [
    ['Booked jobs', summary.jobs.total], ['Done', summary.jobs.by_progress.completed],
    ['On time', percent(summary.jobs.on_time_share)], ['Inside promised window', percent(summary.jobs.inside_window_share)],
    ['Requests', summary.requests.total], ['Emergencies (people handle)', summary.requests.emergencies],
    ['Requests booked', percent(summary.requests.booked_share)], ['Proposals waiting', waiting], ['Problems still open', summary.problems.still_open],
  ];
}

export function technicianTable(rows) {
  if (!rows.length) return <p className="empty">No technicians set up yet.</p>;
  return (
    <DataTable head={['Technician', 'Jobs', 'Done', 'Available (h)', 'Booked (h)', 'Busy', 'On time']}
      rows={rows.map((t) => [<strong>{t.name}</strong>, t.jobs, t.completed, hours(t.available_minutes), hours(t.booked_minutes), percent(t.utilisation), percent(t.on_time_share)])} />
  );
}

export default function Dashboard() {
  // A week back to a week ahead: visits are booked ahead, so a range that stops at today would hide them.
  const [range, setRange] = useState(() => ({ from: addDays(todayIn(), -7), to: addDays(todayIn(), 7) }));
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);

  useEffect(() => {
    latest.current += 1;
    const mine = latest.current;
    setState({ status: 'loading' });
    fetchSummary(range.from, range.to).then(
      (data) => { if (mine === latest.current) setState({ status: 'ready', data }); },
      (error) => { if (mine === latest.current) setState({ status: 'error', error }); },
    );
    return () => { latest.current += 1; };
  }, [range]);

  const change = (key) => (e) => {
    const value = e.target.value;
    if (!value) return;
    setRange((r) => {
      const next = { ...r, [key]: value };
      if (next.from > next.to) next[key === 'from' ? 'to' : 'from'] = value;
      return next;
    });
  };

  let body;
  if (state.status === 'loading') body = <Spinner text="Loading the numbers…" />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else {
    const data = state.data;
    body = (
      <>
        <div className="cards">{cards(data).map(([label, value]) => <div className="card stat" key={label}><h3>{label}</h3><p className="stat__value">{value}</p></div>)}</div>
        <section className="card"><h2>Technicians</h2>{technicianTable(data.technicians)}</section>
        <section className="card"><h2>Problems found</h2>
          <p>{`${data.problems.opened} found, ${data.problems.still_open} still open. `}{Object.entries(data.problems.by_reason).map(([k, v]) => `${reasonText(k)} ${v}`).join(', ')}</p>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="How dispatch is doing over the period">
        <label className="inline">From<input type="date" aria-label="From" value={range.from} onChange={change('from')} /></label>
        <label className="inline">To<input type="date" aria-label="To" value={range.to} onChange={change('to')} /></label>
      </PageHeader>
      <div className="stack">{body}</div>
    </>
  );
}
