import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => <div data-testid="line" />, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, CartesianGrid: () => null,
}));

import MetricChart from './MetricChart';

describe('MetricChart', () => {
  it('renders a titled line chart', () => {
    render(<MetricChart title="Engine RPM" unit="rpm" points={[{ t: 0, v: 1000 }, { t: 1, v: 3000 }]} />);
    expect(screen.getByRole('heading', { name: /Engine RPM/ })).toBeInTheDocument();
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
  });
});
