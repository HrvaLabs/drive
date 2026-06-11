import { describe, it, expect } from 'vitest';
import { decodeVinOffline } from './wmi';

describe('decodeVinOffline', () => {
  it('decodes a French Renault VIN (make + country + year)', () => {
    const r = decodeVinOffline('VF1RJA00769589142');
    expect(r?.make).toBe('Renault');
    expect(r?.country).toContain('France');
    expect(r?.year).toBe('2006'); // 10th char "6" → 2006
  });

  it('decodes a US Tesla WMI', () => {
    expect(decodeVinOffline('5YJXCCE40GF010543')?.make).toBe('Tesla');
  });

  it('returns null for an unknown WMI', () => {
    expect(decodeVinOffline('ZZZ0000000000000A')).toBeNull();
  });

  it('returns null for a too-short string', () => {
    expect(decodeVinOffline('VF1')).toBeNull();
  });
});
