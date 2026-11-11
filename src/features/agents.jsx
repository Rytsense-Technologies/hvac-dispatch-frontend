// AI agents — Meet your AI team
// Reference visual chrome (PageHeader, filter chips, card grid, centered dialog) with live
// /v1/agents list + detail/PATCH settings from pre-design main (0af35c4). Sample cards fill in
// when the API is empty or unreachable so design parity still shows.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import {
  Dialog, Empty, ErrorBox, Field, FilterChips, Icon, PageHeader, Select, Spinner, toast, useRun,
} from '../components/index.js';

const FILTERS = [
  ['all', 'All agents'],
  ['customer', 'Customer service'],
  ['office', 'Office operations'],
  ['growth', 'Growth'],
];

const STATUS_LABEL = {
  active: 'Active',
  paused: 'Paused',
  off: 'Off',
  needs_review: 'Needs review',
};

const TAB_OF = {
  'Customer service': 'customer',
  Growth: 'growth',
  Operations: 'office',
  Office: 'office',
};

const GROUP_ICON = {
  customer: 'phone',
  office: 'tasks',
  growth: 'campaigns',
};

const DAY_LABELS = [
  ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'],
  ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun'],
];

const SAMPLE_AGENTS = [
  {
    id: 'sample_lead_reactivation',
    name: 'Lead Reactivation Agent',
    group: 'Growth',
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
    sample: true,
  },
  {
    id: 'sample_receptionist',
    name: 'AI Receptionist',
    group: 'Customer service',
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
    sample: true,
  },
  {
    id: 'sample_scheduling',
    name: 'Scheduling Agent',
    group: 'Office',
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
    sample: true,
  },
  {
    id: 'sample_estimate_followup',
    name: 'Estimate Follow-up Agent',
    group: 'Growth',
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
    sample: true,
  },
  {
    id: 'sample_office_admin',
    name: 'Office Admin Agent',
    group: 'Office',
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
    sample: true,
  },
  {
    id: 'sample_maintenance_outreach',
    name: 'Maintenance Outreach Agent',
    group: 'Growth',
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
    sample: true,
  },
  {
    id: 'sample_customer_care',
    name: 'Customer Care Agent',
    group: 'Customer service',
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
    sample: true,
  },
];

const visible = (field, values) => (
  !field.show_when || Object.entries(field.show_when).every(([key, wanted]) => values[key] === wanted)
);

function groupKey(agent) {
  return TAB_OF[agent.group] || agent.group || 'office';
}

function agentIcon(agent) {
  return agent.icon || GROUP_ICON[groupKey(agent)] || 'agents';
}

function FieldInput({ field, value, onChange, disabled }) {
  if (field.kind === 'choice') {
    const chosen = field.options.find((o) => o.value === value);
    return (
      <Field label={field.label} hint={[chosen?.hint, field.help].filter(Boolean).join(' ')}>
        <Select
          options={field.options.map((o) => [o.value, o.label])}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    );
  }
  if (field.kind === 'bool') {
    return (
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
          {field.label}
        </label>
        {field.help ? <small className="muted">{field.help}</small> : null}
      </div>
    );
  }
  if (field.kind === 'days') {
    return (
      <div className="field">
        <span className="label">{field.label}</span>
        <div className="row wrap">
          {DAY_LABELS.map(([id, text]) => (
            <label key={id} className="check">
              <input
                type="checkbox"
                checked={value.includes(id)}
                disabled={disabled}
                onChange={(e) => onChange(e.target.checked ? [...value, id] : value.filter((d) => d !== id))}
              />
              {text}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (field.kind === 'time') {
    return (
      <Field label={field.label}>
        <input type="time" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }
  return (
    <Field label={field.label} hint={`${field.help || ''}${field.help ? ' ' : ''}${value.length}/${field.max_length}`}>
      <textarea
        rows={3}
        maxLength={field.max_length}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function SampleAgentDialog({ agent, onClose }) {
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
        {agent.example ? <div className="agent-banner">{agent.example}</div> : null}
        <p className="sample-label">Concept only · Example workflow and activity</p>
      </div>
    </Dialog>
  );
}

function LiveAgentDialog({ id, onSaved, onClose }) {
  const [state, setState] = useState({});
  const [values, setValues] = useState(null);
  const [busy, run] = useRun();
  const writer = can('admin');

  useEffect(() => {
    let live = true;
    api(`/v1/agents/${id}`)
      .then((data) => {
        if (live) {
          setState({ data });
          setValues(data.values);
        }
      })
      .catch((error) => {
        if (live) setState({ error });
      });
    return () => { live = false; };
  }, [id]);

  const { data, error } = state;
  const changed = data && values
    ? Object.fromEntries(
      Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(data.values[key])),
    )
    : {};

  const save = (event) => {
    event.preventDefault();
    if (!Object.keys(changed).length) {
      onClose();
      return;
    }
    run(async () => {
      await api(`/v1/agents/${id}`, { method: 'PATCH', body: { values: changed } });
      toast('Saved. It applies from the next call, text or sweep.');
      onSaved();
      onClose();
    });
  };

  return (
    <Dialog title={data?.name || 'AI agent'} onClose={onClose} wide className="dialog--agent">
      <div className="agent-dialog-body">
        {error ? <ErrorBox error={error} /> : !data || !values ? <Spinner /> : (
          <form className="stack" noValidate onSubmit={save}>
            <p className="agent-dialog-desc">{data.summary}</p>
            <strong className="agent-dialog-section">What this agent does</strong>
            <ul className="agent-dialog-list">
              {data.does.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {data.server_off ? <p className="note note--warn">{data.server_off}</p> : null}
            {data.note ? <p className="note">{data.note}</p> : null}
            {data.editable ? (
              <>
                <strong className="agent-dialog-section">How it works for your company</strong>
                {!writer ? <p className="muted small">Only an administrator can change these.</p> : null}
                {data.fields.filter((field) => visible(field, values)).map((field) => (
                  <FieldInput
                    key={field.id}
                    field={field}
                    value={values[field.id]}
                    disabled={!writer || busy}
                    onChange={(next) => setValues((v) => ({ ...v, [field.id]: next }))}
                  />
                ))}
                {values.schedule_mode === 'business_hours' ? (
                  <p className="muted small">
                    {`Your business hours: ${data.company_hours}. Change them with your server's settings (see Settings).`}
                  </p>
                ) : null}
                {writer ? (
                  <div className="right dialog-actions">
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={busy || !Object.keys(changed).length}
                    >
                      Save
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="sample-label">Set by the server · No company choices on this agent</p>
            )}
          </form>
        )}
      </div>
    </Dialog>
  );
}

function AgentDialog({ agent, onSaved, onClose }) {
  if (!agent) return null;
  if (agent.sample || String(agent.id).startsWith('sample_')) {
    return <SampleAgentDialog agent={agent} onClose={onClose} />;
  }
  return <LiveAgentDialog id={agent.id} onSaved={onSaved} onClose={onClose} />;
}

export default function Agents() {
  const [state, setState] = useState({});
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);
  const [sampleMode, setSampleMode] = useState(false);

  const load = useCallback(() => {
    api('/v1/agents')
      .then((data) => {
        if (!data?.agents?.length) {
          setSampleMode(true);
          setState({
            data: {
              agents: SAMPLE_AGENTS,
              total: SAMPLE_AGENTS.length,
              active: SAMPLE_AGENTS.filter((a) => a.status === 'active').length,
            },
          });
          return;
        }
        setSampleMode(false);
        setState({ data });
      })
      .catch((error) => {
        setSampleMode(true);
        setState({
          data: {
            agents: SAMPLE_AGENTS,
            total: SAMPLE_AGENTS.length,
            active: SAMPLE_AGENTS.filter((a) => a.status === 'active').length,
          },
          error,
        });
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  const { data, error } = state;
  const shown = data
    ? data.agents.filter((agent) => tab === 'all' || groupKey(agent) === tab)
    : [];

  const countLabel = sampleMode
    ? '7 example agents'
    : (data ? `${data.total} AI agents · ${data.active} active` : 'AI agents');

  const subtitle = sampleMode
    ? 'A team built for HVAC, plumbing, electrical, and other home service businesses.'
    : (data
      ? `${data.total} AI agents, ${data.active} active. Open one to see what it does and how it works for your company.`
      : 'What each AI agent does for your business.');

  return (
    <div className="agents-page">
      <PageHeader
        eyebrow="YOUR AI WORKFORCE"
        title="Meet your AI team"
        subtitle={subtitle}
        meta={(
          <span className="date agents-count-chip">
            <Icon name="agents" />
            <span>{countLabel}</span>
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

      {!data ? <Spinner /> : !shown.length ? <Empty text="No agents in this group." /> : (
        <div className="agent-grid">
          {shown.map((agent) => {
            const statusKey = agent.status;
            const statusClass = statusKey === 'off'
              ? ' off'
              : (statusKey === 'needs_review' || statusKey === 'paused' ? ' review' : '');
            const statusLabel = STATUS_LABEL[statusKey] || statusKey;
            const metric = agent.metric
              || agent.choices
              || (agent.editable ? '' : (sampleMode ? null : 'Set by the server'));
            return (
              <article key={agent.id} className="agent-card">
                <div className="agent-top">
                  <span className="agent-symbol" aria-hidden="true">
                    <Icon name={agentIcon(agent)} />
                  </span>
                  <span className={`agent-status${statusClass}`}>
                    <span aria-hidden="true">●</span>
                    {' '}
                    <span>{statusLabel}</span>
                  </span>
                </div>
                <h3>{agent.name}</h3>
                <p>{agent.summary}</p>
                {metric ? (
                  <div className="agent-metric">
                    <b>{metric}</b>
                    {sampleMode ? ' · Sample activity' : null}
                  </div>
                ) : <div className="agent-metric" />}
                <button
                  type="button"
                  className="btn agent-btn"
                  onClick={() => setOpen(agent)}
                >
                  View agent →
                </button>
              </article>
            );
          })}
        </div>
      )}

      <p className="foot">
        {sampleMode
          ? (error
            ? `Showing example agents (${error.message}). Sign in to load your company's AI team and edit settings.`
            : 'Design concept · Agent roles, activity and statuses are illustrative until the live agent list loads.')
          : 'Open an agent to review what it does. Administrators can change company choices; they apply on the next call, text, or sweep.'}
      </p>

      {open ? (
        <AgentDialog
          agent={open}
          onSaved={load}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
