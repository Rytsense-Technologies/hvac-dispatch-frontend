// The tab bar used to switch between a few named views of the same page (requests, billing). Built on
// the existing `.tabs`/`.tab`/`.tab--on` CSS, so it draws exactly like the hand-written version it replaces.
//   <Tabs options={[['open', 'Open'], ['resolved', 'Resolved']]} value={tab} onChange={setTab} />
export function Tabs({ options, value, onChange, label }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" role="tab" aria-selected={String(id === value)} className={`tab ${id === value ? 'tab--on' : ''}`} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}
