# Features 17–24 — QoL octet: backup, dup-guard, per-car price, DnD, retry, search, tag spend, PWA (design)

**Date:** 2026-06-11
**Status:** approved (user pre-approved the batch: "do all 3 in one batch … also do all") → implementation
**Roadmap items:** #17 history backup & restore · #18 duplicate-upload guard · #19 per-car fuel
price · #20 drag-and-drop upload · #21 retry failed · #22 history text search · #23 spend-by-tag ·
#24 PWA/installable

All client-side; the analysis API is untouched. One spec because the features cluster on the same
surfaces (`App.tsx` batch loop, `BatchProgress`, `HistoryView`, `PrivacyOverlay`, `db.ts`).

## 17 — History backup & restore

The history lives only in this browser's IndexedDB; this is the data-loss guard.

- `db.ts`: `exportAll(): Promise<BackupFile>` returning
  `{ app: 'hrvadrive', schema: 1, exportedAt: number, cars: Car[], drives: StoredDrive[] }`;
  `importAll(data: unknown): Promise<{ drives: number; cars: number }>` — validates the shape
  (`app === 'hrvadrive'`, arrays present), **merges by `put`** (upsert on `id`/`vin`; restore never
  wipes), returns counts; throws `Error('Not a HrvaDrive backup')` on bad input.
- `PrivacyOverlay`: a backup row above the danger zone — **Download backup** button (prop
  `onBackup`) and **Restore backup** file-input label (prop `onRestore(file): Promise<string>`);
  the overlay shows the resolved message (`Restored 53 drives · 2 cars`) or the error message in a
  status line (`role="status"`).
- `App`: `onBackup` serialises `exportAll()` to a Blob download named
  `hrvadrive-backup-YYYY-MM-DD.json`; `onRestore` parses `await file.text()`, calls `importAll`,
  refreshes history+cars, returns the message.

## 18 — Duplicate-upload guard

Drive ids end in `Date.now()`, so re-uploading a CSV duplicates history and corrupts totals.

- Identity = **`driveDate`** (epoch ms parsed from the filename, second precision — the recording's
  start). Before analyzing file *i*: if `parseDriveDate(file.name)` matches the `driveDate` of any
  drive in history **or** of a file already processed in this batch → mark **`skipped`** (new
  `BatchItem` status), don't call the API, don't save. Files with no parseable date are never
  auto-skipped (analyzed normally) — keeps the existing tests and odd filenames honest.
- `BatchProgress`: `skipped` row = `— <name> skipped · already in history` (muted); `settled`
  includes skips (bar advances); summary appends `· N skipped` when N > 0.
- End-of-batch: skips are neither successes nor failures. `successes===0 && failed===0` → no error
  banner, `phase = analysis ? 'done' : 'idle'`, batch stays visible. `failed>0 && successes===0` →
  error as today (failure count only).

## 19 — Per-car fuel price

- `Car` gains `pricePerL?: string`. `db.ts` gains `patchCar(vin, patch: Partial<Car>)` (get+merge+put,
  no-op on missing vin); `touchCar` delegates to it.
- Selecting a car whose record has `pricePerL` fills the €/L input; selecting **No car** falls back
  to the global `localStorage` value (unchanged behaviour).
- After a batch with ≥1 success, a valid entered price is persisted to the selected car
  (`patchCar(vin, { pricePerL })`); the global localStorage write stays (it serves the no-car flow).

## 20 — Drag-and-drop upload

- New pure-ish helper `frontend/src/dnd.ts`: `filesFromDrop(dt: DataTransfer): Promise<File[]>` —
  prefers `dt.items` + `webkitGetAsEntry()` (recursive directory traversal so a dropped **folder**
  works), falls back to `dt.files`; keeps only `*.csv` (case-insensitive). Unit-tested with faked
  entry objects (jsdom has no real DnD).
- `Uploader`: the root `.upload` div gets `onDragOver` (preventDefault + `upload--drag` class),
  `onDragLeave`, `onDrop` → `setFiles(await filesFromDrop(e.dataTransfer))` when non-empty. Both the
  landing hero and the analyzed bar render `Uploader`, so both accept drops. CSS: dashed accent
  outline while dragging.

## 21 — Retry failed

- `App`: the batch loop is extracted to `analyzeFiles(list: File[])` (identical semantics;
  `onAnalyze()` = `analyzeFiles(files)`), and the `File[]` of the current batch is kept in a ref
  aligned with `batch` indexes. `retryFailed()` re-runs `analyzeFiles` with just the files whose
  batch item is `failed` (fresh batch list of only those files).
- `BatchProgress` gains optional `onRetry?: () => void`: when the batch is settled and `failed > 0`,
  a `Retry failed (N)` pill renders next to the summary.

## 22 — History text search

- Pure helper in `history/tags.ts`: `searchDrives(drives, query)` — trimmed, case-insensitive
  substring match against `label`, `notes`, and every tag; empty query → all drives.
- `HistoryView`: a search input (aria-label `search drives`, placeholder "Search label, notes,
  tags…") rendered above the filter bars; `shown` = tag-filter ∩ car-filter ∩ search. Narrows
  KPIs/Trends/periods/list like the other filters (Compare-drives keeps full list as before).

## 23 — Spend-by-tag

- New `TagSpend.tsx` card ("Spend by tag", after Spending by period): one row per tag in
  `allTags(shown)` → `totals(drives having that tag)`: Tag · Drives · km · Fuel L · Cost €.
  A final **(untagged)** row when untagged drives exist. Hidden entirely when no tags are in use.
  Multi-tagged drives appear in every matching row (a per-tag view, not a partition — noted in the
  card's caption).

## 24 — PWA / installable

- `vite-plugin-pwa` (dev dep), `generateSW`, `registerType: 'autoUpdate'`,
  `navigateFallbackDenylist: [/^\/api/]` so API calls never get the HTML fallback; existing
  `site.webmanifest` + icons are reused (`manifest: false` in the plugin — the link tag already
  ships). Registration via `virtual:pwa-register` in `main.tsx` (not imported by any test);
  `vite-env.d.ts` gets the `vite-plugin-pwa/client` types reference.
- Honest offline story: the app shell + an already-open report work offline; the analysis call and
  OSM tiles need network (unchanged, disclosed in the privacy overlay already).

## Testing

- `db.test.ts`: export→import round-trip (counts, payload intact), import rejects junk, `patchCar`.
- `App.test.tsx`: duplicate filename skipped (no 2nd history row, `skipped` row text, no error);
  retry re-fetches only the failed file; per-car price saved on analyze + filled on select; restore
  flow refreshes history.
- `BatchProgress.test.tsx`: skipped row + summary suffix; Retry button only when settled with
  failures, fires `onRetry`.
- `dnd.test.ts`: file entries, nested directory entries, non-CSV filtering, `dt.files` fallback.
- `tags.test.ts`: `searchDrives` label/notes/tag matching, case-insensitivity, empty query.
- `HistoryView.test.tsx`: search narrows the list (with KPIs); `TagSpend.test.tsx`: rows per tag,
  untagged row, hidden without tags.
- PWA: `npm run build` emits `dist/sw.js` (asserted in the verification step, not unit-tested).
