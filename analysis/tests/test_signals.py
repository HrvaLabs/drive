import pandas as pd

from app import signals


def _df(rows):
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": u, "lat": None, "lon": None} for (t, p, v, u) in rows]
    )


def test_build_signals_summarizes_each_pid():
    rows = [(0.0, "Engine RPM", 1000.0, "rpm"), (1.0, "Engine RPM", 3000.0, "rpm"),
            (0.0, "Throttle position", 10.0, "%")]
    sig = signals.build_signals(_df(rows))
    assert set(sig.keys()) == {"Engine RPM", "Throttle position"}
    rpm = sig["Engine RPM"]
    assert rpm.unit == "rpm"
    assert rpm.n == 2
    assert rpm.min == 1000.0
    assert rpm.max == 3000.0
    assert rpm.mean == 2000.0
    assert len(rpm.points) == 2


def test_build_signals_downsamples_to_cap():
    rows = [(float(t), "Engine RPM", float(t), "rpm") for t in range(0, 1000)]
    sig = signals.build_signals(_df(rows), max_points=100)
    assert sig["Engine RPM"].n == 1000          # full count preserved in stats
    assert len(sig["Engine RPM"].points) <= 100  # but points are downsampled
