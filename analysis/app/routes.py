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
