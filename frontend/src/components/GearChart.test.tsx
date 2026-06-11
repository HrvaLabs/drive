import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Gears } from '../types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ScatterChart: ({ children }: { children: React.ReactNode }) => <div data-testid="scatterchart">{children}</div>,
  Scatter: () => <div data-testid="scatter" />,
  ReferenceLine: () => <div data-testid="refline" />,
  XAxis: () => null, YAxis: () => null, ZAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import GearChart from './GearChart';

const gears = (over: Partial<Gears> = {}): Gears => ({
  ratios: [29.4, 38.1],
  usage: [
    { label: 'tallest used', ratio: 29.4, pct: 60 },
    { label: 'one below', ratio: 38.1, pct: 30 },
  ],
  unassignedPct: 10,
  points: [
    { speedKmh: 90, rpm: 2646, gear: 0 },
    { speedKmh: 50, rpm: 1905, gear: 1 },
    { speedKmh: 40, rpm: 900, gear: null },
  ],
  ...over,
});

describe('GearChart', () => {
  it('renders the scatter, a gear-ratio reference line per gear, and the usage breakdown', () => {
    render(<GearChart gears={gears()} />);
    expect(screen.getByTestId('scatterchart')).toBeInTheDocument();
    expect(screen.getAllByTestId('refline')).toHaveLength(2);
    expect(screen.getAllByTestId('scatter')).toHaveLength(3); // gear 0, gear 1, unassigned
    // appears in both the visible breakdown <li> and the a11y ChartTable <td>
    expect(screen.getAllByText(/tallest used/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/clutch\/shift\/coast/i).length).toBeGreaterThan(0);
  });

  it('is screen-reader accessible (labelled chart + data table)', () => {
    render(<GearChart gears={gears()} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/gear/i);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('omits the clutch/shift/coast line when nothing is unassigned', () => {
    render(<GearChart gears={gears({
      unassignedPct: 0,
      points: [{ speedKmh: 90, rpm: 2646, gear: 0 }, { speedKmh: 50, rpm: 1905, gear: 1 }],
    })} />);
    expect(screen.queryByText(/clutch\/shift\/coast/i)).toBeNull();
  });

  it('shows the "could not separate" note WITHOUT mislabelling everything as clutch/shift', () => {
    // real backend short-trip shape: no ratios, every sample unassigned (100%).
    render(<GearChart gears={gears({ ratios: [], usage: [], unassignedPct: 100, points: [{ speedKmh: 50, rpm: 1500, gear: null }] })} />);
    expect(screen.getByText(/couldn.t be separated/i)).toBeInTheDocument();
    // must NOT claim 100% of the drive was clutch/shift/coast when gears just weren't separable
    expect(screen.queryByText(/clutch\/shift\/coast/i)).toBeNull();
  });

  it('renders nothing when there are no points or gears is undefined', () => {
    const { container: c1 } = render(<GearChart gears={gears({ points: [] })} />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<GearChart gears={undefined} />);
    expect(c2).toBeEmptyDOMElement();
  });
});
