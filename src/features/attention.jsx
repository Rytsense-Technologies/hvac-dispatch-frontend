// Needs attention: booked jobs that no longer fit their technician. Nothing moves by itself: each has a proposed replacement, or a reason there is none.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, short, reasonText } from '../lib/format.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import { PageHeader, Spinner, ErrorBox, Empty, Badge, DataTable, Select, ActionButton, toast } from '../components/index.js';

export function proposalText(v) {
  if (v.status === 'resolved') return v.resolution === 'cleared' ? 'Fixed: it fits again' : 'Closed: the booking moved or ended';
  if (v.approval) return v.approval.status === 'pending' ? 'Replacement proposed: waiting for approval' : `Replacement ${v.approval.status}`;
  if (v.proposal_error) return `No replacement yet: ${reasonText(v.proposal_error)}`;
  return 'Working out a replacement…';
}

export default function Attention() {
  const [filter, setFilter] = useState('open');
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const load = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    const shown = filterRef.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const { violations } = await api('/v1/dispatch/violations', { params: { status: shown } });
      if (mine === latest.current) setState({ status: 'ready', violations, shown });
    } catch (error) {
      if (mine === latest.current) setState({ status: 'error', error });
    }
  };
  useEffect(() => { load(); return () => { latest.current += 1; }; }, [filter]);
  useEvery(() => load(true), 30000);

  const check = async () => {
    const r = await api('/v1/dispatch/monitor/run', { method: 'POST', body: {} });
    toast(`Checked ${r.technicians_checked} technician(s): ${r.opened} new problem(s), ${r.proposed} replacement(s) proposed.`);
    load(true);
  };

  let body;
  if (state.status === 'loading') body = <Spinner />;
  else if (state.status === 'error') body = <ErrorBox error={state.error} />;
  else if (state.violations.length) {
    body = (
      <DataTable head={['Job', 'Was booked', 'Technician', 'Why it no longer fits', 'Replacement']} rows={state.violations.map((v) => [
        <span><strong>{v.summary?.service_type || 'Job'}</strong><small className="block muted">{short(v.job_id)}</small></span>,
        formatDateTime(v.summary?.scheduled_at), v.technician_name || v.technician_id,
        <span className="row wrap">{v.reasons.map((r) => <Badge key={r} text={reasonText(r)} tone="bad" />)}</span>,
        <span>{proposalText(v)}{v.approval?.status === 'pending' && can('approver', 'admin') ? <>{' '}<a href="#/approvals">Review</a></> : null}</span>,
      ])} />
    );
  } else body = <Empty text={state.shown === 'open' ? 'Nothing needs attention. Every booked job fits its technician.' : 'Nothing to show.'} />;

  return (
    <>
      <PageHeader title="Needs attention" subtitle="Booked jobs that no longer fit their technician. Nothing moves by itself.">
        <Select aria-label="Show" value={filter} onChange={(e) => setFilter(e.target.value)} options={[['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']]} />
        {can('dispatcher', 'admin') ? <ActionButton className="btn btn--primary" action={check}>Check everything now</ActionButton> : null}
      </PageHeader>
      <div>{body}</div>
    </>
  );
}
