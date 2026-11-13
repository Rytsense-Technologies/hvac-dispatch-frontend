// Work → Appointments: upcoming visits with confirmation tags + detail dialog.
// New design chrome; schedule list/filters/detail/actions restored from pre-design main.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime, formatTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, Details, Dialog, Empty, ErrorBox, Field,
  Note, Panel, Select, Spinner, toast, Row,
} from '../components/index.js';
import { WorkChrome, WorkFoot } from './workChrome.jsx';

const PAGE = 50;

const SCOPES = [
  ['upcoming', 'Upcoming'],
  ['past', 'Past'],
  ['scheduled', 'Scheduled'],
  ['cancelled', 'Cancelled'],
  ['all', 'All'],
];
const ASSIGNED = [
  ['', 'Any technician'],
  ['true', 'Assigned'],
  ['false', 'Unassigned'],
];
const CONFIRMATIONS = [
  ['', 'Any confirmation'],
  ['needs_confirmation', 'Needs confirmation'],
  ['confirmed', 'Confirmed'],
];

const SAMPLE_APPOINTMENTS = [
  {
    id: 'sample-1',
    isSample: true,
    title: 'Sarah Mitchell · AC repair',
    customerName: 'Sarah Mitchell',
    service: 'AC repair',
    text: 'Wed, Nov 11 · 1 PM–3 PM',
    address: '1206 Oak Street, Austin, TX',
    technician: { name: 'Unassigned' },
    confirmation: { label: 'Confirmed', code: 'confirmed' },
    history: ['Appointment requested by phone.'],
  },
  {
    id: 'sample-2',
    isSample: true,
    title: 'David Rodriguez · HVAC maintenance',
    customerName: 'David Rodriguez',
    service: 'HVAC maintenance',
    text: 'Wed, Nov 11 · 3:30 PM–4:30 PM',
    address: '742 Evergreen Terrace, Austin, TX',
    technician: { name: 'Mike Rodriguez' },
    confirmation: { label: 'Confirmed', code: 'confirmed' },
    history: ['Maintenance appointment confirmed.'],
  },
  {
    id: 'sample-3',
    isSample: true,
    title: 'William Brooks · Plumbing inspection',
    customerName: 'William Brooks',
    service: 'Plumbing inspection',
    text: 'Thu, Nov 12 · 9 AM–10 AM',
    address: '4508 Riverbend Road, Austin, TX',
    technician: { name: 'Unassigned' },
    confirmation: { label: 'Needs confirmation', code: 'needs_confirmation' },
    history: ['Inspection requested.'],
  },
];

const confirmTone = (code) => (
  code === 'confirmed' ? 'good'
    : code === 'cancelled' ? 'bad'
      : code === 'needs_confirmation' ? 'warn'
        : 'neutral'
);

function visitTitle(v) {
  if (v.title) return v.title;
  const customer = v.customer?.name || v.customerName || 'Customer';
  const service = v.service || 'Service visit';
  return `${customer} · ${service}`;
}

function visitSubtitle(v) {
  const when = v.text || v.when || (v.start_at ? formatDateTime(v.start_at) : 'Scheduled');
  const tech = v.technician?.name || (typeof v.technician === 'string' ? v.technician : 'Unassigned');
  return `${when} · ${tech}`;
}

function confirmationOf(v) {
  if (v.confirmation?.label) return v.confirmation;
  if (v.statusCode) {
    return {
      label: v.status || (v.statusCode === 'confirmed' ? 'Confirmed' : 'Needs confirmation'),
      code: v.statusCode,
    };
  }
  if (v.status === 'confirmed') return { label: 'Confirmed', code: 'confirmed' };
  return { label: 'Needs confirmation', code: 'needs_confirmation' };
}

// History lines come as plain strings in the sample data, but the server sends {at, text} objects - never
// put either straight into JSX (that throws "object as child"); always render through this.
function historyText(line) {
  if (line === null || line === undefined) return '';
  if (typeof line === 'string') return line;
  return `${line.text ?? ''}${line.at ? ` · ${new Date(line.at).toLocaleString()}` : ''}`;
}

// ---- reschedule: fetch free slots for a day, pick one, confirm ----

function RescheduleFlow({ visit, onCancel, onDone }) {
  const [date, setDate] = useState(() => (visit.start_at || '').slice(0, 10));
  const [state, setState] = useState({ phase: 'loading' });
  const [chosen, setChosen] = useState(null);
  const seq = useRef(0);
  const slotsUrl = visit.api?.slots || (visit.id ? `/v1/appointments/${visit.id}/slots` : null);

  useEffect(() => {
    if (!slotsUrl) {
      setState({ phase: 'error', error: new Error('No slots endpoint for this visit.') });
      return undefined;
    }
    const n = ++seq.current;
    setState({ phase: 'loading' });
    setChosen(null);
    (async () => {
      try {
        const out = await api(slotsUrl, { params: { date } });
        if (n === seq.current) setState({ phase: 'ready', data: out });
      } catch (error) {
        if (n === seq.current) setState({ phase: 'error', error });
      }
    })();
    return () => { seq.current += 1; };
  }, [date, slotsUrl]);

  if (state.phase === 'loading') return <div className="stack"><Spinner text="Looking for free slots…" /></div>;
  if (state.phase === 'error') {
    return (
      <div className="stack">
        <ErrorBox error={state.error} />
        <div className="right"><Button className="btn btn--ghost" onClick={onCancel}>Back</Button></div>
      </div>
    );
  }

  const { slots = [], last_day: lastDay, open_day: openDay } = state.data;
  const rescheduleUrl = visit.api?.reschedule || (visit.id ? `/v1/appointments/${visit.id}/reschedule` : null);

  return (
    <div className="stack">
      <h3>Reschedule</h3>
      <Field label="Date" hint={lastDay ? `This visit can be moved up to ${lastDay}.` : undefined}>
        <input type="date" value={date} max={lastDay || undefined} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {openDay === false ? <Note text="The company is closed this day." tone="warn" /> : null}
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
          disabled={chosen === null || !rescheduleUrl}
          action={async () => {
            const slot = slots[chosen];
            const updated = await api(rescheduleUrl, { method: 'POST', body: { start_at: slot.start_at } });
            toast('Appointment moved to the new time.');
            onDone(updated);
          }}
        >
          Confirm new time
        </ActionButton>
      </div>
    </div>
  );
}

// ---- detail dialog for one visit ----

// Exported so other screens that already know a visit's own detail endpoint (e.g. Work / Schedule)
// can reuse this exact dialog instead of building a second one - pass { id, api: { detail } }.
export function AppointmentDetail({ initial, onClose, reload, demoMode }) {
  const isSample = Boolean(initial.isSample || demoMode);
  const [detailUrl, setDetailUrl] = useState(
    initial.api?.detail || (initial.id && !initial.isSample ? `/v1/appointments/${initial.id}/detail` : null),
  );
  const [state, setState] = useState(isSample ? { phase: 'sample' } : { phase: 'loading' });
  const [flow, setFlow] = useState(false);
  const seq = useRef(0);
  const roleOk = can('admin', 'dispatcher');

  const load = useCallback((url) => {
    if (!url) {
      setState({ phase: 'error', error: new Error('No detail endpoint for this visit.') });
      return;
    }
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

  useEffect(() => {
    if (isSample) return undefined;
    load(detailUrl);
    return () => { seq.current += 1; };
  }, [detailUrl, load, isSample]);

  if (isSample) {
    const conf = confirmationOf(initial);
    return (
      <Dialog title={`Appointment · ${initial.customerName || visitTitle(initial)}`} onClose={onClose} wide>
        <p className="work-dialog-eyebrow">Sample workspace</p>
        <p>
          <strong>{initial.service || 'Service visit'}</strong>
          <br />
          {initial.text || visitSubtitle(initial)}
          <br />
          {initial.address || 'Address on file'}
          <br />
          Technician: {initial.technician?.name || 'Unassigned'}
          <br />
          Status: {conf.label}
        </p>
        {initial.history?.length ? (
          <p>
            <strong>History</strong>
            <br />
            {historyText(Array.isArray(initial.history) ? initial.history[0] : initial.history)}
          </p>
        ) : null}
        <div className="work-dialog-actions">
          <a href="/customers" className="btn btn--secondary" onClick={onClose}>View customer</a>
          <a href="/work" className="btn btn--secondary" onClick={onClose}>View task</a>
          <Button className="btn btn--secondary" onClick={() => { toast('Sample confirm only.'); onClose(); }}>Confirm</Button>
          <Button className="btn btn--secondary" onClick={() => { toast('Sample reschedule only.'); onClose(); }}>Reschedule</Button>
          <Button className="btn btn--secondary" onClick={() => { toast('Sample cancel only.'); onClose(); }}>Cancel appointment</Button>
        </div>
        <p className="work-sample-label">Sample changes stay in this browser session. No customer is notified.</p>
      </Dialog>
    );
  }

  const detail = state.phase === 'ready' ? state.detail : null;
  const actionsById = Object.fromEntries((detail?.actions || []).map((a) => [a.id, a]));
  const apiMap = detail?.api || {};
  const endpoint = (key) => apiMap[key] || (detail?.id ? `/v1/appointments/${detail.id}/${key}` : null);

  const simple = (key, okMessage) => async () => {
    const url = endpoint(key);
    if (!url) throw new Error(`No ${key} endpoint for this visit.`);
    await api(url, { method: 'POST' });
    toast(okMessage);
    load(detailUrl);
    reload();
  };

  return (
    <Dialog title={detail?.title || visitTitle(initial)} onClose={onClose} wide>
      <div className="stack">
        {state.phase === 'loading' ? <Spinner /> : null}
        {state.phase === 'error' ? <ErrorBox error={state.error} /> : null}
        {detail ? (
          <>
            <div className="row wrap" style={{ gap: 8 }}>
              <Badge text={detail.confirmation?.label || confirmationOf(detail).label} tone={confirmTone(detail.confirmation?.code || confirmationOf(detail).code)} />
              {detail.text ? <span className="muted">{detail.text}</span> : null}
            </div>
            <h3>Customer</h3>
            <Details rows={[
              ['Name', detail.customer?.name],
              ['Phone', detail.customer?.phone],
              ['Address', detail.address],
            ]}
            />
            <h3>Visit</h3>
            <Details rows={[
              ['Service', detail.service],
              ['When', detail.when || detail.text],
              ['Technician', detail.technician ? detail.technician.name : 'Unassigned'],
              ['Status', detail.status],
              ['Job status', detail.job_status],
              ['Purpose', detail.purpose],
              ['Reference', detail.reference],
            ]}
            />
            {detail.history?.length ? (
              <>
                <h3>History</h3>
                <ul className="plain">{detail.history.map((line, i) => <li key={i}>{historyText(line)}</li>)}</ul>
              </>
            ) : null}
            {detail.job_id ? <p><a href="/jobs">See it on the Jobs screen</a></p> : null}

            {!flow ? (
              <section className="stack">
                <h3>Actions</h3>
                {!roleOk ? <Note text="Your role can look at appointments but not change them." tone="warn" /> : (
                  <div className="work-dialog-actions">
                    <ActionButton
                      className="btn btn--primary"
                      disabled={actionsById.confirm ? !actionsById.confirm.allowed : !endpoint('confirm')}
                      action={simple('confirm', 'Confirmed.')}
                    >
                      {actionsById.confirm?.label || 'Confirm'}
                    </ActionButton>
                    <Button
                      className="btn btn--secondary"
                      disabled={actionsById.reschedule ? !actionsById.reschedule.allowed : !endpoint('reschedule')}
                      onClick={() => setFlow(true)}
                    >
                      {actionsById.reschedule?.label || 'Reschedule'}
                    </Button>
                    <ActionButton
                      className="btn btn--danger"
                      disabled={actionsById.cancel ? !actionsById.cancel.allowed : !endpoint('cancel')}
                      action={simple('cancel', 'Appointment cancelled.')}
                    >
                      {actionsById.cancel?.label || 'Cancel'}
                    </ActionButton>
                  </div>
                )}
                {actionsById.confirm && !actionsById.confirm.allowed && actionsById.confirm.why_not ? (
                  <small className="block muted">{actionsById.confirm.why_not}</small>
                ) : null}
                {actionsById.reschedule && !actionsById.reschedule.allowed && actionsById.reschedule.why_not ? (
                  <small className="block muted">{actionsById.reschedule.why_not}</small>
                ) : null}
                {actionsById.cancel && !actionsById.cancel.allowed && actionsById.cancel.why_not ? (
                  <small className="block muted">{actionsById.cancel.why_not}</small>
                ) : null}
                <div className="work-dialog-actions" style={{ marginTop: 4 }}>
                  <a href="/customers" className="btn btn--ghost" onClick={onClose}>View customer</a>
                  <a href="/work" className="btn btn--ghost" onClick={onClose}>View task</a>
                </div>
              </section>
            ) : (
              <RescheduleFlow
                visit={detail}
                onCancel={() => setFlow(false)}
                onDone={(updated) => {
                  setFlow(false);
                  setDetailUrl(updated?.api?.detail || detailUrl);
                  reload();
                }}
              />
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

export default function Appointments() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [demoMode, setDemoMode] = useState(false);
  const [scope, setScope] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [assigned, setAssigned] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [offset, setOffset] = useState(0);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const seq = useRef(0);
  const latest = useRef({});
  latest.current = { scope, search, assigned, confirmation, offset };

  useEffect(() => {
    if (!allowed || demoMode) return undefined;
    const n = ++seq.current;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      const { scope: sc, search: q, assigned: a, confirmation: c, offset: o } = latest.current;
      try {
        const out = await api('/v1/appointments/schedule', {
          params: {
            scope: sc,
            search: q || undefined,
            assigned: a === '' ? undefined : a,
            confirmation: c || undefined,
            limit: PAGE,
            offset: o,
          },
        });
        if (n !== seq.current) return;
        // Live schedule returns `appointments`; keep `visits` as a fallback for older payloads.
        const rows = Array.isArray(out?.appointments)
          ? out.appointments
          : (Array.isArray(out?.visits) ? out.visits : []);
        setData({ items: rows, offset: o, hasMore: Boolean(out?.has_more) });
        setLoading(false);
      } catch (e) {
        if (n !== seq.current) return;
        setError(e);
        setLoading(false);
      }
    }, 250);
    return () => { seq.current += 1; clearTimeout(timer); };
  }, [scope, search, assigned, confirmation, offset, nonce, allowed, demoMode]);

  const chrome = (body) => (
    <WorkChrome
      tab="appointments"
      eyebrow="Schedule"
      subtitle="Review visits, technicians, and confirmation status."
      demoMode={demoMode}
      onToggleDemo={() => setDemoMode((v) => !v)}
    >
      {body}
    </WorkChrome>
  );

  if (!allowed) {
    return chrome(<Note text="Not available for your role." tone="warn" />);
  }

  const items = demoMode ? SAMPLE_APPOINTMENTS : (data?.items || []);
  const panelTitle = scope === 'upcoming' ? 'Upcoming appointments' : 'Appointments';

  let list;
  if (demoMode) {
    list = items.map((item) => {
      const conf = confirmationOf(item);
      return (
        <Row
          key={item.id}
          leading="▣"
          title={visitTitle(item)}
          subtitle={visitSubtitle(item)}
          trailing={(
            <>
              <Badge text={conf.label} tone={confirmTone(conf.code)} />
              <Button
                className="btn btn--secondary"
                onClick={() => setSelected(item)}
                aria-label={`View appointment for ${item.customerName || visitTitle(item)}`}
              >
                View details →
              </Button>
            </>
          )}
        />
      );
    });
  } else if (loading && !data) {
    list = <Spinner />;
  } else if (error) {
    list = <ErrorBox error={error} />;
  } else if (!items.length) {
    list = <Empty text="No appointments match." />;
  } else {
    list = items.map((item) => {
      const conf = confirmationOf(item);
      return (
        <Row
          key={item.id}
          leading="▣"
          title={visitTitle(item)}
          subtitle={visitSubtitle(item)}
          trailing={(
            <>
              <Badge text={conf.label} tone={confirmTone(conf.code)} />
              <Button
                className="btn btn--secondary"
                onClick={() => setSelected(item)}
                aria-label={`View appointment ${visitTitle(item)}`}
              >
                View details →
              </Button>
            </>
          )}
        />
      );
    });
  }

  return chrome(
    <>
      {!demoMode ? (
        <div className="toolbar work-toolbar">
          <input
            type="text"
            aria-label="Search appointments"
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
          <span className="muted">{data ? (data.items.length ? `${data.offset + 1}–${data.offset + data.items.length}` : '0') : ''}</span>
          <Button className="btn btn--ghost" aria-label="Next page" disabled={data ? !data.hasMore : true} onClick={() => setOffset((o) => o + PAGE)}>›</Button>
        </div>
      ) : null}

      <Panel>
        <h2 className="work-panel-title">{panelTitle}</h2>
        <div className="work-rows">{list}</div>
      </Panel>

      <WorkFoot>
        {demoMode
          ? 'Sample records · Session changes only · No real scheduling or notifications.'
          : 'Live schedule · Confirm, reschedule, and cancel call the appointments API.'}
      </WorkFoot>

      {selected ? (
        <AppointmentDetail
          initial={selected}
          demoMode={demoMode}
          onClose={() => setSelected(null)}
          reload={() => setNonce((v) => v + 1)}
        />
      ) : null}
    </>,
  );
}
