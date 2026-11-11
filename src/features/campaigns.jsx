// Campaigns: outreach drafts and runs - who they aim to reach, how far dialing has got, and the people who
// asked to be called back or whose job details the AI took along the way. A draft never dials anyone until
// it is reviewed and started; the server enforces that (409 on anything out of order), this page just
// reflects status and lets admins/dispatchers create, edit, review and start/pause/finish a campaign.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, Card, DataTable, Details, Empty, ErrorBox, Field, Note, Overlay, PageHeader, Spinner, toast, useRun, Icon,
} from '../components/index.js';

const STATUS_TONE = { active: 'good', paused: 'warn', finished: 'neutral', draft: 'info' };
const STATUS_LABEL = { active: 'Active', paused: 'Paused', finished: 'Finished', draft: 'Draft' };

// A draft says it's ready for review, then ready to start once reviewed - computed here only if the server
// hasn't already sent a pre-formatted line for it (it sends plenty of other pre-formatted text already).
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
    try {
      const data = await api(`/v1/leads/campaigns/${id}`);
      setState({ data });
    } catch (error) {
      setState({ error });
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const c = state.data;
  const bump = () => { load(); reload(); };

  const review = async () => { await api(`/v1/leads/campaigns/${id}/review`, { method: 'POST' }); toast('Marked reviewed.'); bump(); };
  const setStatus = (status) => async () => { await api(`/v1/leads/campaigns/${id}/status`, { method: 'POST', body: { status } }); toast(`Campaign ${status}.`); bump(); };

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
          ['Objective', c.objective],
          ['Audience', c.audience?.text || c.audience?.label],
          ['Progress', c.progress?.text],
          ['Reviewed', c.reviewed_at ? `${formatDateTime(c.reviewed_at)}${c.reviewed_by ? ` by ${c.reviewed_by}` : ''}` : 'Not yet'],
          ['Script', c.script],
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

        {writer && c.status !== 'finished' ? <div className="drawer-card"><EditForm campaign={c} reload={bump} /></div> : null}
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

  const [list, load] = useLoader(useCallback(async () => (await api('/v1/leads/campaigns')).campaigns, []));
  useEffect(() => { load(); }, [load]);

  const close = () => setDialog(null);

  if (!can('admin', 'dispatcher', 'approver')) {
    return (
      <>
        <PageHeader title="Campaigns" />
        <Note text="Not available for your role." tone="warn" />
      </>
    );
  }

  let body;
  if (list.error) body = <ErrorBox error={list.error} />;
  else if (!list.data) body = <Spinner />;
  else if (!list.data.length) body = <Empty text="No campaigns yet. Create a draft to get started." />;
  else {
    body = (
      <div className="campaign-list">
        {list.data.map((c) => {
          const ready = readiness(c);
          const sub = [c.objective, c.audience?.text || c.audience?.label, c.status === 'draft' ? ready : c.progress?.text].filter(Boolean).join(' · ');
          return (
            <div className="campaign-row" key={c.id}>
              <span className="campaign-row__icon" aria-hidden="true"><Icon name="campaigns" /></span>
              <div className="campaign-row__body">
                <p className="campaign-row__name">{c.name}</p>
                <p className="campaign-row__sub muted small">{sub || '-'}</p>
              </div>
              <div className="campaign-row__actions">
                <Badge text={STATUS_LABEL[c.status] || c.status} tone={STATUS_TONE[c.status] || 'neutral'} />
                <button type="button" className="btn btn--outline" onClick={() => setDialog({ kind: 'view', id: c.id })}>View campaign →</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Outreach drafts and runs: who they aim to reach, how far dialing has got, and who's asked to be called back.">
        {writer ? <Button className="btn btn--primary" onClick={() => setDialog({ kind: 'create' })}><span className="row"><Icon name="leads" /><span>New campaign</span></span></Button> : null}
      </PageHeader>
      <Card as="section">
        <div className="campaign-panel-head">
          <h2>Campaigns</h2>
          <p className="muted small">Select a campaign to review its audience, script and leads.</p>
        </div>
        {body}
      </Card>
      {dialog?.kind === 'create' ? <CreateDialog onClose={close} reload={load} /> : null}
      {dialog?.kind === 'view' ? <CampaignDialog id={dialog.id} onClose={close} reload={load} /> : null}
    </>
  );
}
