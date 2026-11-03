// Jobs: each technician's day in visit order, jobs that still need a technician, and the next step of a visit (on the way, arrived, done).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  formatTime, formatDateTime, formatDay, lateness, addDays, todayIn, PROGRESS, reasonText,
} from '../lib/format.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import {
  Badge, Spinner, Empty, ErrorBox, PageHeader, Overlay, Details, ProgressBadge, ArrivalBadge, toast, useRun, Icon,
} from '../components/index.js';
import { ScheduleFlow } from './schedule.jsx';
import { DrawMap, Legend, GoogleMap, etaText } from './map.jsx';
import { googleMapView } from './gmap.js';
import { QuotePanel, InvoicePanel, QuoteEditor } from './billing.jsx';

// ---- rules ----

export const NEXT_STEP = { scheduled: ['en_route', 'On the way'], en_route: ['arrived', 'Arrived'], arrived: ['completed', 'Done'] };
export const nextStep = (job) => NEXT_STEP[job.progress] || null;

const byTime = (a, b) => (a.scheduled_at || a.window_start || '').localeCompare(b.scheduled_at || b.window_start || '') || a.id.localeCompare(b.id);

export function groupJobs(jobs, technicianId = null) {
  const unassigned = jobs.filter((j) => j.status === 'pending').sort(byTime);
  const routes = new Map();
  for (const job of jobs) {
    if (job.status === 'pending' || !job.technician_id) continue;
    if (technicianId && job.technician_id !== technicianId) continue;
    if (!routes.has(job.technician_id)) routes.set(job.technician_id, { technicianId: job.technician_id, name: job.technician_name || job.technician_id, jobs: [] });
    routes.get(job.technician_id).jobs.push(job);
  }
  const groups = [...routes.values()].map((g) => ({ ...g, jobs: g.jobs.sort(byTime) })).sort((a, b) => a.name.localeCompare(b.name));
  return { unassigned: technicianId ? [] : unassigned, groups };
}

export function countByProgress(jobs) {
  const counts = { pending: 0, scheduled: 0, en_route: 0, arrived: 0, completed: 0 };
  for (const job of jobs) if (job.progress in counts) counts[job.progress] += 1;
  return counts;
}

// ---- the drawer for one job ----

const EVENT = { en_route: 'On the way', arrived: 'Arrived', completed: 'Finished' };

// Technicians near a job, nearest first by road time. Advice only: whether one fits is decided when an assignment is requested.
const km = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`);

function NearbyPanel({ job }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let current = true;
    api(`/v1/dispatch/jobs/${job.id}/nearby-technicians`)
      .then((r) => { if (current) setState({ status: 'ready', r }); })
      .catch((error) => { if (current) setState({ status: 'error', error }); });
    return () => { current = false; };
  }, [job.id]);

  let body;
  if (state.status === 'loading') body = (<><h3>Nearest technicians</h3><Spinner /></>);
  else if (state.status === 'error') body = (<><h3>Nearest technicians</h3><ErrorBox error={state.error} /></>);
  else {
    const { r } = state;
    body = (
      <>
        <h3>Nearest technicians</h3>
        {r.technicians.length ? (
          <ul className="plain">
            {r.technicians.map((t, i) => (
              <li className="nearby" key={i}>
                <strong>{t.name}</strong>{' '}
                {t.eligible ? <Badge text="can take it" tone="good" /> : <Badge text="not offered" tone="neutral" />}{' '}
                <span className="muted">{t.eta_seconds !== null
                  ? `${Math.max(1, Math.round(t.eta_seconds / 60))} min · ${km(t.road_distance_meters)} by road`
                  : `${km(t.straight_line_meters)} in a straight line`}</span>
                <small className="block muted">{`${t.position_source === 'live' ? 'Live position' : 'From their base'} · ${t.jobs_that_day} visit(s) that day`
                  + (t.reasons.length ? ` · ${t.reasons.map(reasonText).join(', ')}` : '')}</small>
              </li>
            ))}
          </ul>
        ) : <Empty text="No technicians are set up yet." />}
        {r.road_times === 'ok' ? null : <p className="muted">Road times are not available right now, so these are ranked by straight-line distance.</p>}
      </>
    );
  }
  return <section className="stack" aria-label="Technicians nearby">{body}</section>;
}

function JobEvents({ job }) {
  const [state, setState] = useState({ status: 'loading' });
  useEffect(() => {
    let current = true;
    api(`/v1/dispatch/jobs/${job.id}/events`)
      .then(({ events: list }) => { if (current) setState({ status: 'ready', list }); })
      .catch((error) => { if (current) setState({ status: 'error', error }); });
    return () => { current = false; };
  }, [job.id]);

  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (!state.list.length) body = <Empty text="Nothing recorded yet." />;
  else {
    body = (
      <ol className="plain">
        {state.list.map((e, i) => (
          <li className="event" key={i}>
            <strong>{EVENT[e.kind] || e.kind}</strong>{` at ${formatTime(e.at)} by ${e.by}`}
            {e.distance_meters !== null && e.distance_meters !== undefined ? <span className="muted">{` · phone ${e.distance_meters} m from the job`}</span> : null}
            {e.location_check === 'far' || e.location_check === 'unknown' ? <>{' '}<ArrivalBadge check={e.location_check} metres={e.distance_meters} /></> : null}
            {e.note ? <p className="muted">{e.note}</p> : null}
          </li>
        ))}
      </ol>
    );
  }
  return <div>{body}</div>;
}

// Quotes and invoices for a finished job (hidden entirely when billing is switched off).
function BillingFor({ job, reload }) {
  const [data, setData] = useState(null);
  const [quoteId, setQuoteId] = useState(null);
  const [invoiceId, setInvoiceId] = useState(null);
  const [editor, setEditor] = useState(null);
  useEffect(() => {
    let current = true;
    (async () => {
      try {
        const [{ quotes }, { invoices }] = await Promise.all([api('/v1/billing/quotes', { params: { job_id: job.id } }), api('/v1/billing/invoices', { params: { job_id: job.id } })]);
        if (current) setData({ quotes, invoices });
      } catch { /* billing is off, or not allowed: show nothing */ }
    })();
    return () => { current = false; };
  }, [job.id]);

  let body = null;
  if (data) {
    const open = data.quotes.filter((q) => q.status !== 'void');
    const liveInvoices = data.invoices.filter((i) => i.status !== 'void');
    const count = open.length + liveInvoices.length;
    body = (
      <>
        <h3>Billing</h3>
        {count ? (
          <ul className="plain">
            {open.map((q) => (
              <li key={`q${q.id}`}>Quote{' '}<a href="#/billing" onClick={(e) => { e.preventDefault(); setQuoteId(q.id); }}>{q.number || '(draft)'}</a>{` · ${q.status} · ${q.total}`}</li>
            ))}
            {liveInvoices.map((i) => (
              <li key={`i${i.id}`}>Invoice{' '}<a href="#/billing" onClick={(e) => { e.preventDefault(); setInvoiceId(i.id); }}>{i.number || '(draft)'}</a>{` · ${i.state} · ${i.total}`}</li>
            ))}
          </ul>
        ) : <Empty text="No quote or invoice yet." />}
        {can('dispatcher', 'admin') && !open.length ? (
          <button type="button" className="btn btn--outline" onClick={async () => {
            const summary = await api('/v1/billing/summary').catch(() => ({ currency: 'INR' }));
            setEditor({ currency: summary.currency });
          }}>Create a quote for this job</button>
        ) : null}
      </>
    );
  }
  return (
    <section className="stack" aria-label="Billing for this job">
      {body}
      {quoteId ? <QuotePanel key={quoteId} id={quoteId} reload={reload} onClose={() => setQuoteId(null)} /> : null}
      {invoiceId ? <InvoicePanel key={invoiceId} id={invoiceId} reload={reload} onClose={() => setInvoiceId(null)} /> : null}
      {editor ? <QuoteEditor jobId={job.id} currency={editor.currency} onClose={() => setEditor(null)} onSaved={(q) => { setEditor(null); setQuoteId(q.id); }} /> : null}
    </section>
  );
}

function JobDrawer({ job, reload, onClose }) {
  const pending = job.status === 'pending';
  return (
    <Overlay title={job.service_type || 'Job'} onClose={onClose} wide>
      <div className="stack">
        <div className="drawer-header-pill">
          <ProgressBadge progress={job.progress} />
          {job.arrived_at ? <span className="muted">{lateness(job.minutes_late)}</span> : null}
          <ArrivalBadge check={job.arrival_check} metres={job.arrival_distance_meters} />
        </div>
        <div className="drawer-card">
          <h4>Job Details</h4>
          <Details rows={[
            ['Customer', job.customer_name], ['Address', job.address], ['Technician', job.technician_name],
            ['Planned arrival', job.scheduled_at && formatDateTime(job.scheduled_at)], ['Customer window', `${formatTime(job.window_start)} – ${formatTime(job.window_end)}`],
            ['Duration', `${job.duration_minutes} min`], ['Area', job.service_area], ['Needs', (job.required_skills || []).join(', ')], ['What the customer said', job.description],
          ]} />
        </div>
        {pending ? (
          <div className="drawer-card">
            <h4>Assign Technician</h4>
            {can('dispatcher', 'approver', 'admin') ? <NearbyPanel job={job} /> : null}
            <ScheduleFlow jobId={job.id} onDone={() => { onClose(); reload(); }} />
          </div>
        ) : (
          <>
            <div className="drawer-card">
              <h4>Activity & History</h4>
              <JobEvents job={job} />
            </div>
            {job.progress === 'completed' ? (
              <div className="drawer-card">
                <BillingFor job={job} reload={reload} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </Overlay>
  );
}

// ---- the screen ----

function JobCard({ job, index, onOpen, onStep }) {
  const [busy, run] = useRun();
  const step = nextStep(job);
  const advance = step && can('dispatcher', 'admin') ? (
    <button
      type="button"
      className="btn btn--primary btn--small job-advance-btn"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        run(() => onStep(job, step));
      }}
    >
      <span>{step[1]}</span>
      <span aria-hidden="true">→</span>
    </button>
  ) : null;

  const timeLabel = job.scheduled_at
    ? formatTime(job.scheduled_at)
    : `${formatTime(job.window_start)} – ${formatTime(job.window_end)}`;

  const isPending = job.status === 'pending';

  return (
    <article
      className={`job-card ${isPending ? 'job-card--pending' : ''}`}
      tabIndex={0}
      aria-label={`${job.service_type || 'Job'} for ${job.customer_name || 'customer'}`}
      onClick={() => onOpen(job)}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(job); }}
    >
      <div className="job-card__order">
        {index !== undefined ? <span className="job-card__seq">{index + 1}</span> : null}
        <div className="job-card__time">
          <span className="job-card__time-val">{timeLabel}</span>
          {job.duration_minutes ? <small className="muted">{job.duration_minutes} min</small> : null}
        </div>
      </div>

      <div className="job-card__body">
        <div className="job-card__title-row">
          <strong className="job-card__title">{job.service_type || 'Job'}</strong>
          {job.customer_name ? <span className="job-card__customer">for {job.customer_name}</span> : null}
        </div>
        {job.address ? (
          <div className="job-card__address">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>{job.address}</span>
          </div>
        ) : null}
        {job.arrived_at ? (
          <small className="block muted">{`Arrived ${formatTime(job.arrived_at)} (${lateness(job.minutes_late)})`}</small>
        ) : null}
        <ArrivalBadge check={job.arrival_check} metres={job.arrival_distance_meters} />
      </div>

      <div className="job-card__actions">
        <ProgressBadge progress={job.progress} />
        {advance}
      </div>
    </article>
  );
}

const NO_POSITIONS = { enabled: null, positions: [] };

export default function Jobs() {
  const [date, setDate] = useState(todayIn);
  const [pickerValue, setPickerValue] = useState(date);
  const [reloadToken, setReloadToken] = useState(0);
  const [technicianId, setTechnicianId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [techSearch, setTechSearch] = useState('');
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [positions, setPositions] = useState(NO_POSITIONS);
  const [positionFailures, setPositionFailures] = useState(0);
  const [showMap, setShowMap] = useState(true);
  const [streets, setStreets] = useState(null);
  const [googleOn, setGoogleOn] = useState(false);
  const [google, setGoogle] = useState(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [opened, setOpened] = useState(null);

  const watchers = can('dispatcher', 'approver', 'admin');
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const failures = useRef(0);
  const loadSeq = useRef(0);
  const positionSeq = useRef(0);
  const legendRef = useRef(null);

  const loadPositions = async () => {
    if (!watchers) { setPositions(NO_POSITIONS); return; }
    positionSeq.current += 1;
    const seq = positionSeq.current;
    try {
      const fresh = await api('/v1/dispatch/positions');
      if (seq !== positionSeq.current) return;
      failures.current = 0;
      setPositionFailures(0);
      setPositions(fresh);
    } catch {
      if (seq !== positionSeq.current) return;
      failures.current += 1;
      setPositionFailures(failures.current);
      if (failures.current < 2) return;
      setPositions((before) => ({ ...before, positions: (before.positions || []).map((p) => ({ ...p, stale: true })) }));
    }
  };

  useEffect(() => {
    let current = true;
    api('/v1/dispatch/map/config').then((c) => {
      if (!current) return;
      setStreets(c);
      if (jobsRef.current.length) loadPositions();
    }).catch(() => {});
    return () => { current = false; };
  }, []);

  const load = async (quiet) => {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    if (!quiet) setStatus('loading');
    try {
      const { jobs: list } = await api('/v1/dispatch/jobs', { params: { date, limit: 500 } });
      if (seq !== loadSeq.current) return;
      if (!list.length) { setJobs([]); setStatus('empty'); return; }
      jobsRef.current = list;
      await loadPositions();
      if (seq !== loadSeq.current) return;
      setJobs(list);
      setStatus('ready');
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(e);
      setStatus('error');
    }
  };
  const loadLatest = useRef(load);
  loadLatest.current = load;
  const reload = useCallback(() => loadLatest.current(true), []);

  useEffect(() => { loadLatest.current(false); }, [date, reloadToken]);
  useEvery(() => load(true), 30000);
  useEvery(loadPositions, 15000);

  const go = (to) => { setDate(to); setPickerValue(to); setTechnicianId(null); setReloadToken((n) => n + 1); };

  const googleKey = streets && streets.google_key;
  const located = useMemo(() => jobs.filter((j) => Number.isFinite(j.latitude) && Number.isFinite(j.longitude) && !(j.latitude === 0 && j.longitude === 0)), [jobs]);
  const live = useMemo(() => {
    const onBoard = new Set(jobs.map((j) => j.id));
    return positions.enabled ? positions.positions.filter((p) => p.job && onBoard.has(p.job.id)) : [];
  }, [jobs, positions]);

  const wantGoogle = Boolean(googleKey) && !googleFailed && located.length > 0 && showMap;
  useEffect(() => { if (wantGoogle && !googleOn) setGoogleOn(true); }, [wantGoogle, googleOn]);
  useEffect(() => {
    if (!googleKey || !googleOn) return undefined;
    const view = googleMapView(googleKey);
    setGoogle(view);
    view.failed.then((failed) => { if (failed) setGoogleFailed(true); });
    return () => { view.destroy(); setGoogle(null); };
  }, [googleKey, googleOn]);

  const open = useCallback((job) => setOpened(job), []);
  const step = async (job, [event, label]) => {
    await api(`/v1/dispatch/jobs/${job.id}/progress`, { method: 'POST', body: { event } });
    toast(`${label} recorded.`);
    load(true);
  };

  const hasJobs = jobs.length > 0;
  const counts = countByProgress(jobs);
  const people = new Map();
  jobs.forEach((j) => j.technician_id && people.set(j.technician_id, j.technician_name || j.technician_id));

  // Filter jobs by progress status if selected
  const displayedJobs = useMemo(() => {
    if (statusFilter === 'all') return jobs;
    return jobs.filter((j) => j.progress === statusFilter);
  }, [jobs, statusFilter]);

  const { unassigned, groups } = groupJobs(displayedJobs, technicianId);

  // Filter technician roster list by search term
  const filteredPeople = useMemo(() => {
    const term = techSearch.trim().toLowerCase();
    const sorted = [...people].sort((a, b) => a[1].localeCompare(b[1]));
    if (!term) return sorted;
    return sorted.filter(([, name]) => name.toLowerCase().includes(term));
  }, [people, techSearch]);

  const note = positionFailures >= 2 ? 'Live positions could not be refreshed: what is shown may be out of date.'
    : !watchers ? 'Job locations. Technician positions are for dispatchers.'
    : positions.enabled === false ? 'Job locations. Live position is switched off for this company.'
        : live.length ? 'Job locations and technicians on the way (updated every 15s).' : 'Job locations. No technician is on the way right now.';

  let mapView = null;
  if (googleKey && !googleFailed) mapView = google ? <GoogleMap view={google} anchorRef={legendRef} jobs={located} positions={live} onSelectJob={open} /> : null;
  else mapView = <DrawMap jobs={located} positions={live} selectedId={null} onSelectJob={open} streets={streets} />;

  let mainContent;
  if (status === 'loading') mainContent = <Spinner text="Loading schedule..." />;
  else if (status === 'error') mainContent = <ErrorBox error={error} />;
  else if (status === 'empty') mainContent = <Empty text="No jobs scheduled for this date." />;
  else if (!displayedJobs.length) mainContent = <Empty text={`No jobs matching the "${PROGRESS[statusFilter]?.[0] || statusFilter}" filter.`} />;
  else {
    mainContent = (
      <div className="stack">
        {unassigned.length ? (
          <section className="jobs-unassigned-card" aria-label="Jobs needing assignment">
            <div className="jobs-unassigned-card__head">
              <div className="row">
                <span className="badge badge--warn">Action Required</span>
                <h3>Needs a technician ({unassigned.length})</h3>
              </div>
              <small className="muted">These bookings require technician assignment</small>
            </div>
            <div className="stack">
              {unassigned.map((j) => (
                <JobCard key={j.id} job={j} onOpen={open} onStep={step} />
              ))}
            </div>
          </section>
        ) : null}

        {groups.map((g) => {
          const completedCount = g.jobs.filter((j) => j.progress === 'completed').length;
          return (
            <section key={g.technicianId} className="jobs-route-card" aria-label={`${g.name}'s route`}>
              <div className="jobs-route-card__head">
                <div className="jobs-route-card__info">
                  <span className="jobs-route-card__avatar">{g.name.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <h3 className="jobs-route-card__title">{g.name}</h3>
                    <small className="muted">{`${g.jobs.length} visits · ${completedCount} completed`}</small>
                  </div>
                </div>
                <div className="row">
                  <Badge text={`${g.jobs.length} visits`} tone={completedCount === g.jobs.length ? 'good' : 'neutral'} />
                </div>
              </div>
              <div className="jobs-route-card__body">
                {g.jobs.map((j, idx) => (
                  <JobCard key={j.id} job={j} index={idx} onOpen={open} onStep={step} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  const isToday = date === todayIn();
  const dateFormatted = isToday ? `Today · ${formatDay(date)}` : formatDay(date);

  return (
    <div className="jobs-container">
      <PageHeader title="Jobs" subtitle="Daily routes, technician schedules and live dispatch">
        <div className="jobs-header-actions">
          <div className="jobs-date-nav" role="group" aria-label="Date navigation">
            <button
              type="button"
              className="jobs-date-nav__btn"
              aria-label="Previous day"
              onClick={() => go(addDays(date, -1))}
              title="Previous day"
            >
              ‹
            </button>
            <label className="jobs-date-nav__display" title="Click to choose a date">
              <span>{dateFormatted}</span>
              <input
                type="date"
                value={pickerValue}
                aria-label="Choose day"
                onChange={(e) => {
                  setPickerValue(e.target.value);
                  if (e.target.value) go(e.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="jobs-date-nav__btn"
              aria-label="Next day"
              onClick={() => go(addDays(date, 1))}
              title="Next day"
            >
              ›
            </button>
          </div>

          {!isToday ? (
            <button type="button" className="btn btn--outline btn--small" onClick={() => go(todayIn())}>
              Today
            </button>
          ) : null}

          {located.length > 0 ? (
            <button
              type="button"
              className={`btn ${showMap ? 'btn--primary' : 'btn--outline'} btn--small`}
              onClick={() => setShowMap((v) => !v)}
              title={showMap ? 'Hide map panel' : 'Show map panel'}
            >
              <Icon name="tracking" />
              <span>{showMap ? 'Hide Map' : 'Show Map'}</span>
            </button>
          ) : null}
        </div>
      </PageHeader>

      {/* Dispatcher status strip / KPI ribbon */}
      {hasJobs ? (
        <div className="jobs-status-strip" role="tablist" aria-label="Status filter">
          <button
            type="button"
            className={`jobs-status-chip ${statusFilter === 'all' ? 'jobs-status-chip--active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            <span>All Visits</span>
            <span className="jobs-status-chip__count">{jobs.length}</span>
          </button>
          {counts.pending > 0 ? (
            <button
              type="button"
              className={`jobs-status-chip jobs-status-chip--alert ${statusFilter === 'pending' ? 'jobs-status-chip--active' : ''}`}
              onClick={() => setStatusFilter((curr) => (curr === 'pending' ? 'all' : 'pending'))}
            >
              <span className="jobs-status-chip__dot" />
              <span>Needs Tech</span>
              <span className="jobs-status-chip__count">{counts.pending}</span>
            </button>
          ) : null}
          {['scheduled', 'en_route', 'arrived', 'completed'].map((key) => {
            const count = counts[key] || 0;
            if (count === 0 && statusFilter !== key) return null;
            return (
              <button
                key={key}
                type="button"
                className={`jobs-status-chip ${statusFilter === key ? 'jobs-status-chip--active' : ''}`}
                onClick={() => setStatusFilter((curr) => (curr === key ? 'all' : key))}
              >
                <span className="jobs-status-chip__dot" />
                <span>{PROGRESS[key][0]}</span>
                <span className="jobs-status-chip__count">{count}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {/* Map panel */}
      {located.length > 0 && showMap ? (
        <section className="card map-panel" aria-label="Map view">
          <div className="map-panel__head">
            <div className="row">
              <span className="badge badge--info">Live Map</span>
              <span className="muted small">{note}</span>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => setShowMap(false)}
            >
              Close map
            </button>
          </div>
          {mapView}
          <Legend ref={legendRef} />
          {live.length ? (
            <ul className="live-list" aria-label="Technicians on the way">
              {live.map((p, i) => (
                <li key={i}>
                  <strong>{p.name}</strong> — {etaText(p)}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {/* Two-column workspace */}
      <div className="two-col">
        <aside className="side-list" aria-label="Technicians directory">
          <div className="between" style={{ padding: '4px 8px 6px' }}>
            <span className="eyebrow" style={{ margin: 0 }}>Technicians</span>
            <span className="count">{people.size}</span>
          </div>

          {people.size > 5 ? (
            <input
              type="search"
              className="jobs-roster__search"
              placeholder="Search technician..."
              value={techSearch}
              onChange={(e) => setTechSearch(e.target.value)}
              style={{ margin: '0 0 6px', height: '32px', fontSize: '0.82rem' }}
            />
          ) : null}

          {hasJobs ? (
            <>
              <button
                type="button"
                className={`side-item ${!technicianId ? 'side-item--on' : ''}`}
                onClick={() => setTechnicianId(null)}
              >
                <span>All Technicians</span>
                <span className="count">{jobs.length}</span>
              </button>
              {filteredPeople.map(([id, name]) => {
                const count = jobs.filter((j) => j.technician_id === id).length;
                const hasActive = jobs.some((j) => j.technician_id === id && (j.progress === 'en_route' || j.progress === 'arrived'));
                return (
                  <button
                    type="button"
                    key={id}
                    className={`side-item ${technicianId === id ? 'side-item--on' : ''}`}
                    onClick={() => setTechnicianId((curr) => (curr === id ? null : id))}
                  >
                    <span className="row" style={{ gap: '8px' }}>
                      {hasActive ? <span className="badge badge--good" style={{ width: '6px', height: '6px', padding: 0 }} /> : null}
                      <span>{name}</span>
                    </span>
                    <span className="count">{count}</span>
                  </button>
                );
              })}
            </>
          ) : (
            <small className="muted" style={{ padding: '8px 12px' }}>No technicians</small>
          )}
        </aside>

        <main className="stack" style={{ minWidth: 0 }}>
          {mainContent}
        </main>
      </div>

      {opened ? <JobDrawer job={opened} reload={reload} onClose={() => setOpened(null)} /> : null}
    </div>
  );
}
