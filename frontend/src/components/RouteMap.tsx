import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { Circle, CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMapEvents } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { DriveEvent, RoutePoint, SeriesPoint } from '../types';
import type { NamedPlace } from '../history/types';
import { elapsedFull, elapsedTick } from '../time';
import { frameAt, valueAt } from '../replay';

// Clicking anywhere on the map names that point as a place (Home, Work…).
function ClickToName({ onClick }: { onClick: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Colourblind-safe speed ramp (ColorBrewer RdBu, reversed: blue = slow, red =
// fast). It carries no green, so red–green colour-vision deficiency can still
// read it, and the bands differ in lightness too.
const SPEED_BANDS: Array<{ max: number; color: string; label: string }> = [
  { max: 30, color: '#0571b0', label: '<30' },
  { max: 70, color: '#92c5de', label: '30–70' },
  { max: 110, color: '#f4a582', label: '70–110' },
  { max: Infinity, color: '#ca0020', label: '110+ km/h' },
];

function speedColor(kmh: number): string {
  return (SPEED_BANDS.find((b) => kmh < b.max) ?? SPEED_BANDS[SPEED_BANDS.length - 1]).color;
}

const EVENT_COLOR: Record<string, string> = {
  hard_brake: '#dc2626', hard_accel: '#ea580c', idle: '#64748b', high_rpm: '#7c3aed', coasting: '#16a34a',
};

interface Props {
  route: RoutePoint[];
  events: DriveEvent[];
  places?: NamedPlace[];
  onMapClick?: (lat: number, lon: number) => void;
  rpm?: SeriesPoint[]; // Engine RPM series for the replay HUD (optional)
}

const REPLAY_SPEEDS = [10, 30, 60]; // drive-seconds per real second

export default function RouteMap({ route, events, places = [], onMapClick, rpm }: Props) {
  const [replayT, setReplayT] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mult, setMult] = useState(30);
  const t0 = route.length > 0 ? route[0].t : 0;
  const tEnd = route.length > 0 ? route[route.length - 1].t : 0;

  // Accelerated clock: every 100 ms of real time advances mult/10 drive-seconds.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setReplayT((cur) => Math.min(tEnd, (cur ?? t0) + mult / 10)), 100);
    return () => clearInterval(id);
  }, [playing, mult, t0, tEnd]);
  useEffect(() => {
    if (replayT != null && replayT >= tEnd) setPlaying(false);
  }, [replayT, tEnd]);
  if (route.length === 0) {
    return (
      <section className="card">
        <h3 className="section-title">Route</h3>
        <p className="placeholder">No GPS data in this drive.</p>
      </section>
    );
  }
  const positions: LatLngExpression[] = route.map((p) => [p.lat, p.lon]);
  const bounds = positions as LatLngBoundsExpression;
  // Cap the colored polyline at ~250 segments so a long drive doesn't mount
  // thousands of Leaflet layers (keeps the map responsive). Always keep the last point.
  const MAX_SEGMENTS = 250;
  const step = Math.max(1, Math.ceil(route.length / MAX_SEGMENTS));
  const sampled = route.filter((_, i) => i % step === 0);
  if (sampled[sampled.length - 1] !== route[route.length - 1]) {
    sampled.push(route[route.length - 1]);
  }
  const segments = sampled.slice(0, -1).map((p, i) => ({
    key: i,
    line: [[p.lat, p.lon], [sampled[i + 1].lat, sampled[i + 1].lon]] as LatLngExpression[],
    color: speedColor(p.speedKmh),
    speedKmh: p.speedKmh,
    t: p.t,
  }));
  const pins = events.filter((e) => e.lat != null && e.lon != null);
  const frame = replayT != null ? frameAt(route, replayT) : null;
  const rpmNow = replayT != null ? valueAt(rpm, replayT) : null;
  return (
    <section className="card" aria-label={`Route map with ${pins.length} event pins`}>
      <h3 className="section-title">Route <small>· {pins.length} event pins</small></h3>
      <div style={{ height: 400, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)' }}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors"
                   url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {segments.map((s) => (
          <Polyline key={s.key} positions={s.line} pathOptions={{ color: s.color, weight: 4 }}>
            <Tooltip sticky>{Math.round(s.speedKmh)} km/h · {elapsedTick(s.t, t0)}</Tooltip>
          </Polyline>
        ))}
        {pins.map((e, i) => (
          <CircleMarker key={i} center={[e.lat as number, e.lon as number]} radius={6}
                        pathOptions={{ color: EVENT_COLOR[e.type] ?? '#334155', fillOpacity: 0.9 }}>
            <Tooltip>{e.type.replace('_', ' ')}{e.durationSeconds ? ` · ${Math.round(e.durationSeconds)}s` : ''}</Tooltip>
          </CircleMarker>
        ))}
        {places.map((p) => (
          // interactive={false}: the circle must never swallow hovers/clicks
          // meant for event pins, the route line, or map-click place naming.
          <Circle key={p.id} center={[p.lat, p.lon]} radius={p.radiusKm * 1000} interactive={false}
                  pathOptions={{ color: '#ff9f1c', weight: 1, fillOpacity: 0.08 }}>
            <Tooltip permanent direction="center" className="place-label">{p.name}</Tooltip>
          </Circle>
        ))}
        {onMapClick && <ClickToName onClick={onMapClick} />}
        {frame && (
          <CircleMarker center={[frame.lat, frame.lon]} radius={9} interactive={false}
                        pathOptions={{ color: '#fff', weight: 2, fillColor: '#ff9f1c', fillOpacity: 1 }} />
        )}
      </MapContainer>
      </div>
      <div className="map-legend" aria-label="Speed legend">
        {SPEED_BANDS.map((b) => (
          <span key={b.label}><i style={{ background: b.color }} /> {b.label}</span>
        ))}
      </div>
      <div className="replay no-print">
        <button className="pill" onClick={() => {
          if (replayT == null || replayT >= tEnd) setReplayT(t0);
          setPlaying((p) => !p);
        }}>
          {playing ? '⏸ pause' : '▶ replay'}
        </button>
        {REPLAY_SPEEDS.map((m) => (
          <button key={m} className={`pill${mult === m ? ' pill--on' : ''}`} aria-pressed={mult === m}
                  onClick={() => setMult(m)}>{m}×</button>
        ))}
        <input type="range" aria-label="replay position" min={t0} max={tEnd} step={1}
               value={replayT ?? t0}
               onChange={(e) => { setReplayT(Number(e.target.value)); }} />
        <span className="replay__hud" role="status">
          {replayT != null && frame
            ? `${elapsedFull(replayT, t0)} · ${Math.round(frame.speedKmh)} km/h${rpmNow != null ? ` · ${Math.round(rpmNow)} rpm` : ''}`
            : `replay the drive (${mult}× speed)`}
        </span>
      </div>
      {onMapClick && (
        <p className="placeholder no-print">
          Click anywhere on the map to name a place (Home, Work…) — it tags your whole history.
        </p>
      )}
    </section>
  );
}
