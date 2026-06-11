import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DriveMeta, Car } from '../history/types';
import { bucketBy, totals, type Period } from '../history/aggregate';
import ChartTable from './ChartTable';
import DriveCompare from './DriveCompare';
import DriveRow from './DriveRow';
import PeriodSummary from './PeriodSummary';
import PeriodCompare from './PeriodCompare';
import TagSpend from './TagSpend';
import DriftCard from './DriftCard';
import TypicalCompare from './TypicalCompare';
import { allTags, filterDrivesByTags, searchDrives } from '../history/tags';
import { isParkedLog } from '../history/quality';

interface Props {
  drives: DriveMeta[];
  cars: Car[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onDeleteMany: (ids: string[]) => void;
  onChanged: () => void;
}

type Metric = 'costEur' | 'avgL100' | 'avgEco' | 'distanceKm' | 'co2Kg';
const METRICS: Array<[Metric, string]> = [
  ['costEur', 'Cost €'], ['avgL100', 'L/100km'], ['avgEco', 'Eco'], ['distanceKm', 'Distance km'], ['co2Kg', 'CO₂ kg'],
];

export default function HistoryView({ drives, cars, onOpen, onDelete, onDeleteMany, onChanged }: Props) {
  const [period, setPeriod] = useState<Period>('day');
  const [metric, setMetric] = useState<Metric>('costEur');
  const [selected, setSelected] = useState<string[]>([]);
  const [carVins, setCarVins] = useState<string[]>([]);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [hideParked, setHideParked] = useState(false);

  if (drives.length === 0) {
    return (
      <section className="card">
        <h3 className="section-title">History</h3>
        <p className="placeholder">No saved drives yet. Analyze a drive — or several at once — and they'll
        appear here, stored privately in your browser (nothing leaves your device).</p>
      </section>
    );
  }

  const tags = allTags(drives);
  // Ignore any selected tag that no longer exists (e.g. its last drive was deleted/untagged),
  // so the view falls back to all drives instead of going blank.
  const active = selected.filter((tg) => tags.includes(tg));
  const toggle = (tag: string) => setSelected((s) => (s.includes(tag) ? s.filter((x) => x !== tag) : [...s, tag]));

  const carsInUse = cars.filter((c) => drives.some((d) => d.carVin === c.vin));
  const byTag = filterDrivesByTags(drives, active);
  const byCar = carVins.length === 0 ? byTag : byTag.filter((d) => d.carVin && carVins.includes(d.carVin));
  const bySearch = searchDrives(byCar, query);
  const parkedCount = bySearch.filter(isParkedLog).length;
  const shown = hideParked ? bySearch.filter((d) => !isParkedLog(d)) : bySearch;
  const toggleCar = (vin: string) => setCarVins((s) => (s.includes(vin) ? s.filter((x) => x !== vin) : [...s, vin]));

  // Only visible checked rows can be deleted — a tag/car filter must never
  // cause an unseen drive to be removed.
  const visibleChecked = checkedIds.filter((id) => shown.some((d) => d.id === id));
  const toggleChecked = (id: string) =>
    setCheckedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allShownChecked = shown.length > 0 && shown.every((d) => checkedIds.includes(d.id));
  const toggleAll = () =>
    setCheckedIds((s) => (allShownChecked
      ? s.filter((id) => !shown.some((d) => d.id === id))
      : [...new Set([...s, ...shown.map((d) => d.id)])]));
  const deleteChecked = () => {
    if (!window.confirm(`Delete ${visibleChecked.length} drive(s)? This cannot be undone.`)) return;
    onDeleteMany(visibleChecked);
    setCheckedIds([]);
  };

  const t = totals(shown);
  const buckets = bucketBy(shown, period);
  const metricLabel = METRICS.find(([m]) => m === metric)?.[1] ?? metric;
  // Mean of the plotted bucket values (equal weight per bucket — what the eye
  // reads). Zero buckets are missing data (no fuel price / no PID), not free
  // driving, so they don't drag the average down.
  const plotted = buckets.map((b) => b[metric]).filter((v) => v > 0);
  const avg = Math.round((plotted.reduce((s, v) => s + v, 0) / (plotted.length || 1)) * 100) / 100;
  const trendSummary = `${metricLabel} by ${period}: ${buckets.length} ${period} buckets · avg ${avg}`;
  const kpis: Array<[string, string]> = [
    ['Drives', `${t.count}`],
    ['Distance', `${t.distanceKm} km`],
    ['Fuel', `${t.fuelL} L`],
    ['Cost', `€${t.costEur}`],
    ['CO₂', `${t.co2Kg} kg`],
    ['Avg economy', `${t.avgL100} L/100km`],
    ['Avg eco', `${t.avgEco}`],
  ];

  return (
    <div className="dash">
      <div className="filter-bar no-print">
        <input className="history-search" type="search" aria-label="search drives"
               placeholder="Search label, notes, tags…" value={query}
               onChange={(e) => setQuery(e.target.value)} />
        {(parkedCount > 0 || hideParked) && (
          <button className={`pill${hideParked ? ' pill--on' : ''}`} aria-pressed={hideParked}
                  onClick={() => setHideParked((v) => !v)}>
            Hide parked logs{parkedCount > 0 ? ` (${parkedCount})` : ''}
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="filter-bar no-print" role="group" aria-label="filter by tag">
          <button className="pill" onClick={() => setSelected([])} disabled={selected.length === 0}>All</button>
          {tags.map((tag) => (
            <button key={tag} className={`pill${selected.includes(tag) ? ' pill--on' : ''}`}
                    aria-pressed={selected.includes(tag)} onClick={() => toggle(tag)}>{tag}</button>
          ))}
        </div>
      )}

      {carsInUse.length > 0 && (
        <div className="filter-bar no-print" role="group" aria-label="filter by car">
          <button className="pill" onClick={() => setCarVins([])} disabled={carVins.length === 0}>All cars</button>
          {carsInUse.map((c) => (
            <button key={c.vin} className={`pill${carVins.includes(c.vin) ? ' pill--on' : ''}`}
                    aria-pressed={carVins.includes(c.vin)} onClick={() => toggleCar(c.vin)}>{c.label || c.vin}</button>
          ))}
        </div>
      )}

      <section className="card">
        <h3 className="section-title">History <small>· {t.count} drives, stored in your browser</small></h3>
        <div className="kpi-grid">
          {kpis.map(([l, v]) => (
            <div className="kpi" key={l}><div className="kpi__label">{l}</div><div className="kpi__value">{v}</div></div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Trends</h3>
        <div className="history-controls">
          <span className="history-controls__group">
            {(['day', 'week', 'month', 'year'] as Period[]).map((p) => (
              <button key={p} className="pill" onClick={() => setPeriod(p)} disabled={period === p}>{p}</button>
            ))}
          </span>
          <span className="history-controls__group">
            {METRICS.map(([m, label]) => (
              <button key={m} className="pill" onClick={() => setMetric(m)} disabled={metric === m}>{label}</button>
            ))}
          </span>
        </div>
        <div style={{ width: '100%', height: 240 }} role="img" aria-label={trendSummary}>
          <ResponsiveContainer>
            <LineChart data={buckets} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" minTickGap={20} />
              <YAxis width={50} />
              <Tooltip formatter={(v) => [`${v}`, metricLabel]} />
              <ReferenceLine y={avg} stroke="#5aa9ff" strokeDasharray="4 4"
                             label={{ value: `avg ${avg}`, position: 'insideTopRight', fill: '#5aa9ff', fontSize: 11 }} />
              <Line type="monotone" dataKey={metric} name={metricLabel}
                    stroke="#ff9f1c" dot={{ r: 2 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <ChartTable caption={trendSummary} columns={['Period', metricLabel]}
                    rows={buckets.map((b) => [b.label, b[metric]])} />
      </section>

      <DriftCard drives={shown} cars={cars} />

      <PeriodSummary drives={shown} />

      <TagSpend drives={shown} />

      <DriveCompare drives={drives} />

      <TypicalCompare drives={shown} />

      <PeriodCompare drives={shown} />

      <section className="card">
        <h3 className="section-title">Drives</h3>
        <div className="drive-list__bulk no-print">
          <label className="drive-list__selectall">
            <input type="checkbox" aria-label="select all drives"
                   checked={allShownChecked} onChange={toggleAll} /> Select all
          </label>
          {visibleChecked.length > 0 && (
            <button className="pill pill--danger" onClick={deleteChecked}>
              Delete selected ({visibleChecked.length})
            </button>
          )}
        </div>
        <div className="drive-list">
          {shown.map((d) => (
            <DriveRow key={d.id} drive={d} onOpen={onOpen} onDelete={onDelete} onChanged={onChanged}
                      checked={checkedIds.includes(d.id)} onToggle={toggleChecked} />
          ))}
        </div>
      </section>
    </div>
  );
}
