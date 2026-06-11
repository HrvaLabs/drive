# Phase 3 — Full Dual-Audience Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v1 dashboard into the "looks nice", dual-audience experience: all the time-series graphs, a metric-colored route map with event pins, an elevation strip, friendly tips cards, a vehicle/data card, and an **Expert/Debug mode** (raw per-PID signal explorer + data-coverage view) — friendly by default, expert on demand.

**Architecture:** Two additive backend fields power everything: `signals` (every present PID as a downsampled, stat-summarized series — feeds the graphs AND the expert explorer) and `tips` (a small rule-based set derived from the Phase 2 events/scores/health). The frontend gains reusable chart components and a `view` toggle (Friendly | Expert). `schemaVersion` stays **"1"** (additive).

**Tech Stack:** Python 3.13 + pandas/numpy (analysis) · React 19 + TS + Recharts + react-leaflet + Vitest (frontend). No new dependencies.

**Scope:** **Phase 3 only** (design §8). Build the rich dashboard + expert mode + a *basic* tips set. Do **NOT** build: the full eco-tip ruleset / what-if savings / cost projections (Phase 4), `.brc` VIN/engine decode or PDF export (Phase 5), or persistence/history (later). The vehicle card shows what's already in the data (`drive.vehicle.label` + data-quality summary) — no VIN decode yet.

**Builds on:** Phase 0–2 + the hardening, all on `main`. Read `docs/superpowers/specs/2026-06-05-hrva-drive-design.md` (§4 feature catalog, §6 definitions, §7 contract). The analysis service already produces `summary/route/series/dataQuality/events/scores/health/bests`; `app/metrics.py` provides `series` (case-insensitive), `resample_1hz`, etc. The frontend already has `SummaryCard/RouteMap/SpeedChart/ScoresCard/BestsCard` and mocks `recharts`/`react-leaflet` in tests.

> This is a large milestone. The Parts are natural execution checkpoints: **Part A** (backend), **Part B** (graphs/map/elevation), **Part C** (dual-audience: tips/vehicle/expert), **Part D** (integration). It can be executed and reviewed Part-by-Part.

---

## Prerequisites

Same as Phase 2: `analysis/.venv` (Python 3.13), JDK 25 via `JAVA_HOME="$(/usr/libexec/java_home -v 25)"`, Node 24. `make test` / `make run`. Commit locally per task, **no co-author trailer** (repo identity `git@hrva.cc`). When implementing UI, apply the `frontend-design` skill for polish.

**Present graph PIDs (verified in the sample drive):** `Engine RPM`, `Calculated engine load value`, `Throttle position`, `Calculated boost`, `Engine coolant temperature`, `Engine fuel rate`, `Altitude (GPS)`. Absent PIDs must be skipped gracefully (different ECUs vary).

---

## File Structure

```
analysis/app/
├── models.py        # MODIFY: add Signal, Tip; add `signals` + `tips` to DriveAnalysis
├── signals.py       # NEW: build_signals(df) -> dict[pid, Signal] (downsampled + stats)
├── tips.py          # NEW: build_tips(events, scores, health, summary) -> list[Tip]
└── analysis.py      # MODIFY: orchestrator fills signals + tips
analysis/tests/      # NEW: test_signals.py, test_tips.py ; MODIFY: test_analysis.py

frontend/src/
├── types.ts                       # MODIFY: add Signal, Tip + 2 DriveAnalysis fields
├── format.ts                      # NEW: small shared formatters (mmss already inline; add labelForPid)
├── components/
│   ├── MetricChart.tsx            # NEW: reusable labelled line chart (+ test)
│   ├── GraphsPanel.tsx            # NEW: the named graphs grid (+ test)
│   ├── ElevationStrip.tsx         # NEW: altitude area chart (+ test)
│   ├── RouteMap.tsx               # MODIFY: speed-colored segments + event pins
│   ├── TipsCard.tsx               # NEW (+ test)
│   ├── VehicleCard.tsx            # NEW (+ test)
│   └── ExpertPanel.tsx            # NEW: data coverage + per-PID signal explorer (+ test)
├── App.tsx                        # MODIFY: Friendly|Expert toggle, wire everything
└── App.test.tsx                   # MODIFY: assert friendly + expert views
```

---

# Part A — Backend: signals + tips

## Task A1: `signals` — every PID as a downsampled, summarized series

**Files:** Modify `analysis/app/models.py`; create `analysis/app/signals.py`, `analysis/tests/test_signals.py`

- [ ] **Step 1: Add the `Signal` model to `analysis/app/models.py`** (above `class DriveAnalysis`, after `Bests`)

```python
class Signal(BaseModel):
    unit: str = ""
    n: int = 0
    min: float = 0.0
    max: float = 0.0
    mean: float = 0.0
    points: list[SeriesPoint] = Field(default_factory=list)
```

Add this field to `class DriveAnalysis` (after `bests`):
```python
    signals: dict[str, Signal] = Field(default_factory=dict)
```

- [ ] **Step 2: Write the failing test** — `analysis/tests/test_signals.py`

```python
import pandas as pd

from app import signals


def _df(rows):
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": u, "lat": None, "lon": None} for (t, p, v, u) in rows]
    )


def test_build_signals_summarizes_each_pid():
    rows = [(0.0, "Engine RPM", 1000.0, "rpm"), (1.0, "Engine RPM", 3000.0, "rpm"),
            (0.0, "Throttle position", 10.0, "%")]
    sig = signals.build_signals(_df(rows))
    assert set(sig.keys()) == {"Engine RPM", "Throttle position"}
    rpm = sig["Engine RPM"]
    assert rpm.unit == "rpm"
    assert rpm.n == 2
    assert rpm.min == 1000.0
    assert rpm.max == 3000.0
    assert rpm.mean == 2000.0
    assert len(rpm.points) == 2


def test_build_signals_downsamples_to_cap():
    rows = [(float(t), "Engine RPM", float(t), "rpm") for t in range(0, 1000)]
    sig = signals.build_signals(_df(rows), max_points=100)
    assert sig["Engine RPM"].n == 1000          # full count preserved in stats
    assert len(sig["Engine RPM"].points) <= 100  # but points are downsampled
```

- [ ] **Step 3: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_signals.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.signals'`.

- [ ] **Step 4: Create `analysis/app/signals.py`**

```python
import numpy as np
import pandas as pd

from app import metrics
from app.models import SeriesPoint, Signal

_MAX_POINTS = 300


def _downsample(s: pd.DataFrame, max_points: int) -> pd.DataFrame:
    if max_points <= 0 or len(s) <= max_points:
        return s
    step = int(np.ceil(len(s) / max_points))
    return s.iloc[::step].reset_index(drop=True)


def build_signals(df: pd.DataFrame, max_points: int = _MAX_POINTS) -> dict[str, Signal]:
    """Every present PID as a downsampled (t, v) series plus min/max/mean/count.
    Powers both the named graphs and the expert per-PID explorer."""
    out: dict[str, Signal] = {}
    for pid in sorted(p for p in df["pid"].dropna().unique()):
        s = metrics.series(df, pid)
        if s.empty:
            continue
        units = df.loc[df["pid"] == pid, "unit"].dropna()
        unit = str(units.iloc[0]) if not units.empty else ""
        ds = _downsample(s, max_points)
        out[pid] = Signal(
            unit=unit,
            n=int(len(s)),
            min=round(float(s["value"].min()), 3),
            max=round(float(s["value"].max()), 3),
            mean=round(float(s["value"].mean()), 3),
            points=[SeriesPoint(t=float(r.t), v=float(r.value)) for r in ds.itertuples()],
        )
    return out
```

- [ ] **Step 5: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_signals.py -q`
Expected: PASS (2).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/models.py analysis/app/signals.py analysis/tests/test_signals.py
git commit -m "feat(analysis): per-PID signals (downsampled series + stats) for graphs and expert mode"
```

---

## Task A2: `tips` — basic rule-based coaching

**Files:** Modify `analysis/app/models.py`; create `analysis/app/tips.py`, `analysis/tests/test_tips.py`

- [ ] **Step 1: Add the `Tip` model to `analysis/app/models.py`** (after `Signal`)

```python
class Tip(BaseModel):
    id: str
    severity: str = "info"  # "good" | "info" | "warn"
    title: str
    detail: str = ""
```

Add this field to `class DriveAnalysis` (after `signals`):
```python
    tips: list[Tip] = Field(default_factory=list)
```

- [ ] **Step 2: Write the failing test** — `analysis/tests/test_tips.py`

```python
from app import tips
from app.models import Event, Health, Scores, Summary


def _scores(**kw):
    base = dict(eco=60, style="normal", rpmBandPct=60.0, idlePct=5.0, speedSteadiness=70.0, harshEvents=0)
    base.update(kw)
    return Scores(**base)


def test_idle_tip_when_idling_high():
    out = tips.build_tips([], _scores(idlePct=20.0), Health(), Summary())
    assert any(t.id == "reduce_idle" and t.severity == "warn" for t in out)


def test_harsh_tip_counts_events():
    out = tips.build_tips([], _scores(harshEvents=4), Health(), Summary())
    assert any(t.id == "smoother" and "4" in t.detail for t in out)


def test_coasting_is_praised():
    events = [Event(type="coasting", t=1.0, durationSeconds=10.0)]
    out = tips.build_tips(events, _scores(), Health(), Summary())
    assert any(t.id == "coasting_good" and t.severity == "good" for t in out)


def test_low_battery_tip():
    out = tips.build_tips([], _scores(), Health(batteryVerdict="low", batteryVolts=11.6), Summary())
    assert any(t.id == "battery_low" for t in out)


def test_clean_drive_gets_a_positive_tip():
    out = tips.build_tips([], _scores(idlePct=2.0, rpmBandPct=80.0, harshEvents=0), Health(), Summary())
    assert any(t.severity == "good" for t in out)
```

- [ ] **Step 3: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_tips.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.tips'`.

- [ ] **Step 4: Create `analysis/app/tips.py`**

```python
from app.models import Event, Health, Scores, Summary, Tip

_IDLE_PCT_WARN = 10.0
_RPM_BAND_LOW = 50.0


def build_tips(events: list[Event], scores: Scores, health: Health, summary: Summary) -> list[Tip]:
    """A small, evidence-cited tip set from the Phase 2 signals. The full eco
    ruleset, € savings, and projections are Phase 4 — keep this minimal."""
    tips: list[Tip] = []
    idle_n = sum(1 for e in events if e.type == "idle")
    coasting_n = sum(1 for e in events if e.type == "coasting")

    if scores.idlePct >= _IDLE_PCT_WARN:
        tips.append(Tip(id="reduce_idle", severity="warn", title="Cut idling",
                        detail=f"You idled {scores.idlePct}% of the drive ({idle_n} stops). "
                               f"Switching off during long stops saves fuel."))
    if scores.harshEvents > 0:
        tips.append(Tip(id="smoother", severity="warn", title="Smoother inputs",
                        detail=f"{scores.harshEvents} harsh accel/brake events. Anticipating "
                               f"earlier saves fuel and brakes."))
    if scores.rpmBandPct < _RPM_BAND_LOW:
        tips.append(Tip(id="short_shift", severity="info", title="Short-shift",
                        detail=f"Only {scores.rpmBandPct}% of the time in the efficient RPM band. "
                               f"Shifting up earlier keeps revs low."))
    if coasting_n > 0:
        tips.append(Tip(id="coasting_good", severity="good", title="Great coasting",
                        detail=f"You coasted with the fuel cut-off {coasting_n} times — that uses "
                               f"zero fuel. Keep it up."))
    if health.batteryVerdict == "low":
        tips.append(Tip(id="battery_low", severity="warn", title="Check the battery",
                        detail=f"Battery voltage read low ({health.batteryVolts} V). Worth a check "
                               f"if it persists."))
    if not any(t.severity == "warn" for t in tips):
        tips.insert(0, Tip(id="all_good", severity="good", title="Smooth drive",
                          detail="No obvious eco issues this drive — nicely done."))
    return tips
```

- [ ] **Step 5: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_tips.py -q`
Expected: PASS (5).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/models.py analysis/app/tips.py analysis/tests/test_tips.py
git commit -m "feat(analysis): basic rule-based tips from events/scores/health"
```

---

## Task A3: Wire signals + tips into the orchestrator

**Files:** Modify `analysis/app/analysis.py`, `analysis/tests/test_analysis.py`

- [ ] **Step 1: Add assertions to `analysis/tests/test_analysis.py`** (append inside `test_build_drive_analysis_fills_summary`, after the Phase 2 asserts)

```python
    # Phase 3 fields
    assert "Vehicle speed" in result.signals
    assert result.signals["Vehicle speed"].n > 0
    assert isinstance(result.tips, list) and len(result.tips) >= 1
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analysis.py -q`
Expected: FAIL — `result.signals` is empty / `"Vehicle speed"` not present.

- [ ] **Step 3: Modify `analysis/app/analysis.py`**

(a) Add imports (next to the existing `from app import ...` lines):
```python
from app import signals as signals_mod
from app import tips as tips_mod
```

(b) The orchestrator currently builds `scores`/`health` inline inside the `DriveAnalysis(...)` call. Refactor so tips can reuse them: replace the inline `scores=scores_mod.build_scores(df, harsh),` and `health=health_mod.build_health(df),` arguments by first computing them as locals **above** the return, right after the `harsh = ...` line:
```python
    score_obj = scores_mod.build_scores(df, harsh)
    health_obj = health_mod.build_health(df)
```
Then in the `DriveAnalysis(...)` call use the locals and add the two new fields:
```python
        scores=score_obj,
        health=health_obj,
        bests=bests_mod.build_bests(df),
        signals=signals_mod.build_signals(df),
        tips=tips_mod.build_tips(detected, score_obj, health_obj, summary),
```
(`summary` is the `Summary(...)` object already built earlier in the function — pass that same variable.)

- [ ] **Step 4: Run the full analysis suite, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/analysis.py analysis/tests/test_analysis.py
git commit -m "feat(analysis): orchestrator fills signals and tips"
```

---

# Part B — Frontend: graphs, map, elevation

## Task B1: Types

**Files:** Modify `frontend/src/types.ts`

- [ ] **Step 1: Add to `frontend/src/types.ts`**

```ts
export interface Signal { unit: string; n: number; min: number; max: number; mean: number; points: SeriesPoint[] }
export interface Tip { id: string; severity: string; title: string; detail: string }
```
Add to the `DriveAnalysis` interface (after `bests`):
```ts
  signals: Record<string, Signal>;
  tips: Tip[];
```

- [ ] **Step 2: Confirm the build**

Run: `cd frontend && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: builds clean (additive types). If the existing `App.test.tsx` stub now fails to typecheck, add `signals: {}` and `tips: []` to that stub object.

- [ ] **Step 3: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/types.ts frontend/src/App.test.tsx
git commit -m "feat(frontend): add Signal and Tip types"
```

---

## Task B2: MetricChart + GraphsPanel

**Files:** Create `frontend/src/components/MetricChart.tsx` (+ test), `frontend/src/components/GraphsPanel.tsx` (+ test)

- [ ] **Step 1: Write the FAILING tests**

`frontend/src/components/MetricChart.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => <div data-testid="line" />, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, CartesianGrid: () => null,
}));

import MetricChart from './MetricChart';

describe('MetricChart', () => {
  it('renders a titled line chart', () => {
    render(<MetricChart title="Engine RPM" unit="rpm" points={[{ t: 0, v: 1000 }, { t: 1, v: 3000 }]} />);
    expect(screen.getByText(/Engine RPM/)).toBeInTheDocument();
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
  });
});
```

`frontend/src/components/GraphsPanel.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import GraphsPanel from './GraphsPanel';
import type { Signal } from '../types';

const sig = (v: number): Signal => ({ unit: 'x', n: 1, min: v, max: v, mean: v, points: [{ t: 0, v }] });

describe('GraphsPanel', () => {
  it('renders a chart for each present named signal, skipping absent ones', () => {
    const signals: Record<string, Signal> = { 'Engine RPM': sig(2000), 'Throttle position': sig(20) };
    render(<GraphsPanel signals={signals} />);
    expect(screen.getByText(/Engine RPM/)).toBeInTheDocument();
    expect(screen.getByText(/Throttle/)).toBeInTheDocument();
    // a named-but-absent signal (Calculated boost) must not render
    expect(screen.queryByText(/boost/i)).toBeNull();
    expect(screen.getAllByTestId('linechart').length).toBe(2);
  });
});
```

- [ ] **Step 2: Run them, watch them fail**

Run: `cd frontend && npm test -- "MetricChart|GraphsPanel"`
Expected: FAIL — components don't exist.

- [ ] **Step 3: Create `frontend/src/components/MetricChart.tsx`**

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SeriesPoint } from '../types';

interface Props {
  title: string;
  unit: string;
  points: SeriesPoint[];
  color?: string;
}

export default function MetricChart({ title, unit, points, color = '#2563eb' }: Props) {
  return (
    <section>
      <h4 style={{ margin: '0 0 4px' }}>{title} <small style={{ color: '#71717a' }}>({unit})</small></h4>
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(t) => `${Math.round(t / 60)}m`} />
            <YAxis width={48} />
            <Tooltip />
            <Line type="monotone" dataKey="v" stroke={color} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/GraphsPanel.tsx`**

```tsx
import MetricChart from './MetricChart';
import type { Signal } from '../types';

// Named graphs shown in the friendly view, in order. Absent PIDs are skipped.
const NAMED: Array<{ pid: string; title: string; color: string }> = [
  { pid: 'Engine RPM', title: 'Engine RPM', color: '#2563eb' },
  { pid: 'Calculated engine load value', title: 'Engine load', color: '#7c3aed' },
  { pid: 'Throttle position', title: 'Throttle', color: '#0891b2' },
  { pid: 'Calculated boost', title: 'Boost', color: '#ea580c' },
  { pid: 'Engine coolant temperature', title: 'Coolant temp', color: '#dc2626' },
  { pid: 'Engine fuel rate', title: 'Fuel rate', color: '#16a34a' },
];

interface Props {
  signals: Record<string, Signal>;
}

export default function GraphsPanel({ signals }: Props) {
  const present = NAMED.filter((g) => signals[g.pid]);
  if (present.length === 0) {
    return null;
  }
  return (
    <section>
      <h3>Graphs</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {present.map((g) => (
          <MetricChart key={g.pid} title={g.title} unit={signals[g.pid].unit}
                       points={signals[g.pid].points} color={g.color} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run, watch pass**

Run: `cd frontend && npm test -- "MetricChart|GraphsPanel"`
Expected: PASS (MetricChart 1 + GraphsPanel 1).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/MetricChart.tsx frontend/src/components/MetricChart.test.tsx frontend/src/components/GraphsPanel.tsx frontend/src/components/GraphsPanel.test.tsx
git commit -m "feat(frontend): MetricChart + GraphsPanel (named time-series graphs)"
```

---

## Task B3: ElevationStrip

**Files:** Create `frontend/src/components/ElevationStrip.tsx` (+ test)

- [ ] **Step 1: Write the FAILING test** — `frontend/src/components/ElevationStrip.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="areachart">{children}</div>,
  Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import ElevationStrip from './ElevationStrip';
import type { Signal } from '../types';

describe('ElevationStrip', () => {
  it('renders an area chart when altitude is present', () => {
    const alt: Signal = { unit: 'm', n: 2, min: 100, max: 110, mean: 105, points: [{ t: 0, v: 100 }, { t: 1, v: 110 }] };
    render(<ElevationStrip altitude={alt} />);
    expect(screen.getByText(/Elevation/i)).toBeInTheDocument();
    expect(screen.getByTestId('areachart')).toBeInTheDocument();
  });

  it('renders nothing when altitude is absent', () => {
    const { container } = render(<ElevationStrip altitude={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- ElevationStrip`
Expected: FAIL — no `ElevationStrip`.

- [ ] **Step 3: Create `frontend/src/components/ElevationStrip.tsx`**

```tsx
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Signal } from '../types';

interface Props {
  altitude: Signal | undefined;
}

export default function ElevationStrip({ altitude }: Props) {
  if (!altitude || altitude.points.length === 0) {
    return null;
  }
  return (
    <section>
      <h3>Elevation <small style={{ color: '#71717a' }}>({altitude.min}–{altitude.max} m)</small></h3>
      <div style={{ width: '100%', height: 120 }}>
        <ResponsiveContainer>
          <AreaChart data={altitude.points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(t) => `${Math.round(t / 60)}m`} />
            <YAxis width={48} unit=" m" />
            <Tooltip />
            <Area type="monotone" dataKey="v" stroke="#15803d" fill="#bbf7d0" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- ElevationStrip`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/ElevationStrip.tsx frontend/src/components/ElevationStrip.test.tsx
git commit -m "feat(frontend): ElevationStrip altitude profile"
```

---

## Task B4: RouteMap — speed-colored segments + event pins

**Files:** Modify `frontend/src/components/RouteMap.tsx`, `frontend/src/components/RouteMap.test.tsx`

- [ ] **Step 1: Replace `frontend/src/components/RouteMap.test.tsx`** (the mock now also provides `CircleMarker` + `Tooltip`)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polyline: (props: { positions: unknown[] }) => <div data-testid="polyline" data-points={props.positions.length} />,
  CircleMarker: ({ children }: { children?: React.ReactNode }) => <div data-testid="pin">{children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import RouteMap from './RouteMap';
import type { RoutePoint, DriveEvent } from '../types';

const route: RoutePoint[] = [
  { t: 0, lat: 45.0, lon: 15.0, speedKmh: 0 },
  { t: 1, lat: 45.0, lon: 15.001, speedKmh: 60 },
  { t: 2, lat: 45.0, lon: 15.002, speedKmh: 120 },
];
const events: DriveEvent[] = [{ type: 'hard_brake', t: 1, lat: 45.0, lon: 15.001, value: -0.4, durationSeconds: 0 }];

describe('RouteMap', () => {
  it('renders speed-colored segments and an event pin', () => {
    render(<RouteMap route={route} events={events} />);
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getAllByTestId('polyline').length).toBeGreaterThanOrEqual(2); // multiple colored segments
    expect(screen.getAllByTestId('pin').length).toBe(1);
  });

  it('shows a placeholder when there is no GPS', () => {
    render(<RouteMap route={[]} events={[]} />);
    expect(screen.getByText(/no gps/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- RouteMap`
Expected: FAIL — current RouteMap takes only `route` (no `events`), renders one polyline, no pins.

- [ ] **Step 3: Replace `frontend/src/components/RouteMap.tsx`**

```tsx
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import type { DriveEvent, RoutePoint } from '../types';

function speedColor(kmh: number): string {
  if (kmh < 30) return '#16a34a';
  if (kmh < 70) return '#ca8a04';
  if (kmh < 110) return '#ea580c';
  return '#dc2626';
}

const EVENT_COLOR: Record<string, string> = {
  hard_brake: '#dc2626', hard_accel: '#ea580c', idle: '#64748b', high_rpm: '#7c3aed', coasting: '#16a34a',
};

interface Props {
  route: RoutePoint[];
  events: DriveEvent[];
}

export default function RouteMap({ route, events }: Props) {
  if (route.length === 0) {
    return <p style={{ color: '#71717a' }}>No GPS data in this drive.</p>;
  }
  const positions: LatLngExpression[] = route.map((p) => [p.lat, p.lon]);
  const bounds = positions as LatLngBoundsExpression;
  // one Polyline per consecutive pair, colored by the segment's starting speed
  const segments = route.slice(0, -1).map((p, i) => ({
    key: i,
    line: [[p.lat, p.lon], [route[i + 1].lat, route[i + 1].lon]] as LatLngExpression[],
    color: speedColor(p.speedKmh),
  }));
  const pins = events.filter((e) => e.lat != null && e.lon != null);
  return (
    <div style={{ height: 380, borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer attribution="&copy; OpenStreetMap contributors"
                   url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {segments.map((s) => (
          <Polyline key={s.key} positions={s.line} pathOptions={{ color: s.color, weight: 4 }} />
        ))}
        {pins.map((e, i) => (
          <CircleMarker key={i} center={[e.lat as number, e.lon as number]} radius={6}
                        pathOptions={{ color: EVENT_COLOR[e.type] ?? '#334155', fillOpacity: 0.9 }}>
            <Tooltip>{e.type.replace('_', ' ')}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
```

> Note: `route` is already downsampled by the backend (~≤2000 points). For very long drives that is still many `Polyline` segments; if the map feels heavy in the browser (Task D1), cap the colored segments by sampling every Nth point — but do NOT pre-optimize before observing it.

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- RouteMap`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/RouteMap.tsx frontend/src/components/RouteMap.test.tsx
git commit -m "feat(frontend): RouteMap speed-colored segments + event pins"
```

> **App.tsx already renders `<RouteMap route={...} />`** with no `events` prop — that will fail to typecheck after this task. It is fixed in Task C4 (App wiring); until then the `App.test.tsx`/build may be red, which is expected mid-Part-C. If executing Part B standalone, temporarily pass `events={[]}` in App.tsx and revert in C4.

---

# Part C — Dual-audience: tips, vehicle, expert mode

## Task C1: TipsCard

**Files:** Create `frontend/src/components/TipsCard.tsx` (+ test)

- [ ] **Step 1: Write the FAILING test** — `frontend/src/components/TipsCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import TipsCard from './TipsCard';
import type { Tip } from '../types';

const tips: Tip[] = [
  { id: 'reduce_idle', severity: 'warn', title: 'Cut idling', detail: 'You idled 20% of the drive.' },
  { id: 'coasting_good', severity: 'good', title: 'Great coasting', detail: 'You coasted 5 times.' },
];

describe('TipsCard', () => {
  it('lists every tip with its title and detail', () => {
    render(<TipsCard tips={tips} />);
    expect(screen.getByText('Cut idling')).toBeInTheDocument();
    expect(screen.getByText(/idled 20%/)).toBeInTheDocument();
    expect(screen.getByText('Great coasting')).toBeInTheDocument();
  });

  it('renders nothing when there are no tips', () => {
    const { container } = render(<TipsCard tips={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- TipsCard`
Expected: FAIL — no `TipsCard`.

- [ ] **Step 3: Create `frontend/src/components/TipsCard.tsx`**

```tsx
import type { Tip } from '../types';

const ICON: Record<string, string> = { good: '✅', warn: '⚠️', info: '💡' };
const BG: Record<string, string> = { good: '#dcfce7', warn: '#fef9c3', info: '#eff6ff' };

interface Props {
  tips: Tip[];
}

export default function TipsCard({ tips }: Props) {
  if (tips.length === 0) {
    return null;
  }
  return (
    <section>
      <h3>Tips</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {tips.map((t) => (
          <div key={t.id} style={{ background: BG[t.severity] ?? '#f4f4f5', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600 }}>{ICON[t.severity] ?? '•'} {t.title}</div>
            <div style={{ color: '#3f3f46' }}>{t.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- TipsCard`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/TipsCard.tsx frontend/src/components/TipsCard.test.tsx
git commit -m "feat(frontend): TipsCard"
```

---

## Task C2: VehicleCard

**Files:** Create `frontend/src/components/VehicleCard.tsx` (+ test)

- [ ] **Step 1: Write the FAILING test** — `frontend/src/components/VehicleCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import VehicleCard from './VehicleCard';
import type { DriveAnalysis } from '../types';

const drive: DriveAnalysis['drive'] = {
  source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
  vehicle: { label: 'My car', vin: null, engine: null },
};
const dataQuality: DriveAnalysis['dataQuality'] = {
  rowCount: 288759, pidsPresent: ['Vehicle speed', 'Engine RPM'], distanceSource: 'odometer', warnings: [],
};

describe('VehicleCard', () => {
  it('shows the vehicle label and data summary', () => {
    render(<VehicleCard drive={drive} dataQuality={dataQuality} />);
    expect(screen.getByText('My car')).toBeInTheDocument();
    expect(screen.getByText(/2 signals/)).toBeInTheDocument();
    expect(screen.getByText(/odometer/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- VehicleCard`
Expected: FAIL — no `VehicleCard`.

- [ ] **Step 3: Create `frontend/src/components/VehicleCard.tsx`**

```tsx
import type { DriveAnalysis } from '../types';

interface Props {
  drive: DriveAnalysis['drive'];
  dataQuality: DriveAnalysis['dataQuality'];
}

export default function VehicleCard({ drive, dataQuality }: Props) {
  const engine = drive.vehicle.engine ? ` · ${drive.vehicle.engine}` : '';
  return (
    <section style={{ background: '#f4f4f5', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 16 }}>{drive.vehicle.label ?? 'Vehicle'}{engine}</div>
      <div style={{ color: '#71717a', fontSize: 13 }}>
        {dataQuality.pidsPresent.length} signals · distance from {dataQuality.distanceSource}
        {drive.startedAtClock ? ` · started ${drive.startedAtClock.slice(0, 8)}` : ''}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- VehicleCard`
Expected: PASS (1).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/VehicleCard.tsx frontend/src/components/VehicleCard.test.tsx
git commit -m "feat(frontend): VehicleCard (label + data summary)"
```

---

## Task C3: ExpertPanel — data coverage + per-PID signal explorer

**Files:** Create `frontend/src/components/ExpertPanel.tsx` (+ test)

- [ ] **Step 1: Write the FAILING test** — `frontend/src/components/ExpertPanel.test.tsx`

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import ExpertPanel from './ExpertPanel';
import type { Signal, DriveAnalysis } from '../types';

const sig = (u: string, mn: number, mx: number): Signal => ({ unit: u, n: 3, min: mn, max: mx, mean: (mn + mx) / 2, points: [{ t: 0, v: mn }, { t: 1, v: mx }] });
const signals: Record<string, Signal> = { 'Engine RPM': sig('rpm', 800, 3355), 'Vehicle speed': sig('km/h', 0, 146) };
const dataQuality: DriveAnalysis['dataQuality'] = {
  rowCount: 100, pidsPresent: ['Engine RPM', 'Vehicle speed'], distanceSource: 'odometer',
  warnings: ['distance is from GPS only (no odometer); it may be over-reported'],
};

describe('ExpertPanel', () => {
  it('lists signal coverage, shows warnings, and explores a chosen PID', () => {
    render(<ExpertPanel signals={signals} dataQuality={dataQuality} />);
    // the signal picker offers both PIDs ("Engine RPM" appears in both the <option>
    // and the coverage <td>, so target the option role specifically)
    expect(screen.getByRole('option', { name: 'Engine RPM' })).toBeInTheDocument();
    expect(screen.getByText(/over-reported/)).toBeInTheDocument();      // warning surfaced
    // selecting a PID shows its chart
    fireEvent.change(screen.getByLabelText('signal'), { target: { value: 'Vehicle speed' } });
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
    expect(screen.getByText(/max 146/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- ExpertPanel`
Expected: FAIL — no `ExpertPanel`.

- [ ] **Step 3: Create `frontend/src/components/ExpertPanel.tsx`**

```tsx
import { useState } from 'react';
import MetricChart from './MetricChart';
import type { DriveAnalysis, Signal } from '../types';

interface Props {
  signals: Record<string, Signal>;
  dataQuality: DriveAnalysis['dataQuality'];
}

export default function ExpertPanel({ signals, dataQuality }: Props) {
  const pids = Object.keys(signals).sort();
  const [selected, setSelected] = useState<string>(pids[0] ?? '');
  const sig = signals[selected];
  return (
    <section style={{ borderTop: '2px dashed #d4d4d8', paddingTop: 16, marginTop: 8 }}>
      <h3>Expert / debug</h3>

      {dataQuality.warnings.length > 0 && (
        <ul style={{ color: '#b45309' }}>
          {dataQuality.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      <p style={{ color: '#71717a', fontSize: 13 }}>
        {dataQuality.rowCount.toLocaleString()} rows · {pids.length} signals · distance from {dataQuality.distanceSource}
      </p>

      <label>
        Signal:{' '}
        <select aria-label="signal" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {pids.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      {sig && (
        <div style={{ marginTop: 8 }}>
          <p style={{ fontSize: 13, color: '#3f3f46' }}>
            min {sig.min} · max {sig.max} · mean {sig.mean} · {sig.n} samples ({sig.unit})
          </p>
          <MetricChart title={selected} unit={sig.unit} points={sig.points} color="#0f172a" />
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary>All signals ({pids.length})</summary>
        <table style={{ fontSize: 13, borderCollapse: 'collapse', marginTop: 8 }}>
          <thead><tr><th align="left">PID</th><th>n</th><th>min</th><th>max</th><th>mean</th></tr></thead>
          <tbody>
            {pids.map((p) => (
              <tr key={p}>
                <td>{p}</td><td align="right">{signals[p].n}</td><td align="right">{signals[p].min}</td>
                <td align="right">{signals[p].max}</td><td align="right">{signals[p].mean}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- ExpertPanel`
Expected: PASS (1).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/ExpertPanel.tsx frontend/src/components/ExpertPanel.test.tsx
git commit -m "feat(frontend): ExpertPanel (data coverage + per-PID signal explorer)"
```

---

## Task C4: App — Friendly | Expert toggle and wire everything

**Files:** Modify `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

- [ ] **Step 1: Update `frontend/src/App.test.tsx`** — extend the mocks and stub, add view-toggle assertions

(a) Ensure the `react-leaflet` mock includes `CircleMarker` and `Tooltip` (RouteMap now uses them); the `recharts` mock must include `AreaChart` and `Area` (ElevationStrip). Replace the two `vi.mock(...)` blocks at the top of the file with:
```tsx
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polyline: () => <div data-testid="polyline" />,
  CircleMarker: ({ children }: { children?: React.ReactNode }) => <div data-testid="pin">{children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="areachart">{children}</div>,
  Line: () => null, Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));
```
(b) Add Phase 3 fields to the `analysis` stub (after `bests`):
```tsx
  signals: { 'Engine RPM': { unit: 'rpm', n: 2, min: 800, max: 3355, mean: 2077, points: [{ t: 0, v: 800 }, { t: 1, v: 3355 }] } },
  tips: [{ id: 'reduce_idle', severity: 'warn', title: 'Cut idling', detail: 'You idled 13% of the drive.' }],
```
(c) The existing test asserts `screen.getByTestId('linechart')` (the speed chart) — GraphsPanel now renders more line charts, so change that one line to `screen.getAllByTestId('linechart')[0]`. Then add these assertions inside the existing test, after the "Best of the drive" assertion:
```tsx
    expect(screen.getByText('Tips')).toBeInTheDocument();
    expect(screen.getByText('Cut idling')).toBeInTheDocument();
    // Friendly by default: the expert panel is hidden
    expect(screen.queryByText('Expert / debug')).toBeNull();
    // Toggling to Expert reveals the signal explorer
    fireEvent.click(screen.getByRole('button', { name: /expert/i }));
    expect(screen.getByText('Expert / debug')).toBeInTheDocument();
    expect(screen.getByLabelText('signal')).toBeInTheDocument();
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- App`
Expected: FAIL — no Tips / Expert toggle yet.

- [ ] **Step 3: Replace `frontend/src/App.tsx`**

```tsx
import { useState } from 'react';
import { analyzeDrive } from './api';
import type { DriveAnalysis } from './types';
import SummaryCard from './components/SummaryCard';
import ScoresCard from './components/ScoresCard';
import RouteMap from './components/RouteMap';
import BestsCard from './components/BestsCard';
import SpeedChart from './components/SpeedChart';
import GraphsPanel from './components/GraphsPanel';
import ElevationStrip from './components/ElevationStrip';
import TipsCard from './components/TipsCard';
import VehicleCard from './components/VehicleCard';
import ExpertPanel from './components/ExpertPanel';

type Phase = 'idle' | 'loading' | 'done' | 'error';
type View = 'friendly' | 'expert';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<DriveAnalysis | null>(null);
  const [error, setError] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [view, setView] = useState<View>('friendly');

  async function onAnalyze() {
    if (!file) return;
    setPhase('loading');
    setError('');
    try {
      setAnalysis(await analyzeDrive(file));
      setPhase('done');
    } catch (err) {
      setError(String(err));
      setPhase('error');
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 1040, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>HrvaDrive</h1>
        {analysis && (
          <div role="group" aria-label="view">
            <button onClick={() => setView('friendly')} disabled={view === 'friendly'}>Friendly</button>
            <button onClick={() => setView('expert')} disabled={view === 'expert'} style={{ marginLeft: 4 }}>Expert</button>
          </div>
        )}
      </header>
      <p>Upload a Car Scanner <code>vertical_layout</code> export.</p>
      <div>
        <input type="file" aria-label="drive file" accept=".csv"
               onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={onAnalyze} disabled={!file || phase === 'loading'} style={{ marginLeft: 8 }}>
          {phase === 'loading' ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>
      {phase === 'error' && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {analysis && (
        <div style={{ display: 'grid', gap: 24, marginTop: 24 }}>
          <VehicleCard drive={analysis.drive} dataQuality={analysis.dataQuality} />
          <SummaryCard summary={analysis.summary} durationSeconds={analysis.drive.durationSeconds} />
          <ScoresCard scores={analysis.scores} eventCount={analysis.events.length} />
          <TipsCard tips={analysis.tips} />
          <RouteMap route={analysis.route} events={analysis.events} />
          <BestsCard bests={analysis.bests} />
          <SpeedChart points={analysis.series.speedKmh ?? []} />
          <ElevationStrip altitude={analysis.signals['Altitude (GPS)']} />
          <GraphsPanel signals={analysis.signals} />
          {view === 'expert' && (
            <ExpertPanel signals={analysis.signals} dataQuality={analysis.dataQuality} />
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the WHOLE frontend suite, watch it pass**

Run: `cd frontend && npm test`
Expected: PASS (App + api + every card/chart/panel).

- [ ] **Step 5: Confirm the build**

Run: `cd frontend && rm -rf dist && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: `tsc -b` passes, `dist/index.html` produced.

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): dual-audience dashboard — graphs, elevation, tips, vehicle, event-pin map, Friendly|Expert toggle"
```

---

# Part D — Integration

## Task D1: Full-stack round-trip + dual-audience eyeball

**Files:** none (verification)

- [ ] **Step 1: Bring the whole stack up**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
make run
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```
Expected: analysis + ingestion `healthy`, frontend up.

- [ ] **Step 2: Confirm the new fields arrive through the chain**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
curl -s --retry 60 --retry-all-errors --retry-connrefused --retry-delay 1 \
  -F "file=@data/vertical_layout (1).csv" -F "format=vertical_layout" \
  http://localhost:8090/api/v1/drives:analyze \
  | python3 -c "import sys,json; b=json.load(sys.stdin); print('signals', len(b['signals']), 'e.g.', list(b['signals'])[:6]); print('tips', [t['id'] for t in b['tips']]); print('Altitude points', len(b['signals'].get('Altitude (GPS)',{}).get('points', [])))"
```
Expected: `signals` ≈ 65 keys (incl. `Engine RPM`, `Throttle position`, `Altitude (GPS)`), a non-empty `tips` list, and a populated altitude series.

- [ ] **Step 3: Eyeball the dashboard**

Open http://localhost:8090, analyze `data/vertical_layout (1).csv`. Expected (Friendly): vehicle card, summary, eco score, tips, **event-pin colored map**, best-of, speed chart, **elevation strip**, **graphs grid**. Click **Expert**: the **signal explorer** + data-coverage + warnings appear. Confirm the map isn't sluggish; if it is, apply the segment-sampling note in Task B4.

- [ ] **Step 4: Tear down**

Run: `make stop`

- [ ] **Step 5: Verification commit (optional)**

```bash
cd /Users/karlo/Developer/hrva-drive
git commit --allow-empty -m "test(phase-3): verified dual-audience dashboard end-to-end on the real drive"
```

---

## Phase 3 acceptance

- `make test` — analysis, ingestion, frontend all green (incl. `test_signals`, `test_tips`, and the new component tests).
- `make run` + uploading the real drive shows the full Friendly dashboard (graphs, colored event-pin map, elevation, tips, vehicle card) and an **Expert** toggle that reveals the per-PID signal explorer + data coverage.
- `schemaVersion` is still `"1"` (signals/tips are additive).
- Absent signals (different ECUs) are skipped without errors; no-GPS drives still render (map shows the placeholder, graphs/expert still work).

## Self-review notes (done while writing)

- **Spec coverage (design §8 Phase 3 + §4):** graphs (B2), metric-colored map + event pins (B4), elevation strip (B3), tips cards (A2/C1), vehicle card (C2), Expert/Debug mode = raw per-PID inspector + data coverage + signal explorer (A1/C3/C4). Friendly-by-default / expert-on-demand toggle (C4). Phase 4/5 items explicitly out of scope.
- **Additive contract:** new model fields `signals`/`tips` are optional with defaults; `schemaVersion` unchanged. Frontend types extend `DriveAnalysis` additively.
- **Consistency:** `build_signals(df)` (A1), `build_tips(...)` (A2) called by the orchestrator (A3); frontend `Signal`/`Tip` mirror the Pydantic shapes; `RouteMap` prop change (`events`) is consumed in App (C4) and its test (B4). Mocks updated wherever a component adds a recharts/leaflet element (CircleMarker/Tooltip/AreaChart/Area).
- **Cross-task note:** B4 changes `RouteMap`'s props, which transiently breaks `App.tsx`'s build until C4 — flagged inline so a subagent executing B4 alone passes `events={[]}` temporarily.
- **No placeholders:** every code/command step is complete and runnable.
```
