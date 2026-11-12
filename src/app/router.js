// A minimal History-API router for the console - plain paths (/calls, /settings) instead of
// hash routing (#/calls), with no routing library. Three jobs:
//   1. usePathname() - the current pathname + search, re-rendering on navigate() and on back/forward.
//   2. installLinkInterceptor() - makes same-origin <a href="/..."> links navigate client-side
//      (no full page reload) without having to touch every link's markup individually.
//   3. redirectLegacyHash() - turns an old bookmarked "/#/calls" address into "/calls", once, on load.
// Paths that belong to the API or another page on this site must never be swallowed by the SPA
// fallback or intercepted as client-side routes - RESERVED_PREFIXES is that list.
import { useSyncExternalStore } from 'react';

export const RESERVED_PREFIXES = ['/v1', '/tech', '/set-password', '/signup', '/billing', '/twilio', '/healthz', '/rtc', '/twirp', '/api'];

export const isReservedPath = (pathname) => RESERVED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const listeners = new Set();
const emit = () => listeners.forEach((l) => l());
const currentLocation = () => location.pathname + location.search;

if (typeof window !== 'undefined') window.addEventListener('popstate', emit);

/** Go to `path` (e.g. "/calls" or "/calls?tab=inbound") without a full page reload. */
export function navigate(path, { replace = false } = {}) {
  if (currentLocation() === path) return;
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
  emit();
}

/** The current pathname + search. Re-renders the caller on navigate() and on browser back/forward. */
export function usePathname() {
  return useSyncExternalStore(
    (onChange) => { listeners.add(onChange); return () => listeners.delete(onChange); },
    currentLocation,
    currentLocation,
  );
}

const isPlainLeftClick = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** Install once at startup: same-origin console links navigate client-side; everything else (the API, /tech, call.html, real files) loads normally. */
export function installLinkInterceptor() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || !isPlainLeftClick(event)) return;
    const link = event.target.closest?.('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (isReservedPath(url.pathname) || /\.[a-z0-9]+$/i.test(url.pathname)) return;
    event.preventDefault();
    navigate(url.pathname + url.search);
  });
}

/** Once at startup: an old "/#/calls" (or "/#/work/appointments?x=1") address becomes "/calls" ("/work/appointments?x=1"). */
export function redirectLegacyHash() {
  if (!location.hash.startsWith('#/')) return;
  const path = location.hash.slice(1) || '/';
  history.replaceState(null, '', path + location.search);
}
