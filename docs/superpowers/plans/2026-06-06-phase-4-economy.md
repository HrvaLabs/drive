# Phase 4 — Economy & Tips Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the money story — real €/L and cost/km from the drive, a yearly/monthly cost projection, an **efficiency sweet-spot** (the speed where this car sips least fuel), quantified **what-if savings**, and an upgraded tips set where actionable tips carry a **€ impact**.

**Architecture:** One additive backend field, `economy` (cost, projections, idle waste, potential savings, sweet-spot + a speed-vs-consumption curve), plus a `eurImpact` on `Tip`. Tips now reference the economy figures. The frontend gains an EconomyCard, a SweetSpotChart, and € amounts on the tips. `schemaVersion` stays **"1"** (additive).

**Tech Stack:** Python 3.13 + pandas/numpy (analysis) · React 19 + TS + Recharts + Vitest (frontend). No new dependencies.

**Scope:** **Phase 4 only** (design §8 + §4 items 5–6). Build economy/cost/projection/sweet-spot + tip € depth. Do **NOT** build: `.brc` VIN/engine decode, horizontal formats, PDF export (Phase 5), persistence/history or cross-drive trends (later). Projections use a single configurable **assumed annual distance** (no real history yet) — label it as an assumption, don't pretend it's measured.

**Builds on:** Phases 0–3 on `main`. The analysis service already produces `summary` (distanceKm, fuelUsedL, fuelCostEur, avgConsumptionL100km, idleSeconds), `scores` (harshEvents), `events`, and `signals`. `app/metrics.py` provides `series` (case-insensitive), `speed_source`, `resample_1hz`. `app/tips.py` has `build_tips(events, scores, health, summary)`.

**Verified real-drive anchors** (sample `vertical_layout (1).csv`): price ≈ **€1.61/L** (cost 3.72 / fuel 2.312 L), cost/km ≈ **€0.101**, consumption **6.26 L/100km**, **sweet spot ~90 km/h @ ~5.2 L/100km**, idle fuel rate ≈ **0.885 L/h** over 348 s. `Calculated instant fuel consumption` (L/100km) IS present and is the primary consumption signal.

---

## Prerequisites

Same as prior phases: `analysis/.venv` (Python 3.13), JDK 25 via `JAVA_HOME="$(/usr/libexec/java_home -v 25)"`, Node 24. `make test` / `make run`. Commit locally per task, **no co-author trailer** (`git@hrva.cc`).

---

## File Structure

```
analysis/app/
├── models.py        # MODIFY: add EfficiencyPoint, Economy; add `eurImpact` to Tip; add `economy` to DriveAnalysis
├── economy.py       # NEW: build_economy(df, summary, scores, events, price_per_l) -> Economy
├── tips.py          # MODIFY: optional `economy` arg; €-carrying tips + a sweet-spot tip
└── analysis.py      # MODIFY: orchestrator builds economy, passes it to tips
analysis/tests/      # NEW test_economy.py ; MODIFY test_tips.py, test_analysis.py

frontend/src/
├── types.ts                       # MODIFY: add Economy, EfficiencyPoint; add `eurImpact` to Tip; add `economy` field
├── components/
│   ├── EconomyCard.tsx            # NEW (+ test)
│   ├── SweetSpotChart.tsx         # NEW: speed-vs-consumption scatter + sweet-spot marker (+ test)
│   ├── TipsCard.tsx               # MODIFY: show €impact when present (+ test update)
│   └── ... (App.tsx wires the two new cards)
└── App.tsx / App.test.tsx          # MODIFY: render EconomyCard + SweetSpotChart
```

---

# Part A — Backend: economy + tips depth

## Task A1: Economy model + cost / projections / waste / savings

**Files:** Modify `analysis/app/models.py`; create `analysis/app/economy.py`, `analysis/tests/test_economy.py`

- [ ] **Step 1: Add models to `analysis/app/models.py`** (above `class DriveAnalysis`, after `Tip`)

```python
class EfficiencyPoint(BaseModel):
    speedKmh: float
    l100km: float


class Economy(BaseModel):
    pricePerLEur: float | None = None
    costPerKm: float = 0.0
    assumedAnnualKm: int = 15000
    projectedMonthlyEur: float | None = None
    projectedYearlyEur: float | None = None
    idleWasteEur: float = 0.0
    potentialSavingsEur: float = 0.0
    sweetSpotKmh: float | None = None
    efficiencyCurve: list[EfficiencyPoint] = Field(default_factory=list)
```

Also add `eurImpact` to the existing `Tip` model (so this task's model edits are together) — add this field to `class Tip`:
```python
    eurImpact: float | None = None
```

Add this field to `class DriveAnalysis` (after `tips`):
```python
    economy: Economy = Field(default_factory=Economy)
```

- [ ] **Step 2: Write the failing test** — `analysis/tests/test_economy.py`

```python
import pandas as pd

from app import economy
from app.models import Scores, Summary


def _summary(**kw):
    base = dict(distanceKm=36.94, fuelUsedL=2.312, fuelCostEur=3.72, avgConsumptionL100km=6.26,
                idleSeconds=348, movingSeconds=2000, avgSpeedKmh=50.0, maxSpeedKmh=146.0)
    base.update(kw)
    return Summary(**base)


def _df_idle_rate(lh):
    # a tiny df with an idle stretch (speed 0, rpm on) at a known Engine fuel rate
    rows = []
    for t in range(0, 5):
        rows += [(float(t), "Vehicle speed", 0.0), (float(t), "Engine RPM", 800.0),
                 (float(t), "Engine fuel rate", lh)]
    return pd.DataFrame([{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows])


def test_price_and_cost_per_km_from_the_drive():
    e = economy.build_economy(_df_idle_rate(0.8), _summary(), Scores(), [], price_per_l=None)
    assert e.pricePerLEur == 1.609          # 3.72 / 2.312
    assert e.costPerKm == 0.101             # 3.72 / 36.94


def test_yearly_projection_uses_assumed_distance():
    e = economy.build_economy(_df_idle_rate(0.8), _summary(), Scores(), [], price_per_l=None)
    # 6.26 L/100km * 15000 km / 100 * 1.609 EUR/L ~= 1511 EUR/yr ; monthly ~= 126
    assert e.projectedYearlyEur is not None and 1400 < e.projectedYearlyEur < 1650
    assert e.projectedMonthlyEur is not None and round(e.projectedYearlyEur / 12, 2) == e.projectedMonthlyEur


def test_idle_waste_and_potential_savings():
    e = economy.build_economy(_df_idle_rate(0.885), _summary(), Scores(harshEvents=2), [], price_per_l=None)
    # idle 348 s = 0.0967 h * 0.885 L/h * 1.609 EUR/L ~= 0.14 EUR
    assert 0.10 < e.idleWasteEur < 0.20
    assert e.potentialSavingsEur >= e.idleWasteEur     # savings includes idle + harsh estimate


def test_price_falls_back_to_param_when_no_cost_logged():
    e = economy.build_economy(_df_idle_rate(0.8), _summary(fuelCostEur=0.0), Scores(), [], price_per_l=1.70)
    assert e.pricePerLEur == 1.70
```

- [ ] **Step 3: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_economy.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.economy'`.

- [ ] **Step 4: Create `analysis/app/economy.py`**

```python
import pandas as pd

from app import metrics
from app.models import Economy, Scores, Summary

_DEFAULT_ANNUAL_KM = 15000
_IDLE_FALLBACK_LH = 0.8          # idle fuel rate if not in the data (small petrol)
_HARSH_WASTE_L = 0.03            # rough extra fuel burned per harsh accel/brake event


def _price_per_l(summary: Summary, price_per_l: float | None) -> float | None:
    if summary.fuelUsedL > 0 and summary.fuelCostEur > 0:
        return round(summary.fuelCostEur / summary.fuelUsedL, 3)
    return price_per_l


def _idle_rate_lh(df: pd.DataFrame) -> float:
    src = metrics.speed_source(df)
    if src is None:
        return _IDLE_FALLBACK_LH
    grid = metrics.resample_1hz(df, [src, "Engine RPM", "Engine fuel rate"])
    idle = grid[(grid[src] < 1.0) & (grid["Engine RPM"] > 0)]["Engine fuel rate"].dropna()
    return float(idle.mean()) if not idle.empty else _IDLE_FALLBACK_LH


def build_economy(df: pd.DataFrame, summary: Summary, scores: Scores, events: list,
                  price_per_l: float | None, annual_km: int = _DEFAULT_ANNUAL_KM) -> Economy:
    price = _price_per_l(summary, price_per_l)
    cost_per_km = round(summary.fuelCostEur / summary.distanceKm, 3) if summary.distanceKm >= 1 else 0.0

    projected_yearly = projected_monthly = None
    if price is not None and summary.avgConsumptionL100km > 0:
        projected_yearly = round(summary.avgConsumptionL100km / 100.0 * annual_km * price, 2)
        projected_monthly = round(projected_yearly / 12, 2)

    idle_waste = 0.0
    if price is not None:
        idle_waste = round(summary.idleSeconds / 3600.0 * _idle_rate_lh(df) * price, 2)
    harsh_waste = round(scores.harshEvents * _HARSH_WASTE_L * (price or 0.0), 2)
    potential = round(idle_waste + harsh_waste, 2)

    return Economy(
        pricePerLEur=price,
        costPerKm=cost_per_km,
        assumedAnnualKm=annual_km,
        projectedMonthlyEur=projected_monthly,
        projectedYearlyEur=projected_yearly,
        idleWasteEur=idle_waste,
        potentialSavingsEur=potential,
    )
```

- [ ] **Step 5: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_economy.py -q`
Expected: PASS (4).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/models.py analysis/app/economy.py analysis/tests/test_economy.py
git commit -m "feat(analysis): economy — price/L, cost/km, projections, idle waste, potential savings"
```

---

## Task A2: Efficiency curve + sweet spot

**Files:** Modify `analysis/app/economy.py`, `analysis/tests/test_economy.py`

- [ ] **Step 1: Add failing tests** — append to `analysis/tests/test_economy.py`

```python
def _df_speed_consumption(pairs):
    # pairs: list of (t, speed_kmh, l100km) -> build Vehicle speed + Calculated instant fuel consumption rows
    rows = []
    for (t, sp, c) in pairs:
        rows += [(float(t), "Vehicle speed", float(sp)), (float(t), "Calculated instant fuel consumption", float(c))]
    return pd.DataFrame([{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows])


def test_efficiency_curve_and_sweet_spot():
    # lots of samples: cheap at 90 km/h, dear at 30
    pairs = [(t, 30, 9.0) for t in range(0, 10)] + [(t + 100, 90, 5.0) for t in range(0, 10)]
    curve, sweet = economy.efficiency_curve(_df_speed_consumption(pairs))
    assert len(curve) >= 2
    speeds = [round(p.speedKmh) for p in curve]
    assert 35 in speeds and 95 in speeds           # 10 km/h bins, center-labelled
    assert sweet is not None and 85 <= sweet <= 100  # the 90 km/h band is cheapest


def test_efficiency_curve_empty_without_signals():
    import pandas as pd
    df = pd.DataFrame({"t": [0.0], "pid": ["Engine RPM"], "value": [800.0], "unit": [""], "lat": [None], "lon": [None]})
    curve, sweet = economy.efficiency_curve(df)
    assert curve == [] and sweet is None
```

- [ ] **Step 2: Run, watch fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_economy.py -q`
Expected: FAIL — `AttributeError: module 'app.economy' has no attribute 'efficiency_curve'`.

- [ ] **Step 3: Add to `analysis/app/economy.py`** (imports `numpy as np` at the top, and `EfficiencyPoint` from models)

At the top of the file, ensure these imports exist:
```python
import numpy as np
from app.models import Economy, EfficiencyPoint, Scores, Summary
```
Add these constants near the others:
```python
_BIN_KMH = 10
_MIN_SPEED_KMH = 5
_MAX_L100 = 40.0
_MIN_BIN_SAMPLES = 5
```
Add the function:
```python
def efficiency_curve(df: pd.DataFrame) -> tuple[list[EfficiencyPoint], float | None]:
    """Speed-vs-consumption: bin moving samples by speed, average instant
    consumption per bin; the cheapest sufficiently-sampled bin is the sweet spot."""
    src = metrics.speed_source(df)
    if src is None:
        return [], None
    grid = metrics.resample_1hz(df, [src, "Calculated instant fuel consumption", "Engine fuel rate"])
    g = grid.dropna(subset=[src])
    g = g[g[src] >= _MIN_SPEED_KMH].copy()
    if g.empty:
        return [], None
    # prefer the logged instant consumption; else derive L/100km from fuel rate / speed
    cons = g["Calculated instant fuel consumption"]
    derived = g["Engine fuel rate"] / g[src] * 100.0
    g["c"] = cons.where(cons.notna(), derived)
    g = g.dropna(subset=["c"])
    g = g[(g["c"] > 0) & (g["c"] < _MAX_L100)]
    if g.empty:
        return [], None
    g["bin"] = (g[src] // _BIN_KMH * _BIN_KMH).astype(int)
    means = g.groupby("bin")["c"].mean()
    counts = g.groupby("bin")["c"].count()
    curve = [EfficiencyPoint(speedKmh=float(b + _BIN_KMH / 2), l100km=round(float(v), 1))
             for b, v in means.items()]
    eligible = means[counts >= _MIN_BIN_SAMPLES]
    sweet = float(int(eligible.idxmin()) + _BIN_KMH / 2) if not eligible.empty else None
    return curve, sweet
```

- [ ] **Step 4: Wire the curve into `build_economy`** — in `build_economy`, just before the `return Economy(...)`, add:
```python
    curve, sweet = efficiency_curve(df)
```
and add these two arguments to the `Economy(...)` constructor:
```python
        sweetSpotKmh=sweet,
        efficiencyCurve=curve,
```

- [ ] **Step 5: Run, watch pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_economy.py -q`
Expected: PASS (6).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/economy.py analysis/tests/test_economy.py
git commit -m "feat(analysis): efficiency curve + sweet-spot speed"
```

---

## Task A3: Tips depth — € impact + sweet-spot tip

**Files:** Modify `analysis/app/tips.py`, `analysis/tests/test_tips.py`

- [ ] **Step 1: Add failing tests** — append to `analysis/tests/test_tips.py`

```python
from app.models import Economy


def test_idle_tip_carries_eur_impact():
    eco = Economy(idleWasteEur=0.45)
    out = tips.build_tips([], _scores(idlePct=20.0), Health(), Summary(), eco)
    idle = next(t for t in out if t.id == "reduce_idle")
    assert idle.eurImpact == 0.45
    assert "0.45" in idle.detail


def test_sweet_spot_tip_when_far_from_optimal():
    eco = Economy(sweetSpotKmh=90.0)
    out = tips.build_tips([], _scores(), Health(), Summary(avgSpeedKmh=45.0), eco)
    assert any(t.id == "sweet_spot" and "90" in t.detail for t in out)


def test_tips_work_without_economy_argument():
    # backward compatible: economy is optional
    out = tips.build_tips([], _scores(idlePct=20.0), Health(), Summary())
    assert any(t.id == "reduce_idle" for t in out)
```

- [ ] **Step 2: Run, watch fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_tips.py -q`
Expected: FAIL — `build_tips()` takes 4 args / no `sweet_spot` tip.

- [ ] **Step 3: Replace `analysis/app/tips.py`**

```python
from app.models import Economy, Event, Health, Scores, Summary, Tip

_IDLE_PCT_WARN = 10.0
_RPM_BAND_LOW = 50.0
_SWEET_SPOT_GAP_KMH = 15.0


def build_tips(events: list[Event], scores: Scores, health: Health, summary: Summary,
               economy: Economy | None = None) -> list[Tip]:
    """Evidence-cited tips; actionable ones carry a € impact from `economy`.
    The full economy figures live in app/economy.py — this just narrates them."""
    eco = economy or Economy()
    tips: list[Tip] = []
    idle_n = sum(1 for e in events if e.type == "idle")
    coasting_n = sum(1 for e in events if e.type == "coasting")

    if scores.idlePct >= _IDLE_PCT_WARN:
        waste = f" (≈ €{eco.idleWasteEur} of fuel)" if eco.idleWasteEur > 0 else ""
        tips.append(Tip(id="reduce_idle", severity="warn", title="Cut idling",
                        eurImpact=eco.idleWasteEur or None,
                        detail=f"You idled {scores.idlePct}% of the drive ({idle_n} stops){waste}. "
                               f"Switching off during long stops saves fuel."))
    if scores.harshEvents > 0:
        tips.append(Tip(id="smoother", severity="warn", title="Smoother inputs",
                        detail=f"{scores.harshEvents} harsh accel/brake events. Anticipating "
                               f"earlier saves fuel and brakes."))
    if scores.rpmBandPct < _RPM_BAND_LOW:
        tips.append(Tip(id="short_shift", severity="info", title="Short-shift",
                        detail=f"Only {scores.rpmBandPct}% of the time in the efficient RPM band. "
                               f"Shifting up earlier keeps revs low."))
    if (economy and economy.sweetSpotKmh is not None
            and abs(summary.avgSpeedKmh - economy.sweetSpotKmh) >= _SWEET_SPOT_GAP_KMH):
        tips.append(Tip(id="sweet_spot", severity="info", title="Find the sweet spot",
                        detail=f"This drive was most efficient around {round(economy.sweetSpotKmh)} km/h. "
                               f"Cruising there when you can keeps consumption down."))
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

- [ ] **Step 4: Run the tips suite, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_tips.py -q`
Expected: PASS (8 — the 5 Phase-3 tests still pass since `economy` is optional, plus the 3 new).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/tips.py analysis/tests/test_tips.py
git commit -m "feat(analysis): tips carry € impact and a sweet-spot tip"
```

---

## Task A4: Wire economy into the orchestrator

**Files:** Modify `analysis/app/analysis.py`, `analysis/tests/test_analysis.py`

- [ ] **Step 1: Add assertions to `analysis/tests/test_analysis.py`** (append inside `test_build_drive_analysis_fills_summary`, after the Phase 3 asserts)

```python
    # Phase 4: economy is built from the drive. The synthetic fixture logs Fuel used
    # (0.25 L) + Fuel used price (0.40 EUR), so a real price/L (1.6) appears only once wired.
    assert result.economy.pricePerLEur is not None
    assert isinstance(result.economy.efficiencyCurve, list)
```

- [ ] **Step 2: Run, watch fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analysis.py -q`
Expected: FAIL — `result.economy.pricePerLEur` is `None` (the orchestrator still returns the default `Economy()`, not one built from the drive).

- [ ] **Step 3: Modify `analysis/app/analysis.py`**

(a) Add the import next to the others:
```python
from app import economy as economy_mod
```

(b) After `health_obj = health_mod.build_health(df)` (and after the `summary` local is built), add:
```python
    economy_obj = economy_mod.build_economy(df, summary, score_obj, detected, price_per_l)
```

(c) In the `DriveAnalysis(...)` constructor, change the `tips=...` argument to pass economy, and add the `economy` field. The relevant args read:
```python
        tips=tips_mod.build_tips(detected, score_obj, health_obj, summary, economy_obj),
        economy=economy_obj,
```

- [ ] **Step 4: Run the full analysis suite, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/analysis.py analysis/tests/test_analysis.py
git commit -m "feat(analysis): orchestrator builds economy and feeds it to tips"
```

---

## Task A5: Verify economy on the real drive (controller-style sanity, optional but recommended)

**Files:** none (verification)

- [ ] **Step 1: Run the pipeline on the real file and check the money numbers**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive/analysis
.venv/bin/python -c "
from app.parsing import parse_vertical
from app.analysis import build_drive_analysis
e = build_drive_analysis(parse_vertical(open('../data/vertical_layout (1).csv','rb').read()),'vertical_layout',None).economy
print('price/L', e.pricePerLEur, '| cost/km', e.costPerKm, '| yearly', e.projectedYearlyEur, '| monthly', e.projectedMonthlyEur)
print('idle waste', e.idleWasteEur, '| potential savings', e.potentialSavingsEur, '| sweet spot', e.sweetSpotKmh)
print('curve points', len(e.efficiencyCurve))
"
```
Expected: price/L ≈ **1.61**, cost/km ≈ **0.10**, yearly ≈ **1500** (€/yr at 15k km), idle waste ≈ **0.14**, sweet spot **~90–95 km/h**, curve non-empty (~15 points).

---

# Part B — Frontend: economy card + sweet-spot chart + € tips

## Task B1: Types

**Files:** Modify `frontend/src/types.ts`

- [ ] **Step 1: Add to `frontend/src/types.ts`**

```ts
export interface EfficiencyPoint { speedKmh: number; l100km: number }
export interface Economy {
  pricePerLEur: number | null;
  costPerKm: number;
  assumedAnnualKm: number;
  projectedMonthlyEur: number | null;
  projectedYearlyEur: number | null;
  idleWasteEur: number;
  potentialSavingsEur: number;
  sweetSpotKmh: number | null;
  efficiencyCurve: EfficiencyPoint[];
}
```
Add `eurImpact` to the existing `Tip` interface:
```ts
  eurImpact: number | null;
```
Add to the `DriveAnalysis` interface (after `tips`):
```ts
  economy: Economy;
```

- [ ] **Step 2: Confirm the build** — the `App.test.tsx` stub now needs `economy` and the existing tip stub needs `eurImpact`. Add to the stub: an `economy` object and `eurImpact: null` on the existing tip (do this minimally to keep the build green; the full stub values land in B4).

Run: `cd frontend && npm run build 2>&1 | tail -3 && ls dist/index.html` — builds clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/types.ts frontend/src/App.test.tsx
git commit -m "feat(frontend): add Economy/EfficiencyPoint types + Tip.eurImpact"
```

---

## Task B2: EconomyCard

**Files:** Create `frontend/src/components/EconomyCard.tsx` (+ test)

- [ ] **Step 1: Write the FAILING test** — `frontend/src/components/EconomyCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EconomyCard from './EconomyCard';
import type { Economy } from '../types';

const economy: Economy = {
  pricePerLEur: 1.61, costPerKm: 0.1, assumedAnnualKm: 15000,
  projectedMonthlyEur: 126, projectedYearlyEur: 1511, idleWasteEur: 0.14,
  potentialSavingsEur: 0.2, sweetSpotKmh: 90, efficiencyCurve: [],
};

describe('EconomyCard', () => {
  it('shows cost per km, the projection with its assumption, and potential savings', () => {
    render(<EconomyCard economy={economy} />);
    expect(screen.getByText(/€0\.10\s*\/\s*km/)).toBeInTheDocument();
    expect(screen.getByText(/€1511\s*\/\s*year/)).toBeInTheDocument();
    expect(screen.getByText(/15,000 km\/yr/)).toBeInTheDocument();   // assumption labelled
    expect(screen.getByText(/€0\.20/)).toBeInTheDocument();          // potential savings
  });
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- EconomyCard`
Expected: FAIL — no `EconomyCard`.

- [ ] **Step 3: Create `frontend/src/components/EconomyCard.tsx`**

```tsx
import type { Economy } from '../types';

interface Props {
  economy: Economy;
}

export default function EconomyCard({ economy }: Props) {
  const e = economy;
  const annual = e.assumedAnnualKm.toLocaleString();
  return (
    <section style={{ background: '#ecfdf5', borderRadius: 8, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Economy</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: '#71717a' }}>Cost</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>€{e.costPerKm.toFixed(2)} / km</div>
          {e.pricePerLEur != null && <div style={{ fontSize: 12, color: '#71717a' }}>at €{e.pricePerLEur}/L</div>}
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#71717a' }}>Projected</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>
            {e.projectedYearlyEur != null ? `€${e.projectedYearlyEur} / year` : '—'}
          </div>
          <div style={{ fontSize: 12, color: '#71717a' }}>
            {e.projectedMonthlyEur != null ? `€${e.projectedMonthlyEur}/mo · ` : ''}assumes {annual} km/yr
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#71717a' }}>Could save</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>€{e.potentialSavingsEur.toFixed(2)}</div>
          <div style={{ fontSize: 12, color: '#71717a' }}>this drive, applying the tips</div>
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- EconomyCard`
Expected: PASS (1).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/EconomyCard.tsx frontend/src/components/EconomyCard.test.tsx
git commit -m "feat(frontend): EconomyCard (cost/km, projection, savings)"
```

---

## Task B3: SweetSpotChart

**Files:** Create `frontend/src/components/SweetSpotChart.tsx` (+ test)

- [ ] **Step 1: Write the FAILING test** — `frontend/src/components/SweetSpotChart.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ScatterChart: ({ children }: { children: React.ReactNode }) => <div data-testid="scatter">{children}</div>,
  Scatter: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
  CartesianGrid: () => null, ReferenceLine: () => <div data-testid="refline" />,
}));

import SweetSpotChart from './SweetSpotChart';
import type { EfficiencyPoint } from '../types';

const curve: EfficiencyPoint[] = [{ speedKmh: 35, l100km: 9 }, { speedKmh: 95, l100km: 5 }];

describe('SweetSpotChart', () => {
  it('renders a scatter with a sweet-spot reference line and label', () => {
    render(<SweetSpotChart curve={curve} sweetSpotKmh={90} />);
    expect(screen.getByText(/sweet spot/i)).toBeInTheDocument();
    expect(screen.getByText(/90 km\/h/)).toBeInTheDocument();
    expect(screen.getByTestId('scatter')).toBeInTheDocument();
    expect(screen.getByTestId('refline')).toBeInTheDocument();
  });

  it('renders nothing when the curve is empty', () => {
    const { container } = render(<SweetSpotChart curve={[]} sweetSpotKmh={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- SweetSpotChart`
Expected: FAIL — no `SweetSpotChart`.

- [ ] **Step 3: Create `frontend/src/components/SweetSpotChart.tsx`**

```tsx
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EfficiencyPoint } from '../types';

interface Props {
  curve: EfficiencyPoint[];
  sweetSpotKmh: number | null;
}

export default function SweetSpotChart({ curve, sweetSpotKmh }: Props) {
  if (curve.length === 0) {
    return null;
  }
  return (
    <section>
      <h3>Efficiency by speed
        {sweetSpotKmh != null && (
          <small style={{ color: '#15803d' }}> · sweet spot {Math.round(sweetSpotKmh)} km/h</small>
        )}
      </h3>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="speedKmh" name="speed" unit=" km/h" />
            <YAxis type="number" dataKey="l100km" name="consumption" unit=" L/100km" width={70} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            {sweetSpotKmh != null && <ReferenceLine x={sweetSpotKmh} stroke="#15803d" />}
            <Scatter data={curve} fill="#2563eb" isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- SweetSpotChart`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/SweetSpotChart.tsx frontend/src/components/SweetSpotChart.test.tsx
git commit -m "feat(frontend): SweetSpotChart (speed-vs-consumption + sweet-spot marker)"
```

---

## Task B4: TipsCard € + wire EconomyCard/SweetSpotChart into App

**Files:** Modify `frontend/src/components/TipsCard.tsx`, `frontend/src/components/TipsCard.test.tsx`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

- [ ] **Step 1: Add a € assertion to `TipsCard.test.tsx`** — append a test:

```tsx
it('shows the € impact when a tip has one', () => {
  render(<TipsCard tips={[{ id: 'reduce_idle', severity: 'warn', title: 'Cut idling', detail: 'You idled.', eurImpact: 0.45 }]} />);
  expect(screen.getByText(/€0\.45/)).toBeInTheDocument();
});
```
(The existing two tests pass `Tip` objects without `eurImpact`; add `eurImpact: null` to those existing stub tips so they typecheck.)

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- TipsCard`
Expected: FAIL — no € shown.

- [ ] **Step 3: Modify `frontend/src/components/TipsCard.tsx`** — show the impact. Change the tip body to:
```tsx
          <div key={t.id} style={{ background: BG[t.severity] ?? '#f4f4f5', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600 }}>
              <span>{ICON[t.severity] ?? '•'} {t.title}</span>
              {t.eurImpact != null && t.eurImpact > 0 && (
                <span style={{ float: 'right', color: '#b45309' }}>≈ €{t.eurImpact.toFixed(2)}</span>
              )}
            </div>
            <div style={{ color: '#3f3f46' }}>{t.detail}</div>
          </div>
```
(Keep the rest of the component unchanged.)

- [ ] **Step 4: Wire the new cards into `frontend/src/App.tsx`** — add imports:
```tsx
import EconomyCard from './components/EconomyCard';
import SweetSpotChart from './components/SweetSpotChart';
```
In the analysis grid, place `EconomyCard` right after `TipsCard`, and `SweetSpotChart` right after `GraphsPanel`:
```tsx
          <TipsCard tips={analysis.tips} />
          <EconomyCard economy={analysis.economy} />
          ...
          <GraphsPanel signals={analysis.signals} />
          <SweetSpotChart curve={analysis.economy.efficiencyCurve} sweetSpotKmh={analysis.economy.sweetSpotKmh} />
```

- [ ] **Step 5: Update `frontend/src/App.test.tsx`** — add `ScatterChart`/`Scatter`/`ReferenceLine` to the recharts mock and set the stub's `economy` + a tip `eurImpact`:

(a) Add to the `recharts` mock object:
```tsx
  ScatterChart: ({ children }: { children: React.ReactNode }) => <div data-testid="scatter">{children}</div>,
  Scatter: () => null, ReferenceLine: () => null,
```
(b) Set the stub `economy` (replace the minimal one from B1) and the tip:
```tsx
  tips: [{ id: 'reduce_idle', severity: 'warn', title: 'Cut idling', detail: 'You idled 13%.', eurImpact: 0.14 }],
  economy: { pricePerLEur: 1.61, costPerKm: 0.1, assumedAnnualKm: 15000, projectedMonthlyEur: 126,
             projectedYearlyEur: 1511, idleWasteEur: 0.14, potentialSavingsEur: 0.2, sweetSpotKmh: 90,
             efficiencyCurve: [{ speedKmh: 95, l100km: 5 }] },
```
(c) Add assertions after the existing ones:
```tsx
    expect(screen.getByText('Economy')).toBeInTheDocument();
    expect(screen.getByText(/€1511 \/ year/)).toBeInTheDocument();
    expect(screen.getByText(/Efficiency by speed/)).toBeInTheDocument();
```

- [ ] **Step 6: Run the whole frontend suite + build, watch pass**

Run: `cd frontend && npm test` then `cd frontend && rm -rf dist && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: all tests pass; build clean.

- [ ] **Step 7: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/TipsCard.tsx frontend/src/components/TipsCard.test.tsx frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): € on tips + EconomyCard and SweetSpotChart in the dashboard"
```

---

# Part C — Integration

## Task C1: Full-stack round-trip

**Files:** none (verification)

- [ ] **Step 1: Bring the stack up**

```bash
cd /Users/karlo/Developer/hrva-drive
make run
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```
Expected: analysis + ingestion `healthy`, frontend up.

- [ ] **Step 2: Confirm the economy fields through the chain**

```bash
cd /Users/karlo/Developer/hrva-drive
curl -s --retry 60 --retry-all-errors --retry-connrefused --retry-delay 1 \
  -F "file=@data/vertical_layout (1).csv" -F "format=vertical_layout" \
  http://localhost:8090/api/v1/drives:analyze \
  | python3 -c "import sys,json; e=json.load(sys.stdin)['economy']; print('price/L', e['pricePerLEur'], 'cost/km', e['costPerKm'], 'yearly', e['projectedYearlyEur']); print('idleWaste', e['idleWasteEur'], 'savings', e['potentialSavingsEur'], 'sweetSpot', e['sweetSpotKmh'], 'curve', len(e['efficiencyCurve']))"
```
Expected: price/L ≈ **1.61**, cost/km ≈ **0.10**, yearly ≈ **1500**, sweet spot **~90–95**, curve ~15 points.

- [ ] **Step 3: Eyeball the dashboard**

Open http://localhost:8090, analyze the real drive. Expected: an **Economy** card (cost/km, yearly projection with the "assumes 15,000 km/yr" label, potential savings), a € amount on the idle tip, and an **Efficiency by speed** scatter with the sweet-spot line.

- [ ] **Step 4: Tear down**

```bash
cd /Users/karlo/Developer/hrva-drive && make stop
```

- [ ] **Step 5: Verification commit (optional)**

```bash
cd /Users/karlo/Developer/hrva-drive
git commit --allow-empty -m "test(phase-4): verified economy + sweet-spot end-to-end (€1.61/L, ~€0.10/km, ~90 km/h)"
```

---

## Phase 4 acceptance

- `make test` — analysis, ingestion, frontend all green (incl. `test_economy`, updated `test_tips`).
- `make run` + uploading the real drive shows the EconomyCard, € on actionable tips, and the sweet-spot scatter; the API returns a populated `economy` with the verified numbers.
- `schemaVersion` is still `"1"` (economy is additive).
- Projections are explicitly labelled as an assumption (15,000 km/yr), not a measurement. Drives with no logged cost fall back to the `pricePerL` param (or show `—`).

## Self-review notes (done while writing)

- **Spec coverage (design §8 Phase 4 + §4 items 5–6):** full eco-tip ruleset w/ € (A3/B4), what-if savings (A1 `potentialSavingsEur`, surfaced B2), cost projections (A1/B2), efficiency sweet-spot (A2/B3). Phase 5 items excluded.
- **Additive contract:** `economy` field + `Tip.eurImpact` are optional/defaulted; `schemaVersion` unchanged; frontend types extend additively. `build_tips`'s new `economy` arg is OPTIONAL → Phase 3 callers/tests unaffected.
- **Consistency:** `build_economy(df, summary, scores, events, price_per_l)` (A1) + `efficiency_curve(df)` (A2) called by the orchestrator (A4); `build_tips(..., economy)` (A3) called with the economy object (A4). Frontend `Economy`/`EfficiencyPoint` mirror the Pydantic shapes; `eurImpact` mirrored. App test mock gains `ScatterChart`/`Scatter`/`ReferenceLine`.
- **Grounded:** all numbers (price 1.61, cost/km 0.10, sweet spot ~90, idle rate 0.885) verified against the real drive before writing.
- **No placeholders:** every code/command step is complete and runnable.
```
