// Tab bars for in-page views.
//   <Tabs options={[['open', 'Open'], ['resolved', 'Resolved']]} value={tab} onChange={setTab} />
// variant="pill" / "filter" → rounded filter chips (active filled accent).
// variant="section" → underline section tabs (.call-tabs) for Work / Calls groupings.
// SectionTabs: options may be [id, label] or [id, label, href] (anchor navigation for shell IA).
export function Tabs({ options, value, onChange, label, variant }) {
  const pill = variant === 'pill' || variant === 'filter';
  const section = variant === 'section';
  if (section) {
    return (
      <SectionTabs options={options} value={value} onChange={onChange} label={label} />
    );
  }
  return (
    <div className={`tabs ${pill ? 'tabs--pill filters' : ''}`.trim()} role="tablist" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={String(id === value)}
          className={`${pill ? 'tab tab--pill filter' : 'tab'} ${id === value ? (pill ? 'tab--on filter--on' : 'tab--on') : ''}`.trim()}
          onClick={() => onChange?.(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Underline section tabs (Work: Tasks|Appointments, Calls: history|numbers). */
export function SectionTabs({ options, value, onChange, label = 'Sections' }) {
  return (
    <nav className="call-tabs section-tabs" aria-label={label}>
      {options.map(([id, text, href]) => {
        const on = id === value;
        if (href) {
          return (
            <a key={id} href={href} className={`call-tab ${on ? 'call-tab--on' : ''}`} aria-current={on ? 'page' : undefined}>
              {text}
            </a>
          );
        }
        return (
          <button
            key={id}
            type="button"
            className={`call-tab ${on ? 'call-tab--on' : ''}`}
            aria-current={on ? 'page' : undefined}
            onClick={() => onChange?.(id)}
          >
            {text}
          </button>
        );
      })}
    </nav>
  );
}
