import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { DriveMeta } from '../history/types';
import PeriodSummary from './PeriodSummary';

const mk = (driveDate: number, over: Partial<DriveMeta> = {}): DriveMeta => ({
  id: String(driveDate), savedAt: driveDate, driveDate, startedAtClock: null, label: 'Drive',
  distanceKm: 10, durationSeconds: 600, fuelUsedL: 1, costEur: 2, co2Kg: 2.31, l100km: 10, eco: 60, ...over,
});

describe('PeriodSummary', () => {
  it('defaults to month and merges same-month drives into one row', () => {
    render(<PeriodSummary drives={[mk(Date.UTC(2026, 5, 7, 12)),
                                   mk(Date.UTC(2026, 5, 9, 12), { costEur: 3, fuelUsedL: 3 })]} />);
    const table = screen.getByRole('table', { name: /spending by period/i });
    const rows = within(table).getAllByRole('row').slice(1); // drop header
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('2')).toBeInTheDocument();   // drives (fuel sums to 4)
    expect(within(rows[0]).getByText('€5')).toBeInTheDocument();  // summed cost
  });

  it('day granularity splits them, latest first', () => {
    render(<PeriodSummary drives={[mk(Date.UTC(2026, 5, 7, 12), { costEur: 2 }),
                                   mk(Date.UTC(2026, 5, 9, 12), { costEur: 7 })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'day' }));
    const table = screen.getByRole('table', { name: /spending by period/i });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('€7')).toBeInTheDocument(); // most recent (9 Jun) on top
  });
});
