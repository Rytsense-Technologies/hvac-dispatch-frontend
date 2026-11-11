// Shared Work page chrome: eyebrow + H1 "Work" + subtitle + Sample workspace,
// then Tasks | Appointments section tabs (shell owns the tab defs; pages place them
// after the heading to match the reference order).
import { PageHeader, SectionTabs } from '../components/index.js';
import { SECTION_TABS } from '../app/routes.js';

export function WorkChrome({ tab, eyebrow, subtitle, demoMode = false, onToggleDemo, children }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title="Work" subtitle={subtitle}>
        <button
          type="button"
          className={`btn btn--secondary work-sample-btn${demoMode ? ' work-sample-btn--on' : ''}`}
          onClick={onToggleDemo}
          aria-pressed={demoMode ? 'true' : 'false'}
          title={demoMode ? 'Exit sample workspace' : 'Show sample workspace data'}
        >
          Sample workspace
        </button>
      </PageHeader>
      <SectionTabs
        options={SECTION_TABS.work.map((t) => [t.id, t.label, t.href])}
        value={tab}
        label="Work sections"
      />
      {children}
    </>
  );
}

export function WorkFoot({ children }) {
  return <p className="work-foot">{children}</p>;
}
