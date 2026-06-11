// Extract CSV drive logs from a drag-and-drop. Prefers DataTransferItem
// entries so a dropped FOLDER is walked recursively; falls back to the plain
// file list. Only *.csv survive (the .brc car file has its own picker).

export interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  file?: (cb: (f: File) => void, err?: (e: unknown) => void) => void;
  createReader?: () => {
    readEntries: (cb: (entries: EntryLike[]) => void, err?: (e: unknown) => void) => void;
  };
}

const isCsv = (name: string) => name.toLowerCase().endsWith('.csv');

function walk(entry: EntryLike): Promise<File[]> {
  if (entry.isFile && entry.file) {
    return new Promise((resolve) =>
      entry.file!((f) => resolve(isCsv(f.name) ? [f] : []), () => resolve([])));
  }
  if (entry.isDirectory && entry.createReader) {
    const reader = entry.createReader();
    const readAll = (): Promise<EntryLike[]> =>
      new Promise((resolve) => {
        const acc: EntryLike[] = [];
        const step = () =>
          reader.readEntries((batch) => {
            if (batch.length === 0) return resolve(acc);
            acc.push(...batch);
            step(); // readEntries yields batches until an empty one
          }, () => resolve(acc));
        step();
      });
    return readAll().then((entries) => Promise.all(entries.map(walk))).then((n) => n.flat());
  }
  return Promise.resolve([]);
}

export async function filesFromDrop(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items
    .map((it) => ('webkitGetAsEntry' in it && typeof it.webkitGetAsEntry === 'function'
      ? (it.webkitGetAsEntry() as EntryLike | null) : null))
    .filter((e): e is EntryLike => !!e);
  if (entries.length > 0) {
    const nested = await Promise.all(entries.map(walk));
    return nested.flat();
  }
  return Array.from(dt.files ?? []).filter((f) => isCsv(f.name));
}
