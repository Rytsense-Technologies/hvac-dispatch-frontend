// Small shared components, one-to-one with the helpers of the original console (badge, note, table, field, overlay, toast...).
// Text from the server is always rendered as text by React, never as HTML.
import { Children, cloneElement, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { PROGRESS, STATUS } from '../lib/format.js';

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

// <PageHeader eyebrow title subtitle meta>{actions}</PageHeader>
export function PageHeader({ eyebrow, title, subtitle, meta, children }) {
  return (
    <header className="page-header">
      <div className="page-header__copy">
        {eyebrow ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="muted page-header__subtitle">{subtitle}</p> : null}
      </div>
      {(meta || children) ? (
        <div className="page-actions">
          {meta}
          {children}
        </div>
      ) : null}
    </header>
  );
}

/** White bordered surface used for operational panels (no drop shadow). */
export function Panel({ as: Tag = 'section', className = '', children, ...rest }) {
  return <Tag className={`panel ${className}`.trim()} {...rest}>{children}</Tag>;
}

export function PanelHead({ title, subtitle, children }) {
  return (
    <div className="panelhead">
      <div>
        {title ? <h2>{title}</h2> : null}
        {subtitle ? <p className="sub">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** List row: leading circle / main / trailing. */
export function Row({ leading, title, subtitle, trailing, className = '', onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} className={`row-item ${className}`.trim()} onClick={onClick}>
      {leading ? <span className="circle">{leading}</span> : null}
      <span className="rowmain">
        <strong>{title}</strong>
        {subtitle ? <small className="muted">{subtitle}</small> : null}
      </span>
      {trailing}
    </Tag>
  );
}

/** Outline → filled accent filter chips. */
export function FilterChips({ options, value, onChange, label }) {
  return (
    <div className="filters" role="tablist" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={String(id === value)}
          className={`filter ${id === value ? 'filter--on' : ''}`.trim()}
          onClick={() => onChange?.(id)}
        >
          {text}
        </button>
      ))}
    </div>
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

// ---------- overlay / dialog ----------

function useModalClose(onClose) {
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.(); };
    document.addEventListener('keydown', onKey);
    panel.current?.querySelector('button, [href], input, select, textarea')?.focus?.();
    return () => {
      document.removeEventListener('keydown', onKey);
      if (previous && previous.focus) previous.focus();
    };
  }, []);
  return panel;
}

// Side drawer (kept for dense detail views). Render only while open.
export function Overlay({ title, wide = false, onClose, children }) {
  const panel = useModalClose(onClose);
  return createPortal(
    <div className="backdrop backdrop--drawer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section ref={panel} className={`overlay ${wide ? 'overlay--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="btn btn--ghost dialog-close" type="button" aria-label="Close" onClick={() => onClose?.()}>×</button></header>
        <div className="overlay-body">{children}</div>
      </section>
    </div>, document.body);
}

// Centered modal matching the reference dialog (prefer for agent/call/settings flows).
//   {open && <Dialog title="..." onClose={() => setOpen(false)}>...</Dialog>}
export function Dialog({ title, onClose, children, wide = false }) {
  const panel = useModalClose(onClose);
  return createPortal(
    <div className="backdrop backdrop--dialog" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section ref={panel} className={`dialog ${wide ? 'dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="dialog__head">
          <h2>{title}</h2>
          <button className="dialog-close" type="button" aria-label="Close" onClick={() => onClose?.()}>×</button>
        </header>
        <div className="dialog__body">{children}</div>
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
export const LinkButton = ({ className = 'btn btn--link', children, ...rest }) => <button type="button" className={className} {...rest}>{children}</button>;
