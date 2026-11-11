// Campaigns: Outbound campaigns — visual parity with the Rytsense reference.
// Eyebrow + H1 + subtitle, panel of rows (circle, progress, Active/Draft tags, View campaign).
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Dialog, ErrorBox, Field, Note,
  PageHeader, Panel, PanelHead, Row, Spinner, toast, useRun,
} from '../components/index.js';

const STATUS_TONE = { active: 'good', paused: 'warn', finished: 'neutral', draft: 'warn' };
const STATUS_LABEL = { active: 'Active', paused: 'Paused', finished: 'Finished', draft: 'Draft' };

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

function InterestedList({ interested }) {
  if (!interested?.length) {
    return <p className="sub empty-inline">No responses yet. Interested leads will appear here after outreach.</p>;
  }
  // Sample campaigns use a short prose line matching the reference dialog.
  if (interested.every((p) => p.summary)) {
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
            <strong>{id.startsWith('sample_') ? 'Sample outreach script' : 'Outreach script'}</strong>
            <br />
            {c.script}
          </div>
        ) : null}

        <h3>Interested lead follow-up</h3>
        <InterestedList interested={c.interested} />

        <div className="dialog-actions">
          {primaryAction}
          {(writer && (c.status === 'active' || c.status === 'paused')) ? (
            <ActionButton className="btn btn--ghost" action={setStatus('finished')}>Finish</ActionButton>
          ) : null}
          <Button className="btn btn--secondary agent-btn" onClick={onClose}>Close</Button>
        </div>

        {writer && c.status !== 'finished' && !id.startsWith('sample_') ? (
          <EditForm campaign={c} reload={bump} />
        ) : null}

        {!id.startsWith('sample_') ? (
          <Details rows={[
            ['Reviewed', c.reviewed_at ? `${formatDateTime(c.reviewed_at)}${c.reviewed_by ? ` by ${c.reviewed_by}` : ''}` : 'Not yet'],
          ]} />
        ) : null}

        <p className="sample-label">
          {id.startsWith('sample_')
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
  const writer = can('admin', 'dispatcher');

  const [list, load] = useLoader(useCallback(async () => {
    try {
      const res = await api('/v1/leads/campaigns');
      return res.campaigns || [];
    } catch {
      return [];
    }
  }, []));

  useEffect(() => { load(); }, [load]);
  const close = () => setDialog(null);

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

  // Prefer live campaigns; fall back to reference sample list for visual parity.
  const usingSamples = !(list.data && list.data.length > 0);
  const campaigns = usingSamples ? SAMPLE_CAMPAIGNS : list.data;
  const loading = list.data === undefined && !list.error;

  const headerMeta = (
    <>
      {usingSamples ? <span className="date">Sample workspace</span> : null}
      {writer ? (
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

      <Panel>
        <PanelHead
          title="Campaigns"
          subtitle="Select a campaign to review its audience, script and leads"
        />

        {list.error && !campaigns.length ? <ErrorBox error={list.error} /> : null}
        {loading ? <Spinner /> : null}

        {!loading && !campaigns.length ? (
          <p className="sub empty-inline">No campaigns yet. Create a draft to get started.</p>
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

      {usingSamples ? (
        <p className="foot">Illustrative campaigns. No calls or messages are made.</p>
      ) : (
        <p className="foot">Live campaigns · Outreach follows each campaign’s status and schedule.</p>
      )}

      {dialog?.kind === 'create' ? <CreateDialog onClose={close} reload={load} /> : null}
      {dialog?.kind === 'view' ? <CampaignDialog id={dialog.id} onClose={close} reload={load} /> : null}
    </>
  );
}
