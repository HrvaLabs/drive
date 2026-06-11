import numpy as np
import pandas as pd

from app import metrics
from app.geo import haversine_km


def _rpm_df(rows):
    """rows: list of (t, rpm) -> a df of Engine RPM samples (for drive_window tests)."""
    return pd.DataFrame([
        {"t": float(t), "pid": "Engine RPM", "value": float(rpm), "unit": "rpm", "lat": None, "lon": None}
        for t, rpm in rows
    ])


def test_haversine_one_degree_lon_at_equator():
    # ~111.32 km per degree of longitude at the equator
    d = haversine_km(np.array([0.0]), np.array([0.0]), np.array([0.0]), np.array([1.0]))
    assert abs(float(d[0]) - 111.32) < 0.2


def test_gps_distance_sums_track(synthetic_df):
    # three fixes moving east ~0.001 deg lon each step at lat 45 (~0.0787 km/step)
    km = metrics.gps_distance_km(synthetic_df)
    assert 0.14 < km < 0.18


def test_resolve_distance_prefers_odometer():
    import pandas as pd
    # GPS track ~0.16 km, but the "Distance travelled" odometer says 0.40 km -> odometer wins
    df = pd.DataFrame({
        "t": [0.0, 1.0, 2.0],
        "pid": ["Distance travelled", "Vehicle speed", "Distance travelled"],
        "value": [0.0, 36.0, 0.40],
        "unit": ["km", "km/h", "km"],
        "lat": [45.0, 45.0, 45.0],
        "lon": [15.0, 15.001, 15.002],
    })
    km, source, warnings = metrics.resolve_distance(df)
    assert km == 0.4
    assert source == "odometer"
    assert len(warnings) == 1  # GPS disagrees with odometer by >15%


def test_resolve_distance_falls_back_to_gps(synthetic_df):
    km, source, _warnings = metrics.resolve_distance(synthetic_df)
    assert source == "gps"  # synthetic fixture has no "Distance travelled" PID
    assert 0.14 < km < 0.18


def test_duration_seconds(synthetic_df):
    assert metrics.duration_seconds(synthetic_df) == 2.0


def test_speed_stats_prefers_vehicle_speed(synthetic_df):
    stats = metrics.speed_stats(synthetic_df)
    assert stats["maxSpeedKmh"] == 72.0
    assert stats["source"] == "Vehicle speed"
    # 1Hz-resampled speed [0, 36, 72] -> time-weighted mean 36.0 (pins avgSpeed)
    assert stats["avgSpeedKmh"] == 36.0


def test_idle_and_moving_seconds(synthetic_df):
    mv = metrics.moving_idle_seconds(synthetic_df)
    # second @100 speed 0 & rpm 800 -> idle; @101 (36) & @102 (72) -> moving
    assert mv["idleSeconds"] == 1
    assert mv["movingSeconds"] == 2


def test_fuel_used_prefers_cumulative_pid(synthetic_df):
    used, source = metrics.fuel_used_l(synthetic_df)
    assert used == 0.25
    assert source == "Fuel used"


def test_fuel_cost_manual_price_overrides_logged(synthetic_df):
    # synthetic logs Fuel used price=0.40, but an explicit €/L must win: 0.25 L * 2.0 = 0.50
    assert metrics.fuel_cost_eur(synthetic_df, fuel_l=0.25, price_per_l=2.0) == 0.50


def test_fuel_cost_uses_logged_price_when_no_override(synthetic_df):
    # no manual price -> fall back to the car's logged cumulative cost (0.40)
    assert metrics.fuel_cost_eur(synthetic_df, fuel_l=0.25, price_per_l=None) == 0.40


def test_fuel_cost_falls_back_to_price_per_l():
    import pandas as pd
    df = pd.DataFrame({"t": [0.0], "pid": ["Vehicle speed"], "value": [0.0],
                       "unit": ["km/h"], "lat": [None], "lon": [None]})
    assert metrics.fuel_cost_eur(df, fuel_l=2.0, price_per_l=1.5) == 3.0


def test_consumption_l_per_100km():
    assert metrics.consumption_l_100km(fuel_l=6.0, distance_km=100.0) == 6.0
    assert metrics.consumption_l_100km(fuel_l=1.0, distance_km=0.0) == 0.0
    # tiny distances are guarded so idling logs don't report absurd economy
    assert metrics.consumption_l_100km(fuel_l=0.25, distance_km=0.1) == 0.0


def test_co2_uses_fuel_type_factor():
    assert metrics.co2_kg(10.0) == 23.1            # petrol default
    assert metrics.co2_kg(10.0, "petrol") == 23.1
    assert metrics.co2_kg(10.0, "diesel") == 26.4  # ~14% higher per litre


def test_detect_fuel_type_from_engine_string():
    import pandas as pd
    df = pd.DataFrame({"t": [0.0], "pid": ["Vehicle speed"], "value": [10.0],
                       "unit": ["km/h"], "lat": [None], "lon": [None]})
    assert metrics.detect_fuel_type(df, "2.0 TDI") == "diesel"
    assert metrics.detect_fuel_type(df, "1.4 TSI") == "petrol"  # petrol DI badge, not diesel
    assert metrics.detect_fuel_type(df, None) == "petrol"


def test_detect_fuel_type_from_dpf_pid():
    import pandas as pd
    # a diesel particulate-filter channel betrays a diesel even with no engine string
    df = pd.DataFrame({"t": [0.0, 1.0], "pid": ["DPF differential pressure", "Vehicle speed"],
                       "value": [5.0, 10.0], "unit": ["kPa", "km/h"], "lat": [None, None], "lon": [None, None]})
    assert metrics.detect_fuel_type(df) == "diesel"


def test_elevation_gain_and_loss(synthetic_df):
    # altitudes 100 -> 110 -> 105 (smoothing window 5, min_periods 1)
    gain, loss = metrics.elevation_gain_loss(synthetic_df)
    assert gain > 0.0
    assert loss >= 0.0


def test_time_warnings_flags_midnight_rollover():
    import pandas as pd
    monotonic = pd.DataFrame({"t": [1.0, 2.0, 3.0], "pid": ["x", "x", "x"],
                              "value": [1.0, 2.0, 3.0], "lat": [None] * 3, "lon": [None] * 3})
    assert metrics.time_warnings(monotonic) == []
    rollover = pd.DataFrame({"t": [86399.0, 1.0], "pid": ["x", "x"],
                             "value": [1.0, 2.0], "lat": [None, None], "lon": [None, None]})
    assert len(metrics.time_warnings(rollover)) == 1


def test_series_is_case_insensitive():
    import pandas as pd
    df = pd.DataFrame({"t": [0.0, 1.0], "pid": ["Engine Fuel Rate", "Engine Fuel Rate"],
                       "value": [5.0, 6.0], "unit": ["L/h", "L/h"], "lat": [None, None], "lon": [None, None]})
    s = metrics.series(df, "Engine fuel rate")  # canonical lowercase finds the capitalized PID
    assert len(s) == 2
    assert s["value"].iloc[-1] == 6.0


def test_quality_warnings_flag_partial_logs():
    import pandas as pd
    gps_only = pd.DataFrame({"t": [0.0], "pid": ["Speed (GPS)"], "value": [50.0],
                             "unit": ["km/h"], "lat": [45.0], "lon": [15.0]})
    assert any("over-reported" in x for x in metrics.quality_warnings(gps_only, 10.0, "gps"))
    no_speed = pd.DataFrame({"t": [0.0], "pid": ["Altitude (GPS)"], "value": [100.0],
                             "unit": ["m"], "lat": [45.0], "lon": [15.0]})
    assert any("no speed" in x for x in metrics.quality_warnings(no_speed, 10.0, "odometer"))


def test_drive_window_trims_engine_off_ends():
    rows = ([(t, 0.0) for t in (0, 1, 2)]
            + [(t, 1500.0) for t in range(3, 11)]
            + [(t, 0.0) for t in (11, 12, 13)])
    assert metrics.drive_window(_rpm_df(rows)) == (3.0, 10.0)


def test_duration_excludes_engine_off_ends():
    rows = ([(t, 0.0) for t in (0, 1, 2)]
            + [(t, 1500.0) for t in range(3, 11)]
            + [(t, 0.0) for t in (11, 12, 13)])
    assert metrics.duration_seconds(_rpm_df(rows)) == 7.0  # 10 - 3, not 13 - 0


def test_drive_window_falls_back_to_speed_when_no_rpm():
    df = pd.DataFrame([
        {"t": float(t), "pid": "Vehicle speed", "value": float(v), "unit": "km/h", "lat": None, "lon": None}
        for t, v in [(5, 10), (6, 20), (7, 0)]
    ])
    assert metrics.drive_window(df) == (5.0, 7.0)


def test_drive_window_full_span_when_rpm_never_on():
    assert metrics.drive_window(_rpm_df([(0.0, 0.0), (1.0, 0.0), (2.0, 0.0)])) == (0.0, 2.0)


def test_drive_window_keeps_mid_drive_engine_off():
    # engine off mid-drive (RPM=0 at 6-8, sandwiched) must stay INSIDE the window —
    # only leading/trailing dead time is trimmed, never an interior stop.
    rows = ([(t, 1500.0) for t in range(0, 6)]
            + [(t, 0.0) for t in (6, 7, 8)]
            + [(t, 1500.0) for t in range(9, 15)])
    assert metrics.drive_window(_rpm_df(rows)) == (0.0, 14.0)


def test_resample_1hz_grid_within_drive_window():
    rows = ([(t, 0.0) for t in (0, 1, 2)]
            + [(t, 1500.0) for t in range(3, 11)]
            + [(t, 0.0) for t in (11, 12, 13)])
    grid = metrics.resample_1hz(_rpm_df(rows), ["Engine RPM"])
    # the trimmed engine-off ends must not appear in the grid
    assert grid["t"].min() >= 3.0
    assert grid["t"].max() <= 10.0


def test_trim_warning_fires_when_significant():
    # driving 0..100 (RPM>0), then a single engine-off sample 200 s later -> trim 200s > 60
    rows = [(t, 1500.0) for t in range(0, 101)] + [(300.0, 0.0)]
    w = metrics.trim_warnings(_rpm_df(rows))
    assert len(w) == 1
    assert "min of engine-off" in w[0]


def test_no_trim_warning_when_clean(synthetic_df):
    assert metrics.trim_warnings(synthetic_df) == []


def test_no_trim_warning_under_threshold():
    # only 40 s of engine-off tail (< 60 s gate) -> no warning
    rows = [(t, 1500.0) for t in range(0, 101)] + [(140.0, 0.0)]
    assert metrics.trim_warnings(_rpm_df(rows)) == []
