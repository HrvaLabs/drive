import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DriveMeta } from '../history/types';

const updateDriveMeta = vi.fn((_id: string, _p: unknown) => Promise.resolve());
vi.mock('../history/db', () => ({ updateDriveMeta: (id: string, p: unknown) => updateDriveMeta(id, p) }));

import DriveRow from './DriveRow';

const drive = (over: Partial<DriveMeta> = {}): DriveMeta => ({
  id: 'd1', savedAt: 1, startedAtClock: null, label: 'My car', distanceKm: 10, durationSeconds: 600,
  fuelUsedL: 1, costEur: 2, co2Kg: 2, l100km: 6, eco: 60, ...over,
});

describe('DriveRow', () => {
  beforeEach(() => updateDriveMeta.mockClear());

  it('shows existing tags and note', () => {
    render(<DriveRow drive={drive({ tags: ['commute'], notes: 'rainy' })}
                     onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText('commute')).toBeInTheDocument();
    expect(screen.getByText('rainy')).toBeInTheDocument();
  });

  it('edits: add a tag, type a note, save -> updateDriveMeta + onChanged', async () => {
    const onChanged = vi.fn();
    render(<DriveRow drive={drive()} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    const tagInput = screen.getByLabelText(/add tag/i);
    fireEvent.change(tagInput, { target: { value: 'errand' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    expect(screen.getByText('errand')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^note$/i), { target: { value: 'quick trip' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await Promise.resolve();
    expect(updateDriveMeta).toHaveBeenCalledWith('d1', { tags: ['errand'], notes: 'quick trip' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('removes a tag chip in the editor', () => {
    render(<DriveRow drive={drive({ tags: ['commute'] })} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove tag commute/i }));
    expect(screen.queryByText('commute')).toBeNull();
  });

  it('a comma also adds a tag', () => {
    render(<DriveRow drive={drive()} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    const tagInput = screen.getByLabelText(/add tag/i);
    fireEvent.change(tagInput, { target: { value: 'winter' } });
    fireEvent.keyDown(tagInput, { key: ',' });
    expect(screen.getByText('winter')).toBeInTheDocument();
  });

  it('Cancel discards edits without persisting', () => {
    render(<DriveRow drive={drive({ tags: ['commute'] })} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove tag commute/i }));
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(updateDriveMeta).not.toHaveBeenCalled();
    expect(screen.getByText('commute')).toBeInTheDocument(); // reset to the drive's original tag
  });
});

describe('DriveRow selection', () => {
  it('renders a checkbox and fires onToggle when the prop is given', () => {
    const onToggle = vi.fn();
    render(<DriveRow drive={drive()} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()}
                     checked={false} onToggle={onToggle} />);
    const box = screen.getByRole('checkbox', { name: 'select My car' });
    expect(box).not.toBeChecked();
    fireEvent.click(box);
    expect(onToggle).toHaveBeenCalledWith('d1');
  });

  it('has no checkbox without onToggle', () => {
    render(<DriveRow drive={drive()} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

it('shows the drive date European-style with weekday and start time', () => {
  render(<DriveRow drive={drive({ driveDate: new Date(2026, 5, 11, 17, 57).getTime() })}
                   onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByText('Thu, 11 Jun 2026 17:57')).toBeInTheDocument();
  expect(screen.getByText('My car')).toBeInTheDocument();
});

it('falls back to the logged clock when the filename had no date', () => {
  render(<DriveRow drive={drive({ driveDate: null, startedAtClock: '16:08:58.438' })}
                   onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByText(/16:08$/)).toBeInTheDocument();
});

it('marks a parked log (no real distance) with a badge', () => {
  render(<DriveRow drive={drive({ distanceKm: 0 })}
                   onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.getByText(/parked log/i)).toBeInTheDocument();
});

it('no parked badge on a real drive', () => {
  render(<DriveRow drive={drive()} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
  expect(screen.queryByText(/parked log/i)).toBeNull();
});
