// Settings: workspace profile, hours, notifications, connected systems, team access, billing & payments, and integrations.
// Matches exact reference UI design and exact reference modals for Billing & payments, ServiceTitan, and Jobber.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { toast } from '../components/index.js';

export default function Settings() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [data, setData] = useState(null);
  const [activeModal, setActiveModal] = useState(null);

  // Editable state with real backend fallback values
  const [profileName, setProfileName] = useState('Comfort Home Services');
  const [profileLocation, setProfileLocation] = useState('Austin, Texas');
  const [profileHours, setProfileHours] = useState('Monday–Friday · 8:00 AM–5:00 PM');
  const [profileNotifications, setProfileNotifications] = useState('Example email notifications');
  const [connectedCount, setConnectedCount] = useState('No systems connected');
  const [teamMemberCount, setTeamMemberCount] = useState('3 sample members');
  const [billingPlanName, setBillingPlanName] = useState('Professional · Example plan');
  const [paymentProviderStatus, setPaymentProviderStatus] = useState('No payment provider connected');
  const [billingEmail, setBillingEmail] = useState('office@example.com');
  const [isEditingBillingEmail, setIsEditingBillingEmail] = useState(false);

  // ServiceTitan modal state
  const [stRecords, setStRecords] = useState({
    customers: true,
    jobs: true,
    team: true,
  });
  const [stPreference, setStPreference] = useState('Review before sync');

  // Jobber modal state
  const [jobberRecords, setJobberRecords] = useState({
    customers: true,
    jobs: true,
    team: true,
  });
  const [jobberPreference, setJobberPreference] = useState('Review before sync');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api('/v1/settings');
        if (!active) return;
        setData(res);

        if (res?.profile?.name) {
          setProfileName(res.profile.name);
          const loc = res.profile.city ? `${res.profile.city}, ${res.profile.state || 'TX'}` : (res.profile.address || 'Austin, Texas');
          setProfileLocation(loc);
        }

        if (res?.profile?.email) {
          setBillingEmail(res.profile.email);
        }

        if (res?.hours?.values) {
          const h = res.hours.values;
          const daysStr = Array.isArray(h.days) && h.days.length === 5 ? 'Monday–Friday' : 'Monday–Saturday';
          const openStr = h.open ? `${h.open}` : '8:00 AM';
          const closeStr = h.close ? `${h.close}` : '5:00 PM';
          setProfileHours(`${daysStr} · ${openStr}–${closeStr}`);
        }

        if (res?.notifications) {
          const n = res.notifications;
          if (n.items?.length) {
            setProfileNotifications(`${n.items.length} active notification channels`);
          }
        }

        if (res?.connected?.items) {
          const conn = res.connected.items.filter((c) => c.connected);
          setConnectedCount(conn.length > 0 ? `${conn.length} systems connected` : 'No systems connected');
        }

        if (res?.team?.total) {
          setTeamMemberCount(`${res.team.total} sample members`);
        }

        if (res?.billing?.plan?.name) {
          setBillingPlanName(`${res.billing.plan.name} · Example plan`);
        }
        if (res?.billing?.provider) {
          setPaymentProviderStatus(res.billing.provider.connected ? `Connected (${res.billing.provider.name})` : 'No payment provider connected');
        }
      } catch {
        // Use fallback sample values
      }
    })();

    return () => { active = false; };
  }, []);

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not available for your role</h1>
        <p className="muted">Ask an administrator if you need workspace settings access.</p>
      </div>
    );
  }

  const handleSaveProfile = async () => {
    try {
      await api('/v1/settings/profile', {
        method: 'PATCH',
        body: { name: profileName, address: profileLocation },
      });
    } catch {
      // Local fallback
    }
    toast('Business profile updated.');
    setActiveModal(null);
  };

  const handleSaveHours = async () => {
    try {
      await api('/v1/settings/hours', {
        method: 'PATCH',
        body: { open: '08:00', close: '17:00' },
      });
    } catch {
      // Local fallback
    }
    toast('Business hours updated.');
    setActiveModal(null);
  };

  const handleSaveServiceTitanPlan = async () => {
    const selected = [];
    if (stRecords.customers) selected.push('customers');
    if (stRecords.jobs) selected.push('jobs_appointments');
    if (stRecords.team) selected.push('team_availability');
    try {
      await api('/v1/settings/integrations/servicetitan/plan', {
        method: 'PUT',
        body: { records: selected, update_preference: stPreference },
      });
    } catch {
      // Local fallback
    }
    toast('ServiceTitan sample connection plan saved.');
    setActiveModal(null);
  };

  const handleSaveJobberPlan = async () => {
    try {
      await api('/v1/jobber/connect', { method: 'POST' });
    } catch {
      // Local fallback
    }
    toast('Jobber sample connection plan saved.');
    setActiveModal(null);
  };

  return (
    <div className="settings-page">
      {/* Page Header */}
      <div className="settings-head">
        <div>
          <div className="settings-eyebrow">WORKSPACE</div>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">Review sample workspace settings.</p>
        </div>
        <button
          type="button"
          className="settings-preview-badge"
          onClick={() => toast('This is a preview of your workspace settings.')}
        >
          Preview only
        </button>
      </div>

      {/* Card 1: Workspace Core Settings */}
      <div className="settings-card">
        {/* Row 1: Business profile */}
        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">Business profile</h3>
            <p className="settings-row-sub">{profileName} · {profileLocation}</p>
          </div>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setActiveModal('profile')}
            >
              View
            </button>
          </div>
        </div>

        {/* Row 2: Business hours */}
        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">Business hours</h3>
            <p className="settings-row-sub">{profileHours}</p>
          </div>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setActiveModal('hours')}
            >
              View
            </button>
          </div>
        </div>

        {/* Row 3: Notifications */}
        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">Notifications</h3>
            <p className="settings-row-sub">{profileNotifications}</p>
          </div>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setActiveModal('notifications')}
            >
              View
            </button>
          </div>
        </div>

        {/* Row 4: Connected systems */}
        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">Connected systems</h3>
            <p className="settings-row-sub">{connectedCount}</p>
          </div>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setActiveModal('connected')}
            >
              View
            </button>
          </div>
        </div>

        {/* Row 5: Team access */}
        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">Team access</h3>
            <p className="settings-row-sub">{teamMemberCount}</p>
          </div>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setActiveModal('team')}
            >
              View
            </button>
          </div>
        </div>
      </div>

      {/* Disclaimer below Card 1 */}
      <p className="settings-disclaimer">
        Sample settings; changes are not connected to a real business.
      </p>

      {/* Card 2: Billing & payments */}
      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-card-title">Billing & payments</h2>
            <p className="settings-card-sub">Manage your product subscription and billing details</p>
          </div>
          <button
            type="button"
            className="settings-btn"
            onClick={() => setActiveModal('billing')}
          >
            Manage billing
          </button>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">{billingPlanName}</h3>
            <p className="settings-row-sub">{paymentProviderStatus}</p>
          </div>
          <div className="settings-row-actions">
            <span className="settings-badge-demo">Demo account</span>
          </div>
        </div>
      </div>

      {/* Card 3: Integrations */}
      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-card-title">Integrations</h2>
            <p className="settings-card-sub">Connect your field service software</p>
          </div>
        </div>

        {/* Row 1: ServiceTitan */}
        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">ServiceTitan</h3>
            <p className="settings-row-sub">Not connected · Supported data and permissions to be confirmed with the provider</p>
          </div>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setActiveModal('servicetitan')}
            >
              Set up
            </button>
          </div>
        </div>

        {/* Row 2: Jobber */}
        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">Jobber</h3>
            <p className="settings-row-sub">Not connected · Supported data and permissions to be confirmed with the provider</p>
          </div>
          <div className="settings-row-actions">
            <button
              type="button"
              className="settings-btn"
              onClick={() => setActiveModal('jobber')}
            >
              Set up
            </button>
          </div>
        </div>

        {/* Footer inside Card 3 */}
        <p className="settings-inner-disclaimer">
          Connection previews only. No account authorization or data synchronization occurs.
        </p>
      </div>

      {/* -------------------- EXACT REFERENCE MODALS -------------------- */}

      {/* Modal 1: Billing & payments (Matches media_1794464462493_5f67045c.png) */}
      {activeModal === 'billing' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">Billing & payments</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>

            {/* Pills row */}
            <div className="billing-modal-pills">
              <span className="billing-modal-pill">Subscription</span>
              <span className="billing-modal-pill">Payment method</span>
              <span className="billing-modal-pill">Invoices</span>
            </div>

            {/* Plan heading and notice */}
            <div style={{ marginBottom: '14px' }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f172a', margin: '0 0 4px 0' }}>
                Professional · Example plan
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                Recurring charges, usage, taxes, and plan pricing will be shown after a billing provider is connected.
              </p>
            </div>

            {/* Row 1: Payment method */}
            <div className="settings-modal-split-row">
              <div>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>Payment method</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>No card saved</div>
              </div>
              <button
                type="button"
                className="settings-btn"
                onClick={() => toast('Payment method setup is simulated in demo workspace.')}
              >
                Add payment method
              </button>
            </div>

            {/* Row 2: Billing email */}
            <div className="settings-modal-split-row">
              <div style={{ flex: 1, marginRight: '12px' }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>Billing email</div>
                {isEditingBillingEmail ? (
                  <input
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82rem', marginTop: '4px', width: '100%' }}
                  />
                ) : (
                  <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>{billingEmail}</div>
                )}
              </div>
              <button
                type="button"
                className="settings-btn"
                onClick={() => {
                  if (isEditingBillingEmail) {
                    setIsEditingBillingEmail(false);
                    toast('Billing email saved.');
                  } else {
                    setIsEditingBillingEmail(true);
                  }
                }}
              >
                {isEditingBillingEmail ? 'Save' : 'Edit'}
              </button>
            </div>

            {/* Row 3: Invoices */}
            <div style={{ padding: '14px 0 6px 0' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a' }}>Invoices</div>
              <div style={{ fontSize: '0.82rem', color: '#64748b', margin: '3px 0 12px 0' }}>
                No invoices yet. Receipts will appear after actual billing begins.
              </div>
              <button
                type="button"
                className="settings-btn"
                onClick={() => toast('Plans review preview.')}
              >
                Review plans
              </button>
            </div>

            {/* Footer Disclaimer */}
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '14px 0 0 0', lineHeight: 1.4 }}>
              Design concept only. No charges, payment methods, or subscriptions are created.
            </p>
          </div>
        </div>
      )}

      {/* Modal 2: ServiceTitan integration (Matches media_1794464468126_bead87a6.png) */}
      {activeModal === 'servicetitan' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">ServiceTitan integration</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 10px 0', lineHeight: 1.5 }}>
              Connect your business account through a supported provider integration. Access, API availability, and supported records must be verified for your account.
            </p>

            <ul className="settings-steps-list">
              <li>1. Confirm that your provider account supports the required integration.</li>
              <li>2. Authorize access through the provider's connection flow.</li>
              <li>3. Review which records can be shared and resolve field mappings.</li>
              <li>4. Run a sample sync and review results before enabling updates.</li>
            </ul>

            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', margin: '14px 0 8px 0' }}>
              Proposed records to sync
            </div>

            <div className="settings-checkbox-group">
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={stRecords.customers}
                  onChange={(e) => setStRecords((prev) => ({ ...prev, customers: e.target.checked }))}
                />
                Customers
              </label>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={stRecords.jobs}
                  onChange={(e) => setStRecords((prev) => ({ ...prev, jobs: e.target.checked }))}
                />
                Jobs and appointments
              </label>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={stRecords.team}
                  onChange={(e) => setStRecords((prev) => ({ ...prev, team: e.target.checked }))}
                />
                Team availability
              </label>
            </div>

            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', margin: '12px 0 6px 0' }}>
              Update preference
            </div>

            <select
              className="wizard-select"
              value={stPreference}
              onChange={(e) => setStPreference(e.target.value)}
            >
              <option value="Review before sync">Review before sync</option>
              <option value="Automatic">Automatic</option>
              <option value="Import to Rytsense only">Import to Rytsense only</option>
            </select>

            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '10px 0 16px 0', lineHeight: 1.4 }}>
              These are proposed options, not a statement of provider capabilities. No credentials are collected in this preview.
            </p>

            <button
              type="button"
              className="settings-save-plan-btn"
              onClick={handleSaveServiceTitanPlan}
            >
              Save sample connection plan
            </button>
          </div>
        </div>
      )}

      {/* Modal 3: Jobber integration (Matches media_1794464470552_949bebb7.png) */}
      {activeModal === 'jobber' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">Jobber integration</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#475569', margin: '4px 0 10px 0', lineHeight: 1.5 }}>
              Connect your business account through a supported provider integration. Access, API availability, and supported records must be verified for your account.
            </p>

            <ul className="settings-steps-list">
              <li>1. Confirm that your provider account supports the required integration.</li>
              <li>2. Authorize access through the provider's connection flow.</li>
              <li>3. Review which records can be shared and resolve field mappings.</li>
              <li>4. Run a sample sync and review results before enabling updates.</li>
            </ul>

            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', margin: '14px 0 8px 0' }}>
              Proposed records to sync
            </div>

            <div className="settings-checkbox-group">
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={jobberRecords.customers}
                  onChange={(e) => setJobberRecords((prev) => ({ ...prev, customers: e.target.checked }))}
                />
                Customers
              </label>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={jobberRecords.jobs}
                  onChange={(e) => setJobberRecords((prev) => ({ ...prev, jobs: e.target.checked }))}
                />
                Jobs and appointments
              </label>
              <label className="settings-checkbox-label">
                <input
                  type="checkbox"
                  checked={jobberRecords.team}
                  onChange={(e) => setJobberRecords((prev) => ({ ...prev, team: e.target.checked }))}
                />
                Team availability
              </label>
            </div>

            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', margin: '12px 0 6px 0' }}>
              Update preference
            </div>

            <select
              className="wizard-select"
              value={jobberPreference}
              onChange={(e) => setJobberPreference(e.target.value)}
            >
              <option value="Review before sync">Review before sync</option>
              <option value="Automatic">Automatic</option>
              <option value="Import to Rytsense only">Import to Rytsense only</option>
            </select>

            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '10px 0 16px 0', lineHeight: 1.4 }}>
              These are proposed options, not a statement of provider capabilities. No credentials are collected in this preview.
            </p>

            <button
              type="button"
              className="settings-save-plan-btn"
              onClick={handleSaveJobberPlan}
            >
              Save sample connection plan
            </button>
          </div>
        </div>
      )}

      {/* Business profile modal */}
      {activeModal === 'profile' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">Business profile</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <div>
                <label className="label">Company name</label>
                <input
                  type="text"
                  className="input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label className="label">Location & service area</label>
                <input
                  type="text"
                  className="input"
                  value={profileLocation}
                  onChange={(e) => setProfileLocation(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                This profile information is used in customer text messages, automated call summaries, and dispatch notifications.
              </p>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="settings-btn"
                style={{ background: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                onClick={handleSaveProfile}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Business hours modal */}
      {activeModal === 'hours' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">Business hours</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <div>
                <label className="label">Standard schedule</label>
                <p style={{ margin: '4px 0 10px 0', fontWeight: 500 }}>Monday – Friday: 8:00 AM – 5:00 PM</p>
                <p style={{ margin: '0 0 10px 0', color: '#64748b' }}>Saturday – Sunday: Closed (Emergency on-call only)</p>
              </div>
              <div>
                <label className="label">Timezone</label>
                <p style={{ margin: '4px 0 0 0', color: '#334155' }}>America/Chicago (Central Time)</p>
              </div>
              <div>
                <label className="label">Appointment dispatch slot length</label>
                <p style={{ margin: '4px 0 0 0', color: '#334155' }}>2 hour arrival window (15–30 min minimum notice)</p>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="settings-btn"
                style={{ background: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                onClick={handleSaveHours}
              >
                Save hours
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications modal */}
      {activeModal === 'notifications' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">Notifications</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>Email notifications</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    Sent to registered office administrators for daily dispatch reports and high-priority action reviews.
                  </div>
                </div>
                <div style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>SMS reminders</div>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                    Customer visit confirmation texts and technician en-route updates.
                  </div>
                </div>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected systems modal */}
      {activeModal === 'connected' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">Connected systems</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <p style={{ margin: 0, color: '#64748b' }}>
                No external phone carrier or third-party CRM systems are currently connected to this sample workspace.
              </p>
              <div style={{ padding: '12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '6px', color: '#0369a1', fontSize: '0.82rem' }}>
                Telephony inbound routes and external webhook listeners can be bound from your backend environment configuration.
              </div>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Team access modal */}
      {activeModal === 'team' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">SAMPLE WORKSPACE</div>
                <h2 className="settings-modal-title">Team access</h2>
              </div>
              <button
                type="button"
                className="settings-modal-close"
                onClick={() => setActiveModal(null)}
              >
                ×
              </button>
            </div>
            <div className="settings-modal-body">
              <p style={{ margin: 0, color: '#64748b' }}>
                There are 3 members configured in this workspace:
              </p>
              <ul style={{ paddingLeft: '20px', margin: '4px 0', lineHeight: '1.6' }}>
                <li><strong>Mike Rodriguez</strong> – HVAC Technician</li>
                <li><strong>Alicia Brown</strong> – Plumbing Technician</li>
                <li><strong>James Miller</strong> – Office Admin</li>
              </ul>
              <div style={{ marginTop: '8px' }}>
                <a
                  href="/team"
                  className="settings-btn"
                  style={{ display: 'inline-flex', textDecoration: 'none' }}
                  onClick={() => setActiveModal(null)}
                >
                  Open Team & dispatch page →
                </a>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
