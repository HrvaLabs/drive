import { describe, it, expect } from 'vitest';
import { parseDriveDate } from './driveDate';

describe('parseDriveDate', () => {
  it('parses the Car Scanner "YYYY-MM-DD HH-MM-SS" filename', () => {
    const ms = parseDriveDate('2026-06-05 23-20-43.csv');
    expect(ms).not.toBeNull();
    const d = new Date(ms!);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June (0-based)
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(23);
  });

  it('parses a date-only name and underscore/colon separators', () => {
    expect(parseDriveDate('2026-06-05.csv')).not.toBeNull();
    expect(parseDriveDate('2026-06-05_23-20-43.brc')).not.toBeNull();
    expect(parseDriveDate('drive 2026-06-05T23:20:43.csv')).not.toBeNull();
  });

  it('returns null for names without a date or with an impossible date', () => {
    expect(parseDriveDate('drive.csv')).toBeNull();
    expect(parseDriveDate(undefined)).toBeNull();
    expect(parseDriveDate(null)).toBeNull();
    expect(parseDriveDate('2026-13-40 00-00-00.csv')).toBeNull();
  });
});
