# Feature 25 — Consumption-drift maintenance flag (design)

**Date:** 2026-06-11
**Status:** approved (probed on real data first, per project practice) → implementation
**Probe:** `scripts/probe_drift.py` over the 53-drive real corpus (`data/exported_records/`, local
only). Result: 35 usable drives (moved ≥ 0.5 km, fuel logged); rolling drift noise envelope on a
healthy car was **−15%…+10%** across winter→summer; threshold **+15%** produced **0 false alarms in
23 evaluated points**. Short cold drives (e.g. 4.5 km @ 8.1 L/100) are absorbed by medians.

## Why

The hard-won honesty assessment said the single-drive model's real value unlock is trends — "L/100km
drift = maintenance flag". With real multi-month history now stored client-side, a rising
consumption trend is the one signal that turns reporting into action (tire pressure, air filter,
dragging brake) — provided it never cries wolf.

## Detector (`history/drift.ts`, pure, mirrors the probe exactly)

- Usable drive: **not a parked log** (`isParkedLog`) **and** `l100km > 0` (0 = missing data).
- Order by `driveDate ?? savedAt` ascending.
- Need ≥ **13** usable drives (baseline ≥ 8 + recent 5); otherwise → `null` (card hidden).
- `baseline` = median `l100km` of all but the last 5; `recent` = median of the last 5.
- `driftPct = (recent − baseline) / baseline × 100`.
- Verdict: `rising` at ≥ **+15%** · `improving` at ≤ **−15%** · `stable` between (probe-calibrated).

```ts
export interface DriftResult {
  baseline: number; recent: number; driftPct: number; usableDrives: number;
  verdict: 'rising' | 'stable' | 'improving';
}
export function consumptionDrift(drives: DriveMeta[]): DriftResult | null;
```

## Card (`DriftCard.tsx`, History view, after Trends)

- Receives `shown` (so tag/car/search filters apply) + `cars` for labels. Groups drives by `carVin`
  (no-vin drives form their own group) — **drift across different cars is meaningless**.
- One row per group with enough data: car label · `baseline → recent L/100km` · `driftPct` ·
  verdict word with icon (▲ rising = `--bad`, ● stable = muted, ▼ improving = `--good`) — icon AND
  word, colourblind-safe.
- `rising` adds the maintenance hint: check tire pressure, air filter, dragging brake/alignment —
  with the honest caveats baked into the copy: winter raises consumption seasonally, and a changed
  route/load mix can explain it; "estimates, not a diagnosis — verify with a mechanic" (consistent
  with TERMS).
- Renders nothing when no group qualifies (most users early on).

## Honesty constraints

- Never rewards lugging/engine-off behaviour (it only watches consumption level) — consistent with
  the health-vs-efficiency principle.
- Thresholds live as named constants with the probe numbers documented; if a second car's data ever
  shows a different noise envelope, recalibrate per the probe script.

## Testing

- `drift.test.ts`: <13 usable → null; parked/0-l100 excluded; rising (12×6.0 then 5×7.0 → +16.7%);
  stable (recent ≈ baseline); improving (recent 5×5.0); unsorted input handled (sorts internally).
- `DriftCard.test.tsx`: hidden when not enough data; per-car rows with verdict words; rising row
  shows the maintenance hint; mixed-car history produces independent rows.
