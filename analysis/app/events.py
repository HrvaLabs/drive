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
# A harsh event must persist this long to count — a lone over-threshold sample is
# a sensor spike, not real braking/acceleration (telematics convention is ~1 s).
_MIN_HARSH_S = 0.8


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
    grid = metrics.resample_1hz(df, [src, "Engine RPM"], tolerance=metrics._STALE_S)
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

    def _classify(g: float) -> str | None:
        if g >= _HARD_ACCEL_G:
            return "hard_accel"
        if g <= _HARD_BRAKE_G:
            return "hard_brake"
        return None

    # Group consecutive same-kind samples into runs; a direction change (accel
    # directly followed by brake) starts a new run, so both still register.
    out = []
    run_kind: str | None = None
    run_t0 = run_t1 = 0.0
    run_peak = 0.0

    def _flush() -> None:
        # Only a sustained run counts — this drops single-sample spikes (span 0).
        if run_kind is not None and run_t1 - run_t0 >= _MIN_HARSH_S:
            lat, lon = _nearest_gps(track, run_t0)
            out.append(Event(type=run_kind, t=run_t0, lat=lat, lon=lon,
                             value=round(run_peak, 3), durationSeconds=round(run_t1 - run_t0, 1)))

    for r in accel.itertuples():
        g = float(r.value)
        kind = _classify(g)
        if kind == run_kind and kind is not None:
            run_t1 = float(r.t)
            run_peak = max(run_peak, g) if kind == "hard_accel" else min(run_peak, g)
        else:
            _flush()
            run_kind = kind
            run_t0 = run_t1 = float(r.t)
            run_peak = g
    _flush()
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
