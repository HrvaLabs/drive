import { useEffect, useRef, useState } from 'react';
import { analyzeDrive } from './api';
import type { DriveAnalysis } from './types';
import Uploader from './components/Uploader';
import Landing from './components/Landing';
import HistoryView from './components/HistoryView';
import GarageView from './components/GarageView';
import { decodeVinOffline } from './history/wmi';
import SummaryCard from './components/SummaryCard';
import ScoresCard from './components/ScoresCard';
import RouteMap from './components/RouteMap';
import BestsCard from './components/BestsCard';
import SpeedChart from './components/SpeedChart';
import GraphsPanel from './components/GraphsPanel';
import ElevationStrip from './components/ElevationStrip';
import TipsCard from './components/TipsCard';
import EconomyCard from './components/EconomyCard';
import SweetSpotChart from './components/SweetSpotChart';
import VehicleCard from './components/VehicleCard';
import GearChart from './components/GearChart';
import ExpertPanel from './components/ExpertPanel';
import Footer from './components/Footer';
import PrivacyOverlay from './components/PrivacyOverlay';
import SyncOverlay from './components/SyncOverlay';
import BatchProgress, { type BatchItem } from './components/BatchProgress';
import { saveDrive, listDrives, getDrive, deleteDrive, listCars, saveCar, deleteCar, touchCar, patchCar, clearAll, exportAll, importAll, listPlaces, savePlace, deletePlace, retagDrives } from './history/db';
import { decodeVin } from './history/vpic';
import { parseBrcHeader } from './history/brc';
import { parseDriveDate } from './history/driveDate';
import { routeEnds } from './history/autotag';
import { estimateAnnualKm } from './history/annualKm';
import { writeBackupIfLinked } from './history/autoBackup';
import type { DriveMeta, Car, NamedPlace, StoredDrive } from './history/types';
import './print.css';

type Phase = 'idle' | 'loading' | 'done' | 'error';
type Tab = 'analyze' | 'history' | 'garage';

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [cars, setCars] = useState<Car[]>([]);
  const [selectedCarVin, setSelectedCarVin] = useState<string>('');
  const [decodingVin, setDecodingVin] = useState<string>('');
  const refreshCars = () => listCars().then((list) => {
    setCars(list);
    setSelectedCarVin((cur) => {
      if (list.some((c) => c.vin === cur)) return cur;
      if (list.length === 0) return '';
      return [...list].sort((a, b) => b.lastUsedAt - a.lastUsedAt)[0].vin;
    });
  }).catch(() => {});
  const [pricePerL, setPricePerL] = useState<string>(() => {
    try { return localStorage.getItem('hrvadrive.pricePerL') ?? ''; } catch { return ''; }
  });
  const [analysis, setAnalysis] = useState<DriveAnalysis | null>(null);
  const [error, setError] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [batch, setBatch] = useState<BatchItem[]>([]);
  const batchFilesRef = useRef<File[]>([]);
  const patchBatch = (i: number, patch: Partial<BatchItem>) =>
    setBatch((cur) => cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const [tookMs, setTookMs] = useState<number | null>(null);
  const [showExpert, setShowExpert] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [syncCode, setSyncCode] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('analyze');
  const [history, setHistory] = useState<DriveMeta[]>([]);
  const [garageDrives, setGarageDrives] = useState<StoredDrive[]>([]);
  const [places, setPlaces] = useState<NamedPlace[]>([]);
  const refreshPlaces = () => listPlaces().then(setPlaces).catch(() => {});

  // History lives in the browser; every read/write is best-effort so a blocked
  // IndexedDB (private mode, tests) never breaks the report flow.
  const refreshHistory = () => listDrives().then(setHistory).catch(() => {});
  useEffect(() => { refreshHistory(); refreshCars(); refreshPlaces(); }, []);

  // Cloud-folder fallback sync: when a backup file is linked, quietly re-save
  // it after any data change (debounced; no-op when unsupported/unlinked).
  useEffect(() => {
    const id = setTimeout(() => { writeBackupIfLinked().catch(() => {}); }, 1500);
    return () => clearTimeout(id);
  }, [history, cars, places]);

  // QR deep link: the other device scanned #sync=CODE — open the panel joined.
  useEffect(() => {
    const m = /[#&]sync=([A-Za-z0-9]+)/.exec(window.location.hash);
    if (m) {
      setSyncCode(m[1].toUpperCase());
      setShowSync(true);
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  // Each car remembers its own €/L (a diesel and a petrol differ); "No car"
  // falls back to the last globally-entered price.
  useEffect(() => {
    const c = cars.find((x) => x.vin === selectedCarVin);
    if (c?.pricePerL) setPricePerL(c.pricePerL);
    else if (!selectedCarVin) {
      try { setPricePerL(localStorage.getItem('hrvadrive.pricePerL') ?? ''); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCarVin]);
  useEffect(() => {
    if (tab !== 'garage') return;
    listDrives()
      .then((metas) => Promise.all(metas.map((m) => getDrive(m.id))))
      .then((full) => setGarageDrives(full.filter((d): d is StoredDrive => !!d)))
      .catch(() => {});
  }, [tab, history]);

  const onAnalyze = () => analyzeFiles(files);

  // Re-run just the ✗ rows of the last batch (batchFilesRef stays index-aligned with batch).
  function retryFailed() {
    const failedFiles = batchFilesRef.current.filter((_, i) => batch[i]?.status === 'failed');
    if (failedFiles.length > 0) analyzeFiles(failedFiles);
  }

  async function analyzeFiles(list: File[]) {
    if (list.length === 0) return;
    batchFilesRef.current = list;
    setPhase('loading');
    setError('');
    setBatch(list.map((f) => ({ name: f.name, status: 'waiting' as const })));
    const started = performance.now();
    let lastSuccess: DriveAnalysis | null = null;
    let successes = 0;
    let failures = 0;
    let firstFailure = '';
    // A file whose recording date (from the filename, second precision) is
    // already in history — or earlier in this batch — is a re-upload: skip it.
    // Read IndexedDB directly: the `history` state can lag right after a batch.
    const stored = await listDrives().catch(() => [] as DriveMeta[]);
    // Yearly/monthly cost projections use the user's REAL annualised mileage
    // when the history is deep enough (falls back to 15k km/yr server-side).
    const annualKm = estimateAnnualKm(stored);
    const seen = new Set(stored.map((d) => d.driveDate).filter((x): x is number => x != null));
    for (let i = 0; i < list.length; i++) {
      const recordedAt = parseDriveDate(list[i].name);
      if (recordedAt != null && seen.has(recordedAt)) {
        patchBatch(i, { status: 'skipped' });
        continue;
      }
      patchBatch(i, { status: 'analyzing' });
      const carRec = cars.find((c) => c.vin === selectedCarVin);
      const vehicle = carRec ? { vin: carRec.vin, label: carRec.label, engine: carRec.engine } : undefined;
      try {
        const result = await analyzeDrive(list[i], null, pricePerL, vehicle, annualKm);
        await saveDrive(result, list[i].name, selectedCarVin || undefined).catch(() => {});
        lastSuccess = result;
        successes++;
        if (recordedAt != null) seen.add(recordedAt);
        patchBatch(i, { status: 'done' });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        if (!firstFailure) firstFailure = reason;
        failures++;
        patchBatch(i, { status: 'failed', error: reason });
      }
    }
    if (successes === 0) {
      if (failures > 0) {
        setError(failures === 1 ? firstFailure : `All ${failures} files failed`);
        setPhase('error');
      } else {
        setPhase(analysis ? 'done' : 'idle'); // everything skipped — nothing new to show
      }
      return;
    }
    try {
      const p = Number(pricePerL);
      if (pricePerL && Number.isFinite(p) && p > 0) localStorage.setItem('hrvadrive.pricePerL', pricePerL);
    } catch { /* ignore storage errors (private mode) */ }
    if (selectedCarVin) {
      await touchCar(selectedCarVin).catch(() => {});
      const p = Number(pricePerL);
      if (pricePerL && Number.isFinite(p) && p > 0) {
        await patchCar(selectedCarVin, { pricePerL }).catch(() => {});
        refreshCars();
      }
    }
    setTookMs(performance.now() - started);
    if (successes === list.length) setBatch([]);
    setAnalysis(lastSuccess);
    setTab('analyze');
    setPhase('done');
    refreshHistory();
  }

  async function onAddCar(file: File) {
    const parsed = parseBrcHeader(await file.arrayBuffer());
    if (!parsed || !parsed.vin) { setError('Could not read a VIN from that .brc file.'); return; }
    const now = Date.now();
    const wmi = decodeVinOffline(parsed.vin);
    await saveCar({ ...parsed, ...(wmi ?? {}), createdAt: now, lastUsedAt: now }).catch(() => {});
    await refreshCars();
    setSelectedCarVin(parsed.vin);
  }

  async function onRemoveCar(vin: string) {
    if (!window.confirm('Remove this car from your garage?')) return;
    await deleteCar(vin).catch(() => {});
    await refreshCars();
  }

  function onRenameCar(vin: string) {
    const car = cars.find((c) => c.vin === vin);
    if (!car) return;
    const name = window.prompt('Rename car', car.label)?.trim();
    if (name) saveCar({ ...car, label: name }).then(refreshCars).catch(() => {});
  }

  async function onDecodeCar(vin: string) {
    setDecodingVin(vin);
    try {
      const d = await decodeVin(vin);
      if (!d) { setError('Could not decode this VIN.'); return; }
      const carRec = cars.find((c) => c.vin === vin);
      if (carRec) {
        await saveCar({ ...carRec, ...d, decodedAt: Date.now() }).catch(() => {});
        await refreshCars();
      }
    } finally {
      setDecodingVin('');
    }
  }

  async function openStored(id: string) {
    const rec = await getDrive(id).catch(() => undefined);
    if (rec) {
      setAnalysis(rec.analysis);
      setShowExpert(false);
      setTab('analyze');
    }
  }

  async function removeStored(id: string) {
    if (!window.confirm('Delete this drive from your history?')) return;
    await deleteDrive(id).catch(() => {});
    refreshHistory();
  }

  // Bulk delete from the History multi-select; HistoryView has already confirmed.
  async function removeManyStored(ids: string[]) {
    for (const id of ids) await deleteDrive(id).catch(() => {});
    refreshHistory();
  }

  // Privacy-overlay backup: the history exists only in this browser, so offer
  // a file the user keeps. Restore merges (upsert) — it never wipes.
  async function backupAll() {
    const dump = await exportAll();
    const blob = new Blob([JSON.stringify(dump)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hrvadrive-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); // some browsers ignore clicks on detached anchors
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); // immediate revoke can abort the save
  }

  async function restoreAll(file: File): Promise<string> {
    let data: unknown;
    try { data = JSON.parse(await file.text()); } catch { throw new Error('Not a HrvaDrive backup'); }
    const res = await importAll(data);
    refreshHistory();
    refreshCars();
    refreshPlaces();
    return `Restored ${res.drives} drives · ${res.cars} cars${res.places > 0 ? ` · ${res.places} places` : ''}`;
  }

  // The privacy overlay's "Delete all data": wipe IndexedDB (drives + cars),
  // hrvadrive.* localStorage, and reset every piece of in-memory state.
  async function clearEverything() {
    await clearAll().catch(() => {});
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('hrvadrive.'))
        .forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore storage errors (private mode) */ }
    setAnalysis(null);
    setPhase('idle');
    setError('');
    setBatch([]);
    setTookMs(null);
    setPricePerL('');
    setSelectedCarVin('');
    setHistory([]);
    setCars([]);
    setPlaces([]);
  }

  // Name a point as a local place ("Home", "Work") and back-fill the tag
  // across the WHOLE history (additive — nothing is ever removed).
  async function namePlaceAt(point?: { lat: number; lon: number }) {
    if (!point) return;
    const name = window.prompt('Name this place (e.g. Home, Work):')?.trim();
    if (!name) return;
    // Reusing an existing place's name MOVES that place here (no duplicates).
    const existing = places.find((p) => p.name.toLowerCase() === name.toLowerCase());
    const defaultM = existing ? Math.round(existing.radiusKm * 1000) : 300;
    const radiusRaw = window.prompt('Radius in meters around it:', String(defaultM))?.trim();
    if (radiusRaw === undefined) return; // cancelled
    const radiusM = Math.min(5000, Math.max(50, Number(radiusRaw) || defaultM));
    const place: NamedPlace = existing
      ? { ...existing, lat: point.lat, lon: point.lon, radiusKm: radiusM / 1000 }
      : { id: `pl-${Date.now()}`, name, lat: point.lat, lon: point.lon, radiusKm: radiusM / 1000 };
    const n = await applyPlaceChange(place);
    window.alert(existing
      ? `\u201c${existing.name}\u201d moved.${n > 0 ? ` Tagged ${n} more drive${n === 1 ? '' : 's'}.` : ''}`
      : `\u201c${name}\u201d saved \u2014 tagged ${n} existing drive${n === 1 ? '' : 's'}.`);
  }

  async function onDeletePlace(id: string) {
    await deletePlace(id).catch(() => {});
    refreshPlaces();
  }

  // Shared tail of every place change: persist, back-fill tags, refresh.
  async function applyPlaceChange(place: NamedPlace): Promise<number> {
    await savePlace(place).catch(() => {});
    const all = await listPlaces().catch(() => [] as NamedPlace[]);
    const n = await retagDrives(all).catch(() => 0);
    refreshPlaces();
    refreshHistory();
    return n;
  }

  async function onRenamePlace(id: string) {
    const pl = places.find((p) => p.id === id);
    if (!pl) return;
    const name = window.prompt('New name for this place:', pl.name)?.trim();
    if (!name || name === pl.name) return;
    const n = await applyPlaceChange({ ...pl, name });
    if (n > 0) window.alert(`Renamed \u2014 tagged ${n} drive${n === 1 ? '' : 's'} with \u201c${name}\u201d (old tags stay; remove them per drive if unwanted).`);
  }

  async function onResizePlace(id: string) {
    const pl = places.find((p) => p.id === id);
    if (!pl) return;
    const raw = window.prompt('Radius in meters:', String(Math.round(pl.radiusKm * 1000)))?.trim();
    if (raw === undefined || raw === '') return;
    const radiusM = Math.min(5000, Math.max(50, Number(raw) || Math.round(pl.radiusKm * 1000)));
    const n = await applyPlaceChange({ ...pl, radiusKm: radiusM / 1000 });
    if (n > 0) window.alert(`Radius updated \u2014 ${n} more drive${n === 1 ? '' : 's'} matched \u201c${pl.name}\u201d.`);
  }

  const uploaderProps = {
    files, setFiles, pricePerL, setPricePerL,
    cars, selectedCarVin, setSelectedCarVin, onAddCar, onRemoveCar, onRenameCar,
    onDecodeCar, decodingVin,
    onAnalyze, loading: phase === 'loading',
  };

  return (
    <main className="app">
      <header className="app__header">
        <a className="brand-wrap" href="/">
          <div className="brand">Hrva<b>Drive</b></div>
          <p className="tagline">OBD2 drive intelligence</p>
        </a>
        <div className="toolbar no-print">
          <nav className="tabs" role="group" aria-label="view">
            <button className="pill" onClick={() => setTab('analyze')} disabled={tab === 'analyze'}>Analyze</button>
            <button className="pill" onClick={() => setTab('history')} disabled={tab === 'history'}>
              History{history.length ? ` (${history.length})` : ''}
            </button>
            <button className="pill" onClick={() => setTab('garage')} disabled={tab === 'garage'}>Garage</button>
          </nav>
          <button className="pill" onClick={() => { setSyncCode(undefined); setShowSync(true); }}>Sync</button>
          {tab === 'analyze' && analysis && (
            <button className="btn" onClick={() => window.print()}>Save as PDF</button>
          )}
        </div>
      </header>

      {error && <p className="error no-print">{error}</p>}
      <BatchProgress items={batch} onRetry={retryFailed} />

      {tab === 'history' ? (
        <HistoryView drives={history} cars={cars} onOpen={openStored} onDelete={removeStored}
                     onDeleteMany={removeManyStored} onChanged={refreshHistory} />
      ) : tab === 'garage' ? (
        <GarageView cars={cars} drives={garageDrives} onRenameCar={onRenameCar}
                    onRemoveCar={onRemoveCar} onDecodeCar={onDecodeCar} decodingVin={decodingVin}
                    places={places} onDeletePlace={onDeletePlace}
                    onRenamePlace={onRenamePlace} onResizePlace={onResizePlace} />
      ) : !analysis ? (
        <Landing {...uploaderProps} />
      ) : (
        <>
          <div className="analyzed-bar no-print">
            <Uploader {...uploaderProps} />
            {tookMs != null && <p className="analyzed-meta">Analyzed in {(tookMs / 1000).toFixed(1)} s · saved to History</p>}
          </div>
          <div className="dash">
            <VehicleCard
              drive={analysis.drive}
              dataQuality={analysis.dataQuality}
              decoded={cars.find((c) => c.vin === analysis.drive.vehicle.vin && c.make)}
              routeFrom={routeEnds(analysis, places).from}
              routeTo={routeEnds(analysis, places).to}
              onNameStart={analysis.route.length > 0 ? () => namePlaceAt(analysis.route[0]) : undefined}
              onNameEnd={analysis.route.length > 1 ? () => namePlaceAt(analysis.route[analysis.route.length - 1]) : undefined}
            />
            <SummaryCard summary={analysis.summary} durationSeconds={analysis.drive.durationSeconds} />
            <ScoresCard scores={analysis.scores} eventCount={analysis.events.length} idleSeconds={analysis.summary.idleSeconds} />
            <TipsCard tips={analysis.tips} />
            <EconomyCard economy={analysis.economy} fromHistory={estimateAnnualKm(history) != null} />
            <RouteMap route={analysis.route} events={analysis.events} places={places}
                      rpm={analysis.signals['Engine RPM']?.points}
                      onMapClick={(lat, lon) => namePlaceAt({ lat, lon })} />
            <BestsCard bests={analysis.bests} />
            <SpeedChart points={analysis.series.speedKmh ?? []} />
            <ElevationStrip altitude={analysis.signals['Altitude (GPS)']} />
            <GraphsPanel signals={analysis.signals} />
            <SweetSpotChart curve={analysis.economy.efficiencyCurve} sweetSpotKmh={analysis.economy.sweetSpotKmh} />
            <div className="expert-toggle no-print">
              <button className="btn" onClick={() => setShowExpert((v) => !v)}>
                {showExpert ? 'Hide advanced graphs' : 'Show advanced graphs'}
              </button>
            </div>
            {showExpert && (
              <>
                <GearChart gears={analysis.gears} />
                <ExpertPanel signals={analysis.signals} dataQuality={analysis.dataQuality} />
              </>
            )}
          </div>
        </>
      )}

      <Footer onPrivacy={() => setShowPrivacy(true)} />
      {showPrivacy && <PrivacyOverlay onClose={() => setShowPrivacy(false)} onClearAll={clearEverything}
                                      onBackup={backupAll} onRestore={restoreAll} />}
      {showSync && <SyncOverlay onClose={() => setShowSync(false)} initialCode={syncCode}
                                onSynced={() => { refreshHistory(); refreshCars(); refreshPlaces(); }} />}
    </main>
  );
}
