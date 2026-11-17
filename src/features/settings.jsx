// Settings: workspace profile, hours, alerts, connected systems, team access, billing & payments, and integrations.
// Wired to the real /v1/settings API throughout - no sample data: an empty section shows an honest
// "Nothing set up yet" state with the action to fill it in, never invented names or numbers.
import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { toast } from '../components/index.js';
import { JobberCard } from './leads.jsx';

const DAY_LABELS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];

const boxStyle = { padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' };
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', boxSizing: 'border-box' };

function sectionText(section, fallback) {
  if (section && typeof section.text === 'string' && section.text.trim()) return section.text;
  return fallback ?? null;
}

function profileSummaryText(profile) {
  if (!profile || !profile.name) return null;
  const loc = profile.address || profile.timezone || '';
  return sectionText(profile, loc ? `${profile.name} · ${loc}` : profile.name);
}

function hoursSummaryText(hours) {
  if (!hours) return null;
  const v = hours.values;
  let fallback = null;
  if (v) {
    const daysStr = Array.isArray(v.days) && v.days.length === 5 ? 'Monday–Friday' : (Array.isArray(v.days) && v.days.length ? 'Monday–Saturday' : null);
    if (daysStr || v.open) fallback = `${daysStr || 'Hours set'} · ${v.open || '8:00 AM'}–${v.close || '5:00 PM'}`;
  }
  return sectionText(hours, fallback);
}

function notificationsSummaryText(notifications) {
  if (!notifications) return null;
  const n = notifications.items?.length;
  return sectionText(notifications, n ? `${n} alert channel${n === 1 ? '' : 's'}` : null);
}

function connectedSummaryText(connected) {
  if (!connected) return null;
  const activeCount = (connected.items || []).filter((c) => c.connected).length;
  return sectionText(connected, activeCount ? `${activeCount} system${activeCount === 1 ? '' : 's'} connected` : null);
}

function teamSummaryText(team) {
  if (!team) return null;
  const total = team.total ?? team.count;
  const list = team.items || team.people || team.names || [];
  const names = list.map((p) => (typeof p === 'string' ? p : p?.name)).filter(Boolean);
  let fallback = null;
  if (total || names.length) {
    const shown = names.slice(0, 3).join(', ');
    const more = names.length > 3 ? ` +${names.length - 3} more` : '';
    const count = total ?? names.length;
    fallback = shown ? `${count} member${count === 1 ? '' : 's'} · ${shown}${more}` : `${count} member${count === 1 ? '' : 's'}`;
  }
  return sectionText(team, fallback);
}

function billingPlanText(billing) {
  if (!billing) return null;
  return sectionText(billing, billing.plan?.name || null);
}

function billingProviderText(billing) {
  if (!billing?.provider) return null;
  return billing.provider.connected ? `Connected (${billing.provider.name})` : 'No payment provider connected';
}

function personLine(person) {
  const trade = person.trade || person.department || (Array.isArray(person.skills) && person.skills[0]) || '';
  const role = person.text || person.role_label || person.role || '';
  return [trade, role].filter(Boolean).join(' · ') || person.email || person.phone || '';
}

/** A settings row: shows real data when there is any, or an honest empty state with the same action. */
function SettingsRow({ title, subtitle, actionLabel = 'View', onAction }) {
  const empty = !subtitle;
  return (
    <div className="settings-row">
      <div className="settings-row-info">
        <h3 className="settings-row-title">{title}</h3>
        <p className="settings-row-sub">{empty ? 'Nothing set up yet' : subtitle}</p>
      </div>
      <div className="settings-row-actions">
        <button type="button" className="settings-btn" onClick={onAction}>
          {empty ? 'Set up' : actionLabel}
        </button>
      </div>
    </div>
  );
}

export default function Settings() {
  const allowed = can('admin');
  const [load, setLoad] = useState({ status: 'loading', data: null, error: null });
  const [setup, setSetup] = useState(null);
  const [activeModal, setActiveModal] = useState(null);

  // Business profile
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // Business hours
  const [hoursForm, setHoursForm] = useState({
    days: ['mon', 'tue', 'wed', 'thu', 'fri'],
    open: '08:00',
    close: '17:00',
    slot_minutes: 120,
    min_notice_minutes: 60,
    max_days_ahead: 30,
  });
  const [hoursTimezone, setHoursTimezone] = useState('');
  const [hoursSaving, setHoursSaving] = useState(false);

  // Alerts (the Notifications row's edit action)
  const [alerts, setAlerts] = useState({ status: 'idle' });
  const [alertEmails, setAlertEmails] = useState([]);
  const [alertSms, setAlertSms] = useState([]);
  const [newAlertEmail, setNewAlertEmail] = useState('');
  const [newAlertSms, setNewAlertSms] = useState('');
  const [alertsSaving, setAlertsSaving] = useState(false);

  // Connected systems + calendar sharing
  const [calendar, setCalendar] = useState({ status: 'idle' });
  const [shareEmail, setShareEmail] = useState('');
  const [sharing, setSharing] = useState(false);

  // Team access
  const [teamList, setTeamList] = useState({ status: 'idle' });

  // ServiceTitan modal state (plan preview only - no real integration yet)
  const [stRecords, setStRecords] = useState({ customers: true, jobs: true, team: true });
  const [stPreference, setStPreference] = useState('Review before sync');

  const loadSettings = async (quiet) => {
    if (!quiet) setLoad((s) => ({ ...s, status: 'loading' }));
    try {
      const res = await api('/v1/settings');
      setLoad({ status: 'ready', data: res, error: null });
      setProfileNameInput(res?.profile?.name || '');
      if (res?.hours?.values) {
        const h = res.hours.values;
        setHoursForm((prev) => ({
          days: Array.isArray(h.days) && h.days.length ? h.days : prev.days,
          open: h.open || prev.open,
          close: h.close || prev.close,
          slot_minutes: h.slot_minutes ?? prev.slot_minutes,
          min_notice_minutes: h.min_notice_minutes ?? prev.min_notice_minutes,
          max_days_ahead: h.max_days_ahead ?? prev.max_days_ahead,
        }));
        if (h.timezone) setHoursTimezone(h.timezone);
      }
    } catch (error) {
      setLoad({ status: error.status === 403 ? 'forbidden' : 'error', data: null, error });
    }
  };

  useEffect(() => {
    if (!allowed) return;
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!allowed) return undefined;
    let active = true;
    api('/v1/settings/setup').then((res) => { if (active) setSetup(res); }).catch(() => { if (active) setSetup(null); });
    return () => { active = false; };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not available for your role</h1>
        <p className="muted">Ask an administrator if you need workspace settings access.</p>
      </div>
    );
  }

  if (load.status === 'forbidden') {
    return (
      <div className="settings-page">
        <div className="settings-card" style={{ padding: 20 }}>
          <h1 style={{ margin: '0 0 6px 0' }}>Settings are for admins</h1>
          <p className="muted" style={{ margin: 0 }}>Ask an administrator to open this page.</p>
        </div>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="settings-page">
        <div className="settings-card" style={{ padding: 20 }}>
          <h1 style={{ margin: '0 0 6px 0' }}>Could not load settings</h1>
          <p className="muted" style={{ margin: '0 0 12px 0' }}>{load.error?.message}</p>
          <button type="button" className="settings-btn" onClick={() => loadSettings()}>Retry</button>
        </div>
      </div>
    );
  }

  if (load.status === 'loading') {
    return <div className="settings-page"><p className="muted">Loading settings…</p></div>;
  }

  const data = load.data || {};
  const profile = data.profile || null;
  const hours = data.hours || null;
  const notifications = data.notifications || null;
  const connected = data.connected || null;
  const team = data.team || null;
  const billing = data.billing || null;

  const handleSaveProfile = async () => {
    const name = profileNameInput.trim();
    if (!name) { toast('Enter a company name.', 'bad'); return; }
    setProfileSaving(true);
    try {
      await api('/v1/settings/profile', { method: 'PATCH', body: { name } });
    } catch (error) {
      toast(error.message, 'bad');
      setProfileSaving(false);
      return;
    }
    toast('Business profile updated.');
    setProfileSaving(false);
    setActiveModal(null);
    loadSettings(true);
  };

  const handleSaveHours = async () => {
    setHoursSaving(true);
    try {
      await api('/v1/settings/hours', {
        method: 'PATCH',
        body: {
          days: hoursForm.days,
          open: hoursForm.open,
          close: hoursForm.close,
          slot_minutes: Number(hoursForm.slot_minutes),
          min_notice_minutes: Number(hoursForm.min_notice_minutes),
          max_days_ahead: Number(hoursForm.max_days_ahead),
        },
      });
    } catch (error) {
      toast(error.message, 'bad');
      setHoursSaving(false);
      return;
    }
    toast('Business hours updated.');
    setHoursSaving(false);
    setActiveModal(null);
    loadSettings(true);
  };

  const openAlerts = async () => {
    setActiveModal('alerts');
    setAlerts({ status: 'loading' });
    try {
      const res = await api('/v1/settings/alerts');
      setAlertEmails(Array.isArray(res?.emails) ? res.emails : []);
      setAlertSms(Array.isArray(res?.sms) ? res.sms : []);
      setAlerts({ status: 'ready' });
    } catch (error) {
      setAlerts({ status: 'error', error });
    }
  };

  const addAlertEmail = () => {
    const v = newAlertEmail.trim();
    if (!v) return;
    setAlertEmails((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setNewAlertEmail('');
  };
  const addAlertSms = () => {
    const v = newAlertSms.trim();
    if (!v) return;
    setAlertSms((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setNewAlertSms('');
  };

  const saveAlerts = async () => {
    setAlertsSaving(true);
    try {
      await api('/v1/settings/alerts', { method: 'PUT', body: { emails: alertEmails, sms: alertSms } });
    } catch (error) {
      toast(error.message, 'bad');
      setAlertsSaving(false);
      return;
    }
    toast('Alerts updated.');
    setAlertsSaving(false);
    setActiveModal(null);
    loadSettings(true);
  };

  const openConnected = async () => {
    setActiveModal('connected');
    setCalendar({ status: 'loading' });
    try {
      const res = await api('/v1/settings/calendar');
      setCalendar({ status: 'ready', data: res });
    } catch (error) {
      setCalendar({ status: 'error', error });
    }
  };

  const shareCalendar = async () => {
    const email = shareEmail.trim();
    if (!email) { toast('Enter an email to share with.', 'bad'); return; }
    setSharing(true);
    try {
      const res = await api('/v1/settings/calendar/share', { method: 'POST', body: { email } });
      toast('Calendar shared.');
      setShareEmail('');
      setCalendar({ status: 'ready', data: res || calendar.data });
    } catch (error) {
      toast(error.message, 'bad');
    } finally {
      setSharing(false);
    }
  };

  const openTeam = async () => {
    setActiveModal('team');
    setTeamList({ status: 'loading' });
    try {
      const res = await api('/v1/team');
      setTeamList({ status: 'ready', people: Array.isArray(res?.people) ? res.people : [] });
    } catch (error) {
      setTeamList({ status: 'error', error });
    }
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
    } catch (error) {
      toast(error.message, 'bad');
      return;
    }
    toast('ServiceTitan connection plan saved.');
    setActiveModal(null);
  };

  return (
    <div className="settings-page">
      {/* Page Header */}
      <div className="settings-head">
        <div>
          <div className="settings-eyebrow">WORKSPACE</div>
          <h1 className="settings-title">Settings</h1>
          <p className="settings-subtitle">Manage your workspace settings.</p>
        </div>
      </div>

      {/* Finish setting up */}
      {setup && !setup.complete && Array.isArray(setup.steps) && setup.steps.length ? (
        <div className="settings-card" style={{ padding: '16px 20px', marginBottom: 16 }}>
          <h2 className="settings-card-title" style={{ margin: '0 0 10px 0' }}>Finish setting up</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {setup.steps.map((step, i) => {
              const label = step.label || step.title || step.text || `Step ${i + 1}`;
              const href = step.href || step.link || step.url;
              return (
                <div key={step.key || step.id || label} style={{ ...boxStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span>
                    <span style={{ color: step.done ? '#16a34a' : '#94a3b8', marginRight: 8, fontWeight: 700 }}>
                      {step.done ? '✓' : '○'}
                    </span>
                    {label}
                  </span>
                  {!step.done && href ? (
                    <a className="settings-btn" href={href}>Go</a>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Card 1: Workspace Core Settings */}
      <div className="settings-card">
        <SettingsRow title="Business profile" subtitle={profileSummaryText(profile)} onAction={() => setActiveModal('profile')} />
        <SettingsRow title="Business hours" subtitle={hoursSummaryText(hours)} onAction={() => setActiveModal('hours')} />
        <SettingsRow title="Notifications" subtitle={notificationsSummaryText(notifications)} onAction={openAlerts} />
        <SettingsRow title="Connected systems" subtitle={connectedSummaryText(connected)} onAction={openConnected} />
        <SettingsRow title="Team access" subtitle={teamSummaryText(team)} onAction={openTeam} />
      </div>

      {/* Card 2: Billing & payments */}
      <div className="settings-card">
        <div className="settings-card-head">
          <div>
            <h2 className="settings-card-title">Billing & payments</h2>
            <p className="settings-card-sub">Manage your product subscription and billing details</p>
          </div>
          <a className="settings-btn" href="/usage">Manage billing</a>
        </div>

        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">{billingPlanText(billing) || 'Nothing set up yet'}</h3>
            <p className="settings-row-sub">{billingProviderText(billing) || 'No payment provider connected'}</p>
          </div>
          <div className="settings-row-actions">
            <a className="settings-btn" href="/usage">{billing ? 'View plan & usage' : 'Set up'}</a>
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

        <div className="settings-row">
          <div className="settings-row-info">
            <h3 className="settings-row-title">ServiceTitan</h3>
            <p className="settings-row-sub">Not connected · Supported data and permissions to be confirmed with the provider</p>
          </div>
          <div className="settings-row-actions">
            <button type="button" className="settings-btn" onClick={() => setActiveModal('servicetitan')}>
              Set up
            </button>
          </div>
        </div>

        <p className="settings-inner-disclaimer">
          ServiceTitan connection preview only. No account authorization or data synchronization occurs yet.
        </p>
      </div>

      <div style={{ marginTop: '16px' }}>
        <JobberCard />
      </div>

      {/* -------------------- MODALS -------------------- */}

      {activeModal === 'servicetitan' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">INTEGRATIONS</div>
                <h2 className="settings-modal-title">ServiceTitan integration</h2>
              </div>
              <button type="button" className="settings-modal-close" onClick={() => setActiveModal(null)}>×</button>
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
                <input type="checkbox" checked={stRecords.customers} onChange={(e) => setStRecords((prev) => ({ ...prev, customers: e.target.checked }))} />
                Customers
              </label>
              <label className="settings-checkbox-label">
                <input type="checkbox" checked={stRecords.jobs} onChange={(e) => setStRecords((prev) => ({ ...prev, jobs: e.target.checked }))} />
                Jobs and appointments
              </label>
              <label className="settings-checkbox-label">
                <input type="checkbox" checked={stRecords.team} onChange={(e) => setStRecords((prev) => ({ ...prev, team: e.target.checked }))} />
                Team availability
              </label>
            </div>

            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#334155', margin: '12px 0 6px 0' }}>
              Update preference
            </div>

            <select className="wizard-select" value={stPreference} onChange={(e) => setStPreference(e.target.value)}>
              <option value="Review before sync">Review before sync</option>
              <option value="Automatic">Automatic</option>
              <option value="Import to Rytsense only">Import to Rytsense only</option>
            </select>

            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '10px 0 16px 0', lineHeight: 1.4 }}>
              These are proposed options, not a statement of provider capabilities. No credentials are collected in this preview.
            </p>

            <button type="button" className="settings-save-plan-btn" onClick={handleSaveServiceTitanPlan}>
              Save connection plan
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
                <div className="settings-modal-eyebrow">WORKSPACE</div>
                <h2 className="settings-modal-title">Business profile</h2>
              </div>
              <button type="button" className="settings-modal-close" onClick={() => setActiveModal(null)}>×</button>
            </div>
            <div className="settings-modal-body">
              <div>
                <label className="label">Company name</label>
                <input type="text" className="input" value={profileNameInput} onChange={(e) => setProfileNameInput(e.target.value)} style={inputStyle} />
              </div>
              {profile?.name_in_texts ? (
                <div>
                  <label className="label">How we say your name in texts</label>
                  <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{profile.name_in_texts}</p>
                </div>
              ) : null}
              {profile?.office?.phone || profile?.office?.email ? (
                <div>
                  <label className="label">Office contact</label>
                  <p style={{ margin: '4px 0 0 0', color: '#334155' }}>
                    {[profile.office?.phone, profile.office?.email].filter(Boolean).join(' · ')}
                  </p>
                </div>
              ) : null}
              {profile?.address ? (
                <div>
                  <label className="label">Address</label>
                  <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{profile.address}</p>
                </div>
              ) : null}
              {profile?.timezone ? (
                <div>
                  <label className="label">Timezone</label>
                  <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{profile.timezone}</p>
                </div>
              ) : null}
              <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                The company name is used in customer text messages, automated call summaries, and dispatch notifications.
              </p>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>Cancel</button>
              <button
                type="button"
                className="settings-btn"
                style={{ background: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                disabled={profileSaving}
                onClick={handleSaveProfile}
              >
                {profileSaving ? 'Saving…' : 'Save changes'}
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
                <div className="settings-modal-eyebrow">WORKSPACE</div>
                <h2 className="settings-modal-title">Business hours</h2>
              </div>
              <button type="button" className="settings-modal-close" onClick={() => setActiveModal(null)}>×</button>
            </div>
            <div className="settings-modal-body">
              <div>
                <label className="label">Open days</label>
                <div className="row wrap" style={{ gap: 10, marginTop: 4 }}>
                  {DAY_LABELS.map(([id, text]) => (
                    <label key={id} className="settings-checkbox-label">
                      <input
                        type="checkbox"
                        checked={hoursForm.days.includes(id)}
                        onChange={(e) => setHoursForm((prev) => ({
                          ...prev,
                          days: e.target.checked ? [...prev.days, id] : prev.days.filter((d) => d !== id),
                        }))}
                      />
                      {text}
                    </label>
                  ))}
                </div>
              </div>
              <div className="row wrap" style={{ gap: 16 }}>
                <div>
                  <label className="label">Opens</label>
                  <input type="time" value={hoursForm.open} onChange={(e) => setHoursForm((prev) => ({ ...prev, open: e.target.value }))} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>
                <div>
                  <label className="label">Closes</label>
                  <input type="time" value={hoursForm.close} onChange={(e) => setHoursForm((prev) => ({ ...prev, close: e.target.value }))} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                </div>
              </div>
              <div>
                <label className="label">Appointment dispatch slot length (minutes)</label>
                <input type="number" min={15} step={15} value={hoursForm.slot_minutes} onChange={(e) => setHoursForm((prev) => ({ ...prev, slot_minutes: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label className="label">Minimum notice (minutes)</label>
                <input type="number" min={0} step={15} value={hoursForm.min_notice_minutes} onChange={(e) => setHoursForm((prev) => ({ ...prev, min_notice_minutes: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label className="label">Book up to how many days ahead</label>
                <input type="number" min={1} value={hoursForm.max_days_ahead} onChange={(e) => setHoursForm((prev) => ({ ...prev, max_days_ahead: e.target.value }))} style={inputStyle} />
              </div>
              {hoursTimezone ? (
                <div>
                  <label className="label">Timezone</label>
                  <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{hoursTimezone}</p>
                </div>
              ) : null}
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>Cancel</button>
              <button
                type="button"
                className="settings-btn"
                style={{ background: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                disabled={hoursSaving}
                onClick={handleSaveHours}
              >
                {hoursSaving ? 'Saving…' : 'Save hours'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications (alerts) modal */}
      {activeModal === 'alerts' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">WORKSPACE</div>
                <h2 className="settings-modal-title">Notifications</h2>
              </div>
              <button type="button" className="settings-modal-close" onClick={() => setActiveModal(null)}>×</button>
            </div>
            <div className="settings-modal-body">
              {alerts.status === 'loading' ? <p className="muted">Loading…</p> : null}
              {alerts.status === 'error' ? <p style={{ color: '#b91c1c' }}>{alerts.error?.message}</p> : null}
              {alerts.status === 'ready' ? (
                <>
                  <div>
                    <label className="label">Email alerts</label>
                    {alertEmails.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
                        {alertEmails.map((e) => (
                          <div key={e} style={{ ...boxStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{e}</span>
                            <button type="button" className="settings-btn" onClick={() => setAlertEmails((prev) => prev.filter((x) => x !== e))}>Remove</button>
                          </div>
                        ))}
                      </div>
                    ) : <p className="muted small" style={{ margin: '4px 0' }}>No email alerts yet.</p>}
                    <div className="row" style={{ gap: 8, marginTop: 6 }}>
                      <input type="email" placeholder="name@example.com" value={newAlertEmail} onChange={(e) => setNewAlertEmail(e.target.value)} style={inputStyle} />
                      <button type="button" className="settings-btn" onClick={addAlertEmail}>Add</button>
                    </div>
                  </div>
                  <div>
                    <label className="label">SMS alerts</label>
                    {alertSms.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
                        {alertSms.map((s) => (
                          <div key={s} style={{ ...boxStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>{s}</span>
                            <button type="button" className="settings-btn" onClick={() => setAlertSms((prev) => prev.filter((x) => x !== s))}>Remove</button>
                          </div>
                        ))}
                      </div>
                    ) : <p className="muted small" style={{ margin: '4px 0' }}>No SMS alerts yet.</p>}
                    <div className="row" style={{ gap: 8, marginTop: 6 }}>
                      <input type="tel" placeholder="(512) 555-0199" value={newAlertSms} onChange={(e) => setNewAlertSms(e.target.value)} style={inputStyle} />
                      <button type="button" className="settings-btn" onClick={addAlertSms}>Add</button>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>Cancel</button>
              <button
                type="button"
                className="settings-btn"
                style={{ background: '#0284c7', color: '#ffffff', borderColor: '#0284c7' }}
                disabled={alerts.status !== 'ready' || alertsSaving}
                onClick={saveAlerts}
              >
                {alertsSaving ? 'Saving…' : 'Save alerts'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Connected systems modal (+ calendar sharing) */}
      {activeModal === 'connected' && (
        <div className="settings-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="settings-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="settings-modal-head">
              <div>
                <div className="settings-modal-eyebrow">WORKSPACE</div>
                <h2 className="settings-modal-title">Connected systems</h2>
              </div>
              <button type="button" className="settings-modal-close" onClick={() => setActiveModal(null)}>×</button>
            </div>
            <div className="settings-modal-body">
              {(connected?.items || []).length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {connected.items.map((c) => (
                    <div key={c.id || c.name} style={{ ...boxStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{c.name}</span>
                      <span style={{ color: c.connected ? '#16a34a' : '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                        {c.connected ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, color: '#64748b' }}>No external systems are connected yet.</p>
              )}

              <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 8, paddingTop: 12 }}>
                <label className="label">Share your calendar</label>
                {calendar.status === 'loading' ? <p className="muted">Loading…</p> : null}
                {calendar.status === 'error' ? <p style={{ color: '#b91c1c' }}>{calendar.error?.message}</p> : null}
                {calendar.status === 'ready' ? (
                  <>
                    {calendar.data?.text ? <p className="muted small" style={{ margin: '4px 0 8px' }}>{calendar.data.text}</p> : null}
                    {Array.isArray(calendar.data?.shared_with) && calendar.data.shared_with.length ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
                        {calendar.data.shared_with.map((e) => (
                          <div key={e} style={boxStyle}>{e}</div>
                        ))}
                      </div>
                    ) : <p className="muted small" style={{ margin: '4px 0' }}>Not shared with anyone yet.</p>}
                    <div className="row" style={{ gap: 8, marginTop: 6 }}>
                      <input type="email" placeholder="name@example.com" value={shareEmail} onChange={(e) => setShareEmail(e.target.value)} style={inputStyle} />
                      <button type="button" className="settings-btn" disabled={sharing} onClick={shareCalendar}>
                        {sharing ? 'Sharing…' : 'Share'}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>Close</button>
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
                <div className="settings-modal-eyebrow">WORKSPACE</div>
                <h2 className="settings-modal-title">Team access</h2>
              </div>
              <button type="button" className="settings-modal-close" onClick={() => setActiveModal(null)}>×</button>
            </div>
            <div className="settings-modal-body">
              {teamList.status === 'loading' ? <p className="muted">Loading…</p> : null}
              {teamList.status === 'error' ? <p style={{ color: '#b91c1c' }}>{teamList.error?.message}</p> : null}
              {teamList.status === 'ready' ? (
                teamList.people.length ? (
                  <>
                    <p style={{ margin: 0, color: '#64748b' }}>
                      {teamList.people.length} member{teamList.people.length === 1 ? '' : 's'} in this workspace:
                    </p>
                    <ul style={{ paddingLeft: '20px', margin: '4px 0', lineHeight: '1.6' }}>
                      {teamList.people.map((p) => (
                        <li key={p.id || p.email || p.name}><strong>{p.name}</strong>{personLine(p) ? ` – ${personLine(p)}` : ''}</li>
                      ))}
                    </ul>
                  </>
                ) : <p style={{ margin: 0, color: '#64748b' }}>No one is set up yet.</p>
              ) : null}
              <div style={{ marginTop: '8px' }}>
                <a href="/team" className="settings-btn" style={{ display: 'inline-flex', textDecoration: 'none' }} onClick={() => setActiveModal(null)}>
                  Open Team & dispatch page →
                </a>
              </div>
            </div>
            <div className="settings-modal-footer">
              <button type="button" className="settings-btn" onClick={() => setActiveModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
