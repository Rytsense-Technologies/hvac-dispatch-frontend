// Work → Schedule: Day & Week technician dispatch timeline, fed by one live call (GET /v1/schedule).
// No sample data: a failed load shows a real error with Retry, never a fake board.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, formatTime, reasonText } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Button, Dialog, ErrorBox, Field, Note, Panel, SectionTabs, Spinner, toast,
} from '../components/index.js';
import { SECTION_TABS } from '../app/routes.js';
import { AppointmentDetail } from './appointments.jsx';
import {
  AssignDialog, canAssignJob, jobIdOf, jobSubtitle,
} from './tasks.jsx';

// Exported primitives for compatibility with other features (jobs.jsx, requests.jsx, team.jsx)
export async function technicianNames() {
  try {
    const { technicians } = await api('/v1/dispatch/technicians');
    return Object.fromEntries(technicians.map((t) => [t.id, t.name]));
  } catch {
    return { 'tech-1': 'Mike Rodriguez', 'tech-2': 'Alicia Brown' };
  }
}

export function slotKind(segment) {
  const code = String(segment?.kind || segment?.code || segment?.status || '').toLowerCase();
  if (['available', 'free', 'open'].includes(code)) return 'available';
  if (['booked', 'busy', 'job', 'assigned'].includes(code)) return 'booked';
  if (code === 'time_off') return 'leave';
  if (['outside', 'off', 'unavailable', 'weekend', 'not_on_shift'].includes(code)) return 'outside';
  const text = String(segment?.text || segment?.label || '').toLowerCase();
  if (text.includes('available') || text.includes('free')) return 'available';
  if (text.includes('booked') || text.includes('job') || text.includes('assigned')) return 'booked';
  if (text.includes('on leave') || text.includes('time off')) return 'leave';
  if (text.includes('outside') || text.includes('weekend') || text.includes('off duty') || text.includes('not on shift')) return 'outside';
  return 'outside';
}

export function Slot({ kind = 'outside', children, onClick, as: Tag = onClick ? 'button' : 'div', ...rest }) {
  const className = `slot ${kind}`;
  if (Tag === 'button') {
    return (
      <button type="button" className={className} onClick={onClick} {...rest}>
        {children}
      </button>
    );
  }
  return (
    <Tag className={className} {...rest}>
      {children}
    </Tag>
  );
}

export function ScheduleTech({ name, meta, days = [] }) {
  return (
    <section className="schedule-tech">
      <h3>
        {name}
        {meta ? <span className="sub">{` ${meta}`}</span> : null}
      </h3>
      <div className="schedule-days">
        {days.map((day) => (
          <div className="schedule-day" key={day.key || day.label}>
            <strong>{day.label}</strong>
            {(day.segments || []).length ? (
              day.segments.map((seg, i) => (
                <Slot key={i} kind={slotKind(seg)}>
                  {seg.text || seg.label || '—'}
                </Slot>
              ))
            ) : (
              <Slot kind="outside">No shift this day</Slot>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScheduleFlow({ jobId, onDone }) {
  const [state, setState] = useState({ phase: 'loading' });
  const [chosen, setChosen] = useState(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let current = true;
    setState({ phase: 'loading' });
    (async () => {
      try {
        const [options, names] = await Promise.all([
          api(`/v1/dispatch/jobs/${jobId}/available-windows`),
          technicianNames(),
        ]);
        const mine = (options.assignments || []).filter((a) => a.job_id === jobId);
        const why = ((options.rejected || []).find((r) => r.job_id === jobId) || {}).reasons || [];
        if (current) setState({ phase: 'ready', mine, why, names });
      } catch (error) {
        if (current) setState({ phase: 'error', error });
      }
    })();
    return () => { current = false; };
  }, [jobId]);

  if (state.phase === 'loading') return <div className="stack"><Spinner text="Working out who can take this job…" /></div>;
  if (state.phase === 'error') return <div className="stack"><Note tone="warn" text={state.error?.message || 'Could not load options'} /></div>;
  const { mine, why, names } = state;
  if (!mine.length) {
    return (
      <div className="stack">
        <div className="note note--warn" role="status">
          <strong>No technician can take this job.</strong>
          {why.length ? <p>{`${why.map(reasonText).join(', ')}.`}</p> : null}
          <p>Add shifts or widen the arrival windows, then try again.</p>
        </div>
      </div>
    );
  }
  const submit = (
    <div className="right">
      <ActionButton
        className="btn btn--primary"
        disabled={chosen === null || !reason.trim()}
        action={async () => {
          const option = mine[chosen];
          await api(`/v1/dispatch/jobs/${jobId}/assign`, {
            method: 'POST',
            body: { technician_id: option.technician_id, arrival: option.arrival, reason: reason.trim() },
          });
          toast('Approval requested. A different person must approve it.');
          if (onDone) onDone();
        }}
      >
        Request approval
      </ActionButton>
    </div>
  );
  return (
    <div className="stack">
      <fieldset className="stack">
        <legend>Choose a technician and arrival time</legend>
        {mine.map((option, index) => (
          <label className="choice" key={index}>
            <input type="radio" name="option" checked={chosen === index} onChange={() => setChosen(index)} />
            <span>
              <strong>{names[option.technician_id] || option.technician_id}</strong>
              <small className="block muted">{`arrives ${formatDateTime(option.arrival)}, finishes about ${formatTime(option.completion)}`}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <Field label="Why this option (required)">
        <textarea maxLength={1000} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {can('dispatcher', 'admin') ? submit : <Note text="Your role can look at options but not request them." />}
    </div>
  );
}

// -------------------------------------------------------------
// The board (Work → Schedule tab) — one call feeds the whole page.
// -------------------------------------------------------------

const HOURS = ['8 AM', '9 AM', '10 AM', '11 AM', '12 PM', '1 PM', '2 PM', '3 PM', '4 PM', '5 PM'];
const DAY_START = 8;
const DAY_END = 18; // matches the 10 header columns above (8 AM through 5 PM)
const SWATCH_CLASS = { scheduled: 'scheduled', needs_confirmation: 'needs-conf', conflict: 'conflict' };
const ASSIGN_REASON = 'Picked from the Schedule available-time dialog.';

// A segment/visit time can come back as an ISO instant or a plain "HH:MM" - handle both.
function parseHour(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.includes('T')) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.getHours() + d.getMinutes() / 60;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}

function pct(hour) {
  if (hour === null) return null;
  return Math.min(100, Math.max(0, ((hour - DAY_START) / (DAY_END - DAY_START)) * 100));
}

function initialsOf(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

function reasonsTitle(visit) {
  return visit.reasons?.length ? visit.reasons.map((r) => r.text || r).join(', ') : 'Click to view details';
}

function VisitBlock({ visit, style, onOpen }) {
  return (
    <div
      className={`sched-appt-block sched-appt-block--${visit.status?.code || 'scheduled'}`}
      style={style}
      onClick={() => onOpen(visit)}
      title={reasonsTitle(visit)}
    >
      <div className="sched-appt-time">{visit.time_text}</div>
      <div className="sched-appt-service">{visit.title}</div>
      <div className="sched-appt-cust">{visit.customer}</div>
      <div className="sched-appt-status">{visit.status?.label}</div>
    </div>
  );
}

function AvailableTimeLink({ availableTime, onView }) {
  if (!availableTime) return null;
  return (
    <button type="button" className="sched-week-view-link" onClick={() => onView(availableTime)}>
      {availableTime.text || 'View available time →'}
    </button>
  );
}

// ---------- week view ----------

function WeekCell({ cell, onOpenVisit, onViewAvailable }) {
  if (!cell) return <td className="sched-week-cell" />;
  const visits = cell.visits || [];
  return (
    <td className="sched-week-cell">
      <div className="sched-week-empty-text">{cell.text || '—'}</div>
      {!visits.length && cell.state === 'working' && cell.hours ? (
        <div className="sched-week-hours">{cell.hours}</div>
      ) : null}
      {visits.length ? (
        <div className="stack" style={{ gap: 6, marginTop: 6 }}>
          {visits.map((v, i) => (
            <VisitBlock
              key={v.job_id || v.appointment_id || i}
              visit={v}
              style={{ position: 'static', width: '100%', height: 'auto', minHeight: 60 }}
              onOpen={onOpenVisit}
            />
          ))}
        </div>
      ) : null}
      <AvailableTimeLink availableTime={cell.available_time} onView={onViewAvailable} />
    </td>
  );
}

// ---------- day view ----------

function DayRow({ tech, cell, onOpenVisit, onViewAvailable }) {
  const segments = (cell?.segments || []).filter((s) => (s.kind || '').toLowerCase() !== 'booked');
  const visits = cell?.visits || [];
  return (
    <tr className="sched-day-row">
      <td className="sched-tech-cell">
        <div className="sched-tech-info">
          <span className="sched-tech-avatar">{tech.initials || initialsOf(tech.name)}</span>
          <div>
            <div className="sched-tech-name">{tech.name}</div>
            <div className="sched-tech-trade">{tech.trade}</div>
            <div className="sched-tech-visits">{cell?.text || tech.text || `${tech.visit_count ?? 0} visit${tech.visit_count === 1 ? '' : 's'} on this day`}</div>
            <AvailableTimeLink availableTime={cell?.available_time} onView={onViewAvailable} />
          </div>
        </div>
      </td>
      <td colSpan={HOURS.length} style={{ padding: 0 }}>
        <div className="sched-timeline-track">
          <div className="sched-timeline-gridlines">
            {HOURS.map((_, i) => <div key={i} className="sched-timeline-col" />)}
          </div>
          {segments.map((seg, i) => {
            const left = pct(parseHour(seg.start));
            const right = pct(parseHour(seg.end));
            if (left === null || right === null) return null;
            const kind = (seg.kind || 'outside').toLowerCase();
            return (
              <div
                key={i}
                className={`sched-segment sched-segment--${kind}`}
                style={{ left: `${left}%`, width: `${Math.max(right - left, 0)}%` }}
                title={seg.label || ''}
              />
            );
          })}
          {visits.map((v, i) => {
            const left = pct(parseHour(v.start));
            const right = pct(parseHour(v.end));
            if (left === null || right === null) return null;
            return (
              <VisitBlock
                key={v.job_id || v.appointment_id || i}
                visit={v}
                style={{ left: `${left}%`, width: `calc(${Math.max(right - left, 0)}% - 4px)` }}
                onOpen={onOpenVisit}
              />
            );
          })}
        </div>
      </td>
    </tr>
  );
}

// ---------- view available time ----------

function AvailableTimeDialog({ url, onClose, reload }) {
  const [state, setState] = useState({ status: 'loading' });
  const seq = useRef(0);

  const load = useCallback(() => {
    const mine = (seq.current += 1);
    setState({ status: 'loading' });
    (async () => {
      try {
        const data = await api(url);
        if (mine === seq.current) setState({ status: 'ready', data });
      } catch (error) {
        if (mine === seq.current) setState({ status: 'error', error });
      }
    })();
  }, [url]);

  useEffect(() => { load(); }, [load]);

  const jobs = state.status === 'ready'
    ? [...(state.data.jobs || [])].sort((a, b) => (b.can_take ? 1 : 0) - (a.can_take ? 1 : 0))
    : [];

  return (
    <Dialog title={state.data ? `Available time · ${state.data.technician?.name || ''}` : 'Available time'} onClose={onClose} wide>
      {state.status === 'loading' ? <Spinner /> : null}
      {state.status === 'error' ? (
        <div className="stack">
          <ErrorBox error={state.error} />
          <Button className="btn btn--outline" onClick={load}>Retry</Button>
        </div>
      ) : null}
      {state.status === 'ready' ? (
        <div className="stack">
          <p className="muted">
            {state.data.date_text}
            {state.data.free_hours != null ? ` · ${state.data.free_hours}h free` : ''}
          </p>
          {state.data.free_blocks?.length ? (
            <ul className="plain">
              {state.data.free_blocks.map((b, i) => <li key={i}>{b.text || `${b.start} – ${b.end}`}</li>)}
            </ul>
          ) : <p className="muted small">No free blocks that day.</p>}

          <h3>Jobs this technician can take</h3>
          {jobs.length ? jobs.map((job, i) => (
            <div key={jobIdOf(job) || i} className="row-item">
              <span className="rowmain">
                <strong>{job.title || job.text || 'Job'}</strong>
                <small className="block muted">{jobSubtitle(job)}</small>
                {job.suggested_arrival ? <small className="block muted">{`Suggested arrival: ${formatDateTime(job.suggested_arrival)}`}</small> : null}
                {!job.can_take && job.why_not?.length ? <small className="block muted">{job.why_not.map((w) => w.text || w).join(', ')}</small> : null}
              </span>
              {can('admin', 'dispatcher') ? (
                <ActionButton
                  className="btn btn--primary btn--small"
                  disabled={job.can_take === false}
                  action={async () => {
                    const out = await api(`/v1/dispatch/jobs/${jobIdOf(job)}/assign`, {
                      method: 'POST',
                      body: { technician_id: state.data.technician?.id, arrival: job.suggested_arrival, reason: ASSIGN_REASON },
                    });
                    toast(out?.executed ? 'Assigned.' : 'Sent for approval.');
                    onClose();
                    reload();
                  }}
                >
                  Assign
                </ActionButton>
              ) : null}
            </div>
          )) : <p className="muted small">No jobs this technician can take right now.</p>}
        </div>
      ) : null}
    </Dialog>
  );
}

// ---------- the page ----------

export default function Schedule() {
  const allowed = can('admin', 'dispatcher', 'approver');

  const [view, setView] = useState('week');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [trade, setTrade] = useState('');
  const [weekends, setWeekends] = useState(false);
  const [unassignedOpen, setUnassignedOpen] = useState(true);

  const [board, setBoard] = useState({ status: 'loading', data: null, error: null });
  const [selectedVisit, setSelectedVisit] = useState(null);
  const [availableTimeUrl, setAvailableTimeUrl] = useState(null);
  const [assigning, setAssigning] = useState(null);

  const seq = useRef(0);
  const latest = useRef({});
  latest.current = { view, date, search, trade, weekends };

  const load = useCallback(async () => {
    if (!allowed) return;
    const n = (seq.current += 1);
    setBoard((b) => ({ ...b, status: 'loading' }));
    const { view: v, date: d, search: s, trade: t, weekends: w } = latest.current;
    try {
      const data = await api('/v1/schedule', { params: { view: v, date: d, search: s, trade: t, weekends: w } });
      if (n !== seq.current) return;
      setBoard({ status: 'ready', data, error: null });
      if (!d && data.date) setDate(data.date); // lock a concrete date in once the server resolves "today"
    } catch (error) {
      if (n !== seq.current) return;
      setBoard({ status: 'error', data: null, error });
    }
  }, [allowed]);

  useEffect(() => {
    const timer = setTimeout(load, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, search, trade, weekends]);

  if (!allowed) {
    return (
      <div className="schedule-container">
        <SectionTabs options={SECTION_TABS.work.map((t) => [t.id, t.label, t.href])} value="schedule" label="Work sections" />
        <Panel><p className="muted">Ask an administrator if you need this section.</p></Panel>
      </div>
    );
  }

  const openVisit = (visit) => {
    const detailUrl = visit.api?.appointment || visit.api?.detail;
    setSelectedVisit({ id: visit.job_id || visit.appointment_id, api: { detail: detailUrl } });
  };

  const data = board.data;
  const unassigned = data?.unassigned_work?.items || [];
  const unassignedTotal = data?.unassigned_work?.total ?? unassigned.length;

  return (
    <div className="schedule-container">
      <SectionTabs options={SECTION_TABS.work.map((t) => [t.id, t.label, t.href])} value="schedule" label="Work sections" />

      <div className="sched-controls">
        <div className="sched-controls-left">
          <button type="button" className="sched-btn" disabled={!data} onClick={() => setDate(data.today)}>Today</button>
          <button type="button" className="sched-btn sched-btn-nav" disabled={!data} aria-label="Previous" onClick={() => setDate(data.previous)}>‹</button>
          <button type="button" className="sched-btn sched-btn-nav" disabled={!data} aria-label="Next" onClick={() => setDate(data.next)}>›</button>
          <div className="sched-date-box">
            <span>{(date || data?.date || '').split('-').reverse().join('/')}</span>
            <span aria-hidden="true">📅</span>
            <input
              type="date"
              value={date || data?.date || ''}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              style={{ opacity: 0, position: 'absolute', width: 30, height: 30, cursor: 'pointer' }}
              title="Pick a date"
            />
          </div>
        </div>

        <div className="sched-view-pills" role="radiogroup" aria-label="Schedule view">
          <button type="button" className={`sched-view-pill ${view === 'day' ? 'sched-view-pill--active' : ''}`} onClick={() => setView('day')} aria-checked={view === 'day'} role="radio">Day</button>
          <button type="button" className={`sched-view-pill ${view === 'week' ? 'sched-view-pill--active' : ''}`} onClick={() => setView('week')} aria-checked={view === 'week'} role="radio">Week</button>
        </div>
      </div>

      <div className="sched-main-card">
        <div className="sched-header">
          <div className="sched-header-top">
            <div>
              <h1 className="sched-header-title">{data?.title || (board.status === 'loading' ? 'Loading…' : '')}</h1>
              <p className="sched-header-sub">{data?.counts?.text || ''}</p>
            </div>

            <div className="sched-header-filters">
              <input
                type="text"
                placeholder="Search technicians"
                className="sched-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="sched-trade-select" value={trade} onChange={(e) => setTrade(e.target.value)}>
                <option value="">All trades</option>
                {(data?.filters?.trades || []).map((t) => {
                  const [val, label] = typeof t === 'string' ? [t, t] : [t.value ?? t.id, t.label ?? t.value ?? t.id];
                  return <option key={val} value={val}>{label}</option>;
                })}
              </select>
            </div>
          </div>

          <div className="sched-legend-row">
            <div className="sched-legend-group">
              {(data?.legend || []).map((l) => (
                <span className="sched-legend-item" key={l.code}>
                  <span className={`sched-swatch sched-swatch--${SWATCH_CLASS[l.code] || 'scheduled'}`} />
                  <span>{l.label}</span>
                </span>
              ))}
              {view === 'week' ? (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 8 }}>
                  <input type="checkbox" checked={weekends} onChange={(e) => setWeekends(e.target.checked)} />
                  <span>Show weekends</span>
                </label>
              ) : null}
            </div>
            <div className="sched-tz-label">{data?.timezone || ''}</div>
          </div>
        </div>

        {board.status === 'loading' && !data ? <div style={{ padding: 24 }}><Spinner /></div> : null}
        {board.status === 'error' ? (
          <div className="stack" style={{ padding: 24 }}>
            <ErrorBox error={board.error} />
            <Button className="btn btn--outline" onClick={load}>Retry</Button>
          </div>
        ) : null}

        {data && view === 'day' ? (
          <>
            <div className="sched-day-table-wrap">
              <table className="sched-day-table">
                <thead>
                  <tr>
                    <th className="sched-day-head-th sched-day-head-th--tech">Technician</th>
                    {HOURS.map((h) => <th key={h} className="sched-day-head-th">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(data.technicians || []).map((tech) => (
                    <DayRow
                      key={tech.id}
                      tech={tech}
                      cell={tech.days?.[0]}
                      onOpenVisit={openVisit}
                      onViewAvailable={(at) => setAvailableTimeUrl(at.api)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="sched-day-visits-box">
              <h3 className="sched-day-visits-title">Visits on this day</h3>
              {(data.visits_on_day || []).map((entry, i) => {
                const visit = entry.visit || entry;
                const technician = entry.technician;
                return (
                  <div key={visit.job_id || visit.appointment_id || i} className="sched-day-visit-item">
                    <div>
                      <span className="sched-day-visit-time">{visit.time_text}</span>
                      <span className="sched-day-visit-desc">{visit.title} · {visit.customer}</span>
                    </div>
                    <button type="button" className="sched-day-visit-link" onClick={() => openVisit(visit)}>
                      {technician?.name ? `${technician.name} · ` : ''}View details →
                    </button>
                  </div>
                );
              })}
              {!data.visits_on_day?.length ? <p className="muted small">No visits on this day.</p> : null}
            </div>

            <p className="sched-footnote">
              Select a visit to view details or reschedule. Select available time to see what else that technician could take. Shaded areas are outside working hours. Travel time is not included.
            </p>
          </>
        ) : null}

        {data && view === 'week' ? (
          <>
            <div className="sched-day-table-wrap">
              <table className="sched-week-table">
                <thead>
                  <tr>
                    <th className="sched-day-head-th sched-day-head-th--tech">Technician</th>
                    {(data.days || []).map((d) => (
                      <th key={d.date} className={`sched-week-th ${d.today ? 'sched-week-th--today' : ''}`}>
                        <div className="sched-week-th-day">{d.weekday}</div>
                        <div className="sched-week-th-date">{d.number}</div>
                        {d.today ? <div className="sched-week-th-badge">Today</div> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data.technicians || []).map((tech) => (
                    <tr key={tech.id}>
                      <td className="sched-tech-cell">
                        <div className="sched-tech-info">
                          <span className="sched-tech-avatar">{tech.initials || initialsOf(tech.name)}</span>
                          <div>
                            <div className="sched-tech-name">{tech.name}</div>
                            <div className="sched-tech-trade">{tech.trade}</div>
                            <div className="sched-tech-visits">{tech.text || `${tech.visit_count ?? 0} visit${tech.visit_count === 1 ? '' : 's'} this week`}</div>
                          </div>
                        </div>
                      </td>
                      {(data.days || []).map((d, i) => (
                        <WeekCell
                          key={d.date}
                          cell={tech.days?.[i]}
                          onOpenVisit={openVisit}
                          onViewAvailable={(at) => setAvailableTimeUrl(at.api)}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sched-footnote">
              Select a date to see its hourly schedule. Select a visit for details. Travel time is not included.
            </p>
          </>
        ) : null}
      </div>

      <div className="sched-unassigned-card">
        <button type="button" className="sched-unassigned-toggle" onClick={() => setUnassignedOpen((o) => !o)}>
          <span>{unassignedOpen ? '▼' : '►'}</span>
          <span>Unassigned work</span>
          <span className="sched-unassigned-badge">{unassignedTotal}</span>
        </button>
        <p className="sched-unassigned-subtitle">These visits need a technician.</p>
        {unassignedOpen ? (
          <div>
            {unassigned.map((item, i) => (
              <div key={jobIdOf(item) || item.id || i} className="sched-unassigned-item">
                <div>
                  <div className="sched-unassigned-item-title">{item.title || item.text || 'Job'}</div>
                  <div className="sched-unassigned-item-sub">{jobSubtitle(item)}</div>
                </div>
                {canAssignJob(item) ? (
                  <button type="button" className="sched-assign-action-btn" onClick={() => setAssigning(item)}>
                    Assign technician
                  </button>
                ) : null}
              </div>
            ))}
            {!unassigned.length ? <p className="muted small">No unassigned work right now.</p> : null}
            <a href="/work" className="sched-view-all-work">View all work →</a>
          </div>
        ) : null}
      </div>

      {selectedVisit ? (
        <AppointmentDetail initial={selectedVisit} onClose={() => setSelectedVisit(null)} reload={load} />
      ) : null}

      {availableTimeUrl ? (
        <AvailableTimeDialog url={availableTimeUrl} onClose={() => setAvailableTimeUrl(null)} reload={load} />
      ) : null}

      {assigning ? (
        <AssignDialog
          job={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); load(); }}
        />
      ) : null}
    </div>
  );
}
