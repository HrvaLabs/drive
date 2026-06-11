# Phase 2 — Analysis Depth (Events · Scores · Health · Best-of) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the `DriveAnalysis` with the reserved Phase-2 fields — `events` (idle / harsh accel / harsh brake / high-RPM / coasting), `scores` (eco 0–100, driving style, RPM-band %, idle %, speed steadiness), `health` (warm-up, battery, fuel trim), and `bests` (max hp / boost / accel / speed / rpm) — and surface scores + best-of in the dashboard.

**Architecture:** Additive only. The analysis service gains four small, independently-tested modules (`events`, `scores`, `health`, `bests`); the orchestrator calls them and fills the new fields. The `DriveAnalysis` schema **stays `schemaVersion: "1"`** — the new fields are optional with defaults, so Phase 1 clients keep working. The frontend gains two read-only cards.

**Tech Stack:** Python 3.13 + pandas/numpy (analysis) · React 19 + TS + Vitest (frontend). No new dependencies.

**Scope:** **Phase 2 only** (design §8). Build events/scores/health/bests + light surfacing. Do **NOT** build: event pins on the map, the expert/debug mode, tips cards, the vehicle-identity card, or the full dual-audience dashboard — those are Phase 3. No `.brc`/horizontal formats, no economy projections (Phase 4/5).

**Builds on:** the committed Phase 1 pipeline. Read `docs/superpowers/specs/2026-06-05-hrva-drive-design.md` (§3 data model, §6 analysis definitions, §7 contract — note the reserved `events/scores/health/bests` shapes) and the Phase 1 plan's structure first. `app/metrics.py` already provides `series`, `speed_source`, `resample_1hz`, `gps_track`, `moving_idle_seconds`, `duration_seconds`. The pipeline was also **hardened for varied/wrong-ECU drives** (a 53-file batch): `series()` is **case-insensitive** (so `Engine Fuel Rate` resolves), the parser handles **no-GPS 4-column** exports, consumption is guarded for tiny distances, and `dataQuality.warnings` flags partial logs. Phase 2's lookups inherit all of this — run `analysis/.venv/bin/python scripts/batch_analyze.py` as a robustness gate.

---

## Prerequisites

Same as Phase 1: `analysis/.venv` (Python 3.13), JDK 25 via `JAVA_HOME="$(/usr/libexec/java_home -v 25)"`, Node 24. Use the **Makefile**: `make test` runs all suites; `make run` rebuilds + starts the stack. Commit locally per task, **no co-author trailer** (repo identity is `git@hrva.cc`).

**Real-drive ground truth** (sample `data/vertical_layout (1).csv`, used in the Task C1 integration check):
- RPM: max **3355**, **54%** of time in the 1500–2500 band, 538 samples > 3000.
- Acceleration: peak **0.265 g** / **−0.308 g** → with default 0.30 g / −0.35 g thresholds, **0 harsh accel and 0 harsh brake events** (a gentle drive — expected, not a bug).
- Coolant: 55 → **86 °C** (reaches the 85 °C warm-up target). Fuel trims present. Battery: one sample (14.2 V).
- Bests: maxHp **79.6**, peak boost **0.71 bar**, maxAccel **0.265 g**, topSpeed **146 km/h**, maxRpm **3355**.

**Second (richer) sample drive** `data/2026-06-05 23-20-43.csv` — 566k rows, 104 min city commute (odometer 43.9 km, avg 25 km/h, max 130, ~5.45 L/100km, 51 PIDs). Use it to confirm **harsh-event detection actually fires**: it has min accel **−0.364 g → exactly 1 `hard_brake`** event (still 0 hard accel). The first drive has none, so validate the harsh-event path against *this* file. (The current Phase 1 pipeline already parses it in <1 s and triangulates: avg 25.3 == dist/dur 25.3; GPS again inflated at 59.3 km, warning fires.) Both files are gitignored (local-only).

---

## File Structure

```
analysis/app/
├── models.py        # MODIFY: add Event, Scores, Health, Bests; add 4 optional fields to DriveAnalysis
├── events.py        # NEW: detect idle / hard_accel / hard_brake / high_rpm / coasting events
├── scores.py        # NEW: rpm-band %, idle %, speed steadiness, eco score, driving style
├── health.py        # NEW: warm-up seconds, battery verdict, fuel-trim verdict
├── bests.py         # NEW: max hp / boost / accel / speed / rpm
└── analysis.py      # MODIFY: orchestrator fills events/scores/health/bests
analysis/tests/
├── test_events.py   # NEW
├── test_scores.py   # NEW
├── test_health.py   # NEW (engine-health; distinct from the existing /health-endpoint test)
├── test_bests.py    # NEW
└── test_analysis.py # MODIFY: assert the new fields are populated

frontend/src/
├── types.ts                     # MODIFY: add Event, Scores, Health, Bests to DriveAnalysis
├── components/ScoresCard.tsx    # NEW (+ test)
├── components/BestsCard.tsx     # NEW (+ test)
├── App.tsx                      # MODIFY: render ScoresCard + BestsCard
└── App.test.tsx                 # MODIFY: assert scores/bests render
```

Each analysis module has one responsibility and is tested with small inline DataFrames pinned to known values.

---

# Part A — Analysis depth

## Task A1: Extend the model (Event / Scores / Health / Bests)

**Files:** Modify `analysis/app/models.py`; create `analysis/tests/test_models_phase2.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_models_phase2.py`

```python
from app.models import Bests, DriveAnalysis, Drive, Event, Health, Scores


def test_new_models_have_safe_defaults():
    assert Scores().eco == 0
    assert Scores().style == "normal"
    assert Health().batteryVerdict == "unknown"
    assert Bests().maxHp is None
    e = Event(type="idle", t=10.0)
    assert e.durationSeconds == 0.0


def test_drive_analysis_defaults_new_fields_and_stays_v1():
    da = DriveAnalysis(drive=Drive(source="vertical_layout"))
    assert da.schemaVersion == "1"
    assert da.events == []
    assert da.scores.eco == 0
    assert da.health.fuelTrimVerdict == "unknown"
    assert da.bests.topSpeedKmh is None
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_models_phase2.py -q`
Expected: FAIL — `ImportError: cannot import name 'Event'`.

- [ ] **Step 3: Add the models to `analysis/app/models.py`** (insert these classes *above* `class DriveAnalysis`, after `DataQuality`)

```python
class Event(BaseModel):
    type: str  # "idle" | "hard_accel" | "hard_brake" | "high_rpm" | "coasting"
    t: float
    lat: float | None = None
    lon: float | None = None
    value: float = 0.0  # peak/representative value (g, rpm, ...)
    durationSeconds: float = 0.0  # for span events (idle, high_rpm, coasting)


class Scores(BaseModel):
    eco: int = 0  # 0..100
    style: str = "normal"  # "eco" | "normal" | "spirited"
    rpmBandPct: float = 0.0
    idlePct: float = 0.0
    speedSteadiness: float = 0.0  # 0..100 (higher = steadier)
    harshEvents: int = 0


class Health(BaseModel):
    warmupSeconds: float | None = None
    batteryVerdict: str = "unknown"  # "healthy" | "ok" | "low" | "unknown"
    batteryVolts: float | None = None
    fuelTrimVerdict: str = "unknown"  # "normal" | "rich" | "lean" | "unknown"


class Bests(BaseModel):
    maxHp: float | None = None
    peakBoostBar: float | None = None
    maxAccelG: float | None = None
    topSpeedKmh: float | None = None
    maxRpm: float | None = None
```

Then add these four fields to `class DriveAnalysis` (after the `dataQuality` field):

```python
    events: list[Event] = Field(default_factory=list)
    scores: Scores = Field(default_factory=Scores)
    health: Health = Field(default_factory=Health)
    bests: Bests = Field(default_factory=Bests)
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_models_phase2.py -q`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/models.py analysis/tests/test_models_phase2.py
git commit -m "feat(analysis): add Event/Scores/Health/Bests models (additive, stays schema v1)"
```

---

## Task A2: Event detection

**Files:** Create `analysis/app/events.py`, `analysis/tests/test_events.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_events.py`

```python
import pandas as pd

from app import events


def _df(rows):
    # rows: list of (t, pid, value, lat, lon)
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": "", "lat": la, "lon": lo} for (t, p, v, la, lo) in rows]
    )


def test_idle_event_from_stopped_engine_on():
    rows = [(float(t), "Vehicle speed", 0.0, 45.0, 15.0) for t in range(0, 5)]
    rows += [(float(t), "Engine RPM", 800.0, 45.0, 15.0) for t in range(0, 5)]
    evts = events.detect_events(_df(rows))
    idle = [e for e in evts if e.type == "idle"]
    assert len(idle) == 1
    assert idle[0].durationSeconds >= 3.0


def test_hard_brake_event_from_acceleration():
    rows = [(0.0, "Vehicle acceleration", 0.05, 45.0, 15.0),
            (1.0, "Vehicle acceleration", -0.5, 45.0, 15.0),  # hard brake
            (2.0, "Vehicle acceleration", 0.1, 45.0, 15.0),
            (3.0, "Vehicle acceleration", 0.4, 45.0, 15.0)]   # hard accel
    evts = events.detect_events(_df(rows))
    assert any(e.type == "hard_brake" for e in evts)
    assert any(e.type == "hard_accel" for e in evts)


def test_high_rpm_event():
    rows = [(float(t), "Engine RPM", 3200.0, 45.0, 15.0) for t in range(0, 4)]
    rows += [(float(t), "Vehicle speed", 80.0, 45.0, 15.0) for t in range(0, 4)]
    evts = events.detect_events(_df(rows))
    assert any(e.type == "high_rpm" for e in evts)


def test_no_events_on_gentle_data():
    rows = [(float(t), "Vehicle speed", 50.0, 45.0, 15.0) for t in range(0, 5)]
    rows += [(float(t), "Engine RPM", 2000.0, 45.0, 15.0) for t in range(0, 5)]
    rows += [(float(t), "Vehicle acceleration", 0.1, 45.0, 15.0) for t in range(0, 5)]
    evts = events.detect_events(_df(rows))
    assert evts == []
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_events.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.events'`.

- [ ] **Step 3: Create `analysis/app/events.py`**

```python
import numpy as np
import pandas as pd

from app import metrics
from app.models import Event

# Thresholds (spec §6) — configurable defaults, NOT tuned to any one car.
_HARD_ACCEL_G = 0.30
_HARD_BRAKE_G = -0.35
_HIGH_RPM = 3000.0
_IDLE_SPEED_KMH = 1.0
_MIN_SPAN_S = 3.0  # ignore spans shorter than this


def _nearest_gps(track: pd.DataFrame, t: float) -> tuple[float | None, float | None]:
    if track.empty:
        return None, None
    i = (track["t"] - t).abs().idxmin()
    return float(track.loc[i, "lat"]), float(track.loc[i, "lon"])


def _spans(times: np.ndarray, mask: np.ndarray) -> list[tuple[float, float]]:
    """Contiguous runs of True in `mask`, returned as (start_t, end_t) pairs."""
    spans: list[tuple[float, float]] = []
    start: float | None = None
    prev = times[0] if len(times) else 0.0
    for t, m in zip(times, mask):
        if m and start is None:
            start = float(t)
        elif not m and start is not None:
            spans.append((start, float(prev)))
            start = None
        prev = t
    if start is not None:
        spans.append((start, float(prev)))
    return spans


def _idle_events(df: pd.DataFrame, track: pd.DataFrame) -> list[Event]:
    src = metrics.speed_source(df)
    if src is None:
        return []
    grid = metrics.resample_1hz(df, [src, "Engine RPM"])
    mask = (grid[src] < _IDLE_SPEED_KMH) & (grid["Engine RPM"] > 0)
    out = []
    for start, end in _spans(grid["t"].to_numpy(), mask.fillna(False).to_numpy()):
        if end - start >= _MIN_SPAN_S:
            lat, lon = _nearest_gps(track, start)
            out.append(Event(type="idle", t=start, lat=lat, lon=lon, durationSeconds=round(end - start, 1)))
    return out


def _harsh_events(df: pd.DataFrame, track: pd.DataFrame) -> list[Event]:
    accel = metrics.series(df, "Vehicle acceleration")
    if accel.empty:
        return []
    out = []
    prev_flagged = False
    for r in accel.itertuples():
        g = float(r.value)
        if g >= _HARD_ACCEL_G or g <= _HARD_BRAKE_G:
            if not prev_flagged:  # collapse consecutive samples into one event
                lat, lon = _nearest_gps(track, float(r.t))
                kind = "hard_accel" if g > 0 else "hard_brake"
                out.append(Event(type=kind, t=float(r.t), lat=lat, lon=lon, value=round(g, 3)))
            prev_flagged = True
        else:
            prev_flagged = False
    return out


def _high_rpm_events(df: pd.DataFrame, track: pd.DataFrame) -> list[Event]:
    rpm = metrics.series(df, "Engine RPM")
    if rpm.empty:
        return []
    grid = metrics.resample_1hz(df, ["Engine RPM"])
    mask = grid["Engine RPM"] > _HIGH_RPM
    out = []
    for start, end in _spans(grid["t"].to_numpy(), mask.fillna(False).to_numpy()):
        if end - start >= _MIN_SPAN_S:
            window = rpm[(rpm["t"] >= start) & (rpm["t"] <= end)]
            peak = float(window["value"].max()) if not window.empty else _HIGH_RPM
            lat, lon = _nearest_gps(track, start)
            out.append(Event(type="high_rpm", t=start, lat=lat, lon=lon,
                             value=round(peak, 0), durationSeconds=round(end - start, 1)))
    return out


def _coasting_events(df: pd.DataFrame, track: pd.DataFrame) -> list[Event]:
    rate_pid = "Engine fuel rate" if not metrics.series(df, "Engine fuel rate").empty else "Calculated instant fuel rate"
    src = metrics.speed_source(df)
    if metrics.series(df, rate_pid).empty or src is None:
        return []
    grid = metrics.resample_1hz(df, [rate_pid, "Engine RPM", src])
    mask = (grid[rate_pid] <= 0.05) & (grid["Engine RPM"] > 900) & (grid[src] >= _IDLE_SPEED_KMH)
    out = []
    for start, end in _spans(grid["t"].to_numpy(), mask.fillna(False).to_numpy()):
        if end - start >= _MIN_SPAN_S:
            lat, lon = _nearest_gps(track, start)
            out.append(Event(type="coasting", t=start, lat=lat, lon=lon, durationSeconds=round(end - start, 1)))
    return out


def detect_events(df: pd.DataFrame) -> list[Event]:
    track = metrics.gps_track(df)
    evts = (_idle_events(df, track) + _harsh_events(df, track)
            + _high_rpm_events(df, track) + _coasting_events(df, track))
    return sorted(evts, key=lambda e: e.t)
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_events.py -q`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/events.py analysis/tests/test_events.py
git commit -m "feat(analysis): event detection (idle, harsh accel/brake, high-rpm, coasting)"
```

---

## Task A3: Scores (eco / style / rpm-band / steadiness)

**Files:** Create `analysis/app/scores.py`, `analysis/tests/test_scores.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_scores.py`

```python
import pandas as pd

from app import scores
from app.models import Scores


def _df(rows):
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows]
    )


def test_rpm_band_pct():
    rows = [(0.0, "Engine RPM", 2000.0), (1.0, "Engine RPM", 2000.0),
            (2.0, "Engine RPM", 4000.0), (3.0, "Engine RPM", 2000.0)]
    # 1Hz grid t=0..3 -> [2000,2000,4000,2000] -> 3/4 in band
    assert scores.rpm_band_pct(_df(rows)) == 75.0


def test_steady_speed_scores_high():
    rows = [(float(t), "Vehicle speed", 60.0) for t in range(0, 6)]
    assert scores.speed_steadiness(_df(rows)) >= 95.0


def test_eco_and_style_are_bounded():
    rows = [(float(t), "Vehicle speed", 60.0) for t in range(0, 6)]
    rows += [(float(t), "Engine RPM", 2000.0) for t in range(0, 6)]
    s = scores.build_scores(_df(rows), harsh_events=0)
    assert isinstance(s, Scores)
    assert 0 <= s.eco <= 100
    assert s.style in {"eco", "normal", "spirited"}
    assert s.harshEvents == 0


def test_harsh_events_lower_the_eco_score():
    rows = [(float(t), "Vehicle speed", 60.0) for t in range(0, 6)]
    rows += [(float(t), "Engine RPM", 2000.0) for t in range(0, 6)]
    df = _df(rows)
    assert scores.build_scores(df, harsh_events=10).eco < scores.build_scores(df, harsh_events=0).eco
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_scores.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.scores'`.

- [ ] **Step 3: Create `analysis/app/scores.py`**

```python
from app import metrics
from app.models import Scores

_RPM_BAND = (1500.0, 2500.0)


def rpm_band_pct(df) -> float:
    grid = metrics.resample_1hz(df, ["Engine RPM"])["Engine RPM"].dropna()
    if grid.empty:
        return 0.0
    in_band = ((grid >= _RPM_BAND[0]) & (grid <= _RPM_BAND[1])).sum()
    return round(100.0 * in_band / len(grid), 1)


def idle_pct(df) -> float:
    mv = metrics.moving_idle_seconds(df)
    dur = metrics.duration_seconds(df)
    return round(100.0 * mv["idleSeconds"] / dur, 1) if dur > 0 else 0.0


def speed_steadiness(df) -> float:
    """100 − coefficient of variation of the moving speed, clamped to [0, 100]."""
    src = metrics.speed_source(df)
    if src is None:
        return 0.0
    grid = metrics.resample_1hz(df, [src])[src].dropna()
    moving = grid[grid >= 1.0]
    if len(moving) < 2 or moving.mean() == 0:
        return 0.0
    cov = float(moving.std() / moving.mean())
    return round(max(0.0, min(100.0, 100.0 * (1.0 - cov))), 1)


def eco_score(df, harsh_events: int) -> int:
    """Weighted blend (spec §6) — weights live here, in one place."""
    band = rpm_band_pct(df)
    steady = speed_steadiness(df)
    idle = idle_pct(df)
    harsh_penalty = min(30, harsh_events * 3)
    raw = 0.4 * band + 0.3 * steady + 0.3 * (100.0 - idle) - harsh_penalty
    return int(max(0, min(100, round(raw))))


def driving_style(eco: int) -> str:
    if eco >= 70:
        return "eco"
    if eco >= 45:
        return "normal"
    return "spirited"


def build_scores(df, harsh_events: int) -> Scores:
    eco = eco_score(df, harsh_events)
    return Scores(
        eco=eco,
        style=driving_style(eco),
        rpmBandPct=rpm_band_pct(df),
        idlePct=idle_pct(df),
        speedSteadiness=speed_steadiness(df),
        harshEvents=harsh_events,
    )
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_scores.py -q`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/scores.py analysis/tests/test_scores.py
git commit -m "feat(analysis): eco score, driving style, rpm-band/idle/steadiness"
```

---

## Task A4: Engine health

**Files:** Create `analysis/app/health.py`, `analysis/tests/test_health_metrics.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_health_metrics.py`

```python
import pandas as pd

from app import health


def _df(rows):
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows]
    )


def test_warmup_seconds_time_to_85c():
    rows = [(0.0, "Engine coolant temperature", 50.0),
            (30.0, "Engine coolant temperature", 70.0),
            (60.0, "Engine coolant temperature", 86.0)]
    assert health.build_health(_df(rows)).warmupSeconds == 60.0


def test_battery_verdict_from_voltage():
    h = health.build_health(_df([(0.0, "OBD Module Voltage", 14.2)]))
    assert h.batteryVerdict == "healthy"
    assert h.batteryVolts == 14.2
    # wrong-ECU alias: some profiles name it "Control module voltage"
    h2 = health.build_health(_df([(0.0, "Control module voltage", 12.1)]))
    assert h2.batteryVerdict == "low"


def test_fuel_trim_verdict_normal():
    rows = [(0.0, "Short term fuel % trim - Bank 1", 2.0),
            (0.0, "Long term fuel % trim - Bank 1", 3.0)]
    assert health.build_health(_df(rows)).fuelTrimVerdict == "normal"


def test_missing_signals_are_unknown():
    h = health.build_health(_df([(0.0, "Vehicle speed", 50.0)]))
    assert h.warmupSeconds is None
    assert h.batteryVerdict == "unknown"
    assert h.fuelTrimVerdict == "unknown"
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_health_metrics.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.health'`.

- [ ] **Step 3: Create `analysis/app/health.py`**

```python
from app import metrics
from app.models import Health

_WARMUP_TARGET_C = 85.0
_BATTERY_HEALTHY_V = 13.0
_BATTERY_LOW_V = 12.2
_TRIM_LIMIT_PCT = 10.0


def warmup_seconds(df) -> float | None:
    coolant = metrics.series(df, "Engine coolant temperature")
    if coolant.empty:
        return None
    warm = coolant[coolant["value"] >= _WARMUP_TARGET_C]
    if warm.empty:
        return None
    return round(float(warm["t"].iloc[0] - df["t"].min()), 1)


def _battery(df) -> tuple[str, float | None]:
    # Different ECU profiles name this differently (verified: the diesel export
    # uses "Control module voltage"). series() is case-insensitive, but these are
    # genuinely different words, so try both.
    v = metrics.series(df, "OBD Module Voltage")
    if v.empty:
        v = metrics.series(df, "Control module voltage")
    if v.empty:
        return "unknown", None
    volts = round(float(v["value"].iloc[-1]), 1)
    if volts >= _BATTERY_HEALTHY_V:
        verdict = "healthy"
    elif volts < _BATTERY_LOW_V:
        verdict = "low"
    else:
        verdict = "ok"
    return verdict, volts


def _fuel_trim(df) -> str:
    st = metrics.series(df, "Short term fuel % trim - Bank 1")
    lt = metrics.series(df, "Long term fuel % trim - Bank 1")
    if st.empty and lt.empty:
        return "unknown"
    total = (float(st["value"].mean()) if not st.empty else 0.0) + (float(lt["value"].mean()) if not lt.empty else 0.0)
    if total > _TRIM_LIMIT_PCT:
        return "lean"
    if total < -_TRIM_LIMIT_PCT:
        return "rich"
    return "normal"


def build_health(df) -> Health:
    verdict, volts = _battery(df)
    return Health(
        warmupSeconds=warmup_seconds(df),
        batteryVerdict=verdict,
        batteryVolts=volts,
        fuelTrimVerdict=_fuel_trim(df),
    )
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_health_metrics.py -q`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/health.py analysis/tests/test_health_metrics.py
git commit -m "feat(analysis): engine health — warm-up, battery, fuel-trim verdicts"
```

---

## Task A5: Best-of-the-drive

**Files:** Create `analysis/app/bests.py`, `analysis/tests/test_bests.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_bests.py`

```python
import pandas as pd

from app import bests


def _df(rows):
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows]
    )


def test_bests_pick_the_peaks():
    rows = [
        (0.0, "Instant engine power (based on fuel consumption)", 40.0),
        (1.0, "Instant engine power (based on fuel consumption)", 79.6),
        (0.0, "Vehicle speed", 100.0), (1.0, "Vehicle speed", 146.0),
        (0.0, "Engine RPM", 2000.0), (1.0, "Engine RPM", 3355.0),
        (0.0, "Calculated boost", 0.71), (0.0, "Vehicle acceleration", 0.2653),
    ]
    b = bests.build_bests(_df(rows))
    assert b.maxHp == 79.6
    assert b.topSpeedKmh == 146.0
    assert b.maxRpm == 3355.0
    assert b.peakBoostBar == 0.71
    assert b.maxAccelG == 0.27  # 0.2653 rounded to 2dp


def test_absent_signals_are_none():
    b = bests.build_bests(_df([(0.0, "Vehicle speed", 50.0)]))
    assert b.topSpeedKmh == 50.0
    assert b.maxHp is None
    assert b.peakBoostBar is None
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_bests.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.bests'`.

- [ ] **Step 3: Create `analysis/app/bests.py`**

```python
from app import metrics
from app.models import Bests


def _max(df, pid: str) -> float | None:
    s = metrics.series(df, pid)
    return round(float(s["value"].max()), 2) if not s.empty else None


def build_bests(df) -> Bests:
    return Bests(
        maxHp=_max(df, "Instant engine power (based on fuel consumption)"),
        peakBoostBar=_max(df, "Calculated boost"),
        maxAccelG=_max(df, "Vehicle acceleration"),
        topSpeedKmh=_max(df, "Vehicle speed"),
        maxRpm=_max(df, "Engine RPM"),
    )
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_bests.py -q`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/bests.py analysis/tests/test_bests.py
git commit -m "feat(analysis): best-of-the-drive (max hp/boost/accel/speed/rpm)"
```

---

## Task A6: Wire events/scores/health/bests into the orchestrator

**Files:** Modify `analysis/app/analysis.py`, `analysis/tests/test_analysis.py`

- [ ] **Step 1: Add assertions to `analysis/tests/test_analysis.py`** (append inside the existing test, after the `dataQuality` asserts)

```python
    # Phase 2 fields are populated
    assert result.bests.topSpeedKmh == 72.0
    assert result.bests.maxRpm == 3000.0
    assert 0 <= result.scores.eco <= 100
    assert result.scores.style in {"eco", "normal", "spirited"}
    assert isinstance(result.events, list)
    assert result.health.batteryVerdict == "unknown"  # synthetic has no voltage
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analysis.py -q`
Expected: FAIL — `bests.topSpeedKmh` is `None` (orchestrator doesn't fill it yet).

- [ ] **Step 3: Modify `analysis/app/analysis.py`** — add imports and fill the fields

Add to the imports at the top:
```python
from app import bests as bests_mod
from app import events as events_mod
from app import health as health_mod
from app import metrics, routes, scores as scores_mod
```
(Replace the existing `from app import metrics, routes` line with the grouped imports above.)

Inside `build_drive_analysis`, after the `route`/`series` lines and before the `return`, add:
```python
    detected = events_mod.detect_events(df)
    harsh = sum(1 for e in detected if e.type in ("hard_accel", "hard_brake"))
```

Then add the four fields to the `DriveAnalysis(...)` constructor (after `dataQuality=...`):
```python
        events=detected,
        scores=scores_mod.build_scores(df, harsh),
        health=health_mod.build_health(df),
        bests=bests_mod.build_bests(df),
```

- [ ] **Step 4: Run the full analysis suite, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/analysis.py analysis/tests/test_analysis.py
git commit -m "feat(analysis): orchestrator fills events, scores, health, bests"
```

---

## Task A7: Verify on the real drive (container)

**Files:** none (verification)

- [ ] **Step 1: Rebuild + run the analysis image, analyze the real file**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
docker build -t hrva-drive-analysis:dev ./analysis
docker rm -f hrva-analysis >/dev/null 2>&1
docker run -d -p 8000:8000 --name hrva-analysis hrva-drive-analysis:dev >/dev/null
curl -s --retry 30 --retry-all-errors --retry-connrefused --retry-delay 1 http://localhost:8000/health >/dev/null
curl -s -F "file=@data/vertical_layout (1).csv" -F "format=vertical_layout" http://localhost:8000/analyze \
  | python3 -c "import sys,json; b=json.load(sys.stdin); print('eco',b['scores']['eco'],'style',b['scores']['style'],'rpmBand%',b['scores']['rpmBandPct']); print('events',len(b['events']),'types',sorted(set(e['type'] for e in b['events']))); print('bests',b['bests']); print('health',b['health'])"
docker rm -f hrva-analysis >/dev/null 2>&1
```
Expected (matches ground truth): `rpmBand% ≈ 54`; **0** `hard_accel`/`hard_brake` events but `idle` and `high_rpm` present; `bests` → maxHp 79.6, peakBoostBar 0.71, maxAccelG 0.27 (rounded), topSpeedKmh 146.0, maxRpm 3355.0; `health` → batteryVerdict "healthy" (14.2 V), a numeric warmupSeconds, a fuelTrimVerdict from STFT/LTFT.

- [ ] **Step 2: Commit** (none — verification only)

---

# Part B — Frontend (surface scores + best-of)

## Task B1: Extend the frontend types

**Files:** Modify `frontend/src/types.ts`

- [ ] **Step 1: Add the new interfaces and fields to `frontend/src/types.ts`**

Add these interfaces:
```ts
export interface DriveEvent { type: string; t: number; lat: number | null; lon: number | null; value: number; durationSeconds: number }
export interface Scores { eco: number; style: string; rpmBandPct: number; idlePct: number; speedSteadiness: number; harshEvents: number }
export interface Health { warmupSeconds: number | null; batteryVerdict: string; batteryVolts: number | null; fuelTrimVerdict: string }
export interface Bests { maxHp: number | null; peakBoostBar: number | null; maxAccelG: number | null; topSpeedKmh: number | null; maxRpm: number | null }
```
Add these four fields to the `DriveAnalysis` interface (after `dataQuality`):
```ts
  events: DriveEvent[];
  scores: Scores;
  health: Health;
  bests: Bests;
```

- [ ] **Step 2: Confirm it compiles**

Run: `cd frontend && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: build succeeds (types are additive; nothing consumes them yet).

- [ ] **Step 3: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/types.ts
git commit -m "feat(frontend): add Phase 2 types (events, scores, health, bests)"
```

---

## Task B2: ScoresCard + BestsCard

**Files:** Create `frontend/src/components/ScoresCard.tsx` (+ test), `frontend/src/components/BestsCard.tsx` (+ test)

- [ ] **Step 1: Write the FAILING tests**

`frontend/src/components/ScoresCard.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ScoresCard from './ScoresCard';
import type { Scores } from '../types';

const scores: Scores = { eco: 78, style: 'eco', rpmBandPct: 54, idlePct: 13, speedSteadiness: 80, harshEvents: 0 };

describe('ScoresCard', () => {
  it('shows the eco score, style, and rpm-band %', () => {
    render(<ScoresCard scores={scores} eventCount={5} />);
    expect(screen.getByText('78')).toBeInTheDocument();
    expect(screen.getByText(/eco/i)).toBeInTheDocument();
    expect(screen.getByText('54%')).toBeInTheDocument();
    expect(screen.getByText(/5 events/i)).toBeInTheDocument();
  });
});
```

`frontend/src/components/BestsCard.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import BestsCard from './BestsCard';
import type { Bests } from '../types';

const bests: Bests = { maxHp: 79.6, peakBoostBar: 0.71, maxAccelG: 0.27, topSpeedKmh: 146, maxRpm: 3355 };

describe('BestsCard', () => {
  it('shows the headline peaks and skips absent ones', () => {
    render(<BestsCard bests={bests} />);
    expect(screen.getByText('146 km/h')).toBeInTheDocument();
    expect(screen.getByText('3355 rpm')).toBeInTheDocument();
    expect(screen.getByText('79.6 hp')).toBeInTheDocument();
    expect(screen.getByText('0.71 bar')).toBeInTheDocument();
  });

  it('renders nothing useful when all peaks are absent', () => {
    const empty: Bests = { maxHp: null, peakBoostBar: null, maxAccelG: null, topSpeedKmh: null, maxRpm: null };
    render(<BestsCard bests={empty} />);
    expect(screen.queryByText(/hp|rpm|km\/h|bar/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run them, watch them fail**

Run: `cd frontend && npm test -- Card`
Expected: FAIL — no `ScoresCard` / `BestsCard`.

- [ ] **Step 3: Create `frontend/src/components/ScoresCard.tsx`**

```tsx
import type { Scores } from '../types';

interface Props {
  scores: Scores;
  eventCount: number;
}

export default function ScoresCard({ scores, eventCount }: Props) {
  return (
    <section style={{ display: 'flex', gap: 24, alignItems: 'center',
                      background: '#eff6ff', borderRadius: 8, padding: 16 }}>
      <div>
        <div style={{ fontSize: 12, color: '#71717a' }}>Eco score</div>
        <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{scores.eco}</div>
        <div style={{ textTransform: 'capitalize' }}>{scores.style} driver</div>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, color: '#3f3f46' }}>
        <li>In best RPM band: <strong>{scores.rpmBandPct}%</strong></li>
        <li>Idling: <strong>{scores.idlePct}%</strong></li>
        <li>Speed steadiness: <strong>{scores.speedSteadiness}</strong>/100</li>
        <li><strong>{eventCount} events</strong> detected ({scores.harshEvents} harsh)</li>
      </ul>
    </section>
  );
}
```

- [ ] **Step 4: Create `frontend/src/components/BestsCard.tsx`**

```tsx
import type { Bests } from '../types';

interface Props {
  bests: Bests;
}

export default function BestsCard({ bests }: Props) {
  const items: Array<[string, string | null]> = [
    ['Top speed', bests.topSpeedKmh != null ? `${bests.topSpeedKmh} km/h` : null],
    ['Max RPM', bests.maxRpm != null ? `${bests.maxRpm} rpm` : null],
    ['Max power', bests.maxHp != null ? `${bests.maxHp} hp` : null],
    ['Peak boost', bests.peakBoostBar != null ? `${bests.peakBoostBar} bar` : null],
    ['Hardest accel', bests.maxAccelG != null ? `${bests.maxAccelG} g` : null],
  ].filter(([, v]) => v !== null) as Array<[string, string]>;

  if (items.length === 0) {
    return null;
  }
  return (
    <section>
      <h3>Best of the drive</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {items.map(([label, value]) => (
          <div key={label} style={{ background: '#fef9c3', borderRadius: 8, padding: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#71717a' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Run the tests, watch them pass**

Run: `cd frontend && npm test -- Card`
Expected: PASS (ScoresCard 1 + BestsCard 2).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/ScoresCard.tsx frontend/src/components/ScoresCard.test.tsx frontend/src/components/BestsCard.tsx frontend/src/components/BestsCard.test.tsx
git commit -m "feat(frontend): ScoresCard and BestsCard"
```

---

## Task B3: Show scores + best-of in the dashboard

**Files:** Modify `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

- [ ] **Step 1: Add assertions to `frontend/src/App.test.tsx`**

Extend the `analysis` stub object with the Phase 2 fields (add after `dataQuality`):
```tsx
  events: [{ type: 'idle', t: 0, lat: null, lon: null, value: 0, durationSeconds: 30 }],
  scores: { eco: 78, style: 'eco', rpmBandPct: 54, idlePct: 13, speedSteadiness: 80, harshEvents: 0 },
  health: { warmupSeconds: 120, batteryVerdict: 'healthy', batteryVolts: 14.2, fuelTrimVerdict: 'normal' },
  bests: { maxHp: 79.6, peakBoostBar: 0.71, maxAccelG: 0.27, topSpeedKmh: 146, maxRpm: 3355 },
```
Add assertions inside the existing test, after the chart assertion:
```tsx
    expect(screen.getByText('78')).toBeInTheDocument();           // eco score
    expect(screen.getByText('Best of the drive')).toBeInTheDocument();
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd frontend && npm test -- App`
Expected: FAIL — App doesn't render the eco score yet.

- [ ] **Step 3: Modify `frontend/src/App.tsx`**

Add imports:
```tsx
import ScoresCard from './components/ScoresCard';
import BestsCard from './components/BestsCard';
```
Inside the `{analysis && (...)}` grid, add `ScoresCard` (right after `SummaryCard`) and `BestsCard` (right before `SpeedChart`):
```tsx
          <SummaryCard summary={analysis.summary} durationSeconds={analysis.drive.durationSeconds} />
          <ScoresCard scores={analysis.scores} eventCount={analysis.events.length} />
          <RouteMap route={analysis.route} />
          <BestsCard bests={analysis.bests} />
          <SpeedChart points={analysis.series.speedKmh ?? []} />
```

- [ ] **Step 4: Run the whole frontend suite, watch it pass**

Run: `cd frontend && npm test`
Expected: PASS (App + api + SummaryCard + ScoresCard + BestsCard + SpeedChart + RouteMap).

- [ ] **Step 5: Confirm the build**

Run: `cd frontend && rm -rf dist && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: `tsc -b` passes, `dist/index.html` produced.

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): show eco score and best-of cards in the dashboard"
```

---

# Part C — Integration

## Task C1: Full-stack round-trip with the new analysis

**Files:** none (verification)

- [ ] **Step 1: Rebuild + run the whole stack**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
make run
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```
Expected: analysis + ingestion `healthy`, frontend up.

- [ ] **Step 2: Analyze the real file through the chain and check the new fields**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
curl -s --retry 60 --retry-all-errors --retry-connrefused --retry-delay 1 \
  -F "file=@data/vertical_layout (1).csv" -F "format=vertical_layout" \
  http://localhost:8090/api/v1/drives:analyze \
  | python3 -c "import sys,json; b=json.load(sys.stdin); print('eco',b['scores']['eco'],b['scores']['style'],'rpmBand',b['scores']['rpmBandPct']); print('events',len(b['events']),sorted(set(e['type'] for e in b['events']))); print('bests',b['bests']); print('health',b['health'])"
```
Expected: `rpmBand ≈ 54`; events include `idle` + `high_rpm` but **no** `hard_accel`/`hard_brake`; `bests` topSpeedKmh 146.0, maxRpm 3355.0, maxHp 79.6, peakBoostBar 0.71; `health` batteryVerdict "healthy".

- [ ] **Step 3: Eyeball the browser**

Open http://localhost:8090, analyze `data/vertical_layout (1).csv`. Expected: the eco-score card and "Best of the drive" card now appear alongside the summary, map, and chart.

- [ ] **Step 4: Tear down**

Run: `make stop`

- [ ] **Step 5: Verification commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git commit --allow-empty -m "test(phase-2): verified events/scores/health/bests end-to-end on the real drive"
```

---

## Phase 2 acceptance

- `make test` — analysis, ingestion, frontend all green (incl. new `test_events/test_scores/test_health_metrics/test_bests/test_models_phase2`).
- `make run` then uploading the real `vertical_layout` file returns populated `events`, `scores`, `health`, `bests`; the dashboard shows the eco-score and best-of cards.
- `schemaVersion` is still `"1"` (the new fields are additive).
- The gentle sample drive correctly reports **0 harsh events** with default thresholds — and idle/high-RPM events that do exist.

## Self-review notes (done while writing)

- **Spec coverage (design §8 Phase 2 + §7 reserved shapes):** events (A2), scores (A3), health (A4), bests (A5) — all wired (A6) and surfaced (B2/B3). Field names match §7's reserved `events/scores/health/bests`.
- **Additive contract:** new model fields are optional with defaults; `schemaVersion` unchanged → Phase 1 clients unaffected. Frontend types extend `DriveAnalysis` additively.
- **Consistency:** `events.detect_events`, `scores.build_scores`, `health.build_health`, `bests.build_bests` are defined in A2–A5 and called by the orchestrator in A6 with matching signatures (`build_scores(df, harsh)`). Frontend `Scores/Bests/Health/DriveEvent` mirror the Pydantic shapes.
- **Grounded thresholds:** harsh thresholds (0.30 g / −0.35 g) are documented configurable defaults; the sample's 0-harsh-event result is asserted as expected, not a failure.
- **No placeholders:** every code/command step is complete and runnable.
```
