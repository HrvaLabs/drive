import { describe, it, expect } from 'vitest';
import { autoTags, matchPlace } from './autotag';
import type { NamedPlace } from './types';
import type { DriveAnalysis } from '../types';

const mk = (over: {
  fromPlace?: string | null; toPlace?: string | null;
  route?: Array<{ t: number; lat: number; lon: number; speedKmh: number }>;
  distanceKm?: number;
}): DriveAnalysis => ({
  drive: { fromPlace: over.fromPlace ?? null, toPlace: over.toPlace ?? null },
  route: over.route ?? [],
  summary: { distanceKm: over.distanceKm ?? 20 },
} as unknown as DriveAnalysis);

describe('autoTags', () => {
  it('tags lowercase places, deduped when both ends match', () => {
    expect(autoTags(mk({ fromPlace: 'Zagreb', toPlace: 'Split' }))).toEqual(['zagreb', 'split']);
    expect(autoTags(mk({ fromPlace: 'Zagreb', toPlace: 'Zagreb' }))).toEqual(['zagreb']);
  });

  it('tags a genuine loop as round trip (distance guard keeps parked logs out)', () => {
    const loop = [{ t: 0, lat: 45.8, lon: 15.98, speedKmh: 0 }, { t: 900, lat: 45.801, lon: 15.981, speedKmh: 0 }];
    expect(autoTags(mk({ route: loop, distanceKm: 25 }))).toContain('round trip');
    expect(autoTags(mk({ route: loop, distanceKm: 0.3 }))).not.toContain('round trip');
  });

  it('a one-way drive is not a round trip', () => {
    const oneWay = [{ t: 0, lat: 45.8, lon: 15.98, speedKmh: 0 }, { t: 900, lat: 43.5, lon: 16.44, speedKmh: 0 }];
    expect(autoTags(mk({ route: oneWay, distanceKm: 380 }))).not.toContain('round trip');
  });

  it('no places, no GPS — no tags', () => {
    expect(autoTags(mk({}))).toEqual([]);
  });
});

describe('named places', () => {
  const home: NamedPlace = { id: 'p1', name: 'Home', lat: 45.8, lon: 15.98, radiusKm: 0.3 };
  const work: NamedPlace = { id: 'p2', name: 'Work', lat: 45.84, lon: 16.02, radiusKm: 0.3 };

  it('matchPlace respects the circle boundary', () => {
    expect(matchPlace(45.8005, 15.9805, [home])).toBe('Home'); // ~70 m away
    expect(matchPlace(45.81, 15.99, [home])).toBeNull();       // ~1.3 km away
  });

  it('a named place beats the town in tags', () => {
    const a = {
      drive: { fromPlace: 'Zagreb', toPlace: 'Zagreb' },
      route: [{ t: 0, lat: 45.8, lon: 15.98, speedKmh: 0 }, { t: 900, lat: 45.84, lon: 16.02, speedKmh: 0 }],
      summary: { distanceKm: 9 },
    } as unknown as Parameters<typeof autoTags>[0];
    expect(autoTags(a, [home, work])).toEqual(['home', 'work']);
  });
});
