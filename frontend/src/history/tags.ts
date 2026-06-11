import type { DriveMeta } from './types';

export function allTags(drives: DriveMeta[]): string[] {
  const set = new Set<string>();
  for (const d of drives) for (const t of d.tags ?? []) if (t) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterDrivesByTags(drives: DriveMeta[], selected: string[]): DriveMeta[] {
  if (selected.length === 0) return drives;
  return drives.filter((d) => (d.tags ?? []).some((t) => selected.includes(t)));
}

// Free-text filter across label, notes and tags (case-insensitive substring).
export function searchDrives(drives: DriveMeta[], query: string): DriveMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return drives;
  return drives.filter((d) =>
    d.label.toLowerCase().includes(q) ||
    (d.notes ?? '').toLowerCase().includes(q) ||
    (d.tags ?? []).some((t) => t.toLowerCase().includes(q)));
}
