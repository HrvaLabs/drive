import { useEffect, useRef } from 'react';

export interface BatchItem {
  name: string;
  status: 'waiting' | 'analyzing' | 'done' | 'failed' | 'skipped';
  error?: string; // short reason, e.g. "HTTP 422"
}

const ICON: Record<BatchItem['status'], string> = {
  waiting: '·', analyzing: '◐', done: '✓', failed: '✗', skipped: '—',
};
const WORD: Record<BatchItem['status'], string> = {
  waiting: 'waiting', analyzing: 'analyzing…', done: 'analyzed', failed: 'failed',
  skipped: 'skipped · already in history',
};

// Per-file batch progress: status line + overall bar + one row per file. Icon
// AND word per state so colour is never the only signal; the status line is a
// polite live region so screen readers hear batch progress.
export default function BatchProgress({ items, onRetry }: { items: BatchItem[]; onRetry?: () => void }) {
  const listRef = useRef<HTMLUListElement>(null);
  // The log box is height-capped; keep the row being analyzed in view.
  useEffect(() => {
    const active = listRef.current?.querySelector('.is-analyzing');
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [items]);
  if (items.length === 0) return null;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const skipped = items.filter((i) => i.status === 'skipped').length;
  const settled = done + failed + skipped;
  const running = settled < items.length;
  const base = failed > 0 ? `⚠ ${done} analyzed · ${failed} failed` : `✓ ${done} analyzed`;
  const summary = skipped > 0 ? `${base} · ${skipped} skipped` : base;
  return (
    <div className="batch-progress no-print">
      <p className="batch-progress__status" role="status" aria-live="polite">
        {running ? `Analyzing ${settled + 1} of ${items.length}…` : summary}
      </p>
      <div className="batch-progress__bar" aria-hidden="true">
        <div className="batch-progress__fill" style={{ width: `${(settled / items.length) * 100}%` }} />
      </div>
      {!running && failed > 0 && onRetry && (
        <button className="pill batch-progress__retry" onClick={onRetry}>Retry failed ({failed})</button>
      )}
      <ul className="batch-progress__files" ref={listRef}>
        {items.map((it, i) => (
          <li key={i} className={`batch-progress__file is-${it.status}`} title={it.name}>
            <span aria-hidden="true">{ICON[it.status]}</span>
            <span className="batch-progress__name">{it.name}</span>
            <span>{it.status === 'failed' ? `failed · ${it.error ?? 'error'}` : WORD[it.status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
