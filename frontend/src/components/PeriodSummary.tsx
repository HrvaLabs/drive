import { useState } from 'react';
import type { DriveMeta } from '../history/types';
import { bucketBy, type Period } from '../history/aggregate';

const PERIODS: Period[] = ['day', 'week', 'month', 'year'];

// "How much did I spend that day/week/month/year?" — one merged row per period
// (a day row is the whole day's driving combined), latest first.
export default function PeriodSummary({ drives }: { drives: DriveMeta[] }) {
  const [granularity, setGranularity] = useState<Period>('month');
  const rows = bucketBy(drives, granularity).slice().reverse();
  return (
    <section className="card">
      <h3 className="section-title">Spending by period</h3>
      <div className="history-controls">
        <span className="history-controls__group">
          {PERIODS.map((p) => (
            <button key={p} className="pill" onClick={() => setGranularity(p)} disabled={granularity === p}>{p}</button>
          ))}
        </span>
      </div>
      <table className="compare-table" aria-label="spending by period">
        <thead>
          <tr>
            <th scope="col">Period</th><th scope="col">Drives</th><th scope="col">km</th>
            <th scope="col">Fuel L</th><th scope="col">Cost €</th><th scope="col">CO₂ kg</th>
            <th scope="col">Avg L/100km</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.key}>
              <td>{b.label}</td><td>{b.count}</td><td>{b.distanceKm}</td><td>{b.fuelL}</td>
              <td>€{b.costEur}</td><td>{b.co2Kg}</td><td>{b.avgL100 > 0 ? b.avgL100 : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
