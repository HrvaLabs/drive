import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import EconomyCard from './EconomyCard';
import type { Economy } from '../types';

const economy: Economy = {
  pricePerLEur: 1.61, costPerKm: 0.1, assumedAnnualKm: 15000,
  projectedMonthlyEur: 126, projectedYearlyEur: 1511, idleWasteEur: 0.14,
  potentialSavingsEur: 0.2, sweetSpotKmh: 90, efficiencyCurve: [],
};

describe('EconomyCard', () => {
  it('shows cost per km, the projection with its assumption, and potential savings', () => {
    render(<EconomyCard economy={economy} />);
    expect(screen.getByText(/€0\.10\s*\/\s*km/)).toBeInTheDocument();
    expect(screen.getByText(/€1511\s*\/\s*year/)).toBeInTheDocument();
    expect(screen.getByText(/15,000 km\/yr/)).toBeInTheDocument();
    expect(screen.getByText(/€0\.20/)).toBeInTheDocument();
  });
});
