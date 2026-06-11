import pandas as pd

from app import metrics
from app.events import detect_events


def _row(t, pid, value):
    return {"t": float(t), "pid": pid, "value": float(value), "unit": "", "lat": None, "lon": None}


def _engine_off_gap_df():
    """The realistic errand stop: drive, pull over and idle 10 s, kill the
    engine — the adapter goes silent for 300 s while the logger keeps running —
    then restart and drive again. The stale idle samples (speed 0, rpm 800)
    must not be smeared across the 300 s engine-off gap."""
    rows = []
    for t in range(0, 51):
        rows.append(_row(t, "Vehicle speed", 50.0))
        rows.append(_row(t, "Engine RPM", 2000))
    for t in range(51, 61):  # idling at the curb just before shutdown
        rows.append(_row(t, "Vehicle speed", 0.0))
        rows.append(_row(t, "Engine RPM", 800))
    for t in range(360, 421):
        rows.append(_row(t, "Vehicle speed", 50.0))
        rows.append(_row(t, "Engine RPM", 2000))
    return pd.DataFrame(rows)


def test_engine_off_gap_is_not_idle():
    mv = metrics.moving_idle_seconds(_engine_off_gap_df())
    # ~10 s of true idling + at most _STALE_S grace at the gap edge; the
    # 300 s engine-off gap must count as NEITHER moving nor idle
    assert mv["idleSeconds"] <= 45
    assert mv["movingSeconds"] <= 130


def test_engine_off_gap_produces_no_idle_event():
    evts = [e for e in detect_events(_engine_off_gap_df()) if e.type == "idle"]
    # one true idle span at the start; no 300 s phantom idle event
    assert all(e.durationSeconds < 60 for e in evts)
