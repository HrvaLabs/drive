import { describe, it, expect } from 'vitest';
import { bucketBy, totals } from './aggregate';
import type { DriveMeta } from './types';

const DAY = 86400000;
const mk = (savedAt: number, over: Partial<DriveMeta> = {}): DriveMeta => ({
  id: String(savedAt), savedAt, startedAtClock: null, label: 'Drive',
  distanceKm: 10, durationSeconds: 600, fuelUsedL: 1, costEur: 1.6, co2Kg: 2.31, l100km: 10, eco: 60, ...over,
});

describe('history aggregate', () => {
  it('buckets two drives on different days: 2 day-buckets, 1 month-bucket', () => {
    const t = Date.UTC(2026, 5, 7, 12);
    const drives = [mk(t, { distanceKm: 10 }), mk(t + DAY, { distanceKm: 20 })];
    expect(bucketBy(drives, 'day')).toHaveLength(2);
    const month = bucketBy(drives, 'month');
    expect(month).toHaveLength(1);
    expect(month[0].distanceKm).toBe(30);
    expect(month[0].count).toBe(2);
  });

  it('buckets by the real drive date (from the filename) over the saved-at time', () => {
    const savedAt = Date.UTC(2026, 0, 1, 12); // both saved the same day...
    const drives = [
      mk(savedAt, { driveDate: Date.UTC(2026, 5, 7, 12) }),
      mk(savedAt, { driveDate: Date.UTC(2026, 5, 8, 12) }), // ...but driven a day apart
    ];
    expect(bucketBy(drives, 'day')).toHaveLength(2); // two drive-days, not one saved-day
  });

  it('totals sum distance/cost and average consumption/eco', () => {
    const t = Date.now();
    const tot = totals([mk(t, { l100km: 8, eco: 70, costEur: 2 }), mk(t, { l100km: 12, eco: 50, costEur: 3 })]);
    expect(tot.count).toBe(2);
    expect(tot.distanceKm).toBe(20);
    expect(tot.costEur).toBe(5);
    expect(tot.avgL100).toBe(10);
    expect(tot.avgEco).toBe(60);
  });
});

describe('year buckets', () => {
  it('merges drives within a year and splits across years', () => {
    const drives = [
      mk(Date.UTC(2025, 5, 7, 12), { costEur: 100 }),
      mk(Date.UTC(2026, 1, 1, 12), { costEur: 40 }),
      mk(Date.UTC(2026, 8, 9, 12), { costEur: 60 }),
    ];
    const years = bucketBy(drives, 'year');
    expect(years).toHaveLength(2);
    expect(years[0].key).toBe('2025');
    expect(years[0].label).toBe('2025');
    expect(years[1].key).toBe('2026');
    expect(years[1].costEur).toBe(100);
    expect(years[1].count).toBe(2);
  });
});

describe('bucket labels (European, readable)', () => {
  it('day label is day-month order', () => {
    const [b] = bucketBy([mk(new Date(2026, 5, 7, 12).getTime())], 'day');
    expect(b.label).toBe('7 Jun');
  });

  it('week label names the Monday the week starts on, not an ISO week number', () => {
    // 7 Jun 2026 is a Sunday → its week starts Monday 1 Jun
    const [b] = bucketBy([mk(new Date(2026, 5, 7, 12).getTime())], 'week');
    expect(b.label).toBe('Wk of 1 Jun 2026');
  });
});
