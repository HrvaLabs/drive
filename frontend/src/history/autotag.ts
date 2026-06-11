import type { DriveAnalysis } from '../types';
import type { NamedPlace } from './types';

const toRad = (d: number) => (d * Math.PI) / 180;
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

// First user-named place whose geo circle contains the point ("Home", "Work").
export function matchPlace(lat: number, lon: number, places: NamedPlace[]): string | null {
  for (const p of places) {
    if (haversineKm(lat, lon, p.lat, p.lon) <= p.radiusKm) return p.name;
  }
  return null;
}

// The drive's effective end names: a user-named place beats the offline town.
export function routeEnds(a: DriveAnalysis, places: NamedPlace[] = []): { from: string | null; to: string | null } {
  const r = a.route ?? [];
  const first = r[0];
  const last = r[r.length - 1];
  return {
    from: (first ? matchPlace(first.lat, first.lon, places) : null) ?? a.drive.fromPlace ?? null,
    to: (last ? matchPlace(last.lat, last.lon, places) : null) ?? a.drive.toPlace ?? null,
  };
}

// Tags a drive earns automatically on save: its places — user-named ("home",
// "work") beating offline-resolved towns — and "round trip" when the route
// genuinely loops back (start/end within 0.5 km AND it actually went
// somewhere — parked logs and short shuffles stay untagged). Users can
// edit/remove them like any tag.
export function autoTags(a: DriveAnalysis, places: NamedPlace[] = []): string[] {
  const tags: string[] = [];
  const ends = routeEnds(a, places);
  for (const p of [ends.from, ends.to]) {
    const t = p?.trim().toLowerCase();
    if (t && !tags.includes(t)) tags.push(t);
  }
  const r = a.route ?? [];
  if (r.length >= 2 && a.summary.distanceKm > 2) {
    const first = r[0];
    const last = r[r.length - 1];
    if (haversineKm(first.lat, first.lon, last.lat, last.lon) < 0.5) tags.push('round trip');
  }
  return tags;
}
