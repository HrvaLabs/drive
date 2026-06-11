from app.analysis import build_drive_analysis


def test_build_drive_analysis_fills_summary(synthetic_df):
    result = build_drive_analysis(synthetic_df, source="vertical_layout", price_per_l=None)

    assert result.schemaVersion == "2"
    assert result.drive.source == "vertical_layout"
    assert result.drive.durationSeconds == 2.0
    assert result.drive.startedAtClock == "00:01:40.000"   # t=100s -> 00:01:40
    assert result.summary.maxSpeedKmh == 72.0
    assert result.summary.avgSpeedKmh == 36.0   # time-weighted mean of [0, 36, 72]
    assert result.summary.fuelUsedL == 0.25
    assert result.summary.fuelCostEur == 0.40
    assert 0.14 < result.summary.distanceKm < 0.18
    assert len(result.route) >= 2
    assert "speedKmh" in result.series and len(result.series["speedKmh"]) >= 1
    assert result.dataQuality.rowCount == 11
    assert "Vehicle speed" in result.dataQuality.pidsPresent
    assert result.dataQuality.distanceSource == "gps"

    # Phase 2 fields are populated
    assert result.bests.topSpeedKmh == 72.0
    assert result.bests.maxRpm == 3000.0
    assert 0 <= result.scores.eco <= 100
    assert result.scores.style in {"eco", "normal", "spirited"}
    assert isinstance(result.events, list)
    assert result.health.batteryVerdict == "unknown"  # synthetic has no voltage

    # Phase 3 fields
    assert "Vehicle speed" in result.signals
    assert result.signals["Vehicle speed"].n > 0
    assert isinstance(result.tips, list) and len(result.tips) >= 1

    # Phase 4: economy is built from the drive. The synthetic fixture logs Fuel used
    # (0.25 L) + Fuel used price (0.40 EUR), so a real price/L (1.6) appears only once wired.
    assert result.economy.pricePerLEur is not None
    assert isinstance(result.economy.efficiencyCurve, list)


def test_analysis_includes_gears(synthetic_df):
    from app.analysis import build_drive_analysis
    r = build_drive_analysis(synthetic_df, "vertical_layout", None)
    assert r.schemaVersion == "2"
    assert hasattr(r, "gears")
    # synthetic fixture is tiny/non-steady -> gears is the safe empty fallback, no exception
    assert r.gears.ratios == []
