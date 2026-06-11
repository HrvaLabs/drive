from pydantic import BaseModel, Field


class Vehicle(BaseModel):
    label: str | None = None
    vin: str | None = None
    engine: str | None = None


class Drive(BaseModel):
    source: str
    startedAtClock: str | None = None
    durationSeconds: float = 0.0
    vehicle: Vehicle = Field(default_factory=Vehicle)
    fromPlace: str | None = None  # nearest town at the first/last GPS fix,
    toPlace: str | None = None    # resolved OFFLINE (see app/places.py)


class Summary(BaseModel):
    distanceKm: float = 0.0
    movingSeconds: float = 0.0
    idleSeconds: float = 0.0
    avgSpeedKmh: float = 0.0
    maxSpeedKmh: float = 0.0
    fuelUsedL: float = 0.0
    fuelCostEur: float = 0.0
    avgConsumptionL100km: float = 0.0
    elevationGainM: float = 0.0
    elevationLossM: float = 0.0
    co2Kg: float = 0.0
    co2PerKmG: float = 0.0
    climbEnergyKwh: float = 0.0
    tripType: str = "unknown"  # "city" | "highway" | "mixed" | "unknown"
    stopGoPct: float = 0.0
    fuelType: str = "petrol"  # "petrol" | "diesel" — drives the CO2 factor


class RoutePoint(BaseModel):
    t: float
    lat: float
    lon: float
    speedKmh: float


class SeriesPoint(BaseModel):
    t: float
    v: float


class DataQuality(BaseModel):
    rowCount: int = 0
    pidsPresent: list[str] = Field(default_factory=list)
    distanceSource: str | None = None
    warnings: list[str] = Field(default_factory=list)


class Event(BaseModel):
    type: str  # "idle" | "hard_accel" | "hard_brake" | "high_rpm" | "coasting"
    t: float
    lat: float | None = None
    lon: float | None = None
    value: float = 0.0  # peak/representative value (g, rpm, ...)
    durationSeconds: float = 0.0  # for span events (idle, high_rpm, coasting)


class Scores(BaseModel):
    eco: int = 0  # 0..100
    style: str = "normal"  # "eco" | "normal" | "spirited"
    rpmBandPct: float = 0.0
    idlePct: float = 0.0
    speedSteadiness: float = 0.0  # 0..100 (higher = steadier)
    harshEvents: int = 0
    shortShiftPct: float = 0.0  # % of moving time revving high in a lower-than-needed gear


class Health(BaseModel):
    warmupSeconds: float | None = None
    batteryVerdict: str = "unknown"  # "healthy" | "ok" | "low" | "unknown"
    batteryVolts: float | None = None
    fuelTrimVerdict: str = "unknown"  # "normal" | "rich" | "lean" | "unknown"


class Bests(BaseModel):
    maxHp: float | None = None
    peakBoostBar: float | None = None
    maxAccelG: float | None = None
    topSpeedKmh: float | None = None
    maxRpm: float | None = None


class Signal(BaseModel):
    unit: str = ""
    n: int = 0
    min: float = 0.0
    max: float = 0.0
    mean: float = 0.0
    points: list[SeriesPoint] = Field(default_factory=list)


class Tip(BaseModel):
    id: str
    severity: str = "info"  # "good" | "info" | "warn"
    title: str
    detail: str = ""
    eurImpact: float | None = None


class EfficiencyPoint(BaseModel):
    speedKmh: float
    l100km: float


class Economy(BaseModel):
    pricePerLEur: float | None = None
    costPerKm: float = 0.0
    assumedAnnualKm: int = 15000
    projectedMonthlyEur: float | None = None
    projectedYearlyEur: float | None = None
    idleWasteEur: float = 0.0
    potentialSavingsEur: float = 0.0
    sweetSpotKmh: float | None = None
    efficiencyCurve: list[EfficiencyPoint] = Field(default_factory=list)


class GearPoint(BaseModel):
    speedKmh: float
    rpm: float
    gear: int | None = None  # index into Gears.ratios (0 = tallest used); None = unassigned


class GearUsage(BaseModel):
    label: str  # "tallest used" | "one below" | "two below" | "N below"
    ratio: float  # rpm per km/h
    pct: float  # % of moving time


class Gears(BaseModel):
    ratios: list[float] = Field(default_factory=list)  # ascending (tallest gear first), rpm per km/h
    usage: list[GearUsage] = Field(default_factory=list)
    unassignedPct: float = 0.0  # clutch/shift/coast share of moving time
    points: list[GearPoint] = Field(default_factory=list)  # downsampled scatter


class DriveAnalysis(BaseModel):
    schemaVersion: str = "2"
    drive: Drive
    summary: Summary = Field(default_factory=Summary)
    route: list[RoutePoint] = Field(default_factory=list)
    series: dict[str, list[SeriesPoint]] = Field(default_factory=dict)
    dataQuality: DataQuality = Field(default_factory=DataQuality)
    events: list[Event] = Field(default_factory=list)
    scores: Scores = Field(default_factory=Scores)
    health: Health = Field(default_factory=Health)
    bests: Bests = Field(default_factory=Bests)
    signals: dict[str, Signal] = Field(default_factory=dict)
    tips: list[Tip] = Field(default_factory=list)
    economy: Economy = Field(default_factory=Economy)
    gears: Gears = Field(default_factory=Gears)
