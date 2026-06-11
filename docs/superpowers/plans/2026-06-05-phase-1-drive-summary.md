# Phase 1 — First Real Analysis (Drive Summary + Map + Speed Chart) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 0 analysis stub with a real pipeline: parse a `vertical_layout` drive and return a true **Drive Summary** (distance, duration, moving/idle, avg/max speed, fuel L, cost €, L/100km, elevation) plus a **route** polyline and a **speed-vs-time series**, then render them in the frontend as a KPI card, a Leaflet map, and a Recharts line chart.

**Architecture:** The `DriveAnalysis` v1 contract (spec §7) is unchanged — Phase 1 only *fills in* the fields the stub left empty. The analysis service gains a small, testable pipeline (`parsing → metrics → routes → analysis` orchestrator) using pandas/numpy, computing everything per the shared definitions in spec §6. Ingestion adds a light header-sniff validation. The frontend replaces the raw-JSON `<pre>` with three components.

**Tech Stack:** Python 3.13 + pandas + numpy (analysis) · Java 25 / Spring Boot 4 (ingestion) · React 19 + Leaflet/react-leaflet + Recharts + Vitest (frontend).

**Scope:** **Phase 1 only** (design §9). Build the Drive Summary + route + ONE speed chart. Do **NOT** build events, scores, tips, engine health, "best of", expert/debug mode, extra formats, or extra charts — those are Phase 2+. Stay inside the v1 `DriveAnalysis` shape; do not add new top-level fields.

**Builds on:** the committed Phase 0 walking skeleton. Read `docs/superpowers/specs/2026-06-05-hrva-drive-design.md` (esp. §3 data model, §6 analysis definitions, §7 contract) and the Phase 0 plan's "Execution outcome" section first.

---

## Prerequisites

Same toolchain as Phase 0 (see that plan): Docker running, **JDK 25** via `JAVA_HOME="$(/usr/libexec/java_home -v 25)"`, **`python3.13`**, Node 24. The analysis venv already exists at `analysis/.venv`. Commit locally per task; do not push.

**Real-data ground truth** (the sample `data/vertical_layout (1).csv`, used in the final integration check, Task D1):
- ~288,759 data rows, **65 PIDs**, span **≈2633 s (43.9 min)**, starts at clock **16:08:58**.
- `Fuel used` (cumulative, last) = **2.312 L**; `Fuel used price` = **€3.723**; max `Vehicle speed` = **146 km/h**.

---

## File Structure

```
analysis/
├── requirements.txt                 # MODIFY: add pandas, numpy
├── app/
│   ├── main.py                      # MODIFY: /analyze calls the real pipeline (no more stub)
│   ├── models.py                    # (unchanged — DriveAnalysis v1 already has every field)
│   ├── parsing.py                   # NEW: vertical CSV bytes -> tidy DataFrame[t,pid,value,unit,lat,lon]
│   ├── geo.py                       # NEW: haversine_km (vectorized)
│   ├── metrics.py                   # NEW: pure metric fns + 1Hz resample helper
│   ├── routes.py                    # NEW: route points + speed series builders
│   └── analysis.py                  # NEW: orchestrator df -> DriveAnalysis
└── tests/
    ├── conftest.py                  # NEW: tiny synthetic vertical CSV + parsed-df fixtures
    ├── test_parsing.py              # NEW
    ├── test_metrics.py              # NEW
    ├── test_routes.py               # NEW
    ├── test_analysis.py             # NEW (orchestrator on synthetic data)
    └── test_analyze.py              # REPLACES test_analyze_stub.py (real assertions via HTTP)

ingestion/
├── src/main/java/cc/hrva/drive/ingestion/
│   ├── validation/VerticalLayoutValidator.java   # NEW: sniff the header line
│   └── web/DriveAnalysisController.java           # MODIFY: 400 if not vertical_layout
└── src/test/java/cc/hrva/drive/ingestion/
    ├── validation/VerticalLayoutValidatorTest.java  # NEW
    └── web/DriveAnalysisControllerTest.java         # MODIFY: add invalid-header case

frontend/
├── package.json                     # MODIFY: add leaflet, react-leaflet, recharts, @types/leaflet
├── src/
│   ├── types.ts                     # NEW: DriveAnalysis TS types (mirror spec §7)
│   ├── api.ts                       # NEW: analyzeDrive(file) -> DriveAnalysis
│   ├── App.tsx                      # MODIFY: dashboard (SummaryCard + RouteMap + SpeedChart)
│   ├── App.test.tsx                 # MODIFY: assert dashboard renders from analysis
│   └── components/
│       ├── SummaryCard.tsx          # NEW
│       ├── SummaryCard.test.tsx     # NEW
│       ├── RouteMap.tsx             # NEW (Leaflet)
│       ├── RouteMap.test.tsx        # NEW (mocks react-leaflet)
│       ├── SpeedChart.tsx           # NEW (Recharts)
│       └── SpeedChart.test.tsx      # NEW (mocks recharts)
```

Each analysis module has one responsibility (parse / geo / metrics / route-shaping / orchestration) and is unit-tested with tiny synthetic data so the math is pinned down without the 26MB file.

---

# Part A — Analysis service (the real pipeline)

## Task A1: Add pandas/numpy + the parser

**Files:**
- Modify: `analysis/requirements.txt`
- Create: `analysis/app/parsing.py`, `analysis/tests/conftest.py`, `analysis/tests/test_parsing.py`

- [ ] **Step 1: Add deps to `analysis/requirements.txt`** (append these two lines)

```
pandas~=2.2
numpy~=2.1
```

- [ ] **Step 2: Install them**

Run: `cd analysis && .venv/bin/pip install -q -r requirements.txt && .venv/bin/python -c "import pandas, numpy; print(pandas.__version__, numpy.__version__)"`
Expected: prints two version numbers.

- [ ] **Step 3: Create `analysis/tests/conftest.py`** (shared synthetic drive)

```python
import pytest

# A tiny synthetic vertical_layout drive: 3 GPS fixes ~1s apart, with speed,
# rpm, cumulative fuel + price, and altitude. Semicolon-delimited, quoted,
# trailing ';' (exactly like the real export). Values chosen for known answers.
SYNTHETIC_VERTICAL = (
    '"SECONDS";"PID";"VALUE";"UNITS";"LATITUDE";"LONGTITUDE";\n'
    '"100.0";"Vehicle speed";"0";"km/h";"45.000000";"15.000000";\n'
    '"100.0";"Engine RPM";"800";"rpm";"45.000000";"15.000000";\n'
    '"100.0";"Altitude (GPS)";"100";"m";"45.000000";"15.000000";\n'
    '"101.0";"Vehicle speed";"36";"km/h";"45.000000";"15.001000";\n'
    '"101.0";"Engine RPM";"2000";"rpm";"45.000000";"15.001000";\n'
    '"101.0";"Altitude (GPS)";"110";"m";"45.000000";"15.001000";\n'
    '"102.0";"Vehicle speed";"72";"km/h";"45.000000";"15.002000";\n'
    '"102.0";"Engine RPM";"3000";"rpm";"45.000000";"15.002000";\n'
    '"102.0";"Altitude (GPS)";"105";"m";"45.000000";"15.002000";\n'
    '"102.0";"Fuel used";"0.25";"L";"45.000000";"15.002000";\n'
    '"102.0";"Fuel used price";"0.40";"EUR";"45.000000";"15.002000";\n'
)


@pytest.fixture
def synthetic_bytes() -> bytes:
    return SYNTHETIC_VERTICAL.encode("utf-8")


@pytest.fixture
def synthetic_df(synthetic_bytes):
    from app.parsing import parse_vertical
    return parse_vertical(synthetic_bytes)
```

- [ ] **Step 4: Write the failing test** — `analysis/tests/test_parsing.py`

```python
import pandas as pd


def test_parse_vertical_shapes_tidy_columns(synthetic_df):
    df = synthetic_df
    assert list(df.columns) == ["t", "pid", "value", "unit", "lat", "lon"]
    # 11 data rows (header skipped), trailing empty column dropped
    assert len(df) == 11
    # numeric coercion
    assert pd.api.types.is_float_dtype(df["t"])
    assert df["t"].min() == 100.0
    # LONGTITUDE normalized to lon
    assert df.loc[df["pid"] == "Vehicle speed", "lon"].iloc[-1] == 15.002
    # a known value survives
    assert df.loc[df["pid"] == "Fuel used", "value"].iloc[0] == 0.25
```

- [ ] **Step 5: Run it and watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_parsing.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.parsing'`.

- [ ] **Step 6: Create `analysis/app/parsing.py`**

```python
import io

import pandas as pd

# The vertical export is ';'-delimited and quoted, with a trailing ';' that
# yields an empty 7th column. Source header misspells longitude as LONGTITUDE.
_RAW_COLUMNS = ["SECONDS", "PID", "VALUE", "UNITS", "LATITUDE", "LONGTITUDE"]


def parse_vertical(content: bytes) -> pd.DataFrame:
    raw = pd.read_csv(
        io.BytesIO(content),
        sep=";",
        header=None,
        skiprows=1,                 # drop the original header row
        names=_RAW_COLUMNS,
        usecols=range(6),           # ignore the trailing empty column
        dtype=str,
    )
    df = pd.DataFrame()
    df["t"] = pd.to_numeric(raw["SECONDS"], errors="coerce")
    df["pid"] = raw["PID"]
    df["value"] = pd.to_numeric(raw["VALUE"], errors="coerce")
    df["unit"] = raw["UNITS"]
    df["lat"] = pd.to_numeric(raw["LATITUDE"], errors="coerce")
    df["lon"] = pd.to_numeric(raw["LONGTITUDE"], errors="coerce")
    return df.dropna(subset=["t"]).reset_index(drop=True)
```

- [ ] **Step 7: Run it and watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_parsing.py -q`
Expected: PASS (1 passed).

- [ ] **Step 8: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/requirements.txt analysis/app/parsing.py analysis/tests/conftest.py analysis/tests/test_parsing.py
git commit -m "feat(analysis): parse vertical_layout CSV into a tidy DataFrame" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task A2: Geo + core metrics (distance, duration, speed, idle/moving)

**Files:**
- Create: `analysis/app/geo.py`, `analysis/app/metrics.py`
- Create: `analysis/tests/test_metrics.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_metrics.py`

```python
import numpy as np

from app import metrics
from app.geo import haversine_km


def test_haversine_one_degree_lon_at_equator():
    # ~111.32 km per degree of longitude at the equator
    d = haversine_km(np.array([0.0]), np.array([0.0]), np.array([0.0]), np.array([1.0]))
    assert abs(float(d[0]) - 111.32) < 0.2


def test_distance_sums_gps_track(synthetic_df):
    # three fixes moving east ~0.001 deg lon each step at lat 45 (~0.0787 km/step)
    km = metrics.distance_km(synthetic_df)
    assert 0.14 < km < 0.18


def test_duration_seconds(synthetic_df):
    assert metrics.duration_seconds(synthetic_df) == 2.0


def test_speed_stats_prefers_vehicle_speed(synthetic_df):
    stats = metrics.speed_stats(synthetic_df)
    assert stats["maxSpeedKmh"] == 72.0
    assert stats["source"] == "Vehicle speed"


def test_idle_and_moving_seconds(synthetic_df):
    mv = metrics.moving_idle_seconds(synthetic_df)
    # second @100 speed 0 & rpm 800 -> idle; @101 (36) & @102 (72) -> moving
    assert mv["idleSeconds"] == 1
    assert mv["movingSeconds"] == 2
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.geo'`.

- [ ] **Step 3: Create `analysis/app/geo.py`**

```python
import numpy as np

_EARTH_RADIUS_KM = 6371.0088


def haversine_km(lat1, lon1, lat2, lon2):
    """Great-circle distance in km between arrays of degree coordinates."""
    lat1, lon1, lat2, lon2 = (np.radians(np.asarray(x, dtype=float)) for x in (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))
```

- [ ] **Step 4: Create `analysis/app/metrics.py`** (core metrics + the resample helper used here and later)

```python
import numpy as np
import pandas as pd

from app.geo import haversine_km

# Engine/threshold defaults — see spec §6. Configurable, not gospel.
_IDLE_SPEED_KMH = 1.0


def series(df: pd.DataFrame, pid: str) -> pd.DataFrame:
    """The (t, value) samples for one PID, sorted by time, NaNs dropped."""
    s = df[df["pid"] == pid][["t", "value"]].dropna().sort_values("t")
    return s.reset_index(drop=True)


def speed_source(df: pd.DataFrame) -> str | None:
    """Prefer OBD 'Vehicle speed'; fall back to 'Speed (GPS)'."""
    if not series(df, "Vehicle speed").empty:
        return "Vehicle speed"
    if not series(df, "Speed (GPS)").empty:
        return "Speed (GPS)"
    return None


def gps_track(df: pd.DataFrame) -> pd.DataFrame:
    """Rows with a fix, consecutive duplicates removed (every row repeats the
    last fix in this format, so dedup gives the real track)."""
    gps = df.dropna(subset=["lat", "lon"]).sort_values("t")
    moved = (gps["lat"] != gps["lat"].shift()) | (gps["lon"] != gps["lon"].shift())
    return gps[moved][["t", "lat", "lon"]].reset_index(drop=True)


def distance_km(df: pd.DataFrame) -> float:
    track = gps_track(df)
    if len(track) < 2:
        return 0.0
    lat = track["lat"].to_numpy()
    lon = track["lon"].to_numpy()
    seg = haversine_km(lat[:-1], lon[:-1], lat[1:], lon[1:])
    return float(np.nansum(seg))


def duration_seconds(df: pd.DataFrame) -> float:
    return float(df["t"].max() - df["t"].min())


def resample_1hz(df: pd.DataFrame, pids: list[str]) -> pd.DataFrame:
    """A 1Hz time grid with each PID forward-filled onto it (backward asof)."""
    t0 = float(np.floor(df["t"].min()))
    t1 = float(np.ceil(df["t"].max()))
    grid = pd.DataFrame({"t": np.arange(t0, t1 + 1.0, 1.0)})
    for pid in pids:
        s = series(df, pid).rename(columns={"value": pid})
        if s.empty:
            grid[pid] = np.nan
        else:
            grid = pd.merge_asof(grid, s, on="t", direction="backward")
    return grid


def speed_stats(df: pd.DataFrame) -> dict:
    src = speed_source(df)
    if src is None:
        return {"avgSpeedKmh": 0.0, "maxSpeedKmh": 0.0, "source": None}
    s = series(df, src)["value"]
    dist = distance_km(df)
    moving_h = moving_idle_seconds(df)["movingSeconds"] / 3600.0
    avg = (dist / moving_h) if moving_h > 0 else 0.0
    return {"avgSpeedKmh": round(avg, 2), "maxSpeedKmh": float(s.max()), "source": src}


def moving_idle_seconds(df: pd.DataFrame) -> dict:
    src = speed_source(df)
    if src is None:
        return {"movingSeconds": 0, "idleSeconds": 0}
    grid = resample_1hz(df, [src, "Engine RPM"])
    speed = grid[src]
    rpm = grid["Engine RPM"]
    moving = int((speed >= _IDLE_SPEED_KMH).sum())
    idle = int(((speed < _IDLE_SPEED_KMH) & (rpm > 0)).sum())
    return {"movingSeconds": moving, "idleSeconds": idle}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -q`
Expected: PASS (5 passed).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/geo.py analysis/app/metrics.py analysis/tests/test_metrics.py
git commit -m "feat(analysis): geo haversine + distance/duration/speed/idle metrics" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task A3: Fuel, cost, consumption, elevation

**Files:**
- Modify: `analysis/app/metrics.py`
- Modify: `analysis/tests/test_metrics.py`

- [ ] **Step 1: Add failing tests** — append to `analysis/tests/test_metrics.py`

```python
def test_fuel_used_prefers_cumulative_pid(synthetic_df):
    used, source = metrics.fuel_used_l(synthetic_df)
    assert used == 0.25
    assert source == "Fuel used"


def test_fuel_cost_prefers_cumulative_price(synthetic_df):
    assert metrics.fuel_cost_eur(synthetic_df, fuel_l=0.25, price_per_l=2.0) == 0.40


def test_fuel_cost_falls_back_to_price_per_l():
    import pandas as pd
    df = pd.DataFrame({"t": [0.0], "pid": ["Vehicle speed"], "value": [0.0],
                       "unit": ["km/h"], "lat": [None], "lon": [None]})
    assert metrics.fuel_cost_eur(df, fuel_l=2.0, price_per_l=1.5) == 3.0


def test_consumption_l_per_100km():
    assert metrics.consumption_l_100km(fuel_l=0.16, distance_km=0.16) == 100.0
    assert metrics.consumption_l_100km(fuel_l=1.0, distance_km=0.0) == 0.0


def test_elevation_gain_and_loss(synthetic_df):
    # altitudes 100 -> 110 -> 105 (smoothing window 5, min_periods 1)
    gain, loss = metrics.elevation_gain_loss(synthetic_df)
    assert gain > 0.0
    assert loss >= 0.0
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -q`
Expected: FAIL — `AttributeError: module 'app.metrics' has no attribute 'fuel_used_l'`.

- [ ] **Step 3: Append to `analysis/app/metrics.py`**

```python
def fuel_used_l(df: pd.DataFrame) -> tuple[float, str | None]:
    cumulative = series(df, "Fuel used")
    if not cumulative.empty:
        return float(cumulative["value"].iloc[-1]), "Fuel used"
    rate = series(df, "Engine fuel rate")  # L/h
    if rate.empty:
        return 0.0, None
    t = rate["t"].to_numpy()
    v = rate["value"].to_numpy()
    used = float(np.sum(v[:-1] * np.diff(t) / 3600.0))
    return used, "Engine fuel rate (integrated)"


def fuel_cost_eur(df: pd.DataFrame, fuel_l: float, price_per_l: float | None) -> float:
    price = series(df, "Fuel used price")
    if not price.empty:
        return float(price["value"].iloc[-1])
    if price_per_l:
        return round(fuel_l * price_per_l, 2)
    return 0.0


def consumption_l_100km(fuel_l: float, distance_km: float) -> float:
    if distance_km <= 0:
        return 0.0
    return round(fuel_l / distance_km * 100.0, 2)


def elevation_gain_loss(df: pd.DataFrame) -> tuple[float, float]:
    alt = series(df, "Altitude (GPS)")
    if alt.empty:
        return 0.0, 0.0
    smoothed = alt["value"].rolling(5, min_periods=1).mean().to_numpy()
    deltas = np.diff(smoothed)
    gain = float(np.sum(deltas[deltas > 0]))
    loss = float(-np.sum(deltas[deltas < 0]))
    return round(gain, 1), round(loss, 1)
```

- [ ] **Step 4: Run them and watch them pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -q`
Expected: PASS (10 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/metrics.py analysis/tests/test_metrics.py
git commit -m "feat(analysis): fuel used, cost, consumption, and elevation metrics" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task A4: Route points + speed series

**Files:**
- Create: `analysis/app/routes.py`, `analysis/tests/test_routes.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_routes.py`

```python
from app import routes


def test_route_points_have_lat_lon_and_speed(synthetic_df):
    pts = routes.route_points(synthetic_df, max_points=1000)
    assert len(pts) >= 2
    first = pts[0]
    assert set(first.keys()) == {"t", "lat", "lon", "speedKmh"}
    assert first["lat"] == 45.0
    # speed attached by nearest-time join (t=100 -> Vehicle speed 0)
    assert pts[0]["speedKmh"] == 0.0


def test_route_downsamples_to_max_points(synthetic_df):
    pts = routes.route_points(synthetic_df, max_points=2)
    assert len(pts) <= 2


def test_speed_series_points(synthetic_df):
    pts = routes.speed_series(synthetic_df, max_points=1000)
    assert len(pts) >= 1
    assert set(pts[0].keys()) == {"t", "v"}
    assert max(p["v"] for p in pts) == 72.0
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_routes.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.routes'`.

- [ ] **Step 3: Create `analysis/app/routes.py`**

```python
import numpy as np
import pandas as pd

from app import metrics


def _downsample(frame: pd.DataFrame, max_points: int) -> pd.DataFrame:
    if max_points <= 0 or len(frame) <= max_points:
        return frame
    step = int(np.ceil(len(frame) / max_points))
    return frame.iloc[::step].reset_index(drop=True)


def route_points(df: pd.DataFrame, max_points: int = 2000) -> list[dict]:
    track = metrics.gps_track(df)              # t, lat, lon (deduped)
    if track.empty:
        return []
    src = metrics.speed_source(df)
    if src is not None:
        speed = metrics.series(df, src).rename(columns={"value": "speedKmh"})
        track = pd.merge_asof(track, speed, on="t", direction="nearest")
    else:
        track["speedKmh"] = 0.0
    track["speedKmh"] = track["speedKmh"].fillna(0.0)
    track = _downsample(track, max_points)
    return [
        {"t": float(r.t), "lat": float(r.lat), "lon": float(r.lon), "speedKmh": float(r.speedKmh)}
        for r in track.itertuples()
    ]


def speed_series(df: pd.DataFrame, max_points: int = 1500) -> list[dict]:
    src = metrics.speed_source(df)
    if src is None:
        return []
    s = _downsample(metrics.series(df, src), max_points)
    return [{"t": float(r.t), "v": float(r.value)} for r in s.itertuples()]
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_routes.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/routes.py analysis/tests/test_routes.py
git commit -m "feat(analysis): route points and speed series builders" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task A5: Orchestrator (DataFrame -> DriveAnalysis)

**Files:**
- Create: `analysis/app/analysis.py`, `analysis/tests/test_analysis.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_analysis.py`

```python
from app.analysis import build_drive_analysis


def test_build_drive_analysis_fills_summary(synthetic_df):
    result = build_drive_analysis(synthetic_df, source="vertical_layout", price_per_l=None)

    assert result.schemaVersion == "1"
    assert result.drive.source == "vertical_layout"
    assert result.drive.durationSeconds == 2.0
    assert result.drive.startedAtClock == "00:01:40.000"   # t=100s -> 00:01:40
    assert result.summary.maxSpeedKmh == 72.0
    assert result.summary.fuelUsedL == 0.25
    assert result.summary.fuelCostEur == 0.40
    assert 0.14 < result.summary.distanceKm < 0.18
    assert len(result.route) >= 2
    assert "speedKmh" in result.series and len(result.series["speedKmh"]) >= 1
    assert result.dataQuality.rowCount == 11
    assert "Vehicle speed" in result.dataQuality.pidsPresent
    assert result.dataQuality.distanceSource == "gps"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analysis.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.analysis'`.

- [ ] **Step 3: Create `analysis/app/analysis.py`**

```python
import pandas as pd

from app import metrics, routes
from app.models import (
    DataQuality,
    Drive,
    DriveAnalysis,
    RoutePoint,
    SeriesPoint,
    Summary,
    Vehicle,
)


def _clock(seconds: float) -> str:
    total_ms = int(round(seconds * 1000))
    h = total_ms // 3_600_000
    m = (total_ms % 3_600_000) // 60_000
    s = (total_ms % 60_000) // 1000
    ms = total_ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def build_drive_analysis(df: pd.DataFrame, source: str, price_per_l: float | None) -> DriveAnalysis:
    distance = metrics.distance_km(df)
    speed = metrics.speed_stats(df)
    mv = metrics.moving_idle_seconds(df)
    fuel_l, _fuel_src = metrics.fuel_used_l(df)
    cost = metrics.fuel_cost_eur(df, fuel_l, price_per_l)
    gain, loss = metrics.elevation_gain_loss(df)

    summary = Summary(
        distanceKm=round(distance, 3),
        movingSeconds=mv["movingSeconds"],
        idleSeconds=mv["idleSeconds"],
        avgSpeedKmh=speed["avgSpeedKmh"],
        maxSpeedKmh=speed["maxSpeedKmh"],
        fuelUsedL=round(fuel_l, 3),
        fuelCostEur=round(cost, 2),
        avgConsumptionL100km=metrics.consumption_l_100km(fuel_l, distance),
        elevationGainM=gain,
        elevationLossM=loss,
    )

    route = [RoutePoint(**p) for p in routes.route_points(df)]
    series = {"speedKmh": [SeriesPoint(**p) for p in routes.speed_series(df)]}

    return DriveAnalysis(
        drive=Drive(
            source=source,
            startedAtClock=_clock(float(df["t"].min())),
            durationSeconds=metrics.duration_seconds(df),
            vehicle=Vehicle(label="My car"),
        ),
        summary=summary,
        route=route,
        series=series,
        dataQuality=DataQuality(
            rowCount=int(len(df)),
            pidsPresent=sorted(df["pid"].dropna().unique().tolist()),
            distanceSource="gps",
            warnings=[],
        ),
    )
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analysis.py -q`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/analysis.py analysis/tests/test_analysis.py
git commit -m "feat(analysis): orchestrator assembling DriveAnalysis from a drive" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task A6: Wire `/analyze` to the pipeline (replace the stub)

**Files:**
- Modify: `analysis/app/main.py`
- Delete: `analysis/tests/test_analyze_stub.py`
- Create: `analysis/tests/test_analyze.py`

- [ ] **Step 1: Replace the stub test** — delete `test_analyze_stub.py`, create `analysis/tests/test_analyze.py`

```bash
rm analysis/tests/test_analyze_stub.py
```

```python
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import SYNTHETIC_VERTICAL

client = TestClient(app)


def test_analyze_returns_real_summary():
    files = {"file": ("drive.csv", SYNTHETIC_VERTICAL.encode("utf-8"), "text/csv")}
    response = client.post("/analyze", files=files, data={"format": "vertical_layout"})

    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "1"
    assert body["summary"]["maxSpeedKmh"] == 72.0
    assert body["summary"]["fuelUsedL"] == 0.25
    assert body["drive"]["durationSeconds"] == 2.0
    assert len(body["route"]) >= 2
    assert len(body["series"]["speedKmh"]) >= 1
    assert body["dataQuality"]["distanceSource"] == "gps"
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analyze.py -q`
Expected: FAIL — the stub returns `maxSpeedKmh == 0.0`, so the assertion fails.

- [ ] **Step 3: Replace the body of `analysis/app/main.py`**

```python
from fastapi import FastAPI, File, Form, UploadFile

from app.analysis import build_drive_analysis
from app.models import DriveAnalysis
from app.parsing import parse_vertical

app = FastAPI(title="HrvaDrive Analysis")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=DriveAnalysis)
async def analyze(
    file: UploadFile = File(...),
    format: str = Form("vertical_layout"),
    pricePerL: float | None = Form(None),
) -> DriveAnalysis:
    content = await file.read()
    df = parse_vertical(content)
    return build_drive_analysis(df, source=format, price_per_l=pricePerL)
```

- [ ] **Step 4: Run the full analysis suite and watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: PASS (all tests; health + parsing + metrics + routes + analysis + analyze).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add -A analysis/app/main.py analysis/tests/   # -A also stages the deleted stub test
git commit -m "feat(analysis): /analyze runs the real pipeline (replaces Phase 0 stub)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task A7: Verify the real file in the container

**Files:** none (verification only)

- [ ] **Step 1: Rebuild the analysis image and run it**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive/analysis
docker build -t hrva-drive-analysis:dev .
docker rm -f hrva-analysis >/dev/null 2>&1
docker run -d -p 8000:8000 --name hrva-analysis hrva-drive-analysis:dev >/dev/null
curl -s --retry 30 --retry-all-errors --retry-connrefused --retry-delay 1 http://localhost:8000/health >/dev/null
```

- [ ] **Step 2: Analyze the real vertical file directly against the container**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
curl -s -F "file=@data/vertical_layout (1).csv" -F "format=vertical_layout" \
  http://localhost:8000/analyze | python3 -c "import sys,json; b=json.load(sys.stdin); s=b['summary']; print('duration_s', round(b['drive']['durationSeconds'])); print('maxSpeed', s['maxSpeedKmh']); print('fuelL', s['fuelUsedL']); print('costEur', s['fuelCostEur']); print('route_pts', len(b['route'])); print('speed_pts', len(b['series']['speedKmh']))"
docker rm -f hrva-analysis >/dev/null 2>&1
```
Expected (matches the ground truth): `duration_s ≈ 2633`, `maxSpeed 146.0`, `fuelL ≈ 2.312`, `costEur ≈ 3.72`, `route_pts` and `speed_pts` both > 100.

- [ ] **Step 3: Commit** (none — verification only; note the observed numbers in the PR/commit message of the next task if desired)

---

# Part B — Ingestion: validate the upload is vertical_layout

## Task B1: Header-sniff validation

**Files:**
- Create: `ingestion/src/main/java/cc/hrva/drive/ingestion/validation/VerticalLayoutValidator.java`
- Create: `ingestion/src/test/java/cc/hrva/drive/ingestion/validation/VerticalLayoutValidatorTest.java`
- Modify: `ingestion/src/main/java/cc/hrva/drive/ingestion/web/DriveAnalysisController.java`
- Modify: `ingestion/src/test/java/cc/hrva/drive/ingestion/web/DriveAnalysisControllerTest.java`

- [ ] **Step 1: Write the failing validator test** — `VerticalLayoutValidatorTest.java`

```java
package cc.hrva.drive.ingestion.validation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class VerticalLayoutValidatorTest {

    private final VerticalLayoutValidator validator = new VerticalLayoutValidator();

    @Test
    void acceptsTheVerticalHeader() {
        final byte[] content = "\"SECONDS\";\"PID\";\"VALUE\";\"UNITS\";\"LATITUDE\";\"LONGTITUDE\";\n\"1\";\"x\";\"0\""
                .getBytes();
        assertThat(validator.isVerticalLayout(content)).isTrue();
    }

    @Test
    void rejectsTheHorizontalHeader() {
        final byte[] content = "time,\"Engine RPM (rpm)\",Latitude,Longtitude\n".getBytes();
        assertThat(validator.isVerticalLayout(content)).isFalse();
    }

    @Test
    void rejectsEmptyContent() {
        assertThat(validator.isVerticalLayout(new byte[0])).isFalse();
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn -Dtest=VerticalLayoutValidatorTest test`
Expected: FAIL — `VerticalLayoutValidator` does not exist (compilation error).

- [ ] **Step 3: Create `VerticalLayoutValidator.java`**

```java
package cc.hrva.drive.ingestion.validation;

import java.nio.charset.StandardCharsets;

import org.springframework.stereotype.Component;

@Component
public class VerticalLayoutValidator {

    public boolean isVerticalLayout(final byte[] content) {
        if (content == null || content.length == 0) {
            return false;
        }
        final int end = Math.min(content.length, 512);
        final String head = new String(content, 0, end, StandardCharsets.UTF_8);
        final int newline = head.indexOf('\n');
        final String firstLine = (newline >= 0 ? head.substring(0, newline) : head)
                .replace("\"", "").toUpperCase();
        return firstLine.contains("SECONDS")
                && firstLine.contains("PID")
                && firstLine.contains("VALUE")
                && firstLine.contains(";");
    }
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn -Dtest=VerticalLayoutValidatorTest test`
Expected: PASS (3 tests).

- [ ] **Step 5: Add a failing controller test** — append to `DriveAnalysisControllerTest.java` (inside the class)

```java
    @org.junit.jupiter.api.Test
    void rejectsNonVerticalLayout() throws Exception {
        final org.springframework.web.multipart.MultipartFile file =
                new org.springframework.mock.web.MockMultipartFile(
                        "file", "h.csv", "text/csv",
                        "time,Engine RPM (rpm),Latitude\n".getBytes());

        final org.springframework.http.ResponseEntity<String> response =
                controller.analyze(file, "vertical_layout", null);

        assertThat(response.getStatusCode())
                .isEqualTo(org.springframework.http.HttpStatus.BAD_REQUEST);
    }
```

Also update the controller's field setup at the top of the test class so it injects a real validator:

```java
    private final AnalysisClient analysisClient = mock(AnalysisClient.class);
    private final VerticalLayoutValidator validator = new VerticalLayoutValidator();
    private final DriveAnalysisController controller =
            new DriveAnalysisController(analysisClient, validator);
```

Add the import: `import cc.hrva.drive.ingestion.validation.VerticalLayoutValidator;`

And change the **existing** `forwardsUploadAndReturnsAnalysisJson` test's file content to a valid vertical header (otherwise the new validation rejects it with 400 before the forward):

```java
        final MockMultipartFile file = new MockMultipartFile(
                "file", "drive.csv", "text/csv",
                "\"SECONDS\";\"PID\";\"VALUE\";\"UNITS\";\"LATITUDE\";\"LONGTITUDE\";\n\"1\";\"Vehicle speed\";\"0\"".getBytes());
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn -Dtest=DriveAnalysisControllerTest test`
Expected: FAIL — the controller constructor takes one arg; compilation error.

- [ ] **Step 7: Update `DriveAnalysisController.java`** to inject the validator and reject bad layouts

```java
package cc.hrva.drive.ingestion.web;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import cc.hrva.drive.ingestion.analysis.AnalysisClient;
import cc.hrva.drive.ingestion.validation.VerticalLayoutValidator;

@RestController
@RequestMapping("/api/v1")
public class DriveAnalysisController {

    private final AnalysisClient analysisClient;
    private final VerticalLayoutValidator validator;

    public DriveAnalysisController(final AnalysisClient analysisClient,
                                   final VerticalLayoutValidator validator) {
        this.analysisClient = analysisClient;
        this.validator = validator;
    }

    @PostMapping(
            path = "/drives:analyze",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> analyze(
            @RequestParam("file") final MultipartFile file,
            @RequestParam(value = "format", defaultValue = "vertical_layout") final String format,
            @RequestParam(value = "pricePerL", required = false) final String pricePerL)
            throws IOException {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"empty file\"}");
        }
        final byte[] content = file.getBytes();
        if (!validator.isVerticalLayout(content)) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"not a vertical_layout export (expected SECONDS;PID;VALUE;... header)\"}");
        }
        final String analysisJson = analysisClient.analyze(file, format, pricePerL);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(analysisJson);
    }
}
```

- [ ] **Step 8: Run the ingestion tests and watch them pass**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn test`
Expected: PASS (validator 3 + controller 3 = 6 tests, BUILD SUCCESS).

- [ ] **Step 9: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add ingestion/
git commit -m "feat(ingestion): reject uploads that are not vertical_layout" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Part C — Frontend dashboard

## Task C1: Add map + chart dependencies

**Files:** Modify `frontend/package.json` (via npm)

- [ ] **Step 1: Install runtime + type deps**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive/frontend
npm install leaflet@^1.9 react-leaflet@^5 recharts@^3
npm install -D @types/leaflet
```
Expected: installs cleanly (react-leaflet 5 supports React 19).

- [ ] **Step 2: Confirm the app still builds**

Run: `cd frontend && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: build succeeds, `dist/index.html` present.

- [ ] **Step 3: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(frontend): add leaflet, react-leaflet, recharts" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C2: Types + API client

**Files:**
- Create: `frontend/src/types.ts`, `frontend/src/api.ts`, `frontend/src/api.test.ts`

- [ ] **Step 1: Create `frontend/src/types.ts`** (mirror spec §7)

```ts
export interface RoutePoint { t: number; lat: number; lon: number; speedKmh: number }
export interface SeriesPoint { t: number; v: number }

export interface DriveSummary {
  distanceKm: number;
  movingSeconds: number;
  idleSeconds: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  fuelUsedL: number;
  fuelCostEur: number;
  avgConsumptionL100km: number;
  elevationGainM: number;
  elevationLossM: number;
}

export interface DriveAnalysis {
  schemaVersion: string;
  drive: {
    source: string;
    startedAtClock: string | null;
    durationSeconds: number;
    vehicle: { label: string | null; vin: string | null; engine: string | null };
  };
  summary: DriveSummary;
  route: RoutePoint[];
  series: Record<string, SeriesPoint[]>;
  dataQuality: {
    rowCount: number;
    pidsPresent: string[];
    distanceSource: string | null;
    warnings: string[];
  };
}
```

- [ ] **Step 2: Write the failing API test** — `frontend/src/api.test.ts`

```ts
import { describe, it, expect, vi } from 'vitest';
import { analyzeDrive } from './api';

describe('analyzeDrive', () => {
  it('POSTs the file to the ingestion endpoint and returns parsed JSON', async () => {
    const stub = { schemaVersion: '1', summary: { maxSpeedKmh: 72 } };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => stub } as Response);
    globalThis.fetch = fetchMock;

    const file = new File(['x'], 'drive.csv', { type: 'text/csv' });
    const result = await analyzeDrive(file);

    expect(result).toEqual(stub);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/drives:analyze');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('throws on a non-OK response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 400 } as Response);
    await expect(analyzeDrive(new File(['x'], 'd.csv'))).rejects.toThrow('400');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd frontend && npm test -- api`
Expected: FAIL — `./api` has no `analyzeDrive` export.

- [ ] **Step 4: Create `frontend/src/api.ts`**

```ts
import type { DriveAnalysis } from './types';

export async function analyzeDrive(file: File): Promise<DriveAnalysis> {
  const form = new FormData();
  form.append('file', file);
  form.append('format', 'vertical_layout');
  const res = await fetch('/api/v1/drives:analyze', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DriveAnalysis;
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `cd frontend && npm test -- api`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/types.ts frontend/src/api.ts frontend/src/api.test.ts
git commit -m "feat(frontend): DriveAnalysis types and analyzeDrive API client" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C3: SummaryCard

**Files:**
- Create: `frontend/src/components/SummaryCard.tsx`, `frontend/src/components/SummaryCard.test.tsx`

- [ ] **Step 1: Write the failing test** — `SummaryCard.test.tsx`

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SummaryCard from './SummaryCard';
import type { DriveSummary } from '../types';

const summary: DriveSummary = {
  distanceKm: 18.4, movingSeconds: 1500, idleSeconds: 300,
  avgSpeedKmh: 44.2, maxSpeedKmh: 146, fuelUsedL: 2.31, fuelCostEur: 3.72,
  avgConsumptionL100km: 12.6, elevationGainM: 80, elevationLossM: 60,
};

describe('SummaryCard', () => {
  it('shows the headline KPIs in human units', () => {
    render(<SummaryCard summary={summary} durationSeconds={1800} />);
    expect(screen.getByText('18.4 km')).toBeInTheDocument();
    expect(screen.getByText('146 km/h')).toBeInTheDocument();
    expect(screen.getByText('2.31 L')).toBeInTheDocument();
    expect(screen.getByText('€3.72')).toBeInTheDocument();
    expect(screen.getByText('12.6 L/100km')).toBeInTheDocument();
    expect(screen.getByText('30:00')).toBeInTheDocument(); // 1800s -> mm:ss
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- SummaryCard`
Expected: FAIL — no `SummaryCard`.

- [ ] **Step 3: Create `frontend/src/components/SummaryCard.tsx`**

```tsx
import type { DriveSummary } from '../types';

function mmss(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface Props {
  summary: DriveSummary;
  durationSeconds: number;
}

export default function SummaryCard({ summary, durationSeconds }: Props) {
  const items: Array<[string, string]> = [
    ['Distance', `${summary.distanceKm} km`],
    ['Duration', mmss(durationSeconds)],
    ['Max speed', `${summary.maxSpeedKmh} km/h`],
    ['Avg speed', `${summary.avgSpeedKmh} km/h`],
    ['Fuel used', `${summary.fuelUsedL} L`],
    ['Cost', `€${summary.fuelCostEur}`],
    ['Economy', `${summary.avgConsumptionL100km} L/100km`],
    ['Elevation +/-', `${summary.elevationGainM}/${summary.elevationLossM} m`],
  ];
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ background: '#f4f4f5', borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 12, color: '#71717a' }}>{label}</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{value}</div>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npm test -- SummaryCard`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/SummaryCard.tsx frontend/src/components/SummaryCard.test.tsx
git commit -m "feat(frontend): SummaryCard KPI panel" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C4: SpeedChart (Recharts, mocked in tests)

**Files:**
- Create: `frontend/src/components/SpeedChart.tsx`, `frontend/src/components/SpeedChart.test.tsx`

- [ ] **Step 1: Write the failing test** — `SpeedChart.test.tsx` (mock recharts so jsdom has no sizing/canvas issues)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import SpeedChart from './SpeedChart';

describe('SpeedChart', () => {
  it('renders a line chart and reports the point count', () => {
    const points = [{ t: 0, v: 0 }, { t: 1, v: 36 }, { t: 2, v: 72 }];
    render(<SpeedChart points={points} />);
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
    expect(screen.getByText(/3 points/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- SpeedChart`
Expected: FAIL — no `SpeedChart`.

- [ ] **Step 3: Create `frontend/src/components/SpeedChart.tsx`**

```tsx
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SeriesPoint } from '../types';

interface Props {
  points: SeriesPoint[];
}

export default function SpeedChart({ points }: Props) {
  return (
    <section>
      <h3>Speed over time <small style={{ color: '#71717a' }}>({points.length} points)</small></h3>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(t) => `${Math.round(t)}s`} />
            <YAxis unit=" km/h" width={70} />
            <Tooltip />
            <Line type="monotone" dataKey="v" stroke="#2563eb" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npm test -- SpeedChart`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/SpeedChart.tsx frontend/src/components/SpeedChart.test.tsx
git commit -m "feat(frontend): SpeedChart line chart" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C5: RouteMap (Leaflet, mocked in tests)

**Files:**
- Create: `frontend/src/components/RouteMap.tsx`, `frontend/src/components/RouteMap.test.tsx`

- [ ] **Step 1: Write the failing test** — `RouteMap.test.tsx` (mock react-leaflet)

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polyline: (props: { positions: unknown[] }) => (
    <div data-testid="polyline" data-points={props.positions.length} />
  ),
}));

import RouteMap from './RouteMap';

describe('RouteMap', () => {
  it('renders a map with a polyline of the route points', () => {
    const route = [
      { t: 0, lat: 45.0, lon: 15.0, speedKmh: 0 },
      { t: 1, lat: 45.0, lon: 15.001, speedKmh: 36 },
    ];
    render(<RouteMap route={route} />);
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getByTestId('polyline').getAttribute('data-points')).toBe('2');
  });

  it('shows a placeholder when there is no GPS', () => {
    render(<RouteMap route={[]} />);
    expect(screen.getByText(/no gps/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- RouteMap`
Expected: FAIL — no `RouteMap`.

- [ ] **Step 3: Create `frontend/src/components/RouteMap.tsx`**

```tsx
import 'leaflet/dist/leaflet.css';
import { MapContainer, Polyline, TileLayer } from 'react-leaflet';
import type { LatLngExpression, LatLngBoundsExpression } from 'leaflet';
import type { RoutePoint } from '../types';

interface Props {
  route: RoutePoint[];
}

export default function RouteMap({ route }: Props) {
  if (route.length === 0) {
    return <p style={{ color: '#71717a' }}>No GPS data in this drive.</p>;
  }
  const positions: LatLngExpression[] = route.map((p) => [p.lat, p.lon]);
  const bounds: LatLngBoundsExpression = positions as LatLngBoundsExpression;
  return (
    <div style={{ height: 380, borderRadius: 8, overflow: 'hidden' }}>
      <MapContainer bounds={bounds} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline positions={positions} pathOptions={{ color: '#2563eb', weight: 4 }} />
      </MapContainer>
    </div>
  );
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `cd frontend && npm test -- RouteMap`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/RouteMap.tsx frontend/src/components/RouteMap.test.tsx
git commit -m "feat(frontend): RouteMap with Leaflet route polyline" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task C6: Assemble the dashboard in App

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

- [ ] **Step 1: Replace `frontend/src/App.test.tsx`** (mock the heavy libs + the API, assert the dashboard renders)

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Polyline: () => <div data-testid="polyline" />,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import App from './App';
import type { DriveAnalysis } from './types';

const analysis: DriveAnalysis = {
  schemaVersion: '1',
  drive: { source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
           vehicle: { label: 'My car', vin: null, engine: null } },
  summary: { distanceKm: 18.4, movingSeconds: 1500, idleSeconds: 300, avgSpeedKmh: 44.2,
             maxSpeedKmh: 146, fuelUsedL: 2.31, fuelCostEur: 3.72, avgConsumptionL100km: 12.6,
             elevationGainM: 80, elevationLossM: 60 },
  route: [{ t: 0, lat: 45, lon: 15, speedKmh: 0 }, { t: 1, lat: 45, lon: 15.001, speedKmh: 36 }],
  series: { speedKmh: [{ t: 0, v: 0 }, { t: 1, v: 36 }] },
  dataQuality: { rowCount: 11, pidsPresent: ['Vehicle speed'], distanceSource: 'gps', warnings: [] },
};

describe('App dashboard', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('uploads a drive and renders summary, map, and chart', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis } as Response);
    render(<App />);

    const input = screen.getByLabelText('drive file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'drive.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    await waitFor(() => expect(screen.getByText('146 km/h')).toBeInTheDocument());
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- App`
Expected: FAIL — App still renders the raw `<pre>`, no `146 km/h`.

- [ ] **Step 3: Replace `frontend/src/App.tsx`**

```tsx
import { useState } from 'react';
import { analyzeDrive } from './api';
import type { DriveAnalysis } from './types';
import SummaryCard from './components/SummaryCard';
import RouteMap from './components/RouteMap';
import SpeedChart from './components/SpeedChart';

type Phase = 'idle' | 'loading' | 'done' | 'error';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<DriveAnalysis | null>(null);
  const [error, setError] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('idle');

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
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 980, margin: '0 auto' }}>
      <h1>HrvaDrive</h1>
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
          <SummaryCard summary={analysis.summary} durationSeconds={analysis.drive.durationSeconds} />
          <RouteMap route={analysis.route} />
          <SpeedChart points={analysis.series.speedKmh ?? []} />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the whole frontend suite and watch it pass**

Run: `cd frontend && npm test`
Expected: PASS (App + api + SummaryCard + SpeedChart + RouteMap).

- [ ] **Step 5: Confirm the production build**

Run: `cd frontend && rm -rf dist && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: `tsc -b` passes and `dist/index.html` is produced.

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): dashboard with summary card, route map, and speed chart" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Part D — End-to-end integration

## Task D1: Full-stack round-trip on the real drive

**Files:** none (verification)

- [ ] **Step 1: Bring up the whole stack rebuilt**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
docker compose up --build -d
docker compose ps --format "table {{.Service}}\t{{.Status}}"
```
Expected: analysis + ingestion `healthy`, frontend up.

- [ ] **Step 2: Analyze the real file through the whole chain and check real numbers**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
curl -s --retry 60 --retry-all-errors --retry-connrefused --retry-delay 1 \
  -F "file=@data/vertical_layout (1).csv" -F "format=vertical_layout" \
  http://localhost:8090/api/v1/drives:analyze \
  | python3 -c "import sys,json; b=json.load(sys.stdin); s=b['summary']; print('schema', b['schemaVersion']); print('duration_s', round(b['drive']['durationSeconds'])); print('maxSpeed', s['maxSpeedKmh']); print('fuelL', s['fuelUsedL']); print('costEur', s['fuelCostEur']); print('distanceKm', s['distanceKm']); print('consumption', s['avgConsumptionL100km']); print('route_pts', len(b['route'])); print('speed_pts', len(b['series']['speedKmh']))"
```
Expected (matches ground truth): `schema 1`, `duration_s ≈ 2633`, `maxSpeed 146.0`, `fuelL ≈ 2.312`, `costEur ≈ 3.72`, `distanceKm` plausible (a few km to tens of km), `route_pts` and `speed_pts` both > 100.

- [ ] **Step 3: Eyeball the browser dashboard**

Open http://localhost:8090, choose `data/vertical_layout (1).csv`, click **Analyze**. Expected: the KPI card shows real numbers, the map draws the route polyline, and the speed chart renders.

- [ ] **Step 4: Tear down**

Run: `cd /Users/karlo/Developer/hrva-drive && docker compose down`

- [ ] **Step 5: Final commit (docs)** — record the verified numbers

```bash
cd /Users/karlo/Developer/hrva-drive
# (optional) note the observed summary in README "Run it" or a CHANGELOG
git commit --allow-empty -m "test(phase-1): verified real-drive summary end-to-end (146 km/h, ~2.31 L, €3.72)" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase 1 acceptance

- `cd analysis && .venv/bin/python -m pytest` — all green (parsing, metrics, routes, analysis, analyze).
- `cd ingestion && mvn test` — green (validator + controller).
- `cd frontend && npm test` — green (api, SummaryCard, SpeedChart, RouteMap, App).
- `docker compose up --build` then uploading the real `vertical_layout` file shows a correct map, a KPI card with plausible distance/duration/fuel/€/L-100km, and a speed chart — with the headline numbers matching the ground truth (max 146 km/h, ~2.31 L, €3.72, ~44 min).

## Self-review notes (done while writing)

- **Spec coverage (design §9 v1):** distance/duration/moving-idle/avg-max-speed/fuel/cost/L-100km/elevation (Tasks A2–A5), route polyline (A4/C5), speed series + chart (A4/C4), KPI card (C3), validation (B1). Out-of-scope Phase 2 items are intentionally excluded.
- **Contract consistency:** the frontend `types.ts` field names mirror the Pydantic `models.py` / spec §7 exactly (`schemaVersion`, `summary.*`, `route[].speedKmh`, `series.speedKmh[].v`, `dataQuality.distanceSource`).
- **Method consistency:** `metrics.series/gps_track/speed_source/resample_1hz` are defined in A2 and reused by A3/A4/A5; `routes.route_points/speed_series` defined in A4 and used by A5; `analyzeDrive` defined in C2 and used by C6.
- **jsdom safety:** map/chart libs are mocked in component and App tests, so no canvas/sizing failures; the real libs are exercised only in the browser step (D1).
- **No placeholders:** every code/command step is complete and runnable.
```
