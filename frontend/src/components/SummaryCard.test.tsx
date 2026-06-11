import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import SummaryCard from './SummaryCard';
import type { DriveSummary } from '../types';

const summary: DriveSummary = {
  distanceKm: 18.4, movingSeconds: 1500, idleSeconds: 300,
  avgSpeedKmh: 44.2, maxSpeedKmh: 146, fuelUsedL: 2.31, fuelCostEur: 3.72,
  avgConsumptionL100km: 12.6, elevationGainM: 80, elevationLossM: 60,
};

describe('SummaryCard', () => {
  it('shows the headline KPIs in human units', () => {
    render(<SummaryCard summary={summary} durationSeconds={1800} />);
    expect(screen.getByText('18.4 km')).toBeInTheDocument();
    expect(screen.getByText('146 km/h')).toBeInTheDocument();
    expect(screen.getByText('2.31 L')).toBeInTheDocument();
    expect(screen.getByText('€3.72')).toBeInTheDocument();
    expect(screen.getByText('12.6 L/100km')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument(); // 1800s -> 30m
  });
});
