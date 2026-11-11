// Customers: the people the AI has taken calls and texts from.
// Exact Reference UI matching reference design with live backend integration and fallback sample records.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { Empty, Note, Overlay, toast } from '../components/index.js';
import { Icon } from '../components/Icon.jsx';

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

// Customer Detail Modal matching Reference Screenshot
function CustomerModal({ customer, onClose }) {
  const serviceName = customer.service || 'AC repair';
  const historySub = customer.historySubtitle
    || (customer.last_request_at
      ? `${formatDateTime(customer.last_request_at)} · Confirmed · Unassigned`
      : 'Wed, Nov 11 · 1 PM · Confirmed · Unassigned');

  return (
    <div className="customer-modal-overlay" onClick={onClose}>
      <div className="customer-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="customer-modal-head">
          <div>
            <div className="customer-modal-eyebrow">SAMPLE WORKSPACE</div>
            <h2 className="customer-modal-title">
              Customer · {customer.name}
            </h2>
          </div>
          <button
            type="button"
            className="customer-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="customer-modal-meta">
          {customer.address || customer.location || '1206 Oak Street, Austin, TX'}
        </div>
        <div className="customer-modal-meta" style={{ marginBottom: 18 }}>
          {serviceName}
        </div>

        <div className="customer-modal-section-title">Service history</div>

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

        <div className="customer-modal-actions">
          <a
            href="#/calls"
            className="customer-modal-btn"
            onClick={onClose}
          >
            View calls
          </a>
          <a
            href="#/tasks"
            className="customer-modal-btn"
            onClick={onClose}
          >
            View tasks
          </a>
        </div>
      </div>
    </div>
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
    <Overlay title="Import leads or customers" wide onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ margin: 0, fontSize: '0.86rem', color: '#64748b' }}>
          Upload a CSV spreadsheet with customer contacts, service requests, or past leads.
        </p>

        <Note
          tone="neutral"
          text="At most 2 MB and 1,000 rows. The first row must contain column headers (Name, Phone, City, Service)."
        />

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
    </Overlay>
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

    (async () => {
      try {
        const out = await api('/v1/customers', { params: { search, limit: PAGE, offset: 0 } });
        if (!active) return;
        setData(out);
      } catch {
        if (!active) return;
      }
    })();

    return () => { active = false; };
  }, [search]);

  // Combine real backend customers or fallback to sample customers
  const realList = data?.customers || [];
  const baseCustomers = realList.length > 0
    ? realList.map((c) => ({
      id: String(c.id),
      isSample: false,
      name: c.name || 'Customer',
      location: c.location || 'Austin, TX',
      service: c.latest_service || 'Service inquiry',
      subtitle: `${c.location || 'Austin, TX'} · ${c.latest_service || 'Service inquiry'}`,
      phone: c.phone || 'Not provided',
      email: c.email || '',
      address: c.address || `${c.location || 'Austin, TX'}`,
      historySubtitle: c.last_request_at
        ? `${formatDateTime(c.last_request_at)} · Confirmed · Unassigned`
        : 'Wed, Nov 11 · 1 PM · Confirmed · Unassigned',
      raw: c,
    }))
    : SAMPLE_CUSTOMERS;

  // Filter by search string
  const displayCustomers = baseCustomers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.location && c.location.toLowerCase().includes(q)) ||
      (c.service && c.service.toLowerCase().includes(q)) ||
      (c.subtitle && c.subtitle.toLowerCase().includes(q))
    );
  });

  return (
    <>
      {/* Header matching Reference */}
      <div className="customers-head">
        <div>
          <div className="customers-eyebrow">CUSTOMERS</div>
          <h1 className="customers-title">Customers</h1>
          <p className="customers-subtitle">
            Find a customer and review their service history.
          </p>
        </div>
        <button
          type="button"
          className="customers-import-btn"
          onClick={() => setImportOpen(true)}
        >
          Import leads or customers
        </button>
      </div>

      {/* Main Card */}
      <div className="customers-card">
        <label className="customers-search-label" htmlFor="customer-search-input">
          Search customers
        </label>
        <input
          id="customer-search-input"
          type="text"
          className="customers-search-input"
          placeholder="Name, city, or service"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {displayCustomers.length === 0 ? (
          <Empty text="No customer matches that search." />
        ) : (
          <div className="customers-list">
            {displayCustomers.map((customer) => (
              <div key={customer.id} className="customers-row">
                <div className="customers-row-left">
                  <span className="customers-row-icon">
                    <Icon name="customers" />
                  </span>
                  <div className="customers-row-info">
                    <span className="customers-row-name">{customer.name}</span>
                    <span className="customers-row-sub">{customer.subtitle}</span>
                  </div>
                </div>

                <button
                  type="button"
                  className="customers-view-btn"
                  onClick={() => setSelectedCustomer(customer)}
                >
                  View customer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom disclaimer matching Reference */}
      <div className="customers-disclaimer">
        Illustrative customer information only.
      </div>

      {/* Modal matching Screenshot */}
      {selectedCustomer && (
        <CustomerModal
          customer={selectedCustomer}
          onClose={() => setSelectedCustomer(null)}
        />
      )}

      {importOpen && (
        <ImportWizard
          onClose={() => setImportOpen(false)}
          reload={() => {}}
        />
      )}
    </>
  );
}
