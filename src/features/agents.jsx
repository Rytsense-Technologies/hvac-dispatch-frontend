// AI agents: Meet your AI team
// Showcases the AI workforce with categories, activity metrics, and detailed agent modal.
// Matches the exact design concept from the reference UI.
import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon.jsx';

const TABS = [
  { id: 'all', label: 'All agents' },
  { id: 'service', label: 'Customer service' },
  { id: 'office', label: 'Office operations' },
  { id: 'growth', label: 'Growth' },
];

const AGENTS = [
  {
    id: 'lead_reactivation',
    name: 'Lead Reactivation Agent',
    group: 'growth',
    icon: 'campaigns',
    status: 'active',
    summary: 'Reaches out to older leads and helps turn past inquiries into new opportunities.',
    activityStat: '18 old leads contacted this week',
    does: [
      'Identify older leads for a follow-up campaign',
      'Make personalized outreach calls or send messages',
      'Share interested leads and requested callbacks with the team',
    ],
    example: 'Example activity: An old AC replacement inquiry requested a callback.',
  },
  {
    id: 'receptionist',
    name: 'AI Receptionist',
    group: 'service',
    icon: 'phone',
    status: 'active',
    summary: 'Answers calls, understands service needs, and captures customer details.',
    activityStat: '24 calls answered today',
    does: [
      'Greet callers 24/7 with customized voice and greeting',
      'Identify emergency requests and urgent repairs immediately',
      'Capture full service request details and caller information',
    ],
    example: 'Example activity: Handled an after-hours no-heat emergency call and alerted the on-call tech.',
  },
  {
    id: 'scheduling',
    name: 'Scheduling Agent',
    group: 'office',
    icon: 'appointments',
    status: 'active',
    summary: 'Helps book, confirm, and coordinate service appointments.',
    activityStat: '8 appointments booked today',
    does: [
      'Find optimal appointment windows within operating hours',
      'Coordinate arrival times directly with customer calendars',
      'Send automated booking confirmations and technician arrival updates',
    ],
    example: 'Example activity: Booked a next-day diagnostic slot and texted confirmation to the homeowner.',
  },
  {
    id: 'estimate_followup',
    name: 'Estimate Follow-up Agent',
    group: 'growth',
    icon: 'campaigns',
    status: 'needs_review',
    summary: 'Keeps open estimates moving with timely customer follow up.',
    activityStat: '3 estimates ready for follow-up',
    does: [
      'Track pending proposals and estimate response deadlines',
      'Send polite check-in inquiries to answer customer questions',
      'Surface hot leads ready to accept an estimate',
    ],
    example: 'Example activity: Followed up on a pending heat pump proposal awaiting customer decision.',
  },
  {
    id: 'office_admin',
    name: 'Office Admin Agent',
    group: 'office',
    icon: 'tasks',
    status: 'active',
    summary: 'Organizes incoming requests and routine administrative work.',
    activityStat: '6 tasks organized today',
    does: [
      'Categorize incoming requests and prioritize urgent work',
      'Maintain customer equipment history and job notes',
      'Draft daily summary reports for the management team',
    ],
    example: 'Example activity: Processed technician notes and prepared invoices for completed jobs.',
  },
  {
    id: 'maintenance_outreach',
    name: 'Maintenance Outreach Agent',
    group: 'growth',
    icon: 'snowflake',
    status: 'active',
    summary: 'Helps bring customers back for seasonal maintenance.',
    activityStat: '12 reminders prepared this week',
    does: [
      'Identify past customers due for spring or fall tune-ups',
      'Send tailored seasonal reminders with easy booking links',
      'Keep recurring maintenance plan memberships active and updated',
    ],
    example: 'Example activity: Sent fall furnace tune-up notices to 12 maintenance plan members.',
  },
  {
    id: 'customer_care',
    name: 'Customer Care Agent',
    group: 'service',
    icon: 'heart',
    status: 'active',
    summary: 'Supports customers after a visit and surfaces issues for your team.',
    activityStat: '5 follow-ups prepared today',
    does: [
      'Send post-service satisfaction surveys via text',
      'Prompt happy customers to leave online reviews',
      'Immediately alert management if a customer reports a problem',
    ],
    example: 'Example activity: Followed up with a customer after AC repair and received 5-star review.',
  },
];

function AgentModal({ agent, onClose }) {
  if (!agent) return null;
  return (
    <div className="agent-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="agent-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="agent-modal-top">
          <p className="agent-modal-eyebrow">AI AGENT OVERVIEW</p>
          <button type="button" className="agent-modal-close" onClick={onClose} aria-label="Close dialog">✕</button>
        </div>
        <h2 className="agent-modal-title">{agent.name}</h2>
        <p className="agent-modal-desc">{agent.summary}</p>
        <h3 className="agent-modal-section-title">What this agent could help with</h3>
        <ul className="agent-modal-bullets">
          {agent.does.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
        <div className="agent-modal-example-box">
          {agent.example}
        </div>
        <p className="agent-modal-footer">Concept only · Example workflow and activity</p>
      </div>
    </div>
  );
}

export default function Agents() {
  const [tab, setTab] = useState('all');
  const [activeAgent, setActiveAgent] = useState(null);

  useEffect(() => {
    if (!activeAgent) return;
    const onKey = (e) => { if (e.key === 'Escape') setActiveAgent(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeAgent]);

  const shown = AGENTS.filter((a) => tab === 'all' || a.group === tab);

  return (
    <div className="agents-container">
      {/* Top Header */}
      <div className="agents-head">
        <div>
          <p className="agents-eyebrow">YOUR AI WORKFORCE</p>
          <h1 className="agents-title">Meet your AI team</h1>
          <p className="agents-subtitle">A team built for HVAC, plumbing, electrical, and other home service businesses.</p>
        </div>
        <div className="agents-badge-pill">
          <Icon name="agents" />
          <span>7 example agents</span>
        </div>
      </div>

      {/* Banner / Notice */}
      <div className="agents-notice">
        <h2 className="agents-notice-title">More time for the work that matters.</h2>
        <p className="agents-notice-sub">See what each agent can help with, then review the work that needs your team's attention.</p>
      </div>

      {/* Filter Tabs */}
      <div className="agents-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`agents-tab-btn ${tab === t.id ? 'agents-tab-btn--active' : 'agents-tab-btn--inactive'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 3-Column Agents Grid */}
      <div className="agents-grid">
        {shown.map((agent) => (
          <div key={agent.id} className="agent-card">
            <div>
              <div className="agent-card-top">
                <span className="agent-card-icon" aria-hidden="true">
                  <Icon name={agent.icon} />
                </span>
                <span className={`agent-status-pill ${agent.status === 'needs_review' ? 'agent-status-pill--review' : 'agent-status-pill--active'}`}>
                  <span className="agent-status-dot" aria-hidden="true" />
                  <span>{agent.status === 'needs_review' ? 'Needs review' : 'Active'}</span>
                </span>
              </div>
              <h3 className="agent-card-title">{agent.name}</h3>
              <p className="agent-card-summary">{agent.summary}</p>
            </div>
            <div>
              <p className="agent-card-activity">
                <strong>{agent.activityStat}</strong> <span>· Sample activity</span>
              </p>
              <button
                type="button"
                className="agent-card-btn"
                onClick={() => setActiveAgent(agent)}
              >
                View agent →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Disclaimer */}
      <p className="agents-disclaimer">Design concept · Agent roles, activity and statuses are illustrative. No actions connect to your business systems.</p>

      {/* Details Modal */}
      {activeAgent && (
        <AgentModal
          agent={activeAgent}
          onClose={() => setActiveAgent(null)}
        />
      )}
    </div>
  );
}
