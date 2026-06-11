import numpy as np
import pandas as pd

from app import gears


def _df(rows):
    """rows: list of (t, speed_kmh, rpm). Emits two PID rows per t."""
    recs = []
    for t, spd, rpm in rows:
        recs.append({"t": t, "pid": "Vehicle speed", "value": spd, "unit": "km/h", "lat": np.nan, "lon": np.nan})
        recs.append({"t": t, "pid": "Engine RPM", "value": rpm, "unit": "rpm", "lat": np.nan, "lon": np.nan})
    return pd.DataFrame(recs)


def _two_gear_rows():
    # Gear A ratio ~30 (top), Gear B ratio ~40 (one below), each held steady ~60s.
    rows = []
    t = 0.0
    for spd in np.linspace(40, 58, 60):          # ratio 30 band
        rows.append((t, float(spd), float(30.0 * spd))); t += 1
    for spd in np.linspace(22, 34, 60):          # ratio 40 band
        rows.append((t, float(spd), float(40.0 * spd))); t += 1
    return rows


def test_detects_two_gear_ratios_ascending():
    g = gears.build_gears(_df(_two_gear_rows()))
    assert len(g.ratios) == 2
    assert 29 <= g.ratios[0] <= 31      # tallest (lowest ratio) first
    assert 39 <= g.ratios[1] <= 41
    assert g.ratios[0] < g.ratios[1]


def test_usage_labels_and_pcts():
    import pytest
    g = gears.build_gears(_df(_two_gear_rows()))
    assert [u.label for u in g.usage] == ["tallest used", "one below"]
    assert sum(u.pct for u in g.usage) + g.unassignedPct == pytest.approx(100.0, abs=0.5)
    assert all(u.ratio > 0 for u in g.usage)
    # pin _assign: a clean two-gear drive must actually assign most samples to a
    # gear (a broken/no-op assignment would leave both pcts at 0 and unassigned=100).
    assert g.usage[0].pct > 20 and g.usage[1].pct > 20


def test_detects_three_gears_and_assigns_them():
    rows = _two_gear_rows()
    t = rows[-1][0] + 1
    for spd in np.linspace(17, 25, 60):          # ratio 55 band (two below), rpm >= 935
        rows.append((t, float(spd), float(55.0 * spd))); t += 1
    g = gears.build_gears(_df(rows))
    assert len(g.ratios) == 3
    assert g.ratios[0] < g.ratios[1] < g.ratios[2]
    assert [u.label for u in g.usage] == ["tallest used", "one below", "two below"]
    assert all(u.pct > 10 for u in g.usage)      # all three gears actually got samples


def test_off_ratio_samples_are_unassigned_not_forced():
    rows = _two_gear_rows()
    # clutch-disengage sweep: revs fall (1300->950, above the 900 idle floor) while
    # speed holds ~52 km/h, so the ratio sweeps 25->18 — always >10% off both gears
    # (30/40) and, being a sweep, never a histogram peak. Must stay UNASSIGNED.
    t = rows[-1][0] + 1
    for rpm_val in np.linspace(1300, 950, 20):
        rows.append((t, 52.0, float(rpm_val))); t += 1
    g = gears.build_gears(_df(rows))
    assert g.unassignedPct > 0  # the off-ratio stretch is not force-fit into a gear
    assert all(p.gear in (0, 1, None) for p in g.points)


def test_scatter_is_capped():
    rows = [(float(i), 50.0, 1500.0) for i in range(1000)]
    g = gears.build_gears(_df(rows))
    assert len(g.points) <= 250


def test_fallback_when_no_steady_data():
    g = gears.build_gears(_df([(0.0, 0.0, 800.0), (1.0, 0.0, 800.0)]))
    assert g.ratios == []
    assert g.usage == []


def test_no_speed_signal_returns_empty():
    df = pd.DataFrame([{"t": 0.0, "pid": "Engine RPM", "value": 2000, "unit": "rpm", "lat": np.nan, "lon": np.nan}])
    g = gears.build_gears(df)
    assert g.ratios == [] and g.points == []
