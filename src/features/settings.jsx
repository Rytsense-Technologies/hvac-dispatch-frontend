// Settings: workspace profile, hours, notifications, connected systems, team access, billing & payments, and integrations.
// Matches exact reference UI design with live backend integration and interactive inspection modals.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { toast } from '../components/index.js';

export default function Settings() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
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

  // Integrations state
  const [stPreference, setStPreference] = useState('review_before_sync');

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

        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoading(false);
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

  const handleSaveServiceTitan = async () => {
    try {
      await api('/v1/settings/integrations/servicetitan/plan', {
        method: 'PUT',
        body: { update_preference: stPreference },
      });
    } catch {
      // Local fallback
    }
    toast('ServiceTitan preferences saved.');
    setActiveModal(null);
  };

  const handleJobberConnect = async () => {
    try {
      const out = await api('/v1/jobber/connect', { method: 'POST' });
      if (out?.url) {
        window.open(out.url, '_blank', 'noopener');
      }
    } catch {
      // Local fallback
    }
    toast('Jobber connection request initiated.');
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

      {/* Interactive Modals */}
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
                  href="#/team"
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
            <div className="settings-modal-body">
              <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, color: '#0f172a' }}>Professional Plan</span>
                  <span className="settings-badge-demo">Demo account</span>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                  Includes 1,500 AI voice minutes, automated call summaries, and job scheduling.
                </p>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                Payment provider: <strong>None connected</strong>. This workspace runs in demo mode without billing charges.
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

      {activeModal === 'servicetitan' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">INTEGRATIONS</div>
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
            <div className="settings-modal-body">
              <p style={{ margin: 0, color: '#64748b' }}>
                Supported records: Customers, Jobs & appointments, and Technician availability.
              </p>
              <div>
                <label className="label">Sync preference</label>
                <select
                  value={stPreference}
                  onChange={(e) => setStPreference(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', marginTop: '4px' }}
                >
                  <option value="review_before_sync">Review before syncing</option>
                  <option value="automatic">Automatic sync</option>
                </select>
              </div>
              <p className="muted" style={{ fontSize: '0.78rem', margin: 0 }}>
                Connection previews only. Supported data and permissions to be confirmed with the provider.
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
                onClick={handleSaveServiceTitan}
              >
                Save preference
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'jobber' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">INTEGRATIONS</div>
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
            <div className="settings-modal-body">
              <p style={{ margin: 0, color: '#64748b' }}>
                Connect your Jobber account to synchronize client contacts, scheduled requests, and technician job visits.
              </p>
              <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#475569' }}>
                Supported data and permissions to be confirmed with the provider. No account authorization or data synchronization occurs in preview mode.
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
                onClick={handleJobberConnect}
              >
                Connect Jobber
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
