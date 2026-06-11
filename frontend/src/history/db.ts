import type { DriveAnalysis } from '../types';
import type { Car, DriveMeta, NamedPlace, StoredDrive } from './types';
import { parseDriveDate } from './driveDate';
import { autoTags, routeEnds } from './autotag';

// Private, per-device drive history in the browser. The server stays stateless;
// nothing here ever leaves the user's machine.
const DB_NAME = 'hrvadrive';
const STORE = 'drives';
const CARS = 'cars';
const PLACES = 'places';
const KV = 'kv'; // small settings (e.g. the linked auto-backup file handle)

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 4);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('savedAt', 'savedAt');
      }
      if (!db.objectStoreNames.contains(CARS)) {
        db.createObjectStore(CARS, { keyPath: 'vin' });
      }
      if (!db.objectStoreNames.contains(PLACES)) {
        db.createObjectStore(PLACES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(KV)) {
        db.createObjectStore(KV);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function metaOf(rec: StoredDrive): DriveMeta {
  const { analysis: _drop, ...meta } = rec;
  return meta;
}

export function toStored(analysis: DriveAnalysis, filename?: string, places: NamedPlace[] = []): StoredDrive {
  const s = analysis.summary;
  const ends = routeEnds(analysis, places);
  return {
    id: `${analysis.drive.startedAtClock ?? 't'}-${s.distanceKm}-${Date.now()}`,
    savedAt: Date.now(),
    driveDate: parseDriveDate(filename),
    startedAtClock: analysis.drive.startedAtClock,
    label: analysis.drive.vehicle.label ?? 'Drive',
    distanceKm: s.distanceKm,
    durationSeconds: analysis.drive.durationSeconds,
    fuelUsedL: s.fuelUsedL,
    costEur: s.fuelCostEur,
    co2Kg: s.co2Kg ?? 0,
    l100km: s.avgConsumptionL100km,
    eco: analysis.scores.eco,
    tags: autoTags(analysis, places),
    notes: '',
    fromPlace: ends.from ?? undefined,
    toPlace: ends.to ?? undefined,
    analysis,
  };
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function saveDrive(analysis: DriveAnalysis, filename?: string, carVin?: string): Promise<StoredDrive> {
  const places = await listPlaces().catch(() => [] as NamedPlace[]);
  const rec: StoredDrive = { ...toStored(analysis, filename, places), carVin };
  await run(STORE, 'readwrite', (s) => s.put(rec));
  return rec;
}

export async function updateDriveMeta(id: string, patch: { notes?: string; tags?: string[] }): Promise<void> {
  const rec = await getDrive(id);
  if (!rec) return;
  await run(STORE, 'readwrite', (s) => s.put({ ...rec, ...patch }));
}

export async function listDrives(): Promise<DriveMeta[]> {
  const all = await run<StoredDrive[]>(STORE, 'readonly', (s) => s.getAll());
  return all.map(metaOf).sort((a, b) => (b.driveDate ?? b.savedAt) - (a.driveDate ?? a.savedAt));
}

export function getDrive(id: string): Promise<StoredDrive | undefined> {
  return run<StoredDrive | undefined>(STORE, 'readonly', (s) => s.get(id));
}

export async function deleteDrive(id: string): Promise<void> {
  await run(STORE, 'readwrite', (s) => s.delete(id));
}

// Whole-store backup: the history lives only in this browser, so this file IS
// the user's data. Import merges by put (upsert on id/vin) — it never wipes.
export interface BackupFile {
  app: 'hrvadrive';
  schema: 1;
  exportedAt: number;
  cars: Car[];
  drives: StoredDrive[];
  places?: NamedPlace[]; // optional so pre-places backups stay importable
}

export async function exportAll(): Promise<BackupFile> {
  const drives = await run<StoredDrive[]>(STORE, 'readonly', (s) => s.getAll());
  const cars = await run<Car[]>(CARS, 'readonly', (s) => s.getAll());
  const places = await run<NamedPlace[]>(PLACES, 'readonly', (s) => s.getAll());
  return { app: 'hrvadrive', schema: 1, exportedAt: Date.now(), cars, drives, places };
}

export async function importAll(data: unknown): Promise<{ drives: number; cars: number; places: number }> {
  const d = data as Partial<BackupFile> | null;
  if (!d || d.app !== 'hrvadrive' || !Array.isArray(d.drives) || !Array.isArray(d.cars)) {
    throw new Error('Not a HrvaDrive backup');
  }
  const places = Array.isArray(d.places) ? d.places : [];
  for (const rec of d.drives) await run(STORE, 'readwrite', (s) => s.put(rec));
  for (const c of d.cars) await run(CARS, 'readwrite', (s) => s.put(c));
  for (const p of places) await run(PLACES, 'readwrite', (s) => s.put(p));
  return { drives: d.drives.length, cars: d.cars.length, places: places.length };
}

export async function clearAll(): Promise<void> {
  await run(STORE, 'readwrite', (s) => s.clear());
  await run(CARS, 'readwrite', (s) => s.clear());
  await run(PLACES, 'readwrite', (s) => s.clear());
  await run(KV, 'readwrite', (s) => s.clear());
}

export function getKv<T = unknown>(key: string): Promise<T | undefined> {
  return run<T | undefined>(KV, 'readonly', (s) => s.get(key));
}

export async function setKv(key: string, value: unknown): Promise<void> {
  await run(KV, 'readwrite', (s) => s.put(value, key));
}

export async function delKv(key: string): Promise<void> {
  await run(KV, 'readwrite', (s) => s.delete(key));
}

export function listPlaces(): Promise<NamedPlace[]> {
  return run<NamedPlace[]>(PLACES, 'readonly', (s) => s.getAll());
}

// Re-run auto-tagging across the WHOLE stored history (each record keeps its
// full analysis, so the route is available). ADDITIVE: new place tags and
// labels are added, existing tags — user-typed or older auto-tags — are never
// removed. Returns how many drives changed.
export async function retagDrives(places: NamedPlace[]): Promise<number> {
  const all = await run<StoredDrive[]>(STORE, 'readonly', (s) => s.getAll());
  let changed = 0;
  for (const rec of all) {
    const ends = routeEnds(rec.analysis, places);
    const fresh = autoTags(rec.analysis, places);
    const tags = [...(rec.tags ?? [])];
    for (const t of fresh) {
      if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) tags.push(t);
    }
    const fromPlace = ends.from ?? rec.fromPlace;
    const toPlace = ends.to ?? rec.toPlace;
    if (tags.length !== (rec.tags ?? []).length || fromPlace !== rec.fromPlace || toPlace !== rec.toPlace) {
      await run(STORE, 'readwrite', (s) => s.put({ ...rec, tags, fromPlace, toPlace }));
      changed++;
    }
  }
  return changed;
}

export async function savePlace(place: NamedPlace): Promise<void> {
  await run(PLACES, 'readwrite', (s) => s.put(place));
}

export async function deletePlace(id: string): Promise<void> {
  await run(PLACES, 'readwrite', (s) => s.delete(id));
}

export function listCars(): Promise<Car[]> {
  return run<Car[]>(CARS, 'readonly', (s) => s.getAll());
}

export async function saveCar(carRec: Car): Promise<void> {
  await run(CARS, 'readwrite', (s) => s.put(carRec));
}

export async function deleteCar(vin: string): Promise<void> {
  await run(CARS, 'readwrite', (s) => s.delete(vin));
}

export async function patchCar(vin: string, patch: Partial<Car>): Promise<void> {
  const c = await run<Car | undefined>(CARS, 'readonly', (s) => s.get(vin));
  if (c) await run(CARS, 'readwrite', (s) => s.put({ ...c, ...patch }));
}

export function touchCar(vin: string): Promise<void> {
  return patchCar(vin, { lastUsedAt: Date.now() });
}
