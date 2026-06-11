import io
import re

import pandas as pd

# Vertical exports are ';'-delimited and quoted. Every export has SECONDS;PID;VALUE;UNITS;
# most also carry LATITUDE;LONGTITUDE (the source misspells longitude as LONGTITUDE), but
# some ECU profiles export WITHOUT GPS (4 columns). We locate columns by NAME so either
# layout parses, column order doesn't matter, and the trailing ';' phantom column is ignored.
_LAT_HEADER = "LATITUDE"
_LON_HEADER = "LONGTITUDE"


def is_supported_layout(content: bytes) -> bool:
    """First-line header check (mirrors the removed Java validator): vertical =
    SECONDS+PID+VALUE+';', or horizontal = starts with 'TIME,'."""
    if not content:
        return False
    head = content[:512].decode("latin-1", "ignore")
    first = head.split("\n", 1)[0].replace('"', "").upper()
    vertical = "SECONDS" in first and "PID" in first and "VALUE" in first and ";" in first
    horizontal = first.startswith("TIME,") and "," in first
    return vertical or horizontal


def parse_vertical(content: bytes) -> pd.DataFrame:
    raw = pd.read_csv(io.BytesIO(content), sep=";", dtype=str)
    raw.columns = [str(c).strip().strip('"').upper() for c in raw.columns]
    columns = set(raw.columns)

    if not {"SECONDS", "PID", "VALUE"} <= columns:
        raise ValueError("not a vertical-layout export (missing SECONDS/PID/VALUE columns)")

    df = pd.DataFrame()
    df["t"] = pd.to_numeric(raw["SECONDS"], errors="coerce")
    df["pid"] = raw["PID"]
    df["value"] = pd.to_numeric(raw["VALUE"], errors="coerce")
    df["unit"] = raw["UNITS"] if "UNITS" in columns else ""
    df["lat"] = pd.to_numeric(raw[_LAT_HEADER], errors="coerce") if _LAT_HEADER in columns else float("nan")
    df["lon"] = pd.to_numeric(raw[_LON_HEADER], errors="coerce") if _LON_HEADER in columns else float("nan")
    return df.dropna(subset=["t"]).reset_index(drop=True)


_UNIT_RE = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")


def _clock_to_seconds(value: str) -> float | None:
    try:
        h, m, rest = value.split(":")
        return int(h) * 3600 + int(m) * 60 + float(rest)
    except (ValueError, AttributeError):
        return None


def parse_horizontal(content: bytes) -> pd.DataFrame:
    """Wide layout (time + one column per PID, units in the header) -> tidy rows.
    PID column names like 'Engine RPM (rpm)' split into pid 'Engine RPM' + unit 'rpm'
    so they match the vertical PID names."""
    raw = pd.read_csv(io.BytesIO(content), dtype=str)
    raw.columns = [str(c).strip().strip('"') for c in raw.columns]
    time_col = raw.columns[0]
    t = raw[time_col].map(_clock_to_seconds)
    lat_col = next((c for c in raw.columns if c.lower() == "latitude"), None)
    lon_col = next((c for c in raw.columns if c.lower() in ("longtitude", "longitude")), None)
    lat = pd.to_numeric(raw[lat_col], errors="coerce") if lat_col else pd.Series([float("nan")] * len(raw))
    lon = pd.to_numeric(raw[lon_col], errors="coerce") if lon_col else pd.Series([float("nan")] * len(raw))

    skip = {time_col, lat_col, lon_col}
    frames = []
    for col in raw.columns:
        if col in skip:
            continue
        match = _UNIT_RE.match(col)
        pid, unit = (match.group(1), match.group(2)) if match else (col, "")
        sub = pd.DataFrame({"t": t, "pid": pid,
                            "value": pd.to_numeric(raw[col], errors="coerce"),
                            "unit": unit, "lat": lat, "lon": lon})
        frames.append(sub.dropna(subset=["value"]))
    cols = ["t", "pid", "value", "unit", "lat", "lon"]
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=cols)
    return df.dropna(subset=["t"]).sort_values("t").reset_index(drop=True)


def parse_drive(content: bytes) -> pd.DataFrame:
    """Auto-detect the layout from the header and parse to the tidy form."""
    head = content[:300].decode("latin-1", "ignore")
    first_line = head.splitlines()[0] if head else ""
    if ";" in first_line and "SECONDS" in first_line.upper():
        return parse_vertical(content)
    return parse_horizontal(content)
