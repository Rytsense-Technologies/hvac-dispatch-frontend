// Admin automation: nested under Settings — Needs review + Completed history matching the reference.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
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

function ReviewDialog({ item, onClose, reload }) {
  const dialog = item.dialog || {};
  const [text, setText] = useState(dialog.proposed || item.proposed?.text || '');
  const sample = item.sample || String(item.id || '').startsWith('sample_');
  const writer = can('admin', 'dispatcher');

  return (
    <Dialog title={`Review · ${item.heading || item.title || 'Action'}`} onClose={onClose} wide>
      <div className="stack">
        <p>
          <strong>{customerLine(dialog.customer) || itemTitle(item)}</strong>
          <br />
          {item.line || item.text || ''}
          {item.source ? <><br />Source: {item.source}</> : null}
          {item.status ? <><br />Status: {item.status.label || item.status}</> : null}
        </p>
        <p className="sub">Review the proposed action. Approval records a simulated result only when the provider is not connected.</p>
        {dialog.proposed_label ? (
          <Field label={dialog.proposed_label}>
            {dialog.editable !== false ? (
              <textarea maxLength={1000} rows={5} value={text} onChange={(e) => setText(e.target.value)} />
            ) : (
              <p>{dialog.proposed}</p>
            )}
          </Field>
        ) : null}
        <div className="dialog-actions">
          {writer ? (
            <ActionButton
              className="btn btn--primary action"
              action={async () => {
                if (sample) {
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
                reload();
              }}
            >
              {dialog.approve?.label || 'Approve sample action'}
            </ActionButton>
          ) : null}
          {writer && dialog.editable !== false ? (
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
                reload();
              }}
            >
              Save edit
            </ActionButton>
          ) : null}
          {writer ? (
            <ActionButton
              className="btn btn--secondary agent-btn"
              action={async () => {
                if (sample) {
                  toast('Sample action rejected.');
                  onClose();
                  return;
                }
                await api(item.api.dismiss || item.api.reject, { method: 'POST', body: {} });
                toast('Rejected.');
                onClose();
                reload();
              }}
            >
              {dialog.reject?.label || 'Reject'}
            </ActionButton>
          ) : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
        <p className="sample-label">No message is sent and no business record is updated unless your live automation provider is connected.</p>
      </div>
    </Dialog>
  );
}

export default function Automation() {
  const [state, setState] = useState({ status: 'loading' });
  const [reviewId, setReviewId] = useState(null);
  const [sampleDone, setSampleDone] = useState([]);
  const latest = useRef(0);

  const load = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const data = await api('/v1/automation');
      if (mine === latest.current) setState({ status: 'ready', data });
    } catch (error) {
      if (mine === latest.current) setState({ status: 'error', error, data: null });
    }
  };
  useEffect(() => { load(); return () => { latest.current += 1; }; }, []);
  useEvery(() => load(true), 30000);

  if (!can('admin', 'dispatcher', 'approver')) {
    return (
      <>
        <p className="settings-back"><a className="link" href="#/settings">← Back to Settings</a></p>
        <PageHeader eyebrow="OFFICE OPERATIONS" title="Admin automation" subtitle="Review actions prepared for your office." meta={<span className="date">Sample workspace</span>} />
        <Note text="Not available for your role." tone="warn" />
      </>
    );
  }

  const live = state.status === 'ready' && state.data;
  const liveReview = live ? (state.data.needs_review?.items || []) : [];
  const liveHistory = live ? (state.data.history?.items || []) : [];
  const hasLiveItems = liveReview.length > 0 || liveHistory.length > 0;
  // After the request settles, fall back to illustrative rows when the queue is empty or the API failed.
  const usingSamples = state.status !== 'loading' && !hasLiveItems;

  const displayReview = usingSamples
    ? SAMPLE_REVIEW.filter((x) => !sampleDone.includes(x.id))
    : liveReview;
  const displayHistory = usingSamples
    ? SAMPLE_REVIEW.filter((x) => sampleDone.includes(x.id)).map((x) => ({
      ...x,
      title: itemTitle(x),
      status: 'Completed · simulated',
      result: 'Sample only',
      decided_by: 'James M.',
      decided_at: new Date().toISOString(),
    }))
    : liveHistory;

  const notAvailableText = live
    ? (Array.isArray(state.data.not_available)
      ? state.data.not_available.join(' ')
      : (state.data.not_available && typeof state.data.not_available === 'object'
        ? (state.data.not_available.text || Object.values(state.data.not_available).join(' '))
        : state.data.not_available))
    : null;

  const activeItem = reviewId
    ? [...displayReview, ...displayHistory, ...SAMPLE_REVIEW].find((x) => x.id === reviewId)
    : null;

  return (
    <>
      <p className="settings-back"><a className="link" href="#/settings">← Back to Settings</a></p>
      <PageHeader
        eyebrow="OFFICE OPERATIONS"
        title="Admin automation"
        subtitle="Review actions prepared for your office."
        meta={<span className="date">Sample workspace</span>}
      />

      {state.status === 'loading' ? <Spinner /> : null}
      {state.status === 'error' && !usingSamples ? <ErrorBox error={state.error} /> : null}
      {notAvailableText ? <Note text={notAvailableText} tone="neutral" /> : null}

      {state.status !== 'loading' ? (
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
                    onClick={() => setReviewId(item.id)}
                    aria-label={`Review ${itemTitle(item)}`}
                  >
                    Review →
                  </button>
                )}
              />
            )) : <p className="sub empty-inline">All sample actions have been reviewed.</p>}
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
                  <button type="button" className="btn btn--secondary agent-btn" onClick={() => setReviewId(h.id)}>
                    View history →
                  </button>
                ) : null}
              />
            )) : <p className="sub empty-inline">No completed sample actions.</p>}
          </Panel>

          <p className="foot">Simulated actions only. No business system is connected.</p>
        </>
      ) : null}

      {activeItem ? (
        <ReviewDialog
          item={activeItem}
          onClose={() => setReviewId(null)}
          reload={() => {
            if (activeItem.sample) {
              setSampleDone((ids) => (ids.includes(activeItem.id) ? ids : [...ids, activeItem.id]));
            }
            load(true);
          }}
        />
      ) : null}
    </>
  );
}
