import { useEffect, useRef } from 'react';

// A screen that refreshes itself: calls fn every `ms` while the tab is visible. Stops when the screen goes away.
export function useEvery(fn, ms) {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) latest.current(); }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
