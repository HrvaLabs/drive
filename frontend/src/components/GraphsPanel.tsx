import MetricChart from './MetricChart';
import type { Signal } from '../types';

// Named graphs shown in the friendly view, in order. Absent PIDs are skipped.
const NAMED: Array<{ pid: string; title: string; color: string }> = [
  { pid: 'Engine RPM', title: 'Engine RPM', color: '#5aa9ff' },
  { pid: 'Calculated engine load value', title: 'Engine load', color: '#a78bfa' },
  { pid: 'Throttle position', title: 'Throttle', color: '#22d3ee' },
  { pid: 'Calculated boost', title: 'Boost', color: '#fb923c' },
  { pid: 'Engine coolant temperature', title: 'Coolant temp', color: '#f76d6d' },
  { pid: 'Engine fuel rate', title: 'Fuel rate', color: '#36d399' },
];

interface Props {
  signals: Record<string, Signal>;
}

export default function GraphsPanel({ signals }: Props) {
  const present = NAMED.filter((g) => signals[g.pid]);
  if (present.length === 0) {
    return null;
  }
  return (
    <section>
      <h3>Graphs</h3>
      <div className="graphs-grid">
        {present.map((g) => (
          <MetricChart key={g.pid} title={g.title} unit={signals[g.pid].unit}
                       points={signals[g.pid].points} color={g.color} />
        ))}
      </div>
    </section>
  );
}
