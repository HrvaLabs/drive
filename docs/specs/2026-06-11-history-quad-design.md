# Features 13–16 — history quad: multi-select delete, trends avg line, clear-all, period analysis (design)

**Date:** 2026-06-11
**Status:** approved (user pre-approved the batch: "do all 4 in the same time… in one batch") → implementation
**Roadmap items:** #13 history multi-select delete · #14 trends average line · #15 clear-all-data
danger button · #16 day/period analysis & compare

One spec because all four live in the History surface and #13/#14/#16 touch the same files
(`HistoryView.tsx`, `history/aggregate.ts`). Entirely client-side; server untouched.

## 13 — History multi-select delete

- `DriveRow` gains optional `checked?: boolean; onToggle?: (id: string) => void`; when `onToggle`
  is provided it renders a leading checkbox (`aria-label` ``select ${drive.label}``). Without the
  prop the row is unchanged (other callers unaffected).
- `HistoryView` keeps `checkedIds: string[]`. Only **visible** checked rows count: the action uses
  `visibleChecked = checkedIds ∩ shown` so a tag/car filter can never cause an unseen drive to be
  deleted. A "Delete selected (N)" button (danger style) appears above the list when N > 0; it
  `window.confirm`s (``Delete N drive(s)? This cannot be undone.``) then calls a new prop
  `onDeleteMany(ids: string[])` and clears the selection.
- `App` adds `removeManyStored(ids)`: best-effort `deleteDrive` per id, closes the open report if
  it's among them (same semantics as single delete), **one** `refreshHistory()` at the end.

## 14 — Trends average line

- In the Trends chart: `avg` = mean of the plotted `buckets[metric]` values (equal weight per
  bucket — what the eye reads on the chart), rounded to 2 dp. Rendered as a dashed
  `ReferenceLine` (`stroke #5aa9ff` = `--data` blue, distinct from the amber series) with an
  `avg ${avg}` label.
- The chart's text summary (`trendSummary`, used for `aria-label` + the `ChartTable` caption)
  gains `· avg ${avg}` so the average is accessible to screen readers and testable as text.

## 15 — Clear-all-data danger button

- Home: the privacy overlay ("your data stays here — and here's the delete switch").
  `PrivacyOverlay` gains a required `onClearAll: () => void` prop and a danger section at the
  bottom: a `btn--danger` button "Delete all data" that `window.confirm`s
  ("Delete ALL drives, cars and settings stored in this browser? This cannot be undone.") before
  calling `onClearAll`. The "clear the site's data" bullet now points at the button.
- `App.clearEverything()`: existing `db.clearAll()` (drives + cars stores) best-effort; remove all
  `hrvadrive.*` localStorage keys (try/catch for private mode); reset state — analysis, phase,
  error, batch, tookMs, pricePerL, selectedCarVin, history, cars. Overlay stays open; the emptied
  History view is the visible proof.

## 16 — Period analysis & compare

The user's asks: "select whole day instead of singular drive / merge multiple drives to one day",
"history summary day, week, month so I know how much I spent", "compare 2 days/weeks/months/years".

- **Reuse, not new math:** `bucketBy()` already merges drives into per-period aggregates (count,
  km, fuel, €, CO₂, avg L/100, avg eco). `Period` gains `'year'` (`periodKey` returns
  `{key: '2026', label: '2026'}`); the Trends pills include *year* too.
- **`PeriodSummary.tsx`** (new card, after Trends): granularity pills (day/week/month/year,
  default **month** — the "how much did I spend that month" question), a table — Period · Drives ·
  km · Fuel L · Cost € · CO₂ kg · Avg L/100km — rows = `bucketBy(drives, g)` latest-first. A *day*
  row **is** the merged "day analysis".
- **`PeriodCompare.tsx`** (new card, after DriveCompare): granularity pills + A/B `<select>`s over
  the available buckets (defaults: the two most recent); needs ≥ 2 buckets, else placeholder
  ("Drive on at least two different days/weeks/months/years to compare."). Delta table styled like
  the existing compare (`.compare-table` + `deltaColor`).
- **`buildPeriodCompareRows(a: Bucket, b: Bucket)`** in `history/compareMetrics.ts` (reuses
  `row`/`ratio`/`val`/formatters): Drives (neutral), Distance km (neutral), Fuel L (neutral),
  Cost € (neutral — driving more *should* cost more; absolutes aren't judged), **€/km**
  (cost÷distance, down=better, null when distance 0), Avg L/100km (down=better, 0→null),
  Avg eco (up=better). Only honest ratios get a good/bad colour.
- Both new cards receive `shown` (tag/car filters narrow them — per-car monthly spend works).
  `DriveCompare` keeps full `drives` as today.

### Non-goals (16)
- Opening a merged day as a full report (map/charts): raw 1 Hz series from separate drives can't
  be honestly merged into one "drive"; the period table carries the day-level truth. Revisit only
  if a real need appears.
- No period histograms in the compare (would need loading every StoredDrive of both periods).

## Testing

- `aggregate.test.ts`: `'year'` bucketing (merge + key/label).
- `compareMetrics.test.ts`: `buildPeriodCompareRows` deltas, €/km derivation, null on zero distance.
- `DriveRow.test.tsx`: checkbox renders + fires `onToggle` when the prop is given; absent otherwise.
- `HistoryView.test.tsx`: select 2 rows → "Delete selected (2)" → confirm → `onDeleteMany` with both
  ids; filtered-out checked rows are NOT included; `avg` appears in the trends summary text; *year*
  pill present.
- `PeriodSummary.test.tsx`: month default merges same-month drives to one row; day splits them;
  latest-first ordering; totals correct.
- `PeriodCompare.test.tsx`: two day-buckets → delta table values/signs; <2 buckets → placeholder.
- `PrivacyOverlay.test.tsx`: confirm-accepted click calls `onClearAll`; cancel does not.
- `App.test.tsx`: integration — save a drive, open Privacy, "Delete all data" (confirm mocked) →
  History shows the empty placeholder, localStorage `hrvadrive.pricePerL` gone.
