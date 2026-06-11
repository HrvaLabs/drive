import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BatchProgress, { type BatchItem } from './BatchProgress';

const item = (name: string, status: BatchItem['status'], error?: string): BatchItem =>
  ({ name, status, ...(error ? { error } : {}) });

describe('BatchProgress', () => {
  it('renders nothing when there are no items', () => {
    const { container } = render(<BatchProgress items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows per-file rows with icon words and a running status line', () => {
    render(<BatchProgress items={[
      item('a.csv', 'done'),
      item('b.csv', 'failed', 'HTTP 422'),
      item('c.csv', 'analyzing'),
      item('d.csv', 'waiting'),
      item('e.csv', 'waiting'),
    ]} />);
    expect(screen.getByRole('status')).toHaveTextContent('Analyzing 3 of 5…');
    expect(screen.getByText('analyzed')).toBeInTheDocument();
    expect(screen.getByText('failed · HTTP 422')).toBeInTheDocument();
    expect(screen.getByText('analyzing…')).toBeInTheDocument();
    expect(screen.getAllByText('waiting')).toHaveLength(2);
    expect(screen.getByText('a.csv')).toBeInTheDocument();
  });

  it('summarises when all files settled and some failed', () => {
    render(<BatchProgress items={[
      item('a.csv', 'done'), item('b.csv', 'done'),
      item('c.csv', 'done'), item('d.csv', 'done'),
      item('e.csv', 'failed', 'HTTP 422'),
    ]} />);
    expect(screen.getByRole('status')).toHaveTextContent('⚠ 4 analyzed · 1 failed');
  });

  it('shows skipped rows and counts them in the summary', () => {
    render(<BatchProgress items={[
      item('a.csv', 'done'), item('b.csv', 'skipped'), item('c.csv', 'done'),
    ]} />);
    expect(screen.getByText('skipped · already in history')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('✓ 2 analyzed · 1 skipped');
  });

  it('summarises a fully successful settled batch', () => {
    render(<BatchProgress items={[item('a.csv', 'done'), item('b.csv', 'done')]} />);
    expect(screen.getByRole('status')).toHaveTextContent('✓ 2 analyzed');
  });

  it('offers Retry failed only when settled with failures', () => {
    const onRetry = vi.fn();
    render(<BatchProgress items={[item('a.csv', 'done'), item('b.csv', 'failed', 'HTTP 500')]} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed (1)' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('no retry button while running or without failures', () => {
    const { rerender } = render(<BatchProgress items={[item('a.csv', 'analyzing'), item('b.csv', 'failed')]} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    rerender(<BatchProgress items={[item('a.csv', 'done'), item('b.csv', 'done')]} onRetry={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });
});
