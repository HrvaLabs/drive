import { describe, it, expect } from 'vitest';
import { Assembler, genCode, toFrames } from './protocol';

describe('sync protocol', () => {
  it('round-trips a payload larger than one chunk', () => {
    const payload = { app: 'hrvadrive', blob: 'x'.repeat(40_000) };
    const frames = toFrames(JSON.stringify(payload));
    expect(frames.length).toBeGreaterThan(3); // meta + >=2 chunks + done
    const asm = new Assembler();
    let result: unknown = null;
    for (const f of frames) result = asm.feed(f) ?? result;
    expect(result).toEqual(payload);
  });

  it('reports progress while feeding', () => {
    const frames = toFrames(JSON.stringify({ blob: 'y'.repeat(40_000) }));
    const asm = new Assembler();
    asm.feed(frames[0]);
    expect(asm.expected).toBeGreaterThan(1);
    asm.feed(frames[1]);
    expect(asm.received).toBe(1);
  });

  it('rejects chunks before meta and incomplete transfers', () => {
    const frames = toFrames(JSON.stringify({ a: 1 }));
    expect(() => new Assembler().feed(frames[1])).toThrow(/before meta/);
    const asm = new Assembler();
    asm.feed(frames[0]);
    expect(() => asm.feed(frames[frames.length - 1])).toThrow(/incomplete/);
  });
});

describe('genCode', () => {
  it('makes 8-char codes from the unambiguous alphabet', () => {
    const code = genCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
    expect(genCode()).not.toBe(code); // overwhelmingly
  });
});
