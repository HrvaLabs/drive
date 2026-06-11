import type { DriveMeta } from './types';

export type Period = 'day' | 'week' | 'month' | 'year';

export interface Bucket {
  key: string;
  label: string;
  count: number;
  distanceKm: number;
  fuelL: number;
  costEur: number;
  co2Kg: number;
  avgL100: number;
  avgEco: number;
}

export interface Totals {
  count: number;
  distanceKm: number;
  fuelL: number;
  costEur: number;
  co2Kg: number;
  avgL100: number;
  avgEco: number;
}

const round = (n: number, p = 2) => Math.round(n * 10 ** p) / 10 ** p;
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

function periodKey(d: Date, period: Period): { key: string; label: string } {
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (period === 'year') {
    return { key: String(y), label: String(y) };
  }
  if (period === 'month') {
    return { key: `${y}-${mm}`, label: d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) };
  }
  if (period === 'week') {
    const t = new Date(Date.UTC(y, d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // nearest Thursday (ISO)
    const week1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const wk = 1 + Math.round((t.getTime() - week1.getTime()) / 604800000);
    // ISO key for stable sorting; the LABEL names the Monday the week starts
    // on — "Wk 24 2026" means nothing to most people.
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const label = `Wk of ${monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    return { key: `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`, label };
  }
  return { key: `${y}-${mm}-${String(d.getDate()).padStart(2, '0')}`, label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) };
}

export function bucketBy(drives: DriveMeta[], period: Period): Bucket[] {
  const acc = new Map<string, { b: Bucket; l100: number[]; eco: number[] }>();
  for (const d of drives) {
    const { key, label } = periodKey(new Date(d.driveDate ?? d.savedAt), period);
    let e = acc.get(key);
    if (!e) {
      e = { b: { key, label, count: 0, distanceKm: 0, fuelL: 0, costEur: 0, co2Kg: 0, avgL100: 0, avgEco: 0 }, l100: [], eco: [] };
      acc.set(key, e);
    }
    e.b.count += 1;
    e.b.distanceKm += d.distanceKm;
    e.b.fuelL += d.fuelUsedL;
    e.b.costEur += d.costEur;
    e.b.co2Kg += d.co2Kg;
    if (d.l100km > 0) e.l100.push(d.l100km);
    e.eco.push(d.eco);
  }
  return [...acc.values()]
    .map(({ b, l100, eco }) => ({
      ...b,
      distanceKm: round(b.distanceKm, 1),
      fuelL: round(b.fuelL, 2),
      costEur: round(b.costEur, 2),
      co2Kg: round(b.co2Kg, 2),
      avgL100: round(mean(l100), 2),
      avgEco: Math.round(mean(eco)),
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function totals(drives: DriveMeta[]): Totals {
  const l100 = drives.filter((d) => d.l100km > 0).map((d) => d.l100km);
  return {
    count: drives.length,
    distanceKm: round(drives.reduce((s, d) => s + d.distanceKm, 0), 1),
    fuelL: round(drives.reduce((s, d) => s + d.fuelUsedL, 0), 2),
    costEur: round(drives.reduce((s, d) => s + d.costEur, 0), 2),
    co2Kg: round(drives.reduce((s, d) => s + d.co2Kg, 0), 2),
    avgL100: round(mean(l100), 2),
    avgEco: Math.round(mean(drives.map((d) => d.eco))),
  };
}
