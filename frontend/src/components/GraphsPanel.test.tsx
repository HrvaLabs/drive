import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));

import GraphsPanel from './GraphsPanel';
import type { Signal } from '../types';

const sig = (v: number): Signal => ({ unit: 'x', n: 1, min: v, max: v, mean: v, points: [{ t: 0, v }] });

describe('GraphsPanel', () => {
  it('renders a chart for each present named signal, skipping absent ones', () => {
    const signals: Record<string, Signal> = { 'Engine RPM': sig(2000), 'Throttle position': sig(20) };
    render(<GraphsPanel signals={signals} />);
    expect(screen.getByRole('heading', { name: /Engine RPM/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Throttle/ })).toBeInTheDocument();
    expect(screen.queryByText(/boost/i)).toBeNull();
    expect(screen.getAllByTestId('linechart').length).toBe(2);
  });
});
