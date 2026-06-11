from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import SYNTHETIC_VERTICAL

client = TestClient(app)


def test_analyze_returns_real_summary():
    files = {"file": ("drive.csv", SYNTHETIC_VERTICAL.encode("utf-8"), "text/csv")}
    response = client.post("/analyze", files=files, data={"format": "vertical_layout"})

    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "2"
    assert body["summary"]["maxSpeedKmh"] == 72.0
    assert body["summary"]["fuelUsedL"] == 0.25
    assert body["drive"]["durationSeconds"] == 2.0
    assert len(body["route"]) >= 2
    assert len(body["series"]["speedKmh"]) >= 1
    assert body["dataQuality"]["distanceSource"] == "gps"


def test_analyze_uses_brc_vehicle():
    def lp(s):
        return bytes([len(s)]) + s
    brc = (lp(b"CARSCANNERRECORD") + (2).to_bytes(4, "little")
           + lp(b"TESTVIN0123456789") + lp(b"My car") + lp(b"Test Engine"))
    files = {"file": ("drive.csv", SYNTHETIC_VERTICAL.encode("utf-8"), "text/csv"),
             "brc": ("car.brc", brc, "application/octet-stream")}
    r = client.post("/analyze", files=files, data={"format": "vertical_layout"})
    assert r.status_code == 200
    v = r.json()["drive"]["vehicle"]
    assert v["vin"] == "TESTVIN0123456789"
    assert v["engine"] == "Test Engine"


def test_analyze_rejects_empty_file():
    files = {"file": ("e.csv", b"", "text/csv")}
    assert client.post("/analyze", files=files).status_code == 400


def test_analyze_rejects_unsupported_layout():
    files = {"file": ("x.csv", b"hello,world\n1,2", "text/csv")}
    assert client.post("/analyze", files=files).status_code == 400


def test_analyze_uses_engine_field_for_diesel_co2_and_vehicle():
    files = {"file": ("drive.csv", SYNTHETIC_VERTICAL.encode("utf-8"), "text/csv")}
    r = client.post("/analyze", files=files,
                    data={"engine": "2.0 TDI", "label": "My TDI", "vin": "TESTVIN0123456789"})
    assert r.status_code == 200
    b = r.json()
    assert b["summary"]["fuelType"] == "diesel"
    assert b["drive"]["vehicle"]["label"] == "My TDI"
    assert b["drive"]["vehicle"]["vin"] == "TESTVIN0123456789"
