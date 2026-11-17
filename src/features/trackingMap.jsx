// "Technician locations": a real street map (Leaflet + OpenStreetMap tiles) of the technicians who are on the way, from GET /v1/team/tracking.
// For each technician: a green dot where the phone is now (grey when the position is old), a blue pin on the job they are heading to, a flag where they set off
// ("Started here") and a dashed line start -> now -> job. The map is fitted to everything on it and kept alive between refreshes (the dispatcher's zoom is not reset).
// Every name and text goes into the popups as TEXT (DOM nodes), never as markup. Tiles: © OpenStreetMap contributors (shown on the map).
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
const GREEN = '#16a34a';
const GREY = '#9ca3af';
const BLUE = '#1d4ed8';
const PROGRESS_TEXT = { scheduled: 'Booked', en_route: 'On the way', arrived: 'Arrived', in_progress: 'Working', completed: 'Done' };

export const usable = (p) => !!p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)
  && !(p.latitude === 0 && p.longitude === 0) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180;

/** "12 min away", or null when the server could not work a travel time out (the phone is too far from the job to route). */
export function etaText(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes < 60 ? `${minutes} min away` : `${Math.floor(minutes / 60)} h ${minutes % 60} min away`;
}

/** "8.2 km" / "450 m", or null. */
export function distanceText(metres) {
  if (metres === null || metres === undefined || !Number.isFinite(metres)) return null;
  return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;
}

/** The pieces of one technician that can be drawn, in the order of the trip. */
export function pointsOf(tech) {
  const start = usable(tech.started_from) ? tech.started_from : null;
  const now = usable(tech.location) ? tech.location : null;
  const job = usable(tech.job) ? tech.job : null;
  return { start, now, job, trip: [start, now, job].filter(Boolean) };
}

// Leaflet reads a STRING given to a popup or tooltip as HTML: a technician's name is free text, so it always goes in as a text node.
const textNode = (text) => {
  const span = document.createElement('span');
  span.textContent = String(text);
  return span;
};

function popup(...parts) {
  const box = document.createElement('div');
  box.className = 'tmap-popup';
  parts.filter(Boolean).forEach((text, index) => {
    const line = document.createElement(index === 0 ? 'strong' : 'div');
    line.textContent = String(text);
    box.append(line);
  });
  return box;
}

const pinIcon = (colour) => L.divIcon({
  className: 'tmap-pin-wrap', html: `<span class="tmap-pin" style="background:${colour}"></span>`, iconSize: [22, 30], iconAnchor: [11, 30], popupAnchor: [0, -28],
});
const flagIcon = () => L.divIcon({
  className: 'tmap-pin-wrap', html: '<span class="tmap-flag">Started here</span>', iconSize: [96, 22], iconAnchor: [8, 22], popupAnchor: [40, -20],
});

function draw(map, layer, technicians, signature) {
  layer.clearLayers();
  const bounds = [];
  let located = 0;
  technicians.forEach((tech) => {
    const { start, now, job, trip } = pointsOf(tech);
    const stale = Boolean(tech.location && tech.location.stale);
    const colour = stale ? GREY : GREEN;
    if (trip.length > 1) {
      L.polyline(trip.map((p) => [p.latitude, p.longitude]), { color: colour, weight: 3, opacity: 0.85, dashArray: '8 8' }).addTo(layer);
    }
    if (start) {
      const at = start.at ? new Date(start.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;
      L.marker([start.latitude, start.longitude], { icon: flagIcon(), keyboard: false, zIndexOffset: 100 })
        .bindPopup(popup('Started here', tech.name, at ? `Set off ${at}` : null)).addTo(layer);
      bounds.push([start.latitude, start.longitude]);
    }
    if (job) {
      L.marker([job.latitude, job.longitude], { icon: pinIcon(BLUE), keyboard: false })
        .bindPopup(popup(job.service || 'Job', PROGRESS_TEXT[job.progress], tech.name ? `Technician: ${tech.name}` : null)).addTo(layer);
      bounds.push([job.latitude, job.longitude]);
    }
    if (now) {
      located += 1;
      L.circleMarker([now.latitude, now.longitude], { radius: 10, color: '#ffffff', weight: 3, fillColor: colour, fillOpacity: 1 })
        .bindPopup(popup(tech.name, tech.tracking_text, tech.status && tech.status.label, etaText(tech.eta_seconds), distanceText(tech.distance_meters)))
        .bindTooltip(textNode(tech.name || 'Technician'), { permanent: true, direction: 'auto', offset: [0, -4], className: 'tmap-label' }).addTo(layer);
      bounds.push([now.latitude, now.longitude]);
    }
  });
  if (!located) {
    // Nobody is sharing a position: the map still shows where the team starts from.
    const bases = technicians.map((t) => t.base).filter(usable);
    bases.forEach((b) => L.circleMarker([b.latitude, b.longitude], { radius: 7, color: '#ffffff', weight: 2, fillColor: GREY, fillOpacity: 1 })
      .bindTooltip('Office', { direction: 'top' }).addTo(layer));
    bounds.push(...bases.map((b) => [b.latitude, b.longitude]));
  }
  const next = bounds.map((b) => b.map((n) => n.toFixed(2)).join(',')).sort().join('|');
  if (bounds.length && next !== signature.current) {      // refit only when what is on the map changed: a refresh must not undo the dispatcher's zoom
    signature.current = next;
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
  }
}

/** @param {{ technicians: object[] }} props  `technicians` is `technicians[]` of GET /v1/team/tracking. */
export default function TechnicianMap({ technicians }) {
  const box = useRef(null);
  const state = useRef({ map: null, layer: null, signature: { current: '' } });

  useEffect(() => {
    const map = L.map(box.current, { zoomControl: true, attributionControl: true, worldCopyJump: true }).setView([39.5, -98.35], 4);
    L.tileLayer(TILES, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    const layer = L.layerGroup().addTo(map);
    state.current = { map, layer, signature: { current: '' } };
    map.invalidateSize();
    return () => { map.remove(); state.current = { map: null, layer: null, signature: { current: '' } }; };
  }, []);

  useEffect(() => {
    const { map, layer, signature } = state.current;
    if (!map) return;
    map.invalidateSize();                                  // measure the box before fitting the markers
    draw(map, layer, technicians || [], signature);
  }, [technicians]);

  return <div ref={box} className="tracking-leaflet" role="application" aria-label="Map of the technicians and the jobs they are heading to" />;
}
