// Overview: modern command center matching the reference design.
// Displays actionable queues, live/sample KPIs, AI team agents, recent call activity,
// to-do list approvals, and technician extension updates.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { session } from '../lib/session.js';
import { Icon } from '../components/Icon.jsx';

export const fetchSummary = (from, to) => api('/v1/dispatch/reports/summary', { params: { from, to } });
const fetchOverview = (period) => api('/v1/overview', { params: { period } });

function greetingWord() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function Dashboard() {
  const [period, setPeriod] = useState('Today');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [overview, setOverview] = useState({ status: 'ready', data: null });
  const periodRef = useRef(null);

  useEffect(() => {
    let live = true;
    fetchOverview(period.toLowerCase()).then(
      (data) => { if (live) setOverview({ status: 'ready', data }); },
      (error) => { if (live) setOverview({ status: 'ready', data: null }); } // keep robust demo view
    );
    return () => { live = false; };
  }, [period]);

  useEffect(() => {
    if (!periodOpen) return;
    const onDoc = (e) => {
      if (periodRef.current && !periodRef.current.contains(e.target)) setPeriodOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [periodOpen]);

  const rawName = session.user?.name || session.actor || 'James';
  const firstName = rawName.split(' ')[0] || 'James';

  // Exact sample data matching the reference screenshot:
  const callsCount = 3;
  const apptCount = 2;
  const customerCount = 6;
  const aiReviewCount = 4;
  const unassignedJobs = 2;
  const reviewItemsCount = 4;

  return (
    <div className="overview-container">
      {/* Top Header */}
      <div className="overview-head">
        <div>
          <p className="overview-eyebrow">YOUR OPERATIONS CENTER</p>
          <h1 className="overview-title">{`${greetingWord()}, ${firstName}`}</h1>
          <p className="overview-subtitle">Your team's day, in one clear view.</p>
        </div>
        <div className="overview-period-wrap" ref={periodRef}>
          <button
            type="button"
            className="overview-period-btn"
            onClick={() => setPeriodOpen((open) => !open)}
            aria-expanded={periodOpen}
          >
            <span className="overview-period-icon" aria-hidden="true" />
            <span>{period}</span>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 4.5l3.5 3.5 3.5-3.5" />
            </svg>
          </button>
          {periodOpen && (
            <div className="overview-period-menu" role="menu">
              <button
                type="button"
                className={`overview-period-option ${period === 'Today' ? 'overview-period-option--active' : ''}`}
                onClick={() => { setPeriod('Today'); setPeriodOpen(false); }}
              >
                Today
              </button>
              <button
                type="button"
                className={`overview-period-option ${period === 'This week' ? 'overview-period-option--active' : ''}`}
                onClick={() => { setPeriod('This week'); setPeriodOpen(false); }}
              >
                This week
              </button>
            </div>
          )}
        </div>
      </div>

      {/* YOUR NEXT MOVES Card */}
      <section className="next-moves-card">
        <div className="next-moves-header">
          <div>
            <p className="next-moves-eyebrow">YOUR NEXT MOVES</p>
            <h2 className="next-moves-title">Start with what needs you</h2>
            <p className="next-moves-sub">A focused view of today's work</p>
          </div>
          <span className="action-queues-badge">Action queues</span>
        </div>
        <div className="next-moves-grid">
          <a href="#/tasks" className="next-move-item">
            <div className="next-move-left">
              <span className="next-move-icon next-move-icon--gray" aria-hidden="true">
                <Icon name="wrench" />
              </span>
              <div className="next-move-text">
                <strong>Assign open work</strong>
                <span>{`${unassignedJobs} unassigned jobs`}</span>
              </div>
            </div>
            <span className="next-move-arrow" aria-hidden="true">→</span>
          </a>

          <a href="#/automation" className="next-move-item">
            <div className="next-move-left">
              <span className="next-move-icon next-move-icon--amber" aria-hidden="true">
                <Icon name="checkCircle" />
              </span>
              <div className="next-move-text">
                <strong>Review AI actions</strong>
                <span>{`${aiReviewCount} items need review`}</span>
              </div>
            </div>
            <span className="next-move-arrow" aria-hidden="true">→</span>
          </a>

          <a href="#/team" className="next-move-item">
            <div className="next-move-left">
              <span className="next-move-icon next-move-icon--blue" aria-hidden="true">
                <Icon name="van" />
              </span>
              <div className="next-move-text">
                <strong>Check your team</strong>
                <span>View technician availability</span>
              </div>
            </div>
            <span className="next-move-arrow" aria-hidden="true">→</span>
          </a>
        </div>
      </section>

      {/* Today's overview */}
      <div className="overview-section-head">
        <h2 className="overview-section-title">Today's overview</h2>
        <span className="overview-section-hint">Sample data · Updated just now</span>
      </div>
      <div className="overview-stats-grid">
        <a href="#/calls" className="overview-stat-card">
          <div className="overview-stat-top">
            <span className="overview-stat-label">Calls answered</span>
            <span className="overview-stat-badge" aria-hidden="true"><Icon name="phone" /></span>
          </div>
          <p className="overview-stat-value">{callsCount}</p>
          <p className="overview-stat-hint">Sample conversations shown in Calls</p>
        </a>

        <a href="#/appointments" className="overview-stat-card">
          <div className="overview-stat-top">
            <span className="overview-stat-label">Appointments booked</span>
            <span className="overview-stat-badge" aria-hidden="true"><Icon name="van" /></span>
          </div>
          <p className="overview-stat-value">{apptCount}</p>
          <p className="overview-stat-hint">Sample appointments today</p>
        </a>

        <a href="#/customers" className="overview-stat-card">
          <div className="overview-stat-top">
            <span className="overview-stat-label">Customers in demo</span>
            <span className="overview-stat-badge" aria-hidden="true"><Icon name="customers" /></span>
          </div>
          <p className="overview-stat-value">{customerCount}</p>
          <p className="overview-stat-hint">Sample customer profiles</p>
        </a>

        <a href="#/automation" className="overview-stat-card">
          <div className="overview-stat-top">
            <span className="overview-stat-label">AI actions to review</span>
            <span className="overview-stat-badge" aria-hidden="true"><Icon name="clock" /></span>
          </div>
          <p className="overview-stat-value">{aiReviewCount}</p>
          <p className="overview-stat-hint">Items awaiting office review</p>
        </a>
      </div>

      {/* Your AI team */}
      <div className="overview-section-head">
        <h2 className="overview-section-title">Your AI team</h2>
        <span className="overview-section-hint">Example agents · Proposed capabilities</span>
      </div>
      <div className="overview-team-grid">
        <div className="overview-team-card">
          <div className="overview-team-top">
            <div className="overview-team-name-wrap">
              <Icon name="phone" />
              <span>Customer service</span>
            </div>
            <span className="overview-team-pill overview-team-pill--active">Active</span>
          </div>
          <p className="overview-team-desc">Answers calls and captures service requests.</p>
        </div>

        <div className="overview-team-card">
          <div className="overview-team-top">
            <div className="overview-team-name-wrap">
              <Icon name="appointments" />
              <span>Scheduling</span>
            </div>
            <span className="overview-team-pill overview-team-pill--active">Active</span>
          </div>
          <p className="overview-team-desc">Helps coordinate bookings and reminders.</p>
        </div>

        <div className="overview-team-card">
          <div className="overview-team-top">
            <div className="overview-team-name-wrap">
              <Icon name="campaigns" />
              <span>Estimate follow-up</span>
            </div>
            <span className="overview-team-pill overview-team-pill--review">Review</span>
          </div>
          <p className="overview-team-desc">Keeps track of estimates needing follow up.</p>
        </div>

        <div className="overview-team-card">
          <div className="overview-team-top">
            <div className="overview-team-name-wrap">
              <Icon name="tasks" />
              <span>Office assistant</span>
            </div>
            <span className="overview-team-pill overview-team-pill--active">Active</span>
          </div>
          <p className="overview-team-desc">Organizes administrative tasks for your team.</p>
        </div>
      </div>

      {/* Split Grid: Recent calls & Your to-do list */}
      <div className="overview-split-grid">
        {/* Recent calls */}
        <section className="overview-panel-card">
          <div className="overview-panel-head">
            <div>
              <h3 className="overview-panel-title">Recent calls</h3>
              <p className="overview-panel-sub">The latest conversations with your customers</p>
            </div>
            <a href="#/calls" className="overview-panel-link">View all →</a>
          </div>
          <ul className="overview-panel-list">
            <li className="overview-call-row">
              <div className="overview-call-left">
                <span className="overview-call-avatar" aria-hidden="true">SM</span>
                <div className="overview-call-info">
                  <strong>Sarah Mitchell</strong>
                  <span>AC not cooling · New customer</span>
                </div>
              </div>
              <div className="overview-call-right">
                <span className="overview-badge--booked">Booked</span>
                <span className="overview-call-time">10:42 AM</span>
              </div>
            </li>
            <li className="overview-call-row">
              <div className="overview-call-left">
                <span className="overview-call-avatar" aria-hidden="true">DR</span>
                <div className="overview-call-info">
                  <strong>David Rodriguez</strong>
                  <span>Annual maintenance · Existing customer</span>
                </div>
              </div>
              <div className="overview-call-right">
                <span className="overview-badge--booked">Booked</span>
                <span className="overview-call-time">9:58 AM</span>
              </div>
            </li>
            <li className="overview-call-row">
              <div className="overview-call-left">
                <span className="overview-call-avatar" aria-hidden="true">JT</span>
                <div className="overview-call-info">
                  <strong>Jessica Taylor</strong>
                  <span>Asked about service pricing</span>
                </div>
              </div>
              <div className="overview-call-right">
                <span className="overview-badge--followup">Follow up</span>
                <span className="overview-call-time">9:21 AM</span>
              </div>
            </li>
          </ul>
        </section>

        {/* Your to-do list */}
        <section className="overview-panel-card">
          <div className="overview-panel-head">
            <div>
              <h3 className="overview-panel-title">Your to-do list</h3>
              <p className="overview-panel-sub">Administrative work that needs a look</p>
            </div>
            <a href="#/tasks" className="overview-panel-link">View tasks →</a>
          </div>
          <ul className="overview-panel-list">
            <li className="overview-todo-row">
              <div className="overview-todo-info">
                <strong>Invoice follow-up</strong>
                <span>Sarah Mitchell · Needs approval</span>
              </div>
              <a href="#/automation" className="overview-todo-btn">Review</a>
            </li>
            <li className="overview-todo-row">
              <div className="overview-todo-info">
                <strong>Customer record update</strong>
                <span>David Rodriguez · Needs review</span>
              </div>
              <a href="#/automation" className="overview-todo-btn">Review</a>
            </li>
            <li className="overview-todo-row">
              <div className="overview-todo-info">
                <strong>Job documentation</strong>
                <span>William Brooks · Needs review</span>
              </div>
              <a href="#/automation" className="overview-todo-btn">Review</a>
            </li>
          </ul>
        </section>
      </div>

      {/* Footnote disclaimer */}
      <p className="overview-disclaimer">Design concept · All names, metrics, and activity are illustrative.</p>

      {/* Technician time extensions Card */}
      <section className="overview-extensions-card">
        <div className="overview-extensions-head">
          <div>
            <h3 className="overview-extensions-title">Technician time extensions</h3>
            <p className="overview-extensions-sub">Shared sample updates from the technician view in this browser</p>
          </div>
          <span className="overview-extensions-badge">0 updates</span>
        </div>
        <p className="overview-extensions-body">No extensions yet. Open a current technician job, advance it to Arrived or In progress, then choose Extend job time.</p>
        <p className="overview-extensions-footer">Same-browser demo sync only. Other appointments keep their original times.</p>
      </section>
    </div>
  );
}
