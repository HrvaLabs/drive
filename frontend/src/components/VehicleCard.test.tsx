import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VehicleCard from './VehicleCard';
import type { DriveAnalysis } from '../types';

const drive: DriveAnalysis['drive'] = {
  source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
  vehicle: { label: 'My car', vin: null, engine: null },
};
const dataQuality: DriveAnalysis['dataQuality'] = {
  rowCount: 288759, pidsPresent: ['Vehicle speed', 'Engine RPM'], distanceSource: 'odometer', warnings: [],
};

describe('VehicleCard', () => {
  it('shows the vehicle label and data summary', () => {
    render(<VehicleCard drive={drive} dataQuality={dataQuality} />);
    expect(screen.getByText('My car')).toBeInTheDocument();
    expect(screen.getByText(/2 signals/)).toBeInTheDocument();
    expect(screen.getByText(/odometer/)).toBeInTheDocument();
  });

  it('shows VIN and engine when present', () => {
    const d: DriveAnalysis['drive'] = {
      source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
      vehicle: { label: 'My car', vin: 'TESTVIN0123456789', engine: 'Test Engine 1.0L' },
    };
    const dq: DriveAnalysis['dataQuality'] = {
      rowCount: 10, pidsPresent: ['Vehicle speed'], distanceSource: 'odometer', warnings: [],
    };
    render(<VehicleCard drive={d} dataQuality={dq} />);
    expect(screen.getByText(/Test Engine/)).toBeInTheDocument();
    expect(screen.getByText(/TESTVIN0123456789/)).toBeInTheDocument();
  });

  it('shows the name as title and a decoded identity subtitle', () => {
    const d: DriveAnalysis['drive'] = {
      source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
      vehicle: { label: 'Moja Klio', vin: 'VF1RJA00769589142', engine: '2.0 dCi' },
    };
    render(<VehicleCard drive={d} dataQuality={dataQuality}
      decoded={{ make: 'Renault', year: '2022', country: '🇫🇷 France', fuelType: 'Diesel' }} />);
    expect(screen.getByText('Moja Klio')).toBeInTheDocument();
    expect(screen.getByText(/2022 Renault/)).toBeInTheDocument();
    expect(screen.getByText(/France/)).toBeInTheDocument();
    expect(screen.getByText(/Diesel/)).toBeInTheDocument();
  });
});

it('shows the offline-resolved route when present', () => {
  render(<VehicleCard drive={{ ...drive, fromPlace: 'Zagreb', toPlace: 'Split' }} dataQuality={dataQuality} />);
  expect(screen.getByText('Zagreb → Split')).toBeInTheDocument();
});

it('collapses a same-town route to one name', () => {
  render(<VehicleCard drive={{ ...drive, fromPlace: 'Zagreb', toPlace: 'Zagreb' }} dataQuality={dataQuality} />);
  expect(screen.getByText('Zagreb')).toBeInTheDocument();
  expect(screen.queryByText(/→/)).toBeNull();
});

it('named-place overrides beat the towns and the naming buttons fire', () => {
  const onNameStart = vi.fn();
  render(<VehicleCard drive={{ ...drive, fromPlace: 'Zagreb', toPlace: 'Velika Gorica' }} dataQuality={dataQuality}
                      routeFrom="Home" routeTo="Work" onNameStart={onNameStart} onNameEnd={vi.fn()} />);
  expect(screen.getByText(/Home → Work/)).toBeInTheDocument();
  expect(screen.queryByText(/Zagreb/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'name start' }));
  expect(onNameStart).toHaveBeenCalled();
});
