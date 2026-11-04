// AI agents: the automatic helpers this product has, what each one does, and - for the ones that have choices - how this company wants it to work (the receptionist's voice and the
// hours it answers calls, when the text assistant replies, when leads are called). The list, the on/off state and the form itself come from /v1/agents: the server says which
// choices an agent has and what each may be, and refuses anything else, so this screen never needs to know. Only an administrator can save; everyone else reads.
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { Badge, Card, Empty, ErrorBox, Field, Overlay, PageHeader, Select, Spinner, Tabs, toast, useRun } from '../components/index.js';

const DAY_LABELS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const STATUS = { active: ['Active', 'good'], paused: ['Paused', 'warn'], off: ['Off', 'neutral'] };
const TABS = [['all', 'All agents'], ['service', 'Customer service'], ['office', 'Office operations'], ['growth', 'Growth']];
const TAB_OF = { 'Customer service': 'service', Growth: 'growth', Operations: 'office', Office: 'office' };

const visible = (field, values) => !field.show_when || Object.entries(field.show_when).every(([key, wanted]) => values[key] === wanted);

function FieldInput({ field, value, onChange, disabled }) {
  if (field.kind === 'choice') {
    const chosen = field.options.find((o) => o.value === value);
    return (
      <Field label={field.label} hint={[chosen?.hint, field.help].filter(Boolean).join(' ')}>
        <Select options={field.options.map((o) => [o.value, o.label])} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </Field>
    );
  }
  if (field.kind === 'bool') {
    return (
      <div className="field">
        <label className="check"><input type="checkbox" checked={Boolean(value)} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{field.label}</label>
        {field.help && <small className="muted">{field.help}</small>}
      </div>
    );
  }
  if (field.kind === 'days') {
    return (
      <div className="field">
        <span className="label">{field.label}</span>
        <div className="row wrap">
          {DAY_LABELS.map(([id, text]) => (
            <label key={id} className="check">
              <input type="checkbox" checked={value.includes(id)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [...value, id] : value.filter((d) => d !== id))} />{text}
            </label>
          ))}
        </div>
      </div>
    );
  }
  if (field.kind === 'time') {
    return <Field label={field.label}><input type="time" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} /></Field>;
  }
  return (
    <Field label={field.label} hint={`${field.help || ''}${field.help ? ' ' : ''}${value.length}/${field.max_length}`}>
      <textarea rows={3} maxLength={field.max_length} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function AgentDialog({ id, onSaved, onClose }) {
  const [state, setState] = useState({});
  const [values, setValues] = useState(null);
  const [busy, run] = useRun();
  const writer = can('admin');

  useEffect(() => {
    let live = true;
    api(`/v1/agents/${id}`).then((data) => { if (live) { setState({ data }); setValues(data.values); } }).catch((error) => { if (live) setState({ error }); });
    return () => { live = false; };
  }, [id]);

  const { data, error } = state;
  const changed = data && values ? Object.fromEntries(Object.entries(values).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(data.values[key]))) : {};
  const save = (event) => {
    event.preventDefault();
    if (!Object.keys(changed).length) { onClose(); return; }
    run(async () => {
      await api(`/v1/agents/${id}`, { method: 'PATCH', body: { values: changed } });
      toast('Saved. It applies from the next call, text or sweep.');
      onSaved();
      onClose();
    });
  };

  return (
    <Overlay title={data?.name || 'AI agent'} wide onClose={onClose}>
      {error ? <ErrorBox error={error} /> : !data || !values ? <Spinner /> : (
        <form className="stack" noValidate onSubmit={save}>
          <p className="muted small">AI AGENT OVERVIEW</p>
          <p>{data.summary}</p>
          <h3>What this agent does</h3>
          <ul>{data.does.map((line) => <li key={line}>{line}</li>)}</ul>
          {data.server_off ? <p className="note note--warn">{data.server_off}</p> : null}
          {data.note ? <p className="note">{data.note}</p> : null}
          {data.editable ? (
            <>
              <h3>How it works for your company</h3>
              {!writer ? <p className="muted small">Only an administrator can change these.</p> : null}
              {data.fields.filter((field) => visible(field, values)).map((field) => (
                <FieldInput key={field.id} field={field} value={values[field.id]} disabled={!writer || busy} onChange={(next) => setValues((v) => ({ ...v, [field.id]: next }))} />
              ))}
              {values.schedule_mode === 'business_hours' ? <p className="muted small">{`Your business hours: ${data.company_hours}. Change them with your server's settings (see Settings).`}</p> : null}
              {writer ? <div className="right"><button type="submit" className="btn btn--primary" disabled={busy || !Object.keys(changed).length}>Save</button></div> : null}
            </>
          ) : null}
        </form>
      )}
    </Overlay>
  );
}

export default function Agents() {
  const [state, setState] = useState({});
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(null);

  const load = useCallback(() => {
    api('/v1/agents').then((data) => setState({ data })).catch((error) => setState({ error }));
  }, []);
  useEffect(() => { load(); }, [load]);

  const { data, error } = state;
  const shown = data ? data.agents.filter((agent) => tab === 'all' || TAB_OF[agent.group] === tab) : [];
  return (
    <>
      <PageHeader
        title="Meet your AI team"
        subtitle={data ? `${data.total} AI agents, ${data.active} active. Open one to see what it does and how it works for your company.` : 'What each AI agent does for your business.'}
      />
      <Tabs options={TABS} value={tab} onChange={setTab} label="Agent groups" />
      {error ? <ErrorBox error={error} /> : !data ? <Spinner /> : !shown.length ? <Empty text="No agents in this group." /> : (
        <div className="grid">
          {shown.map((agent) => {
            const [label, tone] = STATUS[agent.status] || [agent.status, 'neutral'];
            return (
              <Card as="section" key={agent.id}>
                <div className="between">
                  <h2>{agent.name}</h2>
                  <Badge text={label} tone={tone} />
                </div>
                <p className="muted small">{agent.group}</p>
                <p>{agent.summary}</p>
                <p className="small"><strong>{agent.choices || (agent.editable ? '' : 'Set by the server')}</strong></p>
                <button type="button" className="btn btn--outline" onClick={() => setOpen(agent.id)}>View agent</button>
              </Card>
            );
          })}
        </div>
      )}
      {open ? <AgentDialog id={open} onSaved={load} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
