import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SeriesPoint } from '../types';
import { elapsedTick, elapsedFull } from '../time';
import ChartTable from './ChartTable';

interface Props {
  title: string;
  unit: string;
  points: SeriesPoint[];
  color?: string;
}

export default function MetricChart({ title, unit, points, color = '#5aa9ff' }: Props) {
  const t0 = points[0]?.t ?? 0;
  // Sparse channels (e.g. engine load logged a handful of times) would draw an
  // invisible line — a single point with no dot renders nothing. Show dots when
  // the series is short so even one sample is visible.
  const showDots = points.length <= 60;
  // Some PIDs glitch — e.g. "Average fuel consumption" spikes to thousands of
  // L/100km at a standstill (fuel ÷ ~0 distance). When the max is a wild outlier,
  // clip the y-axis to the ~98th percentile so one bad sample doesn't flatten the
  // whole chart.
  const sorted = points.map((p) => p.v).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const p98 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.98))] : 0;
  const clipped = sorted.length > 0 && p98 > 0 && sorted[sorted.length - 1] > p98 * 3;
  const lo = sorted.length ? sorted[0] : 0;
  const hi = sorted.length ? sorted[sorted.length - 1] : 0;
  const summary = `${title}: ${points.length} samples, ${lo} to ${hi}${unit ? ' ' + unit : ''}`;
  return (
    <section>
      <h4 style={{ margin: '0 0 4px' }}>{title} <small style={{ color: 'var(--faint)' }}>({unit || '—'}{clipped ? ' · spikes clipped' : ''})</small></h4>
      <div style={{ width: '100%', height: 160 }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(t) => elapsedTick(t, t0)} minTickGap={40} />
            <YAxis width={44} domain={clipped ? ['auto', Math.ceil(p98 * 1.15)] : ['auto', 'auto']} allowDataOverflow={clipped} />
            <Tooltip formatter={(v) => [`${v}${unit ? ' ' + unit : ''}`, title]}
                     labelFormatter={(t) => elapsedFull(Number(t), t0)} />
            <Line type="monotone" dataKey="v" name={title} stroke={color}
                  dot={showDots ? { r: 2.5 } : false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption={summary} columns={['Elapsed', `${title}${unit ? ` (${unit})` : ''}`]}
                  rows={points.map((p) => [elapsedFull(p.t, t0), p.v])} />
    </section>
  );
}
