from app import brc


def _lp(s: bytes) -> bytes:
    return bytes([len(s)]) + s


def _make_brc() -> bytes:
    return (_lp(b"CARSCANNERRECORD") + (2).to_bytes(4, "little")
            + _lp(b"TESTVIN0123456789") + _lp(b"My car")
            + _lp(b"Test Engine 1.0L") + b"\x0e\x42binaryrest")


def test_parse_brc_header():
    v = brc.parse_brc_header(_make_brc())
    assert v == {"vin": "TESTVIN0123456789", "label": "My car",
                 "engine": "Test Engine 1.0L"}


def test_parse_brc_rejects_non_brc():
    assert brc.parse_brc_header(b"not a brc file at all") is None
    assert brc.parse_brc_header(b"") is None
