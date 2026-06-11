# Feature 12 — Batch analyze progress (design)

**Date:** 2026-06-11
**Status:** approved (design) → ready for implementation plan
**Roadmap item:** #12 — "Batch analyze progress — per-file checklist + overall bar while analyzing;
continue past failures. Client-side only."

## Goal

Show real progress while drives are being analyzed — especially for multi-file batches. Each file gets
a visible state (waiting / analyzing / done / failed), an overall bar tracks the batch, and **one bad
file no longer aborts the rest**. Entirely client-side; the analysis API and its stateless
request/response model are untouched.

## Approved decisions

- **Continue past failures** — every file is attempted; failures are marked per file and summarized at
  the end. (Replaces today's abort-on-first-failure in `App.tsx`.)
- **Per-file checklist UI** — overall bar + one row per file, not just a counter.
- **Per-file state only** — no byte-level upload %; `fetch` stays (no XHR rewrite). Analysis is ~1 s
  per file, so file-level granularity is the honest unit.
- Rejected alternatives: server-streamed (SSE) stage progress — invisible at ~1 s/request and adds
  streaming infra to a stateless API; parallel uploads — complicates result/history ordering for
  little gain, can be layered on later without redoing this UI.

## State model (`App.tsx`)

The `progress: string` state is replaced by:

```ts
interface BatchItem {
  name: string;                                        // file.name
  status: 'waiting' | 'analyzing' | 'done' | 'failed';
  error?: string;                                      // short reason, e.g. "HTTP 422"
}
const [batch, setBatch] = useState<BatchItem[]>([]);
```

`onAnalyze` becomes:

1. Initialise `batch` with one `waiting` item per file.
2. Sequential loop (unchanged order): flip item *i* to `analyzing`; run `analyzeDrive` + `saveDrive`
   inside a **per-file try/catch**. Success → `done` (remember it as the last successful analysis);
   failure → `failed` with `error` = `err instanceof Error ? err.message : String(err)` (short, e.g.
   `HTTP 422`). The loop always continues.
3. `saveDrive` stays best-effort (`.catch(() => {})`): a blocked IndexedDB does **not** mark the file
   failed — the analysis itself succeeded and is shown.
4. After the loop:
   - **≥1 success:** `setAnalysis(lastSuccess)`, `phase = 'done'`, `tookMs` set, `refreshHistory()`.
     All succeeded → `setBatch([])` (the existing "Analyzed in X s · saved to History" line takes
     over). Some failed → `batch` stays visible (summary + rows) until the next analyze starts.
   - **0 successes:** `phase = 'error'`; `error` = the single file's reason when `files.length === 1`,
     otherwise `` `All ${files.length} files failed` ``. `batch` stays visible so each row shows its
     reason.
5. `pricePerL` persistence and `touchCar` behave as today (run when ≥1 success).

The global `error` banner therefore appears **only when every file failed**; partial failures live in
the batch summary instead.

## Component — `BatchProgress.tsx` (new, + test)

Pure presentational. Props: `{ items: BatchItem[] }`; renders nothing when `items` is empty. Derives
counts internally (`done`, `failed`, `settled = done + failed`, `total`).

- **Status line** (`role="status"`, `aria-live="polite"`): while any item is `waiting`/`analyzing` →
  `Analyzing ${settled + 1} of ${total}…`; when all settled with failures →
  `⚠ ${done} analyzed · ${failed} failed`.
- **Overall bar**: plain div fill, width `settled / total` (no new deps, no `<progress>` element —
  styled like the rest of the app in `index.css`).
- **File rows** (a `<ul>`): icon **and** word per state — `· waiting`, `◐ analyzing…`, `✓ analyzed`,
  `✗ failed · HTTP 422` — colour is never the only signal (consistent with the colourblind-safe
  accessibility pass). Long filenames ellipsise; the row keeps the full name in `title`.
- `className="batch-progress no-print"`; rendered exactly where the old progress line sat
  (`App.tsx` header area), so it appears on both the landing and the analyzed view. A single-file
  batch naturally collapses to one row.

## Unchanged

`api.ts`, the analysis service, sequential per-file requests, history save semantics (successes are
saved as the loop goes), `Uploader` button behaviour (`Analyzing…` while `phase === 'loading'`).

## Scope / non-goals

- No dismiss (✕) control — a stale failure summary clears on the next analyze.
- No parallel requests, no upload-byte %, no server-side progress (see rejected alternatives).
- No retry-failed-files button (v1) — re-selecting the files re-runs them.

## Testing

- **`BatchProgress.test.tsx`** (RTL): empty items → renders nothing; mixed states render the right
  icon+word rows; status line says `Analyzing 3 of 5…` (counts settled+1); bar width reflects
  `settled/total`; all-settled-with-failures shows the `⚠ 4 analyzed · 1 failed` summary; status line
  has `role="status"`.
- **`App.test.tsx`** (extend, mocked `analyzeDrive`):
  - Mixed batch: one rejection mid-batch → remaining files still analyzed, successes saved to
    history, dashboard shows the **last successful** analysis, summary line reports the failure, no
    global error banner.
  - All fail: `phase = 'error'`, banner says `All N files failed`, rows keep per-file reasons.
  - Full success: batch list clears; behaves as today.
