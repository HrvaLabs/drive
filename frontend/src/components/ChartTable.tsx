interface Props {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
  cap?: number;
}

// A visually-hidden data table that mirrors a chart, so screen-reader users get
// the numbers a canvas/SVG chart can't convey. Long series are downsampled to a
// representative handful of rows (a 30k-point table helps nobody).
export default function ChartTable({ caption, columns, rows, cap = 40 }: Props) {
  const step = Math.max(1, Math.ceil(rows.length / cap));
  const sampled = rows.filter((_, i) => i % step === 0);
  return (
    <table className="visually-hidden">
      <caption>{caption}</caption>
      <thead>
        <tr>{columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
      </thead>
      <tbody>
        {sampled.map((r, i) => (
          <tr key={i}>{r.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
