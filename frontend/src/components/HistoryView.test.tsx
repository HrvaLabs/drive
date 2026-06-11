import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DriveMeta } from '../history/types';
import type { Car } from '../history/types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
  ReferenceLine: () => null,
}));
// getDrive must return a Promise — the rendered DriveCompare calls getDrive(id).then(...)
vi.mock('../history/db', () => ({ getDrive: vi.fn(() => Promise.resolve(undefined)), updateDriveMeta: vi.fn() }));

import HistoryView from './HistoryView';

const d = (id: string, tags: string[]): DriveMeta => ({
  id, savedAt: 1, driveDate: 1, startedAtClock: null, label: id, distanceKm: 10, durationSeconds: 60,
  fuelUsedL: 1, costEur: 2, co2Kg: 2, l100km: 6, eco: 60, tags,
});

describe('HistoryView tag filter', () => {
  it('a tag chip narrows the Drives list; All restores', () => {
    const drives = [d('alpha', ['commute']), d('beta', ['trip'])];
    render(<HistoryView drives={drives} cars={[]} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
    const list = () => document.querySelector('.drive-list') as HTMLElement;
    expect(within(list()).getByText(/alpha/)).toBeInTheDocument();
    expect(within(list()).getByText(/beta/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'commute' }));
    expect(within(list()).getByText(/alpha/)).toBeInTheDocument();
    expect(within(list()).queryByText(/beta/)).toBeNull();
    expect(screen.getByText(/1 drives?, stored/i)).toBeInTheDocument(); // KPIs/heading narrow too
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    expect(within(list()).getByText(/beta/)).toBeInTheDocument();
  });

  it('clicking the same tag again deselects it (toggle off)', () => {
    render(<HistoryView drives={[d('alpha', ['commute']), d('beta', ['trip'])]}
                        cars={[]} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
    const list = () => document.querySelector('.drive-list') as HTMLElement;
    const commute = () => screen.getByRole('button', { name: 'commute' });
    fireEvent.click(commute());
    expect(within(list()).queryByText(/beta/)).toBeNull();
    fireEvent.click(commute()); // toggle off — chip stays clickable
    expect(within(list()).getByText(/beta/)).toBeInTheDocument();
  });
});

const carList: Car[] = [
  { vin: 'V1', label: 'My Car', engine: '', createdAt: 1, lastUsedAt: 1 },
  { vin: 'V2', label: "Friend's", engine: '', createdAt: 1, lastUsedAt: 1 },
];

it('a car chip narrows the Drives list to that car', () => {
  const drives = [
    { ...d('alpha', []), carVin: 'V1' },
    { ...d('beta', []), carVin: 'V2' },
  ];
  render(<HistoryView drives={drives} cars={carList} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
  const list = () => document.querySelector('.drive-list') as HTMLElement;
  expect(within(list()).getByText(/beta/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'My Car' }));
  expect(within(list()).getByText(/alpha/)).toBeInTheDocument();
  expect(within(list()).queryByText(/beta/)).toBeNull();
});

it('the trends summary includes the average of the plotted buckets, ignoring zero buckets', () => {
  // costEur day buckets [2, 2, 0] — the 0 bucket is missing data, not free driving → avg 2
  const drives = [
    { ...d('alpha', []), driveDate: new Date(2026, 5, 1).getTime() },
    { ...d('beta', []), driveDate: new Date(2026, 5, 2).getTime() },
    { ...d('gamma', []), driveDate: new Date(2026, 5, 3).getTime(), costEur: 0 },
  ];
  render(<HistoryView drives={drives} cars={[]} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
  expect(screen.getAllByText(/avg 2/)[0]).toBeInTheDocument(); // 2, not (2+2+0)/3
});

it('multi-select delete confirms, then sends only the visible checked ids', () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const onDeleteMany = vi.fn();
  const drives = [d('alpha', ['commute']), d('beta', ['trip'])];
  render(<HistoryView drives={drives} cars={[]} onOpen={vi.fn()} onDelete={vi.fn()}
                      onChanged={vi.fn()} onDeleteMany={onDeleteMany} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'select alpha' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'select beta' }));
  expect(screen.getByRole('button', { name: 'Delete selected (2)' })).toBeInTheDocument();
  // narrowing to "commute" hides beta — it must not be deleted
  fireEvent.click(screen.getByRole('button', { name: 'commute' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete selected (1)' }));
  expect(confirmSpy).toHaveBeenCalled();
  expect(onDeleteMany).toHaveBeenCalledWith(['alpha']);
  confirmSpy.mockRestore();
});

it('no delete-selected button without a selection', () => {
  render(<HistoryView drives={[d('alpha', [])]} cars={[]} onOpen={vi.fn()} onDelete={vi.fn()}
                      onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
  expect(screen.queryByRole('button', { name: /delete selected/i })).toBeNull();
});

it('the search box narrows the Drives list across label, notes and tags', () => {
  const drives = [
    { ...d('alpha', ['commute']), notes: 'rainy day' },
    { ...d('beta', ['trip']) },
  ];
  render(<HistoryView drives={drives} cars={[]} onOpen={vi.fn()} onDelete={vi.fn()}
                      onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
  const list = () => document.querySelector('.drive-list') as HTMLElement;
  fireEvent.change(screen.getByLabelText('search drives'), { target: { value: 'rainy' } });
  expect(within(list()).getByText(/alpha/)).toBeInTheDocument();
  expect(within(list()).queryByText(/beta/)).toBeNull();
  fireEvent.change(screen.getByLabelText('search drives'), { target: { value: '' } });
  expect(within(list()).getByText(/beta/)).toBeInTheDocument();
});

it('select all toggles every visible row', () => {
  const drives = [d('alpha', []), d('beta', [])];
  render(<HistoryView drives={drives} cars={[]} onOpen={vi.fn()} onDelete={vi.fn()}
                      onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'select all drives' }));
  expect(screen.getByRole('button', { name: 'Delete selected (2)' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'select alpha' })).toBeChecked();
  fireEvent.click(screen.getByRole('checkbox', { name: 'select all drives' }));
  expect(screen.queryByRole('button', { name: /delete selected/i })).toBeNull();
});

it('parked logs can be hidden with the toggle (KPIs narrow too)', () => {
  const drives = [d('alpha', []), { ...d('stationary', []), distanceKm: 0 }];
  render(<HistoryView drives={drives} cars={[]} onOpen={vi.fn()} onDelete={vi.fn()}
                      onChanged={vi.fn()} onDeleteMany={vi.fn()} />);
  const list = () => document.querySelector('.drive-list') as HTMLElement;
  expect(within(list()).getByText(/stationary/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /hide parked logs \(1\)/i }));
  expect(within(list()).queryByText(/stationary/)).toBeNull();
  expect(screen.getByText(/1 drives?, stored/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /hide parked logs/i })); // toggle back
  expect(within(list()).getByText(/stationary/)).toBeInTheDocument();
});
