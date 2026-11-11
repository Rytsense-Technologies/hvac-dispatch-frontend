// Admin automation: the same follow-up queue as Tasks, worded for admins reviewing what the system
// proposes to send or change. A decision made here is the same decision as in Tasks.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import { can } from '../lib/session.js';
import { useEvery } from '../lib/hooks.js';
import { PageHeader, Spinner, ErrorBox, Empty, Note, Badge, DataTable, Field, ActionButton, toast, Card } from '../components/index.js';

// dialog.customer isn't pinned to a shape in the spec - the server sends {id, name[, phone]} like everywhere
// else in this API, not the plain string the dialog's other fields are, so render it defensively either way.
function customerLine(c) {
  if (!c) return '';
  if (typeof c === 'object') return [c.name, c.phone].filter(Boolean).join(' · ');
  return String(c);
}

function ReviewItem({ item, reload }) {
  const dialog = item.dialog || {};
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(dialog.proposed || item.proposed?.text || '');

  return (
    <Card as="article" className="stack">
      <div className="between">
        <span><strong>{item.heading || item.title}</strong><small className="block muted">{item.line || item.text}</small></span>
        <span className="row">
          {item.status ? <Badge text={item.status.label || item.status} tone="warn" /> : null}
          <button type="button" className="btn btn--ghost" onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Review'}</button>
        </span>
      </div>
      {item.source ? <small className="muted">{item.source}</small> : null}
      {open ? (
        <div className="stack">
          {dialog.customer ? <p className="muted small">{customerLine(dialog.customer)}</p> : null}
          {dialog.proposed_label ? (
            <Field label={dialog.proposed_label}>
              {dialog.editable ? (
                <textarea maxLength={1000} rows={3} value={text} onChange={(e) => setText(e.target.value)} />
              ) : (
                <p>{dialog.proposed}</p>
              )}
            </Field>
          ) : null}
          {can('admin', 'dispatcher') ? (
            <div className="stack">
              <div className="row">
                <div className="stack">
                  <ActionButton
                    className="btn btn--primary"
                    action={async () => {
                      if (dialog.editable && item.api?.edit && text !== (dialog.proposed || item.proposed?.text || '')) {
                        await api(item.api.edit, { method: 'POST', body: { text: text.trim() } });
                      }
                      await api(item.api.approve, { method: 'POST', body: dialog.editable ? { text: text.trim() } : {} });
                      toast('Done.');
                      reload();
                    }}
                  >{dialog.approve?.label || 'Approve'}</ActionButton>
                  {dialog.approve?.does ? <small className="muted small">{dialog.approve.does}</small> : null}
                </div>
                <div className="stack">
                  <ActionButton
                    className="btn btn--outline"
                    action={async () => {
                      await api(item.api.dismiss || item.api.reject, { method: 'POST', body: {} });
                      toast('Rejected.');
                      reload();
                    }}
                  >{dialog.reject?.label || 'Reject'}</ActionButton>
                  {dialog.reject?.does ? <small className="muted small">{dialog.reject.does}</small> : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

export default function Automation() {
  const [state, setState] = useState({ status: 'loading' });
  const latest = useRef(0);

  const load = async (quiet) => {
    latest.current += 1;
    const mine = latest.current;
    if (!quiet) setState({ status: 'loading' });
    try {
      const data = await api('/v1/automation');
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
        <PageHeader title="Admin automation" />
        <Note text="Not available for your role." tone="warn" />
      </>
    );
  }

  if (state.status === 'loading') return (<><PageHeader title="Admin automation" /><Spinner /></>);
  if (state.status === 'error') return (<><PageHeader title="Admin automation" /><ErrorBox error={state.error} /></>);

  const { needs_review, history, not_available } = state.data;
  const reviewItems = needs_review?.items || [];
  const historyItems = history?.items || [];
  const notAvailableText = Array.isArray(not_available) ? not_available.join(' ') : (not_available && typeof not_available === 'object' ? (not_available.text || Object.values(not_available).join(' ')) : not_available);

  return (
    <>
      <PageHeader title="Admin automation" subtitle={needs_review?.text || "What the system wants to send or change, worded for review."}>
        {needs_review?.total ? <Badge text={`${needs_review.total} waiting`} tone="warn" /> : null}
      </PageHeader>
      {notAvailableText ? <Note text={notAvailableText} tone="neutral" /> : null}
      <div className="stack">
        {reviewItems.length ? reviewItems.map((item) => <ReviewItem key={item.id} item={item} reload={() => load(true)} />) : <Empty text="Nothing needs review." />}
      </div>
      <Card className="stack">
        <Card.Title>History</Card.Title>
        {historyItems.length ? (
          <DataTable head={['Task', 'Status', 'Result', 'Decided by', 'When']} rows={historyItems.map((h) => [
            h.title, h.status, h.result || h.line || '-', h.decided_by || '-', h.decided_at ? timeAgo(h.decided_at) : '-',
          ])} />
        ) : <Empty text="No history yet." />}
      </Card>
    </>
  );
}
