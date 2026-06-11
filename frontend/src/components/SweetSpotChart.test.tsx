import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null,
  CartesianGrid: () => null, ReferenceLine: () => <div data-testid="refline" />,
}));

import SweetSpotChart from './SweetSpotChart';
import type { EfficiencyPoint } from '../types';

const curve: EfficiencyPoint[] = [{ speedKmh: 35, l100km: 9 }, { speedKmh: 95, l100km: 5 }];

describe('SweetSpotChart', () => {
  it('renders an efficiency curve with a sweet-spot reference line and label', () => {
    render(<SweetSpotChart curve={curve} sweetSpotKmh={90} />);
    expect(screen.getByRole('heading', { name: /sweet spot 90 km\/h/i })).toBeInTheDocument();
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
    expect(screen.getByTestId('refline')).toBeInTheDocument();
  });

  it('renders nothing when the curve is empty', () => {
    const { container } = render(<SweetSpotChart curve={[]} sweetSpotKmh={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
