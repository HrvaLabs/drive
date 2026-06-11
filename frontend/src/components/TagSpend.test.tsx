import { render, screen, within } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { DriveMeta } from '../history/types';
import TagSpend from './TagSpend';

const d = (id: string, tags: string[] | undefined, costEur: number): DriveMeta => ({
  id, savedAt: 1, startedAtClock: null, label: id, distanceKm: 10, durationSeconds: 60,
  fuelUsedL: 1, costEur, co2Kg: 2, l100km: 6, eco: 60, tags,
});

describe('TagSpend', () => {
  it('renders one row per tag plus an untagged row', () => {
    render(<TagSpend drives={[d('a', ['commute'], 2), d('b', ['commute', 'work'], 3), d('c', undefined, 4)]} />);
    const table = screen.getByRole('table', { name: /spend by tag/i });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3); // commute, work, (untagged)
    expect(within(rows[0]).getByText('commute')).toBeInTheDocument();
    expect(within(rows[0]).getByText('€5')).toBeInTheDocument(); // 2 + 3
    expect(within(rows[1]).getByText('work')).toBeInTheDocument();
    expect(within(rows[1]).getByText('€3')).toBeInTheDocument();
    expect(within(rows[2]).getByText('(untagged)')).toBeInTheDocument();
    expect(within(rows[2]).getByText('€4')).toBeInTheDocument();
  });

  it('renders nothing when no drive has tags', () => {
    const { container } = render(<TagSpend drives={[d('a', undefined, 2)]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
