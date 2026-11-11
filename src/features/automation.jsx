// Admin automation: actions prepared for the office to review, approve, or reject.
// Exact Reference UI matching reference design with live backend integration and fallback sample records.
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { can } from '../lib/session.js';
import { toast } from '../components/index.js';
import { Icon } from '../components/Icon.jsx';

// Sample actions matching reference screenshot 1
const SAMPLE_ACTIONS = [
  {
    id: 'sample-act-1',
    isSample: true,
    title: 'Invoice follow-up',
    customer: 'Sarah Mitchell',
    displayName: 'Invoice follow-up · Sarah Mitchell',
    subtitle: 'Invoice #1048 · $240 overdue · Needs approval',
    headerLine: 'Sarah Mitchell · Invoice #1048 · $240 overdue',
    source: 'Sample invoice record',
    status: 'Needs approval',
    proposed: 'Hi Sarah, this is a friendly reminder that invoice #1048 for $240 is overdue. Please contact our office if you have questions.',
  },
  {
    id: 'sample-act-2',
    isSample: true,
    title: 'Customer record update',
    customer: 'David Rodriguez',
    displayName: 'Customer record update · David Rodriguez',
    subtitle: 'Contact details extracted from a call · Needs review',
    headerLine: 'David Rodriguez · Contact details extracted from a call',
    source: 'Sample call transcription',
    status: 'Needs review',
    proposed: 'Update primary contact phone number to (512) 555-0189 and record customer preference for morning appointments.',
  },
  {
    id: 'sample-act-3',
    isSample: true,
    title: 'Job documentation',
    customer: 'William Brooks',
    displayName: 'Job documentation · William Brooks',
    subtitle: 'Service notes prepared for office review · Needs review',
    headerLine: 'William Brooks · Service notes prepared for office review',
    source: 'Sample technician notes',
    status: 'Needs review',
    proposed: 'Technician diagnostic notes: main pressure relief valve requires replacement. Estimated repair cost: $450 parts and labor.',
  },
  {
    id: 'sample-act-4',
    isSample: true,
    title: 'Estimate follow-up',
    customer: 'Jessica Taylor',
    displayName: 'Estimate follow-up · Jessica Taylor',
    subtitle: 'Open estimate · Follow up requested · Needs approval',
    headerLine: 'Jessica Taylor · Open estimate · Follow up requested',
    source: 'Sample estimate record',
    status: 'Needs approval',
    proposed: 'Hi Jessica, following up on your heat pump replacement estimate from Apex Air Solutions. We have seasonal manufacturer rebates expiring soon if you wish to proceed.',
  },
];

// Detail Modal matching reference screenshot 2
function ActionReviewModal({ action, onClose, onApprove, onReject, onSaveEdit }) {
  const [proposedText, setProposedText] = useState(action.proposed || '');

  const handleApprove = async () => {
    onApprove(action.id);
    if (!action.isSample && action.raw?.api?.approve) {
      try {
        await api(action.raw.api.approve, {
          method: 'POST',
          body: { text: proposedText.trim() },
        });
      } catch (err) {
        console.error('Failed to approve via API:', err);
      }
    }
    toast('Sample action approved.');
    onClose();
  };

  const handleReject = async () => {
    onReject(action.id);
    if (!action.isSample && (action.raw?.api?.reject || action.raw?.api?.dismiss)) {
      try {
        await api(action.raw.api.reject || action.raw.api.dismiss, { method: 'POST' });
      } catch (err) {
        console.error('Failed to reject via API:', err);
      }
    }
    toast('Sample action rejected.');
    onClose();
  };

  const handleSaveEdit = async () => {
    onSaveEdit(action.id, proposedText);
    if (!action.isSample && action.raw?.api?.edit) {
      try {
        await api(action.raw.api.edit, {
          method: 'POST',
          body: { text: proposedText.trim() },
        });
      } catch (err) {
        console.error('Failed to save edit via API:', err);
      }
    }
    toast('Edit saved.');
  };

  return (
    <div className="automation-modal-overlay" onClick={onClose}>
      <div className="automation-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="automation-modal-head">
          <div>
            <div className="automation-modal-eyebrow">SAMPLE WORKSPACE</div>
            <h2 className="automation-modal-title">
              Review · {action.title}
            </h2>
          </div>
          <button
            type="button"
            className="automation-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Content details matching Screenshot 2 */}
        <div className="automation-modal-header-line">
          <strong>{action.customer}</strong>
          {action.headerLine && action.headerLine.includes(' · ') ? (
            <span style={{ color: '#64748b' }}>
              {' · ' + action.headerLine.split(' · ').slice(1).join(' · ')}
            </span>
          ) : null}
        </div>
        <div className="automation-modal-meta">Source: {action.source}</div>
        <div className="automation-modal-meta">Status: {action.status}</div>

        <div className="automation-modal-section-title">
          Proposed message or action
        </div>
        <textarea
          className="automation-modal-textarea"
          value={proposedText}
          onChange={(e) => setProposedText(e.target.value)}
        />

        {/* Action buttons matching Screenshot 2 */}
        <div className="automation-modal-actions">
          <button
            type="button"
            className="automation-btn-primary"
            onClick={handleApprove}
          >
            Approve sample action
          </button>
          <button
            type="button"
            className="automation-btn-outline"
            onClick={handleSaveEdit}
          >
            Save edit
          </button>
          <button
            type="button"
            className="automation-btn-outline"
            onClick={handleReject}
          >
            Reject
          </button>
        </div>

        <div className="automation-modal-disclaimer">
          Simulated only. No message is sent and no real record is updated.
        </div>
      </div>
    </div>
  );
}

export default function Automation() {
  const allowed = can('admin', 'dispatcher', 'approver');
  const [data, setData] = useState(null); // Real backend automation items
  const [activeActions, setActiveActions] = useState(SAMPLE_ACTIONS);
  const [completedHistory, setCompletedHistory] = useState([]);
  const [selectedAction, setSelectedAction] = useState(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  // Load real backend automation items
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    setLoading(true);

    (async () => {
      try {
        const res = await api('/v1/automation');
        if (!active) return;
        setData(res);
        const reviewItems = res?.needs_review?.items || [];
        if (reviewItems.length > 0 && !initialized.current) {
          const mapped = reviewItems.map((item) => {
            const customerName = item.dialog?.customer?.name
              || (typeof item.dialog?.customer === 'string' ? item.dialog.customer : '')
              || '';
            const actionTitle = item.heading || item.title || 'Office action';
            return {
              id: String(item.id),
              isSample: false,
              title: actionTitle,
              customer: customerName,
              displayName: customerName ? `${actionTitle} · ${customerName}` : actionTitle,
              subtitle: item.line || item.text || (item.status ? `${item.source || 'Office record'} · ${item.status.label || item.status}` : 'Needs review'),
              headerLine: customerName ? `${customerName} · ${item.line || item.text || actionTitle}` : actionTitle,
              source: item.source || 'Sample office record',
              status: item.status?.label || item.status || 'Needs review',
              proposed: item.dialog?.proposed || item.proposed?.text || '',
              raw: item,
            };
          });
          setActiveActions(mapped);
          initialized.current = true;
        }
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setLoading(false);
      }
    })();

    return () => { active = false; };
  }, [allowed]);

  if (!allowed) {
    return (
      <div className="card">
        <h1>Not available for your role</h1>
        <p className="muted">Ask an administrator if you need this section.</p>
      </div>
    );
  }

  const handleApprove = (id) => {
    const item = activeActions.find((a) => a.id === id);
    if (!item) return;
    setActiveActions((prev) => prev.filter((a) => a.id !== id));
    setCompletedHistory((prev) => [
      {
        ...item,
        completedAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        decision: 'Approved',
      },
      ...prev,
    ]);
  };

  const handleReject = (id) => {
    const item = activeActions.find((a) => a.id === id);
    if (!item) return;
    setActiveActions((prev) => prev.filter((a) => a.id !== id));
    setCompletedHistory((prev) => [
      {
        ...item,
        completedAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        decision: 'Rejected',
      },
      ...prev,
    ]);
  };

  const handleSaveEdit = (id, newText) => {
    setActiveActions((prev) => prev.map((a) => (a.id === id ? { ...a, proposed: newText } : a)));
  };

  return (
    <>
      {/* Header matching Reference Image 1 */}
      <div className="automation-head">
        <div>
          <div className="automation-eyebrow">OFFICE OPERATIONS</div>
          <h1 className="automation-title">Admin automation</h1>
          <p className="automation-subtitle">
            Review actions prepared for your office.
          </p>
        </div>
        <button
          type="button"
          className="automation-workspace-btn"
          onClick={() => {}}
        >
          Sample workspace
        </button>
      </div>

      {/* Card 1: Needs review · {count} */}
      <div className="automation-card">
        <h2 className="automation-card-title">
          Needs review · {activeActions.length}
        </h2>
        {activeActions.length === 0 ? (
          <p className="automation-history-empty">All review items have been processed.</p>
        ) : (
          <div className="automation-list">
            {activeActions.map((action) => (
              <div key={action.id} className="automation-row">
                <div className="automation-row-left">
                  <span className="automation-row-icon">
                    <Icon name="agents" />
                  </span>
                  <div className="automation-row-info">
                    <span className="automation-row-name">
                      {action.displayName}
                    </span>
                    <span className="automation-row-sub">
                      {action.subtitle}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="automation-review-btn"
                  onClick={() => setSelectedAction(action)}
                >
                  Review →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card 2: Completed history */}
      <div className="automation-card">
        <h2 className="automation-card-title">Completed history</h2>
        {completedHistory.length === 0 ? (
          <p className="automation-history-empty">No completed sample actions.</p>
        ) : (
          <div className="automation-list">
            {completedHistory.map((h) => (
              <div key={h.id} className="automation-row">
                <div className="automation-row-left">
                  <span
                    className="automation-row-icon"
                    style={{
                      background: h.decision === 'Approved' ? '#ecfdf5' : '#f1f5f9',
                      color: h.decision === 'Approved' ? '#047857' : '#64748b',
                    }}
                  >
                    <Icon name={h.decision === 'Approved' ? 'checkCircle' : 'tasks'} />
                  </span>
                  <div className="automation-row-info">
                    <span className="automation-row-name">
                      {h.displayName}
                    </span>
                    <span className="automation-row-sub">
                      {h.decision} · {h.completedAt}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom disclaimer matching Reference Image 1 */}
      <div className="automation-disclaimer">
        Simulated actions only. No business system is connected.
      </div>

      {/* Review Modal matching Reference Image 2 */}
      {selectedAction && (
        <ActionReviewModal
          action={selectedAction}
          onClose={() => setSelectedAction(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onSaveEdit={handleSaveEdit}
        />
      )}
    </>
  );
}
