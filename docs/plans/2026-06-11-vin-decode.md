# VIN-decode Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in "Decode" button that turns a stored car's VIN into a real make/model/year (+ body-type emoji), shown in the garage picker and the drive report.

**Architecture:** Browser calls NHTSA vPIC directly (CORS open, no key, zero backend); decoded fields cache on the `Car` record; the garage `<select>` and report `VehicleCard` show the decoded name + emoji, falling back to the `.brc` label. Spec: `docs/specs/2026-06-11-vin-decode-design.md`.

**Tech Stack:** React + TS + Vitest (frontend only). npm from `frontend/`.

---

## File map

- **Create** `frontend/src/history/vpic.ts` (+ test) — `decodeVin`.
- **Create** `frontend/src/history/car.ts` (+ test) — `decodedName`, `carEmoji`.
- **Modify** `frontend/src/history/types.ts` — `Car` decoded fields.
- **Modify** `frontend/src/history/db.test.ts` — decoded round-trip.
- **Modify** `frontend/src/components/Uploader.tsx`, `Landing.tsx`, `frontend/src/index.css` (+ `Uploader.test.tsx`) — decoded option text + Decode button.
- **Modify** `frontend/src/App.tsx` — decode flow + pass `decoded` to VehicleCard.
- **Modify** `frontend/src/components/VehicleCard.tsx` (+ test) — decoded display.
- **Modify** `PRIVACY.md`, `frontend/src/components/PrivacyOverlay.tsx` — opt-in VIN disclosure.

Order: Tasks 1–2 standalone; Task 3 (Uploader) breaks `App` build until Task 4; Task 4 breaks `VehicleCard` build until Task 5. Full `npm run build` is green only at the end of Task 5 (flagged per task).

---

### Task 1: vPIC decode module + privacy disclosure

**Files:** Create `frontend/src/history/vpic.ts`, `frontend/src/history/vpic.test.ts`; Modify `PRIVACY.md`, `frontend/src/components/PrivacyOverlay.tsx`.

- [ ] **Step 1: Write the failing test** `frontend/src/history/vpic.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { decodeVin } from './vpic';

const ok = (results: unknown[]) => ({ ok: true, json: async () => ({ Results: results }) }) as Response;

afterEach(() => vi.restoreAllMocks());

describe('decodeVin', () => {
  it('maps the vPIC payload and title-cases the make', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok([
      { Make: 'HONDA', Model: 'Accord', ModelYear: '2003', BodyClass: 'Coupe', FuelTypePrimary: 'Gasoline' },
    ]));
    expect(await decodeVin('1HGCM82633A004352')).toEqual({
      make: 'Honda', model: 'Accord', year: '2003', bodyClass: 'Coupe', fuelType: 'Gasoline',
    });
  });

  it('returns null when Make/Model are missing (invalid VIN)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok([{ Make: '', Model: '', ErrorCode: '11' }]));
    expect(await decodeVin('BADVIN')).toBeNull();
  });

  it('returns null on a non-ok response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false } as Response);
    expect(await decodeVin('X')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- vpic`
Expected: FAIL — `Cannot find module './vpic'`.

- [ ] **Step 3: Implement** `frontend/src/history/vpic.ts`:

```ts
// Opt-in VIN decode via NHTSA vPIC (free, no key, CORS-open). Called only when the
// user presses "Decode" — the only time a VIN leaves the device. Our server is not involved.
export interface DecodedVehicle {
  make: string;
  model: string;
  year: string;
  bodyClass: string;
  fuelType: string;
}

const titleCase = (s: string): string =>
  s.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());

export async function decodeVin(vin: string): Promise<DecodedVehicle | null> {
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const r = (await res.json())?.Results?.[0];
    if (!r || !r.Make || !r.Model) return null;
    return {
      make: titleCase(r.Make),
      model: r.Model,
      year: r.ModelYear ?? '',
      bodyClass: r.BodyClass ?? '',
      fuelType: r.FuelTypePrimary ?? '',
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- vpic`
Expected: PASS (3 tests).

- [ ] **Step 5: Privacy disclosure.** In `PRIVACY.md`, add a bullet to the data-handling list (near the VIN/`.brc` mentions):

```
- **VIN decode is opt-in.** If you press **Decode VIN** on a car, that car's VIN is sent to the NHTSA
  vPIC API (a US-government service) to look up its make/model/year. This is the only time a VIN leaves
  your device, and only when you choose it. Nothing is stored on any server.
```

Then read `frontend/src/components/PrivacyOverlay.tsx` and add ONE matching list item to its bullet list (same `<li>`/markup style as the existing items), with the text: `"Decode VIN" is optional — pressing it sends that car's VIN to NHTSA (US gov) to look up make/model; the only time a VIN leaves your device.`

- [ ] **Step 6: Lint + commit**

Run: `cd frontend && npx eslint src/history/vpic.ts src/history/vpic.test.ts src/components/PrivacyOverlay.tsx` → 0 problems.

```bash
git add frontend/src/history/vpic.ts frontend/src/history/vpic.test.ts PRIVACY.md frontend/src/components/PrivacyOverlay.tsx
git commit -m "feat(vin): client-direct NHTSA vPIC decode + opt-in privacy disclosure"
```

---

### Task 2: Display helpers + Car decoded fields

**Files:** Create `frontend/src/history/car.ts`, `frontend/src/history/car.test.ts`; Modify `frontend/src/history/types.ts`, `frontend/src/history/db.test.ts`.

- [ ] **Step 1: Write the failing tests** `frontend/src/history/car.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodedName, carEmoji } from './car';

describe('decodedName', () => {
  it('joins year make model when make+model present', () => {
    expect(decodedName({ make: 'Volkswagen', model: 'Golf', year: '2018' })).toBe('2018 Volkswagen Golf');
  });
  it('is empty without make or model', () => {
    expect(decodedName({ make: 'Volkswagen' })).toBe('');
    expect(decodedName({})).toBe('');
  });
});

describe('carEmoji', () => {
  it('maps body classes to glyphs', () => {
    expect(carEmoji('Pickup')).toBe('🛻');
    expect(carEmoji('Sport Utility Vehicle (SUV)')).toBe('🚙');
    expect(carEmoji('Van')).toBe('🚐');
    expect(carEmoji('Convertible/Cabriolet')).toBe('🏎️');
    expect(carEmoji('Sedan/Saloon')).toBe('🚗');
    expect(carEmoji(undefined)).toBe('🚗');
  });
});
```

And add a decoded round-trip to `frontend/src/history/db.test.ts` (it already imports `saveCar, listCars` and has the `car(vin)` factory):

```ts
it('saveCar round-trips decoded fields', async () => {
  await saveCar({ ...car('VIN_D'), make: 'Honda', model: 'Accord', year: '2003' });
  const c = (await listCars()).find((x) => x.vin === 'VIN_D')!;
  expect(c.make).toBe('Honda');
  expect(c.year).toBe('2003');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- "car|db"`
Expected: FAIL — `./car` missing; `make` not a valid `Car` field (TS error in db.test).

- [ ] **Step 3: Add decoded fields to `Car`.** In `frontend/src/history/types.ts`, extend the `Car` interface:

```ts
export interface Car {
  vin: string;
  label: string;
  engine: string;
  createdAt: number;
  lastUsedAt: number;
  make?: string;
  model?: string;
  year?: string;
  bodyClass?: string;
  fuelType?: string;
  decodedAt?: number;
}
```

- [ ] **Step 4: Implement** `frontend/src/history/car.ts`:

```ts
// Display helpers for a decoded vehicle. carEmoji picks a body-type glyph (crisp on every
// OS); decodedName builds "year make model" once a VIN has been decoded.
export function decodedName(v: { make?: string; model?: string; year?: string }): string {
  if (!v.make || !v.model) return '';
  return [v.year, v.make, v.model].filter(Boolean).join(' ');
}

export function carEmoji(bodyClass?: string): string {
  const b = (bodyClass ?? '').toLowerCase();
  if (b.includes('pickup') || b.includes('truck')) return '🛻';
  if (b.includes('van') || b.includes('minivan')) return '🚐';
  if (b.includes('suv') || b.includes('sport utility') || b.includes('crossover') || b.includes('wagon')) return '🚙';
  if (b.includes('convertible') || b.includes('cabriolet') || b.includes('roadster') || b.includes('coupe')) return '🏎️';
  return '🚗';
}
```

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npm test -- "car|db"`
Expected: PASS (car.test 2 + the new db round-trip + existing db tests).

- [ ] **Step 6: Lint + commit**

Run: `cd frontend && npx eslint src/history/car.ts src/history/car.test.ts src/history/types.ts` → 0 problems.

```bash
git add frontend/src/history/car.ts frontend/src/history/car.test.ts frontend/src/history/types.ts frontend/src/history/db.test.ts
git commit -m "feat(vin): Car decoded fields + decodedName/carEmoji display helpers"
```

---

### Task 3: Garage — decoded option text + Decode button

**Files:** Modify `frontend/src/components/Uploader.tsx`, `frontend/src/components/Landing.tsx`, `frontend/src/index.css`, `frontend/src/components/Uploader.test.tsx`.

IMPORTANT: after this task `App.tsx` won't typecheck (it doesn't pass `onDecodeCar`/`decodingVin` yet) — expected, fixed in Task 4. Run only the Uploader test + scoped eslint, NOT `npm run build`.

- [ ] **Step 1: Add failing tests** to `frontend/src/components/Uploader.test.tsx`. First add `onDecodeCar` + `decodingVin` to the `base` object (it currently has `onAddCar`, `onRemoveCar`, etc.):

```tsx
  onDecodeCar: vi.fn(), decodingVin: '',
```

Add a `car.ts` import is NOT needed. Add these tests inside the `describe`:

```tsx
  it('shows a Decode button for an undecoded car and calls onDecodeCar', () => {
    const onDecodeCar = vi.fn();
    render(<Uploader {...base} cars={[car('V1', 'My Car')]} selectedCarVin="V1" onDecodeCar={onDecodeCar} />);
    fireEvent.click(screen.getByRole('button', { name: /decode vin/i }));
    expect(onDecodeCar).toHaveBeenCalledWith('V1');
  });

  it('shows the decoded name in the option and hides Decode once decoded', () => {
    const decoded: Car = { ...car('V1', 'My Car'), make: 'Volkswagen', model: 'Golf', year: '2018', bodyClass: 'Hatchback' };
    render(<Uploader {...base} cars={[decoded]} selectedCarVin="V1" />);
    expect(screen.getByRole('option', { name: /2018 Volkswagen Golf/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /decode vin/i })).toBeNull();
  });
```

(The `car(vin, label)` helper already exists at the top of the file and returns a `Car`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- Uploader`
Expected: FAIL — no Decode button; option shows the label not the decoded name; TS error on `onDecodeCar`/`decodingVin` props.

- [ ] **Step 3: Update `Uploader.tsx`.**

(a) Add the import at the top:

```tsx
import { carEmoji, decodedName } from '../history/car';
```

(b) Add two props to the `Props` interface (after `onRemoveCar`):

```tsx
  onDecodeCar: (vin: string) => void;
  decodingVin: string;
```

and to the destructure: add `onDecodeCar, decodingVin,`.

(c) Just inside the function body (before `return`), find the selected car:

```tsx
  const selectedCar = cars.find((c) => c.vin === selectedCarVin);
```

(d) Change the option text so a decoded car shows the emoji + decoded name:

```tsx
            {cars.map((c) => (
              <option key={c.vin} value={c.vin}>
                {c.make ? `${carEmoji(c.bodyClass)} ${decodedName(c)}` : c.label || c.vin}
              </option>
            ))}
```

(e) Add the Decode button inside the `.car-control` span, right after the remove (`✕`) button block:

```tsx
          {selectedCar && selectedCar.vin && !selectedCar.make && (
            <button type="button" className="car-control__add" aria-label="decode vin"
                    title="Look up make/model from NHTSA — sends your VIN"
                    disabled={decodingVin === selectedCar.vin}
                    onClick={() => onDecodeCar(selectedCar.vin)}>
              {decodingVin === selectedCar.vin ? 'Decoding…' : '🔎 Decode'}
            </button>
          )}
```

- [ ] **Step 4: Update `Landing.tsx` Props.** Add the same two lines to `Landing`'s `Props` interface (it spreads `{...props}` to `<Uploader>`, so no body change):

```tsx
  onDecodeCar: (vin: string) => void;
  decodingVin: string;
```

- [ ] **Step 5: Run the Uploader test + scoped lint** (NOT the full build):

Run: `cd frontend && npm test -- Uploader` → PASS (5 existing + 2 new).
Run: `cd frontend && npx eslint src/components/Uploader.tsx src/components/Uploader.test.tsx src/components/Landing.tsx` → 0 problems.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Uploader.tsx frontend/src/components/Uploader.test.tsx frontend/src/components/Landing.tsx frontend/src/index.css
git commit -m "feat(vin): garage shows decoded name + per-car Decode button"
```

(`index.css` is staged in case you tweak `.car-control__add`; the existing pill style already covers the Decode button, so no CSS change is required — the commit is fine with `index.css` unchanged.)

---

### Task 4: App wiring — decode flow + pass decoded to VehicleCard

**Files:** Modify `frontend/src/App.tsx`.

IMPORTANT: after this task `VehicleCard` doesn't accept `decoded` yet → `npm run build` still fails (fixed in Task 5). Run targeted tests + `npx eslint src/App.tsx` only.

Read `App.tsx` first. It has: `import { ... } from './history/db'` (with `saveCar`, `listCars`, `refreshCars`, `cars`, `setError`), the `uploaderProps` object, and renders `<VehicleCard drive={analysis.drive} dataQuality={analysis.dataQuality} />` at ~line 160.

- [ ] **Step 1: Imports.** Add `import { decodeVin } from './history/vpic';`.

- [ ] **Step 2: State.** Add next to the other garage state:

```tsx
  const [decodingVin, setDecodingVin] = useState<string>('');
```

- [ ] **Step 3: Decode handler.** Add near `onAddCar`/`onRemoveCar`:

```tsx
  async function onDecodeCar(vin: string) {
    setDecodingVin(vin);
    try {
      const d = await decodeVin(vin);
      if (!d) { setError('Could not decode this VIN.'); return; }
      const carRec = cars.find((c) => c.vin === vin);
      if (carRec) {
        await saveCar({ ...carRec, ...d, decodedAt: Date.now() }).catch(() => {});
        await refreshCars();
      }
    } finally {
      setDecodingVin('');
    }
  }
```

- [ ] **Step 4: Thread into `uploaderProps`.** Add `onDecodeCar, decodingVin,` to the `uploaderProps` object literal.

- [ ] **Step 5: Pass `decoded` to VehicleCard.** Just before the `<VehicleCard ... />` render (or inline), compute and pass the matching decoded car:

```tsx
            <VehicleCard
              drive={analysis.drive}
              dataQuality={analysis.dataQuality}
              decoded={cars.find((c) => c.vin === analysis.drive.vehicle.vin && c.make)}
            />
```

- [ ] **Step 6: Verify (targeted only).**

Run: `cd frontend && npm test -- "App|Uploader|vpic|car|db"` → all pass.
Run: `cd frontend && npx eslint src/App.tsx` → 0 problems.
(`npm run build` is expected to fail only on `VehicleCard`'s `decoded` prop — Task 5.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(vin): App decode flow — cache vPIC result on the car, feed VehicleCard"
```

---

### Task 5: VehicleCard decoded display (+ full build)

**Files:** Modify `frontend/src/components/VehicleCard.tsx`, `frontend/src/components/VehicleCard.test.tsx`.

- [ ] **Step 1: Add the failing test** to `frontend/src/components/VehicleCard.test.tsx`:

```tsx
  it('shows the decoded make/model/fuel when provided', () => {
    render(<VehicleCard drive={drive} dataQuality={dataQuality}
      decoded={{ make: 'Volkswagen', model: 'Golf', year: '2018', bodyClass: 'Hatchback', fuelType: 'Diesel' }} />);
    expect(screen.getByText(/2018 Volkswagen Golf/)).toBeInTheDocument();
    expect(screen.getByText(/Diesel/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- VehicleCard`
Expected: FAIL — `decoded` prop not accepted; decoded name not rendered.

- [ ] **Step 3: Update `frontend/src/components/VehicleCard.tsx`:**

```tsx
import type { DriveAnalysis } from '../types';
import { carEmoji, decodedName } from '../history/car';

interface Props {
  drive: DriveAnalysis['drive'];
  dataQuality: DriveAnalysis['dataQuality'];
  decoded?: { make?: string; model?: string; year?: string; bodyClass?: string; fuelType?: string };
}

export default function VehicleCard({ drive, dataQuality, decoded }: Props) {
  const engine = drive.vehicle.engine ? ` · ${drive.vehicle.engine}` : '';
  const name = decoded?.make
    ? `${carEmoji(decoded.bodyClass)} ${decodedName(decoded)}${decoded.fuelType ? ` · ${decoded.fuelType}` : ''}`
    : `${drive.vehicle.label ?? 'Vehicle'}${engine}`;
  return (
    <section className="card vehicle">
      <div className="vehicle__name">{name}</div>
      {drive.vehicle.vin && <div className="vehicle__vin">VIN {drive.vehicle.vin}</div>}
      <div className="vehicle__meta">
        {dataQuality.pidsPresent.length} signals · distance from {dataQuality.distanceSource}
        {drive.startedAtClock ? ` · started ${drive.startedAtClock.slice(0, 8)}` : ''}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- VehicleCard`
Expected: PASS (2 existing — fallback path — + the new decoded test).

- [ ] **Step 5: Full suite + lint + build**

Run: `cd frontend && npm test` → all pass.
Run: `cd frontend && npm run lint && npm run build` → lint 0 problems, build succeeds.

- [ ] **Step 6: Manual smoke**

`cd frontend && npm run dev`: add a car from a real `.brc` (with a real VIN), press **🔎 Decode** → the dropdown option becomes "🚗 2018 Volkswagen Golf"; analyze a drive → the report's vehicle card shows the decoded name + fuel. A bogus VIN → "Could not decode this VIN." (If you have no real VIN `.brc` handy, this step is optional — the unit tests cover the mapping + UI.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/VehicleCard.tsx frontend/src/components/VehicleCard.test.tsx
git commit -m "feat(vin): report VehicleCard shows the decoded name + body-type emoji"
```

---

## Self-review

**Spec coverage:**
- `vpic.ts` `decodeVin` (client-direct, null on bad/empty) → Task 1. ✓
- `car.ts` `decodedName` + `carEmoji` → Task 2. ✓
- `Car` decoded fields (no DB-version change) + round-trip → Task 2. ✓
- Garage `<select>` decoded option text + Decode button + props + Landing → Task 3. ✓
- App decode flow (`onDecodeCar`, `decodingVin`, saveCar+refresh) + pass `decoded` to VehicleCard → Task 4. ✓
- VehicleCard decoded display (emoji + name + fuel, fallback) → Task 5. ✓
- Privacy disclosure (PRIVACY.md + PrivacyOverlay) → Task 1. ✓
- Display-only fuel type (no `/analyze` change) → respected (no backend task). ✓

**Placeholder scan:** none — every code step shows the content. (Task 1 Step 5's PrivacyOverlay edit gives the exact sentence and says to match the existing `<li>` style — a deliberate "match the pattern" instruction, not a placeholder.)

**Type/name consistency:** `DecodedVehicle {make,model,year,bodyClass,fuelType}` (Task 1) ⊇ the `Car` decoded fields (Task 2) ⊇ the `decoded?` prop on VehicleCard (Task 5) — all use the same field names. `decodedName`/`carEmoji` signatures (Task 2) are imported identically in Uploader (Task 3) and VehicleCard (Task 5). `onDecodeCar(vin)` + `decodingVin: string` are consistent across Uploader/Landing (Task 3) and App (Task 4). `saveCar({...car, ...d, decodedAt})` matches `saveCar(Car)` from the garage feature.
