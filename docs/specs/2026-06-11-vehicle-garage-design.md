# Vehicle garage — store the car once, reuse it, support multiple cars (design)

**Date:** 2026-06-11
**Status:** approved (design) → ready for implementation plan
**Idea:** upload a `.brc` once; the app remembers the vehicle and reuses it on every later drive (no
re-upload). Support multiple cars (your car vs a friend's) and tag each drive with its car.

## Two grounding facts

- The `.brc` yields `{vin, label, engine}`; we only need those three fields, **not** the ~7 MB raw blob
  (its proprietary binary records are ignored). So "upload once" = parse the header once, keep the
  fields.
- **The drive CSV carries no VIN** (verified — no VIN PID). The app therefore can't auto-detect a
  drive's car; the car is chosen by a **smart default + picker** (user-approved).

The `engine` string affects the analysis (`detect_fuel_type` → diesel 2.64 vs petrol 2.31 CO₂), so a
reused car must pass its engine to `/analyze`.

## Data model (IndexedDB — **version bump v1 → v2**)

New `cars` object store, **keyPath `vin`**:

```ts
interface Car { vin: string; label: string; engine: string; createdAt: number; lastUsedAt: number }
```

`DriveMeta` gains `carVin?: string`. The `drives` store is unchanged; the v2 `onupgradeneeded` only
**creates `cars`** if absent (additive). `db.ts` gains: `listCars()`, `saveCar(car)`, `deleteCar(vin)`,
`touchCar(vin)` (sets `lastUsedAt = Date.now()`). `saveDrive` accepts an optional `carVin` and stores it.

## Parse the `.brc` client-side — `frontend/src/history/brc.ts`

Port the Python header parser (`analysis/app/brc.py`) to TS: magic `CARSCANNERRECORD` (u8-length-prefixed
latin-1), skip a u32 (LE) version, then three u8-length-prefixed latin-1 strings (vin, label, engine).

```ts
export function parseBrcHeader(buf: ArrayBuffer): { vin: string; label: string; engine: string } | null
```

Returns `null` if the magic doesn't match or it runs off the end. Read only what's needed (the header).
Adding a car reads the file in the browser — the `.brc` never leaves the device.

## Backend — `analysis/app/main.py` (small)

Add optional `vin` / `label` / `engine` form fields to `/analyze`. Build the `vehicle` dict: if a `brc`
file is sent, parse it (today's path, takes precedence); else if any of `vin/label/engine` is present,
`{"vin": vin, "label": label, "engine": engine}`; else `None`. `build_drive_analysis` already accepts
`vehicle` and feeds `engine` to `detect_fuel_type`, so CO₂ is correct. No other backend change.

## Frontend — `api.ts`

`analyzeDrive(file, brc?, pricePerL?, vehicle?: { vin?: string; label?: string; engine?: string })`:
when `vehicle` is given and no `brc`, append `vin`/`label`/`engine` form fields (only the non-empty
ones).

## Uploader — car selector replaces the raw `.brc` input

`Uploader` swaps the `.brc` file input for a car control:
- **A `<select>`** ("Analyze as") listing `No car` + each garage car by label.
- **"＋ add car"** — a `.brc` file input; on change, parse via `brc.ts`; a successful parse upserts the
  car (by `vin`) and selects it. A parse failure or blank VIN shows a small inline error and stores
  nothing.
- **"✕"** to remove the currently-selected car from the garage.

New props: `cars: Car[]`, `selectedCarVin: string` (`''` = No car), `setSelectedCarVin`, `onAddCar(file)`,
`onRemoveCar(vin)`. The `setBrc` prop is removed (the `.brc` now flows through `onAddCar`).

**`Landing.tsx` also renders `Uploader`** (it spreads the same `uploaderProps`), so its `Props` interface
must gain the same new fields and lose `setBrc` — thread them through identically (same as the feature-8
`pricePerL` change touched both render paths).

**Smart default** (computed in `App`): exactly one car → it's selected; multiple → the one with the
newest `lastUsedAt`; none → `No car`.

## App wiring

`App` holds `cars` (from `listCars`) + `selectedCarVin`. On analyze: look up the selected car; call
`analyzeDrive(file, null, pricePerL, { vin, label, engine })`; save each drive with `carVin =
selectedCarVin || undefined`; `touchCar(selectedCarVin)`. `onAddCar(file)`: parse → `saveCar` → refresh
`cars` → select it. `onRemoveCar`: `deleteCar` → refresh (past drives keep their `carVin`, just lose the
chip). First-ever use: add a car (via `.brc`) or analyze with `No car`.

## History — filter by car

Reusing the #10 filter-bar pattern: a **car filter** in `HistoryView` (a chip per car, by label, from
the cars list + `carVin`). Selecting cars narrows the whole view (KPIs + Trends + list), AND-combined
with the existing tag filter (a drive must match the car filter *and* the tag filter). "All cars"
clears. `App` passes `cars` to `HistoryView` (to resolve `carVin` → label). Drives with no `carVin`
appear only when no car is selected.

## Edges / non-goals

- Old drives (pre-feature) have no `carVin` — they display their stored `vehicle` and group as "no car";
  no backfill (dev clears cache anyway).
- A `.brc` and a selected car can't both apply — the picker is the path; "add car" is the only `.brc`
  entry point now.
- No car rename/edit in v1 (label comes from the `.brc`); no per-car comparison beyond the filter.
- Blank-VIN `.brc` is rejected (we key by `vin`).

## Testing

- **`brc.test.ts`**: a crafted valid header → the three fields; a non-`.brc` buffer → `null`.
- **`db.test.ts`** (fake-indexeddb): the v2 upgrade creates `cars`; `saveCar`/`listCars`/`deleteCar`/
  `touchCar`; `saveDrive` persists `carVin`; existing drive tests still pass.
- **backend** `test_analyze.py`: `/analyze` with `engine` containing a diesel marker → `fuelType ==
  "diesel"` and the diesel CO₂ factor; `vin`/`label` populate `drive.vehicle`.
- **`Uploader.test.tsx`**: renders the car select; "＋ add car" with a stub `.brc` calls `onAddCar`;
  selecting a car calls `setSelectedCarVin`; remove calls `onRemoveCar`.
- **`HistoryView` car-filter test**: two drives with different `carVin` → a car chip narrows the list;
  combined with a tag chip → AND.
- **api** `api.test.ts`: vehicle fields appended when given + no brc; omitted when empty.
