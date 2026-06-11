import numpy as np
import pandas as pd

from app import metrics
from app.models import GearPoint, GearUsage, Gears

_MIN_KMH = 6.0          # below this is clutch-slip / creep, not a clean gear
_MIN_RPM = 900.0        # above idle
_MAX_SCATTER = 250      # downsample cap for the chart
_ASSIGN_TOL = 0.10      # a sample within 10% of a ratio is "in" that gear
_MERGE_FRAC = 0.06      # merge histogram peaks within 6% of the ratio span
_LABELS = ("tallest used", "one below", "two below", "three below", "four below")


def _label(i: int) -> str:
    return _LABELS[i] if i < len(_LABELS) else f"{i} below"


def _moving(df: pd.DataFrame) -> pd.DataFrame | None:
    """1 Hz same-instant grid of moving samples with their RPM/speed ratio."""
    src = metrics.speed_source(df)
    if src is None:
        return None
    grid = metrics.resample_1hz(df, [src, "Engine RPM"]).dropna(subset=[src, "Engine RPM"])
    g = grid[(grid[src] >= _MIN_KMH) & (grid["Engine RPM"] >= _MIN_RPM)].copy()
    if g.empty:
        return None
    g = g.rename(columns={src: "speed", "Engine RPM": "rpm"})
    g["ratio"] = g["rpm"] / g["speed"]
    return g[["speed", "rpm", "ratio"]].reset_index(drop=True)


def _detect_ratios(g: pd.DataFrame) -> list[float]:
    """Histogram-peak the steady-sample ratios -> gear ratios ascending (tallest first)."""
    dspeed = g["speed"].diff().abs()
    dratio = g["ratio"].diff().abs()
    steady = g["ratio"][(dspeed <= 1.5) & (dratio <= g["ratio"] * 0.04)].to_numpy()
    if len(steady) < 40:
        return []
    lo, hi = float(np.percentile(steady, 1)), float(np.percentile(steady, 99))
    if hi <= lo:
        return []
    pad = (hi - lo) * 0.04  # so a peak sitting at lo/hi lands in an interior bin
    hist, edges = np.histogram(steady, bins=np.linspace(lo - pad, hi + pad, 62))
    centers = (edges[:-1] + edges[1:]) / 2
    thr = max(hist.max() * 0.15, len(steady) * 0.01)
    span = hi - lo
    peaks: list[float] = []
    heights: list[int] = []
    for i in range(1, len(hist) - 1):
        if hist[i] >= thr and hist[i] >= hist[i - 1] and hist[i] >= hist[i + 1]:
            if peaks and centers[i] - peaks[-1] <= span * _MERGE_FRAC:
                if hist[i] > heights[-1]:
                    peaks[-1], heights[-1] = float(centers[i]), int(hist[i])
            else:
                peaks.append(float(centers[i]))
                heights.append(int(hist[i]))
    return [round(p, 1) for p in sorted(peaks)]


def _assign(ratio: float, ratios: list[float]) -> int | None:
    if not ratios:
        return None
    rel = [abs(ratio - r) / r for r in ratios]
    j = int(np.argmin(rel))
    return j if rel[j] <= _ASSIGN_TOL else None


def build_gears(df: pd.DataFrame) -> Gears:
    g = _moving(df)
    if g is None or g.empty:
        return Gears()
    ratios = _detect_ratios(g)
    assigned = [_assign(float(r), ratios) for r in g["ratio"]]
    n = len(g)
    usage = [
        GearUsage(label=_label(i), ratio=r,
                  pct=round(sum(1 for a in assigned if a == i) / n * 100.0, 1))
        for i, r in enumerate(ratios)
    ]
    unassigned = sum(1 for a in assigned if a is None)
    step = max(1, int(np.ceil(n / _MAX_SCATTER)))
    points = [
        GearPoint(speedKmh=round(float(g["speed"].iloc[k]), 1),
                  rpm=round(float(g["rpm"].iloc[k]), 0),
                  gear=assigned[k])
        for k in range(0, n, step)
    ]
    return Gears(ratios=ratios, usage=usage,
                 unassignedPct=round(unassigned / n * 100.0, 1), points=points)
