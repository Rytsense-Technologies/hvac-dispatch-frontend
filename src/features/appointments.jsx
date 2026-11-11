// Appointments: visits on the schedule - who's coming, when, and whether the customer has confirmed.
// Confirm, reschedule or cancel from here; a visit that already has a technician assigned needs the dispatch board instead.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, formatTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Empty, ErrorBox, Field, Note, Overlay, PageHeader, Select, Spinner, toast,
} from '../components/index.js';

const PAGE = 50;

const SCOPES = [['upcoming', 'Upcoming'], ['past', 'Past'], ['scheduled', 'Scheduled'], ['cancelled', 'Cancelled'], ['all', 'All']];
const ASSIGNED = [['', 'Any technician'], ['true', 'Assigned'], ['false', 'Unassigned']];
const CONFIRMATIONS = [['', 'Any confirmation'], ['needs_confirmation', 'Needs confirmation'], ['confirmed', 'Confirmed']];

const confirmTone = (code) => (code === 'confirmed' ? 'good' : code === 'cancelled' ? 'bad' : code === 'needs_confirmation' ? 'warn' : 'neutral');

// ---- reschedule: fetch the free slots for a day, let the person pick one, confirm ----

function RescheduleFlow({ visit, onCancel, onDone }) {
  const [date, setDate] = useState(() => (visit.start_at || '').slice(0, 10));
  const [state, setState] = useState({ phase: 'loading' });
  const [chosen, setChosen] = useState(null);
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setState({ phase: 'loading' });
    setChosen(null);
    (async () => {
      try {
        const out = await api(visit.api.slots, { params: { date } });
        if (n === seq.current) setState({ phase: 'ready', data: out });
      } catch (error) {
        if (n === seq.current) setState({ phase: 'error', error });
      }
    })();
    return () => { seq.current += 1; };
  }, [date, visit.api.slots]);

  if (state.phase === 'loading') return <div className="stack"><Spinner text="Looking for free slots…" /></div>;
  if (state.phase === 'error') {
    return (
      <div className="stack">
        <ErrorBox error={state.error} />
        <div className="right"><Button className="btn btn--ghost" onClick={onCancel}>Back</Button></div>
      </div>
    );
  }

  const { slots = [], last_day, open_day } = state.data;
  return (
    <div className="stack">
      <h3>Reschedule</h3>
      <Field label="Date" hint={last_day ? `This visit can be moved up to ${last_day}.` : undefined}>
        <input type="date" value={date} max={last_day || undefined} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {open_day === false ? <Note text="The company is closed this day." tone="warn" /> : null}
      {!slots.length ? <Empty text="No free slots on this day. Try another date." /> : (
        <fieldset className="stack">
          <legend>Choose a new time</legend>
          {slots.map((slot, index) => (
            <label className="choice" key={slot.start_at}>
              <input type="radio" name="slot" checked={chosen === index} onChange={() => setChosen(index)} />
              <span>{`${formatDateTime(slot.start_at)}–${formatTime(slot.end_at)}`}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="right">
        <Button className="btn btn--ghost" onClick={onCancel}>Back</Button>
        <ActionButton
          className="btn btn--primary"
          disabled={chosen === null}
          action={async () => {
            const slot = slots[chosen];
            const updated = await api(visit.api.reschedule, { method: 'POST', body: { start_at: slot.start_at } });
            toast('Appointment moved to the new time.');
            onDone(updated);
          }}
        >Confirm new time</ActionButton>
      </div>
    </div>
  );
}

// ---- the drawer for one visit ----

function AppointmentDrawer({ initial, onClose, reload }) {
  const [detailUrl, setDetailUrl] = useState(initial.api.detail);
  const [state, setState] = useState({ phase: 'loading' });
  const [flow, setFlow] = useState(false); // reschedule sub-flow open?
  const seq = useRef(0);
  const roleOk = can('admin', 'dispatcher');

  const load = useCallback((url) => {
    const n = ++seq.current;
    setState({ phase: 'loading' });
    (async () => {
      try {
        const detail = await api(url);
        if (n === seq.current) setState({ phase: 'ready', detail });
      } catch (error) {
        if (n === seq.current) setState({ phase: 'error', error });
      }
    })();
  }, []);

  useEffect(() => { load(detailUrl); return () => { seq.current += 1; }; }, [detailUrl, load]);

  const detail = state.phase === 'ready' ? state.detail : null;
  const actionsById = Object.fromEntries((detail?.actions || []).map((a) => [a.id, a]));

  const simple = (key, okMessage) => async () => {
    await api(detail.api[key], { method: 'POST' });
    toast(okMessage);
    load(detailUrl);
    reload();
  };

  return (
    <Overlay title={detail?.title || initial.title || `Visit #${initial.id}`} wide onClose={onClose}>
      <div className="stack">
        {state.phase === 'loading' && <Spinner />}
        {state.phase === 'error' && <ErrorBox error={state.error} />}
        {detail && (
          <>
            <div className="row">
              <Badge text={detail.confirmation.label} tone={confirmTone(detail.confirmation.code)} />
              <span className="muted">{detail.text}</span>
            </div>
            <h3>Customer</h3>
            <Details rows={[['Name', detail.customer.name], ['Phone', detail.customer.phone], ['Address', detail.address]]} />
            <h3>Visit</h3>
            <Details rows={[
              ['Service', detail.service],
              ['When', detail.when],
              ['Technician', detail.technician ? detail.technician.name : 'Unassigned'],
              ['Status', detail.status],
              ['Job status', detail.job_status],
              ['Purpose', detail.purpose],
              ['Reference', detail.reference],
            ]} />
            {detail.history?.length ? (
              <>
                <h3>History</h3>
                <ul className="plain">{detail.history.map((line, i) => <li key={i}>{line}</li>)}</ul>
              </>
            ) : null}
            {detail.job_id ? <p><a href="#/jobs">See it on the Jobs screen</a></p> : null}

            {!flow && (
              <section className="card stack">
                <h3>Actions</h3>
                {!roleOk ? <Note text="Your role can look at appointments but not change them." tone="warn" /> : (
                  <div className="stack">
                    <div>
                      <ActionButton className="btn btn--primary" disabled={!actionsById.confirm?.allowed} action={simple('confirm', 'Confirmed.')}>
                        {actionsById.confirm?.label || 'Confirm'}
                      </ActionButton>
                      {!actionsById.confirm?.allowed && actionsById.confirm?.why_not ? <small className="block muted">{actionsById.confirm.why_not}</small> : null}
                    </div>
                    <div>
                      <Button className="btn btn--outline" disabled={!actionsById.reschedule?.allowed} onClick={() => setFlow(true)}>
                        {actionsById.reschedule?.label || 'Reschedule'}
                      </Button>
                      {!actionsById.reschedule?.allowed && actionsById.reschedule?.why_not ? <small className="block muted">{actionsById.reschedule.why_not}</small> : null}
                    </div>
                    <div>
                      <ActionButton className="btn btn--danger" disabled={!actionsById.cancel?.allowed} action={simple('cancel', 'Appointment cancelled.')}>
                        {actionsById.cancel?.label || 'Cancel'}
                      </ActionButton>
                      {!actionsById.cancel?.allowed && actionsById.cancel?.why_not ? <small className="block muted">{actionsById.cancel.why_not}</small> : null}
                    </div>
                  </div>
                )}
              </section>
            )}

            {flow && (
              <section className="card stack">
                <RescheduleFlow
                  visit={detail}
                  onCancel={() => setFlow(false)}
                  onDone={(updated) => {
                    setFlow(false);
                    setDetailUrl(updated.api.detail);
                    reload();
                  }}
                />
              </section>
            )}
          </>
        )}
      </div>
    </Overlay>
  );
}

// ---- the list ----

function AppointmentsTable({ rows, open }) {
  return (
    <DataTable
      head={['Visit', 'Schedule', 'Confirmation']}
      rows={rows.map((v) => [
        <span><strong>{v.title}</strong><small className="block muted clip">{v.address}</small></span>,
        v.text,
        <Badge text={v.confirmation.label} tone={confirmTone(v.confirmation.code)} />,
      ])}
      onRow={(_cells, index) => open(rows[index])}
      label="Appointments"
    />
  );
}

export default function Appointments() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [scope, setScope] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [assigned, setAssigned] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [offset, setOffset] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState(null); // { items, offset, hasMore } of the last successful load
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null); // the visit (list row) shown in the drawer
  const seq = useRef(0);
  const latest = useRef({});
  latest.current = { scope, search, assigned, confirmation, offset };

  useEffect(() => {
    if (!allowed) return undefined;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      const { scope: sc, search: q, assigned: a, confirmation: c, offset: o } = latest.current;
      try {
        const out = await api('/v1/appointments/schedule', { params: { scope: sc, search: q, assigned: a, confirmation: c, limit: PAGE, offset: o } });
        if (n !== seq.current) return;
        setData({ items: out.visits, offset: o, hasMore: out.has_more });
        setLoading(false);
      } catch (e) {
        if (n !== seq.current) return;
        setError(e);
        setLoading(false);
      }
    }, 250);
    return () => { seq.current += 1; clearTimeout(timer); };
  }, [scope, search, assigned, confirmation, offset, nonce, allowed]);

  if (!allowed) {
    return (
      <>
        <PageHeader title="Appointments" />
        <Note text="Not available for your role." tone="warn" />
      </>
    );
  }

  const items = data ? data.items : [];
  let list;
  if (loading && !data) list = <Spinner />;
  else if (error) list = <ErrorBox error={error} />;
  else if (!items.length) list = <Empty text="No appointments match." />;
  else list = <AppointmentsTable rows={items} open={setOpen} />;

  return (
    <>
      <PageHeader title="Appointments" subtitle="Visits on the schedule: who's coming, when, and whether the customer has confirmed." />
      <div className="toolbar">
        <input
          type="text"
          aria-label="Search"
          placeholder="Search customer, address, service…"
          className="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
        />
        <Select options={SCOPES} value={scope} aria-label="Scope" onChange={(e) => { setScope(e.target.value); setOffset(0); }} />
        <Select options={ASSIGNED} value={assigned} aria-label="Technician" onChange={(e) => { setAssigned(e.target.value); setOffset(0); }} />
        <Select options={CONFIRMATIONS} value={confirmation} aria-label="Confirmation" onChange={(e) => { setConfirmation(e.target.value); setOffset(0); }} />
        <span className="spacer" />
        <Button className="btn btn--ghost" aria-label="Previous page" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹</Button>
        <span className="muted">{data ? (data.items.length ? `${data.offset + 1}-${data.offset + data.items.length}` : '0') : ''}</span>
        <Button className="btn btn--ghost" aria-label="Next page" disabled={data ? !data.hasMore : true} onClick={() => setOffset((o) => o + PAGE)}>›</Button>
      </div>
      <div>{list}</div>
      {open ? <AppointmentDrawer initial={open} onClose={() => setOpen(null)} reload={() => setNonce((v) => v + 1)} /> : null}
    </>
  );
}
