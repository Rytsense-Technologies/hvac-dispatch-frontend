// The map on the Jobs page: job pins and, for technicians who are on the way, their latest position and a line to the job they are heading for.
// Drawn here as plain SVG from the coordinates alone: no map service, no key, no outside request, and nothing about a customer leaves the page.
// It shows WHERE things are relative to each other (with a distance scale), not streets; the road time to the job comes from the server.
import { forwardRef, useLayoutEffect } from 'react';
import { formatTime, span } from './format.js';

const W = 760;
const H = 440;
const PAD = 46;
const MIN_SPAN_DEG = 0.012; // about 1.3 km: a single point or two close ones still get a sensible picture

const usable = (p) => p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && !(p.latitude === 0 && p.longitude === 0);

// Straight-line metres between two points (haversine). Used only for the scale bar and the picture, never as a travel time.
export function metres(a, b) {
  const r = (d) => (d * Math.PI) / 180;
  const x = Math.sin(r(b.latitude - a.latitude) / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371008.8 * Math.asin(Math.min(1, Math.sqrt(x)));
}

// Project latitude/longitude onto the drawing: equirectangular, corrected for how much narrower a degree of longitude is away from the equator.
export function makeProjection(points) {
  const lats = points.map((p) => p.latitude);
  const lons = points.map((p) => p.longitude);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const spanLat = Math.max(Math.max(...lats) - Math.min(...lats), MIN_SPAN_DEG);
  const spanLon = Math.max((Math.max(...lons) - Math.min(...lons)) * k, MIN_SPAN_DEG);
  const scale = Math.min((W - 2 * PAD) / spanLon, (H - 2 * PAD) / spanLat);
  const midLon = (Math.min(...lons) + Math.max(...lons)) / 2;
  return {
    x: (lon) => W / 2 + (lon - midLon) * k * scale,
    y: (lat) => H / 2 - (lat - midLat) * scale,
    // One degree of latitude is about 111.2 km and the drawing is the same scale both ways, so a pixel is this many metres wherever you look.
    metresPerPixel: 111_195 / scale,
  };
}

// Same idea on the web-mercator grid street-map tiles use, so the pictures line up with the pins. World units run 0..1 across the whole earth.
const worldX = (lon) => (lon + 180) / 360;
const worldY = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360)) / (2 * Math.PI);

export function makeMercator(points, maxZoom = 18) {
  const xs = points.map((p) => worldX(p.longitude));
  const ys = points.map((p) => worldY(p.latitude));
  const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
  const minSpan = MIN_SPAN_DEG / 360;
  const scale = Math.min((W - 2 * PAD) / Math.max(Math.max(...xs) - Math.min(...xs), minSpan), (H - 2 * PAD) / Math.max(Math.max(...ys) - Math.min(...ys), minSpan));
  const zoom = Math.max(0, Math.min(maxZoom, Math.round(Math.log2(scale / 256))));
  const midLat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const view = {
    x: (lon) => W / 2 + (worldX(lon) - midX) * scale,
    y: (lat) => H / 2 + (worldY(lat) - midY) * scale,
    metresPerPixel: (40_075_017 * Math.cos((midLat * Math.PI) / 180)) / scale,
    zoom,
  };
  // every tile that touches the picture: [{x, y, left, top, size}]
  const n = 2 ** zoom;
  const size = scale / n;
  const fromX = Math.floor((midX - W / 2 / scale) * n);
  const toX = Math.floor((midX + W / 2 / scale) * n);
  const fromY = Math.floor((midY - H / 2 / scale) * n);
  const toY = Math.floor((midY + H / 2 / scale) * n);
  view.tiles = [];
  for (let tx = fromX; tx <= toX; tx += 1) {
    for (let ty = fromY; ty <= toY; ty += 1) {
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) continue;
      view.tiles.push({ x: tx, y: ty, left: W / 2 + (tx / n - midX) * scale, top: H / 2 + (ty / n - midY) * scale, size });
    }
  }
  return view;
}

// A round distance for the scale bar that is about 110 px wide.
export function niceScale(metresPerPixel) {
  const target = metresPerPixel * 110;
  const steps = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
  const metresLong = steps.find((m) => m >= target) || steps[steps.length - 1];
  return { metres: metresLong, pixels: metresLong / metresPerPixel, label: metresLong >= 1000 ? `${metresLong / 1000} km` : `${metresLong} m` };
}

export function ageText(seconds) {
  if (seconds < 20) return 'just now';
  if (seconds < 90) return `${Math.round(seconds)} s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

export function etaText(position) {
  if (position.stale) return `last seen ${ageText(position.age_seconds)} · the technician's phone page may be asleep`;
  if (position.eta_seconds === null || position.eta_seconds === undefined) {
    return position.job ? `heading for a job · ${ageText(position.age_seconds)}` : ageText(position.age_seconds);
  }
  const km = position.road_distance_meters >= 1000 ? `${(position.road_distance_meters / 1000).toFixed(1)} km` : `${position.road_distance_meters} m`;
  return `about ${span(position.eta_seconds / 60)} away (${km} by road) · seen ${ageText(position.age_seconds)}`;
}

// jobs: [{id, latitude, longitude, progress, scheduled_at, service_type, technician_name}], positions: the server's list.
// streets: {enabled, tiles, max_zoom, attribution} from /v1/dispatch/map/config; absent or disabled = the plain coordinate map.
export function DrawMap({ jobs, positions, selectedId, onSelectJob, streets }) {
  const jobPoints = jobs.filter(usable);
  const people = positions.filter(usable);
  const targets = people.map((p) => p.job).filter(usable);
  const all = [...jobPoints, ...people, ...targets];
  if (!all.length) return <p className="empty">Nothing to put on the map yet: no job on this day has a location.</p>;

  const withStreets = Boolean(streets && streets.enabled && streets.tiles);
  const view = withStreets ? makeMercator(all, streets.max_zoom) : makeProjection(all);
  const bar = niceScale(view.metresPerPixel);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="map" role="img"
      aria-label={`Map of ${jobPoints.length} job location${jobPoints.length === 1 ? '' : 's'} and ${people.length} technician${people.length === 1 ? '' : 's'} on the way`}>
      <rect x={0} y={0} width={W} height={H} className="map-bg" rx={12} />
      {withStreets ? (
        <>
          <clipPath id="map-clip"><rect x={0} y={0} width={W} height={H} rx={12} /></clipPath>
          <g clipPath="url(#map-clip)" className="map-tiles">
            {view.tiles.map((t) => (
              <image key={`${t.x}/${t.y}`} href={streets.tiles.replace('{z}', view.zoom).replace('{x}', t.x).replace('{y}', t.y)} x={t.left} y={t.top} width={t.size + 0.5} height={t.size + 0.5} />
            ))}
          </g>
          {streets.attribution ? <text x={8} y={H - 8} className="map-attribution">{streets.attribution}</text> : null}
        </>
      ) : (
        <>
          {[1, 2, 3, 4, 5].map((i) => <line key={`v${i}`} x1={(W / 6) * i} y1={0} x2={(W / 6) * i} y2={H} className="map-grid" />)}
          {[1, 2, 3].map((i) => <line key={`h${i}`} x1={0} y1={(H / 4) * i} x2={W} y2={(H / 4) * i} className="map-grid" />)}
        </>
      )}

      <g className="map-scale" transform={`translate(${W - bar.pixels - 20} ${H - 20})`}>
        <line x1={0} y1={0} x2={bar.pixels} y2={0} />
        <line x1={0} y1={-5} x2={0} y2={5} />
        <line x1={bar.pixels} y1={-5} x2={bar.pixels} y2={5} />
        <text x={bar.pixels / 2} y={-8} textAnchor="middle">{bar.label}</text>
      </g>
      <g className="map-north" transform="translate(26 34)"><path d="M0 -16 L7 6 L0 1 L-7 6 Z" /><text x={0} y={22} textAnchor="middle">N</text></g>

      {/* a line from each technician on the way to the job they are heading for */}
      {people.map((p, i) => (usable(p.job)
        ? <line key={`route${i}`} x1={view.x(p.longitude)} y1={view.y(p.latitude)} x2={view.x(p.job.longitude)} y2={view.y(p.job.latitude)} className={`map-route ${p.stale ? 'map-route--stale' : ''}`} />
        : null))}

      {jobPoints.map((job) => {
        const x = view.x(job.longitude);
        const y = view.y(job.latitude);
        const time = formatTime(job.scheduled_at || job.window_start);
        return (
          <g key={job.id} className={`pin pin--${job.progress} ${job.id === selectedId ? 'pin--selected' : ''}`} transform={`translate(${x} ${y})`} tabIndex={0} role="button"
            aria-label={`${job.service_type || 'Job'} at ${time}${job.technician_name ? `, ${job.technician_name}` : ', needs a technician'}`}
            onClick={() => onSelectJob && onSelectJob(job)}
            onKeyDown={(e) => { if (e.key === 'Enter' && onSelectJob) onSelectJob(job); }}>
            <title>{`${job.service_type || 'Job'} · ${time}${job.technician_name ? ` · ${job.technician_name}` : ' · needs a technician'}`}</title>
            <circle r={8} />
            <text x={0} y={-13} textAnchor="middle">{time}</text>
          </g>
        );
      })}

      {people.map((p, i) => {
        const x = view.x(p.longitude);
        const y = view.y(p.latitude);
        const radius = p.accuracy_meters ? Math.min(60, Math.max(0, p.accuracy_meters / (view.metresPerPixel || 1))) : 0;
        return (
          <g key={`tech${i}`} className={`tech ${p.stale ? 'tech--stale' : 'tech--fresh'}`} transform={`translate(${x} ${y})`}>
            <title>{`${p.name} · ${etaText(p)}`}</title>
            {radius > 4 ? <circle className="tech-accuracy" r={radius} /> : null}
            <path d="M0 -11 L10 0 L0 11 L-10 0 Z" />
            <text x={0} y={26} textAnchor="middle">{p.name}</text>
          </g>
        );
      })}
    </svg>
  );
}

const LegendItem = ({ cls, text }) => <span className="legend__item"><i className={`legend__dot ${cls}`} />{text}</span>;

export const Legend = forwardRef(function Legend(_props, ref) {
  return (
    <div className="legend" ref={ref}>
      <LegendItem cls="pin--pending" text="needs a technician" />
      <LegendItem cls="pin--scheduled" text="booked" />
      <LegendItem cls="pin--en_route" text="on the way" />
      <LegendItem cls="pin--arrived" text="on site" />
      <LegendItem cls="pin--completed" text="done" />
      <LegendItem cls="legend__tech" text="technician (live)" />
      <LegendItem cls="legend__tech legend__tech--stale" text="last seen" />
    </div>
  );
});

// Puts the long-lived Google map element (see gmap.js) in the page just before `anchorRef` (the legend), exactly where the original put it,
// and takes it out again when this unmounts. The map itself survives being hidden and shown, so the dispatcher's zoom is kept.
export function GoogleMap({ view, anchorRef, jobs, positions, onSelectJob }) {
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor || !anchor.parentNode) return undefined;
    anchor.parentNode.insertBefore(view.element, anchor);
    return () => { view.element.remove(); };
  }, [view, anchorRef]);
  useLayoutEffect(() => { view.update(jobs, positions, onSelectJob); }, [view, jobs, positions, onSelectJob]);
  return null;
}
