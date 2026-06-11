// Parse the Car Scanner .brc header for vehicle identity — mirrors analysis/app/brc.py.
// Only the header is read (magic + u32 version + three u8-length-prefixed latin-1 strings);
// the proprietary binary records are ignored, and the file never leaves the browser.
const MAGIC = 'CARSCANNERRECORD';

export function parseBrcHeader(buf: ArrayBuffer): { vin: string; label: string; engine: string } | null {
  const data = new Uint8Array(buf);
  const dec = new TextDecoder('latin1');
  let i = 0;
  const readLp = (): string => {
    if (i >= data.length) throw new Error('eof');
    const n = data[i];
    i += 1;
    if (i + n > data.length) throw new Error('eof');
    const s = dec.decode(data.subarray(i, i + n));
    i += n;
    return s;
  };
  try {
    if (readLp() !== MAGIC) return null;
    i += 4; // u32 version (little-endian) — skip
    const vin = readLp();
    const label = readLp();
    const engine = readLp();
    return { vin, label, engine };
  } catch {
    return null;
  }
}
