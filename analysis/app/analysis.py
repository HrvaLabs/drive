import pandas as pd

from app import bests as bests_mod
from app import economy as economy_mod
from app import events as events_mod
from app import gears as gears_mod
from app import health as health_mod
from app import metrics, places, routes, scores as scores_mod
from app import signals as signals_mod
from app import tips as tips_mod
from app.models import (
    DataQuality,
    Drive,
    DriveAnalysis,
    RoutePoint,
    SeriesPoint,
    Summary,
    Vehicle,
)


def _clock(seconds: float) -> str:
    total_ms = int(round(seconds * 1000))
    h = total_ms // 3_600_000
    m = (total_ms % 3_600_000) // 60_000
    s = (total_ms % 60_000) // 1000
    ms = total_ms % 1000
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def build_drive_analysis(df: pd.DataFrame, source: str, price_per_l: float | None = None,
                         annual_km: int | None = None,
                         vehicle: dict | None = None) -> DriveAnalysis:
    distance, distance_source, distance_warnings = metrics.resolve_distance(df)
    speed = metrics.speed_stats(df)
    mv = metrics.moving_idle_seconds(df)
    fuel_l, _fuel_src = metrics.fuel_used_l(df)
    cost = metrics.fuel_cost_eur(df, fuel_l, price_per_l)
    gain, loss = metrics.elevation_gain_loss(df)
    fuel_type = metrics.detect_fuel_type(df, vehicle.get("engine") if vehicle else None)
    co2 = metrics.co2_kg(fuel_l, fuel_type)
    trip_type, stop_go = metrics.trip_context(df, speed["avgSpeedKmh"])

    summary = Summary(
        distanceKm=round(distance, 3),
        movingSeconds=mv["movingSeconds"],
        idleSeconds=mv["idleSeconds"],
        avgSpeedKmh=speed["avgSpeedKmh"],
        maxSpeedKmh=speed["maxSpeedKmh"],
        fuelUsedL=round(fuel_l, 3),
        fuelCostEur=round(cost, 2),
        avgConsumptionL100km=metrics.consumption_l_100km(fuel_l, distance),
        elevationGainM=gain,
        elevationLossM=loss,
        co2Kg=co2,
        co2PerKmG=round(co2 * 1000.0 / distance, 0) if distance >= 1.0 else 0.0,
        climbEnergyKwh=metrics.climb_energy_kwh(gain),
        tripType=trip_type,
        stopGoPct=stop_go,
        fuelType=fuel_type,
    )

    route = [RoutePoint(**p) for p in routes.route_points(df)]
    series = {"speedKmh": [SeriesPoint(**p) for p in routes.speed_series(df)]}

    detected = events_mod.detect_events(df)
    harsh = sum(1 for e in detected if e.type in ("hard_accel", "hard_brake"))
    score_obj = scores_mod.build_scores(df, harsh)
    health_obj = health_mod.build_health(df)
    economy_obj = (economy_mod.build_economy(df, summary, score_obj, detected, price_per_l, annual_km)
                   if annual_km else economy_mod.build_economy(df, summary, score_obj, detected, price_per_l))

    from_place, to_place = places.route_places(df)
    return DriveAnalysis(
        drive=Drive(
            source=source,
            startedAtClock=_clock(metrics.drive_window(df)[0]),
            durationSeconds=metrics.duration_seconds(df),
            vehicle=Vehicle(**vehicle) if vehicle else Vehicle(label="My car"),
            fromPlace=from_place,
            toPlace=to_place,
        ),
        summary=summary,
        route=route,
        series=series,
        dataQuality=DataQuality(
            rowCount=int(len(df)),
            pidsPresent=sorted(df["pid"].dropna().unique().tolist()),
            distanceSource=distance_source,
            warnings=distance_warnings + metrics.time_warnings(df)
            + metrics.quality_warnings(df, distance, distance_source)
            + metrics.trim_warnings(df),
        ),
        events=detected,
        scores=score_obj,
        health=health_obj,
        bests=bests_mod.build_bests(df),
        signals=signals_mod.build_signals(df),
        tips=tips_mod.build_tips(detected, score_obj, health_obj, summary, economy_obj),
        economy=economy_obj,
        gears=gears_mod.build_gears(df),
    )
