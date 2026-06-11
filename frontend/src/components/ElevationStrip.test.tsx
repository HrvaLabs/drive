import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="areachart">{children}</div>,
  Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import ElevationStrip from './ElevationStrip';
import type { Signal } from '../types';

describe('ElevationStrip', () => {
  it('renders an area chart when altitude is present', () => {
    const alt: Signal = { unit: 'm', n: 2, min: 100, max: 110, mean: 105, points: [{ t: 0, v: 100 }, { t: 1, v: 110 }] };
    render(<ElevationStrip altitude={alt} />);
    expect(screen.getByRole('heading', { name: /Elevation/i })).toBeInTheDocument();
    expect(screen.getByTestId('areachart')).toBeInTheDocument();
  });

  it('renders nothing when altitude is absent', () => {
    const { container } = render(<ElevationStrip altitude={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
