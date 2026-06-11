import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { EfficiencyPoint } from '../types';
import ChartTable from './ChartTable';

interface Props {
  curve: EfficiencyPoint[];
  sweetSpotKmh: number | null;
}

export default function SweetSpotChart({ curve, sweetSpotKmh }: Props) {
  if (curve.length === 0) {
    return null;
  }
  // Draw a real curve: sort by speed so the line reads left-to-right.
  const data = [...curve].sort((a, b) => a.speedKmh - b.speedKmh);
  const summary = sweetSpotKmh != null
    ? `Fuel consumption by speed; most efficient near ${Math.round(sweetSpotKmh)} km/h`
    : 'Fuel consumption by speed';
  return (
    <section>
      <h3>Efficiency by speed
        {sweetSpotKmh != null && (
          <small style={{ color: '#36d399' }}> · sweet spot {Math.round(sweetSpotKmh)} km/h</small>
        )}
      </h3>
      <div style={{ width: '100%', height: 220 }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="speedKmh" tickFormatter={(v) => `${v}`} minTickGap={28}
                   label={{ value: 'km/h', position: 'insideBottom', offset: -10, fill: 'var(--faint)', fontSize: 11 }} />
            <YAxis width={54} tickFormatter={(v) => `${v}`}
                   label={{ value: 'L/100km', angle: -90, position: 'insideLeft',
                            fill: 'var(--faint)', fontSize: 11, style: { textAnchor: 'middle' } }} />
            <Tooltip formatter={(v) => [`${v} L/100km`, 'Consumption']}
                     labelFormatter={(s) => `${s} km/h`} />
            {sweetSpotKmh != null && <ReferenceLine x={sweetSpotKmh} stroke="#36d399" strokeDasharray="4 4" />}
            <Line type="monotone" dataKey="l100km" name="Consumption" stroke="#5aa9ff"
                  dot={{ r: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartTable caption={summary} columns={['Speed (km/h)', 'L/100km']}
                  rows={data.map((p) => [p.speedKmh, p.l100km])} />
    </section>
  );
}
