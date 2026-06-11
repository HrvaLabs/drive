import { exportAll, getKv, setKv, delKv } from './db';

// Cloud-folder fallback sync: link the backup to a file the user picks once
// (e.g. inside their iCloud/Drive/Syncthing folder) and silently re-save it
// after every change; the other device restores from that synced file.
// Uses the File System Access API — Chrome/Edge desktop only; elsewhere
// isAutoBackupSupported() is false and the UI falls back to the manual
// Download/Restore buttons. Data still only touches the user's own storage.

const KEY = 'backupFileHandle';

interface FileHandleLike {
  name: string;
  queryPermission?: (d: { mode: string }) => Promise<string>;
  requestPermission?: (d: { mode: string }) => Promise<string>;
  createWritable: () => Promise<{ write: (s: string) => Promise<void>; close: () => Promise<void> }>;
}

export function isAutoBackupSupported(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

export async function linkBackupFile(): Promise<string | null> {
  if (!isAutoBackupSupported()) return null;
  const picker = (window as unknown as {
    showSaveFilePicker: (o: object) => Promise<FileHandleLike>;
  }).showSaveFilePicker;
  let handle: FileHandleLike;
  try {
    handle = await picker({
      suggestedName: 'hrvadrive-backup.json',
      types: [{ description: 'HrvaDrive backup', accept: { 'application/json': ['.json'] } }],
    });
  } catch {
    return null; // user cancelled the picker
  }
  await setKv(KEY, handle);
  await writeBackupIfLinked();
  return handle.name;
}

export async function unlinkBackupFile(): Promise<void> {
  await delKv(KEY);
}

export async function linkedBackupName(): Promise<string | null> {
  const h = await getKv<FileHandleLike>(KEY).catch(() => undefined);
  return h?.name ?? null;
}

export type AutoBackupResult = 'written' | 'no-link' | 'needs-permission' | 'unsupported';

export async function writeBackupIfLinked(): Promise<AutoBackupResult> {
  if (!isAutoBackupSupported()) return 'unsupported';
  const handle = await getKv<FileHandleLike>(KEY).catch(() => undefined);
  if (!handle) return 'no-link';
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      // permission lapses per session; re-granting needs a user gesture (the
      // overlay offers a re-enable button which calls requestBackupPermission)
      return 'needs-permission';
    }
    const w = await handle.createWritable();
    await w.write(JSON.stringify(await exportAll()));
    await w.close();
    return 'written';
  } catch {
    return 'needs-permission';
  }
}

/** Must be called from a user gesture (button click). */
export async function requestBackupPermission(): Promise<AutoBackupResult> {
  const handle = await getKv<FileHandleLike>(KEY).catch(() => undefined);
  if (!handle) return 'no-link';
  try {
    if (handle.requestPermission && (await handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      return 'needs-permission';
    }
  } catch {
    return 'needs-permission';
  }
  return writeBackupIfLinked();
}
