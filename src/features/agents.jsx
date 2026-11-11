// AI agents — Meet your AI team
// Visual parity with the Rytsense reference (#/agents + agent detail dialog).
import { useState } from 'react';
import { Dialog, FilterChips, Icon, PageHeader } from '../components/index.js';

const FILTERS = [
  ['all', 'All agents'],
  ['customer', 'Customer service'],
  ['office', 'Office operations'],
  ['growth', 'Growth'],
];

const STATUS_LABEL = {
  active: 'Active',
  needs_review: 'Needs review',
};

const AGENTS = [
  {
    id: 'lead_reactivation',
    name: 'Lead Reactivation Agent',
    group: 'growth',
    icon: 'campaigns',
    status: 'active',
    summary: 'Reaches out to older leads and helps turn past inquiries into new opportunities.',
    metric: '18 old leads contacted this week',
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
    group: 'customer',
    icon: 'phone',
    status: 'active',
    summary: 'Answers calls, understands service needs, and captures customer details.',
    metric: '24 calls answered today',
    does: [
      'Answer incoming and after-hours calls',
      'Capture customer information and service needs',
      'Escalate urgent requests to the office',
    ],
    example: 'Example activity: Answered Sarah’s call about an AC that is not cooling.',
  },
  {
    id: 'scheduling',
    name: 'Scheduling Agent',
    group: 'office',
    icon: 'appointments',
    status: 'active',
    summary: 'Helps book, confirm, and coordinate service appointments.',
    metric: '8 appointments booked today',
    does: [
      'Find available appointment windows',
      'Send confirmations and reminders',
      'Flag scheduling conflicts for review',
    ],
    example: 'Example activity: Prepared a service appointment for Sarah at 1:00 PM.',
  },
  {
    id: 'estimate_followup',
    name: 'Estimate Follow-up Agent',
    group: 'growth',
    icon: 'campaigns',
    status: 'needs_review',
    summary: 'Keeps open estimates moving with timely customer follow-up.',
    metric: '3 estimates ready for follow-up',
    does: [
      'Identify estimates awaiting a response',
      'Prepare personalized follow-up messages',
      'Bring interested customers back to your team',
    ],
    example: 'Example activity: Prepared a follow-up for Jessica’s pricing request.',
  },
  {
    id: 'office_admin',
    name: 'Office Admin Agent',
    group: 'office',
    icon: 'tasks',
    status: 'active',
    summary: 'Organizes incoming requests and routine administrative work.',
    metric: '6 tasks organized today',
    does: [
      'Summarize requests and create office tasks',
      'Collect missing customer information',
      'Route exceptions to the right person',
    ],
    example: 'Example activity: Created a task to review a new service request.',
  },
  {
    id: 'maintenance_outreach',
    name: 'Maintenance Outreach Agent',
    group: 'growth',
    icon: 'snowflake',
    status: 'active',
    summary: 'Helps bring customers back for seasonal maintenance.',
    metric: '12 reminders prepared this week',
    does: [
      'Identify customers due for maintenance',
      'Prepare seasonal reminder campaigns',
      'Help customers request a convenient appointment',
    ],
    example: 'Example activity: Prepared spring tune-up reminders for review.',
  },
  {
    id: 'customer_care',
    name: 'Customer Care Agent',
    group: 'customer',
    icon: 'heart',
    status: 'active',
    summary: 'Supports customers after a visit and surfaces issues for your team.',
    metric: '5 follow-ups prepared today',
    does: [
      'Prepare post-service check-ins',
      'Identify customers who need a callback',
      'Route concerns to the office',
    ],
    example: 'Example activity: Flagged a customer concern for a team member.',
  },
];

function AgentDialog({ agent, onClose }) {
  if (!agent) return null;
  return (
    <Dialog title={agent.name} onClose={onClose} className="dialog--agent">
      <div className="agent-dialog-body">
        <p className="agent-dialog-desc">{agent.summary}</p>
        <strong className="agent-dialog-section">What this agent could help with</strong>
        <ul className="agent-dialog-list">
          {agent.does.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <div className="agent-banner">{agent.example}</div>
        <p className="sample-label">Concept only · Example workflow and activity</p>
      </div>
    </Dialog>
  );
}

export default function Agents() {
  const [tab, setTab] = useState('all');
  const [activeAgent, setActiveAgent] = useState(null);
  const shown = AGENTS.filter((a) => tab === 'all' || a.group === tab);

  return (
    <div className="agents-page">
      <PageHeader
        eyebrow="YOUR AI WORKFORCE"
        title="Meet your AI team"
        subtitle="A team built for HVAC, plumbing, electrical, and other home service businesses."
        meta={(
          <span className="date agents-count-chip">
            <Icon name="agents" />
            <span>7 example agents</span>
          </span>
        )}
      />

      <div className="agent-banner agents-intro-banner">
        <strong>More time for the work that matters.</strong>
        <br />
        See what each agent can help with, then review the work that needs your team’s attention.
      </div>

      <div className="agents-filters">
        <FilterChips
          label="Filter agents"
          options={FILTERS}
          value={tab}
          onChange={setTab}
        />
      </div>

      <div className="agent-grid">
        {shown.map((agent) => {
          const needsReview = agent.status === 'needs_review';
          const statusLabel = STATUS_LABEL[agent.status] || agent.status;
          return (
            <article key={agent.id} className="agent-card">
              <div className="agent-top">
                <span className="agent-symbol" aria-hidden="true">
                  <Icon name={agent.icon} />
                </span>
                <span className={`agent-status${needsReview ? ' review' : ''}`}>
                  <span aria-hidden="true">●</span>
                  {' '}
                  <span>{statusLabel}</span>
                </span>
              </div>
              <h3>{agent.name}</h3>
              <p>{agent.summary}</p>
              <div className="agent-metric">
                <b>{agent.metric}</b>
                {' '}
                · Sample activity
              </div>
              <button
                type="button"
                className="btn agent-btn"
                onClick={() => setActiveAgent(agent)}
              >
                View agent →
              </button>
            </article>
          );
        })}
      </div>

      <p className="foot">
        Design concept · Agent roles, activity and statuses are illustrative. No actions connect to your business systems.
      </p>

      {activeAgent ? (
        <AgentDialog agent={activeAgent} onClose={() => setActiveAgent(null)} />
      ) : null}
    </div>
  );
}
