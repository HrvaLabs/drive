from app import metrics
from app.models import Bests

_DEFAULT_ATM_KPA = 101.3


def _max(df, pid: str) -> float | None:
    s = metrics.series(df, pid)
    return round(float(s["value"].max()), 2) if not s.empty else None


def _peak_boost_bar(df) -> float | None:
    """Gauge boost in bar. Prefer 'Calculated boost' (already bar) when it carries
    real positive values; some cars report it flat-zero, so fall back to deriving
    boost from absolute manifold pressure minus barometric (kPa -> bar)."""
    cb = metrics.series(df, "Calculated boost")
    if not cb.empty and float(cb["value"].max()) > 0.05:
        return round(float(cb["value"].max()), 2)
    for pid in ("Intake manifold absolute pressure", "Intake Manifold Absolute Pressure A"):
        m = metrics.series(df, pid)
        if not m.empty:
            baro = metrics.series(df, "Barometric pressure")
            atm = float(baro["value"].median()) if not baro.empty else _DEFAULT_ATM_KPA
            return round(max(0.0, (float(m["value"].max()) - atm) / 100.0), 2)
    # No usable MAP channel: report Calculated boost's max anyway (may be 0 / None).
    return round(float(cb["value"].max()), 2) if not cb.empty else None


def build_bests(df) -> Bests:
    return Bests(
        maxHp=_max(df, "Instant engine power (based on fuel consumption)"),
        peakBoostBar=_peak_boost_bar(df),
        maxAccelG=_max(df, "Vehicle acceleration"),
        topSpeedKmh=_max(df, "Vehicle speed"),
        maxRpm=_max(df, "Engine RPM"),
    )
