# Drive-to-drive Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user compare two saved drives inside the History tab — a metric-delta table plus speed- and RPM-**distribution** histograms (A vs B), all client-side off the already-stored `DriveAnalysis`.

**Architecture:** Two pure, unit-tested helpers in `frontend/src/history/` (`distribution.ts`, `compareMetrics.ts`) feed one new presentational component `frontend/src/components/DriveCompare.tsx`, which `HistoryView` renders between Trends and Drives. No server changes; no `App.tsx` wiring changes (the component imports `getDrive` itself). Design spec: `docs/specs/2026-06-08-drive-compare-design.md`.

**Tech Stack:** React + TypeScript, Recharts, Vitest + @testing-library/react. Run all commands from `frontend/`.

---

## File structure

- **Create** `frontend/src/history/distribution.ts` — pure banding of a signal's points into normalised %.
- **Create** `frontend/src/history/distribution.test.ts` — unit tests for the above.
- **Create** `frontend/src/history/compareMetrics.ts` — pure A-vs-B metric rows + delta colour.
- **Create** `frontend/src/history/compareMetrics.test.ts` — unit tests for the above.
- **Create** `frontend/src/components/DriveCompare.tsx` — the Compare section (dropdowns, load, table, charts).
- **Create** `frontend/src/components/DriveCompare.test.tsx` — component test (mock `getDrive` + `recharts`).
- **Modify** `frontend/src/components/HistoryView.tsx` — render `<DriveCompare drives={drives} />`.
- **Modify** `frontend/src/index.css` — minimal `.compare-table` styling.

Conventions to mirror (already in the repo): pure helpers tested like `history/aggregate.test.ts`; chart components use `<div role="img" aria-label={summary}>` + a visually-hidden `ChartTable` fallback, and mock `recharts` in tests like `components/SpeedChart.test.tsx`.

---

### Task 1: `distribution.ts` — band a signal into normalised %

**Files:**
- Create: `frontend/src/history/distribution.ts`
- Test: `frontend/src/history/distribution.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/history/distribution.test.ts
import { describe, it, expect } from 'vitest';
import { distribute, bandLabels, signalPoints, SPEED_EDGES } from './distribution';
import type { DriveAnalysis } from '../types';

describe('distribution', () => {
  it('labels bands as <first, interior ranges, last+', () => {
    expect(bandLabels([1000, 2000])).toEqual(['<1000', '1000–2000', '2000+']);
  });

  it('bands by count and normalises to % (value on an edge goes to the upper band)', () => {
    // edges [10,30]: bands <10, 10–30, 30+
    const pts = [{ t: 0, v: 5 }, { t: 1, v: 10 }, { t: 2, v: 20 }, { t: 3, v: 30 }];
    // 5 -> <10 ; 10 -> 10–30 ; 20 -> 10–30 ; 30 -> 30+
    expect(distribute(pts, [10, 30])).toEqual([
      { band: '<10', pct: 25 },
      { band: '10–30', pct: 50 },
      { band: '30+', pct: 25 },
    ]);
  });

  it('returns [] for an empty or missing signal', () => {
    expect(distribute(undefined, [10, 30])).toEqual([]);
    expect(distribute([], [10, 30])).toEqual([]);
  });

  it('signalPoints returns the first present non-empty signal, else undefined', () => {
    const a = { signals: { 'Speed (GPS)': { points: [{ t: 0, v: 1 }] } } } as unknown as DriveAnalysis;
    expect(signalPoints(a, ['Vehicle speed', 'Speed (GPS)'])).toEqual([{ t: 0, v: 1 }]);
    expect(signalPoints(a, ['Engine RPM'])).toBeUndefined();
  });

  it('exports the agreed speed edges', () => {
    expect(SPEED_EDGES).toEqual([10, 30, 50, 70, 90, 110, 130]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- distribution`
Expected: FAIL — `Cannot find module './distribution'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/history/distribution.ts
import type { DriveAnalysis, SeriesPoint } from '../types';

// Interior edges; bands are <edges[0], [edges[i], edges[i+1]), edges[last]+.
export const SPEED_EDGES = [10, 30, 50, 70, 90, 110, 130]; // km/h
export const RPM_EDGES = [1000, 1500, 2000, 2500, 3000, 3500, 4000];

// Signal-name preference lists (mirror the server's speed_source fallback).
export const SPEED_SIGNALS = ['Vehicle speed', 'Speed (GPS)'];
export const RPM_SIGNALS = ['Engine RPM'];

export interface Band {
  band: string;
  pct: number;
}

export function bandLabels(edges: number[]): string[] {
  const labels = [`<${edges[0]}`];
  for (let i = 0; i < edges.length - 1; i++) labels.push(`${edges[i]}–${edges[i + 1]}`);
  labels.push(`${edges[edges.length - 1]}+`);
  return labels;
}

export function distribute(points: SeriesPoint[] | undefined, edges: number[]): Band[] {
  if (!points || points.length === 0) return [];
  const counts = new Array(edges.length + 1).fill(0);
  for (const p of points) {
    let i = 0;
    while (i < edges.length && p.v >= edges[i]) i++; // value on an edge -> upper band
    counts[i] += 1;
  }
  const total = points.length;
  return bandLabels(edges).map((band, i) => ({
    band,
    pct: Math.round((counts[i] / total) * 1000) / 10,
  }));
}

// First present, non-empty signal's points (by name preference), else undefined.
export function signalPoints(analysis: DriveAnalysis, names: string[]): SeriesPoint[] | undefined {
  for (const n of names) {
    const pts = analysis.signals[n]?.points;
    if (pts && pts.length) return pts;
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- distribution`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/history/distribution.ts frontend/src/history/distribution.test.ts
git commit -m "feat(compare): pure signal-distribution banding helper"
```

---

### Task 2: `compareMetrics.ts` — A-vs-B metric rows + delta colour

**Files:**
- Create: `frontend/src/history/compareMetrics.ts`
- Test: `frontend/src/history/compareMetrics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/src/history/compareMetrics.test.ts
import { describe, it, expect } from 'vitest';
import { buildCompareRows, deltaColor } from './compareMetrics';
import type { DriveAnalysis } from '../types';

const mk = (over: { l100?: number; eur?: number; co2?: number; eco?: number; idle?: number; dist?: number; avg?: number }) =>
  ({
    summary: { avgConsumptionL100km: over.l100 ?? 6, co2PerKmG: over.co2 ?? 150, distanceKm: over.dist ?? 30, avgSpeedKmh: over.avg ?? 50 },
    economy: { costPerKm: over.eur ?? 0.2 },
    scores: { eco: over.eco ?? 60, idlePct: over.idle ?? 5 },
  } as unknown as DriveAnalysis);

describe('compareMetrics', () => {
  it('builds rows with B−A deltas in the documented order', () => {
    const rows = buildCompareRows(mk({ l100: 6 }), mk({ l100: 5.4 }));
    expect(rows.map((r) => r.label)).toEqual([
      'L/100km', 'Cost €/km', 'CO₂ g/km', 'Eco score', 'Idle %', 'Distance km', 'Avg speed km/h',
    ]);
    const l100 = rows[0];
    expect(l100.a).toBe(6);
    expect(l100.b).toBe(5.4);
    expect(l100.delta).toBeCloseTo(-0.6, 5);
    expect(l100.better).toBe('down');
  });

  it('treats a 0 ratio metric as missing (—), but 0 idle/eco as valid', () => {
    const rows = buildCompareRows(mk({ co2: 0, idle: 0 }), mk({ co2: 140, idle: 0 }));
    const co2 = rows.find((r) => r.label === 'CO₂ g/km')!;
    expect(co2.a).toBeNull();        // 0 g/km -> missing
    expect(co2.delta).toBeNull();    // can't delta against a missing value
    const idle = rows.find((r) => r.label === 'Idle %')!;
    expect(idle.a).toBe(0);          // 0% idle is a real, good value
    expect(idle.delta).toBe(0);
  });

  it('deltaColor: green when improved, red when worse, muted when neutral/missing', () => {
    expect(deltaColor(-0.6, 'down')).toBe('#1a9850');  // lower is better -> improved
    expect(deltaColor(0.6, 'down')).toBe('#d73027');   // higher is worse
    expect(deltaColor(9, 'up')).toBe('#1a9850');       // higher is better
    expect(deltaColor(5, 'neutral')).toBe('#9aa0a6');
    expect(deltaColor(null, 'down')).toBe('#9aa0a6');
    expect(deltaColor(0, 'down')).toBe('#9aa0a6');     // no change -> muted
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- compareMetrics`
Expected: FAIL — `Cannot find module './compareMetrics'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/src/history/compareMetrics.ts
import type { DriveAnalysis } from '../types';

export type Better = 'up' | 'down' | 'neutral';

export interface CompareRow {
  label: string;
  a: number | null;
  b: number | null;
  delta: number | null;
  better: Better;
  fmt: (n: number) => string;
}

const GOOD = '#1a9850';
const BAD = '#d73027';
const MUTED = '#9aa0a6';

const round = (n: number) => Math.round(n * 100) / 100;
const f0 = (n: number) => Math.round(n).toString();
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);

// Derived ratio metrics report 0 when undefined (e.g. sub-1km drive); treat 0 as missing.
const ratio = (n: number | undefined | null): number | null => (n && n > 0 ? n : null);
const val = (n: number | undefined | null): number | null => (n == null || Number.isNaN(n) ? null : n);

function row(label: string, a: number | null, b: number | null, better: Better, fmt: (n: number) => string): CompareRow {
  const delta = a != null && b != null ? round(b - a) : null;
  return { label, a, b, delta, better, fmt };
}

export function buildCompareRows(a: DriveAnalysis, b: DriveAnalysis): CompareRow[] {
  return [
    row('L/100km', ratio(a.summary.avgConsumptionL100km), ratio(b.summary.avgConsumptionL100km), 'down', f1),
    row('Cost €/km', ratio(a.economy.costPerKm), ratio(b.economy.costPerKm), 'down', f2),
    row('CO₂ g/km', ratio(a.summary.co2PerKmG), ratio(b.summary.co2PerKmG), 'down', f0),
    row('Eco score', val(a.scores.eco), val(b.scores.eco), 'up', f0),
    row('Idle %', val(a.scores.idlePct), val(b.scores.idlePct), 'down', f1),
    row('Distance km', val(a.summary.distanceKm), val(b.summary.distanceKm), 'neutral', f1),
    row('Avg speed km/h', val(a.summary.avgSpeedKmh), val(b.summary.avgSpeedKmh), 'neutral', f0),
  ];
}

export function deltaColor(delta: number | null, better: Better): string {
  if (delta == null || delta === 0 || better === 'neutral') return MUTED;
  const improved = better === 'down' ? delta < 0 : delta > 0;
  return improved ? GOOD : BAD;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- compareMetrics`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/history/compareMetrics.ts frontend/src/history/compareMetrics.test.ts
git commit -m "feat(compare): pure A-vs-B metric rows + delta colour"
```

---

### Task 3: `DriveCompare.tsx` — the Compare section

**Files:**
- Create: `frontend/src/components/DriveCompare.tsx`
- Test: `frontend/src/components/DriveCompare.test.tsx`
- Modify: `frontend/src/index.css` (append `.compare-table` rules)

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/components/DriveCompare.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DriveMeta, StoredDrive } from '../history/types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="barchart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null, YAxis: () => null, Tooltip: () => null, Legend: () => null, CartesianGrid: () => null,
}));

const getDrive = vi.fn();
vi.mock('../history/db', () => ({ getDrive: (id: string) => getDrive(id) }));

import DriveCompare from './DriveCompare';

const meta = (id: string): DriveMeta => ({
  id, savedAt: 1, startedAtClock: null, label: 'My car', distanceKm: 30,
  durationSeconds: 600, fuelUsedL: 2, costEur: 6, co2Kg: 5, l100km: 6, eco: 60,
});
const stored = (id: string, over: Partial<StoredDrive['analysis']['summary']>, eco = 60): StoredDrive => ({
  ...meta(id),
  analysis: {
    summary: { avgConsumptionL100km: 6, co2PerKmG: 150, distanceKm: 30, avgSpeedKmh: 50, ...over },
    economy: { costPerKm: 0.2 },
    scores: { eco, idlePct: 5 },
    signals: { 'Vehicle speed': { points: [{ t: 0, v: 20 }, { t: 1, v: 60 }] }, 'Engine RPM': { points: [{ t: 0, v: 1400 }, { t: 1, v: 2200 }] } },
  } as unknown as StoredDrive['analysis'],
});

describe('DriveCompare', () => {
  beforeEach(() => getDrive.mockReset());

  it('prompts to save more when fewer than two drives exist', () => {
    render(<DriveCompare drives={[meta('a')]} />);
    expect(screen.getByText(/at least two drives/i)).toBeInTheDocument();
  });

  it('loads A and B and shows the delta table + two distribution charts', async () => {
    getDrive.mockImplementation((id: string) =>
      Promise.resolve(id === 'a' ? stored('a', { avgConsumptionL100km: 6 }, 60) : stored('b', { avgConsumptionL100km: 5.4 }, 67)));
    render(<DriveCompare drives={[meta('a'), meta('b')]} />);
    expect(await screen.findByText('L/100km')).toBeInTheDocument();   // delta table rendered
    expect(screen.getAllByTestId('barchart')).toHaveLength(2);         // speed + rpm distributions
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2); // a11y-labelled charts
  });

  it('asks for two different drives when A === B', async () => {
    getDrive.mockResolvedValue(stored('a', {}, 60));
    render(<DriveCompare drives={[meta('a'), meta('a')]} />);
    expect(await screen.findByText(/two different drives/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- DriveCompare`
Expected: FAIL — `Cannot find module './DriveCompare'`.

- [ ] **Step 3: Write the implementation**

```tsx
// frontend/src/components/DriveCompare.tsx
import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DriveAnalysis, SeriesPoint } from '../types';
import type { DriveMeta, StoredDrive } from '../history/types';
import { getDrive } from '../history/db';
import {
  distribute, signalPoints, RPM_EDGES, RPM_SIGNALS, SPEED_EDGES, SPEED_SIGNALS,
} from '../history/distribution';
import { buildCompareRows, deltaColor } from '../history/compareMetrics';
import ChartTable from './ChartTable';

const A_COLOR = '#0072B2'; // Okabe–Ito blue (colourblind-safe)
const B_COLOR = '#E69F00'; // Okabe–Ito orange

interface Props {
  drives: DriveMeta[];
}

const optLabel = (m: DriveMeta) =>
  `${new Date(m.driveDate ?? m.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })} · ${m.label}`;

export default function DriveCompare({ drives }: Props) {
  const [aId, setAId] = useState(drives[0]?.id ?? '');
  const [bId, setBId] = useState(drives[1]?.id ?? '');
  const [a, setA] = useState<StoredDrive | undefined>(undefined);
  const [b, setB] = useState<StoredDrive | undefined>(undefined);

  useEffect(() => { let on = true; getDrive(aId).then((d) => on && setA(d)); return () => { on = false; }; }, [aId]);
  useEffect(() => { let on = true; getDrive(bId).then((d) => on && setB(d)); return () => { on = false; }; }, [bId]);

  if (drives.length < 2) {
    return (
      <section className="card">
        <h3 className="section-title">Compare two drives</h3>
        <p className="placeholder">Save at least two drives to compare them.</p>
      </section>
    );
  }

  const sameDrive = aId === bId;
  const ready = !!a && !!b && !sameDrive;

  return (
    <section className="card">
      <h3 className="section-title">Compare two drives</h3>
      <div className="history-controls">
        <label>A&nbsp;
          <select aria-label="drive A" value={aId} onChange={(e) => setAId(e.target.value)}>
            {drives.map((d) => <option key={d.id} value={d.id}>{optLabel(d)}</option>)}
          </select>
        </label>
        <label>B&nbsp;
          <select aria-label="drive B" value={bId} onChange={(e) => setBId(e.target.value)}>
            {drives.map((d) => <option key={d.id} value={d.id}>{optLabel(d)}</option>)}
          </select>
        </label>
      </div>

      {sameDrive && <p className="placeholder">Pick two different drives to compare.</p>}

      {ready && (
        <>
          <CompareTable a={a!.analysis} b={b!.analysis} />
          <Dist title="Speed distribution" unit="km/h" edges={SPEED_EDGES}
                aPts={signalPoints(a!.analysis, SPEED_SIGNALS)} bPts={signalPoints(b!.analysis, SPEED_SIGNALS)} />
          <Dist title="RPM distribution" unit="rpm" edges={RPM_EDGES}
                aPts={signalPoints(a!.analysis, RPM_SIGNALS)} bPts={signalPoints(b!.analysis, RPM_SIGNALS)} />
          <p className="placeholder" style={{ marginTop: 4 }}>
            Distributions are by sample count (≈ time, since logging is ~1&nbsp;Hz), each shown as % of that drive’s own samples.
          </p>
        </>
      )}
    </section>
  );
}

function CompareTable({ a, b }: { a: DriveAnalysis; b: DriveAnalysis }) {
  const rows = buildCompareRows(a, b);
  const cell = (v: number | null, fmt: (n: number) => string) => (v == null ? '—' : fmt(v));
  return (
    <table className="compare-table">
      <thead>
        <tr><th scope="col">Metric</th><th scope="col">A</th><th scope="col">B</th><th scope="col">Δ (B−A)</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{cell(r.a, r.fmt)}</td>
            <td>{cell(r.b, r.fmt)}</td>
            <td style={{ color: deltaColor(r.delta, r.better), fontVariantNumeric: 'tabular-nums' }}>
              {r.delta == null ? '—' : `${r.delta > 0 ? '▲ +' : r.delta < 0 ? '▼ −' : ''}${r.fmt(Math.abs(r.delta))}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dist({ title, unit, edges, aPts, bPts }: {
  title: string; unit: string; edges: number[];
  aPts: SeriesPoint[] | undefined; bPts: SeriesPoint[] | undefined;
}) {
  const da = distribute(aPts, edges);
  const db = distribute(bPts, edges);
  if (da.length === 0 && db.length === 0) {
    return <p className="placeholder">{title}: not logged for one or both drives.</p>;
  }
  const labels = (da.length ? da : db).map((x) => x.band);
  const data = labels.map((band, i) => ({ band, A: da[i]?.pct ?? 0, B: db[i]?.pct ?? 0 }));
  const summary = `${title} as % of each drive’s samples (${unit}): ${labels.length} bands, A (blue) vs B (orange)`;
  return (
    <section>
      <h4>{title} <small>(% of each drive’s time · {unit})</small></h4>
      <div style={{ width: '100%', height: 220 }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="band" minTickGap={2} />
            <YAxis width={42} unit="%" />
            <Tooltip formatter={(v, n) => [`${v}%`, n === 'A' ? 'Drive A' : 'Drive B']} />
            <Legend />
            <Bar dataKey="A" fill={A_COLOR} isAnimationActive={false} />
            <Bar dataKey="B" fill={B_COLOR} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption={summary} columns={[`${unit} band`, 'A %', 'B %']}
                  rows={data.map((d) => [d.band, d.A, d.B])} />
    </section>
  );
}
```

- [ ] **Step 4: Append minimal styling to `frontend/src/index.css`**

Add at the end of the file:

```css
.compare-table { width: 100%; border-collapse: collapse; margin: 8px 0 4px; }
.compare-table th, .compare-table td { padding: 4px 8px; text-align: right; }
.compare-table th:first-child, .compare-table td:first-child { text-align: left; }
.compare-table thead th { color: var(--muted, #9aa0a6); font-weight: 600; }
.compare-table tbody tr + tr td { border-top: 1px solid rgba(255, 255, 255, 0.06); }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- DriveCompare`
Expected: PASS (3 tests). If the "two charts" assertion fails, confirm both `Dist` blocks render (both drives have `Vehicle speed`/`Engine RPM` signals in the fixture).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DriveCompare.tsx frontend/src/components/DriveCompare.test.tsx frontend/src/index.css
git commit -m "feat(compare): DriveCompare section — delta table + speed/RPM distribution charts"
```

---

### Task 4: Render Compare inside History + verify the whole build

**Files:**
- Modify: `frontend/src/components/HistoryView.tsx`

- [ ] **Step 1: Add the import**

At the top of `HistoryView.tsx`, beside the other component imports (after `import ChartTable from './ChartTable';`):

```tsx
import DriveCompare from './DriveCompare';
```

- [ ] **Step 2: Render it between Trends and Drives**

In `HistoryView.tsx`, immediately **after** the closing `</section>` of the Trends card (the one containing `<ChartTable .../>`) and **before** the `<section className="card">` whose title is `Drives`, insert:

```tsx
      <DriveCompare drives={drives} />
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: PASS — all existing tests plus the new `distribution`, `compareMetrics`, and `DriveCompare` suites.

- [ ] **Step 4: Typecheck + lint + production build**

Run: `npm run lint && npm run build`
Expected: lint clean; `tsc -b` no type errors; `vite build` succeeds.

- [ ] **Step 5: Manual smoke check**

Run: `npm run dev`, open the app, go to **History**, ensure ≥2 drives are saved (upload a couple of `data/exported_records/*.csv` if needed). Confirm: the Compare section appears between Trends and Drives; switching A/B dropdowns updates the delta table colours in the documented direction (green = better) and both distribution charts; selecting the same drive shows the "pick two different drives" note.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/HistoryView.tsx
git commit -m "feat(compare): surface the Compare section in the History tab"
```

---

## Self-review

**Spec coverage:**
- Placement = Compare section in History tab → Task 4. ✓
- Two date-labelled A/B dropdowns, default two most recent → Task 3 (`optLabel`, `drives[0]/[1]`). ✓
- Metric-delta table (L/100, €/km, CO₂ g/km, eco, idle%, + neutral distance/avg speed), B−A, direction colour → Task 2 + Task 3 `CompareTable`. ✓
- Distribution histograms, speed + RPM bands, normalised % per drive, grouped A/B bars → Task 1 + Task 3 `Dist`. ✓
- Data from stored signals with speed fallback `Vehicle speed`→`Speed (GPS)` → Task 1 `signalPoints`/`SPEED_SIGNALS`. ✓
- Count≈time approximation stated in UI → Task 3 caption + the `<p>` note. ✓
- a11y: `role="img"` + aria-label + `ChartTable` fallback + colourblind-safe A/B palette → Task 3 `Dist`. ✓
- Edge cases: <2 drives, same drive, missing RPM/speed signal, missing metric → Task 3 (`drives.length < 2`, `sameDrive`, `Dist` empty-guard, `CompareTable` `—`). ✓
- No `App.tsx` change (component imports `getDrive`) → Task 3. ✓
- Tests mirror `aggregate.test.ts` (pure) and `SpeedChart.test.tsx` (mock recharts) → Tasks 1–3. ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `Band`, `distribute`, `bandLabels`, `signalPoints`, `SPEED_EDGES`, `RPM_EDGES`, `SPEED_SIGNALS`, `RPM_SIGNALS` (distribution.ts) and `CompareRow`, `Better`, `buildCompareRows`, `deltaColor` (compareMetrics.ts) are used in `DriveCompare.tsx` with matching names/signatures. `getDrive(id) => Promise<StoredDrive | undefined>` matches `history/db.ts`. `StoredDrive.analysis: DriveAnalysis` matches `history/types.ts`.
