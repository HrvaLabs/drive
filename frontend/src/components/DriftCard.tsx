import type { Car, DriveMeta } from '../history/types';
import { consumptionDrift, type DriftResult } from '../history/drift';

const VERDICT: Record<DriftResult['verdict'], { icon: string; color: string }> = {
  rising: { icon: '▲', color: 'var(--bad)' },
  stable: { icon: '●', color: 'var(--muted)' },
  improving: { icon: '▼', color: 'var(--good)' },
};

// Maintenance flag: recent-vs-baseline median L/100km per car. Drift across
// different cars is meaningless, so each car gets its own verdict.
export default function DriftCard({ drives, cars }: { drives: DriveMeta[]; cars: Car[] }) {
  const byCar = new Map<string, DriveMeta[]>();
  for (const d of drives) {
    const key = d.carVin ?? '';
    byCar.set(key, [...(byCar.get(key) ?? []), d]);
  }
  const rows = [...byCar.entries()]
    .map(([vin, group]) => ({ vin, drift: consumptionDrift(group) }))
    .filter((r): r is { vin: string; drift: DriftResult } => r.drift !== null);
  if (rows.length === 0) return null;
  const label = (vin: string) => cars.find((c) => c.vin === vin)?.label || vin || 'Your car';
  const anyRising = rows.some((r) => r.drift.verdict === 'rising');
  return (
    <section className="card">
      <h3 className="section-title">Consumption trend <small>· last {`5`} drives vs your baseline</small></h3>
      <table className="compare-table" aria-label="consumption trend per car">
        <thead>
          <tr>
            <th scope="col">Car</th><th scope="col">Baseline</th><th scope="col">Recent</th>
            <th scope="col">Drift</th><th scope="col">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ vin, drift }) => (
            <tr key={vin}>
              <td>{label(vin)}</td>
              <td>{drift.baseline.toFixed(1)} L/100km</td>
              <td>{drift.recent.toFixed(1)} L/100km</td>
              <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                {`${drift.driftPct > 0 ? '+' : ''}${Math.round(drift.driftPct)}%`}
              </td>
              <td style={{ color: VERDICT[drift.verdict].color }}>
                <span aria-hidden="true">{VERDICT[drift.verdict].icon}</span> {drift.verdict}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {anyRising && (
        <p className="placeholder">
          Rising consumption is worth a look: check <strong>tire pressure</strong>, the
          <strong> air filter</strong>, and for a <strong>dragging brake</strong> or alignment issue.
          Winter, a changed route, or heavier loads can also explain it — these are estimates,
          <strong> not a diagnosis</strong>; verify with a mechanic.
        </p>
      )}
    </section>
  );
}
