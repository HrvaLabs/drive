import pandas as pd

from app import bests


def _df(rows):
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows]
    )


def test_bests_pick_the_peaks():
    rows = [
        (0.0, "Instant engine power (based on fuel consumption)", 40.0),
        (1.0, "Instant engine power (based on fuel consumption)", 79.6),
        (0.0, "Vehicle speed", 100.0), (1.0, "Vehicle speed", 146.0),
        (0.0, "Engine RPM", 2000.0), (1.0, "Engine RPM", 3355.0),
        (0.0, "Calculated boost", 0.71), (0.0, "Vehicle acceleration", 0.2653),
    ]
    b = bests.build_bests(_df(rows))
    assert b.maxHp == 79.6
    assert b.topSpeedKmh == 146.0
    assert b.maxRpm == 3355.0
    assert b.peakBoostBar == 0.71
    assert b.maxAccelG == 0.27  # 0.2653 rounded to 2dp


def test_absent_signals_are_none():
    b = bests.build_bests(_df([(0.0, "Vehicle speed", 50.0)]))
    assert b.topSpeedKmh == 50.0
    assert b.maxHp is None
    assert b.peakBoostBar is None


def test_peak_boost_falls_back_to_map_when_calculated_is_flat():
    # "Calculated boost" reads flat-zero for some cars; derive gauge boost from
    # absolute manifold pressure minus barometric: (170 - 100) / 100 = 0.7 bar.
    rows = [
        (0.0, "Calculated boost", 0.0), (1.0, "Calculated boost", 0.0),
        (0.0, "Intake manifold absolute pressure", 40.0),
        (1.0, "Intake manifold absolute pressure", 170.0),
        (0.0, "Barometric pressure", 100.0),
    ]
    assert bests.build_bests(_df(rows)).peakBoostBar == 0.7
