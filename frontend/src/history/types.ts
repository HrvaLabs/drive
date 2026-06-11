import type { DriveAnalysis } from '../types';

// Lightweight row for lists + trends (no heavy route/series/signals).
export interface DriveMeta {
  id: string;
  savedAt: number; // epoch ms — when the drive was saved into the browser
  driveDate?: number | null; // epoch ms of the actual drive (parsed from the filename); preferred for trends
  startedAtClock: string | null;
  label: string;
  distanceKm: number;
  durationSeconds: number;
  fuelUsedL: number;
  costEur: number;
  co2Kg: number;
  l100km: number;
  eco: number;
  notes?: string;
  tags?: string[];
  carVin?: string;
  fromPlace?: string;
  toPlace?: string;
}

export interface Car {
  vin: string;
  label: string;
  engine: string;
  createdAt: number;
  lastUsedAt: number;
  make?: string;
  model?: string;
  year?: string;
  bodyClass?: string;
  fuelType?: string;
  country?: string;
  decodedAt?: number;
  pricePerL?: string; // remembered €/L for this car (diesel vs petrol differ)
}

// The full record persisted in IndexedDB (meta + the complete report for reopen).
export interface StoredDrive extends DriveMeta {
  analysis: DriveAnalysis;
}

// A user-named location ("Home", "Work") with a geo-circle boundary. Lives
// ONLY in this browser (IndexedDB); matching happens client-side at save time.
export interface NamedPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
}
