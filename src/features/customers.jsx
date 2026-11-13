// Customers: the people the AI has taken calls and texts from - who they are, what they have asked for,
// and (for staff who may see it) the calls and open work tied to them. Also where leads/customers are
// imported from a spreadsheet, for the roles allowed to bring in a list.
// Live API only: empty list/detail/leads stay empty — never replaced with sample rows.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { CHANNELS, formatDateTime, short } from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Dialog, Empty, ErrorBox, Field, Icon, Note, Panel,
  PageHeader, ProgressBadge, Row, Select, Spinner, StatusBadge, toast,
} from '../components/index.js';

const PAGE = 50;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const LEADS_PREVIEW = 20;

const priorityTone = (p, emergency) => (emergency ? 'bad' : p === 'high' ? 'warn' : 'neutral');

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function customerSubtitle(c) {
  const place = c.location || c.city || c.address || '';
  const service = c.latest_service || c.service || '';
  if (place && service) return `${place} · ${service}`;
  return place || service || (c.phone ? c.phone : 'No service history yet');
}

function leadSubtitle(l) {
  const contact = l.email || l.phone || l.city || l.address || '';
  const interest = l.interest || l.status || '';
  if (contact && interest) return `${contact} · ${interest}`;
  return contact || interest || 'Lead';
}

// ---------- the list ----------

function CustomerList({ customers, open }) {
  return (
    <ul className="customers-list" aria-label="Customers">
      {customers.map((c) => (
        <li key={c.id}>
          <Row
            leading={<Icon name="customers" />}
            title={c.name || 'Unknown'}
            subtitle={customerSubtitle(c)}
            trailing={(
              <Button
                className="btn agent-btn"
                type="button"
                aria-label={`View customer ${c.name || ''}`.trim()}
                onClick={() => open(c)}
              >
                View customer
              </Button>
            )}
          />
        </li>
      ))}
    </ul>
  );
}

function RecentLeadsPanel({ leads, loading, error }) {
  let body;
  if (loading && !leads) body = <Spinner text="Loading leads…" />;
  else if (error) body = <ErrorBox error={error} />;
  else if (!leads?.length) body = <Empty text="No leads yet." />;
  else {
    body = (
      <ul className="customers-list" aria-label="Recent leads">
        {leads.map((l) => (
          <li key={l.id}>
            <Row
              leading={<Icon name="leads" />}
              title={l.name || 'Lead'}
              subtitle={leadSubtitle(l)}
            />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <Panel className="customers-imported" aria-label="Recent leads">
      <h2>{`Recent leads${leads?.length ? ` · ${leads.length}` : ''}`}</h2>
      <p className="muted small">From the live leads API after import or refresh. Empty means none on the server.</p>
      {body}
    </Panel>
  );
}

// ---------- the dialog for one customer ----------

function CustomerDetail({ id, onClose }) {
  const [state, setState] = useState({});
  const seq = useRef(0);

  useEffect(() => {
    const n = ++seq.current;
    setState({});
    (async () => {
      try {
        const customer = await api(`/v1/customers/${id}`);
        if (n === seq.current) setState({ customer });
      } catch (error) {
        if (n === seq.current) setState({ error });
      }
    })();
    return () => { seq.current += 1; };
  }, [id]);

  const c = state.customer;
  let content;
  if (state.error) content = <ErrorBox error={state.error} />;
  else if (!c) content = <Spinner text="Loading customer…" />;
  else {
    const showCalls = can('admin', 'dispatcher', 'approver') && Array.isArray(c.calls);
    content = (
      <div className="stack">
        <p className="muted">
          {[c.address || c.location, c.latest_service].filter(Boolean).join(' · ') || 'No contact details on file.'}
        </p>

        <h3>Contact</h3>
        <Details rows={[
          ['Phone', c.phone],
          ['Email', c.email],
          ['Address', c.address],
          ['Location', c.location],
          ['Latest service', c.latest_service],
          ['Requests', String(c.requests ?? 0)],
          ['Last activity', c.last_request_at ? formatDateTime(c.last_request_at) : ''],
        ]} />

        <h3>Service history</h3>
        {c.history?.length ? (
          <div className="customers-history">
            {c.history.map((h) => (
              <Row
                key={h.id}
                title={`#${short(h.id)} · ${[h.service, h.category].filter(Boolean).join(' · ') || 'Service request'}`}
                subtitle={[
                  h.created_at ? formatDateTime(h.created_at) : null,
                  h.appointment
                    ? `${h.appointment.status}, ${formatDateTime(h.appointment.start_at)} – ${formatDateTime(h.appointment.end_at)}`
                    : 'Not booked',
                ].filter(Boolean).join(' · ')}
                trailing={(
                  <span className="row wrap" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <Badge text={h.priority || 'normal'} tone={priorityTone(h.priority, h.is_emergency)} />
                    {h.is_emergency ? <Badge text="Emergency" tone="bad" /> : null}
                    <StatusBadge status={h.status} />
                  </span>
                )}
              />
            ))}
          </div>
        ) : <Empty text="No service requests yet." />}

        <h3>Open work</h3>
        {c.tasks?.length ? (
          <div className="customers-history">
            {c.tasks.map((t) => (
              <Row
                key={t.id || `${t.service}-${t.window_start}`}
                title={t.service || 'Open task'}
                subtitle={[
                  t.technician || 'Unassigned',
                  t.window_start ? `${formatDateTime(t.window_start)} – ${formatDateTime(t.window_end)}` : null,
                ].filter(Boolean).join(' · ')}
                trailing={<ProgressBadge progress={t.status} />}
              />
            ))}
          </div>
        ) : <Empty text="No open work." />}

        {/* Calls are personal data: only shown when the server actually sends them (admin, dispatcher, approver). */}
        {showCalls && (
          <>
            <h3>Recent calls</h3>
            {c.calls.length ? (
              <DataTable
                head={['Channel', 'Direction', 'When', 'Duration', 'Request']}
                rows={c.calls.map((call) => [
                  CHANNELS[call.channel] || call.channel,
                  call.direction,
                  formatDateTime(call.started_at),
                  call.duration_seconds != null ? `${Math.round(call.duration_seconds / 60)} min` : '-',
                  call.service_request_id ? `#${short(call.service_request_id)}` : '-',
                ])}
                label="Calls"
              />
            ) : <Empty text="No calls recorded." />}
          </>
        )}
      </div>
    );
  }

  return (
    <Dialog title={c?.name ? `Customer · ${c.name}` : 'Customer'} wide onClose={onClose}>
      {content}
    </Dialog>
  );
}

// ---------- import leads/customers (admin, dispatcher only) ----------

function fieldsFor(meta, type) {
  if (!meta) return [];
  if (Array.isArray(meta.record_types)) return meta.record_types.find((r) => r.id === type)?.fields || [];
  const list = (meta.fields && meta.fields[type]) || meta[type];
  return Array.isArray(list) ? list : [];
}

function recordTypeOptions(meta) {
  if (Array.isArray(meta?.record_types) && meta.record_types.length) return meta.record_types.map((r) => [r.id, r.label || r.id]);
  return [['customers', 'Customers'], ['leads', 'Leads']];
}

function CountsStrip({ counts }) {
  if (!counts) return null;
  return (
    <Details rows={[
      ['Rows in file', String(counts.rows ?? 0)],
      ['Will import', String(counts.will_import ?? 0)],
      ['Already exist', String(counts.already_exist ?? 0)],
      ['Invalid', String(counts.invalid ?? 0)],
      ['Duplicates in file', String(counts.duplicates_in_file ?? 0)],
    ]} />
  );
}

function ProblemsList({ problems, total }) {
  if (!problems?.length) return null;
  return (
    <>
      <ul className="plain">
        {problems.slice(0, 10).map((p, i) => <li key={i} className="small">{`Line ${p.line}: ${p.problem}${p.kind ? ` (${p.kind})` : ''}`}</li>)}
      </ul>
      {total > Math.min(problems.length, 10) ? <p className="muted small">{`${total} problems in total; showing the first ${Math.min(problems.length, 10)}.`}</p> : null}
    </>
  );
}

function ImportWizard({ onClose, reload, onImported }) {
  const [step, setStep] = useState(1);
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(null);
  const [recordType, setRecordType] = useState('customers');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    let current = true;
    api('/v1/imports/fields').then((data) => { if (current) setMeta(data); }).catch((e) => { if (current) setMetaError(e); });
    return () => { current = false; };
  }, []);

  const fields = fieldsFor(meta, recordType);

  const onFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) toast('That file is over 2 MB; the server will refuse it.', 'warn');
    setFileName(file.name);
    setCsv(await file.text());
    setPreview(null);
    setMapping({});
  };

  const runPreview = async (withMapping) => {
    const out = await api('/v1/imports/preview', { method: 'POST', body: { record_type: recordType, csv, ...(withMapping && Object.keys(withMapping).length ? { mapping: withMapping } : {}) } });
    setPreview(out);
    setMapping(out.mapping || out.suggested_mapping || {});
    return out;
  };

  const fieldLabel = (fieldId) => fields.find((f) => f.id === fieldId)?.label || fieldId.replaceAll('_', ' ');

  return (
    <Dialog title="Import leads or customers" wide onClose={onClose}>
      <div className="stack">
        <p className="muted">Upload a CSV, map your columns, and review valid records before importing.</p>
        <p className="muted small">{`Step ${step} of 3`}</p>

        {step === 1 && (
          <div className="stack">
            {metaError ? <ErrorBox error={metaError} /> : null}
            {meta?.limits ? (
              <Note tone="neutral" text={`At most ${meta.limits.max_size_mb ?? 2} MB and ${meta.limits.max_rows ?? 1000} rows. The first row must be the column names.${meta.note ? ` ${meta.note}` : ''}`} />
            ) : (
              <Note tone="neutral" text="At most 2 MB and 1,000 rows. The first row must be the column names." />
            )}
            <Field label="Record type"><Select options={recordTypeOptions(meta)} value={recordType} onChange={(e) => { setRecordType(e.target.value); setPreview(null); setMapping({}); }} /></Field>
            <Field label="CSV file" hint={fileName || 'No file chosen yet.'}><input type="file" accept=".csv,text/csv" onChange={onFile} /></Field>
            <p className="sub">Suggested columns: name, email, phone, city, service.</p>
            <div className="right">
              <ActionButton
                className="btn btn--primary"
                disabled={!csv.trim()}
                action={async () => {
                  if (!csv.trim()) { toast('Choose a CSV file first.', 'bad'); return; }
                  await runPreview(null);
                  setStep(2);
                }}
              >Continue to mapping</ActionButton>
            </div>
          </div>
        )}

        {step === 2 && preview && (
          <div className="stack">
            <p>{`${fileName}, mapped as ${recordType}.`}</p>
            {preview.needs_mapping?.length ? (
              <Note tone="warn" text={`Still needs a column: ${preview.needs_mapping.map((f) => fieldLabel(f)).join(', ')}.`} />
            ) : null}
            <div className="grid2">
              {(fields.length ? fields : (preview.needs_mapping || []).map((id) => ({ id, label: id, required: true }))).map((f) => (
                <Field key={f.id} label={`${f.label || f.id.replaceAll('_', ' ')}${f.required ? ' *' : ''}`}>
                  <Select
                    options={[['', 'Not mapped'], ...(preview.headers || []).map((h) => [h, h])]}
                    value={mapping[f.id] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.id]: e.target.value }))}
                  />
                </Field>
              ))}
            </div>
            {preview.ignored_columns?.length ? <p className="muted small">{`Not used: ${preview.ignored_columns.join(', ')}.`}</p> : null}

            <h3>Preview</h3>
            <CountsStrip counts={preview.counts} />
            {preview.sample?.length ? (
              <DataTable
                head={Object.keys(preview.sample[0]).map((k) => k.replaceAll('_', ' '))}
                rows={preview.sample.map((row) => Object.values(row).map((v) => (v === null || v === undefined ? '-' : String(v))))}
                label="Sample rows"
              />
            ) : <Empty text="Nothing would be imported from this file." />}
            <ProblemsList problems={preview.problems} total={preview.problems_total ?? preview.problems?.length ?? 0} />

            <div className="row between">
              <Button className="btn btn--ghost" onClick={() => setStep(1)}>Back</Button>
              <div className="row">
                <ActionButton className="btn btn--outline" action={() => runPreview(mapping)}>Update preview</ActionButton>
                <ActionButton
                  className="btn btn--primary"
                  disabled={!preview.can_import}
                  action={async () => {
                    if (!preview.can_import) { toast('Fix the mapping before continuing.', 'bad'); return; }
                    setStep(3);
                  }}
                >Continue</ActionButton>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="stack">
            <p>{`Ready to import as ${recordType}.`}</p>
            <CountsStrip counts={preview?.counts} />
            {!result ? (
              <div className="row between">
                <Button className="btn btn--ghost" onClick={() => setStep(2)}>Back</Button>
                <ActionButton
                  className="btn btn--primary"
                  action={async () => {
                    const out = await api('/v1/imports', { method: 'POST', body: { record_type: recordType, csv, mapping } });
                    setResult(out);
                    reload();
                    // Refresh leads from the live API after a leads import — never use preview.sample.
                    if (recordType === 'leads') onImported?.(out);
                    toast(`Imported ${out.imported ?? 0}.`);
                  }}
                >Confirm import</ActionButton>
              </div>
            ) : (
              <div className="stack">
                <Note
                  tone={result.invalid || result.blocked ? 'warn' : 'good'}
                  text={[
                    `${result.imported ?? 0} imported`,
                    `${result.already_existed ?? 0} already existed`,
                    `${result.invalid ?? 0} invalid`,
                    `${result.duplicates_in_file ?? 0} duplicates in file`,
                    result.blocked != null ? `${result.blocked} blocked` : null,
                    result.without_consent != null ? `${result.without_consent} without consent` : null,
                  ].filter(Boolean).join(', ')}
                />
                <ProblemsList problems={result.problems} total={result.problems_total ?? result.problems?.length ?? 0} />
                <div className="right"><Button className="btn btn--primary" onClick={onClose}>Done</Button></div>
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ---------- add one person (admin, dispatcher only) ----------

const EMPTY_ONE_PERSON = {
  name: '', phone: '', email: '', address: '', city: '', state: '', zip: '', interest: '', notes: '', consent: false,
};

function AddOnePersonDialog({ onClose, reload, onViewCustomer }) {
  const [recordType, setRecordType] = useState('customers');
  const [form, setForm] = useState(EMPTY_ONE_PERSON);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const changeRecordType = (e) => {
    setRecordType(e.target.value);
    setResult(null);
    setError(null);
  };

  const reset = () => {
    setForm(EMPTY_ONE_PERSON);
    setResult(null);
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.phone.trim()) { toast('A phone number is needed.', 'bad'); return; }
    setSaving(true);
    setError(null);
    try {
      const body = {
        record_type: recordType,
        phone: form.phone.trim(),
        name: form.name.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        zip: form.zip.trim() || undefined,
      };
      if (recordType === 'leads') {
        body.interest = form.interest.trim() || undefined;
        body.notes = form.notes.trim() || undefined;
        body.consent = !!form.consent;
      }
      const out = await api('/v1/imports/one', { method: 'POST', body });
      setResult(out);
      if (out.created) reload();
      const person = out.record_type === 'leads' ? out.lead : out.customer;
      toast(out.already_existed ? 'This person already exists.' : `Added ${person?.name || person?.phone || 'person'}.`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const person = result ? (result.record_type === 'leads' ? result.lead : result.customer) : null;

  return (
    <Dialog title="Add one person" onClose={onClose}>
      <div className="stack">
        <Field label="Record type">
          <Select
            options={[['customers', 'Customers'], ['leads', 'Leads']]}
            value={recordType}
            onChange={changeRecordType}
            disabled={!!result}
          />
        </Field>

        <form className="stack" noValidate onSubmit={submit}>
          <div className="grid2">
            <Field label="Phone *"><input type="tel" value={form.phone} onChange={set('phone')} disabled={!!result} /></Field>
            <Field label="Name"><input type="text" value={form.name} onChange={set('name')} disabled={!!result} /></Field>
            <Field label="Email"><input type="email" value={form.email} onChange={set('email')} disabled={!!result} /></Field>
            <Field label="Address"><input type="text" value={form.address} onChange={set('address')} disabled={!!result} /></Field>
            <Field label="City"><input type="text" value={form.city} onChange={set('city')} disabled={!!result} /></Field>
            <Field label="State"><input type="text" value={form.state} onChange={set('state')} disabled={!!result} /></Field>
            <Field label="ZIP"><input type="text" value={form.zip} onChange={set('zip')} disabled={!!result} /></Field>
          </div>

          {recordType === 'leads' ? (
            <>
              <Field label="Interest"><input type="text" value={form.interest} onChange={set('interest')} disabled={!!result} /></Field>
              <Field label="Notes"><textarea rows={2} value={form.notes} onChange={set('notes')} disabled={!!result} /></Field>
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.consent}
                  disabled={!!result}
                  onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                />
                Agreed to be called
              </label>
              {!form.consent ? (
                <Note tone="warn" text="Saved without consent: nobody will call this lead until consent is recorded." />
              ) : null}
            </>
          ) : null}

          {error ? <Note tone="bad" text={error.message} /> : null}

          {!result ? (
            <div className="right">
              <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Add person'}</button>
            </div>
          ) : null}
        </form>

        {result ? (
          <div className="stack">
            <Note
              tone={result.already_existed ? 'warn' : 'good'}
              text={result.already_existed ? 'This person already exists. Nothing was changed.' : `Added ${person?.name || person?.phone || 'person'}.`}
            />
            {result.record_type === 'leads' && result.lead?.status === 'blocked' ? (
              <Note tone="warn" text="On the do-not-call list: kept, but will not be called." />
            ) : null}
            {result.record_type === 'leads' && result.lead?.note ? (
              <Note tone="neutral" text={result.lead.note} />
            ) : null}
            <div className="row between">
              {result.record_type === 'customers' && result.customer?.id ? (
                <Button className="btn btn--secondary" onClick={() => onViewCustomer(result.customer.id)}>View customer</Button>
              ) : <span />}
              <div className="row" style={{ gap: 8 }}>
                <Button className="btn btn--outline" onClick={reset}>Add another</Button>
                <Button className="btn btn--primary" onClick={onClose}>Done</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

// ---------- the page ----------

export default function Customers() {
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null); // { customers, offset } of the last successful load
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [addOneOpen, setAddOneOpen] = useState(false);
  const [leads, setLeads] = useState(null);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsError, setLeadsError] = useState(null);
  const canImport = can('admin', 'dispatcher');
  const seq = useRef(0);
  const leadsSeq = useRef(0);
  const latest = useRef({});
  latest.current = { search, offset };

  const load = useCallback(async (quiet) => {
    const { search: s, offset: o } = latest.current;
    const n = ++seq.current;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const out = await api('/v1/customers', { params: { search: s, limit: PAGE, offset: o } });
      if (n !== seq.current) return;
      // Live empties stay empty — never inject illustrative customers.
      setData({ customers: asList(out?.customers), offset: o });
      setError(null);
      setLoading(false);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e);
      setLoading(false);
    }
  }, []);

  const loadLeads = useCallback(async (quiet) => {
    if (!canImport) return;
    const n = ++leadsSeq.current;
    if (!quiet) setLeadsLoading(true);
    try {
      const out = await api('/v1/leads', { params: { limit: LEADS_PREVIEW } });
      if (n !== leadsSeq.current) return;
      setLeads(asList(out?.leads));
      setLeadsError(null);
      setLeadsLoading(false);
    } catch (e) {
      if (n !== leadsSeq.current) return;
      setLeadsError(e);
      setLeadsLoading(false);
    }
  }, [canImport]);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [search, offset, load]);
  useEvery(() => load(true), 30000);

  useEffect(() => {
    if (!canImport) return undefined;
    loadLeads();
    return undefined;
  }, [canImport, loadLeads]);
  useEvery(() => { if (canImport) loadLeads(true); }, 30000);

  const customers = data ? data.customers : [];
  let list;
  if (loading) list = <Spinner />;
  else if (error) list = <ErrorBox error={error} />;
  else if (!customers.length) list = <Empty text={search ? 'No matching customers.' : 'No customers yet.'} />;
  else list = <CustomerList customers={customers} open={(c) => setOpenId(c.id)} />;

  // Same pagination surface as pre-design main: always available once a live page has loaded.
  const showPager = Boolean(data);

  return (
    <>
      <PageHeader
        eyebrow="CUSTOMERS"
        title="Customers"
        subtitle="Find a customer and review their service history."
      >
        {canImport && (
          <>
            <Button className="btn btn--secondary" onClick={() => setAddOneOpen(true)}>
              Add one person
            </Button>
            <Button className="btn btn--primary" onClick={() => setImportOpen(true)}>
              Import leads or customers
            </Button>
          </>
        )}
      </PageHeader>

      <Panel className="customers-panel" aria-label="Customer search">
        <Field label="Search customers">
          <input
            type="search"
            className="customers-search"
            placeholder="Name, city, or service"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            autoComplete="off"
          />
        </Field>
        {list}
        {showPager ? (
          <div className="customers-pager row between">
            <Button className="btn btn--ghost" aria-label="Previous page" disabled={data.offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹ Previous</Button>
            <span className="muted small">{data.customers.length ? `${data.offset + 1}–${data.offset + data.customers.length}` : '0'}</span>
            <Button className="btn btn--ghost" aria-label="Next page" disabled={data.customers.length < PAGE} onClick={() => setOffset((o) => o + PAGE)}>Next ›</Button>
          </div>
        ) : null}
      </Panel>

      {canImport ? (
        <div style={{ marginTop: 18 }}>
          <RecentLeadsPanel leads={leads} loading={leadsLoading} error={leadsError} />
        </div>
      ) : null}

      {openId && <CustomerDetail id={openId} onClose={() => setOpenId(null)} />}
      {importOpen && canImport && (
        <ImportWizard
          onClose={() => setImportOpen(false)}
          reload={() => load(true)}
          onImported={() => loadLeads()}
        />
      )}
      {addOneOpen && canImport && (
        <AddOnePersonDialog
          onClose={() => setAddOneOpen(false)}
          reload={() => { load(true); loadLeads(); }}
          onViewCustomer={(id) => { setAddOneOpen(false); setOpenId(id); }}
        />
      )}
    </>
  );
}
