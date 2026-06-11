import type { RoutePoint, SeriesPoint } from './types';

// Drive replay helpers: the stored route is ~1 Hz (t, lat, lon, speed), so a
// frame at any t is a linear interpolation of the bracketing samples; gauge
// values (RPM etc.) snap to the nearest sample.

export interface ReplayFrame { lat: number; lon: number; speedKmh: number }

export function frameAt(route: RoutePoint[], t: number): ReplayFrame | null {
  if (route.length === 0) return null;
  if (t <= route[0].t) return route[0];
  const last = route[route.length - 1];
  if (t >= last.t) return last;
  let lo = 0;
  let hi = route.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (route[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = route[lo];
  const b = route[hi];
  const f = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lon: a.lon + (b.lon - a.lon) * f,
    speedKmh: a.speedKmh + (b.speedKmh - a.speedKmh) * f,
  };
}

export function valueAt(points: SeriesPoint[] | undefined, t: number): number | null {
  if (!points || points.length === 0) return null;
  if (t <= points[0].t) return points[0].v;
  let lo = 0;
  let hi = points.length - 1;
  if (t >= points[hi].t) return points[hi].v;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid; else hi = mid;
  }
  return t - points[lo].t <= points[hi].t - t ? points[lo].v : points[hi].v;
}
