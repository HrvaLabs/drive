import type { DriveMeta } from './types';
import { isParkedLog } from './quality';
import type { CompareRow, Better } from './compareMetrics';

// "Latest vs typical": the newest usable drive carrying a tag against the
// MEDIAN of the previous usable drives with that tag. Needs latest + >= 3
// previous so "typical" means something. Parked logs never participate.
export interface TypicalComparison {
  latest: DriveMeta;
  n: number; // previous drives behind the median
  rows: CompareRow[];
}

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round2 = (n: number) => Math.round(n * 100) / 100;
const f0 = (n: number) => Math.round(n).toString();
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

function row(label: string, typical: number | null, latest: number | null, better: Better, fmt: (n: number) => string): CompareRow {
  const delta = typical != null && latest != null ? round2(latest - typical) : null;
  return { label, a: typical != null ? round2(typical) : null, b: latest, delta, better, fmt };
}

const usableWithTag = (drives: DriveMeta[], tag: string) =>
  drives
    .filter((d) => !isParkedLog(d) && (d.tags ?? []).includes(tag))
    .sort((a, b) => (b.driveDate ?? b.savedAt) - (a.driveDate ?? a.savedAt));

export function qualifyingTags(drives: DriveMeta[]): string[] {
  const counts = new Map<string, number>();
  for (const d of drives) {
    if (isParkedLog(d)) continue;
    for (const t of d.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n >= 4).map(([t]) => t).sort((a, b) => a.localeCompare(b));
}

export function typicalComparison(drives: DriveMeta[], tag: string): TypicalComparison | null {
  const usable = usableWithTag(drives, tag);
  if (usable.length < 4) return null;
  const [latest, ...prev] = usable;
  const pos = (xs: number[]) => xs.filter((x) => x > 0);
  const perKm = (d: DriveMeta) => (d.costEur > 0 && d.distanceKm > 0 ? d.costEur / d.distanceKm : null);
  const rows: CompareRow[] = [
    row('Distance km', median(prev.map((d) => d.distanceKm)), latest.distanceKm, 'neutral', f1),
    row('Cost €', median(pos(prev.map((d) => d.costEur))), latest.costEur > 0 ? latest.costEur : null, 'neutral', f2),
    row('€/km', median(prev.map(perKm).filter((x): x is number => x != null)), perKm(latest), 'down', f2),
    row('L/100km', median(pos(prev.map((d) => d.l100km))), latest.l100km > 0 ? latest.l100km : null, 'down', f1),
    row('Eco score', median(prev.map((d) => d.eco)), latest.eco, 'up', f0),
  ];
  return { latest, n: prev.length, rows };
}
