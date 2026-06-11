import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Circle: () => null,
  useMapEvents: () => null,
  Polyline: (props: { positions: unknown[] }) => <div data-testid="polyline" data-points={props.positions.length} />,
  CircleMarker: ({ children }: { children?: React.ReactNode }) => <div data-testid="pin">{children}</div>,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import RouteMap from './RouteMap';
import type { RoutePoint, DriveEvent } from '../types';

const route: RoutePoint[] = [
  { t: 0, lat: 45.0, lon: 15.0, speedKmh: 0 },
  { t: 1, lat: 45.0, lon: 15.001, speedKmh: 60 },
  { t: 2, lat: 45.0, lon: 15.002, speedKmh: 120 },
];
const events: DriveEvent[] = [{ type: 'hard_brake', t: 1, lat: 45.0, lon: 15.001, value: -0.4, durationSeconds: 0 }];

describe('RouteMap', () => {
  it('renders speed-colored segments and an event pin', () => {
    render(<RouteMap route={route} events={events} />);
    expect(screen.getByTestId('map')).toBeInTheDocument();
    expect(screen.getAllByTestId('polyline').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByTestId('pin').length).toBe(1);
  });

  it('shows a placeholder when there is no GPS', () => {
    render(<RouteMap route={[]} events={[]} />);
    expect(screen.getByText(/no gps/i)).toBeInTheDocument();
  });

  it('labels the map region and renders the speed legend bands', () => {
    render(<RouteMap route={route} events={events} />);
    expect(screen.getByLabelText(/route map/i)).toBeInTheDocument();
    expect(screen.getByText('110+ km/h')).toBeInTheDocument();
  });
});

it('replay: scrubbing moves the HUD readout (speed + rpm)', () => {
  render(<RouteMap route={route} events={[]} rpm={[{ t: 0, v: 800 }, { t: 2, v: 3000 }]} />);
  expect(screen.getByText(/replay the drive/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('replay position'), { target: { value: '2' } });
  expect(screen.getByRole('status')).toHaveTextContent('120 km/h');
  expect(screen.getByRole('status')).toHaveTextContent('3000 rpm');
});

it('replay: play runs the clock and auto-stops at the end of the drive', () => {
  vi.useFakeTimers();
  render(<RouteMap route={route} events={[]} />);
  fireEvent.click(screen.getByRole('button', { name: /replay/i }));
  // the 2 s fixture drive finishes within one 30x tick
  act(() => { vi.advanceTimersByTime(300); });
  expect(screen.getByRole('status')).toHaveTextContent('120 km/h');           // reached the end
  expect(screen.getByRole('button', { name: /replay/i })).toBeInTheDocument(); // auto-stopped
  vi.useRealTimers();
});
