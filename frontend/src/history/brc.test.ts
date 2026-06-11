import { describe, it, expect } from 'vitest';
import { parseBrcHeader } from './brc';

const lp = (s: string): number[] => [s.length, ...Array.from(s, (c) => c.charCodeAt(0))];

function makeBrc(vin: string, label: string, engine: string): ArrayBuffer {
  const bytes = [...lp('CARSCANNERRECORD'), 1, 0, 0, 0, ...lp(vin), ...lp(label), ...lp(engine)];
  return new Uint8Array(bytes).buffer;
}

describe('parseBrcHeader', () => {
  it('reads vin/label/engine from a valid header', () => {
    expect(parseBrcHeader(makeBrc('TESTVIN0123456789', 'My Car', '2.0 TDI')))
      .toEqual({ vin: 'TESTVIN0123456789', label: 'My Car', engine: '2.0 TDI' });
  });

  it('returns null for a non-brc buffer', () => {
    expect(parseBrcHeader(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });
});
