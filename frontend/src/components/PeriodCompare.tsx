import { useState } from 'react';
import type { DriveMeta } from '../history/types';
import { bucketBy, type Period } from '../history/aggregate';
import { buildPeriodCompareRows, deltaColor } from '../history/compareMetrics';

const PERIODS: Period[] = ['day', 'week', 'month', 'year'];

// Compare two days/weeks/months/years of driving (merged per period).
// Selections fall back to the two most recent periods of the chosen granularity.
export default function PeriodCompare({ drives }: { drives: DriveMeta[] }) {
  const [granularity, setGranularity] = useState<Period>('month');
  const [aKey, setAKey] = useState('');
  const [bKey, setBKey] = useState('');
  const buckets = bucketBy(drives, granularity);
  const enough = buckets.length >= 2;
  const a = buckets.find((x) => x.key === aKey) ?? buckets[buckets.length - 2];
  const b = buckets.find((x) => x.key === bKey) ?? buckets[buckets.length - 1];
  const pick = (p: Period) => { setGranularity(p); setAKey(''); setBKey(''); };
  return (
    <section className="card">
      <h3 className="section-title">Compare periods</h3>
      <div className="history-controls">
        <span className="history-controls__group">
          {PERIODS.map((p) => (
            <button key={p} className="pill" onClick={() => pick(p)} disabled={granularity === p}>{p}</button>
          ))}
        </span>
        {enough && (
          <>
            <label>A&nbsp;
              <select aria-label="period A" value={a.key} onChange={(e) => setAKey(e.target.value)}>
                {buckets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
            <label>B&nbsp;
              <select aria-label="period B" value={b.key} onChange={(e) => setBKey(e.target.value)}>
                {buckets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
              </select>
            </label>
          </>
        )}
      </div>

      {!enough && (
        <p className="placeholder">Drive on at least two different {granularity}s to compare them —
        or switch the period above.</p>
      )}
      {enough && a.key === b.key && <p className="placeholder">Pick two different periods to compare.</p>}

      {enough && a.key !== b.key && (
        <table className="compare-table">
          <thead>
            <tr>
              <th scope="col">Metric</th><th scope="col">A · {a.label}</th>
              <th scope="col">B · {b.label}</th><th scope="col">Δ (B−A)</th>
            </tr>
          </thead>
          <tbody>
            {buildPeriodCompareRows(a, b).map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.a == null ? '—' : r.fmt(r.a)}</td>
                <td>{r.b == null ? '—' : r.fmt(r.b)}</td>
                <td style={{ color: deltaColor(r.delta, r.better), fontVariantNumeric: 'tabular-nums' }}>
                  {r.delta == null ? '—' : `${r.delta > 0 ? '▲ +' : r.delta < 0 ? '▼ −' : ''}${r.fmt(Math.abs(r.delta))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
