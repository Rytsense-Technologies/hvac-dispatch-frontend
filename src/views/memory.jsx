// Memory: everyone the AI has spoken with: what it remembers about them and what was said on each call. Click a person to read it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { DataTable, Empty, ErrorBox, PageHeader, Spinner } from '../lib/ui.jsx';
import { MemoryOverlay } from './memory_panel.jsx';

export default function Memory() {
  const [people, setPeople] = useState([]);
  const [state, setState] = useState({ loading: true });
  const [query, setQuery] = useState('');
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

  const needle = query.trim().toLowerCase();
  const rows = people.filter((p) => !needle || `${p.name || ''} ${p.user_id}`.toLowerCase().includes(needle));
  let list;
  if (state.loading) list = <Spinner />;
  else if (state.error) list = <ErrorBox error={state.error} />;
  else if (!rows.length) list = <Empty text={people.length ? 'Nobody matches that search.' : 'The AI has not spoken with anyone yet.'} />;
  else {
    list = (
      <DataTable
        head={['Person', 'Phone', 'Remembered facts', 'Calls', 'Last call']}
        rows={rows.map((p) => [<strong>{p.name || 'Unknown'}</strong>, p.user_id, String(p.facts), String(p.calls), p.last_call_at ? formatDateTime(p.last_call_at) : '-'])}
        onRow={(_cells, i) => setOpen(rows[i])}
        label="People"
      />
    );
  }

  return (
    <>
      <PageHeader title="Memory" subtitle="Everyone the AI has spoken with: what it remembers about them, and the conversation of each call." />
      <div className="row"><input type="search" placeholder="Search a name or number" aria-label="Search" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div>{list}</div>
      {open && <MemoryOverlay person={open} onClose={() => setOpen(null)} onErased={load} />}
    </>
  );
}
