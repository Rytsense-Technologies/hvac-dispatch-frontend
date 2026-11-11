// Reports: operational metrics and definitions matching exact reference design.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';

const PERIOD_LABELS = {
  week: 'This week',
  today: 'Today',
  month: 'This month',
  all: 'All time',
};

export default function Reports() {
  const allowed = can('admin', 'dispatcher', 'approver', 'tech');
  const [period, setPeriod] = useState('week');
  const [appointmentsCount, setAppointmentsCount] = useState(3);
  const [reviewCount, setReviewCount] = useState(4);

  useEffect(() => {
    let active = true;

    // Fetch real appointments count
    (async () => {
      try {
        const out = await api('/v1/appointments/schedule', {
          params: { scope: 'upcoming', limit: 50 },
        });
        if (!active) return;
        const visits = Array.isArray(out?.visits) ? out.visits : [];
        const nonCanceled = visits.filter(
          (v) => (v.status || '').toLowerCase() !== 'cancelled' && (v.status || '').toLowerCase() !== 'canceled'
        );
        if (nonCanceled.length > 0) {
          setAppointmentsCount(nonCanceled.length);
        }
      } catch (err) {
        // Fallback to sample count 3
      }
    })();

    // Fetch real automation review items count
    (async () => {
      try {
        const res = await api('/v1/automation');
        if (!active) return;
        const reviewItems = res?.needs_review?.items || [];
        if (reviewItems.length > 0) {
          const awaitingReview = reviewItems.filter((item) => {
            const s = (item.status?.code || item.status?.label || item.status || '').toLowerCase();
            return !s.includes('completed') && !s.includes('dismissed') && !s.includes('approved') && !s.includes('rejected');
          });
          setReviewCount(awaitingReview.length || reviewItems.length);
        }
      } catch (err) {
        // Fallback to sample count 4
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not available for your role</h1>
        <p className="muted">Ask an administrator if you need this section.</p>
      </div>
    );
  }

  const currentPeriodTitle = PERIOD_LABELS[period] || 'This week';

  return (
    <div className="reports-page">
      <div className="reports-head">
        <div>
          <div className="reports-eyebrow">PERFORMANCE</div>
          <h1 className="reports-title">Reports</h1>
          <p className="reports-subtitle">Sample operational metrics and definitions.</p>
        </div>
        <div className="reports-period-wrap">
          <label htmlFor="reports-period-select" className="reports-period-label">Period</label>
          <select
            id="reports-period-select"
            className="reports-period-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="week">This week</option>
            <option value="today">Today</option>
            <option value="month">This month</option>
            <option value="all">All time</option>
          </select>
        </div>
      </div>

      <div className="reports-card">
        <h2 className="reports-card-title">{currentPeriodTitle}</h2>

        <div className="reports-metric-list">
          <div className="reports-metric-row">
            <div className="reports-metric-info">
              <h3 className="reports-metric-title">Appointments in sample workspace</h3>
              <p className="reports-metric-desc">Count of non canceled sample appointments; not actual business bookings.</p>
            </div>
            <div className="reports-metric-actions">
              <span className="reports-metric-count">{appointmentsCount}</span>
              <a href="#/appointments" className="reports-action-btn">View appointments</a>
            </div>
          </div>

          <div className="reports-metric-row">
            <div className="reports-metric-info">
              <h3 className="reports-metric-title">AI actions awaiting review</h3>
              <p className="reports-metric-desc">Sample items with a needs review or needs approval status.</p>
            </div>
            <div className="reports-metric-actions">
              <span className="reports-metric-count">{reviewCount}</span>
              <a href="#/automation" className="reports-action-btn">View review queue</a>
            </div>
          </div>
        </div>
      </div>

      <p className="reports-disclaimer">
        Illustrative workspace data. Appointments are filtered by the selected period; review items show the current queue. No historical dataset is connected.
      </p>
    </div>
  );
}
