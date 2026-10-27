// Jobs: each technician's day in visit order, jobs that still need a technician, and the next step of a visit (on the way, arrived, done).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  formatTime, formatDateTime, lateness, addDays, todayIn, PROGRESS, reasonText,
} from '../lib/format.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import {
  Badge, Spinner, Empty, ErrorBox, PageHeader, Overlay, Details, ProgressBadge, ArrivalBadge, toast, useRun,
} from '../lib/ui.jsx';
import { ScheduleFlow } from './schedule.jsx';
import { DrawMap, Legend, GoogleMap, etaText } from '../lib/map.jsx';
import { googleMapView } from '../lib/gmap.js';
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
        ) : <p className="muted">No quote or invoice yet.</p>}
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
    <Overlay title={job.service_type || 'Job'} onClose={onClose}>
      <div className="stack">
        <div className="row wrap">
          <ProgressBadge progress={job.progress} />
          {job.arrived_at ? <span className="muted">{lateness(job.minutes_late)}</span> : null}
          <ArrivalBadge check={job.arrival_check} metres={job.arrival_distance_meters} />
        </div>
        <Details rows={[
          ['Customer', job.customer_name], ['Address', job.address], ['Technician', job.technician_name],
          ['Planned arrival', job.scheduled_at && formatDateTime(job.scheduled_at)], ['Customer window', `${formatTime(job.window_start)} – ${formatTime(job.window_end)}`],
          ['Duration', `${job.duration_minutes} min`], ['Area', job.service_area], ['Needs', (job.required_skills || []).join(', ')], ['What the customer said', job.description],
        ]} />
        {pending ? (
          <>
            {can('dispatcher', 'approver', 'admin') ? <NearbyPanel job={job} /> : null}
            <h3>Find a technician</h3>
            <ScheduleFlow jobId={job.id} onDone={() => { onClose(); reload(); }} />
          </>
        ) : (
          <>
            <h3>What happened</h3>
            <JobEvents job={job} />
            {job.progress === 'completed' ? <BillingFor job={job} reload={reload} /> : null}
          </>
        )}
      </div>
    </Overlay>
  );
}

// ---- the screen ----

function StepButton({ label, action }) {
  const [busy, run] = useRun();
  return (
    <button type="button" className="btn btn--primary btn--small" disabled={busy} onClick={(e) => { e.stopPropagation(); run(action); }}>{label}</button>
  );
}

function JobCard({ job, onOpen, onStep }) {
  const step = nextStep(job);
  const advance = step && can('dispatcher', 'admin') ? <StepButton label={step[1]} action={() => onStep(job, step)} /> : null;
  return (
    <article className="job" tabIndex={0} aria-label={`${job.service_type || 'Job'} for ${job.customer_name || 'customer'}`}
      onClick={() => onOpen(job)} onKeyDown={(e) => { if (e.key === 'Enter') onOpen(job); }}>
      <div className="job__time">{job.scheduled_at ? formatTime(job.scheduled_at) : `${formatTime(job.window_start)}–${formatTime(job.window_end)}`}</div>
      <div className="job__main"><strong>{job.service_type || 'Job'}</strong>{job.customer_name ? ` for ${job.customer_name}` : ''}
        <small className="block muted">{job.address || ''}</small>
        {job.arrived_at ? <small className="block muted">{`Arrived ${formatTime(job.arrived_at)} (${lateness(job.minutes_late)})`}</small> : null}
        <ArrivalBadge check={job.arrival_check} metres={job.arrival_distance_meters} />
      </div>
      <div className="job__side"><ProgressBadge progress={job.progress} />{advance}</div>
    </article>
  );
}

const NO_POSITIONS = { enabled: null, positions: [] };

export default function Jobs() {
  const [date, setDate] = useState(todayIn);
  const [pickerValue, setPickerValue] = useState(date);
  const [reloadToken, setReloadToken] = useState(0);
  const [technicianId, setTechnicianId] = useState(null);
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

  const watchers = can('dispatcher', 'approver', 'admin'); // a viewer sees the jobs but may not follow the technicians
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
      if (failures.current < 2) return; // one missed refresh is not worth a warning
      // Two in a row: what is on the map is no longer fresh, whatever its age said when it arrived. Grey it out and say so.
      setPositions((before) => ({ ...before, positions: (before.positions || []).map((p) => ({ ...p, stale: true })) }));
    }
  };

  useEffect(() => {
    let current = true;
    api('/v1/dispatch/map/config').then((c) => { // no street map: the plain map is drawn
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
  useEvery(loadPositions, 15000); // technicians on the way move: refresh their dots more often than the job list

  const go = (to) => { setDate(to); setPickerValue(to); setTechnicianId(null); setReloadToken((n) => n + 1); };

  // Google Maps when the server has a browser key (one map kept alive across refreshes); otherwise, or if Google cannot load, the drawn map.
  const googleKey = streets && streets.google_key;
  const located = useMemo(() => jobs.filter((j) => Number.isFinite(j.latitude) && Number.isFinite(j.longitude) && !(j.latitude === 0 && j.longitude === 0)), [jobs]);
  const live = useMemo(() => {
    const onBoard = new Set(jobs.map((j) => j.id)); // a technician is shown on the day whose job they are heading for
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
  const { unassigned, groups } = groupJobs(jobs, technicianId);

  const note = positionFailures >= 2 ? 'Live positions could not be refreshed: what is shown may be out of date.'
    : !watchers ? 'Job locations. Technician positions are for dispatchers.'
    : positions.enabled === false ? 'Job locations. Live position is switched off for this company.'
        : live.length ? 'Job locations and the technicians who are on the way, updated every few seconds.' : 'Job locations. No technician is on the way right now.';

  let mapView = null;
  if (googleKey && !googleFailed) mapView = google ? <GoogleMap view={google} anchorRef={legendRef} jobs={located} positions={live} onSelectJob={open} /> : null;
  else mapView = <DrawMap jobs={located} positions={live} selectedId={null} onSelectJob={open} streets={streets} />;

  let main;
  if (status === 'loading') main = <Spinner />;
  else if (status === 'error') main = <ErrorBox error={error} />;
  else if (status === 'empty') main = <Empty text="No jobs for this day." />;
  else {
    main = (
      <>
        {unassigned.length ? (
          <section aria-label="Jobs that need a technician"><h2>{`Needs a technician (${unassigned.length})`}</h2>
            <div className="stack">{unassigned.map((j) => <JobCard key={j.id} job={j} onOpen={open} onStep={step} />)}</div></section>
        ) : null}
        {groups.map((g) => (
          <section key={g.technicianId} aria-label={`${g.name}'s day`}><h2>{g.name}<small className="muted">{` (${g.jobs.length})`}</small></h2>
            <div className="stack">{g.jobs.map((j) => <JobCard key={j.id} job={j} onOpen={open} onStep={step} />)}</div></section>
        ))}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Jobs" subtitle="Technicians' days, in visit order">
        <button type="button" className="btn btn--ghost" aria-label="Previous day" onClick={() => go(addDays(date, -1))}>‹</button>
        <input type="date" value={pickerValue} aria-label="Day" onChange={(e) => { setPickerValue(e.target.value); if (e.target.value) go(e.target.value); }} />
        <button type="button" className="btn btn--ghost" aria-label="Next day" onClick={() => go(addDays(date, 1))}>›</button>
        <button type="button" className="btn btn--ghost" onClick={() => go(todayIn())}>Today</button>
      </PageHeader>
      <div className="row wrap" aria-label="Summary of the day">
        {hasJobs ? Object.entries(counts).map(([key, n]) => <Badge key={key} text={`${PROGRESS[key][0]}: ${n}`} tone={PROGRESS[key][1]} />) : null}
      </div>
      <section className="map-panel" aria-label="Map" hidden={!located.length}>
        {located.length ? (
          <>
            <div className="map-panel__head"><h2>Map</h2><span className="muted">{note}</span>
              <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowMap((v) => !v)}>{showMap ? 'Hide map' : 'Show map'}</button></div>
            {showMap ? (
              <>
                {mapView}
                <Legend ref={legendRef} />
                {live.length ? (
                  <ul className="live-list" aria-label="Technicians on the way">
                    {live.map((p, i) => <li key={i}><strong>{p.name}</strong>{' — '}{etaText(p)}</li>)}
                  </ul>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </section>
      <div className="two-col">
        <nav className="side-list" aria-label="Technicians">
          {hasJobs ? (
            <>
              <button type="button" className={`side-item ${!technicianId ? 'side-item--on' : ''}`} onClick={() => setTechnicianId(null)}>All technicians<span className="count">{jobs.length}</span></button>
              {[...people].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => (
                <button type="button" key={id} className={`side-item ${technicianId === id ? 'side-item--on' : ''}`} onClick={() => setTechnicianId(id)}>
                  {name}<span className="count">{jobs.filter((j) => j.technician_id === id).length}</span>
                </button>
              ))}
            </>
          ) : null}
        </nav>
        <div className="stack">{main}</div>
      </div>
      {opened ? <JobDrawer job={opened} reload={reload} onClose={() => setOpened(null)} /> : null}
    </>
  );
}
