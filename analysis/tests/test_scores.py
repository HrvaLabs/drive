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
