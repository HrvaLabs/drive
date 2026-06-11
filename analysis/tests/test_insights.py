import pandas as pd

from app import metrics, scores


def test_co2_kg_petrol_factor():
    assert metrics.co2_kg(10.0) == 23.1


def test_climb_energy_kwh_lifts_mass():
    # 1300 kg lifted 100 m = 1300 * 9.81 * 100 J ≈ 0.354 kWh
    assert abs(metrics.climb_energy_kwh(100.0) - 0.35) < 0.02


def _speed_df(speeds):
    return pd.DataFrame(
        [{"t": float(t), "pid": "Vehicle speed", "value": float(s), "unit": "", "lat": None, "lon": None}
         for t, s in enumerate(speeds)]
    )


def test_trip_context_city_has_high_stop_go():
    trip, stop_go = metrics.trip_context(_speed_df([5, 8, 0, 10, 12, 6, 0, 9, 11, 7]), 8.0)
    assert trip == "city" and stop_go == 100.0


def test_trip_context_highway_has_no_stop_go():
    trip, stop_go = metrics.trip_context(_speed_df([90, 95, 100, 92, 88, 110, 105, 96, 98, 101]), 97.0)
    assert trip == "highway" and stop_go == 0.0


def test_short_shift_flags_low_gear_revs_not_top_gear():
    # First half: 30 km/h at 3000 rpm (ratio 100 = a low gear -> short-shiftable).
    # Second half: 120 km/h at 3000 rpm (ratio 25 = top gear at speed -> NOT flagged).
    rows = []
    for i in range(60):
        rows += [{"t": float(i), "pid": "Vehicle speed", "value": 30.0, "unit": "", "lat": None, "lon": None},
                 {"t": float(i), "pid": "Engine RPM", "value": 3000.0, "unit": "", "lat": None, "lon": None}]
    for i in range(60):
        t = float(60 + i)
        rows += [{"t": t, "pid": "Vehicle speed", "value": 120.0, "unit": "", "lat": None, "lon": None},
                 {"t": t, "pid": "Engine RPM", "value": 3000.0, "unit": "", "lat": None, "lon": None}]
    pct = scores.short_shift_pct(pd.DataFrame(rows))
    assert 40.0 <= pct <= 60.0  # ~the low-gear half, not the top-gear half
