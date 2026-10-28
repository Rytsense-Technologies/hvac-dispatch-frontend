// Reports: the same numbers as the dashboard in full, plus a spreadsheet download of the booked jobs. No customer details.
import { useEffect, useRef, useState } from 'react';
import { percent, addDays, todayIn, reasonText } from '../lib/format.js';
import { PageHeader, Spinner, ErrorBox, DataTable, Card, Empty } from '../components/index.js';
import { fetchSummary, technicianTable } from './dashboard.jsx';

export default function Reports() {
  const [range, setRange] = useState(() => ({ from: addDays(todayIn(), -6), to: todayIn() }));
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
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else {
    const d = state.data;
    body = (
      <>
        <Card as="section"><Card.Title>Jobs and punctuality</Card.Title>
          <DataTable head={['Booked jobs', 'Done', 'Arrived', 'On time', 'Inside window', 'Avg minutes late']}
            rows={[[d.jobs.total, d.jobs.by_progress.completed, d.jobs.arrived, percent(d.jobs.on_time_share), percent(d.jobs.inside_window_share), d.jobs.average_minutes_late ?? '-']]} />
        </Card>
        <Card as="section"><Card.Title>Requests</Card.Title>
          <DataTable head={['Requests', 'Emergencies (people handle)', 'Booked share', 'By status']}
            rows={[[d.requests.total, d.requests.emergencies, percent(d.requests.booked_share), Object.entries(d.requests.by_status).map(([k, v]) => `${k} ${v}`).join(', ') || '-']]} />
        </Card>
        <Card as="section"><Card.Title>Proposals</Card.Title>
          {Object.keys(d.proposals).length
            ? <DataTable head={['From', 'Total', 'Approved', 'Rejected', 'Expired', 'Waiting']} rows={Object.entries(d.proposals).map(([source, c]) => [source, c.total, c.executed || 0, c.rejected || 0, c.expired || 0, c.pending || 0])} />
            : <Empty text="No proposals in this period." />}
        </Card>
        <Card as="section"><Card.Title>Problems found</Card.Title>
          <DataTable head={['Found', 'Still open', 'Reasons']}
            rows={[[d.problems.opened, d.problems.still_open, Object.entries(d.problems.by_reason).map(([k, v]) => `${reasonText(k)} ${v}`).join(', ') || '-']]} />
        </Card>
        <Card as="section"><Card.Title>Technicians</Card.Title>{technicianTable(d.technicians)}</Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Reports" subtitle="How the dispatcher is doing. No customer details.">
        <label className="inline">From<input type="date" aria-label="From" value={range.from} onChange={change('from')} /></label>
        <label className="inline">To<input type="date" aria-label="To" value={range.to} onChange={change('to')} /></label>
        <a className="btn btn--outline" download="" href={`/v1/dispatch/reports/jobs.csv?from=${range.from}&to=${range.to}`}>Download the jobs (CSV)</a>
      </PageHeader>
      <div className="stack">{body}</div>
    </>
  );
}
