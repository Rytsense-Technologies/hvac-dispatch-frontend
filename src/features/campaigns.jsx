// Campaigns: Outbound campaigns and Inbound workflows matching exact reference UI designs.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { toast } from '../components/index.js';

const STATUS_TABS = ['All', 'Draft', 'Scheduled', 'Active', 'Paused', 'Completed', 'Canceled'];

const WIZARD_STEPS = [
  '1. Basics',
  '2. Greeting & knowledge',
  '3. Hours',
  '4. Caller & booking',
  '5. Handoff & fallback',
  '6. Test & review',
];

const SAMPLE_CAMPAIGNS = [
  {
    id: 'sample_old_ac',
    name: 'Old AC replacement leads',
    status: 'active',
    objective: 'Identify interested homeowners and arrange a callback.',
    audience: { count: 120, label: 'past inquiries', text: '120 past inquiries' },
    progress: { contacted: 42, total: 120, text: '42 / 120 contacted' },
    script: 'Hi, we are following up on your earlier AC replacement inquiry. Would you like to discuss your options?',
    interested: [
      {
        name: 'Taylor Green',
        interest: 'Interested in a replacement',
        status: 'Interested',
        owner: 'Office team',
        summary: 'Interested in a replacement · Office callback requested',
      },
    ],
  },
  {
    id: 'sample_spring_maint',
    name: 'Spring maintenance follow-up',
    status: 'active',
    objective: 'Reconnect with past customers about maintenance.',
    audience: { count: 80, label: 'past customers', text: '80 past customers' },
    progress: { contacted: 44, total: 80, text: '44 / 80 contacted' },
    script: 'Would you like to schedule your next maintenance visit?',
    interested: [
      {
        name: 'Jordan Lee',
        interest: 'Interested in maintenance',
        status: 'Interested',
        owner: 'Office team',
        summary: 'Interested in maintenance · Schedule a callback',
      },
    ],
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

export default function Campaigns() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [mainTab, setMainTab] = useState('outbound'); // 'outbound' | 'inbound'
  const [inboundMode, setInboundMode] = useState('overview'); // 'overview' | 'create'
  const [wizardStep, setWizardStep] = useState(1);
  const [statusFilter, setStatusFilter] = useState('All');
  const [campaigns, setCampaigns] = useState(SAMPLE_CAMPAIGNS);
  const [inboundWorkflows, setInboundWorkflows] = useState([]);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [showCreateCampaignModal, setShowCreateCampaignModal] = useState(false);

  // Inbound Workflow Wizard Form state
  const [wfName, setWfName] = useState('');
  const [wfBusinessName, setWfBusinessName] = useState('Rytsense Home Services');
  const [wfNumber, setWfNumber] = useState('+1 202-555-0180 · Sample / unverified');
  const [wfCoworker, setWfCoworker] = useState('AI Receptionist');
  const [wfGreeting, setWfGreeting] = useState('Thank you for calling Rytsense Home Services. How can I help you today?');
  const [wfServices, setWfServices] = useState('HVAC repair, preventative maintenance, plumbing diagnostics');
  const [wfHours, setWfHours] = useState('Monday–Friday · 8:00 AM–5:00 PM');
  const [wfAfterHours, setWfAfterHours] = useState('emergency');
  const [wfBookingSlot, setWfBookingSlot] = useState('2 hours');
  const [wfHandoffNumber, setWfHandoffNumber] = useState('(512) 555-0199');

  // Outbound Create Form state
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignKind, setNewCampaignKind] = useState('speed_to_lead');
  const [newCampaignObjective, setNewCampaignObjective] = useState('');
  const [newCampaignAudience, setNewCampaignAudience] = useState('');
  const [newCampaignScript, setNewCampaignScript] = useState('');
  const [newCampaignStatus, setNewCampaignStatus] = useState('Draft');

  const initialized = useRef(false);

  // Fetch real data from backend
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api('/v1/leads/campaigns');
        if (!active) return;
        const liveItems = Array.isArray(res?.campaigns) ? res.campaigns : [];
        if (liveItems.length > 0 && !initialized.current) {
          const mapped = liveItems.map((c) => ({
            id: String(c.id),
            name: c.name || 'Untitled Campaign',
            status: (c.status || 'draft').toLowerCase(),
            objective: c.objective || '',
            audience: c.audience || { text: 'Target audience' },
            progress: c.progress || { text: 'Ready' },
            script: c.script || c.script_note || '',
            interested: Array.isArray(c.interested) ? c.interested : [],
          }));
          setCampaigns(mapped);
          initialized.current = true;
        }
      } catch (err) {
        // Fallback to SAMPLE_CAMPAIGNS
      }

      try {
        const settingsRes = await api('/v1/settings');
        if (!active) return;
        if (settingsRes?.profile?.name) {
          setWfBusinessName(settingsRes.profile.name);
        }
      } catch {
        // Use default business name
      }
    })();

    return () => { active = false; };
  }, []);

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not available for your role</h1>
        <p className="muted">Ask an administrator if you need campaigns access.</p>
      </div>
    );
  }

  // Filter outbound campaigns by selected status tab
  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter === 'All') return true;
    return (c.status || '').toLowerCase() === statusFilter.toLowerCase();
  });

  const handleCreateCampaignSubmit = async (e) => {
    e.preventDefault();
    if (!newCampaignName.trim()) {
      toast('Please enter a campaign name.', 'bad');
      return;
    }

    const newObj = {
      id: `camp_${Date.now()}`,
      name: newCampaignName.trim(),
      status: newCampaignStatus.toLowerCase(),
      objective: newCampaignObjective.trim() || 'Customer follow-up',
      audience: { text: newCampaignAudience.trim() || 'Selected contacts' },
      progress: { text: newCampaignStatus === 'Active' ? '0 contacted' : 'Ready for review' },
      script: newCampaignScript.trim(),
      interested: [],
    };

    let created;
    try {
      created = await api('/v1/leads/campaigns', {
        method: 'POST',
        body: {
          kind: newCampaignKind,
          draft: newCampaignStatus.toLowerCase() === 'draft',
          name: newObj.name,
          objective: newObj.objective,
          audience: newObj.audience.text,
          script_note: newObj.script,
        },
      });
    } catch (error) {
      toast(error.message, 'bad');
      return;
    }

    setCampaigns((prev) => [{ ...newObj, id: String(created?.id ?? newObj.id) }, ...prev]);
    toast('Campaign created successfully.');
    setShowCreateCampaignModal(false);
    setNewCampaignName('');
    setNewCampaignKind('speed_to_lead');
    setNewCampaignObjective('');
    setNewCampaignAudience('');
    setNewCampaignScript('');
    setNewCampaignStatus('Draft');
  };

  const handleUpdateCampaignStatus = (campaignId, nextStatus) => {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaignId ? { ...c, status: nextStatus.toLowerCase() } : c))
    );
    if (selectedCampaign && selectedCampaign.id === campaignId) {
      setSelectedCampaign((prev) => ({ ...prev, status: nextStatus.toLowerCase() }));
    }
    toast(`Campaign status updated to ${nextStatus}.`);
  };

  const handleSaveInboundWorkflow = (publish = false) => {
    const finalName = wfName.trim() || 'General Inbound Reception';
    const newWf = {
      id: `wf_${Date.now()}`,
      name: finalName,
      businessName: wfBusinessName,
      number: wfNumber,
      coworker: wfCoworker,
      status: publish ? 'Active' : 'Draft',
    };
    setInboundWorkflows((prev) => [newWf, ...prev]);
    toast(publish ? 'Inbound workflow published!' : 'Draft saved.');
    setInboundMode('overview');
    setWizardStep(1);
    setWfName('');
  };

  return (
    <div className="campaigns-page">
      {/* Header matching reference designs */}
      <div className="campaigns-head">
        <div>
          <div className="campaigns-eyebrow">GROWTH / CAMPAIGNS</div>
          {mainTab === 'outbound' ? (
            <>
              <h1 className="campaigns-title">Campaigns</h1>
              <p className="campaigns-subtitle">Reconnect with customers and manage every follow-up.</p>
            </>
          ) : inboundMode === 'create' ? (
            <>
              <h1 className="campaigns-title">Create inbound workflow</h1>
              <p className="campaigns-subtitle">Configure the entire incoming call journey.</p>
            </>
          ) : (
            <>
              <h1 className="campaigns-title">Inbound workflows</h1>
              <p className="campaigns-subtitle">Choose how your AI coworker handles incoming calls.</p>
            </>
          )}
        </div>

        {mainTab === 'outbound' ? (
          <button
            type="button"
            className="campaigns-create-btn"
            onClick={() => setShowCreateCampaignModal(true)}
          >
            Create campaign
          </button>
        ) : inboundMode === 'create' ? (
          <button
            type="button"
            className="wizard-btn-save"
            onClick={() => setInboundMode('overview')}
          >
            All inbound workflows
          </button>
        ) : (
          <button
            type="button"
            className="campaigns-create-btn"
            onClick={() => {
              setInboundMode('create');
              setWizardStep(1);
            }}
          >
            Create inbound workflow
          </button>
        )}
      </div>

      {/* Main Tabs */}
      <div className="campaigns-main-tabs">
        <button
          type="button"
          className={`campaigns-main-tab ${mainTab === 'outbound' ? 'active' : ''}`}
          onClick={() => {
            setMainTab('outbound');
            setInboundMode('overview');
          }}
        >
          Outbound campaigns
        </button>
        <button
          type="button"
          className={`campaigns-main-tab ${mainTab === 'inbound' ? 'active' : ''}`}
          onClick={() => setMainTab('inbound')}
        >
          Inbound workflows
        </button>
      </div>

      {/* Demo notice subline */}
      <div className="campaigns-demo-note">
        Demo workspace · Calls, scheduling and AI responses are simulated. Saved on this browser only.
      </div>

      {/* -------------------- OUTBOUND CAMPAIGNS TAB -------------------- */}
      {mainTab === 'outbound' && (
        <>
          {/* Status filter bar */}
          <div className="campaigns-status-tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`campaigns-status-tab ${statusFilter === tab ? 'active' : ''}`}
                onClick={() => setStatusFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Main Outbound Card */}
          <div className="campaigns-card">
            {filteredCampaigns.length === 0 ? (
              <div className="campaigns-empty-card">
                <h2 className="campaigns-empty-title">No campaigns here</h2>
                <p className="campaigns-empty-sub">Create a campaign or choose another status.</p>
              </div>
            ) : (
              <div className="campaigns-list">
                {filteredCampaigns.map((c) => {
                  const audienceText = c.audience?.text || c.audience?.label || 'Contacts';
                  const progressText = c.progress?.text || (c.status === 'draft' ? 'Ready for review' : 'Active');
                  const badgeClass = `campaigns-status-badge--${(c.status || 'draft').toLowerCase()}`;
                  return (
                    <div key={c.id} className="campaigns-row">
                      <div className="campaigns-row-info">
                        <h3 className="campaigns-row-title">{c.name}</h3>
                        <p className="campaigns-row-sub">
                          {audienceText} · {progressText}
                        </p>
                      </div>
                      <div className="campaigns-row-actions">
                        <span className={`campaigns-status-badge ${badgeClass}`}>
                          {(c.status || 'draft').charAt(0).toUpperCase() + (c.status || 'draft').slice(1)}
                        </span>
                        <button
                          type="button"
                          className="campaigns-action-btn"
                          onClick={() => setSelectedCampaign(c)}
                        >
                          View campaign
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* -------------------- INBOUND WORKFLOWS TAB -------------------- */}
      {mainTab === 'inbound' && inboundMode === 'overview' && (
        <>
          {/* Card 1: Inbound workflows status card */}
          <div className="campaigns-card" style={{ marginBottom: '20px' }}>
            {inboundWorkflows.length === 0 ? (
              <div className="campaigns-empty-card">
                <h2 className="campaigns-empty-title">No inbound workflows yet</h2>
                <p className="campaigns-empty-sub">
                  Start with your number, then choose how callers are greeted, helped and handed to your team.
                </p>
              </div>
            ) : (
              <div className="campaigns-list">
                {inboundWorkflows.map((w) => (
                  <div key={w.id} className="campaigns-row">
                    <div className="campaigns-row-info">
                      <h3 className="campaigns-row-title">{w.name}</h3>
                      <p className="campaigns-row-sub">
                        {w.number} · {w.coworker}
                      </p>
                    </div>
                    <div className="campaigns-row-actions">
                      <span className={`campaigns-status-badge campaigns-status-badge--${w.status.toLowerCase()}`}>
                        {w.status}
                      </span>
                      <button
                        type="button"
                        className="campaigns-action-btn"
                        onClick={() => {
                          setWfName(w.name);
                          setInboundMode('create');
                          setWizardStep(1);
                        }}
                      >
                        Edit workflow
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Card 2: How an incoming call is handled */}
          <div className="campaigns-card" style={{ padding: '24px 28px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#0f172a', margin: '0 0 16px 0', letterSpacing: '-0.01em' }}>
              How an incoming call is handled
            </h2>
            <div className="inbound-steps-list">
              <div className="inbound-step-item">1. Call reaches your number</div>
              <div className="inbound-step-item">2. Check business hours and holidays</div>
              <div className="inbound-step-item">3. Greet caller and understand the request</div>
              <div className="inbound-step-item">4. Collect details, request a booking or hand off</div>
              <div className="inbound-step-item">5. If nobody answers, capture a callback or voicemail</div>
              <div className="inbound-step-item">6. Prepare a summary and office follow-up</div>
            </div>
          </div>
        </>
      )}

      {/* -------------------- CREATE INBOUND WORKFLOW WIZARD -------------------- */}
      {mainTab === 'inbound' && inboundMode === 'create' && (
        <>
          {/* Step Wizard Tabs */}
          <div className="wizard-steps">
            {WIZARD_STEPS.map((stepLabel, idx) => (
              <button
                key={stepLabel}
                type="button"
                className={`wizard-step-btn ${wizardStep === idx + 1 ? 'active' : ''}`}
                onClick={() => setWizardStep(idx + 1)}
              >
                {stepLabel}
              </button>
            ))}
          </div>

          {/* Step 1: Basics (Exact reference UI matching screenshot 2) */}
          {wizardStep === 1 && (
            <div className="wizard-card">
              <h2 className="wizard-title">Basics</h2>

              <div className="wizard-field">
                <label className="wizard-label">Workflow name</label>
                <input
                  type="text"
                  className="wizard-input"
                  placeholder="e.g. Standard Business Inbound"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="wizard-field">
                <label className="wizard-label">Business name</label>
                <input
                  type="text"
                  className="wizard-input"
                  value={wfBusinessName}
                  onChange={(e) => setWfBusinessName(e.target.value)}
                />
              </div>

              <div className="wizard-field">
                <label className="wizard-label">Incoming number</label>
                <select
                  className="wizard-select"
                  value={wfNumber}
                  onChange={(e) => setWfNumber(e.target.value)}
                >
                  <option value="+1 202-555-0180 · Sample / unverified">
                    +1 202-555-0180 · Sample / unverified
                  </option>
                  <option value="+1 512-555-0199 · Office Primary">
                    +1 512-555-0199 · Office Primary
                  </option>
                </select>
                <div className="wizard-hint">
                  Each number can have one active workflow in this demo. Real routing requires a verified provider connection.
                </div>
              </div>

              <div className="wizard-field">
                <label className="wizard-label">AI coworker</label>
                <select
                  className="wizard-select"
                  value={wfCoworker}
                  onChange={(e) => setWfCoworker(e.target.value)}
                >
                  <option value="AI Receptionist">AI Receptionist</option>
                  <option value="Emergency Dispatcher">Emergency Dispatcher</option>
                  <option value="After-Hours Agent">After-Hours Agent</option>
                </select>
              </div>

              <div className="wizard-actions">
                <button
                  type="button"
                  className="wizard-btn-back"
                  disabled
                >
                  Back
                </button>
                <button
                  type="button"
                  className="wizard-btn-save"
                  onClick={() => handleSaveInboundWorkflow(false)}
                >
                  Save draft & close
                </button>
                <button
                  type="button"
                  className="wizard-btn-continue"
                  onClick={() => setWizardStep(2)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Greeting & knowledge */}
          {wizardStep === 2 && (
            <div className="wizard-card">
              <h2 className="wizard-title">Greeting & knowledge</h2>

              <div className="wizard-field">
                <label className="wizard-label">Greeting message</label>
                <textarea
                  rows={3}
                  className="wizard-textarea"
                  value={wfGreeting}
                  onChange={(e) => setWfGreeting(e.target.value)}
                />
                <div className="wizard-hint">Spoken by your AI coworker when answering incoming customer calls.</div>
              </div>

              <div className="wizard-field">
                <label className="wizard-label">Core services & skill topics</label>
                <input
                  type="text"
                  className="wizard-input"
                  value={wfServices}
                  onChange={(e) => setWfServices(e.target.value)}
                />
              </div>

              <div className="wizard-actions">
                <button
                  type="button"
                  className="wizard-btn-back"
                  onClick={() => setWizardStep(1)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="wizard-btn-save"
                  onClick={() => handleSaveInboundWorkflow(false)}
                >
                  Save draft & close
                </button>
                <button
                  type="button"
                  className="wizard-btn-continue"
                  onClick={() => setWizardStep(3)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Hours */}
          {wizardStep === 3 && (
            <div className="wizard-card">
              <h2 className="wizard-title">Business hours & holidays</h2>

              <div className="wizard-field">
                <label className="wizard-label">Operating schedule</label>
                <input
                  type="text"
                  className="wizard-input"
                  value={wfHours}
                  onChange={(e) => setWfHours(e.target.value)}
                />
              </div>

              <div className="wizard-field">
                <label className="wizard-label">After-hours call handling</label>
                <select
                  className="wizard-select"
                  value={wfAfterHours}
                  onChange={(e) => setWfAfterHours(e.target.value)}
                >
                  <option value="emergency">Route urgent cooling/heating failures to on-call technician</option>
                  <option value="voicemail">Record voicemail and queue morning office callback</option>
                </select>
              </div>

              <div className="wizard-actions">
                <button
                  type="button"
                  className="wizard-btn-back"
                  onClick={() => setWizardStep(2)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="wizard-btn-save"
                  onClick={() => handleSaveInboundWorkflow(false)}
                >
                  Save draft & close
                </button>
                <button
                  type="button"
                  className="wizard-btn-continue"
                  onClick={() => setWizardStep(4)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Caller & booking */}
          {wizardStep === 4 && (
            <div className="wizard-card">
              <h2 className="wizard-title">Caller & booking details</h2>

              <div className="wizard-field">
                <label className="wizard-label">Information captured</label>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
                  Caller name, phone number, physical service address, and issue description.
                </p>
              </div>

              <div className="wizard-field">
                <label className="wizard-label">Service appointment slot window</label>
                <select
                  className="wizard-select"
                  value={wfBookingSlot}
                  onChange={(e) => setWfBookingSlot(e.target.value)}
                >
                  <option value="2 hours">2 hours arrival window</option>
                  <option value="4 hours">4 hours arrival window</option>
                  <option value="exact">Exact arrival time</option>
                </select>
              </div>

              <div className="wizard-actions">
                <button
                  type="button"
                  className="wizard-btn-back"
                  onClick={() => setWizardStep(3)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="wizard-btn-save"
                  onClick={() => handleSaveInboundWorkflow(false)}
                >
                  Save draft & close
                </button>
                <button
                  type="button"
                  className="wizard-btn-continue"
                  onClick={() => setWizardStep(5)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Handoff & fallback */}
          {wizardStep === 5 && (
            <div className="wizard-card">
              <h2 className="wizard-title">Handoff & fallback</h2>

              <div className="wizard-field">
                <label className="wizard-label">Live human transfer number</label>
                <input
                  type="text"
                  className="wizard-input"
                  value={wfHandoffNumber}
                  onChange={(e) => setWfHandoffNumber(e.target.value)}
                />
                <div className="wizard-hint">When a caller asks for an office representative or emergency escalation.</div>
              </div>

              <div className="wizard-actions">
                <button
                  type="button"
                  className="wizard-btn-back"
                  onClick={() => setWizardStep(4)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="wizard-btn-save"
                  onClick={() => handleSaveInboundWorkflow(false)}
                >
                  Save draft & close
                </button>
                <button
                  type="button"
                  className="wizard-btn-continue"
                  onClick={() => setWizardStep(6)}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Test & review */}
          {wizardStep === 6 && (
            <div className="wizard-card">
              <h2 className="wizard-title">Test & review</h2>

              <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>{wfName || 'Standard Inbound Workflow'}</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', lineHeight: '1.6' }}>
                  <strong>Number:</strong> {wfNumber}<br />
                  <strong>AI Coworker:</strong> {wfCoworker}<br />
                  <strong>Operating Hours:</strong> {wfHours}<br />
                  <strong>Handoff:</strong> {wfHandoffNumber}
                </div>
              </div>

              <div className="wizard-actions">
                <button
                  type="button"
                  className="wizard-btn-back"
                  onClick={() => setWizardStep(5)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="wizard-btn-save"
                  onClick={() => handleSaveInboundWorkflow(false)}
                >
                  Save draft & close
                </button>
                <button
                  type="button"
                  className="wizard-btn-continue"
                  onClick={() => handleSaveInboundWorkflow(true)}
                >
                  Publish workflow
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Outbound Campaign Modal */}
      {showCreateCampaignModal && (
        <div className="campaigns-modal-overlay" onClick={() => setShowCreateCampaignModal(false)}>
          <div className="campaigns-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="campaigns-modal-head">
              <div>
                <div className="campaigns-modal-eyebrow">GROWTH / CAMPAIGNS</div>
                <h2 className="campaigns-modal-title">Create campaign</h2>
              </div>
              <button
                type="button"
                className="campaigns-modal-close"
                onClick={() => setShowCreateCampaignModal(false)}
              >
                ×
              </button>
            </div>
            <form onSubmit={handleCreateCampaignSubmit} className="campaigns-modal-body">
              <div>
                <label className="label">Campaign name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Spring HVAC tune-up"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label className="label">Campaign type *</label>
                <select
                  required
                  value={newCampaignKind}
                  onChange={(e) => setNewCampaignKind(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="speed_to_lead">Speed to lead (new inquiries)</option>
                  <option value="reactivation">Reactivation (past customers)</option>
                </select>
              </div>
              <div>
                <label className="label">Objective</label>
                <input
                  type="text"
                  placeholder="e.g. Reconnect with past customers for seasonal maintenance"
                  value={newCampaignObjective}
                  onChange={(e) => setNewCampaignObjective(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label className="label">Target audience</label>
                <input
                  type="text"
                  placeholder="e.g. 120 past cooling repair inquiries"
                  value={newCampaignAudience}
                  onChange={(e) => setNewCampaignAudience(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                />
              </div>
              <div>
                <label className="label">Initial status</label>
                <select
                  value={newCampaignStatus}
                  onChange={(e) => setNewCampaignStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                >
                  <option value="Draft">Draft (calls nobody yet)</option>
                  <option value="Scheduled">Scheduled</option>
                  <option value="Active">Active (ready for outreach)</option>
                </select>
              </div>
              <div>
                <label className="label">Outreach script guidance</label>
                <textarea
                  rows={3}
                  placeholder="What the voice assistant should emphasize during calls"
                  value={newCampaignScript}
                  onChange={(e) => setNewCampaignScript(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', resize: 'vertical' }}
                />
              </div>
              <div className="campaigns-modal-footer">
                <button
                  type="button"
                  className="campaigns-action-btn"
                  onClick={() => setShowCreateCampaignModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="campaigns-create-btn"
                >
                  Create campaign
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Outbound Campaign Modal */}
      {selectedCampaign && (
        <div className="campaigns-modal-overlay" onClick={() => setSelectedCampaign(null)}>
          <div className="campaigns-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="campaigns-modal-head">
              <div>
                <div className="campaigns-modal-eyebrow">DEMO WORKSPACE</div>
                <h2 className="campaigns-modal-title">Campaign · {selectedCampaign.name}</h2>
              </div>
              <button
                type="button"
                className="campaigns-modal-close"
                onClick={() => setSelectedCampaign(null)}
              >
                ×
              </button>
            </div>
            <div className="campaigns-modal-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`campaigns-status-badge campaigns-status-badge--${selectedCampaign.status}`}>
                  {selectedCampaign.status.charAt(0).toUpperCase() + selectedCampaign.status.slice(1)}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  {selectedCampaign.progress?.text || 'Ready for review'}
                </span>
              </div>

              {selectedCampaign.objective && (
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.85rem' }}>Objective</div>
                  <div style={{ color: '#475569', fontSize: '0.82rem', marginTop: '2px' }}>{selectedCampaign.objective}</div>
                </div>
              )}

              {selectedCampaign.script && (
                <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.82rem', marginBottom: '4px' }}>
                    Sample outreach script
                  </div>
                  <div style={{ color: '#475569', fontSize: '0.82rem', fontStyle: 'italic' }}>
                    "{selectedCampaign.script}"
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem', marginBottom: '6px' }}>
                  Interested lead follow-up
                </div>
                {selectedCampaign.interested?.length ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {selectedCampaign.interested.map((lead, idx) => (
                      <div key={idx} style={{ padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{lead.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>{lead.summary || lead.interest}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem' }}>
                    No responses yet in this sample campaign.
                  </p>
                )}
              </div>
            </div>

            <div className="campaigns-modal-footer">
              {selectedCampaign.status === 'draft' && (
                <button
                  type="button"
                  className="campaigns-create-btn"
                  onClick={() => handleUpdateCampaignStatus(selectedCampaign.id, 'active')}
                >
                  Start campaign
                </button>
              )}
              {selectedCampaign.status === 'active' && (
                <button
                  type="button"
                  className="campaigns-action-btn"
                  onClick={() => handleUpdateCampaignStatus(selectedCampaign.id, 'paused')}
                >
                  Pause campaign
                </button>
              )}
              {selectedCampaign.status === 'paused' && (
                <button
                  type="button"
                  className="campaigns-create-btn"
                  onClick={() => handleUpdateCampaignStatus(selectedCampaign.id, 'active')}
                >
                  Resume campaign
                </button>
              )}
              {selectedCampaign.status !== 'completed' && (
                <button
                  type="button"
                  className="campaigns-action-btn"
                  onClick={() => handleUpdateCampaignStatus(selectedCampaign.id, 'completed')}
                >
                  Mark completed
                </button>
              )}
              <button
                type="button"
                className="campaigns-action-btn"
                onClick={() => setSelectedCampaign(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
