// Nightly plan: prepares jobs for qualified requests and proposes a technician for each. It books nothing: a different person approves.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, formatDay, addDays, todayIn, reasonText, short } from '../lib/format.js';
import { can } from '../lib/session.js';
import { PageHeader, Spinner, ErrorBox, Empty, Badge, Card, DataTable, ActionButton, useRun, toast, StatGrid, Icon } from '../components/index.js';

export function runLine(summary = {}) {
  const parts = [`${(summary.proposals || []).length} proposed`];
  if ((summary.unplaced || []).length) parts.push(`${summary.unplaced.length} could not be placed`);
  if ((summary.not_prepared || []).length) parts.push(`${summary.not_prepared.length} not ready`);
  if (summary.overflow) parts.push(`${summary.overflow} left for the next run`);
  return parts.join(', ');
}

function Result({ s, onClose }) {
  const unplacedCount = (s.unplaced || []).length;
  const notReadyCount = (s.not_prepared || []).length;
  const proposalsCount = (s.proposals || []).length;

  return (
    <section className="card plan-result-card stack" data-testid="plan-result">
      <div className="plan-result-hero">
        <div className="plan-result-title">
          <Badge text={s.engine === 'exact' ? 'Best plan (Exact)' : 'Large-day planner'} tone="info" />
          <h2>{`Plan Outcome for ${formatDay(s.day)} (${s.day})`}</h2>
          <Badge text="Plan Completed" tone="good" />
        </div>
        <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
          <a href="#/approvals" className="btn btn--primary btn--small">
            Open Approvals Queue →
          </a>
          {onClose ? (
            <button type="button" className="btn btn--ghost btn--small" onClick={onClose} aria-label="Dismiss result">
              ✕
            </button>
          ) : null}
        </div>
      </div>

      <div className="plan-result-metrics">
        <div className="plan-result-metric-item">
          <span className="plan-result-metric-label">Proposals Generated</span>
          <span className="plan-result-metric-val">{proposalsCount}</span>
        </div>
        <div className="plan-result-metric-item">
          <span className="plan-result-metric-label">Jobs Prepared</span>
          <span className="plan-result-metric-val">{s.jobs_created || 0}</span>
        </div>
        <div className="plan-result-metric-item">
          <span className="plan-result-metric-label">Requests Considered</span>
          <span className="plan-result-metric-val">{s.requests_considered || 0}</span>
        </div>
        <div className="plan-result-metric-item">
          <span className="plan-result-metric-label">Unplaced</span>
          <span className="plan-result-metric-val" style={{ color: unplacedCount ? 'var(--warn-600)' : 'inherit' }}>
            {unplacedCount}
          </span>
        </div>
        <div className="plan-result-metric-item">
          <span className="plan-result-metric-label">Not Ready</span>
          <span className="plan-result-metric-val" style={{ color: notReadyCount ? 'var(--muted)' : 'inherit' }}>
            {notReadyCount}
          </span>
        </div>
      </div>

      {unplacedCount === 0 && notReadyCount === 0 ? (
        <div className="note note--good">
          All qualified requests were assigned technician proposals with zero unplaced conflicts. Proposals are now waiting in Approvals for human confirmation.
        </div>
      ) : null}

      <div className="plan-issues-grid">
        {unplacedCount ? (
          <div className="plan-issue-card plan-issue-card--warn">
            <h3>
              <Icon name="attention" />
              {`Could Not Be Placed (${unplacedCount})`}
            </h3>
            <ul className="plan-issue-list">
              {s.unplaced.map((u, i) => (
                <li key={i} className="plan-issue-item">
                  <span className="plan-id-pill">{`Job ${short(u.job_id)}`}</span>
                  <span>{(u.reasons || []).map(reasonText).join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {notReadyCount ? (
          <div className="plan-issue-card">
            <h3>
              <Icon name="requests" />
              {`Requests Not Ready to Schedule (${notReadyCount})`}
            </h3>
            <ul className="plan-issue-list">
              {s.not_prepared.map((n, i) => (
                <li key={i} className="plan-issue-item">
                  <span className="plan-id-pill">{`Req #${n.request_id}`}</span>
                  <span>{n.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {s.overflow ? (
        <small className="muted">{`${s.overflow} request(s) held over for next planner sweep.`}</small>
      ) : null}
    </section>
  );
}

const APPROVE_TEXT = {
  off: 'a person approves every proposal',
  bookings: 'the system approves new bookings that pass its safety checks; a person approves moves',
  all: 'the system approves new bookings and the replacement of a late or unavailable technician'
};

// Automatic dispatch: is it on, what has the system booked by itself, and which requests is it waiting on a person for.
function Automation({ reload, autoStatus, onReload }) {
  const runNow = async () => {
    const r = await api('/v1/dispatch/auto/run', { method: 'POST', body: {} });
    toast(`Checked ${r.considered} request(s): ${r.booked} booked, ${r.proposed} proposed, ${r.unplaced} need a person.`);
    reload();
    onReload();
  };

  const s = autoStatus?.s;
  return (
    <section className="card stack" aria-label="Automatic dispatch">
      {autoStatus?.error ? <ErrorBox error={autoStatus.error} /> : null}
      {s ? (
        <>
          <div className="between" style={{ alignItems: 'center' }}>
            <div className="row" style={{ alignItems: 'center', gap: '10px' }}>
              <h2>Automatic Dispatch Engine</h2>
              <Badge text={s.assign ? 'Live Auto-Assignment' : 'Manual Dispatch Mode'} tone={s.assign ? 'good' : 'neutral'} />
            </div>
            {s.assign && can('dispatcher', 'admin') ? (
              <ActionButton className="btn btn--outline btn--small" action={runNow}>
                ⚡ Run real-time sweep now
              </ActionButton>
            ) : null}
          </div>

          <div className="plan-auto-banner">
            <p className="muted" style={{ margin: 0, color: 'var(--text)' }}>
              {s.assign
                ? `A saved call is picked up within about half a minute, the nearest qualified technician is worked out, and ${APPROVE_TEXT[s.approve]}.`
                : 'Off: a saved call waits for the nightly plan or a dispatcher. Turn it on in the server settings (DISPATCH_AUTO_ASSIGN).'}
            </p>
            {s.assign ? (
              <div className="plan-auto-stats">
                <Badge text={`${s.booked_by_system_24h} booked by system in 24h`} tone="info" />
                <Badge
                  text={`${s.proposals_waiting_for_a_person} proposal(s) waiting for a person`}
                  tone={s.proposals_waiting_for_a_person ? 'warn' : 'neutral'}
                />
                <Badge text={`Policy: ${s.approve}`} tone="neutral" />
              </div>
            ) : null}
          </div>

          {s.requests_it_could_not_place && s.requests_it_could_not_place.length ? (
            <div className="plan-attention-box">
              <h3>
                <Icon name="attention" />
                {`Needs a Person (${s.requests_it_could_not_place.length} requests require manual review)`}
              </h3>
              <ul className="plan-issue-list">
                {s.requests_it_could_not_place.map((r, i) => (
                  <li key={i} className="plan-issue-item">
                    <span className="plan-id-pill">{`Request #${r.request_id}`}</span>
                    <span>{r.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default function Plan() {
  const tomorrow = useMemo(() => addDays(todayIn(), 1), []);
  const today = useMemo(() => todayIn(), []);
  const in2Days = useMemo(() => addDays(todayIn(), 2), []);

  const [day, setDay] = useState(tomorrow);
  const [outcome, setOutcome] = useState(null);
  const [runs, setRuns] = useState({ status: 'loading' });
  const [autoStatus, setAutoStatus] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [busy, run] = useRun();
  const mounted = useRef(true);

  const loadRuns = useCallback(async () => {
    try {
      const { runs: list } = await api('/v1/dispatch/planner/runs', { params: { limit: 20 } });
      if (mounted.current) setRuns({ status: 'ready', list });
    } catch (error) {
      if (mounted.current) setRuns({ status: 'error', error });
    }
  }, []);

  const loadAutoStatus = useCallback(async () => {
    try {
      const s = await api('/v1/dispatch/auto/status');
      if (mounted.current) setAutoStatus({ s });
    } catch (error) {
      if (mounted.current) setAutoStatus({ error });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    loadRuns();
    loadAutoStatus();
    return () => {
      mounted.current = false;
    };
  }, [loadRuns, loadAutoStatus]);

  const go = () => run(async () => {
    setPlanning(true);
    try {
      const summary = await api('/v1/dispatch/planner/run', { method: 'POST', body: { day } });
      if (mounted.current) setOutcome(summary);
      toast('Plan finished. Open Approvals to review the proposals.');
      loadRuns();
      loadAutoStatus();
    } finally {
      if (mounted.current) setPlanning(false);
    }
  });

  const kpiItems = useMemo(() => {
    const s = autoStatus?.s;
    const autoTitle = s ? (s.assign ? 'Active (Live)' : 'Standby (Manual)') : '—';
    const autoHint = s ? `Approval: ${s.approve}` : '24/7 background listener';
    const booked24 = s ? String(s.booked_by_system_24h) : '—';
    const waiting = s ? String(s.proposals_waiting_for_a_person) : '—';
    const targetLabel = formatDay(day);
    const targetHint = day === tomorrow ? 'Tomorrow (Nightly run)' : day === today ? 'Today (Intraday sweep)' : 'Custom schedule date';

    return [
      ['Auto-Dispatch Engine', autoTitle, autoHint, 'copilot'],
      ['System Booked (24h)', booked24, 'Directly scheduled by system', 'jobs'],
      ['Pending Approvals', waiting, 'Proposals awaiting human review', 'approvals'],
      ['Target Plan Date', targetLabel, targetHint, 'plan'],
    ];
  }, [autoStatus, day, tomorrow, today]);

  const renderRunSummary = (summary, error) => {
    if (error) return <span className="plan-run-error">{error}</span>;
    if (!summary) return <span className="muted">—</span>;
    const proposals = (summary.proposals || []).length;
    const unplaced = (summary.unplaced || []).length;
    const notReady = (summary.not_prepared || []).length;
    const overflow = summary.overflow;

    return (
      <div className="plan-chips-wrap">
        <span className="plan-chip plan-chip--good">{proposals} proposed</span>
        {unplaced > 0 ? <span className="plan-chip plan-chip--warn">{unplaced} unplaced</span> : null}
        {notReady > 0 ? <span className="plan-chip plan-chip--neutral">{notReady} not ready</span> : null}
        {overflow ? <span className="plan-chip plan-chip--info">{overflow} overflow</span> : null}
      </div>
    );
  };

  let runsBody;
  if (runs.status === 'loading') runsBody = <Spinner />;
  else if (runs.status === 'error') runsBody = <ErrorBox error={runs.error} />;
  else if (runs.list && runs.list.length) {
    runsBody = (
      <DataTable
        head={['Target Day', 'Trigger', 'Status', 'Started', 'Result Summary']}
        rows={runs.list.map((r) => [
          <div key={`day-${r.id || r.started_at}`}>
            <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{formatDay(r.day)}</span>
            <small className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>{r.day}</small>
          </div>,
          r.trigger === 'scheduled' ? (
            <span className="plan-trigger-badge" key={`trig-${r.id || r.started_at}`}>
              <span className="plan-dot-auto" /> Scheduled
            </span>
          ) : (
            <span className="plan-trigger-badge" key={`trig-${r.id || r.started_at}`}>Manual ({r.started_by || 'User'})</span>
          ),
          <Badge key={`st-${r.id || r.started_at}`} text={r.status} tone={r.status === 'finished' ? 'good' : r.status === 'failed' ? 'bad' : 'warn'} />,
          formatDateTime(r.started_at),
          renderRunSummary(r.summary, r.error),
        ])}
      />
    );
  } else {
    runsBody = <Empty text="The plan has not run yet." />;
  }

  return (
    <>
      <PageHeader
        title="Nightly Plan & Automation"
        subtitle="Prepares technician proposals and routes for qualified requests. No assignments are booked without approval."
      >
        <div className="plan-header-controls">
          <div className="plan-presets" role="group" aria-label="Quick date select">
            <button
              type="button"
              className={`plan-preset-btn ${day === tomorrow ? 'plan-preset-btn--active' : ''}`}
              onClick={() => setDay(tomorrow)}
            >
              Tomorrow
            </button>
            <button
              type="button"
              className={`plan-preset-btn ${day === today ? 'plan-preset-btn--active' : ''}`}
              onClick={() => setDay(today)}
            >
              Today
            </button>
            <button
              type="button"
              className={`plan-preset-btn ${day === in2Days ? 'plan-preset-btn--active' : ''}`}
              onClick={() => setDay(in2Days)}
            >
              In 2 Days
            </button>
          </div>
          <input
            type="date"
            className="plan-date-input"
            aria-label="Day to plan"
            min={today}
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || planning}
            onClick={go}
          >
            {planning ? 'Planning…' : `Run plan for ${day === tomorrow ? 'tomorrow' : day}`}
          </button>
        </div>
      </PageHeader>

      <div className="stack">
        <StatGrid items={kpiItems} />

        {outcome ? <Result s={outcome} onClose={() => setOutcome(null)} /> : null}

        <Automation
          reload={loadRuns}
          autoStatus={autoStatus}
          onReload={loadAutoStatus}
        />

        <Card as="section">
          <Card.Title>Recent Planner Runs</Card.Title>
          <div style={{ marginTop: '12px' }}>{runsBody}</div>
        </Card>
      </div>
    </>
  );
}
