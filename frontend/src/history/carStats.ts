import type { StoredDrive } from './types';

export interface CarStats {
  drives: number;
  totalKm: number; totalFuelL: number; totalCostEur: number; totalCo2Kg: number;
  avgL100: number; avgEco: number; avgIdlePct: number;
  totalHarshEvents: number; longestDriveKm: number;
  maxHp: number; topSpeedKmh: number; peakBoostBar: number; maxRpm: number;
  firstAt: number | null; lastAt: number | null;
}

const peak = (a: number, v: number | null | undefined) => Math.max(a, v ?? 0);

export function carStats(vin: string, drives: StoredDrive[]): CarStats {
  const mine = drives.filter((d) => d.carVin === vin);
  const n = mine.length;
  const s: CarStats = {
    drives: n,
    totalKm: 0, totalFuelL: 0, totalCostEur: 0, totalCo2Kg: 0,
    avgL100: 0, avgEco: 0, avgIdlePct: 0,
    totalHarshEvents: 0, longestDriveKm: 0,
    maxHp: 0, topSpeedKmh: 0, peakBoostBar: 0, maxRpm: 0,
    firstAt: null, lastAt: null,
  };
  if (n === 0) return s;

  let ecoSum = 0;
  let durSum = 0;
  let idleSum = 0;
  for (const d of mine) {
    s.totalKm += d.distanceKm;
    s.totalFuelL += d.fuelUsedL;
    s.totalCostEur += d.costEur;
    s.totalCo2Kg += d.co2Kg;
    ecoSum += d.eco;
    durSum += d.durationSeconds;
    idleSum += d.analysis.summary.idleSeconds;
    s.totalHarshEvents += d.analysis.scores.harshEvents;
    s.longestDriveKm = Math.max(s.longestDriveKm, d.distanceKm);
    s.maxHp = peak(s.maxHp, d.analysis.bests.maxHp);
    s.topSpeedKmh = peak(s.topSpeedKmh, d.analysis.bests.topSpeedKmh);
    s.peakBoostBar = peak(s.peakBoostBar, d.analysis.bests.peakBoostBar);
    s.maxRpm = peak(s.maxRpm, d.analysis.bests.maxRpm);
    const at = d.driveDate ?? d.savedAt;
    s.firstAt = s.firstAt === null ? at : Math.min(s.firstAt, at);
    s.lastAt = s.lastAt === null ? at : Math.max(s.lastAt, at);
  }
  s.avgEco = Math.round(ecoSum / n);
  s.avgL100 = s.totalKm ? (s.totalFuelL / s.totalKm) * 100 : 0;
  s.avgIdlePct = durSum ? (idleSum / durSum) * 100 : 0;
  return s;
}
