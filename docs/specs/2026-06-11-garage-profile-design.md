# Offline car profile + Garage tab (design)

**Date:** 2026-06-11
**Status:** approved → ready for implementation plan
**Idea:** decode the VIN **offline** (make/year/country, no network) on add, and add a **Garage** tab where
each car is a profile card: identity (offline decode + `.brc`) + **lifetime stats** aggregated from that
car's drive history. Builds on [[hrva-drive-garage]]. Engine stays sourced from the `.brc` (the VIN can't
yield it offline).

## Components

### 1. `frontend/src/history/wmi.ts` — offline VIN decoder (zero network)
```ts
export interface VinInfo { make: string; year: string; country: string }
export function decodeVinOffline(vin: string): VinInfo | null;
```
- **Make + country** from the first 3 chars (WMI) via a bundled `WMI_MAKES` table (~70 entries — European
  + global majors; seeded from the public WMI registry / opencars MIT data, attributed in a comment).
  Unknown WMI → `null` (never show a wrong make).
- **Country** from the region prefix (ISO 3780) → `"🇫🇷 France"` style (flag + name); fall back to the
  region name, else `''`.
- **Year** from char 10 (standard A–H,J–N,P,R–Y / 1–9 table; resolve the 30-year cycle to the newest year
  ≤ current year + 1).
- No model, no engine (manufacturer-private — not decodable offline).
- Pure function, no fetch. ~3 KB of static tables.

### 2. `Car` type — add `country?: string`
(`make/model/year/bodyClass/fuelType/decodedAt` already exist.)

### 3. Auto-decode on add (offline, silent) — `App.onAddCar`
After `parseBrcHeader`, run `decodeVinOffline(vin)` and merge `{make, year, country}` into the saved car.
No button, no network. The opt-in **🔎 Decode (vPIC)** button stays for trying model/body on cars NHTSA
knows.

### 4. Identity-model cleanup (rename stays king)
Decode (offline **or** vPIC) fills **metadata only**; the car's **`label` is the user's name** (from
`.brc`, editable via rename) and is never overwritten by decode. Concretely:
- `App.onDecodeCar`: drop the `label: decodedName(d)` it currently sets — keep just the decoded fields.
- Garage `<select>` option: `{emoji-if-decoded} {label}` (already shows `label`).
- `VehicleCard`: title = the name (`label`); when decoded, a subtitle line joining the present fields
  `decodedName · country · engine · fuelType` (e.g. "2022 Renault · 🇫🇷 France · 2.0 dCi · Diesel").
  `decodedName` already works with make+year only.

### 5. `frontend/src/history/carStats.ts` — per-car lifetime aggregation
```ts
export interface CarStats {
  drives: number;
  totalKm: number; totalFuelL: number; totalCostEur: number; totalCo2Kg: number;
  avgL100: number; avgEco: number; avgIdlePct: number;
  totalHarshEvents: number; longestDriveKm: number;
  maxHp: number; topSpeedKmh: number; peakBoostBar: number; maxRpm: number;
  firstAt: number | null; lastAt: number | null;
}
export function carStats(vin: string, drives: StoredDrive[]): CarStats;
```
Filter `drives` by `carVin === vin`, then over the matched set:
- **Totals:** count; sum `distanceKm`, `fuelUsedL`, `costEur`, `co2Kg`.
- **Averages:** `avgL100 = totalKm ? totalFuelL / totalKm * 100 : 0`; `avgEco = mean(eco)`;
  `avgIdlePct = sumDuration ? sum(analysis.summary.idleSeconds) / sumDuration * 100 : 0`.
- **Counts/records:** `totalHarshEvents = sum(analysis.scores.harshEvents)`;
  `longestDriveKm = max(distanceKm)`.
- **Peaks (nullable in `analysis.bests`):** `maxHp`, `topSpeedKmh`, `peakBoostBar`, `maxRpm` = max over
  non-null values (0 if none).
- **Timeline:** `firstAt`/`lastAt` = min/max of `driveDate ?? savedAt`.
(`App.history` already holds full `StoredDrive[]` incl. `analysis`, so `summary/scores/bests` are
available.)

### 6. `frontend/src/components/GarageView.tsx` — the new tab
Props: `cars: Car[]`, `drives: StoredDrive[]`, `onRenameCar`, `onRemoveCar`, `onDecodeCar`,
`decodingVin`. One profile card per car:
- **Header:** `carEmoji(bodyClass)` + `label`, with small **✎ rename** / **✕ remove** actions.
- **Identity line:** `make · year · country · engine · fuelType` (the present ones, ` · `-joined). If not
  decoded: "VIN not recognised offline — rename to set a name." Plus the **🔎 Decode** button when vPIC
  hasn't been tried (no `model`), reusing `onDecodeCar`/`decodingVin`.
- **Stats grid** (reuse `.kpi` tiles): drives · total km · total fuel L · total € · total CO₂ · avg
  L/100 · avg eco · avg idle % · harsh events · longest drive · peak power (`maxHp`) · top speed · peak
  boost · max RPM. (Hide a tile whose value is 0/empty to avoid noise.)
- **Timeline footer:** "Driving since <firstAt> · last driven <lastAt>" (omit if no drives).
- **Empty state** (no cars): "Add a car from its `.brc` on the Analyze tab."

### 7. `App.tsx` — wire the tab
Add `'garage'` to `Tab`; a nav `pill` "Garage"; render `<GarageView cars={cars} drives={history}
onRenameCar={onRenameCar} onRemoveCar={onRemoveCar} onDecodeCar={onDecodeCar} decodingVin={decodingVin} />`
when `tab === 'garage'`. Auto-decode (offline) in `onAddCar`. Revert the decode-sets-label line (§4).

### 8. `frontend/src/index.css` — `.garage` card + grid styles (match existing `.card`/`.kpi`).

## Testing
- **`wmi.test.ts`:** `decodeVinOffline('VF1RJA00769589142')` → make "Renault", country contains "France",
  a 4-digit year; an unknown WMI (`'ZZZ…'`) → `null`; a known US WMI (`'5YJ…'` Tesla) → make "Tesla".
- **`carStats.test.ts`:** two drives for `V1` + one for `V2` → `drives===2`, summed km/fuel, `maxHp`/
  `topSpeedKmh` = the higher, `totalHarshEvents` summed, `longestDriveKm` = the bigger, `avgIdlePct`
  duration-weighted, `firstAt`/`lastAt` correct.
- **`GarageView.test.tsx`:** a decoded car with two drives → shows the name, the identity line (make), and
  a stat tile (e.g. "2" drives); empty cars → the empty-state text.
- **`VehicleCard.test.tsx`:** decoded → subtitle shows "Renault" + country; existing fallback test passes.
- Use synthetic fixtures only (VIN `TESTVIN0123456789` for non-WMI cases; the public `VF1…`/`5YJ…`
  prefixes are not PII). See [[hrva-drive-no-pii]].

## Non-goals
Model/engine from the VIN (impossible offline — `.brc` + drive estimates cover engine). Brand logos.
Editing decoded fields by hand. Per-car charts (the History per-car filter already covers trends).
