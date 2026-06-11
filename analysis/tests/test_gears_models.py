from app.models import DriveAnalysis, Drive, GearPoint, GearUsage, Gears


def test_gears_defaults_are_empty():
    g = Gears()
    assert g.ratios == []
    assert g.usage == []
    assert g.unassignedPct == 0.0
    assert g.points == []


def test_gear_point_and_usage_shapes():
    p = GearPoint(speedKmh=50.0, rpm=1500.0, gear=0)
    assert p.gear == 0
    assert GearPoint(speedKmh=10.0, rpm=1000.0).gear is None  # unassigned default
    u = GearUsage(label="tallest used", ratio=29.4, pct=60.0)
    assert (u.label, u.ratio, u.pct) == ("tallest used", 29.4, 60.0)


def test_driveanalysis_has_gears_and_schema_v2():
    a = DriveAnalysis(drive=Drive(source="vertical_layout"))
    assert isinstance(a.gears, Gears)
    assert a.schemaVersion == "2"
