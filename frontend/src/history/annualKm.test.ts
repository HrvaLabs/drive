import { describe, it, expect } from 'vitest';
import { estimateAnnualKm } from './annualKm';
import type { DriveMeta } from './types';

const DAY = 86400000;
let seq = 0;
const d = (driveDate: number, distanceKm = 30): DriveMeta => ({
  id: String(++seq), savedAt: driveDate, driveDate, startedAtClock: null, label: 'Drive',
  distanceKm, durationSeconds: 600, fuelUsedL: 2, costEur: 3, co2Kg: 5, l100km: 6, eco: 60,
});

describe('estimateAnnualKm', () => {
  it('annualises logged km over the recording span', () => {
    // 5 drives × 30 km over 30 days = 150 km / 30 d → ~1826 km/yr → rounded to 1800
    const drives = [0, 7, 14, 21, 30].map((day) => d(day * DAY + DAY));
    expect(estimateAnnualKm(drives)).toBe(1800);
  });

  it('needs at least 5 real drives across at least 14 days', () => {
    expect(estimateAnnualKm([d(DAY), d(2 * DAY), d(3 * DAY), d(20 * DAY)])).toBeNull(); // 4 drives
    expect(estimateAnnualKm([1, 2, 3, 4, 5].map((x) => d(x * DAY)))).toBeNull();        // 5-day span
  });

  it('ignores parked logs and undated drives', () => {
    const drives = [
      ...[0, 7, 14, 21, 30].map((day) => d(day * DAY + DAY)),
      { ...d(15 * DAY), distanceKm: 0.1 },          // parked
      { ...d(16 * DAY), driveDate: null },          // no real date
    ];
    expect(estimateAnnualKm(drives)).toBe(1800);
  });
});
