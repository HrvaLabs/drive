import { describe, it, expect } from 'vitest';
import { distribute, bandLabels, signalPoints, SPEED_EDGES } from './distribution';
import type { DriveAnalysis } from '../types';

describe('distribution', () => {
  it('labels bands as <first, interior ranges, last+', () => {
    expect(bandLabels([1000, 2000])).toEqual(['<1000', '1000–2000', '2000+']);
  });

  it('bands by count and normalises to % (value on an edge goes to the upper band)', () => {
    // edges [10,30]: bands <10, 10–30, 30+
    const pts = [{ t: 0, v: 5 }, { t: 1, v: 10 }, { t: 2, v: 20 }, { t: 3, v: 30 }];
    // 5 -> <10 ; 10 -> 10–30 ; 20 -> 10–30 ; 30 -> 30+
    expect(distribute(pts, [10, 30])).toEqual([
      { band: '<10', pct: 25 },
      { band: '10–30', pct: 50 },
      { band: '30+', pct: 25 },
    ]);
  });

  it('returns [] for an empty or missing signal', () => {
    expect(distribute(undefined, [10, 30])).toEqual([]);
    expect(distribute([], [10, 30])).toEqual([]);
  });

  it('signalPoints returns the first present non-empty signal, else undefined', () => {
    const a = { signals: { 'Speed (GPS)': { points: [{ t: 0, v: 1 }] } } } as unknown as DriveAnalysis;
    expect(signalPoints(a, ['Vehicle speed', 'Speed (GPS)'])).toEqual([{ t: 0, v: 1 }]);
    expect(signalPoints(a, ['Engine RPM'])).toBeUndefined();
  });

  it('exports the agreed speed edges', () => {
    expect(SPEED_EDGES).toEqual([10, 30, 50, 70, 90, 110, 130]);
  });
});
