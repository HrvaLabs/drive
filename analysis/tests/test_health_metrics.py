import pandas as pd

from app import health


def _df(rows):
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows]
    )


def test_warmup_seconds_time_to_85c():
    rows = [(0.0, "Engine coolant temperature", 50.0),
            (30.0, "Engine coolant temperature", 70.0),
            (60.0, "Engine coolant temperature", 86.0)]
    assert health.build_health(_df(rows)).warmupSeconds == 60.0


def test_battery_verdict_from_voltage():
    h = health.build_health(_df([(0.0, "OBD Module Voltage", 14.2)]))
    assert h.batteryVerdict == "healthy"
    assert h.batteryVolts == 14.2
    # wrong-ECU alias: some profiles name it "Control module voltage"
    h2 = health.build_health(_df([(0.0, "Control module voltage", 12.1)]))
    assert h2.batteryVerdict == "low"


def test_battery_prefers_ecm_pid_and_uses_median():
    # The ELM327 adapter ("OBD Module Voltage") can under-report; prefer the ECU's
    # "[ECM] Battery Voltage". Use the median, not the last sample — the last
    # reading is typically key-off and sags low.
    rows = [
        (0.0, "OBD Module Voltage", 11.5), (1.0, "OBD Module Voltage", 11.5),
        (0.0, "[ECM] Battery Voltage", 14.8), (1.0, "[ECM] Battery Voltage", 15.0),
        (2.0, "[ECM] Battery Voltage", 12.6),  # key-off tail — ignored by the median
    ]
    h = health.build_health(_df(rows))
    assert h.batteryVolts == 14.8   # median of [14.8, 15.0, 12.6], not last 12.6 or OBD 11.5
    assert h.batteryVerdict == "healthy"


def test_fuel_trim_verdict_normal():
    rows = [(0.0, "Short term fuel % trim - Bank 1", 2.0),
            (0.0, "Long term fuel % trim - Bank 1", 3.0)]
    assert health.build_health(_df(rows)).fuelTrimVerdict == "normal"


def test_missing_signals_are_unknown():
    h = health.build_health(_df([(0.0, "Vehicle speed", 50.0)]))
    assert h.warmupSeconds is None
    assert h.batteryVerdict == "unknown"
    assert h.fuelTrimVerdict == "unknown"
