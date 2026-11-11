// The tab bar used to switch between a few named views of the same page (requests, billing). Built on
// the existing `.tabs`/`.tab`/`.tab--on` CSS, so it draws exactly like the hand-written version it replaces.
//   <Tabs options={[['open', 'Open'], ['resolved', 'Resolved']]} value={tab} onChange={setTab} />
// variant="pill" swaps the underline look for rounded, bordered pills (the selected one filled solid).
export function Tabs({ options, value, onChange, label, variant }) {
  const pill = variant === 'pill';
  return (
    <div className={`tabs ${pill ? 'tabs--pill' : ''}`.trim()} role="tablist" aria-label={label}>
      {options.map(([id, text]) => (
        <button key={id} type="button" role="tab" aria-selected={String(id === value)} className={`tab ${pill ? 'tab--pill' : ''} ${id === value ? 'tab--on' : ''}`.trim()} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}
