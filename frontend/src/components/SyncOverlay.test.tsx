import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SyncOverlay from './SyncOverlay';
import type { StartSync, SyncEvents } from '../sync/session';

function fakeStart() {
  let events: SyncEvents | null = null;
  const calls: Array<{ role: string; code: string }> = [];
  const start: StartSync = (role, code, ev) => {
    events = ev;
    calls.push({ role, code });
    return { close: vi.fn() };
  };
  return { start, calls, fire: () => events! };
}

describe('SyncOverlay', () => {
  it('hosting shows a QR image and the code', () => {
    const f = fakeStart();
    render(<SyncOverlay onClose={vi.fn()} onSynced={vi.fn()} start={f.start} />);
    fireEvent.click(screen.getByRole('button', { name: /show code/i }));
    expect(f.calls[0].role).toBe('host');
    expect(screen.getByAltText(/sync qr code/i)).toBeInTheDocument();
    expect(screen.getByText(f.calls[0].code)).toBeInTheDocument();
  });

  it('joining sends the typed code uppercase and walks to the merged summary', () => {
    const f = fakeStart();
    const onSynced = vi.fn();
    render(<SyncOverlay onClose={vi.fn()} onSynced={onSynced} start={f.start} />);
    fireEvent.change(screen.getByLabelText('sync code'), { target: { value: 'abcd2345' } });
    fireEvent.click(screen.getByRole('button', { name: /^join$/i }));
    expect(f.calls[0]).toEqual({ role: 'join', code: 'ABCD2345' });
    act(() => f.fire().onStatus('connecting…'));
    expect(screen.getByRole('status')).toHaveTextContent('connecting…');
    act(() => f.fire().onProgress(3, 9));
    expect(screen.getByRole('status')).toHaveTextContent('3/9');
    act(() => f.fire().onMerged('Merged 5 drives · 1 cars · 2 places from the other device.'));
    expect(screen.getByRole('status')).toHaveTextContent(/merged 5 drives/i);
    expect(onSynced).toHaveBeenCalled();
  });

  it('a deep-linked code joins automatically', () => {
    const f = fakeStart();
    render(<SyncOverlay onClose={vi.fn()} onSynced={vi.fn()} initialCode="QRCODE22" start={f.start} />);
    expect(f.calls[0]).toEqual({ role: 'join', code: 'QRCODE22' });
  });

  it('errors are shown plainly', () => {
    const f = fakeStart();
    render(<SyncOverlay onClose={vi.fn()} onSynced={vi.fn()} initialCode="QRCODE22" start={f.start} />);
    act(() => f.fire().onError('that code is already in use by two devices'));
    expect(screen.getByRole('status')).toHaveTextContent(/already in use/);
  });
});
