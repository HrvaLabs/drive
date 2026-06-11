import type { DriveSummary } from '../types';

function fmtDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

interface Props {
  summary: DriveSummary;
  durationSeconds: number;
}

export default function SummaryCard({ summary, durationSeconds }: Props) {
  // [label, value, sub?, help (hover tooltip)]
  const items: Array<[string, string, string | undefined, string]> = [
    ['Distance', `${summary.distanceKm} km`, undefined, "Trip distance — from the car's odometer, not GPS (GPS over-reports)"],
    ['Duration', fmtDuration(durationSeconds), undefined, 'Total time from the first to the last recorded sample'],
    ['Max speed', `${summary.maxSpeedKmh} km/h`, undefined, 'Highest speed recorded on this drive'],
    ['Avg speed', `${summary.avgSpeedKmh} km/h`, undefined, 'Time-weighted average speed (matches the speed chart)'],
    ['Fuel used', `${summary.fuelUsedL} L`, undefined, "Fuel burned, from the car's own fuel data"],
    ['Cost', `€${summary.fuelCostEur}`, undefined, 'Fuel cost at your price per litre'],
    ['Economy', `${summary.avgConsumptionL100km} L/100km`, undefined, 'Average consumption — lower is better'],
    ['CO₂', `${summary.co2Kg ?? 0} kg`, summary.co2PerKmG ? `${summary.co2PerKmG} g/km` : undefined,
      `Tailpipe CO₂ from the fuel burned (${summary.fuelType === 'diesel' ? '≈2.64 kg per litre of diesel' : '≈2.31 kg per litre of petrol'})`],
    ['Elevation +/-', `${summary.elevationGainM}/${summary.elevationLossM} m`, undefined, 'Total metres climbed / descended'],
    ['Climb energy', `${summary.climbEnergyKwh ?? 0} kWh`,
      summary.elevationGainM ? `lift ~1.3 t · ${summary.elevationGainM} m` : undefined,
      "Energy needed just to lift the car's weight over the drive's net climb"],
  ];
  const context = [
    summary.tripType && summary.tripType !== 'unknown' ? summary.tripType : '',
    summary.stopGoPct ? `${summary.stopGoPct}% stop-go` : '',
  ].filter(Boolean).join(' · ');
  return (
    <section className="card">
      <h3 className="section-title">Drive summary{context ? <small>· {context}</small> : null}</h3>
      <div className="kpi-grid">
        {items.map(([label, value, sub, help]) => (
          <div className="kpi" key={label} title={help}>
            <div className="kpi__label">{label}</div>
            <div className="kpi__value">{value}</div>
            {sub ? <div className="kpi__sub">{sub}</div> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
