// Campaigns: Outbound campaigns — reference design chrome with live API flows.
// Samples appear only when Sample workspace (demo) is explicitly on.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Dialog, ErrorBox, Field, Note,
  PageHeader, Panel, PanelHead, Row, Spinner, toast, useRun,
} from '../components/index.js';

const STATUS_TONE = { active: 'good', paused: 'warn', finished: 'neutral', draft: 'warn' };
const STATUS_LABEL = { active: 'Active', paused: 'Paused', finished: 'Finished', draft: 'Draft' };

/** `#/campaigns?demo=1` (or demo=true) opens Sample workspace explicitly. */
function demoFromHash(hash = typeof location !== 'undefined' ? location.hash : '') {
  const q = String(hash).split('?')[1] || '';
  const params = new URLSearchParams(q);
  const v = params.get('demo');
  return v === '1' || v === 'true';
}

const SAMPLE_CAMPAIGNS = [
  {
    id: 'sample_old_ac',
    name: 'Old AC replacement leads',
    status: 'active',
    objective: 'Identify interested homeowners and arrange a callback.',
    audience: { count: 120, label: 'past inquiries', text: '120 past inquiries' },
    progress: { contacted: 42, total: 120, text: '42 / 120 contacted' },
    script: 'Hi, we are following up on your earlier AC replacement inquiry. Would you like to discuss your options?',
    interested: [{
      name: 'Taylor Green',
      interest: 'Interested in a replacement',
      status: 'Interested',
      owner: 'Office team',
      callback_at: null,
      follow_up_arranged: false,
      summary: 'Interested in a replacement · Office callback requested',
    }],
  },
  {
    id: 'sample_spring_maint',
    name: 'Spring maintenance follow-up',
    status: 'active',
    objective: 'Reconnect with past customers about maintenance.',
    audience: { count: 80, label: 'past customers', text: '80 past customers' },
    progress: { contacted: 44, total: 80, text: '44 / 80 contacted' },
    script: 'Would you like to schedule your next maintenance visit?',
    interested: [{
      name: 'Jordan Lee',
      interest: 'Interested in maintenance',
      status: 'Interested',
      owner: 'Office team',
      callback_at: null,
      follow_up_arranged: false,
      summary: 'Interested in maintenance · Schedule a callback',
    }],
  },
  {
    id: 'sample_plumbing',
    name: 'Unscheduled plumbing estimates',
    status: 'draft',
    objective: 'Follow up on unscheduled plumbing estimates.',
    audience: { count: 35, label: 'old estimates', text: '35 old estimates' },
    progress: { text: 'Ready for review' },
    script: 'Would you like to discuss your plumbing estimate?',
    interested: [],
  },
];

function isSampleId(id) {
  return String(id || '').startsWith('sample_');
}

function formatCampaignSub(c) {
  const audienceStr = c.audience?.text
    || (c.audience?.count ? `${c.audience.count} ${c.audience?.label || 'past customers'}` : (c.audience?.label || ''));
  const progressStr = c.status === 'draft'
    ? (c.reviewed_at ? 'Ready to start' : 'Ready for review')
    : (c.progress?.text || (c.progress?.total ? `${c.progress?.contacted || 0} / ${c.progress.total} contacted` : ''));

  if (audienceStr && progressStr) return `${audienceStr} · ${progressStr}`;
  return audienceStr || progressStr || c.objective || 'Ready for review';
}

function readiness(c) {
  if (c.status !== 'draft') return null;
  return c.reviewed_at ? 'Reviewed: ready to start' : 'Ready for review';
}

function CreateDialog({ reload, onClose }) {
  const [f, setF] = useState({ name: '', objective: '', audience: '' });
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    if (!f.name.trim()) { toast('Enter a campaign name.', 'bad'); return; }
    run(async () => {
      await api('/v1/leads/campaigns', {
        method: 'POST',
        body: {
          draft: true,
          name: f.name.trim(),
          objective: f.objective.trim() || null,
          audience: f.audience.trim() || null,
        },
      });
      toast('Draft created. Review it, then start it when ready.');
      onClose();
      reload();
    });
  };
  return (
    <Dialog title="New campaign" onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <Note text="A draft calls nobody. Review it and start it when you're ready." tone="info" />
        <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
        <Field label="Objective" hint="What this campaign is for"><input type="text" maxLength={255} {...bind('objective')} /></Field>
        <Field label="Audience" hint='Who it reaches, e.g. "past customers"'><input type="text" maxLength={255} {...bind('audience')} /></Field>
        <div className="dialog-actions">
          <button type="submit" className="btn btn--primary action" disabled={busy}>Create draft</button>
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EditForm({ campaign, reload }) {
  const [f, setF] = useState({
    name: campaign.name || '',
    objective: campaign.objective || '',
    audience: campaign.audience?.label || '',
    script_note: campaign.script || '',
  });
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      await api(`/v1/leads/campaigns/${campaign.id}`, {
        method: 'PATCH',
        body: {
          name: f.name.trim(),
          objective: f.objective.trim() || null,
          audience: f.audience.trim() || null,
          script_note: f.script_note.trim() || null,
        },
      });
      toast('Saved.');
      reload();
    });
  };
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <h3>Edit</h3>
      {campaign.status === 'draft' && campaign.reviewed_at
        ? <Note text="Changing this draft will need review again before it can start." tone="warn" />
        : null}
      <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
      <Field label="Objective"><input type="text" maxLength={255} {...bind('objective')} /></Field>
      <Field label="Audience"><input type="text" maxLength={255} {...bind('audience')} /></Field>
      <Field label="Script note" hint="What the voice assistant should emphasize">
        <textarea rows={3} {...bind('script_note')} />
      </Field>
      <div className="dialog-actions">
        <button type="submit" className="btn btn--primary action" disabled={busy}>Save changes</button>
      </div>
    </form>
  );
}

const OWNER_TONE = { 'AI assistant (call-back)': 'info', 'Office team': 'neutral' };

function InterestedList({ interested, sample }) {
  if (!interested?.length) {
    return (
      <p className="sub empty-inline">
        {sample
          ? 'No responses yet in this sample campaign.'
          : 'No responses yet. Interested leads will appear here after outreach.'}
      </p>
    );
  }
  // Sample campaigns use a short prose line matching the reference dialog.
  if (sample && interested.every((p) => p.summary)) {
    return (
      <div className="stack">
        {interested.map((p, i) => (
          <div key={p.lead_id || p.name || i}>
            <p>
              <strong>{p.name}</strong>
              <br />
              {p.summary}
            </p>
            <p className="sub">Example owner: {p.owner || 'Office team'} · Next action: arrange a callback.</p>
          </div>
        ))}
      </div>
    );
  }
  return (
    <DataTable
      head={['Name', 'Interest', 'Status', 'Owner', 'Callback', 'Follow-up']}
      rows={interested.map((p) => [
        p.name || `Lead #${p.lead_id}`,
        p.interest || '-',
        p.status || '-',
        <Badge text={p.owner} tone={OWNER_TONE[p.owner] || 'neutral'} />,
        p.callback_at ? formatDateTime(p.callback_at) : '-',
        p.follow_up_arranged ? <Badge text="Arranged" tone="good" /> : <Badge text="Not yet" tone="neutral" />,
      ])}
      label="Interested leads"
    />
  );
}

function CampaignDialog({ id, reload, onClose, onSamplePatch, sampleSeed }) {
  const [state, setState] = useState({});
  const writer = can('admin', 'dispatcher');
  const sample = isSampleId(id);

  const load = useCallback(async () => {
    if (sample) {
      const found = sampleSeed || SAMPLE_CAMPAIGNS.find((s) => s.id === id);
      if (found) {
        setState({ data: { ...found } });
        return;
      }
      setState({ error: { message: 'Sample campaign not found.' } });
      return;
    }
    try {
      const data = await api(`/v1/leads/campaigns/${id}`);
      setState({ data });
    } catch (error) {
      setState({ error });
    }
  }, [id, sample, sampleSeed]);

  useEffect(() => { load(); }, [load]);

  const c = state.data;
  const bump = () => { load(); reload(); };

  const review = async () => {
    if (sample) {
      const next = { ...c, reviewed_at: new Date().toISOString() };
      setState({ data: next });
      onSamplePatch?.(id, { reviewed_at: next.reviewed_at });
      toast('Sample campaign marked reviewed.');
      return;
    }
    await api(`/v1/leads/campaigns/${id}/review`, { method: 'POST' });
    toast('Marked reviewed.');
    bump();
  };

  // Start / pause / resume / finish — Start is the live "send" (outreach begins).
  const setStatus = (status) => async () => {
    if (sample) {
      setState((prev) => ({ ...prev, data: { ...prev.data, status } }));
      onSamplePatch?.(id, { status });
      toast(`Sample campaign status changed to ${status}.`);
      return;
    }
    await api(`/v1/leads/campaigns/${id}/status`, { method: 'POST', body: { status } });
    toast(status === 'active' ? 'Campaign started — outreach can run.' : `Campaign ${status}.`);
    bump();
  };

  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!c) content = <Spinner />;
  else {
    const ready = readiness(c);
    const progressText = c.progress?.text || formatCampaignSub(c);
    const audienceText = c.audience?.text || c.audience?.label || '-';
    let primaryAction = null;
    if (writer) {
      if (c.status === 'draft' && !c.reviewed_at) {
        primaryAction = <ActionButton className="btn btn--primary action" action={review}>Mark draft reviewed</ActionButton>;
      } else if (c.status === 'draft' && c.reviewed_at) {
        primaryAction = <ActionButton className="btn btn--primary action" action={setStatus('active')}>Start</ActionButton>;
      } else if (c.status === 'active') {
        primaryAction = <ActionButton className="btn btn--primary action" action={setStatus('paused')}>Pause campaign</ActionButton>;
      } else if (c.status === 'paused') {
        primaryAction = <ActionButton className="btn btn--primary action" action={setStatus('active')}>Resume campaign</ActionButton>;
      }
    }

    content = (
      <div className="stack">
        <p>
          <strong>Status:</strong> {STATUS_LABEL[c.status] || c.status}
          {progressText ? <> · {progressText}</> : null}
          <br />
          <strong>Audience:</strong> {audienceText}
          <br />
          <strong>Objective:</strong> {c.objective || '-'}
        </p>
        {ready ? <Badge text={ready} tone={c.reviewed_at ? 'good' : 'warn'} /> : null}

        {c.script ? (
          <div className="agent-banner">
            <strong>{sample ? 'Sample outreach script' : 'Outreach script'}</strong>
            <br />
            {c.script}
          </div>
        ) : null}

        <h3>Interested lead follow-up</h3>
        <InterestedList interested={c.interested} sample={sample} />

        <div className="dialog-actions">
          {primaryAction}
          {(writer && (c.status === 'active' || c.status === 'paused')) ? (
            <ActionButton className="btn btn--ghost" action={setStatus('finished')}>Finish</ActionButton>
          ) : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>

        {writer && c.status !== 'finished' && !sample ? (
          <EditForm campaign={c} reload={bump} />
        ) : null}

        {!sample ? (
          <Details rows={[
            ['Reviewed', c.reviewed_at ? `${formatDateTime(c.reviewed_at)}${c.reviewed_by ? ` by ${c.reviewed_by}` : ''}` : 'Not yet'],
          ]} />
        ) : null}

        <p className="sample-label">
          {sample
            ? 'Demo state only; no actual outreach is scheduled or sent.'
            : 'Status and review actions update this campaign in your workspace.'}
        </p>
      </div>
    );
  }

  return (
    <Dialog title={c?.name || 'Campaign'} onClose={onClose}>
      {content}
    </Dialog>
  );
}

export default function Campaigns() {
  const [dialog, setDialog] = useState(null);
  const [demoMode, setDemoMode] = useState(() => demoFromHash());
  const [sampleOverrides, setSampleOverrides] = useState({});
  const [list, setList] = useState({ status: 'loading', data: null, error: null });
  const listLatest = useRef(0);
  const writer = can('admin', 'dispatcher');

  const load = useCallback(async () => {
    listLatest.current += 1;
    const mine = listLatest.current;
    setList((prev) => ({ ...prev, status: prev.data ? 'refreshing' : 'loading', error: null }));
    try {
      const res = await api('/v1/leads/campaigns');
      if (mine !== listLatest.current) return;
      setList({ status: 'ready', data: res.campaigns || [], error: null });
    } catch (error) {
      if (mine !== listLatest.current) return;
      setList((prev) => ({ status: 'error', data: prev.data, error }));
    }
  }, []);

  useEffect(() => {
    if (demoMode) {
      listLatest.current += 1; // invalidate in-flight live loads while in sample workspace
      return undefined;
    }
    load();
    return () => { listLatest.current += 1; };
  }, [load, demoMode]);

  // Honor `#/campaigns?demo=1` (and clear demo when the query is removed).
  useEffect(() => {
    const sync = () => setDemoMode(demoFromHash());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const setWorkspaceDemo = (on) => {
    setDemoMode(on);
    setDialog(null);
    const path = (location.hash.split('?')[0] || '#/campaigns');
    const next = on ? `${path}?demo=1` : path;
    if (location.hash !== next) location.hash = next;
  };

  const close = () => setDialog(null);

  const patchSample = (id, patch) => {
    setSampleOverrides((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  };

  if (!can('admin', 'dispatcher', 'approver')) {
    return (
      <>
        <PageHeader
          eyebrow="GROWTH"
          title="Outbound campaigns"
          subtitle="Reconnect with past customers and turn interested responses into follow-ups."
        />
        <Note text="Not available for your role." tone="warn" />
      </>
    );
  }

  const liveCampaigns = list.data || [];
  const sampleCampaigns = SAMPLE_CAMPAIGNS.map((c) => ({ ...c, ...(sampleOverrides[c.id] || {}) }));
  const campaigns = demoMode ? sampleCampaigns : liveCampaigns;
  const loading = !demoMode && list.status === 'loading' && !list.data;
  const showError = !demoMode && list.status === 'error' && !!list.error;

  const headerMeta = (
    <>
      <span className="date">{demoMode ? 'Sample workspace' : 'Live workspace'}</span>
      <button
        type="button"
        className={`btn btn--secondary agent-btn${demoMode ? ' filter--on' : ''}`}
        aria-pressed={demoMode}
        onClick={() => setWorkspaceDemo(!demoMode)}
      >
        {demoMode ? 'Exit sample workspace' : 'Sample workspace'}
      </button>
      {writer && !demoMode ? (
        <button
          type="button"
          className="btn btn--secondary agent-btn"
          onClick={() => setDialog({ kind: 'create' })}
        >
          + New campaign
        </button>
      ) : null}
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow="GROWTH"
        title="Outbound campaigns"
        subtitle="Reconnect with past customers and turn interested responses into follow-ups."
        meta={headerMeta}
      />

      {demoMode ? (
        <Note tone="info" text="Sample workspace is illustrative only. It does not call the API or schedule outreach." />
      ) : null}

      <Panel>
        <PanelHead
          title="Campaigns"
          subtitle={demoMode
            ? 'Sample list matching the reference layout'
            : 'Select a campaign to review its audience, script and leads'}
        />

        {showError ? <ErrorBox error={list.error} /> : null}
        {showError && liveCampaigns.length ? (
          <Note tone="warn" text="Showing the last loaded list. Refresh failed — try again." />
        ) : null}
        {loading ? <Spinner /> : null}

        {!loading && !campaigns.length ? (
          <p className="sub empty-inline">
            {demoMode
              ? 'No sample campaigns.'
              : (showError ? 'Could not load campaigns.' : 'No campaigns yet. Create a draft to get started.')}
          </p>
        ) : null}

        {!loading && campaigns.length ? (
          <div className="campaign-list">
            {campaigns.map((c) => {
              const subText = formatCampaignSub(c);
              const tone = STATUS_TONE[c.status] || 'neutral';
              return (
                <Row
                  key={c.id}
                  leading="↗"
                  title={c.name}
                  subtitle={subText}
                  trailing={(
                    <>
                      <Badge text={STATUS_LABEL[c.status] || c.status} tone={tone} />
                      <button
                        type="button"
                        className="btn btn--secondary agent-btn"
                        onClick={() => setDialog({ kind: 'view', id: c.id })}
                      >
                        View campaign →
                      </button>
                    </>
                  )}
                />
              );
            })}
          </div>
        ) : null}
      </Panel>

      {demoMode ? (
        <p className="foot">Illustrative campaigns. No calls or messages are made.</p>
      ) : (
        <p className="foot">Live campaigns · Create, edit, review, and start outreach from each campaign.</p>
      )}

      {dialog?.kind === 'create' && !demoMode ? (
        <CreateDialog onClose={close} reload={load} />
      ) : null}
      {dialog?.kind === 'view' ? (
        <CampaignDialog
          id={dialog.id}
          onClose={close}
          reload={demoMode ? () => {} : load}
          onSamplePatch={demoMode ? patchSample : undefined}
          sampleSeed={demoMode ? sampleCampaigns.find((c) => c.id === dialog.id) : undefined}
        />
      ) : null}
    </>
  );
}
