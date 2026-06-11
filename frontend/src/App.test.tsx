import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  useMapEvents: () => null,
  Polyline: () => <div data-testid="polyline" />,
  CircleMarker: ({ children }: { children?: React.ReactNode }) => <div data-testid="pin">{children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div data-testid="areachart">{children}</div>,
  Line: () => null, Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
  ScatterChart: ({ children }: { children: React.ReactNode }) => <div data-testid="scatter">{children}</div>,
  Scatter: () => null, ReferenceLine: () => null,
}));

import App from './App';
import { clearAll, saveCar, listCars } from './history/db';
import type { DriveAnalysis } from './types';

const analysis: DriveAnalysis = {
  schemaVersion: '1',
  drive: { source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
           vehicle: { label: 'My car', vin: null, engine: null } },
  summary: { distanceKm: 18.4, movingSeconds: 1500, idleSeconds: 300, avgSpeedKmh: 44.2,
             maxSpeedKmh: 146, fuelUsedL: 2.31, fuelCostEur: 3.72, avgConsumptionL100km: 12.6,
             elevationGainM: 80, elevationLossM: 60 },
  route: [{ t: 0, lat: 45, lon: 15, speedKmh: 0 }, { t: 1, lat: 45, lon: 15.001, speedKmh: 36 }],
  series: { speedKmh: [{ t: 0, v: 0 }, { t: 1, v: 36 }] },
  dataQuality: { rowCount: 11, pidsPresent: ['Vehicle speed'], distanceSource: 'gps', warnings: [] },
  events: [{ type: 'idle', t: 0, lat: null, lon: null, value: 0, durationSeconds: 30 }],
  scores: { eco: 78, style: 'eco', rpmBandPct: 54, idlePct: 13, speedSteadiness: 80, harshEvents: 0 },
  health: { warmupSeconds: 120, batteryVerdict: 'healthy', batteryVolts: 14.2, fuelTrimVerdict: 'normal' },
  bests: { maxHp: 79.6, peakBoostBar: 0.71, maxAccelG: 0.27, topSpeedKmh: 146, maxRpm: 3355 },
  signals: { 'Engine RPM': { unit: 'rpm', n: 2, min: 800, max: 3355, mean: 2077, points: [{ t: 0, v: 800 }, { t: 1, v: 3355 }] } },
  tips: [{ id: 'reduce_idle', severity: 'warn', title: 'Cut idling', detail: 'You idled 13% of the drive.', eurImpact: null }],
  economy: { pricePerLEur: 1.61, costPerKm: 0.1, assumedAnnualKm: 15000, projectedMonthlyEur: 126,
             projectedYearlyEur: 1511, idleWasteEur: 0.14, potentialSavingsEur: 0.2, sweetSpotKmh: 90,
             efficiencyCurve: [{ speedKmh: 95, l100km: 5 }] },
};

describe('App dashboard', () => {
  beforeEach(async () => { vi.restoreAllMocks(); await clearAll(); });

  it('uploads a drive and renders summary, map, and chart', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis } as Response);
    render(<App />);

    const input = screen.getByLabelText('drive file') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'drive.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));

    await waitFor(() => expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument());
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getAllByTestId('linechart')[0]).toBeInTheDocument();
    expect(screen.getByText('78')).toBeInTheDocument();           // eco score
    expect(screen.getByText('Peak readings')).toBeInTheDocument();
    expect(screen.getByText('Tips')).toBeInTheDocument();
    expect(screen.getByText(/Cut idling/)).toBeInTheDocument();
    // Friendly by default: the expert panel is hidden
    expect(screen.queryByText('Expert / debug')).toBeNull();
    // Toggling to Expert reveals the signal explorer
    fireEvent.click(screen.getByRole('button', { name: /show advanced graphs/i }));
    expect(screen.getByText('Expert / debug')).toBeInTheDocument();
    expect(screen.getByLabelText('signal')).toBeInTheDocument();
    expect(screen.getAllByText('Economy')[0]).toBeInTheDocument();
    expect(screen.getByText(/€1511 \/ year/)).toBeInTheDocument();
    expect(screen.getByText(/Efficiency by speed/)).toBeInTheDocument();
    // Phase 5: garage car picker + Save-as-PDF export
    expect(screen.getByLabelText('add car file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as pdf/i })).toBeInTheDocument();
  });

  it('saves an analysed drive to history and can reopen it', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis } as Response);
    render(<App />);
    fireEvent.change(screen.getByLabelText('drive file'),
      { target: { files: [new File(['x'], 'd.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));
    await waitFor(() => expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(document.querySelectorAll('.drive-row')).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    await waitFor(() => expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument());
  });

  it('continues past a failing file and reports it in the batch summary', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => analysis } as Response)
      .mockResolvedValueOnce({ ok: false, status: 422 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => analysis } as Response);
    render(<App />);
    fireEvent.change(screen.getByLabelText('drive file'), {
      target: { files: [
        new File(['a'], 'a.csv', { type: 'text/csv' }),
        new File(['b'], 'b.csv', { type: 'text/csv' }),
        new File(['c'], 'c.csv', { type: 'text/csv' }),
      ] },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));

    await waitFor(() => expect(screen.getByText('⚠ 2 analyzed · 1 failed')).toBeInTheDocument());
    expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument();   // last success shown
    expect(screen.getByText('failed · HTTP 422')).toBeInTheDocument(); // row keeps the reason
    expect(screen.queryByText(/All 3 files failed/)).toBeNull();       // no global banner
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(document.querySelectorAll('.drive-row')).toHaveLength(2)); // both successes saved
  });

  it('shows the global error banner only when every file fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    render(<App />);
    fireEvent.change(screen.getByLabelText('drive file'), {
      target: { files: [new File(['a'], 'a.csv', { type: 'text/csv' }),
                        new File(['b'], 'b.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));

    await waitFor(() => expect(screen.getByText('All 2 files failed')).toBeInTheDocument());
    expect(screen.getByText('⚠ 0 analyzed · 2 failed')).toBeInTheDocument();
    expect(screen.getAllByText('failed · HTTP 500')).toHaveLength(2);
  });

  it('Delete all data wipes history and settings', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis } as Response);
    render(<App />);
    fireEvent.change(screen.getByLabelText('drive file'),
      { target: { files: [new File(['x'], 'd.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));
    await waitFor(() => expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Privacy' }));
    fireEvent.click(screen.getByRole('button', { name: /delete all data/i }));
    fireEvent.click(screen.getByRole('button', { name: /close privacy/i }));

    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(screen.getByText(/No saved drives yet/)).toBeInTheDocument());
    expect(localStorage.getItem('hrvadrive.pricePerL')).toBeNull();
  });

  it('remembers the fuel price per car after analyzing', async () => {
    await saveCar({ vin: 'V1', label: 'Diesel', engine: '', createdAt: 1, lastUsedAt: 1 });
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis } as Response);
    render(<App />);
    await waitFor(() => expect((screen.getByLabelText('car') as HTMLSelectElement).value).toBe('V1'));
    fireEvent.change(screen.getByLabelText('fuel price per litre'), { target: { value: '1.81' } });
    fireEvent.change(screen.getByLabelText('drive file'),
      { target: { files: [new File(['x'], 'd.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));
    await waitFor(() => expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument());
    const cars = await listCars();
    expect(cars[0].pricePerL).toBe('1.81');
  });

  it('selecting a car fills its remembered fuel price', async () => {
    await saveCar({ vin: 'V1', label: 'Diesel', engine: '', createdAt: 1, lastUsedAt: 2, pricePerL: '1.50' });
    await saveCar({ vin: 'V2', label: 'Petrol', engine: '', createdAt: 1, lastUsedAt: 1, pricePerL: '1.81' });
    render(<App />);
    const input = () => screen.getByLabelText('fuel price per litre') as HTMLInputElement;
    await waitFor(() => expect(input().value).toBe('1.50')); // latest-used car auto-selected
    fireEvent.change(screen.getByLabelText('car'), { target: { value: 'V2' } });
    await waitFor(() => expect(input().value).toBe('1.81'));
  });

  it('skips a file whose recording date is already in history', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis } as Response);
    render(<App />);
    const file = () => new File(['x'], '2026-06-11 08-00-00.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('drive file'), { target: { files: [file()] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));
    await waitFor(() => expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: /history \(1\)/i })).toBeInTheDocument());
    // re-upload the same recording
    fireEvent.change(screen.getByLabelText('drive file'), { target: { files: [file()] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));
    await waitFor(() => expect(screen.getByText('skipped · already in history')).toBeInTheDocument());
    expect(globalThis.fetch).toHaveBeenCalledTimes(1); // no 2nd API call
    expect(screen.queryByText(/failed/)).toBeNull();   // a skip is not an error
    fireEvent.click(screen.getByRole('button', { name: /history/i }));
    await waitFor(() => expect(document.querySelectorAll('.drive-row')).toHaveLength(1)); // single row
  });

  it('Retry failed re-runs only the failed files', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => analysis } as Response)
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => analysis } as Response); // the retry
    render(<App />);
    fireEvent.change(screen.getByLabelText('drive file'), {
      target: { files: [new File(['a'], 'a.csv', { type: 'text/csv' }),
                        new File(['b'], 'b.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));
    await waitFor(() => expect(screen.getByText('\u26a0 1 analyzed \u00b7 1 failed')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed (1)' }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(3));
    // the retried batch fully succeeded -> list clears
    await waitFor(() => expect(screen.queryByText('b.csv')).toBeNull());
  });

  it('clears the batch list after a fully successful batch', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => analysis } as Response);
    render(<App />);
    fireEvent.change(screen.getByLabelText('drive file'), {
      target: { files: [new File(['a'], 'a.csv', { type: 'text/csv' }),
                        new File(['b'], 'b.csv', { type: 'text/csv' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyze drive/i }));

    await waitFor(() => expect(screen.getAllByText('146 km/h')[0]).toBeInTheDocument());
    expect(screen.queryByText(/analyzed ·/)).toBeNull(); // no lingering summary
    expect(screen.queryByText('a.csv')).toBeNull();      // rows gone
  });
});
