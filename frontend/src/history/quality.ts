import type { DriveMeta } from './types';

// A "parked log" is a recording that never really moved — a diagnostic session,
// idle-only or no-speed capture (distance < 500 m). It's data, not a drive:
// marked in the list and optionally hidden so it can't poison the stats.
export function isParkedLog(d: DriveMeta): boolean {
  return d.distanceKm < 0.5;
}
