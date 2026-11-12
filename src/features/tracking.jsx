// Team → Tracking nested view. Layout matches the reference schematic map + tech list + activity log.
// Live feed: /v1/team/tracking. Day visits (booked vs actual): /v1/dispatch/tracking/summary + jobs.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  percent, todayIn, addDays, formatTime, lateness, PROGRESS, timeAgo,
} from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import {
  Badge, Button, Empty, ErrorBox, Panel, PanelHead, Spinner,
  ProgressBadge, ArrivalBadge, DataTable, StatGrid,
} from '../components/index.js';

const STATUS_TONE = {
  available: 'good', active: 'good',
  on_a_job: 'info', en_route: 'info', arrived: 'info', on_site: 'info',
  offline: 'warn', off: 'warn', stale: 'warn', disabled: 'bad',
  time_off: 'neutral', unavailable: 'neutral', off_duty: 'neutral', not_on_shift: 'neutral',
};
const toneFor = (code) => STATUS_TONE[String(code || '').toLowerCase()] || 'neutral';

const MARKER_PATH = [
  [70, 220], [150, 220], [240, 220], [240, 90], [380, 90], [520, 90],
];

function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
}

function RouteMap({ markerIndex = 0, markerLabel = 'M' }) {
  const idx = Math.max(0, Math.min(MARKER_PATH.length - 1, markerIndex));
  const [cx, cy] = MARKER_PATH[idx];
  return (
    <svg viewBox="0 0 600 300" role="img" aria-label="Illustrative route from office to a service job" className="tracking-map">
      <path d="M70 220 H240 V90 H520" fill="none" stroke="#c8d8e2" strokeWidth="12" strokeLinecap="round" />
      <circle cx="70" cy="220" r="12" fill="#526777" />
      <circle cx="520" cy="90" r="12" fill="#176b9b" />
      <text x="40" y="260">Office</text>
      <text x="455" y="60">Service job</text>
      <g>
        <circle cx={cx} cy={cy} r="16" fill="#176b9b" />
        <text x={cx - 7} y={cy + 5} fill="#fff">{String(markerLabel || 'M').slice(0, 1)}</text>
      </g>
    </svg>
  );
}

function useTeamTracking(active) {
  const [state, setState] = useState({ status: 'idle' });
  const seq = useRef(0);
  useEffect(() => {
    if (!active) return undefined;
    const mine = (seq.current += 1);
    setState({ status: 'loading' });
    (async () => {
      try {
        const data = await api('/v1/team/tracking');
        if (mine === seq.current) setState({ status: 'ready', data });
      } catch (error) {
        if (mine === seq.current) setState({ status: 'error', error });
      }
    })();
    return () => { seq.current += 1; };
  }, [active]);
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
  const [demoStep, setDemoStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const live = state.status === 'ready' ? state.data : null;
  const technicians = live?.technicians || [];
  const enabled = Boolean(live?.enabled);
  const hasLiveFeed = enabled && technicians.some((t) => t.tracking === 'live' || t.tracking_text?.toLowerCase?.().includes('live') || t.position);
  // Demo layout only after a successful load with no feed rows — never during loading/error.
  const showDemo = state.status === 'ready' && !technicians.length;

  useEffect(() => {
    if (!showDemo && playing) setPlaying(false);
  }, [showDemo, playing]);

  useEffect(() => {
    if (!playing || !showDemo) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return undefined;
    }
    timer.current = setInterval(() => setDemoStep((s) => s + 1), 6000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, showDemo]);

  const demoStates = ['Available', 'En route', 'En route', 'Arrived', 'On site', 'Job complete'];
  const demoState = demoStates[Math.min(demoStep, demoStates.length - 1)];
  const markerIndex = hasLiveFeed
    ? Math.min(MARKER_PATH.length - 1, technicians.filter((t) => t.status?.code === 'on_a_job' || t.status?.code === 'en_route').length ? 3 : 0)
    : (showDemo ? Math.min(MARKER_PATH.length - 1, demoStep) : 0);

  const statusChip = useMemo(() => {
    if (state.status === 'loading') return { text: 'Loading tracking…', tone: 'neutral' };
    if (state.status === 'error') return { text: 'Tracking feed unavailable', tone: 'warn' };
    if (hasLiveFeed) return { text: live?.note || 'Live location feed connected', tone: 'good' };
    if (enabled) return { text: live?.note || 'Tracking on · waiting for location updates', tone: 'warn' };
    return { text: live?.note || 'Simulated tracking · GPS not connected', tone: 'warn' };
  }, [state.status, live, hasLiveFeed, enabled]);

  const listRows = (() => {
    if (state.status !== 'ready') return [];
    if (technicians.length) {
      return technicians.map((t) => {
        const code = t.status?.code || t.tracking || 'offline';
        const label = t.status?.label || t.tracking_text || t.tracking || 'Unknown';
        const detail = t.status?.detail;
        const trade = t.trade || (Array.isArray(t.skills) ? t.skills[0] : '') || '';
        const freshness = t.updated_at
          ? `Updated ${timeAgo(t.updated_at)}`
          : (t.eta_seconds != null ? `ETA ${Math.round(t.eta_seconds / 60)} min` : (enabled ? 'No recent location update' : 'No location available'));
        // off_duty and not_on_shift are both "not working now" - neither has a live feed worth showing as such.
        const offline = ['off', 'offline', 'stale', 'disabled', 'off_duty', 'not_on_shift'].includes(String(code).toLowerCase())
          || String(t.tracking_text || '').toLowerCase().includes('off');
        return {
          id: t.id || t.name,
          name: t.name,
          initial: initials(t.name).slice(0, 1),
          subtitle: `${label}${trade ? ` · ${trade}` : ''}`,
          detail,
          freshness,
          badge: offline ? 'Offline' : (hasLiveFeed ? 'Live feed' : (enabled ? 'Tracking' : 'No GPS')),
          tone: offline ? 'warn' : (hasLiveFeed ? 'good' : toneFor(code)),
        };
      });
    }
    if (!showDemo) return [];
    return [
      {
        id: 'demo-1',
        name: 'Mike Rodriguez',
        initial: 'M',
        subtitle: `${demoState} · HVAC`,
        freshness: 'Sample update just now',
        badge: 'Demo feed',
        tone: 'good',
        demo: true,
      },
      {
        id: 'demo-2',
        name: 'Alicia Brown',
        initial: 'A',
        subtitle: 'Location sharing off · Plumbing',
        freshness: 'No location available',
        badge: 'Offline',
        tone: 'warn',
        demo: true,
      },
    ];
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
          {` · ${first?.name || 'Technician'} · ${first?.status?.label || first?.tracking_text || first?.tracking || '—'}`}
        </p>
      );
    }
    if (!showDemo) return <p className="sub">No activity updates yet.</p>;
    return (
      <p>
        <strong>{`Sample update ${demoStep + 1}`}</strong>
        {` · Mike Rodriguez · ${demoState}`}
      </p>
    );
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
        {showDemo ? (
          <>
            <Button
              className="btn btn--secondary agent-btn"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? 'Pause simulation' : 'Start simulation'}
            </Button>
            <Button
              className="btn btn--secondary agent-btn"
              onClick={() => { setDemoStep((s) => s + 1); }}
            >
              Advance sample update
            </Button>
          </>
        ) : null}
      </div>

      {state.status === 'loading' ? <Spinner /> : null}
      {state.status === 'error' ? <ErrorBox error={state.error} /> : null}

      {state.status === 'ready' ? (
        <>
          <div className="tracking-layout">
            <Panel>
              <h2>Sample route overview</h2>
              <p className="sub">
                {hasLiveFeed
                  ? 'Schematic overview · Not a geographic map. Live technician status comes from the tracking feed below.'
                  : 'Schematic only · Not a geographic map or actual technician locations'}
              </p>
              <RouteMap markerIndex={markerIndex} markerLabel={listRows[0]?.initial || 'M'} />
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
              <p className="sub">
                {hasLiveFeed
                  ? 'Status reflects the last known feed update. Confirm critical decisions in the job record.'
                  : 'These updates do not change actual jobs, assignments, or GPS locations.'}
              </p>
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
