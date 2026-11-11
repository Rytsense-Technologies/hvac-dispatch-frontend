// Tasks: the one queue of work that isn't done yet - unassigned jobs, assigned jobs, and the office's
// own follow-ups (texts to send, changes to apply, call-backs, records to update). A decision made here
// is the same decision as in Admin automation: this page is just worded for the people who dispatch.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import {
  PageHeader, Spinner, ErrorBox, Empty, Note, Badge, StatGrid, DataTable, Tabs, Overlay, Field, ActionButton, Button, toast, Card,
} from '../components/index.js';

const DEFAULT_REASON = 'Picked from the Tasks assignment dialog.';

// ---------- assign dialog: ranked list of technicians for one job ----------

function AssignDialog({ job, onClose, onDone }) {
  const [state, setState] = useState({ phase: 'loading' });

  useEffect(() => {
    let current = true;
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
  else {
    const technicians = state.choices.technicians || [];
    if (!technicians.length) {
      body = <Empty text="No technician can be shown for this job." />;
    } else {
      body = (
        <ul className="plain stack">
          {technicians.map((t) => (
            <li className="line" key={t.technician_id}>
              <div className="between">
                <span>
                  <strong>{t.name}</strong>{' '}<Badge text={t.verdict === 'matches' ? 'Matches' : 'Warning'} tone={t.verdict === 'matches' ? 'good' : 'warn'} />
                  {t.recommended ? <>{' '}<Badge text="Recommended" tone="info" /></> : null}
                  <small className="block muted">{t.text}</small>
                  {t.reasons && t.reasons.length ? <small className="block muted">{t.reasons.join(', ')}</small> : null}
                </span>
                {can('admin', 'dispatcher') ? (
                  <ActionButton
                    className="btn btn--primary"
                    disabled={t.eligible === false}
                    action={async () => {
                      await api(job.api.assign, { method: 'POST', body: { technician_id: t.technician_id, arrival: t.arrival, reason: DEFAULT_REASON } });
                      toast('Assigned.');
                      onDone();
                    }}
                  >Choose</ActionButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      );
    }
  }

  return (
    <Overlay title={`Assign: ${job.title || job.text || 'Job'}`} onClose={onClose} wide>
      <div className="stack">{body}</div>
    </Overlay>
  );
}

// ---------- unassigned / assigned work lists ----------

// The spec doesn't annotate a task's "technician" field with a shape the way it does "customer {id, name}"
// elsewhere, but the server sends it the same way - an {id, name} object, not a plain string.
function technicianName(t) {
  if (!t) return '';
  if (typeof t === 'object') return t.name || '';
  return String(t);
}

function WorkList({ items, canAssign, onAssign }) {
  if (!items.length) return <Empty text="Nothing here." />;
  return (
    <DataTable
      head={canAssign ? ['Task', 'Priority', 'Status', ''] : ['Task', 'Priority', 'Status']}
      rows={items.map((item) => {
        const cells = [
          <span><strong>{item.title || item.text}</strong>{item.place ? <small className="block muted">{item.place}</small> : null}{item.when ? <small className="block muted">{item.when}</small> : null}</span>,
          item.priority ? <Badge text={item.priority.label} tone={item.priority.code === 'urgent' ? 'bad' : item.priority.code === 'low' ? 'neutral' : 'warn'} /> : '-',
          <span>{item.status === 'assigned' ? 'Assigned' : 'Unassigned'}{item.technician ? <small className="block muted">{technicianName(item.technician)}</small> : null}</span>,
        ];
        if (canAssign) cells.push(item.status !== 'assigned' && item.api?.choices ? <Button className="btn btn--outline" onClick={() => onAssign(item)}>Assign</Button> : null);
        return cells;
      })}
    />
  );
}

// ---------- office follow-ups ----------

function FollowUpCard({ item, reload }) {
  const [text, setText] = useState(item.proposed?.text || '');
  const isReply = item.kind === 'text_reply';
  const approveLabel = (item.actions || []).find((a) => /send|approve/i.test(a)) || (isReply ? 'Send reply' : 'Mark handled');

  return (
    <Card as="article" className="stack">
      <div className="between">
        <span><strong>{item.title}</strong>{item.subject?.name ? <small className="block muted">{item.subject.name}{item.subject.phone ? ` · ${item.subject.phone}` : ''}</small> : null}</span>
        <small className="muted">{item.age || timeAgo(item.created_at)}</small>
      </div>
      {item.text ? <p>{item.text}</p> : null}
      {item.detail ? <p className="muted small">{item.detail}</p> : null}
      {isReply ? (
        <Field label="Proposed reply">
          <textarea maxLength={1000} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      ) : null}
      {can('admin', 'dispatcher') ? (
        <div className="row">
          {isReply ? (
            <ActionButton
              className="btn btn--outline"
              action={async () => {
                await api(item.api.edit, { method: 'POST', body: { text: text.trim() } });
                toast('Saved.');
                reload();
              }}
            >Save edit</ActionButton>
          ) : null}
          <ActionButton
            className="btn btn--primary"
            action={async () => {
              await api(item.api.approve, { method: 'POST', body: isReply ? { text: text.trim() } : {} });
              toast('Done.');
              reload();
            }}
          >{approveLabel}</ActionButton>
          <ActionButton
            className="btn btn--ghost"
            action={async () => {
              await api(item.api.dismiss, { method: 'POST', body: {} });
              toast('Dismissed.');
              reload();
            }}
          >Dismiss</ActionButton>
        </div>
      ) : null}
    </Card>
  );
}

function FollowUpHistory({ items }) {
  if (!items.length) return <Empty text="No history yet." />;
  return (
    <DataTable head={['Task', 'Status', 'Result', 'Decided by', 'When']} rows={items.map((h) => [
      h.title, h.status, h.sent_text || h.note || '-', h.decided_by || '-', h.decided_at ? timeAgo(h.decided_at) : '-',
    ])} />
  );
}

function FollowUps() {
  const [sub, setSub] = useState('open');
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);

  const load = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const data = await api('/v1/tasks/follow-ups', { params: { status: sub } });
      if (mine === latest.current) setState({ status: 'ready', data });
    } catch (error) {
      if (mine === latest.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { latest.current += 1; }; }, [sub]);
  useEvery(() => load(true), 30000);

  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (sub === 'open') {
    const items = state.data.items || [];
    body = items.length ? <div className="stack">{items.map((item) => <FollowUpCard key={item.id} item={item} reload={() => load(true)} />)}</div> : <Empty text="No open follow-ups." />;
  } else {
    body = <FollowUpHistory items={state.data.items || []} />;
  }

  return (
    <div className="stack">
      <Tabs options={[['open', 'Open'], ['history', 'History']]} value={sub} onChange={setSub} label="Follow-up view" />
      {body}
    </div>
  );
}

// ---------- page ----------

export default function Tasks() {
  const [tab, setTab] = useState('unassigned');
  const [state, setState] = useState({ status: 'loading' });
  const [assigning, setAssigning] = useState(null);
  const latest = useRef(0);

  const load = async (quiet) => {
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
  useEffect(() => { load(); return () => { latest.current += 1; }; }, []);
  useEvery(() => load(true), 30000);

  if (!can('admin', 'dispatcher', 'approver')) {
    return (
      <>
        <PageHeader title="Tasks" />
        <Note text="Not available for your role." tone="warn" />
      </>
    );
  }

  if (state.status === 'loading') return (<><PageHeader title="Tasks" /><Spinner /></>);
  if (state.status === 'error') return (<><PageHeader title="Tasks" /><ErrorBox error={state.error} /></>);

  const { counters, unassigned_work, assigned_work } = state.data;
  const statItems = [
    counters?.unassigned_work ? [counters.unassigned_work.text, counters.unassigned_work.value] : null,
    counters?.assigned_jobs ? [counters.assigned_jobs.text, counters.assigned_jobs.value] : null,
    counters?.office_follow_ups ? [counters.office_follow_ups.text, counters.office_follow_ups.value] : null,
  ].filter(Boolean);

  const canAssign = can('admin', 'dispatcher');

  return (
    <>
      <PageHeader title="Tasks" subtitle="Unassigned work, assigned work, and the office's own follow-ups - one queue." />
      {statItems.length ? <StatGrid items={statItems} /> : null}
      <Tabs options={[['unassigned', 'Unassigned work'], ['assigned', 'Assigned work'], ['followups', 'Office follow-ups']]} value={tab} onChange={setTab} label="Tasks view" />
      <div className="stack">
        {tab === 'unassigned' ? <WorkList items={(unassigned_work?.items || [])} canAssign={canAssign} onAssign={setAssigning} /> : null}
        {tab === 'assigned' ? <WorkList items={(assigned_work?.items || [])} canAssign={false} onAssign={() => {}} /> : null}
        {tab === 'followups' ? <FollowUps /> : null}
      </div>
      {assigning ? <AssignDialog job={assigning} onClose={() => setAssigning(null)} onDone={() => { setAssigning(null); load(true); }} /> : null}
    </>
  );
}
