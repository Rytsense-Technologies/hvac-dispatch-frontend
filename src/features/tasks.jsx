// Work → Tasks: metric cards + unassigned / assigned / office follow-up panels.
// Visual parity with the Rytsense reference; assign + review wired to live APIs.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import {
  Spinner, ErrorBox, Note, Badge, StatGrid, Dialog, Field,
  ActionButton, Button, toast, Panel, PanelHead, Row,
} from '../components/index.js';
import { WorkChrome, WorkFoot } from './workChrome.jsx';

const DEFAULT_REASON = 'Picked from the Tasks assignment dialog.';

// Sample rows matching ref-work.png when the API queue is empty (session-only).
const SAMPLE_UNASSIGNED = [
  {
    id: 'sample-u1',
    isSample: true,
    title: 'AC repair · Sarah Mitchell',
    place: 'Wed, Nov 11 · 1 PM–3 PM · Austin, TX · Urgent · Unassigned',
    priority: { code: 'urgent', label: 'Urgent' },
    status: 'unassigned',
  },
  {
    id: 'sample-u2',
    isSample: true,
    title: 'Plumbing inspection · William Brooks',
    place: 'Thu, Nov 12 · 9 AM–10 AM · Round Rock, TX · Standard · Unassigned',
    priority: { code: 'standard', label: 'Standard' },
    status: 'unassigned',
  },
];

const SAMPLE_FOLLOWUPS = [
  { id: 'sample-f1', isSample: true, title: 'Invoice follow-up', subject: { name: 'Sarah Mitchell' }, status_hint: 'Needs approval' },
  { id: 'sample-f2', isSample: true, title: 'Customer record update', subject: { name: 'David Rodriguez' }, status_hint: 'Needs review' },
  { id: 'sample-f3', isSample: true, title: 'Job documentation', subject: { name: 'William Brooks' }, status_hint: 'Needs review' },
  { id: 'sample-f4', isSample: true, title: 'Estimate follow-up', subject: { name: 'Jessica Taylor' }, status_hint: 'Needs approval' },
];

function technicianName(t) {
  if (!t) return '';
  if (typeof t === 'object') return t.name || '';
  return String(t);
}

function jobSubtitle(item) {
  if (item.place) return item.place;
  const bits = [];
  if (item.when) bits.push(item.when);
  if (item.city || item.address) bits.push(item.city || item.address);
  if (item.priority?.label) bits.push(item.priority.label);
  bits.push(item.status === 'assigned' ? (technicianName(item.technician) || 'Assigned') : 'Unassigned');
  return bits.filter(Boolean).join(' · ');
}

function followUpSubtitle(item) {
  const name = item.subject?.name || item.customer || '';
  const hint = item.status_hint
    || (item.kind === 'text_reply' ? 'Needs approval' : null)
    || item.detail
    || 'Needs review';
  return [name, hint].filter(Boolean).join(' · ');
}

// ---------- assign dialog ----------

function AssignDialog({ job, onClose, onDone }) {
  const [state, setState] = useState({ phase: 'loading' });

  useEffect(() => {
    let current = true;
    if (job.isSample || !job.api?.choices) {
      setState({ phase: 'sample' });
      return () => { current = false; };
    }
    (async () => {
      try {
        const choices = await api(job.api.choices);
        if (current) setState({ phase: 'ready', choices });
      } catch (error) {
        if (current) setState({ phase: 'error', error });
      }
    })();
    return () => { current = false; };
  }, [job]);

  let body;
  if (state.phase === 'loading') body = <Spinner text="Working out who can take this job…" />;
  else if (state.phase === 'error') body = <ErrorBox error={state.error} />;
  else if (state.phase === 'sample') {
    body = (
      <div className="stack">
        <p className="muted">Sample workspace · no live technicians to assign.</p>
        <Button
          className="btn btn--primary"
          onClick={() => {
            toast('Sample assignment only — nothing was scheduled.');
            onDone();
          }}
        >
          Confirm sample assignment
        </Button>
      </div>
    );
  } else {
    const technicians = state.choices.technicians || [];
    if (!technicians.length) {
      body = <p className="muted">No technician can be shown for this job.</p>;
    } else {
      body = (
        <ul className="plain stack">
          {technicians.map((t) => (
            <li className="line" key={t.technician_id}>
              <div className="between">
                <span>
                  <strong>{t.name}</strong>{' '}
                  <Badge text={t.verdict === 'matches' ? 'Matches' : 'Warning'} tone={t.verdict === 'matches' ? 'good' : 'warn'} />
                  {t.recommended ? <>{' '}<Badge text="Recommended" tone="info" /></> : null}
                  <small className="block muted">{t.text}</small>
                  {t.reasons?.length ? <small className="block muted">{t.reasons.join(', ')}</small> : null}
                </span>
                {can('admin', 'dispatcher') ? (
                  <ActionButton
                    className="btn btn--primary"
                    disabled={t.eligible === false}
                    action={async () => {
                      await api(job.api.assign, {
                        method: 'POST',
                        body: { technician_id: t.technician_id, arrival: t.arrival, reason: DEFAULT_REASON },
                      });
                      toast('Assigned.');
                      onDone();
                    }}
                  >
                    Choose
                  </ActionButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      );
    }
  }

  return (
    <Dialog title={`Assign: ${job.title || job.text || 'Job'}`} onClose={onClose} wide>
      <div className="stack">{body}</div>
      <p className="work-sample-label">No real job is scheduled and no notification is sent for sample rows.</p>
    </Dialog>
  );
}

// ---------- follow-up review dialog ----------

function FollowUpReview({ item, onClose, onDone }) {
  const [text, setText] = useState(item.proposed?.text || '');
  const isReply = item.kind === 'text_reply';
  const approveLabel = (item.actions || []).find((a) => /send|approve/i.test(a)) || (isReply ? 'Send reply' : 'Mark handled');

  if (item.isSample) {
    return (
      <Dialog title={item.title || 'Review'} onClose={onClose}>
        <p className="muted">{followUpSubtitle(item)}</p>
        <p>{item.text || 'Sample follow-up for the design workspace.'}</p>
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          <Button className="btn btn--primary" onClick={() => { toast('Sample review only.'); onDone(); }}>Approve sample</Button>
          <Button className="btn btn--ghost" onClick={onClose}>Close</Button>
        </div>
        <p className="work-sample-label">Sample changes stay in this browser session.</p>
      </Dialog>
    );
  }

  return (
    <Dialog title={item.title || 'Review'} onClose={onClose}>
      {item.subject?.name ? (
        <p className="muted">{item.subject.name}{item.subject.phone ? ` · ${item.subject.phone}` : ''}</p>
      ) : null}
      {item.text ? <p>{item.text}</p> : null}
      {item.detail ? <p className="muted small">{item.detail}</p> : null}
      {isReply ? (
        <Field label="Proposed reply">
          <textarea maxLength={1000} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      ) : null}
      {can('admin', 'dispatcher') ? (
        <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
          {isReply ? (
            <ActionButton
              className="btn btn--secondary"
              action={async () => {
                await api(item.api.edit, { method: 'POST', body: { text: text.trim() } });
                toast('Saved.');
                onDone();
              }}
            >
              Save edit
            </ActionButton>
          ) : null}
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              await api(item.api.approve, { method: 'POST', body: isReply ? { text: text.trim() } : {} });
              toast('Done.');
              onDone();
            }}
          >
            {approveLabel}
          </ActionButton>
          <ActionButton
            className="btn btn--ghost"
            action={async () => {
              await api(item.api.dismiss, { method: 'POST', body: {} });
              toast('Dismissed.');
              onDone();
            }}
          >
            Dismiss
          </ActionButton>
        </div>
      ) : null}
      <p className="muted small" style={{ marginTop: 12 }}>{item.age || timeAgo(item.created_at)}</p>
    </Dialog>
  );
}

// ---------- page ----------

export default function Tasks() {
  const [state, setState] = useState({ status: 'loading' });
  const [followUps, setFollowUps] = useState({ status: 'loading', items: [] });
  const [assigning, setAssigning] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const latest = useRef(0);

  const loadTasks = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const data = await api('/v1/tasks');
      if (mine === latest.current) setState({ status: 'ready', data });
    } catch (error) {
      if (mine === latest.current) setState({ status: 'error', error });
    }
  };

  const loadFollowUps = async (quiet) => {
    try {
      const data = await api('/v1/tasks/follow-ups', { params: { status: 'open' } });
      setFollowUps({ status: 'ready', items: data.items || [] });
    } catch (error) {
      if (!quiet) setFollowUps({ status: 'error', items: [], error });
      else setFollowUps((prev) => ({ ...prev, status: 'ready' }));
    }
  };

  useEffect(() => {
    loadTasks();
    loadFollowUps();
    return () => { latest.current += 1; };
  }, []);
  useEvery(() => { loadTasks(true); loadFollowUps(true); }, 30000);

  if (!can('admin', 'dispatcher', 'approver')) {
    return (
      <WorkChrome tab="tasks" eyebrow="Your work queue" subtitle="See work that needs attention and assign the right person.">
        <Note text="Not available for your role." tone="warn" />
      </WorkChrome>
    );
  }

  if (state.status === 'loading' && followUps.status === 'loading') {
    return (
      <WorkChrome tab="tasks" eyebrow="Your work queue" subtitle="See work that needs attention and assign the right person.">
        <Spinner />
      </WorkChrome>
    );
  }

  if (state.status === 'error') {
    return (
      <WorkChrome tab="tasks" eyebrow="Your work queue" subtitle="See work that needs attention and assign the right person.">
        <ErrorBox error={state.error} />
      </WorkChrome>
    );
  }

  const data = state.data || {};
  const apiUnassigned = data.unassigned_work?.items || [];
  const apiAssigned = data.assigned_work?.items || [];
  const apiFollowUps = followUps.items || [];

  const usingSampleWork = apiUnassigned.length === 0 && apiAssigned.length === 0;
  const unassigned = usingSampleWork ? SAMPLE_UNASSIGNED : apiUnassigned;
  const assigned = usingSampleWork ? [] : apiAssigned;
  const usingSampleFollowUps = apiFollowUps.length === 0;
  const officeItems = usingSampleFollowUps ? SAMPLE_FOLLOWUPS : apiFollowUps;

  const counters = data.counters || {};
  const unassignedCount = usingSampleWork
    ? unassigned.length
    : (counters.unassigned_work?.value ?? unassigned.length);
  const assignedCount = usingSampleWork
    ? assigned.length
    : (counters.assigned_jobs?.value ?? assigned.length);
  const followUpCount = usingSampleFollowUps
    ? officeItems.length
    : (counters.office_follow_ups?.value ?? officeItems.length);

  const canAssign = can('admin', 'dispatcher');

  return (
    <WorkChrome
      tab="tasks"
      eyebrow="Your work queue"
      subtitle="See work that needs attention and assign the right person."
    >
      <StatGrid
        className="work-metrics"
        items={[
          ['Unassigned work', unassignedCount, 'Ready for assignment'],
          ['Assigned jobs', assignedCount, usingSampleWork ? 'In this example queue' : 'Currently assigned'],
          ['Office follow-ups', followUpCount, usingSampleFollowUps ? 'Sample tasks' : 'Awaiting review'],
        ]}
      />

      <div className="work-panels">
        <Panel>
          <PanelHead title="Unassigned work" subtitle="Assign a technician directly from the task">
            <Badge text={`${unassignedCount} unassigned`} tone="warn" />
          </PanelHead>
          {unassigned.length ? (
            unassigned.map((item) => (
              <Row
                key={item.id || item.title}
                leading="▣"
                title={item.title || item.text || 'Job'}
                subtitle={jobSubtitle(item)}
                trailing={(
                  <>
                    <Badge text="Unassigned" tone="warn" />
                    {canAssign ? (
                      <Button className="btn btn--secondary" onClick={() => setAssigning(item)}>
                        Assign technician →
                      </Button>
                    ) : null}
                  </>
                )}
              />
            ))
          ) : (
            <p className="muted work-empty">No unassigned work right now.</p>
          )}
        </Panel>

        <Panel>
          <PanelHead title="Assigned work" subtitle="Sample jobs with a technician" />
          {assigned.length ? (
            assigned.map((item) => (
              <Row
                key={item.id || item.title}
                leading="▣"
                title={item.title || item.text || 'Job'}
                subtitle={jobSubtitle(item)}
                trailing={<Badge text={technicianName(item.technician) || 'Assigned'} tone="good" />}
              />
            ))
          ) : (
            <p className="muted work-empty">Assigned jobs will appear here.</p>
          )}
        </Panel>

        <Panel>
          <PanelHead
            title="Office follow-ups"
            subtitle="AI actions awaiting review and campaign callbacks"
          />
          {officeItems.length ? (
            officeItems.map((item) => (
              <Row
                key={item.id || item.title}
                leading="✦"
                title={item.title}
                subtitle={followUpSubtitle(item)}
                trailing={(
                  <Button
                    className="btn btn--secondary"
                    onClick={() => setReviewing(item)}
                    aria-label={`Review ${item.title}${item.subject?.name ? ` for ${item.subject.name}` : ''}`}
                  >
                    Review
                  </Button>
                )}
              />
            ))
          ) : (
            <p className="muted work-empty">No AI actions need review.</p>
          )}
        </Panel>
      </div>

      <WorkFoot>
        Design concept · Assignments are sample data and last only for this browser session.
      </WorkFoot>

      {assigning ? (
        <AssignDialog
          job={assigning}
          onClose={() => setAssigning(null)}
          onDone={() => { setAssigning(null); loadTasks(true); }}
        />
      ) : null}
      {reviewing ? (
        <FollowUpReview
          item={reviewing}
          onClose={() => setReviewing(null)}
          onDone={() => { setReviewing(null); loadFollowUps(true); loadTasks(true); }}
        />
      ) : null}
    </WorkChrome>
  );
}
