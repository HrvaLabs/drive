// Framing for the sync DataChannel: a JSON dump split into 16 KB chunks,
// bracketed by meta/done frames so the receiver can show progress and detect
// truncated transfers. Pure functions — the WebRTC plumbing lives in session.ts.

export const CHUNK_SIZE = 16 * 1024;

export function toFrames(json: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) chunks.push(json.slice(i, i + CHUNK_SIZE));
  return [
    JSON.stringify({ kind: 'meta', chunks: chunks.length }),
    ...chunks.map((data, i) => JSON.stringify({ kind: 'chunk', i, data })),
    JSON.stringify({ kind: 'done' }),
  ];
}

export class Assembler {
  private parts: string[] | null = null;
  private got = 0;
  expected = 0;

  get received(): number { return this.got; }

  /** Feed one frame; returns the parsed payload on the final frame, else null. */
  feed(frame: string): unknown | null {
    const msg = JSON.parse(frame) as { kind: string; chunks?: number; i?: number; data?: string };
    if (msg.kind === 'meta') {
      this.expected = msg.chunks ?? 0;
      this.parts = new Array<string>(this.expected);
      this.got = 0;
      return null;
    }
    if (msg.kind === 'chunk') {
      if (!this.parts) throw new Error('chunk before meta');
      this.parts[msg.i ?? 0] = msg.data ?? '';
      this.got++;
      return null;
    }
    if (msg.kind === 'done') {
      if (!this.parts || this.got !== this.expected) throw new Error('incomplete transfer');
      return JSON.parse(this.parts.join(''));
    }
    throw new Error('unknown frame');
  }
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

export function genCode(): string {
  const buf = new Uint8Array(8);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}
