"""Offline nearest-town lookup for the drive's start and end.

Uses the bundled-dataset `reverse_geocoder` package — ZERO network calls, so the
"no other external services" privacy promise stays true. Coordinates are rounded
to 2 dp (~1.1 km) before lookup; resolution is honest nearest-town (cities1000),
"Zagreb -> Split", not street level. The dataset loads lazily on first use
(~2 s once per process).
"""
from __future__ import annotations

import pandas as pd


def route_places(df: pd.DataFrame) -> tuple[str | None, str | None]:
    if "lat" not in df.columns or "lon" not in df.columns:
        return None, None
    pts = df[df["lat"].notna() & df["lon"].notna()]
    if pts.empty:
        return None, None
    import reverse_geocoder as rg  # deferred: loading the dataset is slow

    first = (round(float(pts.iloc[0]["lat"]), 2), round(float(pts.iloc[0]["lon"]), 2))
    last = (round(float(pts.iloc[-1]["lat"]), 2), round(float(pts.iloc[-1]["lon"]), 2))
    try:
        res = rg.search([first, last], mode=1, verbose=False)
    except Exception:  # noqa: BLE001 — a label is a nicety, never fail the analysis for it
        return None, None
    def _clean(name: str | None) -> str | None:
        # cities1000 has district rows like "Zagreb - Centar"; keep the city.
        return name.split(" - ")[0].strip() if name else None

    return _clean(res[0].get("name")), _clean(res[1].get("name"))
