export interface RoutePoint { t: number; lat: number; lon: number; speedKmh: number }
export interface SeriesPoint { t: number; v: number }

export interface DriveEvent { type: string; t: number; lat: number | null; lon: number | null; value: number; durationSeconds: number }
export interface Scores { eco: number; style: string; rpmBandPct: number; idlePct: number; speedSteadiness: number; harshEvents: number; shortShiftPct?: number }
export interface Health { warmupSeconds: number | null; batteryVerdict: string; batteryVolts: number | null; fuelTrimVerdict: string }
export interface Bests { maxHp: number | null; peakBoostBar: number | null; maxAccelG: number | null; topSpeedKmh: number | null; maxRpm: number | null }
export interface Signal { unit: string; n: number; min: number; max: number; mean: number; points: SeriesPoint[] }
export interface EfficiencyPoint { speedKmh: number; l100km: number }
export interface Economy {
  pricePerLEur: number | null;
  costPerKm: number;
  assumedAnnualKm: number;
  projectedMonthlyEur: number | null;
  projectedYearlyEur: number | null;
  idleWasteEur: number;
  potentialSavingsEur: number;
  sweetSpotKmh: number | null;
  efficiencyCurve: EfficiencyPoint[];
}
export interface Tip { id: string; severity: string; title: string; detail: string; eurImpact: number | null }

export interface GearPoint { speedKmh: number; rpm: number; gear: number | null }
export interface GearUsage { label: string; ratio: number; pct: number }
export interface Gears { ratios: number[]; usage: GearUsage[]; unassignedPct: number; points: GearPoint[] }

export interface DriveSummary {
  distanceKm: number;
  movingSeconds: number;
  idleSeconds: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number;
  fuelUsedL: number;
  fuelCostEur: number;
  avgConsumptionL100km: number;
  elevationGainM: number;
  elevationLossM: number;
  co2Kg?: number;
  co2PerKmG?: number;
  climbEnergyKwh?: number;
  tripType?: string;
  stopGoPct?: number;
  fuelType?: string;
}

export interface DriveAnalysis {
  schemaVersion: string;
  drive: {
    source: string;
    startedAtClock: string | null;
    durationSeconds: number;
    vehicle: { label: string | null; vin: string | null; engine: string | null };
    fromPlace?: string | null; // nearest town at first/last GPS fix,
    toPlace?: string | null;   // resolved offline by the analysis service
  };
  summary: DriveSummary;
  route: RoutePoint[];
  series: Record<string, SeriesPoint[]>;
  dataQuality: {
    rowCount: number;
    pidsPresent: string[];
    distanceSource: string | null;
    warnings: string[];
  };
  events: DriveEvent[];
  scores: Scores;
  health: Health;
  bests: Bests;
  signals: Record<string, Signal>;
  tips: Tip[];
  economy: Economy;
  gears?: Gears;
}
