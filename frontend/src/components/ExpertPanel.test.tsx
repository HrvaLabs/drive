import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import ExpertPanel from './ExpertPanel';
import type { Signal, DriveAnalysis } from '../types';

const sig = (u: string, mn: number, mx: number): Signal => ({ unit: u, n: 3, min: mn, max: mx, mean: (mn + mx) / 2, points: [{ t: 0, v: mn }, { t: 1, v: mx }] });
const signals: Record<string, Signal> = { 'Engine RPM': sig('rpm', 800, 3355), 'Vehicle speed': sig('km/h', 0, 146) };
const dataQuality: DriveAnalysis['dataQuality'] = {
  rowCount: 100, pidsPresent: ['Engine RPM', 'Vehicle speed'], distanceSource: 'odometer',
  warnings: ['distance is from GPS only (no odometer); it may be over-reported'],
};

describe('ExpertPanel', () => {
  it('lists signal coverage, shows warnings, and explores a chosen PID', () => {
    render(<ExpertPanel signals={signals} dataQuality={dataQuality} />);
    // the signal picker offers both PIDs ("Engine RPM" appears in both the <option>
    // and the coverage <td>, so target the option role specifically)
    expect(screen.getByRole('option', { name: 'Engine RPM' })).toBeInTheDocument();
    expect(screen.getByText(/over-reported/)).toBeInTheDocument();      // warning surfaced
    // selecting a PID shows its chart
    fireEvent.change(screen.getByLabelText('signal'), { target: { value: 'Vehicle speed' } });
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
    expect(screen.getByText(/max 146/)).toBeInTheDocument();
  });
});
