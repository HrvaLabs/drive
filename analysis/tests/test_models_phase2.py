from app.models import Bests, DriveAnalysis, Drive, Event, Health, Scores


def test_new_models_have_safe_defaults():
    assert Scores().eco == 0
    assert Scores().style == "normal"
    assert Health().batteryVerdict == "unknown"
    assert Bests().maxHp is None
    e = Event(type="idle", t=10.0)
    assert e.durationSeconds == 0.0


def test_drive_analysis_defaults_new_fields():
    da = DriveAnalysis(drive=Drive(source="vertical_layout"))
    assert da.schemaVersion == "2"  # bumped when the gears field was added (feature 7)
    assert da.events == []
    assert da.scores.eco == 0
    assert da.health.fuelTrimVerdict == "unknown"
    assert da.bests.topSpeedKmh is None
