import { describe, it, expect } from 'vitest';
import { buildCompareRows, buildPeriodCompareRows, deltaColor } from './compareMetrics';
import type { Bucket } from './aggregate';
import type { DriveAnalysis } from '../types';

const mk = (over: { l100?: number; eur?: number; co2?: number; eco?: number; idle?: number; dist?: number; avg?: number }) =>
  ({
    summary: { avgConsumptionL100km: over.l100 ?? 6, co2PerKmG: over.co2 ?? 150, distanceKm: over.dist ?? 30, avgSpeedKmh: over.avg ?? 50 },
    economy: { costPerKm: over.eur ?? 0.2 },
    scores: { eco: over.eco ?? 60, idlePct: over.idle ?? 5 },
  } as unknown as DriveAnalysis);

describe('compareMetrics', () => {
  it('builds rows with B−A deltas in the documented order', () => {
    const rows = buildCompareRows(mk({ l100: 6 }), mk({ l100: 5.4 }));
    expect(rows.map((r) => r.label)).toEqual([
      'L/100km', 'Cost €/km', 'CO₂ g/km', 'Eco score', 'Idle %', 'Distance km', 'Avg speed km/h',
    ]);
    const l100 = rows[0];
    expect(l100.a).toBe(6);
    expect(l100.b).toBe(5.4);
    expect(l100.delta).toBeCloseTo(-0.6, 5);
    expect(l100.better).toBe('down');
  });

  it('formats per the metric: L/100km 1dp, CO₂ g/km integer, cost 2dp', () => {
    const rows = buildCompareRows(mk({}), mk({}));
    const byLabel = (l: string) => rows.find((r) => r.label === l)!;
    expect(byLabel('L/100km').fmt(6)).toBe('6.0');
    expect(byLabel('CO₂ g/km').fmt(150)).toBe('150');
    expect(byLabel('Cost €/km').fmt(0.2)).toBe('0.20');
  });

  it('treats a 0 ratio metric as missing (—), but 0 idle/eco as valid', () => {
    const rows = buildCompareRows(mk({ co2: 0, idle: 0 }), mk({ co2: 140, idle: 0 }));
    const co2 = rows.find((r) => r.label === 'CO₂ g/km')!;
    expect(co2.a).toBeNull();        // 0 g/km -> missing
    expect(co2.delta).toBeNull();    // can't delta against a missing value
    const idle = rows.find((r) => r.label === 'Idle %')!;
    expect(idle.a).toBe(0);          // 0% idle is a real, good value
    expect(idle.delta).toBe(0);
  });

  it('deltaColor: green when improved, red when worse, muted when neutral/missing', () => {
    expect(deltaColor(-0.6, 'down')).toBe('#1a9850');  // lower is better -> improved
    expect(deltaColor(0.6, 'down')).toBe('#d73027');   // higher is worse
    expect(deltaColor(9, 'up')).toBe('#1a9850');       // higher is better
    expect(deltaColor(5, 'neutral')).toBe('#9aa0a6');
    expect(deltaColor(null, 'down')).toBe('#9aa0a6');
    expect(deltaColor(0, 'down')).toBe('#9aa0a6');     // no change -> muted
  });
});

describe('buildPeriodCompareRows', () => {
  const bucket = (over: Partial<Bucket> = {}): Bucket => ({
    key: '2026-06', label: 'Jun 2026', count: 4, distanceKm: 100, fuelL: 6,
    costEur: 10, co2Kg: 14, avgL100: 6, avgEco: 70, ...over,
  });

  it('derives €/km and deltas between two buckets', () => {
    const rows = buildPeriodCompareRows(bucket(), bucket({ costEur: 24, distanceKm: 120, count: 5 }));
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel['Cost €'].delta).toBe(14);
    expect(byLabel['Cost €'].better).toBe('neutral');
    expect(byLabel['€/km'].a).toBe(0.1);
    expect(byLabel['€/km'].b).toBe(0.2);
    expect(byLabel['€/km'].better).toBe('down');
    expect(byLabel['Drives'].delta).toBe(1);
    expect(byLabel['Avg eco'].better).toBe('up');
  });

  it('reports null ratios when distance or consumption is missing', () => {
    const rows = buildPeriodCompareRows(bucket({ distanceKm: 0, avgL100: 0 }), bucket());
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(byLabel['€/km'].a).toBeNull();
    expect(byLabel['Avg L/100km'].a).toBeNull();
    expect(byLabel['€/km'].delta).toBeNull();
  });
});
