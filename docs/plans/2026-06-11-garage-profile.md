# Offline Car Profile + Garage Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decode the VIN offline (make/year/country) on add, and add a Garage tab where each car is a profile card with identity + lifetime stats from its drive history.

**Architecture:** A pure offline `wmi.ts` decoder (bundled WMI table, no network); a `carStats.ts` aggregator over the car's stored drives; a `GarageView` tab; small App wiring (auto-decode on add, drop decode-overwrites-name, new tab). Spec: `docs/specs/2026-06-11-garage-profile-design.md`.

**Tech Stack:** React + TS + Vitest (frontend only). npm from `frontend/`.

---

## File map
- **Create** `frontend/src/history/wmi.ts` (+ test) — `decodeVinOffline`.
- **Create** `frontend/src/history/carStats.ts` (+ test) — `carStats`.
- **Modify** `frontend/src/history/types.ts` — `Car.country`.
- **Modify** `frontend/src/components/VehicleCard.tsx` (+ test) — identity subtitle.
- **Create** `frontend/src/components/GarageView.tsx` (+ test).
- **Modify** `frontend/src/index.css` — `.garage` styles.
- **Modify** `frontend/src/App.tsx` — auto-decode on add, drop decode-label, Garage tab.

Order: Tasks 1–4 are additive (app keeps building). Task 5 wires everything in App. No broken-build windows.

---

### Task 1: Offline VIN decoder (`wmi.ts`)

**Files:** Create `frontend/src/history/wmi.ts`, `frontend/src/history/wmi.test.ts`.

- [ ] **Step 1: Write the failing test** `frontend/src/history/wmi.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { decodeVinOffline } from './wmi';

describe('decodeVinOffline', () => {
  it('decodes a French Renault VIN (make + country + year)', () => {
    const r = decodeVinOffline('VF1RJA00769589142');
    expect(r?.make).toBe('Renault');
    expect(r?.country).toContain('France');
    expect(r?.year).toBe('2006'); // 10th char "6" → 2006
  });

  it('decodes a US Tesla WMI', () => {
    expect(decodeVinOffline('5YJXCCE40GF010543')?.make).toBe('Tesla');
  });

  it('returns null for an unknown WMI', () => {
    expect(decodeVinOffline('ZZZ0000000000000A')).toBeNull();
  });

  it('returns null for a too-short string', () => {
    expect(decodeVinOffline('VF1')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- wmi`
Expected: FAIL — `Cannot find module './wmi'`.

- [ ] **Step 3: Implement** `frontend/src/history/wmi.ts`:

```ts
// Offline VIN decoder — make + country from the WMI (first 3 chars) and model year from
// char 10. Pure, no network: the VIN never leaves the device. Tables seeded from the public
// WMI registry / opencars (github.com/opencars, MIT). Unknown WMI → null (never guess a make).

const WMI_MAKES: Record<string, string> = {
  // France
  VF1: 'Renault', VF2: 'Renault', VNV: 'Renault', VF6: 'Renault Trucks',
  VF3: 'Peugeot', VR3: 'Peugeot', VF7: 'Citroën', VR7: 'Citroën', VR1: 'DS',
  UU1: 'Dacia', UU2: 'Dacia',
  // Germany
  WVW: 'Volkswagen', WV1: 'Volkswagen', WV2: 'Volkswagen', WVG: 'Volkswagen', '1VW': 'Volkswagen', '3VW': 'Volkswagen',
  WAU: 'Audi', WA1: 'Audi', WUA: 'Audi', TRU: 'Audi',
  WBA: 'BMW', WBS: 'BMW', WBY: 'BMW', WBX: 'BMW', '5UX': 'BMW', '4US': 'BMW',
  WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WDC: 'Mercedes-Benz', WDF: 'Mercedes-Benz', W1K: 'Mercedes-Benz', W1N: 'Mercedes-Benz',
  WME: 'Smart', WMW: 'Mini', WP0: 'Porsche', WP1: 'Porsche',
  W0L: 'Opel', W0V: 'Opel', WF0: 'Ford', WMA: 'MAN',
  // Italy
  ZFA: 'Fiat', ZFC: 'Fiat', ZFF: 'Ferrari', ZAR: 'Alfa Romeo', ZAM: 'Maserati', ZLA: 'Lancia', ZHW: 'Lamborghini',
  // Spain / Czech / Slovakia
  VSS: 'SEAT', VSE: 'SEAT', TMB: 'Škoda', U5Y: 'Kia', U6Y: 'Kia', TMA: 'Hyundai',
  // UK
  SAL: 'Land Rover', SAJ: 'Jaguar', SAR: 'Rover', SCC: 'Lotus', SCF: 'Aston Martin', SCB: 'Bentley', SCA: 'Rolls-Royce', SBM: 'McLaren',
  SHS: 'Honda', SJN: 'Nissan',
  // Sweden
  YV1: 'Volvo', YV4: 'Volvo', YS3: 'Saab',
  // Japan
  JHM: 'Honda', JHL: 'Honda', JH4: 'Acura', JN1: 'Nissan', JN8: 'Nissan',
  JTD: 'Toyota', JTM: 'Toyota', JTN: 'Toyota', JTH: 'Lexus', JF1: 'Subaru', JF2: 'Subaru',
  JM1: 'Mazda', JM3: 'Mazda', JMZ: 'Mazda', JMB: 'Mitsubishi', JA3: 'Mitsubishi', JS3: 'Suzuki', JYA: 'Yamaha',
  // Korea
  KMH: 'Hyundai', KMF: 'Hyundai', KNA: 'Kia', KND: 'Kia', KNE: 'Kia', KLA: 'Daewoo',
  // USA
  '1FA': 'Ford', '1FT': 'Ford', '1FM': 'Ford', '1FD': 'Ford', '1G1': 'Chevrolet', '1GC': 'Chevrolet',
  '1GT': 'GMC', '1GY': 'Cadillac', '1HG': 'Honda', '19U': 'Acura', '1C4': 'Jeep', '1J4': 'Jeep', '1N4': 'Nissan',
  '5YJ': 'Tesla', '7SA': 'Tesla', '4T1': 'Toyota', '5TD': 'Toyota', '5FN': 'Honda', '2HG': 'Honda', '3FA': 'Ford',
  // China / India
  LFV: 'Volkswagen', LSV: 'Volkswagen', LRW: 'Tesla', LGX: 'BYD', MAT: 'Tata', MA1: 'Mahindra', MAL: 'Hyundai', MBH: 'Maruti Suzuki',
};

const COUNTRY_2: Record<string, string> = {
  VF: '🇫🇷 France', VR: '🇫🇷 France', VS: '🇪🇸 Spain', VV: '🇪🇸 Spain', VN: '🇫🇷 France',
  UU: '🇷🇴 Romania', U5: '🇸🇰 Slovakia', U6: '🇸🇰 Slovakia',
  TM: '🇨🇿 Czechia', TR: '🇭🇺 Hungary', TC: '🇨🇭 Switzerland',
  YV: '🇸🇪 Sweden', YS: '🇸🇪 Sweden', YK: '🇫🇮 Finland',
  ZA: '🇮🇹 Italy', ZB: '🇮🇹 Italy', ZC: '🇮🇹 Italy', ZD: '🇮🇹 Italy', ZF: '🇮🇹 Italy', ZH: '🇮🇹 Italy', ZL: '🇮🇹 Italy', ZM: '🇮🇹 Italy',
  SA: '🇬🇧 UK', SB: '🇬🇧 UK', SC: '🇬🇧 UK', SD: '🇬🇧 UK', SH: '🇬🇧 UK', SJ: '🇬🇧 UK', SK: '🇬🇧 UK', SL: '🇬🇧 UK', SM: '🇬🇧 UK',
};
const COUNTRY_1: Record<string, string> = {
  W: '🇩🇪 Germany', J: '🇯🇵 Japan', K: '🇰🇷 South Korea', L: '🇨🇳 China', M: '🇮🇳 India',
  S: '🇬🇧 UK', T: '🇪🇺 Europe', V: '🇪🇺 Europe', Z: '🇮🇹 Italy', Y: '🇸🇪 Sweden',
  '1': '🇺🇸 USA', '4': '🇺🇸 USA', '5': '🇺🇸 USA', '2': '🇨🇦 Canada', '3': '🇲🇽 Mexico', '6': '🇦🇺 Australia', '9': '🇧🇷 Brazil',
};

// 30 model-year codes in order (skips I,O,Q,U,Z); cycles every 30 years.
const YEAR_CODES = ['A','B','C','D','E','F','G','H','J','K','L','M','N','P','R','S','T','V','W','X','Y','1','2','3','4','5','6','7','8','9'];

function vinYear(code: string): string {
  const i = YEAR_CODES.indexOf(code.toUpperCase());
  if (i < 0) return '';
  const recent = 2010 + i;                       // 2010–2039 window
  const now = new Date().getFullYear() + 1;      // allow next-model-year
  return String(recent <= now ? recent : 1980 + i); // else the 1980–2009 window
}

function vinCountry(vin: string): string {
  return COUNTRY_2[vin.slice(0, 2).toUpperCase()] ?? COUNTRY_1[vin[0].toUpperCase()] ?? '';
}

export interface VinInfo { make: string; year: string; country: string }

export function decodeVinOffline(vin: string): VinInfo | null {
  if (!vin || vin.length < 11) return null;
  const make = WMI_MAKES[vin.slice(0, 3).toUpperCase()];
  if (!make) return null;
  return { make, year: vinYear(vin[9]), country: vinCountry(vin) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- wmi`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

Run: `cd frontend && npx eslint src/history/wmi.ts src/history/wmi.test.ts` → 0 problems.
```bash
git add frontend/src/history/wmi.ts frontend/src/history/wmi.test.ts
git commit -m "feat(garage): offline WMI VIN decoder (make/year/country, no network)"
```

---

### Task 2: Per-car lifetime stats (`carStats.ts`) + `Car.country`

**Files:** Create `frontend/src/history/carStats.ts`, `frontend/src/history/carStats.test.ts`; Modify `frontend/src/history/types.ts`.

- [ ] **Step 1: Write the failing test** `frontend/src/history/carStats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { carStats } from './carStats';
import type { StoredDrive } from './types';
import type { DriveAnalysis } from '../types';

// minimal StoredDrive factory — only the fields carStats reads
function drive(vin: string, o: Partial<{ km: number; fuel: number; cost: number; co2: number; dur: number; eco: number; idle: number; harsh: number; hp: number; top: number; boost: number; rpm: number; date: number }>): StoredDrive {
  const a = {
    summary: { idleSeconds: o.idle ?? 0 },
    scores: { harshEvents: o.harsh ?? 0 },
    bests: { maxHp: o.hp ?? null, topSpeedKmh: o.top ?? null, peakBoostBar: o.boost ?? null, maxRpm: o.rpm ?? null },
  } as unknown as DriveAnalysis;
  return {
    id: Math.random().toString(), savedAt: o.date ?? 1, driveDate: o.date ?? null,
    startedAtClock: null, label: 'x', carVin: vin,
    distanceKm: o.km ?? 0, durationSeconds: o.dur ?? 0, fuelUsedL: o.fuel ?? 0,
    costEur: o.cost ?? 0, co2Kg: o.co2 ?? 0, l100km: 0, eco: o.eco ?? 0,
    analysis: a,
  };
}

describe('carStats', () => {
  it('aggregates a car\'s drives and ignores other cars', () => {
    const drives = [
      drive('V1', { km: 100, fuel: 6, cost: 9, co2: 14, dur: 3600, eco: 80, idle: 360, harsh: 2, hp: 90, top: 150, date: 10 }),
      drive('V1', { km: 50, fuel: 4, cost: 6, co2: 9, dur: 1800, eco: 70, idle: 180, harsh: 1, hp: 110, top: 130, date: 20 }),
      drive('V2', { km: 999, fuel: 99 }),
    ];
    const s = carStats('V1', drives);
    expect(s.drives).toBe(2);
    expect(s.totalKm).toBe(150);
    expect(s.totalFuelL).toBe(10);
    expect(s.totalHarshEvents).toBe(3);
    expect(s.longestDriveKm).toBe(100);
    expect(s.maxHp).toBe(110);
    expect(s.topSpeedKmh).toBe(150);
    expect(s.avgEco).toBe(75);
    expect(s.avgL100).toBeCloseTo(6.667, 2); // 10/150*100
    expect(s.avgIdlePct).toBeCloseTo(10, 1); // 540/5400*100
    expect(s.firstAt).toBe(10);
    expect(s.lastAt).toBe(20);
  });

  it('returns zeros for a car with no drives', () => {
    expect(carStats('VX', []).drives).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- carStats`
Expected: FAIL — `Cannot find module './carStats'`.

- [ ] **Step 3: Add `country` to `Car`** in `frontend/src/history/types.ts` — add `country?: string;` to the `Car` interface (next to `make?`/`year?`).

- [ ] **Step 4: Implement** `frontend/src/history/carStats.ts`:

```ts
import type { StoredDrive } from './types';

export interface CarStats {
  drives: number;
  totalKm: number; totalFuelL: number; totalCostEur: number; totalCo2Kg: number;
  avgL100: number; avgEco: number; avgIdlePct: number;
  totalHarshEvents: number; longestDriveKm: number;
  maxHp: number; topSpeedKmh: number; peakBoostBar: number; maxRpm: number;
  firstAt: number | null; lastAt: number | null;
}

const peak = (a: number, v: number | null | undefined) => Math.max(a, v ?? 0);

export function carStats(vin: string, drives: StoredDrive[]): CarStats {
  const mine = drives.filter((d) => d.carVin === vin);
  const n = mine.length;
  const s: CarStats = {
    drives: n,
    totalKm: 0, totalFuelL: 0, totalCostEur: 0, totalCo2Kg: 0,
    avgL100: 0, avgEco: 0, avgIdlePct: 0,
    totalHarshEvents: 0, longestDriveKm: 0,
    maxHp: 0, topSpeedKmh: 0, peakBoostBar: 0, maxRpm: 0,
    firstAt: null, lastAt: null,
  };
  if (n === 0) return s;

  let ecoSum = 0;
  let durSum = 0;
  let idleSum = 0;
  for (const d of mine) {
    s.totalKm += d.distanceKm;
    s.totalFuelL += d.fuelUsedL;
    s.totalCostEur += d.costEur;
    s.totalCo2Kg += d.co2Kg;
    ecoSum += d.eco;
    durSum += d.durationSeconds;
    idleSum += d.analysis.summary.idleSeconds;
    s.totalHarshEvents += d.analysis.scores.harshEvents;
    s.longestDriveKm = Math.max(s.longestDriveKm, d.distanceKm);
    s.maxHp = peak(s.maxHp, d.analysis.bests.maxHp);
    s.topSpeedKmh = peak(s.topSpeedKmh, d.analysis.bests.topSpeedKmh);
    s.peakBoostBar = peak(s.peakBoostBar, d.analysis.bests.peakBoostBar);
    s.maxRpm = peak(s.maxRpm, d.analysis.bests.maxRpm);
    const at = d.driveDate ?? d.savedAt;
    s.firstAt = s.firstAt === null ? at : Math.min(s.firstAt, at);
    s.lastAt = s.lastAt === null ? at : Math.max(s.lastAt, at);
  }
  s.avgEco = Math.round(ecoSum / n);
  s.avgL100 = s.totalKm ? (s.totalFuelL / s.totalKm) * 100 : 0;
  s.avgIdlePct = durSum ? (idleSum / durSum) * 100 : 0;
  return s;
}
```

- [ ] **Step 5: Run to verify they pass + lint**

Run: `cd frontend && npm test -- carStats` → PASS (2 tests).
Run: `cd frontend && npx eslint src/history/carStats.ts src/history/carStats.test.ts src/history/types.ts` → 0 problems.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/history/carStats.ts frontend/src/history/carStats.test.ts frontend/src/history/types.ts
git commit -m "feat(garage): per-car lifetime stats aggregator + Car.country"
```

---

### Task 3: VehicleCard identity subtitle

**Files:** Modify `frontend/src/components/VehicleCard.tsx`, `frontend/src/components/VehicleCard.test.tsx`.

The report card should show the car's **name** as the title and a decoded **identity subtitle** when present. `decoded` is the matched `Car` (App already passes it), so it carries `label/make/year/country/engine?/fuelType`. (The `Car` has no `engine` in the decoded sense — engine comes from `drive.vehicle.engine`; include it in the subtitle.)

- [ ] **Step 1: Add the failing test** to `frontend/src/components/VehicleCard.test.tsx` (replace the existing decoded test from the prior feature, since the display changed — title is now the name, identity is a subtitle):

```tsx
  it('shows the name as title and a decoded identity subtitle', () => {
    const d: DriveAnalysis['drive'] = {
      source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
      vehicle: { label: 'Moja Klio', vin: 'VF1RJA00769589142', engine: '2.0 dCi' },
    };
    render(<VehicleCard drive={d} dataQuality={dataQuality}
      decoded={{ make: 'Renault', year: '2022', country: '🇫🇷 France', fuelType: 'Diesel' }} />);
    expect(screen.getByText('Moja Klio')).toBeInTheDocument();
    expect(screen.getByText(/2022 Renault/)).toBeInTheDocument();
    expect(screen.getByText(/France/)).toBeInTheDocument();
    expect(screen.getByText(/Diesel/)).toBeInTheDocument();
  });
```

(The existing "shows the vehicle label" and "shows VIN and engine" tests stay and must still pass.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- VehicleCard`
Expected: FAIL — `country` not on the `decoded` prop type / no subtitle element.

- [ ] **Step 3: Replace `frontend/src/components/VehicleCard.tsx`:**

```tsx
import type { DriveAnalysis } from '../types';
import { carEmoji, decodedName } from '../history/car';

interface Props {
  drive: DriveAnalysis['drive'];
  dataQuality: DriveAnalysis['dataQuality'];
  decoded?: { label?: string; make?: string; model?: string; year?: string; country?: string; bodyClass?: string; fuelType?: string };
}

export default function VehicleCard({ drive, dataQuality, decoded }: Props) {
  const title = `${decoded?.make ? `${carEmoji(decoded.bodyClass)} ` : ''}${drive.vehicle.label ?? 'Vehicle'}`;
  const identity = decoded?.make
    ? [decodedName(decoded), decoded.country, drive.vehicle.engine, decoded.fuelType].filter(Boolean).join(' · ')
    : drive.vehicle.engine || '';
  return (
    <section className="card vehicle">
      <div className="vehicle__name">{title}</div>
      {identity && <div className="vehicle__ident">{identity}</div>}
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
Expected: PASS (the 2 original tests + the new identity test). The "shows VIN and engine" test still finds the engine (now in the identity/subtitle line for non-decoded it's the fallback; for that test there's no `decoded`, so identity = engine).

- [ ] **Step 5: Add a `.vehicle__ident` style** to the END of `frontend/src/index.css`:

```css
.vehicle__ident { color: var(--muted); font-size: 13px; margin-top: 2px; }
```

- [ ] **Step 6: Lint + commit**

Run: `cd frontend && npx eslint src/components/VehicleCard.tsx src/components/VehicleCard.test.tsx` → 0 problems.
```bash
git add frontend/src/components/VehicleCard.tsx frontend/src/components/VehicleCard.test.tsx frontend/src/index.css
git commit -m "feat(garage): VehicleCard shows the name + a decoded identity subtitle"
```

---

### Task 4: GarageView component

**Files:** Create `frontend/src/components/GarageView.tsx`, `frontend/src/components/GarageView.test.tsx`; Modify `frontend/src/index.css`.

- [ ] **Step 1: Write the failing test** `frontend/src/components/GarageView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GarageView from './GarageView';
import type { Car, StoredDrive } from '../history/types';
import type { DriveAnalysis } from '../types';

const a = { summary: { idleSeconds: 0 }, scores: { harshEvents: 0 }, bests: {} } as unknown as DriveAnalysis;
const sd = (vin: string, km: number): StoredDrive => ({
  id: km + '', savedAt: 1, driveDate: 1, startedAtClock: null, label: 'x', carVin: vin,
  distanceKm: km, durationSeconds: 600, fuelUsedL: 1, costEur: 1, co2Kg: 1, l100km: 1, eco: 70, analysis: a,
});
const car: Car = { vin: 'V1', label: 'Moja Klio', engine: '2.0 dCi', createdAt: 1, lastUsedAt: 1, make: 'Renault', year: '2022', country: '🇫🇷 France' };
const props = { onRenameCar: vi.fn(), onRemoveCar: vi.fn(), onDecodeCar: vi.fn(), decodingVin: '' };

describe('GarageView', () => {
  it('renders a car profile with identity and stats', () => {
    render(<GarageView cars={[car]} drives={[sd('V1', 30), sd('V1', 12)]} {...props} />);
    expect(screen.getByText('Moja Klio')).toBeInTheDocument();
    expect(screen.getByText(/2022 Renault/)).toBeInTheDocument();
    expect(screen.getByText(/France/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();        // drives count
    expect(screen.getByText(/42/)).toBeInTheDocument();        // total km 30+12
  });

  it('shows an empty state when there are no cars', () => {
    render(<GarageView cars={[]} drives={[]} {...props} />);
    expect(screen.getByText(/add a car/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- GarageView`
Expected: FAIL — `Cannot find module './GarageView'`.

- [ ] **Step 3: Implement** `frontend/src/components/GarageView.tsx`:

```tsx
import type { Car, StoredDrive } from '../history/types';
import { carEmoji, decodedName } from '../history/car';
import { carStats } from '../history/carStats';

interface Props {
  cars: Car[];
  drives: StoredDrive[];
  onRenameCar: (vin: string) => void;
  onRemoveCar: (vin: string) => void;
  onDecodeCar: (vin: string) => void;
  decodingVin: string;
}

const km = (n: number) => `${Math.round(n).toLocaleString()} km`;
const when = (t: number | null) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—');

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className="kpi__value">{value}</div>
    </div>
  );
}

export default function GarageView({ cars, drives, onRenameCar, onRemoveCar, onDecodeCar, decodingVin }: Props) {
  if (cars.length === 0) {
    return <div className="dash"><section className="card">No cars yet — add a car from its <code>.brc</code> on the Analyze tab.</section></div>;
  }
  return (
    <div className="dash">
      {cars.map((c) => {
        const s = carStats(c.vin, drives);
        const identity = [decodedName(c), c.country, c.engine, c.fuelType].filter(Boolean).join(' · ');
        const tiles: Array<[string, string]> = [
          ['Drives', String(s.drives)],
          ['Total distance', km(s.totalKm)],
          ['Total fuel', `${s.totalFuelL.toFixed(1)} L`],
          ['Total cost', `€${s.totalCostEur.toFixed(0)}`],
          ['Total CO₂', `${s.totalCo2Kg.toFixed(0)} kg`],
          ['Avg consumption', `${s.avgL100.toFixed(1)} L/100`],
          ['Avg eco', String(s.avgEco)],
          ['Avg idle', `${s.avgIdlePct.toFixed(0)}%`],
          ['Harsh events', String(s.totalHarshEvents)],
          ['Longest drive', km(s.longestDriveKm)],
          ['Peak power', s.maxHp ? `${s.maxHp.toFixed(0)} hp` : ''],
          ['Top speed', s.topSpeedKmh ? `${s.topSpeedKmh.toFixed(0)} km/h` : ''],
          ['Peak boost', s.peakBoostBar ? `${s.peakBoostBar.toFixed(2)} bar` : ''],
          ['Max RPM', s.maxRpm ? String(Math.round(s.maxRpm)) : ''],
        ];
        return (
          <section className="card garage-car" key={c.vin}>
            <div className="garage-car__head">
              <div>
                <div className="vehicle__name">{c.make ? `${carEmoji(c.bodyClass)} ` : ''}{c.label || c.vin}</div>
                {identity && <div className="vehicle__ident">{identity}</div>}
                {!c.make && <div className="vehicle__ident">VIN not recognised offline — rename to set a name.</div>}
              </div>
              <div className="garage-car__actions no-print">
                <button className="pill" onClick={() => onRenameCar(c.vin)}>Rename</button>
                {!c.model && (
                  <button className="pill" disabled={decodingVin === c.vin} onClick={() => onDecodeCar(c.vin)}>
                    {decodingVin === c.vin ? 'Decoding…' : '🔎 Decode'}
                  </button>
                )}
                <button className="pill" onClick={() => onRemoveCar(c.vin)}>Remove</button>
              </div>
            </div>
            {s.drives > 0 ? (
              <>
                <div className="kpi-grid">{tiles.filter(([, v]) => v !== '').map(([l, v]) => <Tile key={l} label={l} value={v} />)}</div>
                <div className="vehicle__meta">Driving since {when(s.firstAt)} · last driven {when(s.lastAt)}</div>
              </>
            ) : (
              <div className="vehicle__meta">No drives logged for this car yet.</div>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- GarageView`
Expected: PASS (2 tests). (The `42` total-km tile renders "42 km".)

- [ ] **Step 5: Add styles** to the END of `frontend/src/index.css`:

```css
.garage-car__head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; flex-wrap: wrap; }
.garage-car__actions { display: flex; gap: 8px; flex-wrap: wrap; }
```

- [ ] **Step 6: Lint + commit**

Run: `cd frontend && npx eslint src/components/GarageView.tsx src/components/GarageView.test.tsx` → 0 problems.
```bash
git add frontend/src/components/GarageView.tsx frontend/src/components/GarageView.test.tsx frontend/src/index.css
git commit -m "feat(garage): GarageView — per-car profile cards with lifetime stats"
```

---

### Task 5: Wire it into App (auto-decode + tab) + full build

**Files:** Modify `frontend/src/App.tsx`.

Read `App.tsx` first. Relevant: `import { decodeVin } from './history/vpic';`; `type Tab = 'analyze' | 'history';`; `onAddCar` (parses `.brc` → `saveCar`); `onDecodeCar` (currently sets `label: decodedName(d) || carRec.label`); the `<nav className="tabs">` with two `pill` buttons; the `{tab === 'history' ? ... }` render.

- [ ] **Step 1: Imports.** Add:
```tsx
import GarageView from './components/GarageView';
import { decodeVinOffline } from './history/wmi';
```

- [ ] **Step 2: Tab type.** Change `type Tab = 'analyze' | 'history';` to `type Tab = 'analyze' | 'history' | 'garage';`.

- [ ] **Step 3: Auto-decode on add (offline).** In `onAddCar`, replace:
```tsx
    const now = Date.now();
    await saveCar({ ...parsed, createdAt: now, lastUsedAt: now }).catch(() => {});
```
with:
```tsx
    const now = Date.now();
    const wmi = decodeVinOffline(parsed.vin);
    await saveCar({ ...parsed, ...(wmi ?? {}), createdAt: now, lastUsedAt: now }).catch(() => {});
```
(`decodeVinOffline` returns `{make, year, country}` or null — spread when present.)

- [ ] **Step 4: Stop decode from overwriting the name.** In `onDecodeCar`, change:
```tsx
        await saveCar({ ...carRec, ...d, label: decodedName(d) || carRec.label, decodedAt: Date.now() }).catch(() => {});
```
to:
```tsx
        await saveCar({ ...carRec, ...d, decodedAt: Date.now() }).catch(() => {});
```
If `decodedName` is now unused in `App.tsx`, remove its import (`import { decodedName } from './history/car';`) to keep lint clean.

- [ ] **Step 5: Add the Garage nav button.** In the `<nav className="tabs">`, after the History button, add:
```tsx
            <button className="pill" onClick={() => setTab('garage')} disabled={tab === 'garage'}>Garage</button>
```

- [ ] **Step 6: Render the Garage view.** Find the history render `{tab === 'history' ? ( <HistoryView ... /> ) : ( ... )}`. Add a garage branch — change it to render GarageView when `tab === 'garage'`. The cleanest: right where `HistoryView` is conditionally rendered, add alongside it:
```tsx
        {tab === 'garage' && (
          <GarageView cars={cars} drives={history} onRenameCar={onRenameCar}
                      onRemoveCar={onRemoveCar} onDecodeCar={onDecodeCar} decodingVin={decodingVin} />
        )}
```
Place this adjacent to the existing `HistoryView` block so it shows on the Garage tab. (If the existing structure is a ternary `tab === 'history' ? <HistoryView/> : <analyze stuff/>`, restructure minimally so: analyze view shows when `tab === 'analyze'`, history when `'history'`, garage when `'garage'`. Keep the analyze/history behaviour identical.)

- [ ] **Step 7: Full suite + lint + build.**

Run: `cd frontend && npm test` → all pass.
Run: `cd frontend && npm run lint && npm run build` → lint 0 problems, build succeeds.

- [ ] **Step 8: Manual smoke**

`cd frontend && npm run dev`: add a `.brc` with a real VIN → the car auto-shows make/year/country in the picker option and on the new **Garage** tab; analyze a drive → the Garage card fills the stats grid; the report's vehicle card shows the identity subtitle. Rename/remove/Decode work from the Garage card.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(garage): auto-decode VIN offline on add + Garage tab"
```

---

## Self-review

**Spec coverage:**
- Offline `wmi.ts` (make/country/year, unknown→null) → Task 1. ✓
- `Car.country` + auto-decode on add → Tasks 2 & 5. ✓
- Identity cleanup (decode fills metadata, label = name; VehicleCard subtitle) → Tasks 3 & 5 (drop decode-label). ✓
- `carStats` (totals, avgs, idle %, harsh events, longest drive, peaks, timeline) → Task 2. ✓
- `GarageView` tab (profile card, stats grid, actions, empty state) → Task 4. ✓
- App tab wiring → Task 5. ✓
- Privacy: no network in wmi.ts (pure tables) → Task 1. ✓

**Placeholder scan:** none — full tables + code in every step.

**Type/name consistency:** `decodeVinOffline → {make,year,country}` (Task 1) is spread onto `Car` (Task 2 adds `country?`) in `onAddCar` (Task 5). `carStats(vin, drives): CarStats` (Task 2) is consumed by `GarageView` (Task 4). `decodedName`/`carEmoji` (existing `car.ts`) used by VehicleCard (Task 3) + GarageView (Task 4). `onRenameCar`/`onRemoveCar`/`onDecodeCar`/`decodingVin` already exist on App (prior feature) and are passed to GarageView (Task 5). `StoredDrive` carries `analysis.{summary.idleSeconds, scores.harshEvents, bests.*}` (verified against `models.py`).
