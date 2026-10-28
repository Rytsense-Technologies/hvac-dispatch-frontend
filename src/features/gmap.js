// The Jobs map drawn by Google Maps (the browser key comes from /v1/dispatch/map/config). One map is kept alive and its markers are replaced on each
// refresh, so the live technician positions move without the map reloading or losing the dispatcher's zoom.
import { formatTime } from '../lib/format.js';
import { etaText } from './map.jsx';

let loading = null;
const authListeners = new Set();
// Google tells us AFTER the script has loaded when it refuses the key (wrong website address, API not enabled), so this is separate from loading.
window.gm_authFailure = () => { loading = null; authListeners.forEach((listener) => listener()); };

export function loadGoogle(key) {
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      window.__gmapsReady = () => resolve(window.google.maps);
      const tag = document.createElement('script');
      tag.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__gmapsReady&loading=async&v=weekly`;
      tag.async = true;
      tag.onerror = () => { loading = null; reject(new Error('Google Maps could not be reached')); };
      document.head.append(tag);
    });
  }
  return loading;
}

const COLOURS = { pending: '#b45309', scheduled: '#1d4ed8', en_route: '#7c3aed', arrived: '#0f766e', completed: '#6b7280' };
const usable = (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0);

// Returns {element, update(jobs, positions, onSelectJob), failed: Promise, destroy()}. `element` can be re-attached to the page as often as needed.
export function googleMapView(key) {
  const element = document.createElement('div');
  element.className = 'gmap';
  element.setAttribute('role', 'application');
  element.setAttribute('aria-label', "Map of the day's jobs and technicians on the way");
  let map = null;
  let markers = [];
  let fitted = false;
  let pending = null;
  let destroyed = false;
  const failure = document.createElement('p');
  failure.className = 'note note--warn';
  failure.hidden = true;
  element.append(failure);

  const draw = () => {
    if (destroyed || !map || !pending) return;
    const maps = window.google.maps;
    const { jobs, positions, onSelectJob } = pending;
    markers.forEach((m) => m.setMap(null));
    markers = [];
    const bounds = new maps.LatLngBounds();
    const info = new maps.InfoWindow();
    for (const job of jobs.filter(usable)) {
      const at = { lat: job.latitude, lng: job.longitude };
      const label = formatTime(job.scheduled_at || job.window_start);
      const marker = new maps.Marker({ map, position: at, label: { text: label, fontSize: '11px', fontWeight: '600' },
        icon: { path: maps.SymbolPath.CIRCLE, scale: 11, fillColor: COLOURS[job.progress] || COLOURS.scheduled, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2, labelOrigin: new maps.Point(0, -2.1) },
        title: `${job.service_type || 'Job'} · ${label}${job.technician_name ? ` · ${job.technician_name}` : ' · needs a technician'}` });
      marker.addListener('click', () => onSelectJob && onSelectJob(job));
      markers.push(marker);
      bounds.extend(at);
    }
    for (const p of positions.filter(usable)) {
      const at = { lat: p.latitude, lng: p.longitude };
      const marker = new maps.Marker({ map, position: at, zIndex: 999, title: `${p.name} · ${etaText(p)}`,
        icon: { path: maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 6, fillColor: p.stale ? '#9ca3af' : '#16a34a', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 } });
      marker.addListener('click', () => {
        const text = document.createElement('div');
        text.textContent = `${p.name}: ${etaText(p)}`;   // text only: a technician's name is free text and must never be read as HTML
        info.setContent(text);
        info.open({ map, anchor: marker });
      });
      markers.push(marker);
      bounds.extend(at);
      if (usable(p.job)) {
        const line = new maps.Polyline({ map, path: [at, { lat: p.job.latitude, lng: p.job.longitude }], strokeColor: p.stale ? '#9ca3af' : '#16a34a', strokeOpacity: 0.8, strokeWeight: 3,
          icons: p.stale ? [] : [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '14px' }] });
        markers.push({ setMap: (m) => line.setMap(m) });
      }
    }
    if (!fitted && !bounds.isEmpty()) {
      map.fitBounds(bounds, 48);
      if (map.getZoom() > 16) map.setZoom(16);
      fitted = true;
    }
  };

  let signalFailed;
  const failed = new Promise((resolve) => { signalFailed = resolve; }); // resolves true only if Google cannot be used; the page then draws its own map
  const onAuthFailure = () => {
    failure.textContent = 'Google refused the map key (check the website address it allows and that the Maps JavaScript API is enabled). The plain map is shown instead.';
    failure.hidden = false;
    signalFailed(true);
  };
  authListeners.add(onAuthFailure);
  loadGoogle(key).then((maps) => {
    if (destroyed) return;
    map = new maps.Map(element, { center: { lat: 13.0827, lng: 80.2707 }, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, clickableIcons: false });
    element.append(failure);
    draw();
  }).catch((error) => {
    if (destroyed) return;
    failure.textContent = `${error.message}. The plain map is shown instead.`;
    failure.hidden = false;
    signalFailed(true);
  });

  return {
    element,
    failed,
    update(jobs, positions, onSelectJob) { pending = { jobs, positions, onSelectJob }; draw(); },
    refit() { fitted = false; draw(); },
    // Called when the screen goes away: stop listening for Google's key refusal and take the markers off the map.
    destroy() {
      destroyed = true;
      authListeners.delete(onAuthFailure);
      markers.forEach((m) => m.setMap(null));
      markers = [];
      element.remove();
    },
  };
}
