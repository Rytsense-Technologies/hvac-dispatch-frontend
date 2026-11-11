// Reports: sparse operational metrics matching the reference Reports screen.
// Period (Today / This week) drives live counts; CTAs deep-link to Appointments and Admin automation.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { addDays, dayOf, todayIn, weekdayOf } from '../lib/format.js';
import {
  Empty, ErrorBox, PageHeader, Panel, Row, Spinner,
} from '../components/index.js';

const PERIODS = [
  { id: 'week', label: 'This week', api: 'week' },
  { id: 'today', label: 'Today', api: 'today' },
];

const APPOINTMENTS_HREF = '#/work/appointments';
const REVIEW_HREF = '#/automation';

function firstDefined(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function asVisits(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  // Appointments screen uses /v1/appointments/schedule → visits.
  return payload.visits || payload.appointments || payload.items || payload.rows || [];
}

function isCanceled(item) {
  const status = String(
    item.status?.label || item.status || item.confirmation?.label || item.confirmation || '',
  ).toLowerCase();
  return status.includes('cancel');
}

/** Company-local calendar day (YYYY-MM-DD) for a visit start, or null if unknown. */
function visitLocalDay(item) {
  const raw = firstDefined(item.start_at, item.starts_at, item.scheduled_at, item.when, item.day);
  if (raw == null || raw === '') return null;
  const text = String(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  try {
    return dayOf(text);
  } catch {
    return null;
  }
}

/** Calendar week [start, end] in company TZ (Sunday–Saturday, matching en-US weekdayOf). */
function calendarWeekBounds(dayIso = todayIn()) {
  const weekStart = addDays(dayIso, -weekdayOf(dayIso));
  const weekEnd = addDays(weekStart, 6);
  return { weekStart, weekEnd };
}

function metricFromUnknown(entry, fallback) {
  if (!entry || typeof entry !== 'object') return { ...fallback };
  const title = entry.title || entry.label || entry.name || fallback.title;
  const definition = entry.definition || entry.description || entry.text || entry.sub || fallback.definition;
  const value = firstDefined(entry.value, entry.count, entry.total, entry.number, fallback.value);
  const action = entry.action || entry.cta || {};
  const cta = action.label || entry.cta_label || entry.button || fallback.cta;
  const href = firstDefined(action.href, action.url, entry.href, fallback.href);
  return { title, definition, value, cta, href };
}

function normalizeReportsPayload(data, periodLabel) {
  if (!data || typeof data !== 'object') return null;

  if (Array.isArray(data.metrics) && data.metrics.length) {
    return {
      periodLabel: data.period_label || data.periodLabel || data.heading || periodLabel,
      metrics: data.metrics.map((m, i) => metricFromUnknown(m, {
        title: `Metric ${i + 1}`,
        definition: '',
        value: '—',
        cta: 'View',
        // Leave href unset so loadReports can apply product destinations.
      })),
      foot: data.foot || data.footnote || data.note || null,
    };
  }

  // Nullish selection: valid numeric 0 must not fall through to composed data.
  const appointments = firstDefined(data.appointments, data.appointment, data.bookings);
  const reviews = firstDefined(data.reviews, data.review, data.automation, data.needs_review, data.ai_actions);
  if (appointments !== undefined || reviews !== undefined) {
    return {
      periodLabel: data.period_label || data.periodLabel || periodLabel,
      metrics: [
        metricFromUnknown(typeof appointments === 'object' ? appointments : { value: appointments }, {
          title: 'Appointments in sample workspace',
          definition: 'Count of non-canceled sample appointments; not actual business bookings.',
          value: typeof appointments === 'number' ? appointments : 0,
          cta: 'View appointments',
          href: APPOINTMENTS_HREF,
        }),
        metricFromUnknown(typeof reviews === 'object' ? reviews : { value: reviews }, {
          title: 'AI actions awaiting review',
          definition: 'Sample items with a needs-review or needs-approval status.',
          value: typeof reviews === 'number' ? reviews : 0,
          cta: 'View review queue',
          href: REVIEW_HREF,
        }),
      ],
      foot: data.foot || data.footnote || data.note || null,
    };
  }

  return null;
}

function settled(promise) {
  return promise.then(
    (data) => ({ ok: true, data }),
    (error) => ({ ok: false, error }),
  );
}

async function loadComposed(periodId) {
  const today = todayIn();
  const { weekStart, weekEnd } = calendarWeekBounds(today);

  const [appointmentsRes, automationRes] = await Promise.all([
    settled(api('/v1/appointments/schedule', {
      params: {
        // Need past + upcoming days of the calendar week, not only upcoming.
        scope: periodId === 'today' ? 'upcoming' : 'all',
        limit: 500,
      },
    })),
    settled(api('/v1/automation', { params: { limit: 100 } })),
  ]);

  let appointmentValue = '—';
  let appointmentUnavailable = false;
  if (!appointmentsRes.ok) {
    appointmentUnavailable = true;
  } else {
    let items = asVisits(appointmentsRes.data).filter((a) => !isCanceled(a));
    if (periodId === 'today') {
      items = items.filter((a) => {
        const day = visitLocalDay(a);
        return day == null ? false : day === today;
      });
    } else {
      items = items.filter((a) => {
        const day = visitLocalDay(a);
        return day != null && day >= weekStart && day <= weekEnd;
      });
    }
    appointmentValue = items.length;
  }

  let reviewValue = '—';
  let reviewUnavailable = false;
  if (!automationRes.ok) {
    reviewUnavailable = true;
  } else {
    const auto = automationRes.data;
    reviewValue = firstDefined(
      auto?.needs_review?.total,
      Array.isArray(auto?.needs_review?.items) ? auto.needs_review.items.length : undefined,
      auto?.pending,
      0,
    );
  }

  return {
    periodLabel: periodId === 'today' ? 'Today' : 'This week',
    metrics: [
      {
        title: 'Appointments in sample workspace',
        definition: appointmentUnavailable
          ? 'Appointments could not be loaded for this period.'
          : 'Count of non-canceled sample appointments; not actual business bookings.',
        value: appointmentValue,
        unavailable: appointmentUnavailable,
        cta: 'View appointments',
        href: APPOINTMENTS_HREF,
      },
      {
        title: 'AI actions awaiting review',
        definition: reviewUnavailable
          ? 'Review queue could not be loaded.'
          : 'Sample items with a needs-review or needs-approval status.',
        value: reviewValue,
        unavailable: reviewUnavailable,
        cta: 'View review queue',
        href: REVIEW_HREF,
      },
    ],
    foot: 'Appointments are filtered by the selected period; review items show the current queue.',
  };
}

async function loadReports(periodId) {
  const period = PERIODS.find((p) => p.id === periodId) || PERIODS[0];
  try {
    const data = await api('/v1/reports', { params: { period: period.api } });
    const normalized = normalizeReportsPayload(data, period.label);
    if (normalized?.metrics?.length) {
      const metrics = normalized.metrics.map((m, i) => ({
        ...m,
        href: m.href || (i === 0 ? APPOINTMENTS_HREF : REVIEW_HREF),
        cta: m.cta || (i === 0 ? 'View appointments' : 'View review queue'),
      }));
      return { ...normalized, metrics, periodLabel: normalized.periodLabel || period.label };
    }
  } catch {
    // Fall through to composed live sources.
  }
  return loadComposed(periodId);
}

function MetricRows({ metrics }) {
  if (!metrics?.length) return <Empty text="No metrics for this period." />;
  return (
    <ul className="reports-metric-list">
      {metrics.map((m) => {
        const href = m.href ? (m.href.startsWith('#') ? m.href : `#${m.href}`) : null;
        return (
          <li key={`${m.title}-${href || 'none'}`}>
            <Row
              title={m.title}
              subtitle={m.definition}
              trailing={(
                <>
                  <strong className={`reports-metric-value${m.unavailable ? ' reports-metric-value--unavailable' : ''}`}>
                    {m.unavailable ? 'Unavailable' : (m.value ?? '—')}
                  </strong>
                  {href ? <a className="btn agent-btn" href={href}>{m.cta}</a> : null}
                </>
              )}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default function Reports() {
  const [periodId, setPeriodId] = useState('week');
  const [state, setState] = useState({ status: 'loading' });
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setState({ status: 'loading' });
    loadReports(periodId).then(
      (data) => { if (n === seq.current) setState({ status: 'ready', data }); },
      (error) => { if (n === seq.current) setState({ status: 'error', error }); },
    );
    return () => { seq.current += 1; };
  }, [periodId]);

  const periodLabel = PERIODS.find((p) => p.id === periodId)?.label || 'This week';

  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else body = <MetricRows metrics={state.data?.metrics} />;

  return (
    <>
      <style>{`
        .reports-period {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--muted);
          white-space: nowrap;
        }
        .reports-period select {
          width: auto;
          min-width: 9.5rem;
          height: 38px;
          padding: 8px 12px;
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          background: var(--surface);
          color: var(--ink);
          font: inherit;
        }
        .reports-panel > h2 {
          margin: 0 0 4px;
          font-size: var(--font-size-h2);
          color: var(--ink);
        }
        .reports-metric-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .reports-metric-list > li { margin: 0; padding: 0; }
        .reports-metric-value {
          min-width: 1.5rem;
          text-align: right;
          font-size: 16px;
          font-weight: var(--font-weight-semibold);
          color: var(--ink);
        }
        .reports-metric-value--unavailable {
          font-size: 12px;
          font-weight: var(--font-weight-semibold);
          color: var(--muted);
        }
        .reports-foot {
          margin: 18px 0 0;
          color: #526b7b;
          font-size: 12px;
          font-style: italic;
        }
      `}</style>

      <PageHeader
        eyebrow="PERFORMANCE"
        title="Reports"
        subtitle="Sample operational metrics and definitions."
        meta={(
          <label className="reports-period">
            Period
            <select
              aria-label="Period"
              value={periodId}
              onChange={(e) => setPeriodId(e.target.value)}
            >
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
      />

      <Panel className="reports-panel" aria-label="Report metrics">
        <h2>{state.data?.periodLabel || periodLabel}</h2>
        {body}
      </Panel>

      <p className="reports-foot">
        {state.data?.foot
          || 'Illustrative workspace data. Appointments are filtered by the selected period; review items show the current queue. No historical dataset is connected.'}
      </p>
    </>
  );
}
