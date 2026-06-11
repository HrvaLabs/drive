# Vehicle Garage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a `.brc` once → the app stores the car and reuses it on every later drive (no re-upload); support multiple cars and filter history by car.

**Architecture:** Parse the `.brc` header client-side (keep `{vin,label,engine}`); a `cars` IndexedDB store (DB v2); reuse a car by sending `vin/label/engine` form fields to `/analyze` (so CO₂ stays correct); a car picker in the Uploader with a smart default; per-car History filter. Spec: `docs/specs/2026-06-11-vehicle-garage-design.md`.

**Tech Stack:** Python/FastAPI (pytest); React + TS + Vitest + fake-indexeddb. Backend pytest from `analysis/` via `.venv/bin/python`; frontend npm from `frontend/`.

---

## File map

- `analysis/app/main.py` (+ `tests/test_analyze.py`) — `/analyze` accepts `vin/label/engine`.
- `frontend/src/history/brc.ts` (+ test) — client-side `.brc` header parser.
- `frontend/src/history/types.ts`, `frontend/src/history/db.ts` (+ `db.test.ts`) — `Car`, `carVin`, DB v2, cars CRUD.
- `frontend/src/api.ts` (+ `api.test.ts`) — send vehicle fields.
- `frontend/src/components/Uploader.tsx`, `Landing.tsx` (+ `Uploader.test.tsx`) — car picker.
- `frontend/src/App.tsx` — garage state + analyze wiring.
- `frontend/src/components/HistoryView.tsx` (+ test) — per-car filter.
- `frontend/src/index.css` — small `.car-control` styles.

---

### Task 1: Backend — `/analyze` accepts vehicle fields

**Files:** Modify `analysis/app/main.py`, `analysis/tests/test_analyze.py`.

- [ ] **Step 1: Write the failing test** — add to `analysis/tests/test_analyze.py`:

```python
def test_analyze_uses_engine_field_for_diesel_co2_and_vehicle():
    files = {"file": ("drive.csv", SYNTHETIC_VERTICAL.encode("utf-8"), "text/csv")}
    r = client.post("/analyze", files=files,
                    data={"engine": "2.0 TDI", "label": "My TDI", "vin": "TESTVIN0123456789"})
    assert r.status_code == 200
    b = r.json()
    assert b["summary"]["fuelType"] == "diesel"        # engine string drove fuel-type
    assert b["drive"]["vehicle"]["label"] == "My TDI"
    assert b["drive"]["vehicle"]["vin"] == "TESTVIN0123456789"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analyze.py::test_analyze_uses_engine_field_for_diesel_co2_and_vehicle -q`
Expected: FAIL — `engine`/`label`/`vin` aren't accepted, so `fuelType` defaults to `petrol` and the vehicle fields are empty.

- [ ] **Step 3: Add the form fields + vehicle logic.** In `analysis/app/main.py`, the `analyze` handler currently ends with:

```python
    df = parse_drive(content)
    vehicle = brc_mod.parse_brc_header(await brc.read()) if brc is not None else None
    return build_drive_analysis(df, source=format, price_per_l=pricePerL, vehicle=vehicle)
```

Add three `Form` params to the signature (after `pricePerL`, before `brc`):

```python
    vin: str | None = Form(None),
    label: str | None = Form(None),
    engine: str | None = Form(None),
```

and replace the `vehicle = ...` line with:

```python
    if brc is not None:
        vehicle = brc_mod.parse_brc_header(await brc.read())
    elif vin or label or engine:
        vehicle = {"vin": vin, "label": label, "engine": engine}
    else:
        vehicle = None
```

- [ ] **Step 4: Run to verify it passes + full suite**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: PASS (the new test + all existing — the `.brc` path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add analysis/app/main.py analysis/tests/test_analyze.py
git commit -m "feat(analysis): /analyze accepts vin/label/engine fields (reuse a stored car)"
```

---

### Task 2: Client-side `.brc` parser

**Files:** Create `frontend/src/history/brc.ts`, `frontend/src/history/brc.test.ts`.

- [ ] **Step 1: Write the failing test** `frontend/src/history/brc.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseBrcHeader } from './brc';

const lp = (s: string): number[] => [s.length, ...Array.from(s, (c) => c.charCodeAt(0))];

function makeBrc(vin: string, label: string, engine: string): ArrayBuffer {
  const bytes = [...lp('CARSCANNERRECORD'), 1, 0, 0, 0, ...lp(vin), ...lp(label), ...lp(engine)];
  return new Uint8Array(bytes).buffer;
}

describe('parseBrcHeader', () => {
  it('reads vin/label/engine from a valid header', () => {
    expect(parseBrcHeader(makeBrc('TESTVIN0123456789', 'My Car', '2.0 TDI')))
      .toEqual({ vin: 'TESTVIN0123456789', label: 'My Car', engine: '2.0 TDI' });
  });

  it('returns null for a non-brc buffer', () => {
    expect(parseBrcHeader(new Uint8Array([1, 2, 3, 4]).buffer)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- brc`
Expected: FAIL — `Cannot find module './brc'`.

- [ ] **Step 3: Implement** `frontend/src/history/brc.ts`:

```ts
// Parse the Car Scanner .brc header for vehicle identity — mirrors analysis/app/brc.py.
// Only the header is read (magic + u32 version + three u8-length-prefixed latin-1 strings);
// the proprietary binary records are ignored, and the file never leaves the browser.
const MAGIC = 'CARSCANNERRECORD';

export function parseBrcHeader(buf: ArrayBuffer): { vin: string; label: string; engine: string } | null {
  const data = new Uint8Array(buf);
  const dec = new TextDecoder('latin1');
  let i = 0;
  const readLp = (): string => {
    if (i >= data.length) throw new Error('eof');
    const n = data[i];
    i += 1;
    if (i + n > data.length) throw new Error('eof');
    const s = dec.decode(data.subarray(i, i + n));
    i += n;
    return s;
  };
  try {
    if (readLp() !== MAGIC) return null;
    i += 4; // u32 version (little-endian) — skip
    const vin = readLp();
    const label = readLp();
    const engine = readLp();
    return { vin, label, engine };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- brc`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/history/brc.ts frontend/src/history/brc.test.ts
git commit -m "feat(garage): client-side .brc header parser"
```

---

### Task 3: IndexedDB — Car type, carVin, DB v2, cars CRUD

**Files:** Modify `frontend/src/history/types.ts`, `frontend/src/history/db.ts`, `frontend/src/history/db.test.ts`.

- [ ] **Step 1: Write the failing tests** — add to `analysis`… no: add to `frontend/src/history/db.test.ts` (it imports `fake-indexeddb/auto`, has `analysis()` + `beforeEach(clearAll)`). Replace the db import line to add the new functions:

```ts
import { saveDrive, listDrives, getDrive, deleteDrive, clearAll, updateDriveMeta,
         listCars, saveCar, deleteCar, touchCar } from './db';
import type { Car } from './types';
```

Add these tests:

```ts
const car = (vin: string): Car => ({ vin, label: 'My Car', engine: '2.0 TDI', createdAt: 1, lastUsedAt: 1 });

it('cars: save, list, delete', async () => {
  await saveCar(car('VIN_A'));
  await saveCar(car('VIN_B'));
  expect((await listCars()).map((c) => c.vin).sort()).toEqual(['VIN_A', 'VIN_B']);
  await deleteCar('VIN_A');
  expect((await listCars()).map((c) => c.vin)).toEqual(['VIN_B']);
});

it('touchCar bumps lastUsedAt', async () => {
  await saveCar(car('VIN_A'));
  await touchCar('VIN_A');
  const c = (await listCars())[0];
  expect(c.lastUsedAt).toBeGreaterThan(1);
});

it('saveDrive persists carVin', async () => {
  const rec = await saveDrive(analysis(), 'd.csv', 'VIN_A');
  expect(rec.carVin).toBe('VIN_A');
  expect((await getDrive(rec.id))?.carVin).toBe('VIN_A');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- db`
Expected: FAIL — `listCars`/`saveCar`/etc. not exported; `saveDrive` ignores the 3rd arg.

- [ ] **Step 3: Add the `Car` type + `carVin`.** In `frontend/src/history/types.ts`, add to the `DriveMeta` interface: `carVin?: string;` (alongside the `notes?`/`tags?` added earlier). And add a new interface:

```ts
export interface Car {
  vin: string;
  label: string;
  engine: string;
  createdAt: number;
  lastUsedAt: number;
}
```

- [ ] **Step 4: Bump the DB to v2, generalise `run`, add cars CRUD.** In `frontend/src/history/db.ts`:

(a) Add a cars store name beside `const STORE = 'drives';`:

```ts
const CARS = 'cars';
```

(b) Bump the version and create the cars store in `onupgradeneeded`:

```ts
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('savedAt', 'savedAt');
      }
      if (!db.objectStoreNames.contains(CARS)) {
        db.createObjectStore(CARS, { keyPath: 'vin' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
```

(c) Generalise `run` to take a store name. Replace the existing `run` with:

```ts
function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}
```

Then update EVERY existing `run(` call to pass `STORE` as the first arg:
- in `saveDrive`: `await run(STORE, 'readwrite', (s) => s.put(rec));`
- in `listDrives`: `const all = await run<StoredDrive[]>(STORE, 'readonly', (s) => s.getAll());`
- in `getDrive`: `return run<StoredDrive | undefined>(STORE, 'readonly', (s) => s.get(id));`
- in `deleteDrive`: `await run(STORE, 'readwrite', (s) => s.delete(id));`
- in `clearAll`: `await run(STORE, 'readwrite', (s) => s.clear());`
- in `updateDriveMeta`: `await run(STORE, 'readwrite', (s) => s.put({ ...rec, ...patch }));`

(d) Add `carVin` to `saveDrive`. Change its signature/body to:

```ts
export async function saveDrive(analysis: DriveAnalysis, filename?: string, carVin?: string): Promise<StoredDrive> {
  const rec: StoredDrive = { ...toStored(analysis, filename), carVin };
  await run(STORE, 'readwrite', (s) => s.put(rec));
  return rec;
}
```

(e) Add cars CRUD (after `clearAll`):

```ts
export function listCars(): Promise<Car[]> {
  return run<Car[]>(CARS, 'readonly', (s) => s.getAll());
}

export async function saveCar(carRec: Car): Promise<void> {
  await run(CARS, 'readwrite', (s) => s.put(carRec));
}

export async function deleteCar(vin: string): Promise<void> {
  await run(CARS, 'readwrite', (s) => s.delete(vin));
}

export async function touchCar(vin: string): Promise<void> {
  const c = await run<Car | undefined>(CARS, 'readonly', (s) => s.get(vin));
  if (c) await run(CARS, 'readwrite', (s) => s.put({ ...c, lastUsedAt: Date.now() }));
}
```

Add `Car` to the type import at the top: `import type { Car, DriveMeta, StoredDrive } from './types';`

- [ ] **Step 5: Run to verify they pass**

Run: `cd frontend && npm test -- db`
Expected: PASS (existing db tests + the 3 new). If an existing test reads the DB and the version bump causes an "older version" error, that only happens with a persisted DB; `fake-indexeddb` is fresh per run, so it's fine.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/history/types.ts frontend/src/history/db.ts frontend/src/history/db.test.ts
git commit -m "feat(garage): cars store (DB v2) + carVin on drives"
```

---

### Task 4: api.ts sends vehicle fields

**Files:** Modify `frontend/src/api.ts`, `frontend/src/api.test.ts`.

- [ ] **Step 1: Write the failing test** — add to `frontend/src/api.test.ts`:

```ts
it('appends vin/label/engine when a vehicle is given and no brc', async () => {
  await analyzeDrive(new File(['x'], 'd.csv'), null, '', { vin: 'V1', label: 'Car', engine: '2.0 TDI' });
  const fd = lastFormData();
  expect(fd.get('vin')).toBe('V1');
  expect(fd.get('label')).toBe('Car');
  expect(fd.get('engine')).toBe('2.0 TDI');
});

it('omits vehicle fields when empty', async () => {
  await analyzeDrive(new File(['x'], 'd.csv'), null, '', { vin: '', label: '', engine: '' });
  expect(lastFormData().get('vin')).toBeNull();
});
```

(The file already has a `lastFormData()` helper and a `beforeEach` fetch mock.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- api`
Expected: FAIL — `analyzeDrive` takes no 4th arg, so the fields are never appended.

- [ ] **Step 3: Add the `vehicle` param.** In `frontend/src/api.ts`, change the signature and add the append block (after the existing `pricePerL` block, before the `fetch`):

```ts
export async function analyzeDrive(
  file: File,
  brc?: File | null,
  pricePerL?: string,
  vehicle?: { vin?: string; label?: string; engine?: string },
): Promise<DriveAnalysis> {
  const form = new FormData();
  form.append('file', file);
  form.append('format', 'vertical_layout');
  if (brc) {
    form.append('brc', brc);
  }
  const price = Number(pricePerL);
  if (pricePerL && Number.isFinite(price) && price > 0) {
    form.append('pricePerL', pricePerL);
  }
  if (!brc && vehicle) {
    if (vehicle.vin) form.append('vin', vehicle.vin);
    if (vehicle.label) form.append('label', vehicle.label);
    if (vehicle.engine) form.append('engine', vehicle.engine);
  }
  const res = await fetch('/api/v1/drives:analyze', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DriveAnalysis;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- api`
Expected: PASS (existing api tests + the 2 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/api.test.ts
git commit -m "feat(api): analyzeDrive forwards a stored vehicle's vin/label/engine"
```

---

### Task 5: Uploader car picker (+ Landing props + CSS)

**Files:** Modify `frontend/src/components/Uploader.tsx`, `frontend/src/components/Landing.tsx`, `frontend/src/index.css`; Modify `frontend/src/components/Uploader.test.tsx`.

- [ ] **Step 1: Replace the Uploader test's brc expectations with the car picker.** Overwrite `frontend/src/components/Uploader.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Car } from '../history/types';
import Uploader from './Uploader';

const car = (vin: string, label: string): Car => ({ vin, label, engine: '2.0 TDI', createdAt: 1, lastUsedAt: 1 });

const base = {
  files: [] as File[], setFiles: vi.fn(),
  pricePerL: '', setPricePerL: vi.fn(),
  cars: [] as Car[], selectedCarVin: '', setSelectedCarVin: vi.fn(),
  onAddCar: vi.fn(), onRemoveCar: vi.fn(),
  onAnalyze: vi.fn(), loading: false,
};

describe('Uploader car picker', () => {
  it('lists garage cars and reports selection', () => {
    const setSelectedCarVin = vi.fn();
    render(<Uploader {...base} cars={[car('V1', 'My Car')]} setSelectedCarVin={setSelectedCarVin} />);
    const select = screen.getByLabelText(/^car$/i);
    expect(screen.getByRole('option', { name: 'My Car' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'V1' } });
    expect(setSelectedCarVin).toHaveBeenCalledWith('V1');
  });

  it('adds a car from a .brc file', () => {
    const onAddCar = vi.fn();
    render(<Uploader {...base} onAddCar={onAddCar} />);
    const input = screen.getByLabelText(/add car file/i);
    fireEvent.change(input, { target: { files: [new File(['x'], 'car.brc')] } });
    expect(onAddCar).toHaveBeenCalled();
  });

  it('removes the selected car', () => {
    const onRemoveCar = vi.fn();
    render(<Uploader {...base} cars={[car('V1', 'My Car')]} selectedCarVin="V1" onRemoveCar={onRemoveCar} />);
    fireEvent.click(screen.getByRole('button', { name: /remove car/i }));
    expect(onRemoveCar).toHaveBeenCalledWith('V1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- Uploader`
Expected: FAIL — Uploader has no car props/markup (and a TS error on the new props).

- [ ] **Step 3: Rewrite `frontend/src/components/Uploader.tsx`:**

```tsx
import type { Car } from '../history/types';

interface Props {
  files: File[];
  setFiles: (f: File[]) => void;
  pricePerL: string;
  setPricePerL: (v: string) => void;
  cars: Car[];
  selectedCarVin: string;
  setSelectedCarVin: (vin: string) => void;
  onAddCar: (file: File) => void;
  onRemoveCar: (vin: string) => void;
  onAnalyze: () => void;
  loading: boolean;
}

// Shared upload controls — used in the landing hero and in the compact bar above
// the dashboard. The chosen car is reused on every drive (no .brc re-upload).
export default function Uploader({
  files, setFiles, pricePerL, setPricePerL,
  cars, selectedCarVin, setSelectedCarVin, onAddCar, onRemoveCar,
  onAnalyze, loading,
}: Props) {
  return (
    <div className="upload no-print">
      <label className="upload__field">
        <span className="upload__caption">Drive log(s) · CSV</span>
        <input type="file" aria-label="drive file" accept=".csv" multiple
               onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      </label>
      <label className="upload__field">
        <span className="upload__caption">Car</span>
        <span className="car-control">
          <select aria-label="car" value={selectedCarVin} onChange={(e) => setSelectedCarVin(e.target.value)}>
            <option value="">No car</option>
            {cars.map((c) => <option key={c.vin} value={c.vin}>{c.label || c.vin}</option>)}
          </select>
          {selectedCarVin && (
            <button type="button" className="car-control__x" aria-label="remove car"
                    onClick={() => onRemoveCar(selectedCarVin)}>✕</button>
          )}
          <label className="car-control__add">+ add car
            <input type="file" aria-label="add car file" accept=".brc" style={{ display: 'none' }}
                   onChange={(e) => { const f = e.target.files?.[0]; if (f) onAddCar(f); e.currentTarget.value = ''; }} />
          </label>
        </span>
      </label>
      <label className="upload__field">
        <span className="upload__caption">Fuel price · €/L (optional)</span>
        <input type="number" aria-label="fuel price per litre" step="0.01" min="0"
               inputMode="decimal" placeholder="e.g. 1.65" value={pricePerL}
               onChange={(e) => setPricePerL(e.target.value)} />
      </label>
      <button className="btn btn--primary upload__go" aria-label="analyze drive"
              onClick={onAnalyze} disabled={!files.length || loading}>
        {loading ? 'Analyzing…' : files.length > 1 ? `Analyze ${files.length}` : 'Analyze'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Update `Landing.tsx`'s `Props`.** `Landing` spreads the same props into its inner `Uploader`. In `frontend/src/components/Landing.tsx`, change the `Props` interface: REMOVE `setBrc: (f: File | null) => void;` and ADD:

```tsx
  cars: import('../history/types').Car[];
  selectedCarVin: string;
  setSelectedCarVin: (vin: string) => void;
  onAddCar: (file: File) => void;
  onRemoveCar: (vin: string) => void;
```

(Landing already passes `{...props}` to `<Uploader>`, so no body change beyond the interface. If `Props` currently lists `setBrc`, removing it is required for the build.)

- [ ] **Step 5: Append `.car-control` CSS to `frontend/src/index.css`:**

```css
.car-control { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.car-control select { background: var(--bg); border: 1px solid var(--line); border-radius: 6px; color: var(--text); padding: 4px 8px; font: inherit; }
.car-control__x { background: none; border: none; color: var(--muted); cursor: pointer; font-size: 14px; padding: 0; }
.car-control__add { color: var(--accent); cursor: pointer; font-size: 13px; }
```

- [ ] **Step 6: Run + lint**

Run: `cd frontend && npm test -- Uploader` → PASS (3 tests).
Run: `cd frontend && npx eslint src/components/Uploader.tsx src/components/Uploader.test.tsx src/components/Landing.tsx` → 0 problems.
(Note: `App.tsx` will NOT typecheck yet — it still passes `setBrc`. That's Task 6.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/Uploader.tsx frontend/src/components/Uploader.test.tsx frontend/src/components/Landing.tsx frontend/src/index.css
git commit -m "feat(garage): Uploader car picker (select + add/remove) replacing the .brc input"
```

---

### Task 6: App wiring — garage state + analyze flow

**Files:** Modify `frontend/src/App.tsx`.

Current relevant `App.tsx`: state `const [brc, setBrc] = useState<File | null>(null);`; `onAnalyze` loops `last = await analyzeDrive(files[i], brc, pricePerL);` then `await saveDrive(last, files[i].name)`; `const uploaderProps = { files, brc, setFiles, setBrc, pricePerL, setPricePerL, onAnalyze, loading: ... }`; renders `<Landing {...uploaderProps} />`, `<Uploader {...uploaderProps} />`, and `<HistoryView drives={history} onOpen={openStored} onDelete={removeStored} onChanged={refreshHistory} />`.

- [ ] **Step 1: Add imports.** Add to the history/db import: `listCars, saveCar, deleteCar, touchCar`; add `import { parseBrcHeader } from './history/brc';` and `import type { Car } from './history/types';` (next to the existing `import type { DriveMeta } from './history/types';`).

- [ ] **Step 2: Replace `brc` state with garage state.** Replace `const [brc, setBrc] = useState<File | null>(null);` with:

```tsx
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedCarVin, setSelectedCarVin] = useState<string>('');
  const refreshCars = () => listCars().then(setCars).catch(() => {});
```

In the existing `useEffect(() => { refreshHistory(); }, []);`, also load cars — change it to:

```tsx
  useEffect(() => { refreshHistory(); refreshCars(); }, []);
```

- [ ] **Step 3: Smart-default the selected car when the garage loads/changes.** Add a new effect after that one:

```tsx
  useEffect(() => {
    setSelectedCarVin((cur) => {
      if (cars.some((c) => c.vin === cur)) return cur;       // keep a still-valid choice
      if (cars.length === 0) return '';                       // No car
      return [...cars].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0].vin; // newest-used
    });
  }, [cars]);
```

- [ ] **Step 4: Add the add/remove handlers** (next to `onAnalyze`):

```tsx
  async function onAddCar(file: File) {
    const parsed = parseBrcHeader(await file.arrayBuffer());
    if (!parsed || !parsed.vin) { setError('Could not read a VIN from that .brc file.'); return; }
    const now = Date.now();
    await saveCar({ ...parsed, createdAt: now, lastUsedAt: now }).catch(() => {});
    await refreshCars();
    setSelectedCarVin(parsed.vin);
  }

  async function onRemoveCar(vin: string) {
    await deleteCar(vin).catch(() => {});
    await refreshCars();
  }
```

- [ ] **Step 5: Use the selected car in `onAnalyze`.** In `onAnalyze`, replace the analyze + save lines:

```tsx
        last = await analyzeDrive(files[i], brc, pricePerL);
        await saveDrive(last, files[i].name).catch(() => {});
```

with:

```tsx
        const carRec = cars.find((c) => c.vin === selectedCarVin);
        const vehicle = carRec ? { vin: carRec.vin, label: carRec.label, engine: carRec.engine } : undefined;
        last = await analyzeDrive(files[i], null, pricePerL, vehicle);
        await saveDrive(last, files[i].name, selectedCarVin || undefined).catch(() => {});
```

After the loop (right after the localStorage price-persist block, before `setTookMs`), bump the car's last-used:

```tsx
      if (selectedCarVin) await touchCar(selectedCarVin).catch(() => {});
```

- [ ] **Step 6: Update `uploaderProps` and the HistoryView render.** Change:

```tsx
  const uploaderProps = { files, brc, setFiles, setBrc, pricePerL, setPricePerL, onAnalyze, loading: phase === 'loading' };
```

to:

```tsx
  const uploaderProps = {
    files, setFiles, pricePerL, setPricePerL,
    cars, selectedCarVin, setSelectedCarVin, onAddCar, onRemoveCar,
    onAnalyze, loading: phase === 'loading',
  };
```

And change the History render to pass cars:

```tsx
        <HistoryView drives={history} cars={cars} onOpen={openStored} onDelete={removeStored} onChanged={refreshHistory} />
```

- [ ] **Step 7: Typecheck + full frontend test + lint.** (HistoryView gains a `cars` prop in Task 7; until then it will complain about the extra prop. To keep this task self-contained, ALSO do the minimal HistoryView Props change here is NOT needed — instead run only the build check that App/Uploader/Landing are consistent.)

Run: `cd frontend && npm test -- "App|Uploader|api|db|brc"` → all pass.
Run: `cd frontend && npx eslint src/App.tsx` → 0 problems.
(`npm run build` will still fail because `HistoryView` doesn't accept `cars` yet — that's Task 7. Do not run the full build here.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(garage): App garage state — reuse the selected car on analyze, store carVin"
```

---

### Task 7: History — per-car filter (+ full build)

**Files:** Modify `frontend/src/components/HistoryView.tsx`, `frontend/src/components/HistoryView.test.tsx`.

- [ ] **Step 1: Write the failing test** — add to `frontend/src/components/HistoryView.test.tsx` (it already mocks recharts + `../history/db`; the `d(...)` helper builds a `DriveMeta`). Add a `carVin` to the helper usage and a new test:

```tsx
import type { Car } from '../history/types';

const carList: Car[] = [
  { vin: 'V1', label: 'My Car', engine: '', createdAt: 1, lastUsedAt: 1 },
  { vin: 'V2', label: "Friend's", engine: '', createdAt: 1, lastUsedAt: 1 },
];

it('a car chip narrows the Drives list to that car', () => {
  const drives = [
    { ...d('alpha', []), carVin: 'V1' },
    { ...d('beta', []), carVin: 'V2' },
  ];
  render(<HistoryView drives={drives} cars={carList} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
  const list = () => document.querySelector('.drive-list') as HTMLElement;
  expect(within(list()).getByText(/beta/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'My Car' }));
  expect(within(list()).getByText(/alpha/)).toBeInTheDocument();
  expect(within(list()).queryByText(/beta/)).toBeNull();
});
```

(If the existing `d(...)` helper's `DriveMeta` doesn't include `carVin`, the spread `{ ...d('alpha', []), carVin: 'V1' }` adds it — fine.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- HistoryView`
Expected: FAIL — `HistoryView` has no `cars` prop / no car-filter chips (TS error + missing button).

- [ ] **Step 3: Add the car filter to `HistoryView.tsx`.**

(a) Add `cars` to imports/types: change the import to include `Car` — `import type { DriveMeta, Car } from '../history/types';`. Add `cars: Car[];` to the `Props` interface and `cars` to the destructured params: `export default function HistoryView({ drives, cars, onOpen, onDelete, onChanged }: Props) {`.

(b) Add car-filter state next to the existing `selected` tag-filter state:

```tsx
  const [carVins, setCarVins] = useState<string[]>([]);
```

(c) Where the filtered set is computed (currently `const active = selected.filter(...); const shown = filterDrivesByTags(drives, active);`), add a car narrowing AFTER the tag filter:

```tsx
  const carsInUse = cars.filter((c) => drives.some((d) => d.carVin === c.vin));
  const byTag = filterDrivesByTags(drives, active);
  const shown = carVins.length === 0 ? byTag : byTag.filter((d) => d.carVin && carVins.includes(d.carVin));
  const toggleCar = (vin: string) => setCarVins((s) => (s.includes(vin) ? s.filter((x) => x !== vin) : [...s, vin]));
```

(Use `shown` everywhere the tag-filtered set was used — `totals(shown)`, `bucketBy(shown, period)`, the `DriveRow` list — it already is, from feature 10.)

(d) Render a car filter bar right after the tag filter bar (inside the `<div className="dash">`, only when `carsInUse.length > 0`):

```tsx
      {carsInUse.length > 0 && (
        <div className="filter-bar no-print" role="group" aria-label="filter by car">
          <button className="pill" onClick={() => setCarVins([])} disabled={carVins.length === 0}>All cars</button>
          {carsInUse.map((c) => (
            <button key={c.vin} className={`pill${carVins.includes(c.vin) ? ' pill--on' : ''}`}
                    aria-pressed={carVins.includes(c.vin)} onClick={() => toggleCar(c.vin)}>{c.label || c.vin}</button>
          ))}
        </div>
      )}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- HistoryView` → PASS (existing filter tests + the new car test).

- [ ] **Step 5: Full suite + lint + build**

Run: `cd frontend && npm test` → all pass.
Run: `cd frontend && npm run lint && npm run build` → lint 0 problems, build succeeds (App + HistoryView now consistent).

- [ ] **Step 6: Manual smoke**

`cd frontend && npm run dev`: on the landing, "+ add car" a `.brc` → it appears in the Car dropdown and is selected; Analyze a CSV with no `.brc` attached → the report shows that vehicle; re-analyze another drive without re-adding the car → still attributed. In History, a car chip narrows KPIs/Trends/list; combined with a tag chip it ANDs. Remove a car → it leaves the dropdown; its past drives remain.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/HistoryView.tsx frontend/src/components/HistoryView.test.tsx
git commit -m "feat(garage): per-car History filter (AND-combined with tags)"
```

---

## Self-review

**Spec coverage:**
- `cars` store keyPath vin, DB v2, `carVin` on drives, cars CRUD → Task 3. ✓
- Client-side `.brc` parser → Task 2. ✓
- Backend `/analyze` vin/label/engine (engine → CO₂) → Task 1. ✓
- `api.ts` sends vehicle fields → Task 4. ✓
- Uploader car picker (select + add/remove) + Landing props + CSS → Task 5. ✓
- App garage state, smart default, reuse car on analyze, save carVin, touchCar, add/remove → Task 6. ✓
- History per-car filter (AND with tags) → Task 7. ✓
- Smart default (single→that, multiple→last-used, none→No car) → Task 6 Step 3. ✓
- `.brc` precedence / blank-VIN reject / no backfill → Tasks 1 & 6 (brc wins in api/main; blank-VIN rejected in onAddCar). ✓

**Placeholder scan:** none — every step shows the exact code/commands.

**Type/name consistency:** `Car { vin,label,engine,createdAt,lastUsedAt }` (Task 3) is used by `db.ts`, `Uploader`, `App`, `HistoryView`, and the tests with identical fields. `analyzeDrive(file, brc?, pricePerL?, vehicle?)` (Task 4) is called in `App` (Task 6) as `analyzeDrive(files[i], null, pricePerL, vehicle)`. `saveDrive(analysis, filename?, carVin?)` (Task 3) is called in `App` (Task 6) with the `carVin` 3rd arg. `selectedCarVin: string` ('' = No car) is consistent across Uploader/App. The `setBrc` prop is removed from Uploader (Task 5) and App stops passing it (Task 6) — both render paths (Uploader + Landing) updated.

**Task ordering note:** Tasks 5 and 6 leave the app briefly non-building (Uploader props change before App; App passes `cars` to HistoryView before Task 7 adds it). Each task's tests still pass; the full `npm run build` is green again only at the end of Task 7 — this is called out in Tasks 5/6/7 verification steps.
