import pandas as pd

from app.parsing import is_supported_layout, parse_drive, parse_horizontal, parse_vertical
from tests.conftest import SYNTHETIC_VERTICAL


def test_parse_vertical_shapes_tidy_columns(synthetic_df):
    df = synthetic_df
    assert list(df.columns) == ["t", "pid", "value", "unit", "lat", "lon"]
    # 11 data rows (header skipped), trailing empty column dropped
    assert len(df) == 11
    # numeric coercion
    assert pd.api.types.is_float_dtype(df["t"])
    assert df["t"].min() == 100.0
    # LONGTITUDE normalized to lon
    assert df.loc[df["pid"] == "Vehicle speed", "lon"].iloc[-1] == 15.002
    # a known value survives
    assert df.loc[df["pid"] == "Fuel used", "value"].iloc[0] == 0.25


def test_parse_handles_no_gps_4col():
    # some ECU profiles export without GPS: SECONDS;PID;VALUE;UNITS only
    content = (
        '"SECONDS";"PID";"VALUE";"UNITS";\n'
        '"100.0";"Engine RPM";"854";"rpm";\n'
        '"101.0";"Vehicle speed";"30";"km/h";\n'
    ).encode("utf-8")
    df = parse_vertical(content)
    assert list(df.columns) == ["t", "pid", "value", "unit", "lat", "lon"]
    assert len(df) == 2
    assert df["lat"].isna().all()  # no GPS columns -> lat/lon are NaN, not a crash
    assert df.loc[df["pid"] == "Vehicle speed", "value"].iloc[0] == 30.0


def test_parse_horizontal_melts_to_tidy():
    content = (
        'time,"Engine RPM (rpm)","Vehicle speed (km/h)",Latitude,Longtitude\n'
        '16:08:58.437,800,0,45.0,15.0\n'
        '16:08:59.000,2000,30,45.001,15.001\n'
    ).encode("utf-8")
    df = parse_horizontal(content)
    assert set(df.columns) == {"t", "pid", "value", "unit", "lat", "lon"}
    # unit stripped from the column name into its own field
    rpm = df[df["pid"] == "Engine RPM"]
    assert rpm["unit"].iloc[0] == "rpm"
    assert rpm["value"].tolist() == [800.0, 2000.0]
    # time -> seconds since midnight (16:08:58.437)
    assert abs(df["t"].min() - (16 * 3600 + 8 * 60 + 58.437)) < 0.01
    # lat/lon carried per row; Latitude/Longtitude are NOT PID rows
    assert "Latitude" not in set(df["pid"])
    assert df[df["pid"] == "Vehicle speed"]["lon"].iloc[-1] == 15.001


def test_parse_drive_dispatches_by_header():
    vertical = ('"SECONDS";"PID";"VALUE";"UNITS";"LATITUDE";"LONGTITUDE";\n'
                '"100.0";"Vehicle speed";"5";"km/h";"45";"15";\n').encode("utf-8")
    horizontal = ('time,"Vehicle speed (km/h)",Latitude,Longtitude\n'
                  '16:00:00.000,5,45,15\n').encode("utf-8")
    assert parse_drive(vertical)["pid"].iloc[0] == "Vehicle speed"
    assert parse_drive(horizontal)["pid"].iloc[0] == "Vehicle speed"


def test_is_supported_layout_accepts_vertical():
    assert is_supported_layout(SYNTHETIC_VERTICAL.encode("utf-8")) is True


def test_is_supported_layout_accepts_horizontal():
    assert is_supported_layout(b'TIME,Vehicle speed,Engine RPM\n0,0,800\n') is True


def test_is_supported_layout_rejects_junk_and_empty():
    assert is_supported_layout(b"hello,world\n1,2") is False
    assert is_supported_layout(b"") is False
