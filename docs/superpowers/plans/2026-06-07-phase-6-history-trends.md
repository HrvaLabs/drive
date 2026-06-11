# Phase 6 — Multi-drive history & trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Upload several drives at once, keep a private history, and see per day/week/month totals + trends (cost, L/100 km, eco score, CO₂ over time) with a reopenable list of past drives.

**Architecture:** **Client-side only.** Each analysed `DriveAnalysis` is stored in the browser (**IndexedDB**); aggregation and trends are computed in the frontend. The server stays **stateless** (the analysis pipeline is reused unchanged) — no DB, no auth, fully private, zero ops. (User decision 2026-06-07; supersedes the design-spec §8 "Postgres" sketch. Cross-device sync can be added later as an optional server layer.)

**Tech:** React + TS + Vite + Vitest. IndexedDB via a tiny hand-rolled wrapper (no new runtime dep). Tests for IndexedDB use **`fake-indexeddb`** (dev dep).

**Scope:** Phase 6 only. No auth, no server persistence, no cross-device sync. Schema unchanged (we store the existing `DriveAnalysis`).

---

## File structure

```
frontend/src/history/
├── db.ts          # NEW: IndexedDB wrapper — saveDrive, listDrives (meta only), getDrive, deleteDrive, clearAll
├── aggregate.ts   # NEW: pure — bucket stored drives by day/week/month; Σ/avg metrics + trend series
└── types.ts       # NEW: StoredDrive { id, savedAt, startedAtClock, label, summary, scores, economy } (+ full analysis blob)
frontend/src/components/
├── HistoryView.tsx   # NEW: period toggle, aggregate KPIs, trend charts, past-drive list (reopen / delete)
└── Uploader.tsx      # MODIFY: accept multiple .csv files (one .brc applies to all)
frontend/src/App.tsx   # MODIFY: Analyze ↔ History nav; auto-save after analysis; reopen a stored drive
```

---

## Tasks

### Task 1 — IndexedDB wrapper (`history/db.ts`)
- [ ] `openDb()` — one DB `hrvadrive`, store `drives` keyed by `id`, index on `savedAt`.
- [ ] `saveDrive(analysis): Promise<StoredDrive>` — id = `${startedAtClock}-${distanceKm}-${Date.now()}`; persist `{ ...meta, analysis }`.
- [ ] `listDrives(): Promise<StoredDrive[]>` — **meta only** (strip the heavy `analysis.route/series/signals`) for fast lists, newest first.
- [ ] `getDrive(id)`, `deleteDrive(id)`, `clearAll()`.
- [ ] Test with `fake-indexeddb`: save → list → get → delete round-trip.

### Task 2 — Aggregation (`history/aggregate.ts`, pure)
- [ ] `bucketBy(drives, period: 'day'|'week'|'month')` → `[{ key, label, count, distanceKm, fuelL, costEur, co2Kg, avgL100, avgEco }]` sorted oldest→newest. (ISO week for 'week'.)
- [ ] `totals(drives)` → grand totals (Σ distance/fuel/cost/CO₂, avg consumption/eco, drive count).
- [ ] Unit tests: two drives across two days → 2 day-buckets / 1 month-bucket; sums + averages correct.

### Task 3 — History view (`components/HistoryView.tsx`)
- [ ] Props: `drives: StoredDrive[]`, `onOpen(id)`, `onDelete(id)`.
- [ ] Period toggle (day/week/month) → bucket via `aggregate`.
- [ ] Total KPIs (reuse `.kpi` styles) + trend charts (Recharts `LineChart`: cost, L/100 km, eco over buckets).
- [ ] Past-drive list: date · distance · cost · eco, with **Open** + **Delete**.
- [ ] Empty state when no history.

### Task 4 — Multi-file upload (`Uploader.tsx`)
- [ ] `accept=".csv"` input gains `multiple`; keep the single optional `.brc`.
- [ ] App analyses each file sequentially (existing `analyzeDrive`), saves each, shows a small "n of m analysed" progress.

### Task 5 — App wiring (`App.tsx`)
- [ ] Top nav: **Analyze** | **History** (count badge). Header keeps Save-as-PDF on the report.
- [ ] After a successful analysis, `saveDrive(...)` automatically.
- [ ] History → **Open** loads the stored `analysis` into the existing dashboard (reuse the report view).
- [ ] Refresh the history list after save/delete.

### Task 6 — Verify
- [ ] `make test` green (incl. new history tests).
- [ ] Manual: upload 2–3 of the sample drives → History shows them, buckets by day/week/month, trends render, Open re-shows a report, Delete removes it; reload the page → history persists.

## Acceptance
- Upload multiple drives → private per-device history persists across reloads; day/week/month aggregates + trend charts; reopen/delete past drives. Server unchanged & stateless. `schemaVersion` still "1".
