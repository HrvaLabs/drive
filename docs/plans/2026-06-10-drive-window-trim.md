# Trim to the Driving Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Base a drive's `duration` and the 1 Hz analysis grid on the actual driving span (first→last engine-on sample), so a leading/trailing parked diagnostic snapshot stops inflating duration / avg-speed / idle.

**Architecture:** One helper `drive_window(df)` in `analysis/app/metrics.py` (first→last `Engine RPM > 0` sample, with fallbacks); `duration_seconds` and `resample_1hz` use it; a `trim_warnings(df)` adds an honest `dataQuality` note when >60 s is trimmed, wired into `analysis.py`. Backward-compatible: a normal drive's window ≈ the full span, so nothing changes. Spec: `docs/specs/2026-06-10-drive-window-trim-design.md`.

**Tech Stack:** Python (pandas/numpy, pytest). Run pytest from `analysis/` via `.venv/bin/python`.

---

## File structure

- **Modify** `analysis/app/metrics.py` — add `drive_window`; route `duration_seconds` + `resample_1hz` through it; add `_TRIM_WARN_S` + `trim_warnings`.
- **Modify** `analysis/tests/test_metrics.py` — tests for `drive_window`, the corrected `duration_seconds`, the windowed grid, and `trim_warnings`.
- **Modify** `analysis/app/analysis.py` — add `metrics.trim_warnings(df)` to the `dataQuality.warnings` concat.

Helper for the tests (add near the top of `test_metrics.py`, after the existing imports):

```python
def _rpm_df(rows):
    """rows: list of (t, rpm) -> a df of Engine RPM samples (for drive_window tests)."""
    import pandas as pd
    return pd.DataFrame([
        {"t": float(t), "pid": "Engine RPM", "value": float(rpm), "unit": "rpm", "lat": None, "lon": None}
        for t, rpm in rows
    ])
```

---

### Task 1: `drive_window` helper + corrected `duration_seconds`

**Files:**
- Modify: `analysis/app/metrics.py`
- Test: `analysis/tests/test_metrics.py`

- [ ] **Step 1: Write the failing tests** (add to `analysis/tests/test_metrics.py`, plus the `_rpm_df` helper above if not already present):

```python
def test_drive_window_trims_engine_off_ends():
    rows = ([(t, 0.0) for t in (0, 1, 2)]           # leading engine-off
            + [(t, 1500.0) for t in range(3, 11)]    # driving (RPM>0) 3..10
            + [(t, 0.0) for t in (11, 12, 13)])      # trailing engine-off
    assert metrics.drive_window(_rpm_df(rows)) == (3.0, 10.0)


def test_duration_excludes_engine_off_ends():
    rows = ([(t, 0.0) for t in (0, 1, 2)]
            + [(t, 1500.0) for t in range(3, 11)]
            + [(t, 0.0) for t in (11, 12, 13)])
    assert metrics.duration_seconds(_rpm_df(rows)) == 7.0  # 10 - 3, not 13 - 0


def test_drive_window_falls_back_to_speed_when_no_rpm():
    import pandas as pd
    df = pd.DataFrame([
        {"t": float(t), "pid": "Vehicle speed", "value": float(v), "unit": "km/h", "lat": None, "lon": None}
        for t, v in [(5, 10), (6, 20), (7, 0)]
    ])
    assert metrics.drive_window(df) == (5.0, 7.0)


def test_drive_window_full_span_when_rpm_never_on():
    # RPM present but always 0, no speed signal -> no trim, full span
    assert metrics.drive_window(_rpm_df([(0.0, 0.0), (1.0, 0.0), (2.0, 0.0)])) == (0.0, 2.0)
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -k "drive_window or duration_excludes" -q`
Expected: FAIL — `metrics.drive_window` does not exist; `duration_excludes` fails because `duration_seconds` still returns `max - min` (13.0).

- [ ] **Step 3: Add `drive_window` and route `duration_seconds` through it**

In `analysis/app/metrics.py`, add `drive_window` immediately above `duration_seconds`, and replace `duration_seconds`:

```python
def drive_window(df: pd.DataFrame) -> tuple[float, float]:
    """The driving span [t0, t1]: first to last engine-on (Engine RPM > 0) sample, so a
    leading/trailing parked diagnostic snapshot doesn't inflate duration or the 1 Hz grid.
    Fallbacks: no RPM PID / RPM never > 0 -> the speed signal's span; else the full span."""
    rpm = series(df, "Engine RPM")
    on = rpm[rpm["value"] > 0]["t"] if not rpm.empty else rpm.get("t", pd.Series(dtype=float))
    if not on.empty:
        return float(on.min()), float(on.max())
    src = speed_source(df)
    if src is not None and not series(df, src).empty:
        s = series(df, src)["t"]
        return float(s.min()), float(s.max())
    return float(df["t"].min()), float(df["t"].max())


def duration_seconds(df: pd.DataFrame) -> float:
    t0, t1 = drive_window(df)
    return float(t1 - t0)
```

(`pd` and `series` are already imported/defined in this module. `series` returns columns `["t", "value"]`, so `rpm["value"]` and `rpm["t"]` are valid; when `rpm` is empty, `rpm.get("t", ...)` yields an empty Series so the fallback runs.)

- [ ] **Step 4: Run to verify they pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -k "drive_window or duration" -q`
Expected: PASS (the 4 new tests + the existing `test_duration_seconds` which is unaffected — synthetic RPM is 800/2000/3000, so its window is the full span).

- [ ] **Step 5: Commit**

```bash
git add analysis/app/metrics.py analysis/tests/test_metrics.py
git commit -m "feat(metrics): drive_window helper; duration excludes engine-off ends"
```

---

### Task 2: `resample_1hz` builds its grid over the driving window

**Files:**
- Modify: `analysis/app/metrics.py` (`resample_1hz`)
- Test: `analysis/tests/test_metrics.py`

- [ ] **Step 1: Write the failing test**

```python
def test_resample_1hz_grid_within_drive_window():
    rows = ([(t, 0.0) for t in (0, 1, 2)]
            + [(t, 1500.0) for t in range(3, 11)]
            + [(t, 0.0) for t in (11, 12, 13)])
    grid = metrics.resample_1hz(_rpm_df(rows), ["Engine RPM"])
    # the trimmed engine-off ends must not appear in the grid
    assert grid["t"].min() >= 3.0
    assert grid["t"].max() <= 10.0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py::test_resample_1hz_grid_within_drive_window -q`
Expected: FAIL — the grid still spans `floor(0)..ceil(13)`, so `grid["t"].max()` is 13.0.

- [ ] **Step 3: Use the driving window for the grid bounds**

In `analysis/app/metrics.py`, change the first two lines of `resample_1hz` (the `t0`/`t1` derivation) from the whole-file min/max to the driving window:

```python
def resample_1hz(df: pd.DataFrame, pids: list[str]) -> pd.DataFrame:
    """A 1Hz time grid with each PID forward-filled onto it (backward asof).
    Bounds are the driving window (drive_window) so leading/trailing engine-off
    samples don't inflate the grid."""
    w0, w1 = drive_window(df)
    t0 = float(np.floor(w0))
    t1 = float(np.ceil(w1))
    grid = pd.DataFrame({"t": np.arange(t0, t1 + 1.0, 1.0)})
    for pid in pids:
        s = series(df, pid).rename(columns={"value": pid})
        if s.empty:
            grid[pid] = np.nan
        else:
            grid = pd.merge_asof(grid, s, on="t", direction="backward")
    return grid
```

(Only the bound computation changed; the merge loop is identical.)

- [ ] **Step 4: Run to verify it passes + full metrics suite**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -q`
Expected: PASS. The synthetic-based grid tests are unaffected (synthetic window = full span). If a different existing test breaks because its fixture has engine-off samples at an end, STOP and report it (don't silently change unrelated assertions).

- [ ] **Step 5: Commit**

```bash
git add analysis/app/metrics.py analysis/tests/test_metrics.py
git commit -m "feat(metrics): resample_1hz grid spans the driving window only"
```

---

### Task 3: `trim_warnings` + wire into the analysis response

**Files:**
- Modify: `analysis/app/metrics.py` (add `_TRIM_WARN_S` + `trim_warnings`)
- Modify: `analysis/app/analysis.py` (warnings concat)
- Test: `analysis/tests/test_metrics.py`

- [ ] **Step 1: Write the failing tests**

```python
def test_trim_warning_fires_when_significant():
    # driving 0..100 (RPM>0), then a single engine-off sample 200 s later -> trim 200s > 60
    rows = [(t, 1500.0) for t in range(0, 101)] + [(300.0, 0.0)]
    w = metrics.trim_warnings(_rpm_df(rows))
    assert len(w) == 1
    assert "min of engine-off" in w[0]


def test_no_trim_warning_when_clean(synthetic_df):
    assert metrics.trim_warnings(synthetic_df) == []
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -k trim_warning -q`
Expected: FAIL — `metrics.trim_warnings` does not exist.

- [ ] **Step 3: Add `trim_warnings` to `metrics.py`**

Add near the existing `time_warnings` / `quality_warnings` functions (end of `analysis/app/metrics.py`):

```python
_TRIM_WARN_S = 60.0  # only flag a meaningful trim, not a few seconds of parking


def trim_warnings(df: pd.DataFrame) -> list[str]:
    """Flag when a parked diagnostic snapshot was trimmed from the drive window, so the
    user knows duration now reflects the actual drive."""
    t0, t1 = drive_window(df)
    trimmed = float(df["t"].max() - df["t"].min()) - (t1 - t0)
    if trimmed > _TRIM_WARN_S:
        return [f"excluded {trimmed / 60:.0f} min of engine-off logging (likely a parked "
                f"diagnostic snapshot) so duration reflects the actual drive"]
    return []
```

- [ ] **Step 4: Wire it into `analysis.py`**

In `analysis/app/analysis.py`, find the `DataQuality(... warnings=...)` argument (currently
`warnings=distance_warnings + metrics.time_warnings(df) + metrics.quality_warnings(df, distance, distance_source)`)
and append `trim_warnings`:

```python
            warnings=distance_warnings + metrics.time_warnings(df)
            + metrics.quality_warnings(df, distance, distance_source)
            + metrics.trim_warnings(df),
```

- [ ] **Step 5: Run the metrics tests + the full backend suite**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -k trim_warning -q` → PASS.
Then `cd analysis && .venv/bin/python -m pytest -q` → ALL green.

- [ ] **Step 6: Regression on real drives + spot-check the trim**

Run: `cd analysis && .venv/bin/python ../scripts/batch_analyze.py`
Expected: completes with no tracebacks. The duration column for the known gappy files now reflects the
driving span (e.g. `2026-06-04 08-15-56` drops from ~71 to ~35 min), and those rows show an extra
`warn` count. Clean drives are unchanged.

- [ ] **Step 7: Commit**

```bash
git add analysis/app/metrics.py analysis/app/analysis.py analysis/tests/test_metrics.py
git commit -m "feat(analysis): warn when a parked diagnostic tail is trimmed from the drive"
```

---

## Self-review

**Spec coverage:**
- `drive_window` (first→last RPM>0; fallbacks to speed span, then full span) → Task 1. ✓
- `duration_seconds` uses the window → Task 1. ✓
- `resample_1hz` grid over the window (cascades the fix to avg-speed/idle/events/economy/gears) → Task 2. ✓
- `trim_warnings` at the 60 s gate, wired into `dataQuality.warnings` → Task 3. ✓
- Distance/fuel unchanged (no task touches `odometer_km`/`fuel_used_l`) → consistent with spec. ✓
- Low blast radius / existing tests green (synthetic window = full span) → noted in Tasks 1, 2 verification. ✓
- Regression spot-check that a gappy file's duration drops + warning appears → Task 3 Step 6. ✓
- No new model fields / no UI change → none planned, matches spec. ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `drive_window(df) -> tuple[float, float]` is defined in Task 1 and consumed by `resample_1hz` (Task 2) and `trim_warnings` (Task 3) with the same `(t0, t1)` shape. `trim_warnings(df) -> list[str]` matches the other `*_warnings` functions concatenated in `analysis.py`. The `_rpm_df` test helper is defined once and reused across all three tasks' tests.
