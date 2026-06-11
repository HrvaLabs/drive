import { useState } from 'react';
import MetricChart from './MetricChart';
import type { DriveAnalysis, Signal } from '../types';

interface Props {
  signals: Record<string, Signal>;
  dataQuality: DriveAnalysis['dataQuality'];
}

export default function ExpertPanel({ signals, dataQuality }: Props) {
  const pids = Object.keys(signals).sort();
  const [selected, setSelected] = useState<string>(pids[0] ?? '');
  // if the analysis changes while this stays mounted, fall back to a valid PID
  const active = selected in signals ? selected : (pids[0] ?? '');
  const sig = signals[active];
  const [showAll, setShowAll] = useState(false);
  return (
    <section className="card expert">
      <h3 className="section-title">Expert / debug</h3>

      {dataQuality.warnings.length > 0 && (
        <ul className="warnings">
          {dataQuality.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      <p style={{ color: 'var(--muted)', fontSize: 13 }}>
        {dataQuality.rowCount.toLocaleString()} rows · {pids.length} signals · distance from {dataQuality.distanceSource}
      </p>

      <div className="expert__controls">
        <label style={{ color: 'var(--muted)', fontSize: 14 }}>
          Signal:{' '}
          <select aria-label="signal" value={active} onChange={(e) => setSelected(e.target.value)} disabled={showAll}>
            {pids.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {pids.length > 0 && (
          <button className="btn" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Single signal' : `Show all ${pids.length} graphs`}
          </button>
        )}
      </div>

      {showAll ? (
        <div className="expert__all">
          {pids.map((p) => (
            <MetricChart key={p} title={p} unit={signals[p].unit} points={signals[p].points} color="#5aa9ff" />
          ))}
        </div>
      ) : (
        sig && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              min {sig.min} · max {sig.max} · mean {sig.mean} · {sig.n} samples ({sig.unit})
            </p>
            <MetricChart title={active} unit={sig.unit} points={sig.points} color="#5aa9ff" />
          </div>
        )
      )}

      <details style={{ marginTop: 14 }}>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>All signals ({pids.length})</summary>
        <table>
          <thead><tr><th>PID</th><th>n</th><th>min</th><th>max</th><th>mean</th></tr></thead>
          <tbody>
            {pids.map((p) => (
              <tr key={p}>
                <td>{p}</td><td align="right">{signals[p].n}</td><td align="right">{signals[p].min}</td>
                <td align="right">{signals[p].max}</td><td align="right">{signals[p].mean}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
