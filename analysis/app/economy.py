import numpy as np
import pandas as pd

from app import metrics
from app.models import Economy, EfficiencyPoint, Scores, Summary

_DEFAULT_ANNUAL_KM = 15000
_IDLE_FALLBACK_LH = 0.8
_BIN_KMH = 10
_MIN_SPEED_KMH = 5
_MAX_L100 = 40.0
_MIN_BIN_SAMPLES = 5


def _price_per_l(summary: Summary, price_per_l: float | None) -> float | None:
    # fuelCostEur already reflects any manual override (metrics.fuel_cost_eur applies
    # it upstream), so back-deriving cost/L here naturally yields the override price.
    if summary.fuelUsedL > 0 and summary.fuelCostEur > 0:
        return round(summary.fuelCostEur / summary.fuelUsedL, 3)
    return price_per_l


def _idle_rate_lh(df: pd.DataFrame) -> float:
    src = metrics.speed_source(df)
    if src is None:
        return _IDLE_FALLBACK_LH
    grid = metrics.resample_1hz(df, [src, "Engine RPM", "Engine fuel rate"])
    idle = grid[(grid[src] < 1.0) & (grid["Engine RPM"] > 0)]["Engine fuel rate"].dropna()
    return float(idle.mean()) if not idle.empty else _IDLE_FALLBACK_LH


def efficiency_curve(df: pd.DataFrame) -> tuple[list[EfficiencyPoint], float | None]:
    """Speed-vs-consumption: bin moving samples by speed, average instant
    consumption per bin; the cheapest sufficiently-sampled bin is the sweet spot."""
    src = metrics.speed_source(df)
    if src is None:
        return [], None
    grid = metrics.resample_1hz(df, [src, "Calculated instant fuel consumption", "Engine fuel rate"])
    g = grid.dropna(subset=[src])
    g = g[g[src] >= _MIN_SPEED_KMH].copy()
    if g.empty:
        return [], None
    cons = g["Calculated instant fuel consumption"]
    derived = g["Engine fuel rate"] / g[src] * 100.0
    g["c"] = cons.where(cons.notna(), derived)
    g = g.dropna(subset=["c"])
    g = g[(g["c"] > 0) & (g["c"] < _MAX_L100)]
    if g.empty:
        return [], None
    g["bin"] = (g[src] // _BIN_KMH * _BIN_KMH).astype(int)
    means = g.groupby("bin")["c"].mean()
    counts = g.groupby("bin")["c"].count()
    curve = [EfficiencyPoint(speedKmh=float(b + _BIN_KMH / 2), l100km=round(float(v), 1))
             for b, v in means.items()]
    eligible = means[counts >= _MIN_BIN_SAMPLES]
    sweet = float(int(eligible.idxmin()) + _BIN_KMH / 2) if not eligible.empty else None
    return curve, sweet


def build_economy(df: pd.DataFrame, summary: Summary, scores: Scores, events: list,
                  price_per_l: float | None, annual_km: int = _DEFAULT_ANNUAL_KM) -> Economy:
    price = _price_per_l(summary, price_per_l)
    cost_per_km = round(summary.fuelCostEur / summary.distanceKm, 3) if summary.distanceKm >= 1 else 0.0

    projected_yearly = projected_monthly = None
    if price is not None and summary.avgConsumptionL100km > 0:
        projected_yearly = round(summary.avgConsumptionL100km / 100.0 * annual_km * price, 2)
        projected_monthly = round(projected_yearly / 12, 2)

    idle_waste = 0.0
    if price is not None:
        idle_waste = round(summary.idleSeconds / 3600.0 * _idle_rate_lh(df) * price, 2)
    # Potential savings = the grounded idle waste only (from the car's real idle
    # fuel rate). We deliberately don't add a guessed per-harsh-event figure.
    potential = idle_waste

    curve, sweet = efficiency_curve(df)
    return Economy(
        pricePerLEur=price,
        costPerKm=cost_per_km,
        assumedAnnualKm=annual_km,
        projectedMonthlyEur=projected_monthly,
        projectedYearlyEur=projected_yearly,
        idleWasteEur=idle_waste,
        potentialSavingsEur=potential,
        sweetSpotKmh=sweet,
        efficiencyCurve=curve,
    )
