import { useState } from 'react';
import type { DriveMeta } from '../history/types';
import { qualifyingTags, typicalComparison } from '../history/typical';
import { deltaColor } from '../history/compareMetrics';
import { fmtDriveDateTime } from '../time';

// "This commute vs your typical commute" — latest tagged drive against the
// median of the previous ones. Auto-tags (towns, round trip) qualify too.
export default function TypicalCompare({ drives }: { drives: DriveMeta[] }) {
  const tags = qualifyingTags(drives);
  const [tag, setTag] = useState('');
  if (tags.length === 0) return null;
  const active = tags.includes(tag) ? tag : tags[0];
  const cmp = typicalComparison(drives, active);
  if (!cmp) return null;
  return (
    <section className="card">
      <h3 className="section-title">
        Latest vs typical <small>· median of {cmp.n} previous “{active}” drives</small>
      </h3>
      <div className="history-controls">
        <label>Tag&nbsp;
          <select aria-label="typical tag" value={active} onChange={(e) => setTag(e.target.value)}>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <span className="muted">
          Latest: {fmtDriveDateTime(cmp.latest.driveDate, cmp.latest.savedAt, cmp.latest.startedAtClock)}
        </span>
      </div>
      <table className="compare-table">
        <thead>
          <tr>
            <th scope="col">Metric</th><th scope="col">Typical</th>
            <th scope="col">Latest</th><th scope="col">Δ (latest−typical)</th>
          </tr>
        </thead>
        <tbody>
          {cmp.rows.map((r) => (
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
    </section>
  );
}
