from app import routes


def test_route_points_have_lat_lon_and_speed(synthetic_df):
    pts = routes.route_points(synthetic_df, max_points=1000)
    assert len(pts) >= 2
    first = pts[0]
    assert set(first.keys()) == {"t", "lat", "lon", "speedKmh"}
    assert first["lat"] == 45.0
    # speed attached by nearest-time join (t=100 -> Vehicle speed 0)
    assert pts[0]["speedKmh"] == 0.0


def test_route_downsamples_to_max_points(synthetic_df):
    pts = routes.route_points(synthetic_df, max_points=2)
    assert len(pts) <= 2


def test_speed_series_points(synthetic_df):
    pts = routes.speed_series(synthetic_df, max_points=1000)
    assert len(pts) >= 1
    assert set(pts[0].keys()) == {"t", "v"}
    assert max(p["v"] for p in pts) == 72.0
