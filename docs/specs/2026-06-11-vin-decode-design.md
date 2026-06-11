# VIN-decode enrichment — opt-in car name + icon from NHTSA vPIC (design)

**Date:** 2026-06-11
**Status:** approved (design) → ready for implementation plan
**Idea:** let the user press a button to decode a stored car's VIN into a real **make/model/year** (+ a
body-type icon), shown in the garage picker and the drive report. Builds on the garage
([[hrva-drive-garage]]).

## Grounding (verified)

- **NHTSA vPIC** `GET https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{VIN}?format=json` (no key)
  returns `Results[0]` with `Make`, `Model`, `ModelYear`, `BodyClass`, `FuelTypePrimary`, `Trim`, …
- **CORS is open** (`access-control-allow-origin: *` when an `Origin` header is sent), so the **browser
  calls vPIC directly** — our stateless server never sees the VIN for this. **Zero backend change.**
- Privacy: this is the only time a VIN leaves the device, and **only when the user presses Decode**.
  Never auto-fire, never a global always-on.

## Architecture

Opt-in, client-direct. A per-car **Decode** button (garage) calls vPIC; the decoded fields **cache on
the `Car` record**; the garage `<select>` and the report `VehicleCard` show the decoded name + a
body-type **emoji** when present, falling back to the `.brc` label otherwise.

## Components

### 1. `frontend/src/history/vpic.ts`
```ts
export interface DecodedVehicle { make: string; model: string; year: string; bodyClass: string; fuelType: string }

export async function decodeVin(vin: string): Promise<DecodedVehicle | null>;
```
Fetch the endpoint; on `!res.ok`, thrown error, or a `Results[0]` missing `Make`/`Model` → return
`null` (invalid VINs come back with blank fields). Title-case `Make` ("HONDA" → "Honda"); keep `Model`
as returned; `year/bodyClass/fuelType` as strings (`?? ''`).

### 2. `frontend/src/history/car.ts` — display helpers
```ts
export function decodedName(v: { make?: string; model?: string; year?: string }): string; // '' unless make&model
export function carEmoji(bodyClass?: string): string; // body-type glyph, default '🚗'
```
`decodedName` → `[year, make, model].filter(Boolean).join(' ')` when make&model present, else `''`.
`carEmoji` maps `bodyClass` (lower-cased substring match): pickup/truck → 🛻; van/minivan → 🚐;
suv/sport utility/crossover/wagon → 🚙; convertible/cabriolet/roadster/coupe → 🏎️; everything else → 🚗.

### 3. `Car` type (`frontend/src/history/types.ts`)
Add optional cached fields: `make?: string; model?: string; year?: string; bodyClass?: string;
fuelType?: string; decodedAt?: number`. No DB-version change — `saveCar` already `put`s the whole record,
so the extra fields round-trip on the existing `cars` store (v2).

### 4. Garage `<select>` + Decode button (`Uploader.tsx`)
- Option text: a decoded car shows `` `${carEmoji(c.bodyClass)} ${decodedName(c)}` `` (icon + real name);
  an undecoded car shows `c.label || c.vin` (the `.brc` label). So the garage gets the icon too.
- New props: `onDecodeCar(vin: string)`, `decodingVin: string` (`''` = idle).
- When the **selected** car exists, has a `vin`, and isn't decoded yet (`!car.make`), show a small
  **"🔎 Decode"** button (title: "Look up make/model from NHTSA — sends your VIN"); while
  `decodingVin === car.vin` it reads "Decoding…" and is disabled. After success it disappears (the car
  now has `make`). Styled as a pill, matching the car-picker controls.
- **`Landing.tsx`** spreads the same props → its `Props` interface gains `onDecodeCar` + `decodingVin`.

### 5. App wiring (`App.tsx`)
- `decodingVin` state (`''`).
- `onDecodeCar(vin)`: `setDecodingVin(vin)`; `const d = await decodeVin(vin)`; if `null` →
  `setError('Could not decode this VIN.')`; else find the car and
  `saveCar({ ...car, ...d, decodedAt: Date.now() })` → `refreshCars()`; `finally setDecodingVin('')`.
- Thread `onDecodeCar` + `decodingVin` into `uploaderProps`.
- VehicleCard: `const decodedCar = cars.find((c) => c.vin === analysis.drive.vehicle.vin && c.make)`;
  pass `decoded={decodedCar}` to `<VehicleCard>`.

### 6. Report `VehicleCard.tsx`
Add optional prop `decoded?: { make?: string; model?: string; year?: string; bodyClass?: string;
fuelType?: string }`. When `decoded?.make`, the name line becomes
`{carEmoji(decoded.bodyClass)} {decodedName(decoded)}` plus ` · {decoded.fuelType}` when present;
otherwise the existing `label · engine`. VIN line + meta unchanged.

### 7. Privacy
`PRIVACY.md`: add a bullet — "If you press **Decode VIN**, that car's VIN is sent to the NHTSA vPIC API
(US government) to look up make/model. This is the only time a VIN leaves your device, and only when you
choose it."

## Edges / non-goals

- Invalid VIN / network error → `null` → inline "Could not decode this VIN"; nothing stored.
- Decoded info cached on the car; removing the car drops it. No re-decode/clear button in v1.
- **Display-only fuel type** — CO₂ stays on the engine-string detection; no `/analyze` change.
- Not in scope: History car chips (kept as label/decoded text only — no icon there), brand logos, real
  SVG silhouettes (emoji chosen for crisp cross-OS rendering; swappable later).

## Testing

- **`vpic.test.ts`**: mock `fetch` returning a vPIC payload → mapped `{make:'Honda',model:'Accord',…}`;
  empty `Results`/missing Make → `null`; non-ok → `null`.
- **`car.test.ts`**: `decodedName({make,model,year})` → "2018 Volkswagen Golf"; missing make → ''.
  `carEmoji('Pickup')` → 🛻, `carEmoji('Sport Utility Vehicle (SUV)')` → 🚙, unknown → 🚗.
- **`db.test.ts`**: `saveCar` round-trips the decoded fields (make/year persist).
- **`Uploader.test.tsx`**: a selected, undecoded car with a vin shows a Decode button → click calls
  `onDecodeCar(vin)`; a decoded car's option shows the decoded name; `decodingVin` disables the button.
- **`VehicleCard.test.tsx`**: with `decoded={{make:'Volkswagen',model:'Golf',year:'2018',bodyClass:'Hatchback',fuelType:'Diesel'}}`
  → shows "Volkswagen Golf" + "Diesel"; without `decoded` → existing label/engine test still passes.
