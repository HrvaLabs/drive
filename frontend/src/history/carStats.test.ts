import { describe, it, expect } from 'vitest';
import { carStats } from './carStats';
import type { StoredDrive } from './types';
import type { DriveAnalysis } from '../types';

// minimal StoredDrive factory — only the fields carStats reads
function drive(vin: string, o: Partial<{ km: number; fuel: number; cost: number; co2: number; dur: number; eco: number; idle: number; harsh: number; hp: number; top: number; boost: number; rpm: number; date: number }>): StoredDrive {
  const a = {
    summary: { idleSeconds: o.idle ?? 0 },
    scores: { harshEvents: o.harsh ?? 0 },
    bests: { maxHp: o.hp ?? null, topSpeedKmh: o.top ?? null, peakBoostBar: o.boost ?? null, maxRpm: o.rpm ?? null },
  } as unknown as DriveAnalysis;
  return {
    id: Math.random().toString(), savedAt: o.date ?? 1, driveDate: o.date ?? null,
    startedAtClock: null, label: 'x', carVin: vin,
    distanceKm: o.km ?? 0, durationSeconds: o.dur ?? 0, fuelUsedL: o.fuel ?? 0,
    costEur: o.cost ?? 0, co2Kg: o.co2 ?? 0, l100km: 0, eco: o.eco ?? 0,
    analysis: a,
  };
}

describe('carStats', () => {
  it('aggregates a car\'s drives and ignores other cars', () => {
    const drives = [
      drive('V1', { km: 100, fuel: 6, cost: 9, co2: 14, dur: 3600, eco: 80, idle: 360, harsh: 2, hp: 90, top: 150, date: 10 }),
      drive('V1', { km: 50, fuel: 4, cost: 6, co2: 9, dur: 1800, eco: 70, idle: 180, harsh: 1, hp: 110, top: 130, date: 20 }),
      drive('V2', { km: 999, fuel: 99 }),
    ];
    const s = carStats('V1', drives);
    expect(s.drives).toBe(2);
    expect(s.totalKm).toBe(150);
    expect(s.totalFuelL).toBe(10);
    expect(s.totalHarshEvents).toBe(3);
    expect(s.longestDriveKm).toBe(100);
    expect(s.maxHp).toBe(110);
    expect(s.topSpeedKmh).toBe(150);
    expect(s.avgEco).toBe(75);
    expect(s.avgL100).toBeCloseTo(6.667, 2); // 10/150*100
    expect(s.avgIdlePct).toBeCloseTo(10, 1); // 540/5400*100
    expect(s.firstAt).toBe(10);
    expect(s.lastAt).toBe(20);
  });

  it('returns zeros for a car with no drives', () => {
    expect(carStats('VX', []).drives).toBe(0);
  });
});
