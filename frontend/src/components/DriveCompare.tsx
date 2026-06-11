import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { DriveAnalysis, SeriesPoint } from '../types';
import type { DriveMeta, StoredDrive } from '../history/types';
import { getDrive } from '../history/db';
import {
  distribute, signalPoints, RPM_EDGES, RPM_SIGNALS, SPEED_EDGES, SPEED_SIGNALS,
} from '../history/distribution';
import { buildCompareRows, deltaColor } from '../history/compareMetrics';
import { fmtDriveDateTime } from '../time';
import ChartTable from './ChartTable';

const A_COLOR = '#0072B2'; // Okabe–Ito blue (colourblind-safe)
const B_COLOR = '#E69F00'; // Okabe–Ito orange

interface Props {
  drives: DriveMeta[];
}

const optLabel = (m: DriveMeta) =>
  `${fmtDriveDateTime(m.driveDate, m.savedAt, m.startedAtClock)} · ${m.label}`;

export default function DriveCompare({ drives }: Props) {
  const [aId, setAId] = useState(drives[0]?.id ?? '');
  const [bId, setBId] = useState(drives[1]?.id ?? '');
  const [a, setA] = useState<StoredDrive | undefined>(undefined);
  const [b, setB] = useState<StoredDrive | undefined>(undefined);

  useEffect(() => {
    if (!aId || drives.length < 2) return;
    let on = true;
    getDrive(aId).then((d) => on && setA(d));
    return () => { on = false; };
  }, [aId, drives.length]);
  useEffect(() => {
    if (!bId || drives.length < 2) return;
    let on = true;
    getDrive(bId).then((d) => on && setB(d));
    return () => { on = false; };
  }, [bId, drives.length]);

  // Keep A/B pointed at real drives as history loads or a selected drive is removed.
  useEffect(() => {
    if (drives.length < 2) return;
    const exists = (id: string) => drives.some((d) => d.id === id);
    // Functional updaters return cur unchanged when the id is still valid (React bails out, no cascade).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAId((cur) => (exists(cur) ? cur : drives[0].id));
    setBId((cur) => (exists(cur) ? cur : drives[1].id));
  }, [drives]);

  if (drives.length < 2) {
    return (
      <section className="card">
        <h3 className="section-title">Compare two drives</h3>
        <p className="placeholder">Save at least two drives to compare them.</p>
      </section>
    );
  }

  const sameDrive = aId === bId;
  const ready = !!a && !!b && !sameDrive;

  return (
    <section className="card">
      <h3 className="section-title">Compare two drives</h3>
      <div className="history-controls">
        <label>A&nbsp;
          <select aria-label="drive A" value={aId} onChange={(e) => setAId(e.target.value)}>
            {drives.map((d) => <option key={d.id} value={d.id}>{optLabel(d)}</option>)}
          </select>
        </label>
        <label>B&nbsp;
          <select aria-label="drive B" value={bId} onChange={(e) => setBId(e.target.value)}>
            {drives.map((d) => <option key={d.id} value={d.id}>{optLabel(d)}</option>)}
          </select>
        </label>
      </div>

      {sameDrive && <p className="placeholder">Pick two different drives to compare.</p>}

      {ready && (
        <>
          <CompareTable a={a!.analysis} b={b!.analysis} />
          <Dist title="Speed distribution" unit="km/h" edges={SPEED_EDGES}
                aPts={signalPoints(a!.analysis, SPEED_SIGNALS)} bPts={signalPoints(b!.analysis, SPEED_SIGNALS)} />
          <Dist title="RPM distribution" unit="rpm" edges={RPM_EDGES}
                aPts={signalPoints(a!.analysis, RPM_SIGNALS)} bPts={signalPoints(b!.analysis, RPM_SIGNALS)} />
          <p className="placeholder" style={{ marginTop: 4 }}>
            Distributions are by sample count (≈ time, since logging is ~1&nbsp;Hz), each shown as % of that drive's own samples.
          </p>
        </>
      )}
    </section>
  );
}

function CompareTable({ a, b }: { a: DriveAnalysis; b: DriveAnalysis }) {
  const rows = buildCompareRows(a, b);
  const cell = (v: number | null, fmt: (n: number) => string) => (v == null ? '—' : fmt(v));
  return (
    <table className="compare-table">
      <thead>
        <tr><th scope="col">Metric</th><th scope="col">A</th><th scope="col">B</th><th scope="col">Δ (B−A)</th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{cell(r.a, r.fmt)}</td>
            <td>{cell(r.b, r.fmt)}</td>
            <td style={{ color: deltaColor(r.delta, r.better), fontVariantNumeric: 'tabular-nums' }}>
              {r.delta == null ? '—' : `${r.delta > 0 ? '▲ +' : r.delta < 0 ? '▼ −' : ''}${r.fmt(Math.abs(r.delta))}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Dist({ title, unit, edges, aPts, bPts }: {
  title: string; unit: string; edges: number[];
  aPts: SeriesPoint[] | undefined; bPts: SeriesPoint[] | undefined;
}) {
  const da = distribute(aPts, edges);
  const db = distribute(bPts, edges);
  const aMissing = da.length === 0;
  const bMissing = db.length === 0;
  if (aMissing && bMissing) {
    return <p className="placeholder">{title}: not logged for either drive.</p>;
  }
  const labels = (aMissing ? db : da).map((x) => x.band);
  const data = labels.map((band, i) => ({ band, A: da[i]?.pct ?? 0, B: db[i]?.pct ?? 0 }));
  const note = aMissing ? ' — not logged for drive A' : bMissing ? ' — not logged for drive B' : '';
  const summary = `${title} as % of each drive’s samples (${unit}): ${labels.length} bands, A (blue) vs B (orange)${note}`;
  return (
    <section>
      <h4>{title} <small>(% of each drive’s time · {unit}){note}</small></h4>
      <div style={{ width: '100%', height: 220 }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="band" minTickGap={2} />
            <YAxis width={42} unit="%" />
            <Tooltip formatter={(v, n) => [`${v}%`, n === 'A' ? 'Drive A' : 'Drive B']} />
            <Legend />
            {!aMissing && <Bar dataKey="A" fill={A_COLOR} isAnimationActive={false} />}
            {!bMissing && <Bar dataKey="B" fill={B_COLOR} isAnimationActive={false} />}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption={summary} columns={[`${unit} band`, 'A %', 'B %']}
                  rows={data.map((d) => [d.band, aMissing ? '—' : d.A, bMissing ? '—' : d.B])} />
    </section>
  );
}
