// Approvals: a proposal becomes a booking only when a person other than the requester approves it.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, timeAgo, dayOf } from '../lib/format.js';
import { session } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import { PageHeader, Spinner, ErrorBox, Empty, Badge, Field, ActionButton, toast, Card } from '../components/index.js';

const ACTIONS = { assign_job: 'Assign a technician', replan_jobs: 'Move jobs to other technicians' };

export const optionsOf = (approval) => approval.payload?.options || (approval.payload?.option ? [approval.payload.option] : []);

// The company days an approval list touches, so the screen can load those days' jobs and name each job and customer.
export function daysOf(approvals) {
  const days = new Set();
  for (const approval of approvals) for (const option of optionsOf(approval)) if (option.arrival) days.add(dayOf(option.arrival));
  return [...days].sort();
}

export function describe(approval, { technicians = {}, jobs = {} }) {
  const items = optionsOf(approval).map((option) => {
    const job = jobs[option.job_id] || {};
    return {
      service: job.service_type || 'Job', customer: job.customer_name || '', address: job.address || '',
      technician: technicians[option.technician_id] || option.technician_id, arrival: option.arrival, previous: job.technician_name || null,
    };
  });
  const title = approval.action === 'assign_job' && items[0] ? `Assign ${items[0].technician}`
    : approval.action === 'replan_jobs' ? `Move ${items.length} job${items.length === 1 ? '' : 's'}${technicians[approval.payload?.technician_id] ? ` off ${technicians[approval.payload.technician_id]}` : ''}`
      : ACTIONS[approval.action] || approval.action;
  return { title, items };
}

// A person may not decide their own request: the server refuses it, the screen says so up front.
export const isOwn = (approval, actor) => !!actor && approval.requested_by === actor;

function ApprovalCard({ approval, names, jobs, reload }) {
  const { title, items } = describe(approval, { technicians: names, jobs });
  const [reason, setReason] = useState('');
  const empty = !reason.trim();
  const decide = (yes) => async () => {
    await api(`/v1/dispatch/approvals/${approval.id}/decision`, { method: 'POST', body: { approve: yes, reason: reason.trim() } });
    toast(yes ? 'Approved: the appointment is booked.' : 'Rejected.');
    reload();
  };
  return (
    <Card as="article" className="stack" aria-label={title}>
      <div className="between"><h2>{title}</h2><p className="muted">Requested by <strong>{approval.requested_by}</strong>{` · ${timeAgo(approval.created_at)}`}</p></div>
      <ul className="plain">{items.map((i, n) => (
        <li className="line" key={n}>
          <strong>{i.service}</strong>{i.customer ? ` for ${i.customer}` : ''}{` — ${i.technician} at ${formatDateTime(i.arrival)}`}
          {i.address ? <small className="block muted">{i.address}</small> : null}
          {i.previous && i.previous !== i.technician ? <small className="block muted">{`Currently with ${i.previous}`}</small> : null}
        </li>
      ))}</ul>
      <p className="muted"><strong>Why: </strong>{approval.reason}</p>
      {isOwn(approval, session.actor)
        ? <p className="note note--warn" role="note">You asked for this, so a different person has to decide it.</p>
        : (
          <div className="decision">
            <Field label="Reason for your decision"><input type="text" maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
            <div className="row">
              <ActionButton className="btn btn--primary" disabled={empty} action={decide(true)}>Approve</ActionButton>
              <ActionButton className="btn btn--outline" disabled={empty} action={decide(false)}>Reject</ActionButton>
            </div>
          </div>
        )}
    </Card>
  );
}

export default function Approvals() {
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);

  const load = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const [list, techs] = await Promise.all([api('/v1/dispatch/approvals'), api('/v1/dispatch/technicians')]);
      const names = Object.fromEntries(techs.technicians.map((t) => [t.id, t.name]));
      const jobs = {};
      await Promise.all(daysOf(list).map(async (day) => {
        for (const job of (await api('/v1/dispatch/jobs', { params: { date: day, limit: 500 } })).jobs) jobs[job.id] = job;
      }));
      if (mine === latest.current) setState({ status: 'ready', list, names, jobs });
    } catch (error) {
      if (mine === latest.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { latest.current += 1; }; }, []);
  useEvery(() => load(true), 30000);

  const ready = state.status === 'ready';
  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (state.list.length) body = state.list.map((a) => <ApprovalCard key={a.id} approval={a} names={state.names} jobs={state.jobs} reload={() => load(true)} />);
  else body = <Empty text="Nothing is waiting for approval." />;

  return (
    <>
      <PageHeader title="Approvals" subtitle="A proposal becomes a booking only when a person other than the requester approves it.">
        {ready && state.list.length ? <Badge text={`${state.list.length} waiting`} tone="warn" /> : null}
      </PageHeader>
      <div className="stack">{body}</div>
    </>
  );
}
