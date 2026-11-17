// Team → Tracking nested view. Layout matches the reference map + tech list + activity log.
// Live feed: /v1/team/tracking. Day visits (booked vs actual): /v1/dispatch/tracking/summary + jobs.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  percent, todayIn, addDays, formatTime, lateness, PROGRESS,
} from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import {
  Badge, Button, Empty, ErrorBox, Panel, PanelHead, Spinner,
  ProgressBadge, ArrivalBadge, DataTable, StatGrid,
} from '../components/index.js';
import TechnicianMap, { etaText, distanceText } from './trackingMap.jsx';

// Per-technician tracking state, straight from the API - never invent an "Offline" word here
// (that belongs to the duty/account status, shown separately via status.label).
const TRACKING_BADGE = {
  live: { text: 'Live', tone: 'good' },
  stale: { text: 'Old', tone: 'warn' },
  off: { text: 'Not sharing', tone: 'neutral' },
};

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

const hasCoords = (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

function useTeamTracking(active) {
  const [state, setState] = useState({ status: 'idle' });
  const seq = useRef(0);
  const load = useCallback(async (quiet) => {
    const mine = (seq.current += 1);
    if (!quiet) setState({ status: 'loading' });
    try {
      const data = await api('/v1/team/tracking');
      if (mine === seq.current) setState({ status: 'ready', data });
    } catch (error) {
      // A refresh that fails keeps the map and the list on screen; only the first load shows the error.
      if (mine === seq.current) setState((prev) => (quiet && prev.status === 'ready' ? prev : { status: 'error', error }));
    }
  }, []);
  useEffect(() => {
    if (!active) return undefined;
    load(false);
    return () => { seq.current += 1; };
  }, [active, load]);
  useEvery(() => { if (active) load(true); }, 20000);
  return state;
}

/** Pre-design dispatch tracking: booked vs actual for a chosen day. */
function useDispatchVisits(active) {
  const [day, setDay] = useState(todayIn);
  const [state, setState] = useState({ status: 'idle' });
  const latest = useRef(0);
  const dayRef = useRef(day);
  dayRef.current = day;

  const load = async (quiet) => {
    if (!active) return;
    latest.current += 1;
    const mine = latest.current;
    const current = dayRef.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const [summary, list] = await Promise.all([
        api('/v1/dispatch/tracking/summary', { params: { date: current } }),
        api('/v1/dispatch/jobs', { params: { date: current, limit: 500 } }),
      ]);
      const jobs = (list.jobs || [])
        .filter((j) => j.status !== 'pending')
        .sort((a, b) => (a.scheduled_at || '').localeCompare(b.scheduled_at || ''));
      if (mine === latest.current) setState({ status: 'ready', summary, jobs });
    } catch (error) {
      if (mine === latest.current) setState({ status: 'error', error });
    }
  };

  useEffect(() => {
    if (!active) return undefined;
    load();
    return () => { latest.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, day]);
  useEvery(() => { if (active) load(true); }, 30000);

  return { day, setDay, state };
}

function VisitsPanel({ active }) {
  const { day, setDay, state } = useDispatchVisits(active);
  if (!active) return null;

  let body;
  if (state.status === 'loading' || state.status === 'idle') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else {
    const { summary, jobs } = state;
    body = (
      <>
        <StatGrid
          className="tracking-visits-stats"
          items={[
            ...Object.entries(PROGRESS).filter(([key]) => key in (summary.by_progress || {})).map(([key, [label]]) => [label, summary.by_progress[key]]),
            ['Average lateness', summary.average_minutes_late === null || summary.average_minutes_late === undefined ? '—' : `${summary.average_minutes_late} min`],
            [`On time (within ${summary.grace_minutes ?? '—'} min)`, percent(summary.on_time_share)],
          ]}
        />
        {jobs.length ? (
          <DataTable
            label="Visits for the day"
            head={['Technician', 'Customer', 'Planned', 'Progress', 'On the way', 'Arrived', 'Finished', 'Against plan']}
            rows={jobs.map((j) => [
              <strong key="tech">{j.technician_name || '—'}</strong>,
              j.customer_name || '—',
              formatTime(j.scheduled_at),
              <ProgressBadge key="prog" progress={j.progress} />,
              formatTime(j.en_route_at),
              formatTime(j.arrived_at),
              formatTime(j.completed_at),
              j.arrived_at ? (
                <span className="row wrap" key="late">
                  <Badge
                    text={lateness(j.minutes_late)}
                    tone={j.within_window === false || j.minutes_late > summary.grace_minutes ? 'bad' : 'good'}
                  />
                  <ArrivalBadge check={j.arrival_check} metres={j.arrival_distance_meters} />
                </span>
              ) : '—',
            ])}
          />
        ) : <Empty text="No booked visits on this day." />}
      </>
    );
  }

  return (
    <Panel className="tracking-visits" as="section">
      <PanelHead
        title="Today's visits"
        subtitle="Booked against actual, updated as technicians report in"
      >
        <div className="tracking-day-nav row wrap">
          <Button className="btn btn--secondary agent-btn" aria-label="Previous day" onClick={() => setDay((d) => addDays(d, -1))}>‹</Button>
          <input
            type="date"
            aria-label="Day"
            value={day}
            onChange={(e) => { if (e.target.value) setDay(e.target.value); }}
          />
          <Button className="btn btn--secondary agent-btn" aria-label="Next day" onClick={() => setDay((d) => addDays(d, 1))}>›</Button>
          <Button className="btn btn--secondary agent-btn" onClick={() => setDay(todayIn())}>Today</Button>
        </div>
      </PanelHead>
      {body}
    </Panel>
  );
}

/**
 * Nested Team tracking surface.
 * @param {{ onBack: () => void, active?: boolean }} props
 */
export default function TeamTracking({ onBack, active = true }) {
  const state = useTeamTracking(active);

  const live = state.status === 'ready' ? state.data : null;
  const technicians = live?.technicians || [];
  const enabled = Boolean(live?.enabled);
  const hasAnyLocation = technicians.some((t) => hasCoords(t.location));
  const summaryLive = live?.summary?.live;
  const liveCount = typeof summaryLive === 'number' ? summaryLive : technicians.filter((t) => t.tracking === 'live').length;

  const statusChip = useMemo(() => {
    if (state.status === 'loading') return { text: 'Loading tracking…', tone: 'neutral' };
    if (state.status === 'error') return { text: 'Tracking feed unavailable', tone: 'warn' };
    if (!enabled) return { text: live?.note || 'Tracking is off.', tone: 'neutral' };
    if (liveCount === 0) return { text: 'Tracking is on. Locations appear once a technician taps On my way.', tone: 'warn' };
    return { text: live?.note || `${liveCount} technician${liveCount === 1 ? '' : 's'} sharing live location.`, tone: 'good' };
  }, [state.status, live, enabled, liveCount]);

  const listRows = (() => {
    if (state.status !== 'ready') return [];
    return technicians.map((t) => {
      const label = t.status?.label || '';
      const trade = t.trade || (Array.isArray(t.skills) ? t.skills[0] : '') || '';
      const trackInfo = TRACKING_BADGE[t.tracking] || { text: t.tracking_text || 'Unknown', tone: 'neutral' };
      return {
        id: t.id || t.name,
        name: t.name,
        initial: initials(t.name).slice(0, 1),
        subtitle: [label, trade].filter(Boolean).join(' · '),
        detail: t.status?.detail,
        freshness: t.tracking_text || '',
        trip: [etaText(t.eta_seconds), distanceText(t.distance_meters)].filter(Boolean).join(' · '),
        heading: t.job ? `${t.job.progress === 'en_route' ? 'Heading to' : 'At'} ${t.job.service || 'the job'}` : '',
        badge: trackInfo.text,
        tone: trackInfo.tone,
      };
    });
  })();

  const activity = (() => {
    if (state.status === 'loading') return <p className="sub">Loading activity…</p>;
    if (state.status === 'error') return <p className="sub">Activity updates unavailable until the tracking feed loads.</p>;
    if (live?.events?.length) {
      return live.events.map((e, i) => (
        <p key={i}>
          <strong>{e.title || e.text || `Update ${i + 1}`}</strong>
          {e.detail ? ` · ${e.detail}` : ''}
        </p>
      ));
    }
    if (technicians.length) {
      const first = technicians[0];
      return (
        <p>
          <strong>Latest status</strong>
          {` · ${first?.name || 'Technician'} · ${first?.status?.label || first?.tracking_text || '—'}`}
        </p>
      );
    }
    return <p className="sub">No activity updates yet.</p>;
  })();

  return (
    <div className="team-tracking">
      <header className="page-header">
        <div className="page-header__copy">
          <p className="page-header__eyebrow">TEAM &amp; DISPATCH</p>
          <h1>Technician tracking</h1>
          <p className="muted page-header__subtitle">Follow location freshness, service status, and booked visits in one place.</p>
        </div>
        <div className="page-actions">
          <Button className="btn btn--secondary agent-btn" onClick={onBack}>Back to team</Button>
        </div>
      </header>

      <div className="tracking-controls">
        <Badge text={statusChip.text} tone={statusChip.tone === 'neutral' ? 'neutral' : statusChip.tone} />
      </div>

      {state.status === 'loading' ? <Spinner /> : null}
      {state.status === 'error' ? <ErrorBox error={state.error} /> : null}

      {state.status === 'ready' ? (
        <>
          <div className="tracking-layout">
            <Panel>
              <h2>Technician locations</h2>
              <p className="sub">
                {hasAnyLocation ? 'Live locations and the job each technician is heading to.' : 'No technician is sharing a location yet.'}
              </p>
              <TechnicianMap technicians={technicians} />
            </Panel>
            <Panel>
              <h2>Technicians</h2>
              <div aria-live="polite">
                {listRows.length ? listRows.map((row) => (
                  <div className="row-item" key={row.id}>
                    <span className="circle">{row.initial}</span>
                    <span className="rowmain">
                      <strong>{row.name}</strong>
                      <small className="muted">
                        {row.subtitle}
                        {row.detail ? <><br />{row.detail}</> : null}
                        <br />
                        {row.freshness}
                        {row.heading ? <><br />{row.heading}</> : null}
                        {row.trip ? <><br />{row.trip}</> : null}
                      </small>
                    </span>
                    <Badge text={row.badge} tone={row.tone} />
                  </div>
                )) : <Empty text="No technicians to show." />}
              </div>
            </Panel>
          </div>

          <Panel className="tracking-activity">
            <h2>Activity updates</h2>
            <div role="log" aria-live="polite">
              {activity}
              <p className="sub">Status reflects the last known feed update. Confirm critical decisions in the job record.</p>
            </div>
          </Panel>
        </>
      ) : null}

      <VisitsPanel active={active} />

      <p className="page-foot">
        Location feed uses the team tracking API. Visit progress uses dispatch tracking summary and jobs for the selected day. Real GPS requires a technician app, location permission, and a secure location feed.
      </p>
    </div>
  );
}
