import pandas as pd

from app.places import route_places


def _df(points):
    """points: list of (t, lat, lon) -> minimal df with GPS fixes."""
    return pd.DataFrame([
        {"t": float(t), "pid": "Vehicle speed", "value": 50.0, "unit": "km/h", "lat": lat, "lon": lon}
        for t, lat, lon in points
    ])


def test_route_places_resolves_towns_offline():
    df = _df([(0, 45.815, 15.982), (60, 44.7, 16.2), (120, 43.508, 16.440)])
    frm, to = route_places(df)
    assert frm == "Zagreb"
    assert to == "Split"


def test_same_town_both_ends():
    df = _df([(0, 45.815, 15.982), (60, 45.80, 15.97)])
    frm, to = route_places(df)
    assert frm == "Zagreb"
    assert to == "Zagreb"


def test_no_gps_returns_nones():
    df = pd.DataFrame([
        {"t": 0.0, "pid": "Engine RPM", "value": 800.0, "unit": "rpm", "lat": None, "lon": None},
    ])
    assert route_places(df) == (None, None)
