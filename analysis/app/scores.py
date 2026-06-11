from app import metrics
from app.models import Scores

_RPM_BAND = (1500.0, 2500.0)


def rpm_band_pct(df) -> float:
    grid = metrics.resample_1hz(df, ["Engine RPM"])["Engine RPM"].dropna()
    if grid.empty:
        return 0.0
    in_band = ((grid >= _RPM_BAND[0]) & (grid <= _RPM_BAND[1])).sum()
    return round(100.0 * in_band / len(grid), 1)


def short_shift_pct(df) -> float:
    """% of moving time at high revs in a lower gear than needed — i.e. a taller
    gear was available (the RPM÷speed ratio is well above the drive's own top-gear
    ratio). Deliberately ignores unavoidable high revs in top gear at speed: on a
    fast road in top gear you can't drop below ~2500 rpm, and that shouldn't count."""
    src = metrics.speed_source(df)
    if src is None:
        return 0.0
    grid = metrics.resample_1hz(df, ["Engine RPM", src]).dropna()
    g = grid[grid[src] > 10.0]
    if len(g) < 20:
        return 0.0
    ratio = g["Engine RPM"] / g[src]
    top = float(ratio.quantile(0.05))  # ~the tallest gear actually used this drive
    if top <= 0:
        return 0.0
    shiftable = (g["Engine RPM"] > 2500.0) & (ratio > top * 1.3)
    return round(float(shiftable.sum()) / len(g) * 100.0, 1)


def idle_pct(df) -> float:
    mv = metrics.moving_idle_seconds(df)
    dur = metrics.duration_seconds(df)
    if dur <= 0:
        return 0.0
    # clamp: idle is counted over an inclusive 1Hz grid, which can slightly exceed
    # the continuous duration on very short drives (would otherwise show >100%).
    return round(min(100.0, 100.0 * mv["idleSeconds"] / dur), 1)


def speed_steadiness(df) -> float:
    """100 - coefficient of variation of the moving speed, clamped to [0, 100]."""
    src = metrics.speed_source(df)
    if src is None:
        return 0.0
    grid = metrics.resample_1hz(df, [src])[src].dropna()
    moving = grid[grid >= 1.0]
    if len(moving) < 2 or moving.mean() == 0:
        return 0.0
    cov = float(moving.std() / moving.mean())
    return round(max(0.0, min(100.0, 100.0 * (1.0 - cov))), 1)


def eco_score(df, harsh_events: int) -> int:
    """Weighted blend (spec §6) - weights live here, in one place."""
    band = rpm_band_pct(df)
    steady = speed_steadiness(df)
    idle = idle_pct(df)
    harsh_penalty = min(30, harsh_events * 3)
    raw = 0.4 * band + 0.3 * steady + 0.3 * (100.0 - idle) - harsh_penalty
    return int(max(0, min(100, round(raw))))


def driving_style(eco: int) -> str:
    if eco >= 70:
        return "eco"
    if eco >= 45:
        return "normal"
    return "spirited"


def build_scores(df, harsh_events: int) -> Scores:
    eco = eco_score(df, harsh_events)
    return Scores(
        eco=eco,
        style=driving_style(eco),
        rpmBandPct=rpm_band_pct(df),
        idlePct=idle_pct(df),
        speedSteadiness=speed_steadiness(df),
        harshEvents=harsh_events,
        shortShiftPct=short_shift_pct(df),
    )
