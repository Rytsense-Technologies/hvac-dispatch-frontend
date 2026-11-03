// Reports: dispatch operational performance, intake volumes, proposals, violations, and technician utilization.
import { useEffect, useMemo, useRef, useState } from 'react';
import { percent, hours, addDays, todayIn, reasonText, formatDay } from '../lib/format.js';
import { PageHeader, Spinner, ErrorBox, DataTable, Card, Empty, Badge, StatGrid, Icon, StatusBadge } from '../components/index.js';
import { fetchSummary } from './dashboard.jsx';

export default function Reports() {
  const [range, setRange] = useState(() => ({ from: addDays(todayIn(), -6), to: todayIn() }));
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);

  useEffect(() => {
    latest.current += 1;
    const mine = latest.current;
    setState({ status: 'loading' });
    fetchSummary(range.from, range.to).then(
      (data) => {
        if (mine === latest.current) setState({ status: 'ready', data });
      },
      (error) => {
        if (mine === latest.current) setState({ status: 'error', error });
      },
    );
    return () => {
      latest.current += 1;
    };
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

  const setDaysPreset = (days) => {
    setRange({ from: addDays(todayIn(), -(days - 1)), to: todayIn() });
  };

  const setMonthPreset = () => {
    setRange({ from: `${todayIn().slice(0, 7)}-01`, to: todayIn() });
  };

  const isDaysPreset = (days) => {
    return range.to === todayIn() && range.from === addDays(todayIn(), -(days - 1));
  };

  const isMonthPreset = () => {
    return range.to === todayIn() && range.from === `${todayIn().slice(0, 7)}-01`;
  };

  const d = state.data;

  const kpiItems = useMemo(() => {
    if (!d) return [];
    const waiting = Object.values(d.proposals || {}).reduce((sum, p) => sum + (p.pending || 0), 0);
    const totalApproved = Object.values(d.proposals || {}).reduce((sum, p) => sum + (p.executed || 0), 0);
    const totalProposals = Object.values(d.proposals || {}).reduce((sum, p) => sum + (p.total || 0), 0);

    return [
      [
        'Total Booked Jobs',
        String(d.jobs.total),
        `${d.jobs.by_progress?.completed || 0} completed · ${d.jobs.arrived || 0} arrived`,
        'jobs',
      ],
      [
        'On-Time Arrival',
        percent(d.jobs.on_time_share),
        `${percent(d.jobs.inside_window_share)} within promised window`,
        'tracking',
      ],
      [
        'Requests Demand',
        String(d.requests.total),
        `${percent(d.requests.booked_share)} converted to bookings`,
        'requests',
      ],
      [
        'Proposal Approval',
        totalProposals ? percent(totalApproved / totalProposals) : '—',
        `${waiting} awaiting review`,
        'approvals',
      ],
      [
        'Open Violations',
        String(d.problems.still_open),
        `${d.problems.opened} detected in date range`,
        'attention',
      ],
    ];
  }, [d]);

  let body;
  if (state.status === 'loading') {
    body = <Spinner />;
  } else if (state.status === 'error') {
    body = <ErrorBox error={state.error} />;
  } else if (d) {
    const proposalsEntries = Object.entries(d.proposals || {});
    const problemEntries = Object.entries(d.problems?.by_reason || {});
    const requestStatusEntries = Object.entries(d.requests?.by_status || {});

    body = (
      <>
        <StatGrid items={kpiItems} />

        <Card as="section">
          <div className="between" style={{ alignItems: 'center', marginBottom: '8px' }}>
            <Card.Title>Jobs & Dispatch Punctuality</Card.Title>
            <div className="row" style={{ gap: '8px' }}>
              <Badge text={`${d.jobs.total} Total Booked`} tone="info" />
              <Badge text={`${percent(d.jobs.on_time_share)} On-Time`} tone={d.jobs.on_time_share >= 0.85 ? 'good' : 'warn'} />
            </div>
          </div>
          <div className="reports-stat-row">
            <div className="reports-mini-card">
              <span className="reports-mini-label">Booked Jobs</span>
              <span className="reports-mini-val">{d.jobs.total}</span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Jobs Completed</span>
              <span className="reports-mini-val">{d.jobs.by_progress?.completed || 0}</span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Arrived On Site</span>
              <span className="reports-mini-val">{d.jobs.arrived}</span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">On-Time Share</span>
              <span className="reports-mini-val" style={{ color: d.jobs.on_time_share >= 0.85 ? 'var(--good-600)' : 'var(--warn-600)' }}>
                {percent(d.jobs.on_time_share)}
              </span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Inside Window</span>
              <span className="reports-mini-val">{percent(d.jobs.inside_window_share)}</span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Avg Delay</span>
              <span className="reports-mini-val" style={{ fontSize: '1.05rem' }}>
                {d.jobs.average_minutes_late !== null && d.jobs.average_minutes_late !== undefined
                  ? `${d.jobs.average_minutes_late} min late`
                  : 'On schedule'}
              </span>
            </div>
          </div>
        </Card>

        <Card as="section">
          <div className="between" style={{ alignItems: 'center', marginBottom: '8px' }}>
            <Card.Title>Service Requests Intake & Status</Card.Title>
            <div className="row" style={{ gap: '8px' }}>
              <Badge text={`${d.requests.total} Requests`} tone="neutral" />
              {d.requests.emergencies > 0 ? (
                <Badge text={`${d.requests.emergencies} Emergency`} tone="warn" />
              ) : null}
              <Badge text={`${percent(d.requests.booked_share)} Booked`} tone="good" />
            </div>
          </div>

          <div className="reports-stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Total Ingested</span>
              <span className="reports-mini-val">{d.requests.total}</span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Emergency Escalations</span>
              <span className="reports-mini-val" style={{ color: d.requests.emergencies ? 'var(--warn-600)' : 'inherit' }}>
                {d.requests.emergencies}
              </span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Booking Conversion</span>
              <span className="reports-mini-val">{percent(d.requests.booked_share)}</span>
            </div>
          </div>

          {requestStatusEntries.length > 0 ? (
            <div style={{ marginTop: '16px' }}>
              <small className="muted" style={{ display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.74rem' }}>
                Distribution by Status
              </small>
              <div className="reports-status-chips">
                {requestStatusEntries.map(([statusKey, count]) => (
                  <div key={statusKey} className="reports-status-card">
                    <StatusBadge status={statusKey} />
                    <span className="reports-status-count">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>

        <Card as="section">
          <Card.Title>Dispatch Proposals Pipeline</Card.Title>
          {proposalsEntries.length ? (
            <DataTable
              label="Proposals breakdown"
              head={['Origin / Channel', 'Total Generated', 'Approved', 'Rejected', 'Expired', 'Awaiting Decision', 'Approval Share']}
              rows={proposalsEntries.map(([source, c]) => [
                <span key={`src-${source}`} style={{ textTransform: 'capitalize', fontWeight: 'var(--font-weight-medium)' }}>
                  {source.replaceAll('_', ' ')}
                </span>,
                String(c.total),
                <Badge key={`app-${source}`} text={String(c.executed || 0)} tone="good" />,
                <Badge key={`rej-${source}`} text={String(c.rejected || 0)} tone={c.rejected ? 'bad' : 'neutral'} />,
                <Badge key={`exp-${source}`} text={String(c.expired || 0)} tone="neutral" />,
                <Badge key={`pend-${source}`} text={String(c.pending || 0)} tone={c.pending ? 'warn' : 'neutral'} />,
                percent(c.total ? (c.executed || 0) / c.total : 0),
              ])}
            />
          ) : (
            <Empty text="No proposals generated in this period." />
          )}
        </Card>

        <Card as="section">
          <div className="between" style={{ alignItems: 'center', marginBottom: '8px' }}>
            <Card.Title>Operational Problems & Violations</Card.Title>
            <div className="row" style={{ gap: '8px' }}>
              <Badge text={`${d.problems.opened} Detected`} tone="neutral" />
              <Badge text={`${d.problems.still_open} Open`} tone={d.problems.still_open ? 'bad' : 'good'} />
            </div>
          </div>

          <div className="reports-stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' }}>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Violations Detected</span>
              <span className="reports-mini-val">{d.problems.opened}</span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Unresolved / Open</span>
              <span className="reports-mini-val" style={{ color: d.problems.still_open ? 'var(--danger-600)' : 'var(--good-600)' }}>
                {d.problems.still_open}
              </span>
            </div>
            <div className="reports-mini-card">
              <span className="reports-mini-label">Resolved</span>
              <span className="reports-mini-val">{Math.max(0, d.problems.opened - d.problems.still_open)}</span>
            </div>
          </div>

          {problemEntries.length ? (
            <div style={{ marginTop: '16px' }}>
              <small className="muted" style={{ display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.74rem' }}>
                Reasons Breakdown
              </small>
              <div className="reports-problems-grid">
                {problemEntries.map(([reason, count]) => (
                  <div key={reason} className="reports-problem-item">
                    <span className="reports-problem-label">
                      <Icon name="attention" />
                      {reasonText(reason)}
                    </span>
                    <Badge text={`${count} occurrence${count === 1 ? '' : 's'}`} tone="warn" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '12px' }}>
              <Empty text="No problem categories reported in this date range." />
            </div>
          )}
        </Card>

        <Card as="section">
          <div className="between" style={{ alignItems: 'center', marginBottom: '8px' }}>
            <Card.Title>Technician Roster & Utilization</Card.Title>
            <Badge text={`${d.technicians?.length || 0} Technicians`} tone="neutral" />
          </div>
          {d.technicians && d.technicians.length ? (
            <DataTable
              label="Technician performance"
              head={['Technician', 'Total Jobs', 'Completed', 'Available', 'Booked', 'Utilization', 'On-Time Rate']}
              rows={d.technicians.map((t) => [
                <span key={`tech-${t.name}`} style={{ fontWeight: 'var(--font-weight-medium)' }}>
                  {t.name}
                </span>,
                String(t.jobs),
                String(t.completed),
                `${hours(t.available_minutes)} h`,
                `${hours(t.booked_minutes)} h`,
                <Badge
                  key={`util-${t.name}`}
                  text={percent(t.utilisation)}
                  tone={t.utilisation >= 0.75 ? 'good' : t.utilisation < 0.4 ? 'neutral' : 'info'}
                />,
                <Badge
                  key={`ontime-${t.name}`}
                  text={percent(t.on_time_share)}
                  tone={t.on_time_share >= 0.85 ? 'good' : 'warn'}
                />,
              ])}
            />
          ) : (
            <Empty text="No technicians recorded in this period." />
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        subtitle={`Operational dispatch metrics, job punctuality, and technician throughput from ${formatDay(range.from)} to ${formatDay(range.to)}.`}
      >
        <div className="reports-toolbar">
          <div className="reports-presets" role="group" aria-label="Date range presets">
            <button
              type="button"
              className={`reports-preset-btn ${isDaysPreset(7) ? 'reports-preset-btn--active' : ''}`}
              onClick={() => setDaysPreset(7)}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`reports-preset-btn ${isDaysPreset(30) ? 'reports-preset-btn--active' : ''}`}
              onClick={() => setDaysPreset(30)}
            >
              30 Days
            </button>
            <button
              type="button"
              className={`reports-preset-btn ${isMonthPreset() ? 'reports-preset-btn--active' : ''}`}
              onClick={setMonthPreset}
            >
              This Month
            </button>
            <button
              type="button"
              className={`reports-preset-btn ${isDaysPreset(90) ? 'reports-preset-btn--active' : ''}`}
              onClick={() => setDaysPreset(90)}
            >
              90 Days
            </button>
          </div>

          <div className="reports-dates">
            <label className="reports-date-label">
              <span>From</span>
              <input
                type="date"
                className="reports-date-input"
                aria-label="From date"
                value={range.from}
                onChange={change('from')}
              />
            </label>
            <span className="reports-date-sep">→</span>
            <label className="reports-date-label">
              <span>To</span>
              <input
                type="date"
                className="reports-date-input"
                aria-label="To date"
                value={range.to}
                onChange={change('to')}
              />
            </label>
          </div>

          <a
            className="btn btn--outline"
            download=""
            href={`/v1/dispatch/reports/jobs.csv?from=${range.from}&to=${range.to}`}
            title="Download CSV spreadsheet of booked jobs in this period"
          >
            Download Jobs (CSV)
          </a>
        </div>
      </PageHeader>

      <div className="stack">{body}</div>
    </>
  );
}
