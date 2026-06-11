import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { saveDrive, listDrives, getDrive, deleteDrive, clearAll, updateDriveMeta,
         listCars, saveCar, deleteCar, touchCar, patchCar, exportAll, importAll,
         listPlaces, savePlace, deletePlace, retagDrives, getKv, setKv, delKv } from './db';
import type { DriveAnalysis } from '../types';
import type { Car } from './types';

function analysis(): DriveAnalysis {
  return {
    schemaVersion: '1',
    drive: { source: 'vertical_layout', startedAtClock: '16:00:00.000', durationSeconds: 600, vehicle: { label: 'My car', vin: null, engine: null } },
    summary: { distanceKm: 12, movingSeconds: 500, idleSeconds: 100, avgSpeedKmh: 40, maxSpeedKmh: 90, fuelUsedL: 1.2, fuelCostEur: 2, avgConsumptionL100km: 10, elevationGainM: 0, elevationLossM: 0 },
    route: [], series: {}, dataQuality: { rowCount: 1, pidsPresent: [], distanceSource: 'odometer', warnings: [] },
    events: [], scores: { eco: 65, style: 'normal', rpmBandPct: 0, idlePct: 0, speedSteadiness: 0, harshEvents: 0 },
    health: { warmupSeconds: null, batteryVerdict: 'unknown', batteryVolts: null, fuelTrimVerdict: 'unknown' },
    bests: { maxHp: null, peakBoostBar: null, maxAccelG: null, topSpeedKmh: null, maxRpm: null },
    signals: {}, tips: [],
    economy: { pricePerLEur: null, costPerKm: 0, assumedAnnualKm: 15000, projectedMonthlyEur: null, projectedYearlyEur: null, idleWasteEur: 0, potentialSavingsEur: 0, sweetSpotKmh: null, efficiencyCurve: [] },
  };
}

const car = (vin: string): Car => ({ vin, label: 'My Car', engine: '2.0 TDI', createdAt: 1, lastUsedAt: 1 });

describe('history db', () => {
  beforeEach(() => clearAll());

  it('saves, lists meta only, gets the full report, and deletes', async () => {
    const rec = await saveDrive(analysis());
    const list = await listDrives();
    expect(list).toHaveLength(1);
    expect(list[0].distanceKm).toBe(12);
    expect('analysis' in list[0]).toBe(false); // list is meta-only
    const full = await getDrive(rec.id);
    expect(full?.analysis.summary.distanceKm).toBe(12);
    await deleteDrive(rec.id);
    expect(await listDrives()).toHaveLength(0);
  });

  it('records the drive date parsed from the upload filename', async () => {
    const rec = await saveDrive(analysis(), '2026-06-05 23-20-43.csv');
    expect(rec.driveDate).not.toBeNull();
    const list = await listDrives();
    expect(list[0].driveDate).toBe(rec.driveDate);
  });

  it('updateDriveMeta persists tags + notes and keeps the analysis', async () => {
    const rec = await saveDrive(analysis(), '2026-01-01 10-00-00.csv');
    await updateDriveMeta(rec.id, { tags: ['commute', 'winter'], notes: 'icy roads' });
    const got = await getDrive(rec.id);
    expect(got?.tags).toEqual(['commute', 'winter']);
    expect(got?.notes).toBe('icy roads');
    expect(got?.analysis.summary.distanceKm).toBe(12); // heavy payload intact
  });

  it('updateDriveMeta is a no-op on a missing id', async () => {
    await expect(updateDriveMeta('nope', { tags: ['x'] })).resolves.toBeUndefined();
    expect(await listDrives()).toHaveLength(0);
  });

  it('exportAll -> importAll round-trips drives and cars', async () => {
    await saveDrive(analysis(), '2026-01-01 10-00-00.csv');
    await saveCar(car('VIN_A'));
    const dump = await exportAll();
    expect(dump.app).toBe('hrvadrive');
    await clearAll();
    const res = await importAll(dump);
    expect(res).toEqual({ drives: 1, cars: 1, places: 0 });
    const metas = await listDrives();
    expect(metas).toHaveLength(1);
    const full = await getDrive(metas[0].id);
    expect(full?.analysis.summary.distanceKm).toBe(12); // heavy payload intact
    expect(await listCars()).toHaveLength(1);
  });

  it('importAll merges by id (upsert, never wipes)', async () => {
    await saveDrive(analysis(), '2026-01-01 10-00-00.csv');
    const dump = await exportAll();
    const later = analysis();
    later.drive.startedAtClock = '11:11:11'; // distinct id (same-ms saves would collide)
    await saveDrive(later, '2026-01-02 10-00-00.csv'); // saved after the backup
    await importAll(dump);
    expect(await listDrives()).toHaveLength(2); // nothing duplicated, nothing lost
  });

  it('importAll rejects junk', async () => {
    await expect(importAll({ nope: true })).rejects.toThrow(/not a hrvadrive backup/i);
  });

  it('listDrives returns newest first (driveDate over savedAt)', async () => {
    const older = analysis(); older.drive.startedAtClock = '08:00:00';
    const newer = analysis(); newer.drive.startedAtClock = '09:00:00';
    await saveDrive(older, '2026-01-01 08-00-00.csv');
    await saveDrive(newer, '2026-03-01 09-00-00.csv');
    const metas = await listDrives();
    expect(metas.map((m) => m.startedAtClock)).toEqual(['09:00:00', '08:00:00']);
  });

  it('saveDrive seeds auto-tags and place meta from the analysis', async () => {
    const a = analysis();
    a.drive.fromPlace = 'Zagreb';
    a.drive.toPlace = 'Split';
    const rec = await saveDrive(a, '2026-01-05 10-00-00.csv');
    expect(rec.tags).toEqual(['zagreb', 'split']);
    expect(rec.fromPlace).toBe('Zagreb');
    expect(rec.toPlace).toBe('Split');
  });

  it('named places: save, list, delete, and they ride along in backups', async () => {
    await savePlace({ id: 'p1', name: 'Home', lat: 45.8, lon: 15.98, radiusKm: 0.3 });
    await savePlace({ id: 'p2', name: 'Work', lat: 45.7, lon: 15.9, radiusKm: 0.3 });
    expect(await listPlaces()).toHaveLength(2);
    const dump = await exportAll();
    expect(dump.places).toHaveLength(2);
    await deletePlace('p1');
    expect(await listPlaces()).toHaveLength(1);
    await importAll(dump); // restore brings Home back (merge)
    expect(await listPlaces()).toHaveLength(2);
  });

  it('importAll accepts old backups without places', async () => {
    const dump = await exportAll();
    const legacy = { ...dump } as Record<string, unknown>;
    delete legacy.places;
    await expect(importAll(legacy)).resolves.toEqual({ drives: 0, cars: 0, places: 0 });
  });

  it('clearAll wipes places too', async () => {
    await savePlace({ id: 'p1', name: 'Home', lat: 45.8, lon: 15.98, radiusKm: 0.3 });
    await clearAll();
    expect(await listPlaces()).toHaveLength(0);
  });

  it('retagDrives back-fills place tags on existing drives, additively', async () => {
    const a = analysis();
    a.route = [{ t: 0, lat: 45.8, lon: 15.98, speedKmh: 0 }, { t: 60, lat: 45.9, lon: 16.1, speedKmh: 50 }];
    a.drive.fromPlace = 'Zagreb';
    const rec = await saveDrive(a, '2026-01-01 10-00-00.csv');
    await updateDriveMeta(rec.id, { tags: [...(rec.tags ?? []), 'manual'] });
    const n = await retagDrives([{ id: 'p', name: 'Home', lat: 45.8, lon: 15.98, radiusKm: 0.3 }]);
    expect(n).toBe(1);
    const got = await getDrive(rec.id);
    expect(got?.tags).toContain('home');     // back-filled from the new place
    expect(got?.tags).toContain('manual');   // user tags never removed
    expect(got?.tags).toContain('zagreb');   // old auto-tag kept (additive)
    expect(got?.fromPlace).toBe('Home');     // label upgraded too
  });

  it('retagDrives is a no-op when no drive matches', async () => {
    await saveDrive(analysis(), '2026-01-01 10-00-00.csv'); // fixture has no route
    expect(await retagDrives([{ id: 'p', name: 'Home', lat: 45.8, lon: 15.98, radiusKm: 0.3 }])).toBe(0);
  });

  it('kv: set, get, delete, and clearAll wipes it', async () => {
    await setKv('flag', { a: 1 });
    expect(await getKv('flag')).toEqual({ a: 1 });
    await delKv('flag');
    expect(await getKv('flag')).toBeUndefined();
    await setKv('flag2', 'x');
    await clearAll();
    expect(await getKv('flag2')).toBeUndefined();
  });

  it('cars: save, list, delete', async () => {
    await saveCar(car('VIN_A'));
    await saveCar(car('VIN_B'));
    expect((await listCars()).map((c) => c.vin).sort()).toEqual(['VIN_A', 'VIN_B']);
    await deleteCar('VIN_A');
    expect((await listCars()).map((c) => c.vin)).toEqual(['VIN_B']);
  });

  it('patchCar merges fields and is a no-op on a missing vin', async () => {
    await saveCar(car('VIN_A'));
    await patchCar('VIN_A', { pricePerL: '1.65' });
    const [c] = await listCars();
    expect(c.pricePerL).toBe('1.65');
    expect(c.label).toBe('My Car'); // untouched fields survive
    await expect(patchCar('NOPE', { pricePerL: '2' })).resolves.toBeUndefined();
    expect(await listCars()).toHaveLength(1);
  });

  it('touchCar bumps lastUsedAt', async () => {
    await saveCar(car('VIN_A'));
    await touchCar('VIN_A');
    expect((await listCars()).find((c) => c.vin === 'VIN_A')!.lastUsedAt).toBeGreaterThan(1);
  });

  it('saveDrive persists carVin', async () => {
    const rec = await saveDrive(analysis(), 'd.csv', 'VIN_A');
    expect(rec.carVin).toBe('VIN_A');
    expect((await getDrive(rec.id))?.carVin).toBe('VIN_A');
  });

  it('saveCar round-trips decoded fields', async () => {
    await saveCar({ ...car('VIN_D'), make: 'Honda', model: 'Accord', year: '2003' });
    const c = (await listCars()).find((x) => x.vin === 'VIN_D')!;
    expect(c.make).toBe('Honda');
    expect(c.year).toBe('2003');
  });
});
