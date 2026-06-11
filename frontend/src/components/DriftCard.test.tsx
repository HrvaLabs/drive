import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { DriveMeta, Car } from '../history/types';
import DriftCard from './DriftCard';

let seq = 0;
const d = (l100km: number, carVin?: string): DriveMeta => ({
  id: String(++seq), savedAt: seq, driveDate: seq * 86400000, startedAtClock: null, label: 'Drive',
  distanceKm: 20, durationSeconds: 600, fuelUsedL: 1.2, costEur: 2, co2Kg: 2, l100km, eco: 60, carVin,
});
const cars: Car[] = [{ vin: 'V1', label: 'Clio', engine: '', createdAt: 1, lastUsedAt: 1 }];

describe('DriftCard', () => {
  it('renders nothing without enough usable drives', () => {
    const { container } = render(<DriftCard drives={Array.from({ length: 5 }, () => d(6))} cars={cars} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a rising verdict with the maintenance hint', () => {
    const drives = [...Array.from({ length: 12 }, () => d(6, 'V1')), ...Array.from({ length: 5 }, () => d(7, 'V1'))];
    render(<DriftCard drives={drives} cars={cars} />);
    expect(screen.getByText('Consumption trend')).toBeInTheDocument();
    expect(screen.getByText('Clio')).toBeInTheDocument();
    expect(screen.getByText(/rising/)).toBeInTheDocument();
    expect(screen.getByText(/\+17%/)).toBeInTheDocument();
    expect(screen.getByText(/tire pressure/i)).toBeInTheDocument();
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument();
  });

  it('keeps cars separate and stays quiet when stable', () => {
    const drives = [
      ...Array.from({ length: 13 }, () => d(6, 'V1')),            // stable Clio
      ...Array.from({ length: 4 }, () => d(9, 'OTHER')),          // too few to judge
    ];
    render(<DriftCard drives={drives} cars={cars} />);
    expect(screen.getByText(/stable/)).toBeInTheDocument();
    expect(screen.queryByText(/tire pressure/i)).toBeNull();      // no hint when stable
    expect(screen.getAllByRole('row')).toHaveLength(2);           // header + Clio only
  });
});
