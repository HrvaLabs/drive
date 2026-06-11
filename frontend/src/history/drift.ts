import type { DriveMeta } from './types';
import { isParkedLog } from './quality';

// Consumption-drift maintenance flag. Calibrated on the real 53-drive corpus
// (scripts/probe_drift.py): a healthy car's rolling drift stayed within
// −15%…+10% across winter→summer, so ±15% cleared with zero false alarms.
// Spec: docs/specs/2026-06-11-consumption-drift-design.md
export const DRIFT_BASELINE_MIN = 8;
export const DRIFT_RECENT_N = 5;
export const DRIFT_THRESHOLD_PCT = 15;

export interface DriftResult {
  baseline: number;
  recent: number;
  driftPct: number;
  usableDrives: number;
  verdict: 'rising' | 'stable' | 'improving';
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function consumptionDrift(drives: DriveMeta[]): DriftResult | null {
  const usable = drives
    .filter((d) => !isParkedLog(d) && d.l100km > 0)
    .sort((a, b) => (a.driveDate ?? a.savedAt) - (b.driveDate ?? b.savedAt))
    .map((d) => d.l100km);
  if (usable.length < DRIFT_BASELINE_MIN + DRIFT_RECENT_N) return null;
  const baseline = median(usable.slice(0, -DRIFT_RECENT_N));
  const recent = median(usable.slice(-DRIFT_RECENT_N));
  if (baseline <= 0) return null;
  const driftPct = ((recent - baseline) / baseline) * 100;
  const verdict = driftPct >= DRIFT_THRESHOLD_PCT ? 'rising'
    : driftPct <= -DRIFT_THRESHOLD_PCT ? 'improving' : 'stable';
  return { baseline, recent, driftPct, usableDrives: usable.length, verdict };
}
