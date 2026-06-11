import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DriveMeta, StoredDrive } from '../history/types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="barchart">{children}</div>,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => null, YAxis: () => null, Tooltip: () => null, Legend: () => null, CartesianGrid: () => null,
}));

const getDrive = vi.fn();
vi.mock('../history/db', () => ({ getDrive: (id: string) => getDrive(id) }));

import DriveCompare from './DriveCompare';

const meta = (id: string): DriveMeta => ({
  id, savedAt: 1, startedAtClock: null, label: 'My car', distanceKm: 30,
  durationSeconds: 600, fuelUsedL: 2, costEur: 6, co2Kg: 5, l100km: 6, eco: 60,
});
const stored = (id: string, over: Partial<StoredDrive['analysis']['summary']>, eco = 60): StoredDrive => ({
  ...meta(id),
  analysis: {
    summary: { avgConsumptionL100km: 6, co2PerKmG: 150, distanceKm: 30, avgSpeedKmh: 50, ...over },
    economy: { costPerKm: 0.2 },
    scores: { eco, idlePct: 5 },
    signals: { 'Vehicle speed': { points: [{ t: 0, v: 20 }, { t: 1, v: 60 }] }, 'Engine RPM': { points: [{ t: 0, v: 1400 }, { t: 1, v: 2200 }] } },
  } as unknown as StoredDrive['analysis'],
});

describe('DriveCompare', () => {
  beforeEach(() => getDrive.mockReset());

  it('prompts to save more when fewer than two drives exist', () => {
    render(<DriveCompare drives={[meta('a')]} />);
    expect(screen.getByText(/at least two drives/i)).toBeInTheDocument();
  });

  it('loads A and B and shows the delta table + two distribution charts', async () => {
    getDrive.mockImplementation((id: string) =>
      Promise.resolve(id === 'a' ? stored('a', { avgConsumptionL100km: 6 }, 60) : stored('b', { avgConsumptionL100km: 5.4 }, 67)));
    render(<DriveCompare drives={[meta('a'), meta('b')]} />);
    expect(await screen.findByText('L/100km')).toBeInTheDocument();   // delta table rendered
    expect(screen.getAllByTestId('barchart')).toHaveLength(2);         // speed + rpm distributions
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2); // a11y-labelled charts
  });

  it('asks for two different drives when A === B', async () => {
    getDrive.mockResolvedValue(stored('a', {}, 60));
    render(<DriveCompare drives={[meta('a'), meta('a')]} />);
    expect(await screen.findByText(/two different drives/i)).toBeInTheDocument();
  });

  it('does not fabricate bars for a drive missing the RPM signal (shows a note, "—" in the table)', async () => {
    const noRpm = (id: string): StoredDrive => {
      const s = stored(id, {}, 60);
      s.analysis.signals = { 'Vehicle speed': { points: [{ t: 0, v: 20 }, { t: 1, v: 60 }] } } as unknown as StoredDrive['analysis']['signals'];
      return s;
    };
    getDrive.mockImplementation((id: string) => Promise.resolve(id === 'a' ? stored('a', {}, 60) : noRpm('b')));
    render(<DriveCompare drives={[meta('a'), meta('b')]} />);
    expect(await screen.findAllByText(/not logged for drive B/i)).toHaveLength(2);
    // RPM chart renders only drive A's single bar (B omitted), not a fabricated zero series
    expect(screen.getAllByTestId('bar').length).toBe(3); // speed: A+B (2) + rpm: A only (1)
  });

  it('points A/B at the two most recent once drives load after an empty mount', async () => {
    getDrive.mockImplementation((id: string) =>
      Promise.resolve(id === 'a' ? stored('a', { avgConsumptionL100km: 6 }, 60) : stored('b', { avgConsumptionL100km: 5 }, 70)));
    const { rerender } = render(<DriveCompare drives={[]} />);
    expect(screen.getByText(/at least two drives/i)).toBeInTheDocument();
    rerender(<DriveCompare drives={[meta('a'), meta('b')]} />);
    expect(await screen.findByText('L/100km')).toBeInTheDocument(); // selection auto-populated -> table renders
  });
});
