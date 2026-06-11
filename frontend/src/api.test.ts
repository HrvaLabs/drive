import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeDrive } from './api';

function lastFormData(): FormData {
  const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return call[1].body as FormData;
}

describe('analyzeDrive', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ schemaVersion: '2' }) }),
    ) as unknown as typeof fetch;
  });

  it('POSTs the file to the analysis endpoint and returns parsed JSON', async () => {
    const stub = { schemaVersion: '1', summary: { maxSpeedKmh: 72 } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => stub } as Response);
    globalThis.fetch = fetchMock;

    const file = new File(['x'], 'drive.csv', { type: 'text/csv' });
    const result = await analyzeDrive(file);

    expect(result).toEqual(stub);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/drives:analyze');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('throws on a non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 } as Response);
    await expect(analyzeDrive(new File(['x'], 'd.csv'))).rejects.toThrow('400');
  });

  it('attaches the optional .brc file', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
    globalThis.fetch = fetchMock;
    const drive = new File(['x'], 'd.csv');
    const brc = new File([new Uint8Array([1, 2, 3])], 'c.brc');
    await analyzeDrive(drive, brc);
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get('brc')).toBeInstanceOf(File);
  });

  it('appends pricePerL when a valid positive number is given', async () => {
    await analyzeDrive(new File(['x'], 'd.csv'), null, '1.65');
    expect(lastFormData().get('pricePerL')).toBe('1.65');
  });

  it('omits pricePerL when empty, zero, or non-numeric', async () => {
    for (const v of ['', '0', 'abc', undefined]) {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
      await analyzeDrive(new File(['x'], 'd.csv'), null, v as string | undefined);
      expect(lastFormData().get('pricePerL')).toBeNull();
    }
  });

  it('appends vin/label/engine when a vehicle is given and no brc', async () => {
    await analyzeDrive(new File(['x'], 'd.csv'), null, '', { vin: 'V1', label: 'Car', engine: '2.0 TDI' });
    const fd = lastFormData();
    expect(fd.get('vin')).toBe('V1');
    expect(fd.get('label')).toBe('Car');
    expect(fd.get('engine')).toBe('2.0 TDI');
  });

  it('omits vehicle fields when empty', async () => {
    await analyzeDrive(new File(['x'], 'd.csv'), null, '', { vin: '', label: '', engine: '' });
    expect(lastFormData().get('vin')).toBeNull();
  });
});
