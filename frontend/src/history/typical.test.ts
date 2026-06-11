import { describe, it, expect } from 'vitest';
import { qualifyingTags, typicalComparison } from './typical';
import type { DriveMeta } from './types';

let seq = 0;
const d = (tags: string[], over: Partial<DriveMeta> = {}): DriveMeta => ({
  id: String(++seq), savedAt: seq, driveDate: seq * 86400000, startedAtClock: null, label: 'Drive',
  distanceKm: 20, durationSeconds: 600, fuelUsedL: 1.2, costEur: 4, co2Kg: 2, l100km: 6, eco: 60, tags, ...over,
});

describe('typicalComparison', () => {
  it('needs the latest plus at least 3 previous usable drives with the tag', () => {
    expect(typicalComparison([d(['commute']), d(['commute']), d(['commute'])], 'commute')).toBeNull();
  });

  it('compares the latest against the median of the previous drives', () => {
    const drives = [
      d(['commute'], { l100km: 5, costEur: 3, eco: 70 }),
      d(['commute'], { l100km: 6, costEur: 4, eco: 60 }),
      d(['commute'], { l100km: 7, costEur: 5, eco: 50 }),
      d(['commute'], { l100km: 9, costEur: 6, eco: 40 }), // latest (newest driveDate)
      d(['trip'], { l100km: 20 }),                         // other tag — ignored
    ];
    const cmp = typicalComparison(drives, 'commute')!;
    expect(cmp.n).toBe(3);
    expect(cmp.latest.l100km).toBe(9);
    const byLabel = Object.fromEntries(cmp.rows.map((r) => [r.label, r]));
    expect(byLabel['L/100km'].a).toBe(6);     // typical = median of 5,6,7
    expect(byLabel['L/100km'].b).toBe(9);     // latest
    expect(byLabel['L/100km'].better).toBe('down');
    expect(byLabel['Cost €'].a).toBe(4);
    expect(byLabel['Eco score'].better).toBe('up');
  });

  it('excludes parked logs from both sides', () => {
    const drives = [
      d(['commute']), d(['commute']), d(['commute']), d(['commute']),
      d(['commute'], { distanceKm: 0.1 }), // parked — would otherwise be "latest"
    ];
    const cmp = typicalComparison(drives, 'commute')!;
    expect(cmp.latest.distanceKm).toBe(20);
  });
});

describe('qualifyingTags', () => {
  it('lists tags having at least 4 usable drives', () => {
    const drives = [
      d(['commute']), d(['commute']), d(['commute']), d(['commute', 'work']),
      d(['work']), d(['work']),
    ];
    expect(qualifyingTags(drives)).toEqual(['commute']);
  });
});
