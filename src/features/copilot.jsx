// AI Coworker (Copilot): ask questions about the workspace, jobs, technicians, and campaigns.
// Exact Reference UI matching reference design with live backend integration and fallback sample records.
import { useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { toast } from '../components/index.js';

// Predefined answers for the chips and sample questions
const KNOWLEDGE_BASE = {
  'who is available for the ac repair?':
    'For the urgent AC repair with Sarah Mitchell (Wed, Nov 11 · 1 PM - 3 PM), Mike Rodriguez (HVAC Specialist) is currently Available until 3:30 PM with matching certification. You can assign him directly from Tasks.',
  'admin actions to review':
    'There are 4 actions awaiting office review in Admin Automation: 1) Invoice follow-up for Sarah Mitchell ($240 overdue), 2) Customer record update for David Rodriguez, 3) Job documentation for William Brooks, and 4) Estimate follow-up for Jessica Taylor.',
  'show existing lead campaigns':
    'You currently have 3 outbound lead campaigns: 1) Old AC replacement leads (Active · 42/120 contacted), 2) Spring maintenance follow-up (Active · 44/80 contacted), and 3) Unscheduled plumbing estimates (Draft review).',
};

// Suggested actions list matching screenshot
const SUGGESTED_ACTIONS = [
  {
    id: 'act-1',
    title: 'Invoice follow-up',
    subtitle: 'Sarah Mitchell · Needs approval',
    customer: 'Sarah Mitchell',
    headerLine: 'Sarah Mitchell · Invoice #1048 · $240 overdue',
    source: 'Sample invoice record',
    status: 'Needs approval',
    proposed: 'Hi Sarah, this is a friendly reminder that invoice #1048 for $240 is overdue. Please contact our office if you have questions.',
    type: 'review',
    btnLabel: 'Review',
  },
  {
    id: 'act-2',
    title: 'Customer record update',
    subtitle: 'David Rodriguez · Needs review',
    customer: 'David Rodriguez',
    headerLine: 'David Rodriguez · Contact details extracted from a call',
    source: 'Sample call transcription',
    status: 'Needs review',
    proposed: 'Update primary phone number to (512) 555-0189 and record customer preference for morning appointments.',
    type: 'review',
    btnLabel: 'Review',
  },
  {
    id: 'act-3',
    title: 'Assign AC repair · Sarah Mitchell',
    subtitle: 'Unassigned work',
    type: 'link',
    link: '#/tasks',
    btnLabel: 'Open task',
  },
  {
    id: 'act-4',
    title: 'Assign Plumbing inspection · William Brooks',
    subtitle: 'Unassigned work',
    type: 'link',
    link: '#/tasks',
    btnLabel: 'Open task',
  },
  {
    id: 'act-5',
    title: 'Explore existing campaigns',
    subtitle: 'Sample outreach',
    type: 'link',
    link: '#/campaigns',
    btnLabel: 'Open',
  },
];

// Review Modal matching Screenshot 2
function ActionReviewModal({ action, onClose, onApprove, onReject, onSaveEdit }) {
  const [proposedText, setProposedText] = useState(action.proposed || '');

  const handleApprove = () => {
    onApprove(action.id);
    toast('Sample action approved.');
    onClose();
  };

  const handleReject = () => {
    onReject(action.id);
    toast('Sample action rejected.');
    onClose();
  };

  const handleSaveEdit = () => {
    onSaveEdit(action.id, proposedText);
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

export default function Copilot() {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [suggestedActions, setSuggestedActions] = useState(SUGGESTED_ACTIONS);
  const [reviewingAction, setReviewingAction] = useState(null);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  const handleSend = async (textToSend) => {
    const q = (textToSend || query).trim();
    if (!q) return;

    const userMsg = { id: `user-${Date.now()}`, role: 'user', text: q };
    setMessages((prev) => [...prev, userMsg]);
    setQuery('');
    setLoading(true);

    const norm = q.toLowerCase();
    let reply = KNOWLEDGE_BASE[norm];

    if (!reply) {
      for (const [key, val] of Object.entries(KNOWLEDGE_BASE)) {
        if (norm.includes(key) || key.includes(norm)) {
          reply = val;
          break;
        }
      }
    }

    if (!reply) {
      try {
        const res = await api('/v1/copilot/ask', { method: 'POST', body: { prompt: q } });
        if (res?.reply || res?.text) {
          reply = res.reply || res.text;
        }
      } catch {
        // Fall back gracefully to generated assistant context
      }
    }

    if (!reply) {
      if (norm.includes('ac') || norm.includes('repair')) {
        reply = 'Sarah Mitchell has an urgent AC repair scheduled today (1 PM - 3 PM). Mike Rodriguez is available and matches this HVAC service.';
      } else if (norm.includes('campaign') || norm.includes('outbound')) {
        reply = 'There are 3 lead campaigns active in the workspace, with 86 customers contacted so far.';
      } else if (norm.includes('technician') || norm.includes('team')) {
        reply = 'The team currently has 3 members: Mike Rodriguez (HVAC), Alicia Brown (Plumbing), and James Miller (Office Admin).';
      } else {
        reply = `Regarding "${q}": All workspace systems are synchronized. Sarah Mitchell's AC repair is unassigned, and 4 office items are awaiting approval.`;
      }
    }

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { id: `ai-${Date.now()}`, role: 'assistant', text: reply },
      ]);
      setLoading(false);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 350);
  };

  const handleApproveAction = (id) => {
    setSuggestedActions((prev) => prev.filter((a) => a.id !== id));
  };

  const handleRejectAction = (id) => {
    setSuggestedActions((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSaveEditAction = (id, newText) => {
    setSuggestedActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, proposed: newText } : a))
    );
  };

  return (
    <>
      {/* Header matching Reference */}
      <div className="copilot-head">
        <div>
          <div className="copilot-eyebrow">YOUR AI WORKSPACE</div>
          <h1 className="copilot-title">AI Coworker</h1>
          <p className="copilot-subtitle">
            Ask questions about the sample workspace.
          </p>
        </div>
        <button
          type="button"
          className="copilot-demo-btn"
          onClick={() => {}}
        >
          Concept demo
        </button>
      </div>

      {/* Two-Column Grid */}
      <div className="copilot-grid">
        {/* Left Column: How can I help? */}
        <div className="copilot-card">
          <h2 className="copilot-card-title">How can I help?</h2>

          {/* Conversation history or default banner */}
          {messages.length === 0 ? (
            <div className="copilot-chat-bubble-default">
              Ask about the AC repair, admin reviews, or existing campaigns.
            </div>
          ) : (
            <div className="copilot-history-list" ref={scrollRef}>
              <div className="copilot-chat-bubble-default" style={{ marginBottom: 4 }}>
                Ask about the AC repair, admin reviews, or existing campaigns.
              </div>
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    m.role === 'user'
                      ? 'copilot-message-user'
                      : 'copilot-message-assistant'
                  }
                >
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="copilot-message-assistant" style={{ fontStyle: 'italic', color: '#64748b' }}>
                  Analyzing workspace data…
                </div>
              )}
            </div>
          )}

          {/* Quick prompt chips matching screenshot */}
          <div className="copilot-chips-row">
            <button
              type="button"
              className="copilot-chip-btn"
              onClick={() => handleSend('Who is available for the AC repair?')}
            >
              Who is available for the AC repair?
            </button>
            <button
              type="button"
              className="copilot-chip-btn"
              onClick={() => handleSend('Admin actions to review')}
            >
              Admin actions to review
            </button>
            <button
              type="button"
              className="copilot-chip-btn"
              onClick={() => handleSend('Show existing lead campaigns')}
            >
              Show existing lead campaigns
            </button>
          </div>

          {/* Input Form matching screenshot */}
          <form
            className="copilot-input-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              className="copilot-text-input"
              placeholder="Ask about sample jobs or campaigns"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit" className="copilot-send-btn">
              Send
            </button>
          </form>

          {/* Bottom disclaimer matching screenshot */}
          <div className="copilot-disclaimer">
            Simulated responses based on demo records. No live AI or business systems are connected.
          </div>
        </div>

        {/* Right Column: Suggested actions */}
        <div className="copilot-card">
          <h2 className="copilot-card-title">Suggested actions</h2>

          <div className="copilot-actions-list">
            {suggestedActions.map((action) => (
              <div key={action.id} className="copilot-action-row">
                <div className="copilot-action-info">
                  <span className="copilot-action-title">{action.title}</span>
                  <span className="copilot-action-sub">{action.subtitle}</span>
                </div>

                {action.type === 'review' ? (
                  <button
                    type="button"
                    className="copilot-action-btn"
                    onClick={() => setReviewingAction(action)}
                  >
                    {action.btnLabel}
                  </button>
                ) : (
                  <a
                    href={action.link}
                    className="copilot-action-btn"
                  >
                    {action.btnLabel}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Review Modal matching Screenshot 2 */}
      {reviewingAction && (
        <ActionReviewModal
          action={reviewingAction}
          onClose={() => setReviewingAction(null)}
          onApprove={handleApproveAction}
          onReject={handleRejectAction}
          onSaveEdit={handleSaveEditAction}
        />
      )}
    </>
  );
}
