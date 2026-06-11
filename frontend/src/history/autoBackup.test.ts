import { describe, it, expect, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { isAutoBackupSupported, linkBackupFile, writeBackupIfLinked } from './autoBackup';

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
});

describe('autoBackup', () => {
  it('is unsupported in browsers without the File System Access API', async () => {
    expect(isAutoBackupSupported()).toBe(false);
    expect(await writeBackupIfLinked()).toBe('unsupported');
    expect(await linkBackupFile()).toBeNull();
  });

  it('reports no-link when supported but nothing is linked', async () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = () => Promise.reject(new Error('x'));
    expect(isAutoBackupSupported()).toBe(true);
    expect(await writeBackupIfLinked()).toBe('no-link');
  });

  it('a cancelled picker links nothing', async () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = () => Promise.reject(new Error('abort'));
    expect(await linkBackupFile()).toBeNull();
    expect(await writeBackupIfLinked()).toBe('no-link');
  });
});
