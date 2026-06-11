import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { DriveMeta } from '../history/types';
import PeriodCompare from './PeriodCompare';

const mk = (driveDate: number, over: Partial<DriveMeta> = {}): DriveMeta => ({
  id: String(driveDate), savedAt: driveDate, driveDate, startedAtClock: null, label: 'Drive',
  distanceKm: 10, durationSeconds: 600, fuelUsedL: 1, costEur: 2, co2Kg: 2.31, l100km: 10, eco: 60, ...over,
});

describe('PeriodCompare', () => {
  it('needs at least two periods', () => {
    render(<PeriodCompare drives={[mk(Date.UTC(2026, 5, 7, 12))]} />);
    expect(screen.getByText(/at least two different/i)).toBeInTheDocument();
  });

  it('compares the two most recent periods by default (day granularity)', () => {
    render(<PeriodCompare drives={[
      mk(Date.UTC(2026, 5, 7, 12), { costEur: 2 }),
      mk(Date.UTC(2026, 5, 9, 12), { costEur: 5 }),
    ]} />);
    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    expect(screen.getByLabelText('period A')).toBeInTheDocument();
    expect(screen.getByLabelText('period B')).toBeInTheDocument();
    // cost delta B−A = +3, rendered in the delta column
    expect(screen.getByText(/▲ \+3/)).toBeInTheDocument();
  });
});
