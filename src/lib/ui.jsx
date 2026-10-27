// Small shared components, one-to-one with the helpers of the original console (badge, note, table, field, overlay, toast...).
// Text from the server is always rendered as text by React, never as HTML.
import { Children, cloneElement, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { PROGRESS, STATUS } from './format.js';

export const Badge = ({ text, tone = 'neutral', children }) => <span className={`badge badge--${tone}`}>{text ?? children}</span>;
export const Spinner = ({ text = 'Loading…' }) => <p className="loading" role="status">{text}</p>;
export const Note = ({ text, tone = 'neutral', children }) => <p className={`note note--${tone}`} role={tone === 'bad' ? 'alert' : 'note'}>{text ?? children}</p>;
export const Empty = ({ text, children }) => <p className="empty">{text ?? children}</p>;
export const ErrorBox = ({ error }) => <p className="note note--bad" role="alert">{error instanceof Error ? error.message : String(error)}</p>;

export const ProgressBadge = ({ progress }) => { const [text, tone] = PROGRESS[progress] || [progress, 'neutral']; return <Badge text={text} tone={tone} />; };
export const StatusBadge = ({ status }) => { const [text, tone] = STATUS[status] || [status, 'neutral']; return <Badge text={text} tone={tone} />; };

// Was the technician's phone near the job when they tapped "arrived"? (renders nothing if the check was off or it was not an arrival)
export function ArrivalBadge({ check, metres }) {
  if (check === 'far') return <Badge text={`Far from the address (${metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${metres} m`})`} tone="bad" />;
  if (check === 'unknown') return <Badge text="Position not confirmed" tone="warn" />;
  return null;
}

// <PageHeader title subtitle>{actions}</PageHeader>
export function PageHeader({ title, subtitle, children }) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
      <div className="page-actions">{children}</div>
    </header>
  );
}

// head: ['Name', ...]; rows: [[cell, cell], ...] where a cell is any node. onRow(cells, index) makes rows clickable.
export function DataTable({ head, rows, onRow, label }) {
  return (
    <div className="table-wrap">
      <table aria-label={label}>
        <thead><tr>{head.map((text, i) => <th key={i}>{text}</th>)}</tr></thead>
        <tbody>
          {rows.map((cells, index) => (
            <tr key={index} {...(onRow ? { tabIndex: 0, className: 'clickable', onClick: () => onRow(cells, index), onKeyDown: (e) => { if (e.key === 'Enter') onRow(cells, index); } } : {})}>
              {cells.map((cell, i) => <td key={i}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// label + control, wired together so a screen reader and a click on the label both work. The single child gets the id.
export function Field({ label, hint, children }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {cloneElement(Children.only(children), { id })}
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

// options: [[value, text], ...]
export const Select = ({ options, ...props }) => <select {...props}>{options.map(([val, text]) => <option key={val} value={val}>{text}</option>)}</select>;

// A definition list of label/value rows; empty values show a dash.
export function Details({ rows }) {
  return <dl className="details">{rows.map(([label, value], i) => [<dt key={`t${i}`}>{label}</dt>, <dd key={`d${i}`}>{value || '-'}</dd>])}</dl>;
}

// ---------- toasts ----------

let toastList = [];
let toastId = 0;
const toastListeners = new Set();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(text, tone = 'good') {
  toastId += 1;
  const item = { id: toastId, text, tone };
  toastList = [...toastList, item];
  emitToasts();
  setTimeout(() => { toastList = toastList.filter((t) => t !== item); emitToasts(); }, tone === 'bad' ? 8010 : 4000);
}

// Mount once near the root.
export function Toasts() {
  const items = useSyncExternalStore((cb) => { toastListeners.add(cb); return () => toastListeners.delete(cb); }, () => toastList);
  if (!items.length) return null;
  return createPortal(
    <div className="toasts" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'bad' ? 'alert' : 'status'}>{t.text}</div>)}
    </div>, document.body);
}

// ---------- overlay ----------

// A panel that slides in from the side (or a dialog) over the page; Escape or the backdrop closes it. Render it only while open:
//   {open && <Overlay title="..." onClose={() => setOpen(false)}>...</Overlay>}
export function Overlay({ title, wide = false, onClose, children }) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, []);
  return createPortal(
    <div className="backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section ref={panel} className={`overlay ${wide ? 'overlay--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="btn btn--ghost" type="button" aria-label="Close" onClick={() => onClose?.()}>×</button></header>
        <div className="overlay-body">{children}</div>
      </section>
    </div>, document.body);
}

// ---------- running an action from a button ----------

// Disable the button while the action works, show a toast on failure (same as the original `run`).
//   const [busy, run] = useRun();   <button disabled={busy} onClick={() => run(async () => {...})}>
export function useRun() {
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const run = async (action, failure) => {
    setBusy(true);
    try {
      return await action();
    } catch (error) {
      (failure || ((e) => toast(e.message, 'bad')))(error);
      return undefined;
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  return [busy, run];
}

// <ActionButton className="btn btn--primary" action={async () => {...}} failure={optional}>Label</ActionButton>
export function ActionButton({ action, failure, className = 'btn', disabled, children, ...rest }) {
  const [busy, run] = useRun();
  return <button type="button" className={className} disabled={busy || disabled} onClick={() => run(action, failure)} {...rest}>{children}</button>;
}

export const Button = ({ className = 'btn', children, ...rest }) => <button type="button" className={className} {...rest}>{children}</button>;
