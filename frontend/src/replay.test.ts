import { describe, it, expect } from 'vitest';
import { frameAt, valueAt } from './replay';
import type { RoutePoint, SeriesPoint } from './types';

const route: RoutePoint[] = [
  { t: 0, lat: 45.0, lon: 15.0, speedKmh: 0 },
  { t: 10, lat: 45.1, lon: 15.2, speedKmh: 100 },
];
const rpm: SeriesPoint[] = [{ t: 0, v: 800 }, { t: 10, v: 3000 }];

describe('frameAt', () => {
  it('interpolates position and speed between samples', () => {
    const f = frameAt(route, 5)!;
    expect(f.lat).toBeCloseTo(45.05, 5);
    expect(f.lon).toBeCloseTo(15.1, 5);
    expect(f.speedKmh).toBeCloseTo(50, 5);
  });

  it('clamps before the start and after the end', () => {
    expect(frameAt(route, -5)!.speedKmh).toBe(0);
    expect(frameAt(route, 99)!.speedKmh).toBe(100);
  });

  it('returns null for an empty route', () => {
    expect(frameAt([], 0)).toBeNull();
  });
});

describe('valueAt', () => {
  it('returns the nearest sample value', () => {
    expect(valueAt(rpm, 4)).toBe(800);   // closer to t=0
    expect(valueAt(rpm, 6)).toBe(3000);  // closer to t=10
  });

  it('clamps and tolerates missing series', () => {
    expect(valueAt(rpm, -1)).toBe(800);
    expect(valueAt(rpm, 11)).toBe(3000);
    expect(valueAt(undefined, 5)).toBeNull();
    expect(valueAt([], 5)).toBeNull();
  });
});
