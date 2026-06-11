import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => <div data-testid="line" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  CartesianGrid: () => null,
}));

import SpeedChart from './SpeedChart';

describe('SpeedChart', () => {
  it('renders a line chart and reports the point count', () => {
    const points = [{ t: 0, v: 0 }, { t: 1, v: 36 }, { t: 2, v: 72 }];
    render(<SpeedChart points={points} />);
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
    expect(screen.getByText(/3 points/i)).toBeInTheDocument();
  });

  it('is screen-reader accessible: labelled chart + data-table fallback', () => {
    render(<SpeedChart points={[{ t: 0, v: 0 }, { t: 1, v: 80 }]} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/speed/i);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
