import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { DriveMeta } from '../history/types';
import TypicalCompare from './TypicalCompare';

let seq = 0;
const d = (tags: string[], l100km = 6): DriveMeta => ({
  id: String(++seq), savedAt: seq, driveDate: seq * 86400000, startedAtClock: null, label: 'Drive',
  distanceKm: 20, durationSeconds: 600, fuelUsedL: 1.2, costEur: 4, co2Kg: 2, l100km, eco: 60, tags,
});

describe('TypicalCompare', () => {
  it('renders nothing when no tag has enough drives', () => {
    const { container } = render(<TypicalCompare drives={[d(['commute']), d(['commute'])]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('compares the latest drive against the tag median', () => {
    const drives = [d(['commute'], 5), d(['commute'], 6), d(['commute'], 7), d(['commute'], 9)];
    render(<TypicalCompare drives={drives} />);
    expect(screen.getByText('Latest vs typical')).toBeInTheDocument();
    expect(screen.getByText(/median of 3 previous/)).toBeInTheDocument();
    expect(screen.getByText('6.0')).toBeInTheDocument();   // typical L/100
    expect(screen.getByText('9.0')).toBeInTheDocument();   // latest L/100
    expect(screen.getByText(/▲ \+3\.0/)).toBeInTheDocument();
  });

  it('the picker lists only qualifying tags', () => {
    const drives = [
      d(['commute']), d(['commute']), d(['commute']), d(['commute']),
      d(['rare']),
    ];
    render(<TypicalCompare drives={drives} />);
    fireEvent.click(screen.getByLabelText('typical tag'));
    expect(screen.getByRole('option', { name: 'commute' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'rare' })).toBeNull();
  });
});
