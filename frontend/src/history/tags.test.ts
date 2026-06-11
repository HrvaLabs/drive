import { describe, it, expect } from 'vitest';
import { allTags, filterDrivesByTags, searchDrives } from './tags';
import type { DriveMeta } from './types';

const d = (id: string, tags?: string[]): DriveMeta => ({
  id, savedAt: 1, startedAtClock: null, label: 'Drive', distanceKm: 1, durationSeconds: 1,
  fuelUsedL: 0, costEur: 0, co2Kg: 0, l100km: 0, eco: 0, tags,
});

describe('history tags', () => {
  it('allTags: distinct, sorted, ignores empty/undefined', () => {
    expect(allTags([d('a', ['b', 'a']), d('b', ['a', '']), d('c')])).toEqual(['a', 'b']);
  });

  it('filterDrivesByTags: empty selection returns all', () => {
    const ds = [d('a', ['x']), d('b')];
    expect(filterDrivesByTags(ds, [])).toEqual(ds);
  });

  it('filterDrivesByTags: OR semantics, untagged excluded when filtering', () => {
    const ds = [d('a', ['commute']), d('b', ['trip']), d('c')];
    expect(filterDrivesByTags(ds, ['commute']).map((x) => x.id)).toEqual(['a']);
    expect(filterDrivesByTags(ds, ['commute', 'trip']).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('searchDrives', () => {
  const drives = [
    { ...d('a', ['Commute']), label: 'Morning run', notes: 'icy roads' },
    { ...d('b', ['trip']), label: 'Zagreb', notes: '' },
  ];

  it('matches label, notes and tags case-insensitively', () => {
    expect(searchDrives(drives, 'morning').map((x) => x.id)).toEqual(['a']);
    expect(searchDrives(drives, 'ICY').map((x) => x.id)).toEqual(['a']);
    expect(searchDrives(drives, 'commute').map((x) => x.id)).toEqual(['a']);
    expect(searchDrives(drives, 'zagreb').map((x) => x.id)).toEqual(['b']);
    expect(searchDrives(drives, 'nothing')).toEqual([]);
  });

  it('empty or whitespace query returns all drives', () => {
    expect(searchDrives(drives, '')).toHaveLength(2);
    expect(searchDrives(drives, '   ')).toHaveLength(2);
  });
});
