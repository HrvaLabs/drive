import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Signal } from '../types';
import { elapsedTick, elapsedFull } from '../time';
import ChartTable from './ChartTable';

interface Props {
  altitude: Signal | undefined;
}

export default function ElevationStrip({ altitude }: Props) {
  if (!altitude || altitude.points.length === 0) {
    return null;
  }
  const t0 = altitude.points[0]?.t ?? 0;
  const summary = `Elevation over time: ${altitude.min} to ${altitude.max} m`;
  return (
    <section>
      <h3>Elevation <small>({altitude.min}–{altitude.max} m)</small></h3>
      <div style={{ width: '100%', height: 120 }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <AreaChart data={altitude.points} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="t" tickFormatter={(t) => elapsedTick(t, t0)} minTickGap={40} />
            <YAxis width={38} />
            <Tooltip formatter={(v) => [`${v} m`, 'Altitude']}
                     labelFormatter={(t) => elapsedFull(Number(t), t0)} />
            <Area type="monotone" dataKey="v" name="Altitude" stroke="#36d399"
                  fill="rgba(54, 211, 153, 0.18)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption={summary} columns={['Elapsed', 'Altitude (m)']}
                  rows={altitude.points.map((p) => [elapsedFull(p.t, t0), p.v])} />
    </section>
  );
}
