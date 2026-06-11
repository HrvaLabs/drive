import type { Bests } from '../types';

interface Props {
  bests: Bests;
}

export default function BestsCard({ bests }: Props) {
  const items: Array<[string, string | null]> = [
    ['Top speed', bests.topSpeedKmh != null ? `${bests.topSpeedKmh} km/h` : null],
    ['Max RPM', bests.maxRpm != null ? `${bests.maxRpm} rpm` : null],
    ['Max power', bests.maxHp != null ? `${bests.maxHp} hp` : null],
    ['Peak boost', bests.peakBoostBar != null ? `${bests.peakBoostBar} bar` : null],
    ['Hardest accel', bests.maxAccelG != null ? `${bests.maxAccelG} g` : null],
  ].filter(([, v]) => v !== null) as Array<[string, string]>;

  if (items.length === 0) {
    return null;
  }
  return (
    <section className="card">
      <h3 className="section-title">Peak readings <small>· highest values this drive</small></h3>
      <div className="bests-grid">
        {items.map(([label, value]) => (
          <div className="best" key={label}>
            <div className="best__label">{label}</div>
            <div className="best__value">{value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
