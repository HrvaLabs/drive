import type { DriveMeta } from '../history/types';
import { totals } from '../history/aggregate';
import { allTags } from '../history/tags';

// Cost split by tag ("commute vs road-trip"). A drive carrying several tags
// appears in each of its rows — a per-tag view, not a partition.
export default function TagSpend({ drives }: { drives: DriveMeta[] }) {
  const tags = allTags(drives);
  if (tags.length === 0) return null;
  const untagged = drives.filter((d) => (d.tags ?? []).length === 0);
  const rows = [
    ...tags.map((tag) => ({ tag, t: totals(drives.filter((d) => (d.tags ?? []).includes(tag))) })),
    ...(untagged.length > 0 ? [{ tag: '(untagged)', t: totals(untagged) }] : []),
  ];
  return (
    <section className="card">
      <h3 className="section-title">Spend by tag <small>· a drive with several tags counts in each</small></h3>
      <table className="compare-table" aria-label="spend by tag">
        <thead>
          <tr>
            <th scope="col">Tag</th><th scope="col">Drives</th><th scope="col">km</th>
            <th scope="col">Fuel L</th><th scope="col">Cost €</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tag, t }) => (
            <tr key={tag}>
              <td>{tag}</td><td>{t.count}</td><td>{t.distanceKm}</td><td>{t.fuelL}</td><td>€{t.costEur}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
