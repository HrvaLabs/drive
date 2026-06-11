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
            min=round(float(s["value"].min()), 2),
            max=round(float(s["value"].max()), 2),
            mean=round(float(s["value"].mean()), 2),
            points=[SeriesPoint(t=float(r.t), v=round(float(r.value), 2)) for r in ds.itertuples()],
        )
    return out
