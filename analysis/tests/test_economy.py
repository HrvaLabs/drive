import pandas as pd

from app import economy
from app.models import Scores, Summary


def _summary(**kw):
    base = dict(distanceKm=36.94, fuelUsedL=2.312, fuelCostEur=3.72, avgConsumptionL100km=6.26,
                idleSeconds=348, movingSeconds=2000, avgSpeedKmh=50.0, maxSpeedKmh=146.0)
    base.update(kw)
    return Summary(**base)


def _df_idle_rate(lh):
    rows = []
    for t in range(0, 5):
        rows += [(float(t), "Vehicle speed", 0.0), (float(t), "Engine RPM", 800.0),
                 (float(t), "Engine fuel rate", lh)]
    return pd.DataFrame([{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows])


def test_price_and_cost_per_km_from_the_drive():
    e = economy.build_economy(_df_idle_rate(0.8), _summary(), Scores(), [], price_per_l=None)
    assert e.pricePerLEur == 1.609
    assert e.costPerKm == 0.101


def test_yearly_projection_uses_assumed_distance():
    e = economy.build_economy(_df_idle_rate(0.8), _summary(), Scores(), [], price_per_l=None)
    assert e.projectedYearlyEur is not None and 1400 < e.projectedYearlyEur < 1650
    assert e.projectedMonthlyEur is not None and round(e.projectedYearlyEur / 12, 2) == e.projectedMonthlyEur


def test_idle_waste_and_potential_savings():
    e = economy.build_economy(_df_idle_rate(0.885), _summary(), Scores(harshEvents=2), [], price_per_l=None)
    assert 0.10 < e.idleWasteEur < 0.20
    assert e.potentialSavingsEur >= e.idleWasteEur


def test_price_falls_back_to_param_when_no_cost_logged():
    e = economy.build_economy(_df_idle_rate(0.8), _summary(fuelCostEur=0.0), Scores(), [], price_per_l=1.70)
    assert e.pricePerLEur == 1.70


def _df_speed_consumption(pairs):
    # pairs: list of (t, speed_kmh, l100km)
    rows = []
    for (t, sp, c) in pairs:
        rows += [(float(t), "Vehicle speed", float(sp)), (float(t), "Calculated instant fuel consumption", float(c))]
    return pd.DataFrame([{"t": t, "pid": p, "value": v, "unit": "", "lat": None, "lon": None} for (t, p, v) in rows])


def test_efficiency_curve_and_sweet_spot():
    pairs = [(t, 30, 9.0) for t in range(0, 10)] + [(t + 100, 90, 5.0) for t in range(0, 10)]
    curve, sweet = economy.efficiency_curve(_df_speed_consumption(pairs))
    assert len(curve) >= 2
    speeds = [round(p.speedKmh) for p in curve]
    assert 35 in speeds and 95 in speeds
    assert sweet is not None and 85 <= sweet <= 100


def test_efficiency_curve_empty_without_signals():
    df = pd.DataFrame({"t": [0.0], "pid": ["Engine RPM"], "value": [800.0], "unit": [""], "lat": [None], "lon": [None]})
    curve, sweet = economy.efficiency_curve(df)
    assert curve == [] and sweet is None


def test_annual_km_override_scales_projections(synthetic_df):
    base = economy.build_economy(_df_idle_rate(0.8), _summary(), Scores(), [], price_per_l=None)
    custom = economy.build_economy(_df_idle_rate(0.8), _summary(), Scores(), [], price_per_l=None, annual_km=30000)
    assert custom.assumedAnnualKm == 30000
    assert base.projectedYearlyEur is not None
    assert custom.projectedYearlyEur == round(base.projectedYearlyEur * 2, 2)

    # and the override threads end-to-end through build_drive_analysis
    from app.analysis import build_drive_analysis
    r = build_drive_analysis(synthetic_df, "vertical_layout", None, annual_km=30000)
    assert r.economy.assumedAnnualKm == 30000
