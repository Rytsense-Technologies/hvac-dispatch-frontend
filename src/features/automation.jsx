// Admin automation: nested under Settings — Needs review + Completed history matching the reference.
// Live queue stays honest: empty means empty; samples only when "Show sample queue" is on.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import {
  ActionButton, Button, Dialog, ErrorBox, Field, Note,
  PageHeader, Panel, Row, Spinner, toast,
} from '../components/index.js';

const SAMPLE_REVIEW = [
  {
    id: 'sample_invoice',
    heading: 'Invoice follow-up',
    customer: 'Sarah Mitchell',
    line: 'Invoice #1048 · $240 overdue',
    status: { label: 'Needs approval' },
    dialog: {
      customer: { name: 'Sarah Mitchell' },
      proposed_label: 'Proposed action or message',
      proposed: 'Hi Sarah, this is a friendly reminder that invoice #1048 for $240 is overdue. Please contact our office if you have questions.',
      editable: true,
      approve: { label: 'Approve sample action' },
      reject: { label: 'Reject' },
    },
    sample: true,
  },
  {
    id: 'sample_customer',
    heading: 'Customer record update',
    customer: 'David Rodriguez',
    line: 'Contact details extracted from a call',
    status: { label: 'Needs review' },
    dialog: {
      customer: { name: 'David Rodriguez' },
      proposed_label: 'Proposed action or message',
      proposed: 'Update customer contact details based on the reviewed call summary.',
      editable: true,
      approve: { label: 'Approve sample action' },
      reject: { label: 'Reject' },
    },
    sample: true,
  },
  {
    id: 'sample_docs',
    heading: 'Job documentation',
    customer: 'William Brooks',
    line: 'Service notes prepared for office review',
    status: { label: 'Needs review' },
    dialog: {
      customer: { name: 'William Brooks' },
      proposed_label: 'Proposed action or message',
      proposed: 'Organize the service notes for the office team.',
      editable: true,
      approve: { label: 'Approve sample action' },
      reject: { label: 'Reject' },
    },
    sample: true,
  },
  {
    id: 'sample_estimate',
    heading: 'Estimate follow-up',
    customer: 'Jessica Taylor',
    line: 'Open estimate · Follow-up requested',
    status: { label: 'Needs approval' },
    dialog: {
      customer: { name: 'Jessica Taylor' },
      proposed_label: 'Proposed action or message',
      proposed: 'Hi Jessica, would you like to discuss your service estimate? Please let us know a convenient time.',
      editable: true,
      approve: { label: 'Approve sample action' },
      reject: { label: 'Reject' },
    },
    sample: true,
  },
];

function customerLine(c) {
  if (!c) return '';
  if (typeof c === 'object') return [c.name, c.phone].filter(Boolean).join(' · ');
  return String(c);
}

function itemTitle(item) {
  const heading = item.heading || item.title || 'Action';
  const customer = typeof item.customer === 'string'
    ? item.customer
    : (item.customer?.name || item.dialog?.customer?.name || '');
  return customer ? `${heading} · ${customer}` : heading;
}

function itemSubtitle(item) {
  const detail = item.line || item.text || item.details || '';
  const status = item.status?.label || item.status || '';
  if (detail && status) return `${detail} · ${status}`;
  return detail || status || '';
}

function ReviewDialog({ item, history = false, onClose, onSampleComplete, reload }) {
  const dialog = item.dialog || {};
  const [text, setText] = useState(dialog.proposed || item.proposed?.text || item.result || '');
  const sample = item.sample || String(item.id || '').startsWith('sample_');
  const writer = can('admin', 'dispatcher');
  const readOnly = history || !writer;

  return (
    <Dialog
      title={`${history ? 'Action history' : 'Review'} · ${item.heading || item.title || 'Action'}`}
      onClose={onClose}
      wide
    >
      <div className="stack">
        <p>
          <strong>{customerLine(dialog.customer) || itemTitle(item)}</strong>
          <br />
          {item.line || item.text || item.details || ''}
          {item.source ? <><br />Source: {item.source}</> : null}
          {item.status ? <><br />Status: {item.status.label || item.status}</> : null}
          {history && item.decided_by ? <><br />Reviewed by {item.decided_by}{item.decided_at ? ` · ${timeAgo(item.decided_at)}` : ''}</> : null}
        </p>
        {history ? (
          <p className="sub">Read-only history. No message was sent and no business record was changed unless your live provider recorded otherwise.</p>
        ) : (
          <p className="sub">Review the proposed action before approving or rejecting.</p>
        )}
        {(dialog.proposed_label || dialog.proposed || item.proposed?.text || item.result) ? (
          <Field label={dialog.proposed_label || (history ? 'Recorded action' : 'Proposed action or message')}>
            {readOnly || dialog.editable === false ? (
              <p>{text || dialog.proposed || item.result || '-'}</p>
            ) : (
              <textarea maxLength={1000} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
            )}
          </Field>
        ) : null}
        <div className="dialog-actions">
          {!history && writer ? (
            <div className="stack">
              <ActionButton
                className="btn btn--primary action"
                action={async () => {
                  if (sample) {
                    onSampleComplete?.(item.id, 'approved');
                    toast('Approved in the demo. Nothing was sent.');
                    onClose();
                    return;
                  }
                  if (dialog.editable && item.api?.edit && text !== (dialog.proposed || item.proposed?.text || '')) {
                    await api(item.api.edit, { method: 'POST', body: { text: text.trim() } });
                  }
                  await api(item.api.approve, { method: 'POST', body: dialog.editable ? { text: text.trim() } : {} });
                  toast('Done.');
                  onClose();
                  reload?.();
                }}
              >
                {dialog.approve?.label || 'Approve'}
              </ActionButton>
              {dialog.approve?.does ? <small className="muted small">{dialog.approve.does}</small> : null}
            </div>
          ) : null}
          {!history && writer && dialog.editable !== false ? (
            <ActionButton
              className="btn btn--secondary agent-btn"
              action={async () => {
                if (sample) {
                  toast('Sample draft saved for review.');
                  onClose();
                  return;
                }
                if (item.api?.edit) {
                  await api(item.api.edit, { method: 'POST', body: { text: text.trim() } });
                  toast('Saved.');
                }
                onClose();
                reload?.();
              }}
            >
              Save edit
            </ActionButton>
          ) : null}
          {!history && writer ? (
            <div className="stack">
              <ActionButton
                className="btn btn--secondary agent-btn"
                action={async () => {
                  if (sample) {
                    onSampleComplete?.(item.id, 'rejected');
                    toast('Sample action rejected.');
                    onClose();
                    return;
                  }
                  await api(item.api.dismiss || item.api.reject, { method: 'POST', body: {} });
                  toast('Rejected.');
                  onClose();
                  reload?.();
                }}
              >
                {dialog.reject?.label || 'Reject'}
              </ActionButton>
              {dialog.reject?.does ? <small className="muted small">{dialog.reject.does}</small> : null}
            </div>
          ) : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
        {sample ? (
          <p className="sample-label">Demo state only. No message is sent and no business record is updated.</p>
        ) : history ? (
          <p className="sample-label">Completed actions cannot be approved or rejected again from this view.</p>
        ) : (
          <p className="sample-label">Approving or rejecting updates your live automation queue when the API is connected.</p>
        )}
      </div>
    </Dialog>
  );
}

export default function Automation() {
  const [state, setState] = useState({ status: 'loading' });
  const [reviewTarget, setReviewTarget] = useState(null); // { id, history }
  const [demoMode, setDemoMode] = useState(false);
  const [sampleDone, setSampleDone] = useState([]);
  const latest = useRef(0);

  const load = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    if (!quiet) setState((s) => ({ ...s, status: 'loading' }));
    try {
      const data = await api('/v1/automation');
      if (mine === latest.current) setState({ status: 'ready', data });
    } catch (error) {
      // Keep prior data on quiet poll failures so the queue does not vanish; still surface the error.
      if (mine === latest.current) {
        setState((s) => ({ status: 'error', error, data: quiet ? s.data : null }));
      }
    }
  };
  useEffect(() => { load(); return () => { latest.current += 1; }; }, []);
  useEvery(() => load(true), 30000);

  (async () => {
    try {
      const res = await api('/v1/automation');
      if (!active) return;
      setData(res);
      const reviewItems = res?.needs_review?.items || [];
      if (reviewItems.length > 0 && !initialized.current) {
        const mapped = reviewItems.map((item) => {
          const customerName = item.dialog?.customer?.name
            || (typeof item.dialog?.customer === 'string' ? item.dialog.customer : '')
            || '';
          const actionTitle = item.heading || item.title || 'Office action';
          return {
            id: String(item.id),
            isSample: false,
            title: actionTitle,
            customer: customerName,
            displayName: customerName ? `${actionTitle} · ${customerName}` : actionTitle,
            subtitle: item.line || item.text || (item.status ? `${item.source || 'Office record'} · ${item.status.label || item.status}` : 'Needs review'),
            headerLine: customerName ? `${customerName} · ${item.line || item.text || actionTitle}` : actionTitle,
            source: item.source || 'Sample office record',
            status: item.status?.label || item.status || 'Needs review',
            proposed: item.dialog?.proposed || item.proposed?.text || '',
            raw: item,
          };
        });
        setActiveActions(mapped);
        initialized.current = true;
      }
      setLoading(false);
    } catch (err) {
      if (!active) return;
      setLoading(false);
    }
  })();

  return () => { active = false; };
}, [allowed]);

if (!allowed) {
  return (
    <>
      <p className="settings-back"><a className="link" href="#/settings">← Back to Settings</a></p>
      <PageHeader eyebrow="OFFICE OPERATIONS" title="Admin automation" subtitle="Review actions prepared for your office." />
      <Note text="Not available for your role." tone="warn" />
    </>
  );
}

const live = !!state.data;
const liveReview = live ? (state.data.needs_review?.items || []) : [];
const liveHistory = live ? (state.data.history?.items || []) : [];

const samplePending = SAMPLE_REVIEW.filter((x) => !sampleDone.includes(x.id));
const sampleHistory = SAMPLE_REVIEW.filter((x) => sampleDone.includes(x.id)).map((x) => ({
  ...x,
  title: itemTitle(x),
  status: 'Completed · simulated',
  result: 'Sample only',
  decided_by: 'James M.',
  decided_at: new Date().toISOString(),
  history: true,
}));

const displayReview = demoMode ? samplePending : liveReview;
const displayHistory = demoMode ? sampleHistory : liveHistory;

const notAvailableText = live
  ? (Array.isArray(state.data.not_available)
    ? state.data.not_available.join(' ')
    : (state.data.not_available && typeof state.data.not_available === 'object'
      ? (state.data.not_available.text || Object.values(state.data.not_available).join(' '))
      : state.data.not_available))
  : null;

const activeItem = reviewTarget
  ? [...displayReview, ...displayHistory, ...SAMPLE_REVIEW].find((x) => x.id === reviewTarget.id)
  : null;

const completeSample = (id) => {
  setSampleDone((ids) => (ids.includes(id) ? ids : [...ids, id]));
};

return (
  <>
    <p className="settings-back"><a className="link" href="#/settings">← Back to Settings</a></p>
    <PageHeader
      eyebrow="OFFICE OPERATIONS"
      title="Admin automation"
      subtitle="Review actions prepared for your office."
      meta={demoMode ? <span className="date">Demo queue</span> : <span className="date">Live queue</span>}
    >
      <button
        type="button"
        className={`btn btn--secondary agent-btn${demoMode ? ' filter--on' : ''}`}
        aria-pressed={demoMode}
        onClick={() => setDemoMode((v) => !v)}
      >
        {demoMode ? 'Hide sample queue' : 'Show sample queue'}
      </button>
    </PageHeader>

    {state.status === 'loading' && !state.data ? <Spinner /> : null}
    {state.status === 'error' ? <ErrorBox error={state.error} /> : null}
    {notAvailableText && !demoMode ? <Note text={notAvailableText} tone="neutral" /> : null}
    {demoMode ? (
      <Note tone="info" text="Demo queue is illustrative only. It is separate from your live automation items and does not call the API." />
    ) : null}

    {state.status !== 'loading' || state.data || demoMode ? (
      <>
        <Panel>
          <h2 className="settings-section-title">Needs review · {displayReview.length}</h2>
          {displayReview.length ? displayReview.map((item) => (
            <Row
              key={item.id}
              leading="✦"
              title={itemTitle(item)}
              subtitle={itemSubtitle(item)}
              trailing={(
                <button
                  type="button"
                  className="btn btn--secondary agent-btn"
                  onClick={() => setReviewTarget({ id: item.id, history: false })}
                  aria-label={`Review ${itemTitle(item)}`}
                >
                  Review →
                </button>
              )}
            />
          )) : (
            <p className="sub empty-inline">
              {demoMode ? 'All sample actions have been reviewed.' : 'Nothing needs review.'}
            </p>
          )}
        </Panel>

        <Panel className="settings-panel">
          <h2 className="settings-section-title">Completed history</h2>
          {displayHistory.length ? displayHistory.map((h) => (
            <Row
              key={h.id || `${h.title}-${h.decided_at}`}
              leading="✦"
              title={h.title || itemTitle(h)}
              subtitle={[h.result || h.line, h.status, h.decided_by, h.decided_at ? timeAgo(h.decided_at) : null].filter(Boolean).join(' · ')}
              trailing={h.id ? (
                <button
                  type="button"
                  className="btn btn--secondary agent-btn"
                  onClick={() => setReviewTarget({ id: h.id, history: true })}
                >
                  View history →
                </button>
              ) : null}
            />
          )) : (
            <p className="sub empty-inline">
              {demoMode ? 'No completed sample actions.' : 'No history yet.'}
            </p>
          )}
        </Panel>

        <p className="foot">
          {demoMode
            ? 'Simulated actions only. No business system is connected.'
            : 'Live automation queue from your workspace.'}
        </p>
      </>
    ) : null}

    {activeItem ? (
      <ReviewDialog
        item={activeItem}
        history={!!reviewTarget?.history}
        onClose={() => setReviewTarget(null)}
        onSampleComplete={completeSample}
        reload={() => load(true)}
      />
    ) : null}
  </>
);
}
