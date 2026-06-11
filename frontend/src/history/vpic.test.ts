import { describe, it, expect, vi, afterEach } from 'vitest';
import { decodeVin } from './vpic';

const ok = (results: unknown[]) => ({ ok: true, json: async () => ({ Results: results }) }) as Response;

afterEach(() => vi.restoreAllMocks());

describe('decodeVin', () => {
  it('maps the vPIC payload and title-cases the make', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok([
      { Make: 'HONDA', Model: 'Accord', ModelYear: '2003', BodyClass: 'Coupe', FuelTypePrimary: 'Gasoline' },
    ]));
    expect(await decodeVin('1HGCM82633A004352')).toEqual({
      make: 'Honda', model: 'Accord', year: '2003', bodyClass: 'Coupe', fuelType: 'Gasoline',
    });
  });

  it('keeps acronym makes upper-cased', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok([{ Make: 'BMW', Model: '330i' }]));
    expect((await decodeVin('X'))?.make).toBe('BMW');
  });

  it('returns null when Make/Model are missing (invalid VIN)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok([{ Make: '', Model: '', ErrorCode: '11' }]));
    expect(await decodeVin('BADVIN')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await decodeVin('X')).toBeNull();
  });
});
