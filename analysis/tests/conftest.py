import pytest

# A tiny synthetic vertical_layout drive: 3 GPS fixes ~1s apart, with speed,
# rpm, cumulative fuel + price, and altitude. Semicolon-delimited, quoted,
# trailing ';' (exactly like the real export). Values chosen for known answers.
SYNTHETIC_VERTICAL = (
    '"SECONDS";"PID";"VALUE";"UNITS";"LATITUDE";"LONGTITUDE";\n'
    '"100.0";"Vehicle speed";"0";"km/h";"45.000000";"15.000000";\n'
    '"100.0";"Engine RPM";"800";"rpm";"45.000000";"15.000000";\n'
    '"100.0";"Altitude (GPS)";"100";"m";"45.000000";"15.000000";\n'
    '"101.0";"Vehicle speed";"36";"km/h";"45.000000";"15.001000";\n'
    '"101.0";"Engine RPM";"2000";"rpm";"45.000000";"15.001000";\n'
    '"101.0";"Altitude (GPS)";"110";"m";"45.000000";"15.001000";\n'
    '"102.0";"Vehicle speed";"72";"km/h";"45.000000";"15.002000";\n'
    '"102.0";"Engine RPM";"3000";"rpm";"45.000000";"15.002000";\n'
    '"102.0";"Altitude (GPS)";"105";"m";"45.000000";"15.002000";\n'
    '"102.0";"Fuel used";"0.25";"L";"45.000000";"15.002000";\n'
    '"102.0";"Fuel used price";"0.40";"EUR";"45.000000";"15.002000";\n'
)


@pytest.fixture
def synthetic_bytes() -> bytes:
    return SYNTHETIC_VERTICAL.encode("utf-8")


@pytest.fixture
def synthetic_df(synthetic_bytes):
    from app.parsing import parse_vertical
    return parse_vertical(synthetic_bytes)
