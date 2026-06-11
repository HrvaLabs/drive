# Feature 10 — Drive notes & tags + history filter (design)

**Date:** 2026-06-11
**Status:** approved (design) → ready for implementation plan
**Roadmap item:** Next-batch #10 — "Drive notes & tags + history filter — label drives
(commute/road-trip) and filter the history list. Pure frontend on IndexedDB."

## Goal

Let the user attach free-form **tags** and a **note** to each saved drive, and **filter the whole
History view by tag**. Entirely client-side (IndexedDB); nothing leaves the device. Consistent with the
existing on-device history model and the privacy notice.

## Data model (`history/types.ts`)

`DriveMeta` gains two optional fields:

```ts
  notes?: string;
  tags?: string[];
```

No IndexedDB version bump — records are schemaless, so the new fields are simply written into the
record. Old records lack them; the UI treats `undefined` as "no note / no tags". `toStored` initialises
new drives with `tags: []` and `notes: ''`.

## Persistence (`history/db.ts`)

Add:

```ts
export async function updateDriveMeta(id: string, patch: { notes?: string; tags?: string[] }): Promise<void>
```

It reads the `StoredDrive` by id, merges the patch (`{ ...rec, ...patch }`), and `put`s it back. The
heavy `analysis` payload rides along untouched. No-op if the id is absent.

## Pure helpers (`history/tags.ts`) — unit-tested

```ts
export function allTags(drives: DriveMeta[]): string[]          // distinct tags in use, sorted
export function filterDrivesByTags(drives: DriveMeta[], selected: string[]): DriveMeta[]
```

`filterDrivesByTags`: empty `selected` → all drives; otherwise drives having **any** selected tag (OR
semantics — user-approved). Tag matching is exact (tags are normalised on input, below).

## Tag input normalisation

When a tag is added in the editor: trim, collapse internal whitespace, lowercase is **not** forced
(preserve the user's casing) but a duplicate check is case-insensitive so "Commute" and "commute" don't
both appear. Empty/whitespace-only tags are ignored. A drive's `tags` array holds unique tags in entry
order.

## UI — `HistoryView` + new `DriveRow.tsx`

**Tag filter bar** (top of `HistoryView`, above the KPIs): a chip per tag from `allTags(drives)`, each
toggling membership in a local `selected: string[]` state, plus an **"All"** chip that clears the
selection. The selection produces `const shown = filterDrivesByTags(drives, selected)`, and **`shown`
feeds the KPIs (`totals`), the Trends chart (`bucketBy`), and the Drives list** — so a tag narrows the
whole view. The **Compare** section keeps the full `drives` (its own A/B picker). If no drive has any
tag yet, the filter bar is hidden.

**`DriveRow.tsx`** (extracted from the current inline `.drive-row` markup): props
`{ drive: DriveMeta; onOpen; onDelete; onChanged }`. Renders the existing date·label + stats, plus:
- **tag chips** and the **note** text (when present), below the stats;
- an **Edit** toggle that reveals an inline editor: a **tags input** (type a tag, **Enter or comma**
  adds a chip; each chip has a **×** to remove) and a **note** text field. On save it calls
  `updateDriveMeta(drive.id, { tags, notes })` then `onChanged()` to refresh the list from IndexedDB.
  Cancel discards edits.

`HistoryView` passes `onChanged` (App's `refreshHistory`) down so edits re-read the store. `App.tsx`
renders `<HistoryView drives={history} onOpen={openStored} onDelete={removeStored} onChanged={refreshHistory} />`.

## Scope / non-goals

- Editing tags/notes happens in the **History list only**, not on the opened report view (v1).
- OR filter semantics (not AND).
- No full-text search of notes (filter is by tag); notes are display + edit only.
- No tag rename/merge management UI; removing a tag from every drive makes it disappear from the bar.

## Testing

- **`tags.test.ts`** (pure, mirrors `aggregate.test.ts`): `allTags` distinct + sorted + ignores
  empty/undefined; `filterDrivesByTags` OR semantics, empty-selection→all, drive with no tags excluded
  when a filter is active.
- **`db.test.ts`** (fake-indexeddb): `updateDriveMeta` persists tags + notes and leaves `analysis`
  intact; no-op on a missing id.
- **`DriveRow.test.tsx`** (RTL): renders existing tags/note; Edit reveals the editor; typing a tag +
  Enter adds a chip; × removes it; Save calls `updateDriveMeta` with the right payload and `onChanged`.
- **`HistoryView` filter test** (RTL, light): with two drives tagged differently, clicking a tag chip
  narrows the Drives list (and the KPI drive count) to the matching drive; "All" restores.
