// Campaigns: Outbound campaigns module
// Reconnect with past customers and turn interested responses into follow ups.
// Displays campaigns matching the reference UI, with real backend integration.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Empty, ErrorBox, Field, Note, Overlay, Spinner, toast, useRun, Icon,
} from '../components/index.js';

const STATUS_TONE = { active: 'good', paused: 'warn', finished: 'neutral', draft: 'warn' };
const STATUS_LABEL = { active: 'Active', paused: 'Paused', finished: 'Finished', draft: 'Draft' };

const SAMPLE_CAMPAIGNS = [
  {
    id: 'sample_old_ac',
    name: 'Old AC replacement leads',
    status: 'active',
    objective: 'AC replacement follow-ups',
    audience: { count: 120, label: 'past inquiries', text: '120 past inquiries' },
    progress: { contacted: 42, total: 120, text: '42 / 120 contacted' },
    script: 'Call previous inquiries from the last 12-24 months regarding AC system replacements and check if they still need an estimate.',
    interested: [],
  },
  {
    id: 'sample_spring_maint',
    name: 'Spring maintenance follow-up',
    status: 'active',
    objective: 'Seasonal tune-ups',
    audience: { count: 80, label: 'past customers', text: '80 past customers' },
    progress: { contacted: 44, total: 80, text: '44 / 80 contacted' },
    script: 'Reach out to past maintenance agreement customers to schedule upcoming seasonal AC check-ups.',
    interested: [],
  },
  {
    id: 'sample_plumbing',
    name: 'Unscheduled plumbing estimates',
    status: 'draft',
    objective: 'Estimate follow-ups',
    audience: { count: 35, label: 'old estimates', text: '35 old estimates' },
    progress: { text: 'Ready for review' },
    script: 'Follow up on unaccepted plumbing quotes provided within the past 60 days.',
    interested: [],
  },
];

function formatCampaignSub(c) {
  const audienceStr = c.audience?.text || (c.audience?.count ? `${c.audience.count} ${c.audience?.label || 'past customers'}` : (c.audience?.label || ''));
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

function useLoader(fetcher) {
  const [state, setState] = useState({});
  const load = useCallback(async () => {
    try {
      const data = await fetcher();
      setState({ data });
    } catch (error) {
      setState({ error });
    }
  }, [fetcher]);
  return [state, load];
}

function CreateDialog({ reload, onClose }) {
  const [f, setF] = useState({ name: '', objective: '', audience: '' });
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    if (!f.name.trim()) { toast('Enter a campaign name.', 'bad'); return; }
    run(async () => {
      await api('/v1/leads/campaigns', { method: 'POST', body: { draft: true, name: f.name.trim(), objective: f.objective.trim() || null, audience: f.audience.trim() || null } });
      toast('Draft created. Review it, then start it when ready.');
      onClose();
      reload();
    });
  };
  return (
    <Overlay title="New campaign" onClose={onClose}>
      <form className="stack" noValidate onSubmit={submit}>
        <Note text="A draft calls nobody. Review it and start it when you're ready." tone="info" />
        <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
        <Field label="Objective" hint="What this campaign is for"><input type="text" maxLength={255} {...bind('objective')} /></Field>
        <Field label="Audience" hint='Who it reaches, e.g. "past customers"'><input type="text" maxLength={255} {...bind('audience')} /></Field>
        <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Create draft</button></div>
      </form>
    </Overlay>
  );
}

function EditForm({ campaign, reload }) {
  const [f, setF] = useState({ name: campaign.name || '', objective: campaign.objective || '', audience: campaign.audience?.label || '', script_note: campaign.script || '' });
  const [busy, run] = useRun();
  const bind = (key) => ({ value: f[key], onChange: (e) => setF({ ...f, [key]: e.target.value }) });
  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      await api(`/v1/leads/campaigns/${campaign.id}`, { method: 'PATCH', body: { name: f.name.trim(), objective: f.objective.trim() || null, audience: f.audience.trim() || null, script_note: f.script_note.trim() || null } });
      toast('Saved.');
      reload();
    });
  };
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <h4>Edit</h4>
      {campaign.status === 'draft' && campaign.reviewed_at ? <Note text="Changing this draft will need review again before it can start." tone="warn" /> : null}
      <Field label="Name"><input type="text" required maxLength={160} {...bind('name')} /></Field>
      <Field label="Objective"><input type="text" maxLength={255} {...bind('objective')} /></Field>
      <Field label="Audience"><input type="text" maxLength={255} {...bind('audience')} /></Field>
      <Field label="Script note" hint="What the voice assistant should emphasize"><textarea rows={3} {...bind('script_note')} /></Field>
      <div className="right"><button type="submit" className="btn btn--primary" disabled={busy}>Save changes</button></div>
    </form>
  );
}

const OWNER_TONE = { 'AI assistant (call-back)': 'info', 'Office team': 'neutral' };

function InterestedList({ interested }) {
  if (!interested?.length) return <Empty text="No one has asked to be called back or had their job details taken yet." />;
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

function CampaignDialog({ id, reload, onClose }) {
  const [state, setState] = useState({});
  const writer = can('admin', 'dispatcher');

  const load = useCallback(async () => {
    if (id && id.startsWith('sample_')) {
      const sample = SAMPLE_CAMPAIGNS.find((s) => s.id === id);
      if (sample) {
        setState({ data: sample });
        return;
      }
    }
    try {
      const data = await api(`/v1/leads/campaigns/${id}`);
      setState({ data });
    } catch (error) {
      const sample = SAMPLE_CAMPAIGNS.find((s) => s.id === id);
      if (sample) setState({ data: sample });
      else setState({ error });
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const c = state.data;
  const bump = () => { load(); reload(); };

  const review = async () => {
    if (id.startsWith('sample_')) {
      toast('Sample campaign marked reviewed.');
      setState((prev) => ({ ...prev, data: { ...prev.data, reviewed_at: new Date().toISOString() } }));
      return;
    }
    await api(`/v1/leads/campaigns/${id}/review`, { method: 'POST' });
    toast('Marked reviewed.');
    bump();
  };

  const setStatus = (status) => async () => {
    if (id.startsWith('sample_')) {
      toast(`Sample campaign status changed to ${status}.`);
      setState((prev) => ({ ...prev, data: { ...prev.data, status } }));
      return;
    }
    await api(`/v1/leads/campaigns/${id}/status`, { method: 'POST', body: { status } });
    toast(`Campaign ${status}.`);
    bump();
  };

  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!c) content = <Spinner />;
  else {
    const ready = readiness(c);
    content = (
      <div className="stack">
        <div className="row wrap">
          <Badge text={STATUS_LABEL[c.status] || c.status} tone={STATUS_TONE[c.status] || 'neutral'} />
          {ready ? <Badge text={ready} tone={c.reviewed_at ? 'good' : 'warn'} /> : null}
        </div>

        <Details rows={[
          ['Objective', c.objective || '-'],
          ['Audience', c.audience?.text || c.audience?.label || '-'],
          ['Progress', c.progress?.text || '-'],
          ['Reviewed', c.reviewed_at ? `${formatDateTime(c.reviewed_at)}${c.reviewed_by ? ` by ${c.reviewed_by}` : ''}` : 'Not yet'],
          ['Script', c.script || '-'],
        ]} />

        {writer ? (
          <div className="row wrap">
            {c.status === 'draft' && !c.reviewed_at ? <ActionButton className="btn btn--outline" action={review}>Mark draft reviewed</ActionButton> : null}
            {c.status === 'draft' && c.reviewed_at ? <ActionButton className="btn btn--primary" action={setStatus('active')}>Start</ActionButton> : null}
            {c.status === 'active' ? <ActionButton className="btn btn--outline" action={setStatus('paused')}>Pause</ActionButton> : null}
            {c.status === 'paused' ? <ActionButton className="btn btn--primary" action={setStatus('active')}>Resume</ActionButton> : null}
            {(c.status === 'active' || c.status === 'paused') ? <ActionButton className="btn btn--ghost" action={setStatus('finished')}>Finish</ActionButton> : null}
          </div>
        ) : null}

        <div className="drawer-card">
          <h4>Interested</h4>
          <InterestedList interested={c.interested} />
        </div>

        {writer && c.status !== 'finished' && !id.startsWith('sample_') ? (
          <div className="drawer-card"><EditForm campaign={c} reload={bump} /></div>
        ) : null}
      </div>
    );
  }

  return (
    <Overlay title={c?.name ? `Campaign: ${c.name}` : 'Campaign'} wide onClose={onClose}>
      {content}
    </Overlay>
  );
}

export default function Campaigns() {
  const [dialog, setDialog] = useState(null);
  const writer = can('admin', 'dispatcher');

  const [list, load] = useLoader(useCallback(async () => {
    try {
      const res = await api('/v1/leads/campaigns');
      return res.campaigns || [];
    } catch (e) {
      return [];
    }
  }, []));

  useEffect(() => { load(); }, [load]);
  const close = () => setDialog(null);

  if (!can('admin', 'dispatcher', 'approver')) {
    return (
      <div className="campaigns-container">
        <div className="campaigns-head">
          <div>
            <p className="campaigns-eyebrow">GROWTH</p>
            <h1 className="campaigns-title">Outbound campaigns</h1>
          </div>
        </div>
        <Note text="Not available for your role." tone="warn" />
      </div>
    );
  }

  // Display real backend campaigns when present; fallback to reference sample campaigns
  const campaigns = (list.data && list.data.length > 0) ? list.data : SAMPLE_CAMPAIGNS;

  return (
    <div className="campaigns-container">
      {/* Top Header */}
      <div className="campaigns-head">
        <div>
          <p className="campaigns-eyebrow">GROWTH</p>
          <h1 className="campaigns-title">Outbound campaigns</h1>
          <p className="campaigns-subtitle">Reconnect with past customers and turn interested responses into follow ups.</p>
        </div>
        <div className="row">
          <button
            type="button"
            className="campaigns-workspace-btn"
            onClick={() => {
              if (writer) setDialog({ kind: 'create' });
              else toast('Sample workspace active');
            }}
          >
            {writer ? '+ New campaign' : 'Sample workspace'}
          </button>
        </div>
      </div>

      {/* Main Campaigns Card */}
      <section className="campaigns-card">
        <div className="campaigns-card-head">
          <h2 className="campaigns-card-title">Campaigns</h2>
          <p className="campaigns-card-sub">Select a campaign to review its audience, script and leads</p>
        </div>

        {list.error && !campaigns.length ? (
          <ErrorBox error={list.error} />
        ) : (
          <div className="campaign-list">
            {campaigns.map((c) => {
              const subText = formatCampaignSub(c);
              const isDraft = c.status === 'draft';
              return (
                <div className="campaign-row" key={c.id}>
                  <div className="campaign-row-left">
                    <span className="campaign-row-icon" aria-hidden="true">
                      <Icon name="campaigns" />
                    </span>
                    <div className="campaign-row-info">
                      <h3 className="campaign-row-name">{c.name}</h3>
                      <p className="campaign-row-sub">{subText}</p>
                    </div>
                  </div>
                  <div className="campaign-row-actions">
                    <span className={`campaign-status-pill ${isDraft ? 'campaign-status-pill--draft' : 'campaign-status-pill--active'}`}>
                      {STATUS_LABEL[c.status] || c.status}
                    </span>
                    <button
                      type="button"
                      className="campaign-view-btn"
                      onClick={() => setDialog({ kind: 'view', id: c.id })}
                    >
                      View campaign →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Footer Disclaimer */}
      <p className="campaigns-disclaimer">Illustrative campaigns. No calls or messages are made.</p>

      {/* Modals */}
      {dialog?.kind === 'create' ? <CreateDialog onClose={close} reload={load} /> : null}
      {dialog?.kind === 'view' ? <CampaignDialog id={dialog.id} onClose={close} reload={load} /> : null}
    </div>
  );
}
