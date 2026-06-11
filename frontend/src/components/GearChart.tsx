import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import type { Gears } from '../types';
import ChartTable from './ChartTable';

const GEAR_COLORS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9']; // Okabe–Ito
const UNASSIGNED = '#9aa0a6';

interface Props {
  gears?: Gears;
}

export default function GearChart({ gears }: Props) {
  if (!gears || gears.points.length === 0) return null;
  const { ratios, usage, unassignedPct, points } = gears;
  const xMax = Math.max(...points.map((p) => p.speedKmh), 1);
  const byGear = new Map<string, typeof points>();
  for (const p of points) {
    const k = p.gear == null ? 'u' : String(p.gear);
    const bucket = byGear.get(k);
    if (bucket) bucket.push(p);
    else byGear.set(k, [p]);
  }
  const summary = ratios.length > 0
    ? `RPM vs speed scatter: ${ratios.length} gears detected this drive (relative, not absolute), ${points.length} points`
    : `RPM vs speed scatter: gears could not be separated for this drive, ${points.length} points`;
  return (
    <section className="card">
      <h3 className="section-title">Gears <small>· this drive only · relative, not absolute gear numbers</small></h3>
      <div style={{ width: '100%', height: 260 }} role="img" aria-label={summary}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" dataKey="speedKmh" name="Speed" unit=" km/h" />
            <YAxis type="number" dataKey="rpm" name="RPM" width={48} />
            <ZAxis range={[18, 18]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            {ratios.map((r, i) => (
              <ReferenceLine key={`r${i}`} ifOverflow="hidden"
                stroke={GEAR_COLORS[i % GEAR_COLORS.length]} strokeDasharray="4 4"
                segment={[{ x: 0, y: 0 }, { x: xMax, y: r * xMax }]} />
            ))}
            {[...byGear.entries()].map(([k, pts]) => (
              <Scatter key={k} data={pts}
                name={k === 'u' ? 'clutch/shift/coast' : (usage[Number(k)]?.label ?? `gear ${k}`)}
                fill={k === 'u' ? UNASSIGNED : GEAR_COLORS[Number(k) % GEAR_COLORS.length]}
                isAnimationActive={false} />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <ul className="gear-usage" aria-hidden="true">
        {usage.map((u) => (
          <li key={u.label}>{u.label}: {u.pct}% <small>(ratio {u.ratio})</small></li>
        ))}
        {ratios.length > 0 && unassignedPct > 0 && <li>clutch/shift/coast: {unassignedPct}%</li>}
        {ratios.length === 0 && <li>Gears couldn't be separated for this drive.</li>}
      </ul>
      <ChartTable caption={summary} columns={['Gear', 'Ratio (rpm/km·h⁻¹)', '% of moving time']}
        rows={[
          ...usage.map((u) => [u.label, u.ratio, u.pct]),
          ...(ratios.length > 0 && unassignedPct > 0 ? [['clutch/shift/coast', '—', unassignedPct]] : []),
        ]} />
    </section>
  );
}
