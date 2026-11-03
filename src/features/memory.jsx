// Memory: everyone the AI has spoken with: what it remembers about them and what was said on each call. Click a person to read it.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { Badge, Button, Card, DataTable, Empty, ErrorBox, PageHeader, Spinner, StatGrid } from '../components/index.js';
import { MemoryOverlay } from './memory_panel.jsx';

export default function Memory() {
  const [people, setPeople] = useState([]);
  const [state, setState] = useState({ loading: true });
  const [query, setQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all');
  const [open, setOpen] = useState(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const n = ++seq.current;
    setState({ loading: true });
    try {
      const out = (await api('/v1/memory')).people;
      if (n !== seq.current) return;
      setPeople(out);
      setState({});
    } catch (error) {
      if (n === seq.current) setState({ error });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Analytics summary for KPI cards
  const stats = useMemo(() => {
    const totalPeople = people.length;
    const totalFacts = people.reduce((sum, p) => sum + (p.facts || 0), 0);
    const totalCalls = people.reduce((sum, p) => sum + (p.calls || 0), 0);
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentActive = people.filter((p) => p.last_call_at && new Date(p.last_call_at).getTime() > oneWeekAgo).length;

    return [
      ['Customer Profiles', String(totalPeople), 'Caller memories kept', 'users'],
      ['Knowledge Facts', String(totalFacts), 'Customer facts learned', 'memory'],
      ['Preserved Calls', String(totalCalls), 'Recorded conversations', 'phone'],
      ['Recent Callers (7d)', String(recentActive), 'Active in the last week', 'tracking'],
    ];
  }, [people]);

  // Search and quick filter logic
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return people.filter((p) => {
      const matchesSearch = !needle || `${p.name || ''} ${p.user_id}`.toLowerCase().includes(needle);
      if (!matchesSearch) return false;

      if (filterMode === 'facts') return (p.facts || 0) > 0;
      if (filterMode === 'multi') return (p.calls || 0) > 1;
      if (filterMode === 'recent') return p.last_call_at && new Date(p.last_call_at).getTime() > oneWeekAgo;
      return true;
    });
  }, [people, query, filterMode]);

  let list;
  if (state.loading) list = <Spinner text="Loading customer memory database..." />;
  else if (state.error) list = <ErrorBox error={state.error} />;
  else if (!filteredRows.length) list = <Empty text={people.length ? 'No customer matches your search or filter.' : 'The assistant has not held any recorded conversations yet.'} />;
  else {
    list = (
      <DataTable
        head={['Customer', 'Phone Number', 'Remembered Facts', 'Total Calls', 'Last Call', 'Action']}
        rows={filteredRows.map((p) => [
          <div key={p.user_id} className="memory-user-cell">
            <span className="memory-avatar">{(p.name || p.user_id || '?').slice(0, 1).toUpperCase()}</span>
            <div className="memory-user-info">
              <strong>{p.name || 'Unknown Caller'}</strong>
              <small>{p.user_id}</small>
            </div>
          </div>,
          p.user_id,
          <Badge key="f" text={`${p.facts || 0} fact${p.facts === 1 ? '' : 's'}`} tone={(p.facts || 0) > 0 ? 'good' : 'neutral'} />,
          <Badge key="c" text={`${p.calls || 0} call${p.calls === 1 ? '' : 's'}`} tone="info" />,
          p.last_call_at ? formatDateTime(p.last_call_at) : '-',
          <Button
            key="btn"
            className="btn btn--outline btn--small"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(p);
            }}
          >
            <span>View Memory →</span>
          </Button>,
        ])}
        onRow={(_cells, i) => setOpen(filteredRows[i])}
        label="Customer Memory Table"
      />
    );
  }

  return (
    <div className="memory-container">
      <PageHeader
        title="Customer Memory & Call Records"
        subtitle="Long-term customer context learned by the AI assistant and complete transcripts for every call"
      />

      {/* KPI Overview */}
      {people.length > 0 ? <StatGrid items={stats} /> : null}

      <Card as="section">
        <div className="memory-toolbar">
          <div className="row wrap" style={{ flex: 1 }}>
            <input
              type="search"
              className="memory-search-input"
              placeholder="Search by customer name or phone..."
              aria-label="Search memory"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <span className="muted small">
            {filteredRows.length} {filteredRows.length === 1 ? 'profile' : 'profiles'} shown
          </span>
        </div>

        {/* Quick Filter Pills */}
        {people.length > 0 ? (
          <div className="jobs-status-strip" style={{ marginBottom: '16px' }}>
            <button
              type="button"
              className={`jobs-status-chip ${filterMode === 'all' ? 'jobs-status-chip--active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              <span>All People</span>
              <span className="jobs-status-chip__count">{people.length}</span>
            </button>
            <button
              type="button"
              className={`jobs-status-chip ${filterMode === 'facts' ? 'jobs-status-chip--active' : ''}`}
              onClick={() => setFilterMode((curr) => (curr === 'facts' ? 'all' : 'facts'))}
            >
              <span className="jobs-status-chip__dot" />
              <span>With Knowledge Facts</span>
              <span className="jobs-status-chip__count">{people.filter((p) => (p.facts || 0) > 0).length}</span>
            </button>
            <button
              type="button"
              className={`jobs-status-chip ${filterMode === 'multi' ? 'jobs-status-chip--active' : ''}`}
              onClick={() => setFilterMode((curr) => (curr === 'multi' ? 'all' : 'multi'))}
            >
              <span className="jobs-status-chip__dot" />
              <span>Multiple Calls</span>
              <span className="jobs-status-chip__count">{people.filter((p) => (p.calls || 0) > 1).length}</span>
            </button>
          </div>
        ) : null}

        <div>{list}</div>
      </Card>

      {open && <MemoryOverlay person={open} onClose={() => setOpen(null)} onErased={load} />}
    </div>
  );
}
