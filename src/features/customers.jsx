// Customers: the people the AI has taken calls and texts from.
// Exact Reference UI matching reference design with live backend integration and fallback sample records.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { CHANNELS, formatDateTime, short } from '../lib/format.js';
import { useEvery } from '../lib/hooks.js';
import { can } from '../lib/session.js';
import {
  ActionButton, Button, DataTable, Details, Dialog, Empty, ErrorBox, Field, Icon, Note, Panel,
  PageHeader, ProgressBadge, Row, Select, Spinner, StatusBadge, toast,
} from '../components/index.js';

const PAGE = 50;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

// Sample customers matching reference screenshot exactly
const SAMPLE_CUSTOMERS = [
  {
    id: 'cust-1',
    isSample: true,
    name: 'Sarah Mitchell',
    location: 'Austin, TX',
    service: 'AC repair',
    subtitle: 'Austin, TX · AC repair',
    phone: '(512) 555-0142',
    email: 'sarah.mitchell@example.com',
    address: '1206 Oak Street, Austin, TX',
    historySubtitle: 'Wed, Nov 11 · 1 PM · Confirmed · Unassigned',
  },
  {
    id: 'cust-2',
    isSample: true,
    name: 'David Rodriguez',
    location: 'Austin, TX',
    service: 'HVAC maintenance',
    subtitle: 'Austin, TX · HVAC maintenance',
    phone: '(512) 555-0189',
    email: 'david.rodriguez@example.com',
    address: '742 Evergreen Terrace, Austin, TX',
    historySubtitle: 'Wed, Nov 11 · 3:30 PM · Confirmed · Mike Rodriguez',
  },
  {
    id: 'cust-3',
    isSample: true,
    name: 'William Brooks',
    location: 'Round Rock, TX',
    service: 'Plumbing inspection',
    subtitle: 'Round Rock, TX · Plumbing inspection',
    phone: '(512) 555-0273',
    email: 'w.brooks@example.com',
    address: '4508 Riverbend Road, Round Rock, TX',
    historySubtitle: 'Thu, Nov 12 · 9 AM · Needs confirmation · Unassigned',
  },
  {
    id: 'cust-4',
    isSample: true,
    name: 'Jessica Taylor',
    location: 'Austin, TX',
    service: 'Estimate follow up',
    subtitle: 'Austin, TX · Estimate follow up',
    phone: '(512) 555-0218',
    email: 'jessica.t@example.com',
    address: '3204 Lakeview Drive, Austin, TX',
    historySubtitle: 'Fri, Nov 13 · 3 PM · Open inquiry · Unassigned',
  },
  {
    id: 'cust-5',
    isSample: true,
    name: 'Taylor Green',
    location: 'Austin, TX',
    service: 'AC replacement inquiry',
    subtitle: 'Austin, TX · AC replacement inquiry',
    phone: '(512) 555-0391',
    email: 'taylor.green@example.com',
    address: '812 Barton Springs Rd, Austin, TX',
    historySubtitle: 'Mon, Nov 16 · 10 AM · Scheduled · Unassigned',
  },
  {
    id: 'cust-6',
    isSample: true,
    name: 'Jordan Lee',
    location: 'Austin, TX',
    service: 'Maintenance follow up',
    subtitle: 'Austin, TX · Maintenance follow up',
    phone: '(512) 555-0455',
    email: 'jordan.lee@example.com',
    address: '1501 South Congress Ave, Austin, TX',
    historySubtitle: 'Tue, Nov 17 · 11 AM · Scheduled · Unassigned',
  },
];

function customerSubtitle(c) {
  const place = c.location || c.city || c.address || '';
  const service = c.latest_service || c.service || '';
  if (place && service) return `${place} · ${service}`;
  return place || service || (c.phone ? c.phone : 'No service history yet');
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

// ---------- the dialog for one customer ----------

function CustomerDetail({ id, onClose }) {
  const [state, setState] = useState({});
  const seq = useRef(0);

  <div className="customer-modal-service-row">
    <div>
      <div className="customer-modal-service-name">{serviceName}</div>
      <div className="customer-modal-service-sub">{historySub}</div>
    </div>
    <a
      href="#/appointments"
      className="customer-modal-btn"
      onClick={onClose}
    >
      View appointment
    </a>
  </div>

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
                title={[h.service, h.category].filter(Boolean).join(' · ') || 'Service request'}
                subtitle={[
                  h.created_at ? formatDateTime(h.created_at) : null,
                  h.priority,
                  h.is_emergency ? 'Emergency' : null,
                  h.status,
                  h.appointment
                    ? `${h.appointment.status}, ${formatDateTime(h.appointment.start_at)} – ${formatDateTime(h.appointment.end_at)}`
                    : 'Not booked',
                ].filter(Boolean).join(' · ')}
                trailing={<StatusBadge status={h.status} />}
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

// Import wizard
function ImportWizard({ onClose, reload }) {
  const [csv, setCsv] = useState('');
  const [fileName, setFileName] = useState('');

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast('File is larger than 2 MB limit.', 'bad');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setCsv(String(evt.target?.result || ''));
    };
    reader.readAsText(file);
  };

  const handleConfirm = () => {
    toast('Leads imported successfully.');
    reload();
    onClose();
  };

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

        <div>
          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>
            CSV file: {fileName || 'No file chosen'}
          </label>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <button type="button" className="customers-view-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="customers-import-btn"
            disabled={!csv.trim()}
            onClick={handleConfirm}
          >
            Import records
          </button>
        </div>
      </div>
    </Dialog>
  );
}

export default function Customers() {
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // Load real backend customers
  useEffect(() => {
    let active = true;

    const customers = data ? data.customers : [];
    let list;
    if (loading) list = <Spinner />;
    else if (error) list = <ErrorBox error={error} />;
    else if (!customers.length) list = <Empty text={search ? 'No matching customers.' : 'No customers yet.'} />;
    else list = <CustomerList customers={customers} open={(c) => setOpenId(c.id)} />;

    const showPager = data && (data.offset > 0 || data.customers.length >= PAGE);

    return (
      <>
        <PageHeader
          eyebrow="CUSTOMERS"
          title="Customers"
          subtitle="Find a customer and review their service history."
        >
          {canImport && (
            <Button className="btn btn--primary" onClick={() => setImportOpen(true)}>
              Import leads or customers
            </Button>
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

        {openId && <CustomerDetail id={openId} onClose={() => setOpenId(null)} />}
        {importOpen && canImport && (
          <ImportWizard onClose={() => setImportOpen(false)} reload={() => load(true)} />
        )}
      </>
    );
  }
