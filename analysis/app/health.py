from app import metrics
from app.models import Health

_WARMUP_TARGET_C = 85.0
_BATTERY_HEALTHY_V = 13.0
_BATTERY_LOW_V = 12.2
_TRIM_LIMIT_PCT = 25.0  # spec §6: flag rich/lean only beyond ±25% (10-25% is the normal band edge)


def warmup_seconds(df) -> float | None:
    coolant = metrics.series(df, "Engine coolant temperature")
    if coolant.empty:
        return None
    warm = coolant[coolant["value"] >= _WARMUP_TARGET_C]
    if warm.empty:
        return None
    return round(float(warm["t"].iloc[0] - df["t"].min()), 1)


# Battery-voltage PIDs in preference order. The ECU's own "[ECM] Battery Voltage"
# is the most accurate; the ELM327 adapter's "OBD Module Voltage" can under-report
# badly (seen flat ~11.5 V while the ECU read ~14.9 V). series() is case-insensitive.
_BATTERY_PIDS = ("[ECM] Battery Voltage", "Control module voltage", "OBD Module Voltage")


def _battery(df) -> tuple[str, float | None]:
    for pid in _BATTERY_PIDS:
        v = metrics.series(df, pid)
        if not v.empty:
            # Median, not the last sample: the last reading is typically key-off
            # (engine stopping) and sags low; the median reflects charging voltage
            # while the engine is running.
            volts = round(float(v["value"].median()), 1)
            break
    else:
        return "unknown", None
    if volts >= _BATTERY_HEALTHY_V:
        verdict = "healthy"
    elif volts < _BATTERY_LOW_V:
        verdict = "low"
    else:
        verdict = "ok"
    return verdict, volts


def _fuel_trim(df) -> str:
    st = metrics.series(df, "Short term fuel % trim - Bank 1")
    lt = metrics.series(df, "Long term fuel % trim - Bank 1")
    if st.empty and lt.empty:
        return "unknown"
    total = (float(st["value"].mean()) if not st.empty else 0.0) + (float(lt["value"].mean()) if not lt.empty else 0.0)
    if total > _TRIM_LIMIT_PCT:
        return "lean"
    if total < -_TRIM_LIMIT_PCT:
        return "rich"
    return "normal"


def build_health(df) -> Health:
    verdict, volts = _battery(df)
    return Health(
        warmupSeconds=warmup_seconds(df),
        batteryVerdict=verdict,
        batteryVolts=volts,
        fuelTrimVerdict=_fuel_trim(df),
    )
