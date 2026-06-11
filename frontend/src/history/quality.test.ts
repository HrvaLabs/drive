import { describe, it, expect } from 'vitest';
import { isParkedLog } from './quality';
import type { DriveMeta } from './types';

const d = (over: Partial<DriveMeta>): DriveMeta => ({
  id: 'x', savedAt: 1, startedAtClock: null, label: 'Drive', distanceKm: 10, durationSeconds: 600,
  fuelUsedL: 1, costEur: 2, co2Kg: 2, l100km: 6, eco: 60, ...over,
});

describe('isParkedLog', () => {
  it('flags logs that never really moved', () => {
    expect(isParkedLog(d({ distanceKm: 0 }))).toBe(true);          // distance zero / idle-only
    expect(isParkedLog(d({ distanceKm: 0.4 }))).toBe(true);        // sub-500 m shuffle
  });

  it('keeps real drives, even short ones', () => {
    expect(isParkedLog(d({ distanceKm: 0.5 }))).toBe(false);
    expect(isParkedLog(d({ distanceKm: 1.2 }))).toBe(false);
    expect(isParkedLog(d({ distanceKm: 36.9 }))).toBe(false);
  });
});
