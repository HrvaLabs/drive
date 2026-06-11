import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="places-map">{children}</div>,
  TileLayer: () => null,
  Circle: ({ children }: { children?: React.ReactNode }) => <div data-testid="place-circle">{children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import GarageView from './GarageView';
import type { Car, StoredDrive } from '../history/types';
import type { DriveAnalysis } from '../types';

const a = { summary: { idleSeconds: 0 }, scores: { harshEvents: 0 }, bests: {} } as unknown as DriveAnalysis;
const sd = (vin: string, km: number): StoredDrive => ({
  id: km + '', savedAt: 1, driveDate: 1, startedAtClock: null, label: 'x', carVin: vin,
  distanceKm: km, durationSeconds: 600, fuelUsedL: 1, costEur: 1, co2Kg: 1, l100km: 1, eco: 70, analysis: a,
});
const car: Car = { vin: 'V1', label: 'Moja Klio', engine: '2.0 dCi', createdAt: 1, lastUsedAt: 1, make: 'Renault', year: '2022', country: '🇫🇷 France' };
const props = { onRenameCar: vi.fn(), onRemoveCar: vi.fn(), onDecodeCar: vi.fn(), decodingVin: '' };

describe('GarageView', () => {
  it('renders a car profile with identity and stats', () => {
    render(<GarageView cars={[car]} drives={[sd('V1', 30), sd('V1', 12)]} {...props} />);
    expect(screen.getByText('Moja Klio')).toBeInTheDocument();
    expect(screen.getByText(/2022 Renault/)).toBeInTheDocument();
    expect(screen.getByText(/France/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();        // drives count
    expect(screen.getByText(/42/)).toBeInTheDocument();        // total km 30+12
  });

  it('shows an empty state when there are no cars', () => {
    render(<GarageView cars={[]} drives={[]} {...props} />);
    expect(screen.getByText(/add a car/i)).toBeInTheDocument();
  });
});

it('lists saved places with rename, radius and delete', () => {
  const onDeletePlace = vi.fn();
  const onRenamePlace = vi.fn();
  const onResizePlace = vi.fn();
  render(<GarageView cars={[]} drives={[]} onRenameCar={vi.fn()} onRemoveCar={vi.fn()}
                     onDecodeCar={vi.fn()} decodingVin=""
                     places={[{ id: 'p1', name: 'Home', lat: 45.8, lon: 15.98, radiusKm: 0.3 }]}
                     onDeletePlace={onDeletePlace} onRenamePlace={onRenamePlace} onResizePlace={onResizePlace} />);
  expect(screen.getByText('Saved places')).toBeInTheDocument();
  expect(screen.getAllByText('Home').length).toBeGreaterThan(0); // row + map label
  expect(screen.getByText(/±300 m circle/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  expect(onRenamePlace).toHaveBeenCalledWith('p1');
  fireEvent.click(screen.getByRole('button', { name: 'Radius' }));
  expect(onResizePlace).toHaveBeenCalledWith('p1');
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(onDeletePlace).toHaveBeenCalledWith('p1');
  // the overview map draws each place's circle so a radius can be eyeballed
  expect(screen.getByTestId('places-map')).toBeInTheDocument();
  expect(screen.getAllByTestId('place-circle')).toHaveLength(1);
});
