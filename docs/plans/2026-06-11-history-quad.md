# History Quad (Features 13–16) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship roadmap items 13–16 in one batch: multi-select delete, trends average line, clear-all-data button, and day/week/month/year period summaries + period compare.

**Architecture:** All client-side on the existing History surface. #16 reuses `bucketBy()` (gains `'year'`) for both a `PeriodSummary` table and a `PeriodCompare` delta card (`buildPeriodCompareRows` joins `compareMetrics.ts`); #13 threads checkboxes through `DriveRow` to a new `App.removeManyStored`; #15 wires `db.clearAll()` (already exists) + localStorage wipe to a danger button in `PrivacyOverlay`. Spec: `docs/specs/2026-06-11-history-quad-design.md` (authoritative for behaviours and test list).

**Tech Stack:** React + TypeScript, Vitest + RTL, fake-indexeddb. npm from `frontend/`.

**Order (least → most entangled in HistoryView):** #15 → #14 → #13 → #16, one TDD commit each:

### Task 1 (#15): clear-all-data
- `PrivacyOverlay.tsx`: add `onClearAll` prop; danger section + `window.confirm`; reword the
  "clear the site's data" bullet. New `PrivacyOverlay.test.tsx` (confirm→called, cancel→not).
- `App.tsx`: `clearEverything()` — `clearAll().catch(()=>{})`, remove `hrvadrive.*` localStorage
  keys, reset analysis/phase/error/batch/tookMs/pricePerL/selectedCarVin/history/cars; pass to
  overlay. `index.css`: `.btn--danger`, `.danger-zone`. App integration test (spec).
- Commit: `feat(privacy): clear-all-data danger button`

### Task 2 (#14): trends average line
- `HistoryView.tsx`: import `ReferenceLine` (add to the test file's recharts mock!); compute
  `avg = round(mean(buckets.map(b => b[metric])), 2)`; dashed `#5aa9ff` line + label; append
  `· avg ${avg}` to `trendSummary`. Test: avg text appears.
- Commit: `feat(history): average reference line on Trends`

### Task 3 (#13): multi-select delete
- `DriveRow.tsx`: optional `checked`/`onToggle` → leading checkbox (`aria-label` `select ${label}`).
- `HistoryView.tsx`: `checkedIds` state; `visibleChecked = checkedIds ∩ shown`; danger pill
  `Delete selected (N)` above the list; confirm → `onDeleteMany(visibleChecked)`; clear selection.
  New `onDeleteMany` prop.
- `App.tsx`: `removeManyStored(ids)` — per-id best-effort delete, close open report if included,
  single `refreshHistory()`. Tests per spec (incl. filtered-out rows excluded).
- Commit: `feat(history): multi-select delete`

### Task 4 (#16): period summary + compare
- `aggregate.ts`: `Period` += `'year'`; `periodKey` year branch; Trends pills gain *year*.
- `compareMetrics.ts`: `buildPeriodCompareRows(a: Bucket, b: Bucket): CompareRow[]` — Drives/km/
  Fuel/Cost neutral; €/km + L/100 down-better (0/missing → null via `ratio`); eco up-better.
- New `PeriodSummary.tsx` (granularity pills, default month; latest-first table) +
  `PeriodCompare.tsx` (granularity + A/B selects, defaults two most recent; ≥2 buckets or
  placeholder; `.compare-table` + `deltaColor`). Both rendered in `HistoryView` with `shown`.
- Tests per spec (aggregate year, buildPeriodCompareRows, both components, HistoryView year pill).
- Commit: `feat(history): day/week/month/year summaries + period compare`

### Task 5: verification + docs
- `cd frontend && npm test && npm run build`; `make test-analysis`.
- Roadmap: mark 13–16 ✅ shipped 2026-06-11 with spec/plan pointer.
- Commit: `docs(roadmap): mark history quad (13–16) shipped`
