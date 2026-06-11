import type { Economy } from '../types';

interface Props {
  economy: Economy;
  fromHistory?: boolean; // annual km derived from the user's history, not assumed
}

export default function EconomyCard({ economy, fromHistory = false }: Props) {
  const e = economy;
  const annual = e.assumedAnnualKm.toLocaleString();
  return (
    <section className="card">
      <h3 className="section-title">Economy</h3>
      <div className="eco-grid">
        <div>
          <div className="eco__label">Cost</div>
          <div className="eco__value">{e.costPerKm > 0 ? `€${e.costPerKm.toFixed(2)} / km` : '—'}</div>
          {e.pricePerLEur != null && <div className="eco__sub">at €{e.pricePerLEur}/L</div>}
        </div>
        <div>
          <div className="eco__label">Projected</div>
          <div className="eco__value">{e.projectedYearlyEur != null ? `€${e.projectedYearlyEur} / year` : '—'}</div>
          <div className="eco__sub">
            {e.projectedMonthlyEur != null ? `€${e.projectedMonthlyEur}/mo · ` : ''}{fromHistory ? `${annual} km/yr from your history` : `assumes ${annual} km/yr`}
          </div>
        </div>
        <div>
          <div className="eco__label">Could save</div>
          <div className="eco__value">{e.potentialSavingsEur > 0 ? `€${e.potentialSavingsEur.toFixed(2)}` : '—'}</div>
          <div className="eco__sub">this drive, applying the tips</div>
        </div>
      </div>
    </section>
  );
}
