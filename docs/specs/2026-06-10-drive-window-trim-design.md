# Feature 9 — Trim to the driving window (design)

**Date:** 2026-06-10
**Status:** approved (design) → ready for implementation plan
**Roadmap item:** Next-batch #9 — originally "trip/leg segmentation"; reframed after investigation.

## What the investigation changed

Probed the real logs for time gaps (candidate leg boundaries). ~⅓ of drives have a >120 s gap, but in
**every** gappy file the driving PIDs (speed/RPM) exist on only ONE side of the gap:

| file | gap | speed samples before / after |
|---|---|---|
| 2026-01-30 19-28-40 | 20 min | 8019 / **0** |
| 2026-01-30 18-36-35 | 34 min | 3672 / **0** |
| 2026-02-07 00-36-21 | 5 min | 10610 / **0** |
| 2026-01-28 06-39-36 | 7 min | **0** / 10322 |

So these are **not** multi-stop journeys — they are single drives with a **leading or trailing parked
diagnostic snapshot** (Car Scanner logging its one-shot PIDs at connect/disconnect, minutes from the
drive). There is nothing to "segment". But the inflation is real: `duration = max(t) − min(t)` and the
1 Hz grid both include the dead parked period, so a 71-min file with a 33-min tail over-reports
duration and drags down avg speed. **Decision (user-approved): trim the drive window to the actual
driving span** instead of leg-splitting.

## Core change — one helper, two chokepoints (`analysis/app/metrics.py`)

```python
def drive_window(df: pd.DataFrame) -> tuple[float, float]:
    """The driving span [t0, t1]: first to last engine-on (Engine RPM > 0) sample, so a leading/
    trailing parked diagnostic snapshot doesn't inflate duration or the 1 Hz grid.
    Fallbacks: no RPM PID -> the speed signal's span; RPM never > 0 -> the full span."""
    rpm = series(df, "Engine RPM")
    on = rpm[rpm["value"] > 0]["t"] if not rpm.empty else rpm["t"]
    if not on.empty:
        return float(on.min()), float(on.max())
    src = speed_source(df)
    if src is not None and not series(df, src).empty:
        s = series(df, src)["t"]
        return float(s.min()), float(s.max())
    return float(df["t"].min()), float(df["t"].max())
```

- **`duration_seconds`** → `t1 - t0` from `drive_window(df)` (the driving span, not `max − min`).
- **`resample_1hz`** → build the grid over `[floor(t0), ceil(t1)]` from `drive_window(df)` instead of the
  whole file. Everything grid-based (avg speed, idle %, rpm-band %, steadiness, events, economy idle
  rate / efficiency curve, gears) then computes over the real drive.

`distance`/`fuel` need **no change**: the cumulative `Distance travelled` / `Fuel used` PIDs already stop
before the tail, so `odometer_km` / `fuel_used_l` are already correct.

## Honesty — a data-quality warning

```python
_TRIM_WARN_S = 60.0

def trim_warnings(df: pd.DataFrame) -> list[str]:
    t0, t1 = drive_window(df)
    trimmed = float(df["t"].max() - df["t"].min()) - (t1 - t0)
    if trimmed > _TRIM_WARN_S:
        return [f"excluded {trimmed / 60:.0f} min of engine-off logging (likely a parked "
                f"diagnostic snapshot) so duration reflects the actual drive"]
    return []
```

Add `+ metrics.trim_warnings(df)` to the `dataQuality.warnings` concatenation in `analysis.py` (which
already joins `distance_warnings + time_warnings + quality_warnings`). No new model fields — the
corrected `duration` plus this warning tell the whole story.

## Blast radius

For a normal drive RPM > 0 spans essentially the whole file, so the window ≈ the full span and nothing
changes. Only drives with leading/trailing engine-off samples (the ~⅓ with gaps) are corrected. The
synthetic test fixture (RPM 800/2000/3000 throughout, no zero-RPM ends) is unaffected → existing tests
stay green. `drive_window` is recomputed inside each `resample_1hz` call (a cheap series filter, ~10–15×
per analysis — negligible).

## Testing

- `drive_window` trims leading AND trailing `RPM=0` samples to the inner engine-on span; falls back to
  the speed span when RPM is absent; falls back to the full span when RPM is never > 0.
- `duration_seconds` returns the driving span, not `max − min`, on a frame with engine-off ends.
- `resample_1hz` grid rows all fall within `[floor(t0), ceil(t1)]` (no rows in the trimmed dead zone).
- `trim_warnings` fires (non-empty, with the minutes) when > 60 s is trimmed; empty otherwise (and empty
  on the synthetic fixture).
- Regression: full backend suite green; `scripts/batch_analyze.py` clean over `data/exported_records`
  (spot-check that a known gappy file's reported duration drops to the driving span).

## Out of scope

General mid-drive gap segmentation (no such data — driving is always contiguous); trimming the GPS
route/map (a leading "home" point is accurate); any new model fields or UI beyond the warning.
