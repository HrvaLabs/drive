from app import tips
from app.models import Economy, Event, Health, Scores, Summary


def _scores(**kw):
    base = dict(eco=60, style="normal", rpmBandPct=60.0, idlePct=5.0, speedSteadiness=70.0, harshEvents=0)
    base.update(kw)
    return Scores(**base)


def test_idle_tip_when_idling_high():
    out = tips.build_tips([], _scores(idlePct=20.0), Health(), Summary())
    assert any(t.id == "reduce_idle" and t.severity == "warn" for t in out)


def test_harsh_tip_counts_events():
    out = tips.build_tips([], _scores(harshEvents=4), Health(), Summary())
    assert any(t.id == "smoother" and "4" in t.detail for t in out)


def test_coasting_is_praised():
    events = [Event(type="coasting", t=1.0, durationSeconds=10.0)]
    out = tips.build_tips(events, _scores(), Health(), Summary())
    assert any(t.id == "coasting_good" and t.severity == "good" for t in out)


def test_low_battery_tip():
    out = tips.build_tips([], _scores(), Health(batteryVerdict="low", batteryVolts=11.6), Summary())
    assert any(t.id == "battery_low" for t in out)


def test_clean_drive_gets_a_positive_tip():
    out = tips.build_tips([], _scores(idlePct=2.0, rpmBandPct=80.0, harshEvents=0), Health(), Summary())
    assert any(t.severity == "good" for t in out)


def test_idle_tip_carries_eur_impact():
    eco = Economy(idleWasteEur=0.45)
    out = tips.build_tips([], _scores(idlePct=20.0), Health(), Summary(), eco)
    idle = next(t for t in out if t.id == "reduce_idle")
    assert idle.eurImpact == 0.45
    assert "0.45" in idle.detail


def test_sweet_spot_tip_when_far_from_optimal():
    eco = Economy(sweetSpotKmh=90.0)
    out = tips.build_tips([], _scores(), Health(), Summary(avgSpeedKmh=45.0), eco)
    assert any(t.id == "sweet_spot" and "90" in t.detail for t in out)


def test_tips_work_without_economy_argument():
    out = tips.build_tips([], _scores(idlePct=20.0), Health(), Summary())
    assert any(t.id == "reduce_idle" for t in out)


def test_idle_tip_flags_long_stops():
    events = [Event(type="idle", t=1.0, durationSeconds=70.0),
              Event(type="idle", t=200.0, durationSeconds=20.0)]
    out = tips.build_tips(events, _scores(idlePct=20.0), Health(), Summary())
    idle = next(t for t in out if t.id == "reduce_idle")
    assert "1 lasted" in idle.detail and "over a minute" in idle.detail


def test_fuel_trim_tip_when_lean():
    out = tips.build_tips([], _scores(), Health(fuelTrimVerdict="lean"), Summary())
    assert any(t.id == "fuel_trim" and t.severity == "warn" for t in out)


def test_high_rpm_tip_counts_stretches():
    events = [Event(type="high_rpm", t=1.0, durationSeconds=5.0),
              Event(type="high_rpm", t=20.0, durationSeconds=4.0)]
    out = tips.build_tips(events, _scores(), Health(), Summary())
    assert any(t.id == "high_rpm" and "2" in t.detail for t in out)


def test_potential_savings_tip_carries_eur():
    eco = Economy(potentialSavingsEur=0.6)
    out = tips.build_tips([], _scores(), Health(), Summary(), eco)
    t = next(x for x in out if x.id == "potential_savings")
    assert t.eurImpact == 0.6 and "0.6" in t.detail


def test_short_shift_tip_fires_on_low_gear_revving_not_band():
    out = tips.build_tips([], _scores(shortShiftPct=20.0), Health(), Summary())
    assert any(t.id == "short_shift" for t in out)


def test_no_short_shift_tip_for_top_gear_high_revs():
    # high time in the rpm band is irrelevant now; only the gear-aware signal counts
    out = tips.build_tips([], _scores(rpmBandPct=10.0, shortShiftPct=1.0), Health(), Summary())
    assert not any(t.id == "short_shift" for t in out)


def test_excellent_eco_is_praised():
    out = tips.build_tips([], _scores(eco=82), Health(), Summary())
    assert any(t.id == "eco_great" and t.severity == "good" for t in out)
