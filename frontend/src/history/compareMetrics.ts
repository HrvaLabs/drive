import type { DriveAnalysis } from '../types';
import type { Bucket } from './aggregate';

export type Better = 'up' | 'down' | 'neutral';

export interface CompareRow {
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  better: Better;
  fmt: (n: number) => string;
}

const GOOD = '#1a9850';
const BAD = '#d73027';
const MUTED = '#9aa0a6';

const round = (n: number) => Math.round(n * 100) / 100;
const f0 = (n: number) => Math.round(n).toString();
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

// Derived ratio metrics report 0 when undefined (e.g. sub-1km drive); treat 0 as missing.
const ratio = (n: number | undefined | null): number | null => (n && n > 0 ? n : null);
const val = (n: number | undefined | null): number | null => (n == null || Number.isNaN(n) ? null : n);

function row(label: string, a: number | null, b: number | null, better: Better, fmt: (n: number) => string): CompareRow {
  const delta = a != null && b != null ? round(b - a) : null;
  return { label, a, b, delta, better, fmt };
}

export function buildCompareRows(a: DriveAnalysis, b: DriveAnalysis): CompareRow[] {
  return [
    row('L/100km', ratio(a.summary.avgConsumptionL100km), ratio(b.summary.avgConsumptionL100km), 'down', f1),
    row('Cost €/km', ratio(a.economy.costPerKm), ratio(b.economy.costPerKm), 'down', f2),
    row('CO₂ g/km', ratio(a.summary.co2PerKmG), ratio(b.summary.co2PerKmG), 'down', f0),
    row('Eco score', val(a.scores.eco), val(b.scores.eco), 'up', f0),
    row('Idle %', val(a.scores.idlePct), val(b.scores.idlePct), 'down', f1),
    row('Distance km', val(a.summary.distanceKm), val(b.summary.distanceKm), 'neutral', f1),
    row('Avg speed km/h', val(a.summary.avgSpeedKmh), val(b.summary.avgSpeedKmh), 'neutral', f0),
  ];
}

// Period (Bucket) compare: absolute totals stay neutral (driving more SHOULD
// cost more); only honest ratios are judged good/bad.
export function buildPeriodCompareRows(a: Bucket, b: Bucket): CompareRow[] {
  const perKm = (x: Bucket): number | null => (x.distanceKm > 0 ? round(x.costEur / x.distanceKm) : null);
  return [
    row('Drives', val(a.count), val(b.count), 'neutral', f0),
    row('Distance km', val(a.distanceKm), val(b.distanceKm), 'neutral', f1),
    row('Fuel L', val(a.fuelL), val(b.fuelL), 'neutral', f2),
    row('Cost €', val(a.costEur), val(b.costEur), 'neutral', f2),
    row('€/km', perKm(a), perKm(b), 'down', f2),
    row('CO₂ kg', val(a.co2Kg), val(b.co2Kg), 'neutral', f2),
    row('Avg L/100km', ratio(a.avgL100), ratio(b.avgL100), 'down', f1),
    row('Avg eco', val(a.avgEco), val(b.avgEco), 'up', f0),
  ];
}

export function deltaColor(delta: number | null, better: Better): string {
  if (delta == null || delta === 0 || better === 'neutral') return MUTED;
  const improved = better === 'down' ? delta < 0 : delta > 0;
  return improved ? GOOD : BAD;
}
