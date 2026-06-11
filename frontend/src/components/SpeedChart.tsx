import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { SeriesPoint } from '../types';
import { elapsedTick, elapsedFull } from '../time';
import ChartTable from './ChartTable';

interface Props {
  points: SeriesPoint[];
}

export default function SpeedChart({ points }: Props) {
  const t0 = points[0]?.t ?? 0;
  const maxV = points.reduce((m, p) => (p.v > m ? p.v : m), 0);
  const avgV = points.length ? Math.round(points.reduce((a, p) => a + p.v, 0) / points.length) : 0;
  const summary = `Speed over time: ${points.length} samples, peak ${Math.round(maxV)} km/h, average ${avgV} km/h`;
  return (
    <section>
      <h3>Speed over time <small>(elapsed · {points.length} points)</small></h3>
      <div style={{ width: '100%', height: 240 }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <LineChart data={points} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(t) => elapsedTick(t, t0)} minTickGap={40} />
            <YAxis width={42} />
            <Tooltip formatter={(v) => [`${v} km/h`, 'Speed']}
                     labelFormatter={(t) => elapsedFull(Number(t), t0)} />
            <Line type="monotone" dataKey="v" name="Speed" stroke="#5aa9ff" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption={summary} columns={['Elapsed', 'Speed (km/h)']}
                  rows={points.map((p) => [elapsedFull(p.t, t0), Math.round(p.v)])} />
    </section>
  );
}
