// Customers: the people the AI has taken calls and texts from - who they are, what they have asked for,
// and (for staff who may see it) the calls and open work tied to them. Also where leads/customers are
// imported from a spreadsheet, for the roles allowed to bring in a list.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { CHANNELS, formatDateTime, short, timeAgo } from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Badge, Button, DataTable, Details, Empty, ErrorBox, Field, Note, Overlay, PageHeader,
  ProgressBadge, Select, Spinner, StatusBadge, toast,
} from '../components/index.js';

const PAGE = 50;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const priorityTone = (p, emergency) => (emergency ? 'bad' : p === 'high' ? 'warn' : 'neutral');

// ---------- the list ----------

function CustomerTable({ customers, open }) {
  const rows = customers.map((c) => [
    c.name || 'Unknown',
    c.phone || '-',
    c.location || '-',
    c.latest_service || '-',
    String(c.requests ?? 0),
    c.last_request_at ? timeAgo(c.last_request_at) : 'Never',
  ]);
  return (
    <DataTable
      head={['Name', 'Phone', 'Location', 'Latest service', 'Requests', 'Last activity']}
      rows={rows}
      onRow={(_cells, i) => open(customers[i])}
      label="Customers"
    />
  );
}

// ---------- the drawer for one customer ----------

function CustomerDrawer({ id, onClose }) {
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
          <DataTable
            head={['#', 'Service', 'Priority', 'Status', 'Requested', 'Appointment']}
            rows={c.history.map((h) => [
              `#${short(h.id)}`,
              [h.service, h.category].filter(Boolean).join(' · ') || '-',
              <span key="p"><Badge text={h.priority} tone={priorityTone(h.priority, h.is_emergency)} />{h.is_emergency ? <Badge text="Emergency" tone="bad" /> : null}</span>,
              <StatusBadge key="s" status={h.status} />,
              formatDateTime(h.created_at),
              h.appointment ? `${h.appointment.status}, ${formatDateTime(h.appointment.start_at)} – ${formatDateTime(h.appointment.end_at)}` : 'Not booked',
            ])}
            label="Service history"
          />
        ) : <Empty text="No service requests yet." />}

        <h3>Open work</h3>
        {c.tasks?.length ? (
          <DataTable
            head={['Service', 'Status', 'Technician', 'Window']}
            rows={c.tasks.map((t) => [
              t.service || '-',
              <ProgressBadge key="st" progress={t.status} />,
              t.technician || 'Unassigned',
              t.window_start ? `${formatDateTime(t.window_start)} – ${formatDateTime(t.window_end)}` : '-',
            ])}
            label="Open tasks"
          />
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

  return <Overlay title={c?.name || 'Customer'} wide onClose={onClose}>{content}</Overlay>;
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

function ImportWizard({ onClose, reload }) {
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
    <Overlay title="Import leads or customers" wide onClose={onClose}>
      <div className="stack">
        <p className="muted small">{`Step ${step} of 3`}</p>

        {step === 1 && (
          <div className="stack">
            {metaError ? <ErrorBox error={metaError} /> : null}
            {meta?.limits ? (
              <Note tone="neutral" text={`At most ${meta.limits.max_size_mb ?? 2} MB and ${meta.limits.max_rows ?? 1000} rows. The first row must be the column names.${meta.note ? ` ${meta.note}` : ''}`} />
            ) : (
              <Note tone="neutral" text="At most 2 MB and 1,000 rows. The first row must be the column names." />
            )}
            <Field label="What are these rows?"><Select options={recordTypeOptions(meta)} value={recordType} onChange={(e) => { setRecordType(e.target.value); setPreview(null); setMapping({}); }} /></Field>
            <Field label="CSV file" hint={fileName || 'No file chosen yet.'}><input type="file" accept=".csv,text/csv" onChange={onFile} /></Field>
            <div className="right">
              <ActionButton
                className="btn btn--primary"
                disabled={!csv.trim()}
                action={async () => {
                  if (!csv.trim()) { toast('Choose a CSV file first.', 'bad'); return; }
                  await runPreview(null);
                  setStep(2);
                }}
              >Continue</ActionButton>
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
    </Overlay>
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
  const canImport = can('admin', 'dispatcher');
  const seq = useRef(0);
  const latest = useRef({});
  latest.current = { search, offset };

  const load = useCallback(async (quiet) => {
    const { search: s, offset: o } = latest.current;
    const n = ++seq.current;
    if (!quiet) { setLoading(true); setError(null); }
    try {
      const out = await api('/v1/customers', { params: { search: s, limit: PAGE, offset: o } });
      if (n !== seq.current) return;
      setData({ customers: out.customers, offset: o });
      setError(null);
      setLoading(false);
    } catch (e) {
      if (n !== seq.current) return;
      setError(e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(load, 250);
    return () => clearTimeout(id);
  }, [search, offset, load]);
  useEvery(() => load(true), 30000);

  const customers = data ? data.customers : [];
  let list;
  if (loading) list = <Spinner />;
  else if (error) list = <ErrorBox error={error} />;
  else if (!customers.length) list = <Empty text={search ? 'No customer matches that search.' : 'No customers yet.'} />;
  else list = <CustomerTable customers={customers} open={(c) => setOpenId(c.id)} />;

  return (
    <>
      <PageHeader title="Customers" subtitle="People the AI has taken calls and texts from.">
        {canImport && <Button className="btn btn--outline" onClick={() => setImportOpen(true)}>Import leads or customers</Button>}
      </PageHeader>
      <div className="toolbar">
        <input type="text" aria-label="Search" placeholder="Search name, address, or service…" className="search" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} />
        <span className="spacer" />
        <Button className="btn btn--ghost" aria-label="Previous page" disabled={!data || data.offset === 0} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>‹</Button>
        <span className="muted">{data ? (data.customers.length ? `${data.offset + 1}–${data.offset + data.customers.length}` : '0') : ''}</span>
        <Button className="btn btn--ghost" aria-label="Next page" disabled={!data || data.customers.length < PAGE} onClick={() => setOffset((o) => o + PAGE)}>›</Button>
      </div>
      <div>{list}</div>
      {openId && <CustomerDrawer id={openId} onClose={() => setOpenId(null)} />}
      {importOpen && canImport && <ImportWizard onClose={() => setImportOpen(false)} reload={() => load(true)} />}
    </>
  );
}
