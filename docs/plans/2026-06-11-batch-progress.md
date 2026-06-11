# Batch Analyze Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-file progress (waiting/analyzing/✓/✗ + overall bar) while a multi-file batch analyzes, with continue-past-failures and an end summary — entirely client-side.

**Architecture:** A new presentational `BatchProgress` component renders a `BatchItem[]`; `App.tsx` replaces its `progress: string` state with that array and rewrites `onAnalyze` so each file gets its own try/catch (failures are recorded per file, the loop continues, the dashboard shows the last success, the global error banner fires only when every file fails). Spec: `docs/specs/2026-06-11-batch-progress-design.md`.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react, fake-indexeddb. Run npm from `frontend/`.

---

## File structure

- **Create** `frontend/src/components/BatchProgress.tsx` — `BatchItem` type (exported from here, imported by App) + the checklist UI.
- **Create** `frontend/src/components/BatchProgress.test.tsx` — component states, counts, summary, a11y.
- **Modify** `frontend/src/App.tsx` — `batch` state, `onAnalyze` rewrite, render `<BatchProgress />` where the old progress line sat.
- **Modify** `frontend/src/App.test.tsx` — mixed-batch / all-fail / full-success integration tests.
- **Modify** `frontend/src/index.css` — `.batch-progress` styles (append at end, own comment block).

---

### Task 1: `BatchProgress` component

**Files:**
- Create: `frontend/src/components/BatchProgress.tsx`
- Create: `frontend/src/components/BatchProgress.test.tsx`
- Modify: `frontend/src/index.css` (append)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/BatchProgress.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
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

  it('summarises a fully successful settled batch', () => {
    render(<BatchProgress items={[item('a.csv', 'done'), item('b.csv', 'done')]} />);
    expect(screen.getByRole('status')).toHaveTextContent('✓ 2 analyzed');
  });
});
```

(The all-success summary normally never shows — App clears the batch — but the component stays honest if rendered that way.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/components/BatchProgress.test.tsx`
Expected: FAIL — cannot resolve `./BatchProgress`.

- [ ] **Step 3: Implement the component**

Create `frontend/src/components/BatchProgress.tsx`:

```tsx
export interface BatchItem {
  name: string;
  status: 'waiting' | 'analyzing' | 'done' | 'failed';
  error?: string; // short reason, e.g. "HTTP 422"
}

const ICON: Record<BatchItem['status'], string> = {
  waiting: '·', analyzing: '◐', done: '✓', failed: '✗',
};
const WORD: Record<BatchItem['status'], string> = {
  waiting: 'waiting', analyzing: 'analyzing…', done: 'analyzed', failed: 'failed',
};

// Per-file batch progress: status line + overall bar + one row per file. Icon
// AND word per state so colour is never the only signal; the status line is a
// polite live region so screen readers hear batch progress.
export default function BatchProgress({ items }: { items: BatchItem[] }) {
  if (items.length === 0) return null;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const settled = done + failed;
  const running = settled < items.length;
  const summary = failed > 0 ? `⚠ ${done} analyzed · ${failed} failed` : `✓ ${done} analyzed`;
  return (
    <div className="batch-progress no-print">
      <p className="batch-progress__status" role="status" aria-live="polite">
        {running ? `Analyzing ${settled + 1} of ${items.length}…` : summary}
      </p>
      <div className="batch-progress__bar" aria-hidden="true">
        <div className="batch-progress__fill" style={{ width: `${(settled / items.length) * 100}%` }} />
      </div>
      <ul className="batch-progress__files">
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
```

Append to `frontend/src/index.css`:

```css
/* ---- Batch analyze progress (multi-file upload) ---- */
.batch-progress { margin: 10px 0 14px; }
.batch-progress__status { color: var(--muted); margin: 0 0 6px; font-size: 14px; }
.batch-progress__bar { height: 4px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
.batch-progress__fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }
.batch-progress__files { list-style: none; margin: 8px 0 0; padding: 0; font-size: 13px; }
.batch-progress__file { display: flex; gap: 6px; align-items: baseline; padding: 2px 0; color: var(--muted); }
.batch-progress__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 32ch; }
.batch-progress__file.is-analyzing { color: var(--accent); }
.batch-progress__file.is-done { color: var(--good); }
.batch-progress__file.is-failed { color: var(--bad); }
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/components/BatchProgress.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BatchProgress.tsx frontend/src/components/BatchProgress.test.tsx frontend/src/index.css
git commit -m "feat(progress): BatchProgress — per-file checklist + overall bar"
```

---

### Task 2: Wire `App.tsx` — continue-past-failures batch loop

**Files:**
- Modify: `frontend/src/App.tsx` (state ~line 52, `onAnalyze` ~lines 72–102, render ~line 186)
- Modify: `frontend/src/App.test.tsx` (append tests)

- [ ] **Step 1: Write the failing integration tests**

Append inside `describe('App dashboard', …)` in `frontend/src/App.test.tsx` (uses the existing `analysis` fixture; `analyzeDrive` calls `fetch` once per file, so per-call mocks map 1:1 to files):

```tsx
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
  await waitFor(() => expect(screen.getAllByText(/18\.4 km ·/)).toHaveLength(2)); // both successes saved
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
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: the 2 existing tests pass; the 3 new ones FAIL (no `⚠ … analyzed` text — today the second file aborts the batch).

- [ ] **Step 3: Rewrite the batch loop in `App.tsx`**

Add the import (with the other component imports):

```tsx
import BatchProgress, { type BatchItem } from './components/BatchProgress';
```

Replace `const [progress, setProgress] = useState<string>('');` with:

```tsx
const [batch, setBatch] = useState<BatchItem[]>([]);
const patchBatch = (i: number, patch: Partial<BatchItem>) =>
  setBatch((cur) => cur.map((it, j) => (j === i ? { ...it, ...patch } : it)));
```

Replace the whole `onAnalyze` function with:

```tsx
async function onAnalyze() {
  if (files.length === 0) return;
  setPhase('loading');
  setError('');
  setBatch(files.map((f) => ({ name: f.name, status: 'waiting' as const })));
  const started = performance.now();
  let lastSuccess: DriveAnalysis | null = null;
  let successes = 0;
  let firstFailure = '';
  for (let i = 0; i < files.length; i++) {
    patchBatch(i, { status: 'analyzing' });
    const carRec = cars.find((c) => c.vin === selectedCarVin);
    const vehicle = carRec ? { vin: carRec.vin, label: carRec.label, engine: carRec.engine } : undefined;
    try {
      const result = await analyzeDrive(files[i], null, pricePerL, vehicle);
      await saveDrive(result, files[i].name, selectedCarVin || undefined).catch(() => {});
      lastSuccess = result;
      successes++;
      patchBatch(i, { status: 'done' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (!firstFailure) firstFailure = reason;
      patchBatch(i, { status: 'failed', error: reason });
    }
  }
  if (successes === 0) {
    setError(files.length === 1 ? firstFailure : `All ${files.length} files failed`);
    setPhase('error');
    return;
  }
  try {
    const p = Number(pricePerL);
    if (pricePerL && Number.isFinite(p) && p > 0) localStorage.setItem('hrvadrive.pricePerL', pricePerL);
  } catch { /* ignore storage errors (private mode) */ }
  if (selectedCarVin) await touchCar(selectedCarVin).catch(() => {});
  setTookMs(performance.now() - started);
  if (successes === files.length) setBatch([]);
  setAnalysis(lastSuccess);
  setTab('analyze');
  setPhase('done');
  refreshHistory();
}
```

Replace `{progress && <p className="analyzed-meta no-print">{progress}</p>}` with:

```tsx
<BatchProgress items={batch} />
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: 5 passed (2 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(progress): batch analyze continues past failures, per-file status"
```

---

### Task 3: Full verification

- [ ] **Step 1: Full frontend suite + types + build**

Run: `cd frontend && npm test && npm run build`
Expected: all test files pass (108 existing + 7 new = 115); `tsc`/`vite build` clean.

- [ ] **Step 2: Analysis suite untouched but cheap to confirm**

Run: `make test`
Expected: analysis 106 passed; frontend as above.

- [ ] **Step 3: Mark roadmap item #12 ✅**

In `docs/ROADMAP.md`, change item 12's `🔨` to `✅` and append `— shipped 2026-06-11.` after the bold title.

- [ ] **Step 4: Commit**

```bash
git add docs/ROADMAP.md
git commit -m "docs(roadmap): mark batch analyze progress (#12) shipped"
```
