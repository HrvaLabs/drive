import numpy as np
import pandas as pd

from app.geo import haversine_km

# Engine/threshold defaults — see spec §6. Configurable, not gospel.
_IDLE_SPEED_KMH = 1.0


def series(df: pd.DataFrame, pid: str) -> pd.DataFrame:
    """The (t, value) samples for one PID, sorted by time, NaNs dropped.
    Case-insensitive exact match, so a wrong-ECU export's 'Engine Fuel Rate'
    resolves the same as 'Engine fuel rate' (never substring — that would catch
    'Distance travelled (total)')."""
    mask = df["pid"].fillna("").astype(str).str.casefold() == pid.casefold()
    s = df[mask][["t", "value"]].dropna().sort_values("t")
    return s.reset_index(drop=True)


def speed_source(df: pd.DataFrame) -> str | None:
    """Prefer OBD 'Vehicle speed'; fall back to 'Speed (GPS)'."""
    if not series(df, "Vehicle speed").empty:
        return "Vehicle speed"
    if not series(df, "Speed (GPS)").empty:
        return "Speed (GPS)"
    return None


def gps_track(df: pd.DataFrame) -> pd.DataFrame:
    """Rows with a fix, consecutive duplicates removed (every row repeats the
    last fix in this format, so dedup gives the real track)."""
    gps = df.dropna(subset=["lat", "lon"]).sort_values("t")
    moved = (gps["lat"] != gps["lat"].shift()) | (gps["lon"] != gps["lon"].shift())
    return gps[moved][["t", "lat", "lon"]].reset_index(drop=True)


def gps_distance_km(df: pd.DataFrame) -> float:
    """Distance from integrating the GPS track. Raw GPS noise inflates this sum
    (spec §6), so the odometer PID is preferred when present."""
    track = gps_track(df)
    if len(track) < 2:
        return 0.0
    lat = track["lat"].to_numpy()
    lon = track["lon"].to_numpy()
    seg = haversine_km(lat[:-1], lon[:-1], lat[1:], lon[1:])
    return float(np.nansum(seg))


def odometer_km(df: pd.DataFrame) -> float | None:
    """Trip distance from the 'Distance travelled' PID (a per-trip counter that
    starts at 0); None if absent. This is the vehicle's own measured distance."""
    s = series(df, "Distance travelled")
    return float(s["value"].iloc[-1]) if not s.empty else None


# Above this fraction, GPS and odometer are deemed to disagree (spec §6).
_DISTANCE_DISAGREE = 0.15


def resolve_distance(df: pd.DataFrame) -> tuple[float, str, list[str]]:
    """Pick the trip distance: prefer the odometer PID, fall back to GPS.
    Returns (km, source, warnings). The odometer is preferred because raw GPS
    haversine sums are inflated by position noise (spec §6)."""
    gps = gps_distance_km(df)
    odo = odometer_km(df)
    if odo is not None:
        warnings: list[str] = []
        if gps > 0 and abs(gps - odo) / max(odo, 1e-9) > _DISTANCE_DISAGREE:
            warnings.append(
                f"GPS distance {gps:.1f} km disagrees with odometer {odo:.1f} km; using odometer"
            )
        return round(odo, 3), "odometer", warnings
    return round(gps, 3), "gps", []


def drive_window(df: pd.DataFrame) -> tuple[float, float]:
    """The driving span [t0, t1]: first to last engine-on (Engine RPM > 0) sample, so a
    leading/trailing parked diagnostic snapshot doesn't inflate duration or the 1 Hz grid.
    Fallbacks: no RPM PID / RPM never > 0 -> the speed signal's span; else the full span."""
    rpm = series(df, "Engine RPM")
    on = rpm[rpm["value"] > 0]["t"] if not rpm.empty else rpm.get("t", pd.Series(dtype=float))
    if not on.empty:
        return float(on.min()), float(on.max())
    src = speed_source(df)
    if src is not None and not series(df, src).empty:
        s = series(df, src)["t"]
        return float(s.min()), float(s.max())
    return float(df["t"].min()), float(df["t"].max())


def duration_seconds(df: pd.DataFrame) -> float:
    t0, t1 = drive_window(df)
    return float(t1 - t0)


def resample_1hz(df: pd.DataFrame, pids: list[str], tolerance: float | None = None) -> pd.DataFrame:
    """A 1Hz time grid with each PID forward-filled onto it (backward asof).
    Bounds are the driving window (drive_window) so leading/trailing engine-off
    samples don't inflate the grid. `tolerance` caps how stale a sample may be
    (seconds): inside a logging gap (engine off mid-recording) values become
    NaN instead of being smeared from before the gap."""
    w0, w1 = drive_window(df)
    t0 = float(np.floor(w0))
    t1 = float(np.ceil(w1))
    grid = pd.DataFrame({"t": np.arange(t0, t1 + 1.0, 1.0)})
    for pid in pids:
        s = series(df, pid).rename(columns={"value": pid})
        if s.empty:
            grid[pid] = np.nan
        else:
            grid = pd.merge_asof(grid, s, on="t", direction="backward", tolerance=tolerance)
    return grid


def speed_stats(df: pd.DataFrame) -> dict:
    """Average is the time-weighted mean of the speed signal (1Hz resampled) so
    it matches the speed chart; max is the peak sample (spec §6)."""
    src = speed_source(df)
    if src is None:
        return {"avgSpeedKmh": 0.0, "maxSpeedKmh": 0.0, "source": None}
    samples = series(df, src)["value"]
    grid = resample_1hz(df, [src])[src]
    avg = float(np.nanmean(grid)) if grid.notna().any() else 0.0
    return {"avgSpeedKmh": round(avg, 1), "maxSpeedKmh": float(samples.max()), "source": src}


# A sample older than this is stale: mid-recording engine-off gaps (errand
# stops) must count as neither moving nor idling.
_STALE_S = 30.0


def moving_idle_seconds(df: pd.DataFrame) -> dict:
    src = speed_source(df)
    if src is None:
        return {"movingSeconds": 0, "idleSeconds": 0}
    grid = resample_1hz(df, [src, "Engine RPM"], tolerance=_STALE_S)
    speed = grid[src]
    rpm = grid["Engine RPM"]
    moving = int((speed >= _IDLE_SPEED_KMH).sum())
    idle = int(((speed < _IDLE_SPEED_KMH) & (rpm > 0)).sum())
    return {"movingSeconds": moving, "idleSeconds": idle}


def fuel_used_l(df: pd.DataFrame) -> tuple[float, str | None]:
    cumulative = series(df, "Fuel used")
    if not cumulative.empty:
        return float(cumulative["value"].iloc[-1]), "Fuel used"
    rate = series(df, "Engine fuel rate")  # L/h
    if rate.empty:
        return 0.0, None
    t = rate["t"].to_numpy()
    v = rate["value"].to_numpy()
    used = float(np.sum(v[:-1] * np.diff(t) / 3600.0))
    return used, "Engine fuel rate (integrated)"


def fuel_cost_eur(df: pd.DataFrame, fuel_l: float, price_per_l: float | None) -> float:
    # An explicit manual €/L wins so the user can correct a stale/wrong logged price.
    if price_per_l:
        return round(fuel_l * price_per_l, 2)
    price = series(df, "Fuel used price")  # else the car's own logged cumulative cost
    if not price.empty:
        return float(price["value"].iloc[-1])
    return 0.0


def consumption_l_100km(fuel_l: float, distance_km: float) -> float:
    # Tiny distances make fuel economy meaningless (e.g. idling 0.1 km -> 240 L/100km).
    if distance_km < 1.0:
        return 0.0
    return round(fuel_l / distance_km * 100.0, 2)


def elevation_gain_loss(df: pd.DataFrame) -> tuple[float, float]:
    alt = series(df, "Altitude (GPS)")
    if alt.empty:
        return 0.0, 0.0
    smoothed = alt["value"].rolling(5, min_periods=1).mean().to_numpy()
    deltas = np.diff(smoothed)
    gain = float(np.sum(deltas[deltas > 0]))
    loss = float(-np.sum(deltas[deltas < 0]))
    return round(gain, 1), round(loss, 1)


# Tailpipe CO2 per litre burned (pure combustion). Diesel is denser/more carbon
# per litre, so it emits ~14% more CO2 per litre than petrol — using the petrol
# factor for a diesel under-reports it.
_CO2_KG_PER_L = {"petrol": 2.31, "diesel": 2.64}
_CLIMB_MASS_KG = 1300  # assumed compact-car mass for the climb-energy fun fact

# Substrings that mark a diesel engine in the .brc engine string (case-folded).
# Petrol direct-injection badges (GDI/TSI/TFSI/MPI) are deliberately NOT here.
_DIESEL_ENGINE_MARKERS = (
    "diesel", "tdi", "tdci", "hdi", "bluehdi", "dci", "cdi", "cdti", "crdi",
    "jtd", "d-4d", "d4d", "bluetec", "skyactiv-d", "multijet",
)


def detect_fuel_type(df: pd.DataFrame, engine_label: str | None = None) -> str:
    """Best-effort 'diesel' vs 'petrol' so CO2 uses the right factor. Diesel if the
    .brc engine string names a diesel engine, or a DPF/particulate PID is present
    (petrol cars have no particulate-filter channel). Defaults to petrol."""
    label = (engine_label or "").casefold()
    if any(m in label for m in _DIESEL_ENGINE_MARKERS):
        return "diesel"
    pids = df["pid"].dropna().astype(str).str.casefold()
    if pids.str.contains("dpf|particulate|diesel", regex=True).any():
        return "diesel"
    return "petrol"


def co2_kg(fuel_l: float, fuel_type: str = "petrol") -> float:
    """Tailpipe CO2 (kg) for the fuel burned — petrol ≈ 2.31, diesel ≈ 2.64 kg/L."""
    return round(fuel_l * _CO2_KG_PER_L.get(fuel_type, _CO2_KG_PER_L["petrol"]), 2)


def climb_energy_kwh(gain_m: float, mass_kg: float = _CLIMB_MASS_KG) -> float:
    """Gravitational energy to lift the car through the net elevation gain (kWh).
    A physics 'fun fact'; assumes ~1.3 t."""
    return round(mass_kg * 9.81 * max(0.0, gain_m) / 3_600_000.0, 2)


def trip_context(df: pd.DataFrame, avg_speed_kmh: float) -> tuple[str, float]:
    """Coarse trip type (city / highway / mixed) + stop-and-go share: the % of
    engine-on time spent under 20 km/h."""
    src = speed_source(df)
    if src is None:
        return "unknown", 0.0
    grid = resample_1hz(df, [src])[src].dropna()
    if grid.empty:
        return "unknown", 0.0
    stop_go = round(float((grid < 20.0).sum()) / len(grid) * 100.0, 0)
    trip = "city" if avg_speed_kmh < 35 else "highway" if avg_speed_kmh > 65 else "mixed"
    return trip, stop_go


def time_warnings(df: pd.DataFrame) -> list[str]:
    """v1 assumes a single-day drive (SECONDS is seconds-since-midnight, no
    date). Flag a likely midnight rollover instead of mis-reporting duration."""
    if (df["t"].diff().dropna() < 0).any():
        return ["time decreases mid-drive (likely midnight rollover); v1 assumes a single-day drive"]
    return []


def quality_warnings(df: pd.DataFrame, distance_km: float, distance_source: str) -> list[str]:
    """Honest flags for partial / wrong-ECU logs so the UI can show what's limited."""
    out: list[str] = []
    if distance_source == "gps":
        out.append("distance is from GPS only (no odometer); it may be over-reported")
    if distance_km < 1.0:
        out.append("drive is very short; fuel economy is unreliable")
    if speed_source(df) is None:
        out.append("no speed signal in this log; speed metrics are limited")
    return out


_TRIM_WARN_S = 60.0  # only flag a meaningful trim, not a few seconds of parking


def trim_warnings(df: pd.DataFrame) -> list[str]:
    """Flag when a parked diagnostic snapshot was trimmed from the drive window, so the
    user knows duration now reflects the actual drive."""
    t0, t1 = drive_window(df)
    trimmed = float(df["t"].max() - df["t"].min()) - (t1 - t0)
    if trimmed > _TRIM_WARN_S:
        return [f"excluded {trimmed / 60:.0f} min of engine-off logging (likely a parked "
                f"diagnostic snapshot) so duration reflects the actual drive"]
    return []
