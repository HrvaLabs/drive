import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import PrivacyOverlay from './PrivacyOverlay';

afterEach(() => vi.restoreAllMocks());

describe('PrivacyOverlay', () => {
  it('renders the notice with the key honesty points', () => {
    render(<PrivacyOverlay onClose={vi.fn()} onClearAll={vi.fn()} onBackup={vi.fn()} onRestore={vi.fn(() => Promise.resolve('ok'))} />);
    expect(screen.getByRole('dialog', { name: /privacy/i })).toBeInTheDocument();
    expect(screen.getByText(/no accounts, no cookies/i)).toBeInTheDocument();
    expect(screen.getByText(/stateless/i)).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap/)).toBeInTheDocument();
    // terms of use summary lives in the same overlay
    expect(screen.getByText(/terms of use/i)).toBeInTheDocument();
    expect(screen.getByText(/estimates/i)).toBeInTheDocument();
  });

  it('closes via the close button and via Escape', () => {
    const onClose = vi.fn();
    render(<PrivacyOverlay onClose={onClose} onClearAll={vi.fn()} onBackup={vi.fn()} onRestore={vi.fn(() => Promise.resolve('ok'))} />);
    fireEvent.click(screen.getByRole('button', { name: /close privacy/i }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('Delete all data asks for confirmation, then calls onClearAll', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onClearAll = vi.fn();
    render(<PrivacyOverlay onClose={vi.fn()} onClearAll={onClearAll} onBackup={vi.fn()} onRestore={vi.fn(() => Promise.resolve('ok'))} />);
    fireEvent.click(screen.getByRole('button', { name: /delete all data/i }));
    expect(window.confirm).toHaveBeenCalled();
    expect(onClearAll).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the confirmation is cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onClearAll = vi.fn();
    render(<PrivacyOverlay onClose={vi.fn()} onClearAll={onClearAll} onBackup={vi.fn()} onRestore={vi.fn(() => Promise.resolve('ok'))} />);
    fireEvent.click(screen.getByRole('button', { name: /delete all data/i }));
    expect(onClearAll).not.toHaveBeenCalled();
  });

  it('Download backup and Restore backup are wired', async () => {
    const onBackup = vi.fn();
    const onRestore = vi.fn(() => Promise.resolve('Restored 1 drives \u00b7 1 cars'));
    render(<PrivacyOverlay onClose={vi.fn()} onClearAll={vi.fn()} onBackup={onBackup} onRestore={onRestore} />);
    fireEvent.click(screen.getByRole('button', { name: /download backup/i }));
    expect(onBackup).toHaveBeenCalled();
    const file = new File(['{}'], 'b.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('restore backup file'), { target: { files: [file] } });
    await screen.findByText('Restored 1 drives \u00b7 1 cars');
    expect(onRestore).toHaveBeenCalledWith(file);
  });

  it('a failed restore shows the error message', async () => {
    const onRestore = vi.fn(() => Promise.reject(new Error('Not a HrvaDrive backup')));
    render(<PrivacyOverlay onClose={vi.fn()} onClearAll={vi.fn()} onBackup={vi.fn()} onRestore={onRestore} />);
    fireEvent.change(screen.getByLabelText('restore backup file'),
      { target: { files: [new File(['x'], 'x.json')] } });
    await screen.findByText('Not a HrvaDrive backup');
  });

  it('hides the auto-backup row where the File System Access API is missing', () => {
    render(<PrivacyOverlay onClose={vi.fn()} onClearAll={vi.fn()} onBackup={vi.fn()} onRestore={vi.fn(() => Promise.resolve('ok'))} />);
    expect(screen.queryByRole('button', { name: /auto-save to file/i })).toBeNull();
  });

  it('offers Auto-save to file when the API exists', () => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = vi.fn();
    render(<PrivacyOverlay onClose={vi.fn()} onClearAll={vi.fn()} onBackup={vi.fn()} onRestore={vi.fn(() => Promise.resolve('ok'))} />);
    expect(screen.getByRole('button', { name: /auto-save to file/i })).toBeInTheDocument();
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
  });
});
