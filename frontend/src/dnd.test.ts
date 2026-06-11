import { describe, it, expect } from 'vitest';
import { filesFromDrop, type EntryLike } from './dnd';

const csv = (name: string) => new File(['x'], name, { type: 'text/csv' });

const fileEntry = (f: File): EntryLike => ({ isFile: true, isDirectory: false, file: (cb) => cb(f) });
const dirEntry = (children: EntryLike[]): EntryLike => {
  let drained = false; // readEntries yields batches until an empty one
  return {
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (cb) => { if (drained) { cb([]); } else { drained = true; cb(children); } },
    }),
  };
};
const dt = (entries: EntryLike[] | null, files: File[] = []) =>
  ({
    items: entries ? entries.map((e) => ({ webkitGetAsEntry: () => e })) : [],
    files,
  }) as unknown as DataTransfer;

describe('filesFromDrop', () => {
  it('collects CSVs from dropped files and walks folders recursively', async () => {
    const out = await filesFromDrop(dt([
      fileEntry(csv('a.csv')),
      dirEntry([fileEntry(csv('b.csv')), dirEntry([fileEntry(csv('c.csv'))])]),
    ]));
    expect(out.map((f) => f.name)).toEqual(['a.csv', 'b.csv', 'c.csv']);
  });

  it('filters out non-CSV files', async () => {
    const out = await filesFromDrop(dt([
      fileEntry(csv('a.csv')),
      fileEntry(new File(['x'], 'notes.txt')),
      fileEntry(new File(['x'], 'B.CSV')), // case-insensitive keep
    ]));
    expect(out.map((f) => f.name)).toEqual(['a.csv', 'B.CSV']);
  });

  it('falls back to dataTransfer.files when entries are unavailable', async () => {
    const out = await filesFromDrop(dt(null, [csv('a.csv'), new File(['x'], 'x.brc')]));
    expect(out.map((f) => f.name)).toEqual(['a.csv']);
  });
});
