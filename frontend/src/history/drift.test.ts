import { describe, it, expect } from 'vitest';
import { consumptionDrift } from './drift';
import type { DriveMeta } from './types';

let seq = 0;
const d = (l100km: number, over: Partial<DriveMeta> = {}): DriveMeta => ({
  id: String(++seq), savedAt: seq, driveDate: seq * 86400000, startedAtClock: null, label: 'Drive',
  distanceKm: 20, durationSeconds: 600, fuelUsedL: 1.2, costEur: 2, co2Kg: 2, l100km, eco: 60, ...over,
});

describe('consumptionDrift', () => {
  it('needs at least 13 usable drives', () => {
    expect(consumptionDrift(Array.from({ length: 12 }, () => d(6)))).toBeNull();
  });

  it('excludes parked logs and missing-fuel drives from the series', () => {
    const drives = [
      ...Array.from({ length: 13 }, () => d(6)),
      d(0),                          // no fuel data
      d(99, { distanceKm: 0.2 }),    // parked log
    ];
    const r = consumptionDrift(drives);
    expect(r?.usableDrives).toBe(13);
    expect(r?.verdict).toBe('stable');
  });

  it('flags a rising trend at +15% or more', () => {
    const drives = [...Array.from({ length: 12 }, () => d(6)), ...Array.from({ length: 5 }, () => d(7))];
    const r = consumptionDrift(drives)!;
    expect(r.baseline).toBeCloseTo(6, 5);
    expect(r.recent).toBeCloseTo(7, 5);
    expect(r.driftPct).toBeCloseTo(16.7, 1);
    expect(r.verdict).toBe('rising');
  });

  it('stays stable inside the probe-observed noise envelope', () => {
    const drives = [...Array.from({ length: 12 }, () => d(6)), ...Array.from({ length: 5 }, () => d(6.5))];
    expect(consumptionDrift(drives)?.verdict).toBe('stable'); // +8.3% — real-data noise reached +10%
  });

  it('reports an improving trend at -15% or less', () => {
    const drives = [...Array.from({ length: 12 }, () => d(6)), ...Array.from({ length: 5 }, () => d(5))];
    expect(consumptionDrift(drives)?.verdict).toBe('improving');
  });

  it('sorts by drive date internally', () => {
    const recent = Array.from({ length: 5 }, () => d(7));
    const baseline = Array.from({ length: 12 }, () => d(6));
    // baseline drives carry EARLIER dates even though passed after
    baseline.forEach((b, i) => { b.driveDate = (i + 1) * 1000; });
    const r = consumptionDrift([...recent, ...baseline])!;
    expect(r.verdict).toBe('rising');
  });
});
