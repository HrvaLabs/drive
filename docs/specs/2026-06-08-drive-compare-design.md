# Feature 6 — Drive-to-drive comparison (design)

**Date:** 2026-06-08
**Status:** approved (design) → ready for implementation plan
**Roadmap item:** Strong bet #6 — "Drive-to-drive comparison from IndexedDB history — metric deltas
(€/km, L/100, eco, CO₂ g/km) + overlay two speed/RPM traces on a shared axis. Client-side, high value."

## Goal

Let the user pick two saved drives and see, side by side, **how they differ** — both the headline
efficiency metrics and *how the driving was distributed*. Pure frontend; the stored `DriveAnalysis`
already carries everything needed. No server changes, no new data, stays private/client-side.

## Key design decision (vs the roadmap wording)

The roadmap said "overlay two speed/RPM **traces** on a shared axis." Decided **against raw traces**:
two saved drives are almost always different routes of different lengths, so a speed-vs-time overlay is
apples-to-oranges ("two squiggles"). Instead we compare **distributions** — how much of each drive was
spent in each speed band and each RPM band — which is honestly comparable across different routes and
directly answers "did I drive more efficiently?". Metric-delta table + distribution histograms.

## Placement & flow

A **"Compare two drives" section inside the History tab** (not a new tab). Two date-labelled dropdowns
**A vs B**, defaulting to the two most-recent drives. The History list holds only lightweight
`DriveMeta`, so on selection the section loads each full record via `getDrive(id)` and renders below.

## Block 1 — metric-delta table

Columns: **A · B · Δ**, with direction-aware colouring (green = better, red = worse) using the
existing colourblind-safe palette. Δ = B − A.

| Metric | Source (on `DriveAnalysis`) | Better when |
|---|---|---|
| L/100km | `summary.avgConsumptionL100km` | lower |
| Cost €/km | `economy.costPerKm` | lower |
| CO₂ g/km | `summary.co2PerKmG` | lower |
| Eco score | `scores.eco` | higher |
| Idle % | `scores.idlePct` | lower |
| Distance km | `summary.distanceKm` | neutral (no colour) |
| Avg speed km/h | `summary.avgSpeedKmh` | neutral (no colour) |

Dropped from the table deliberately (keep it tight): harsh-events, short-shift — revving behaviour is
already visible in the RPM distribution.

## Block 2 — distribution histograms

Two grouped bar charts, **A and B bars side by side per band**, each normalised to **% of that drive's
own samples** (so different-length drives compare fairly):

- **Speed bands:** `0–10, 10–30, 30–50, 50–70, 70–90, 90–110, 110–130, 130+` km/h.
- **RPM bands:** `<1000, 1000–1500, 1500–2000, 2000–2500, 2500–3000, 3000–3500, 3500–4000, 4000+`.

**Data source:** the stored downsampled signal points (≤300 each):
- speed: prefer `signals["Vehicle speed"]`, fall back to `signals["Speed (GPS)"]`.
- rpm: `signals["Engine RPM"]`.

**Approximation (state honestly in a caption):** we histogram by **sample count**, not integrated time.
`signals` downsampling is `iloc[::step]` (uniform in sample index); raw OBD logging is ~uniform in time,
so count-fraction ≈ time-fraction. Good enough for a personal comparison; not represented as exact
time-in-band.

## Structure

- **`frontend/src/history/distribution.ts`** — pure, unit-tested: `(points: SeriesPoint[], edges:
  number[]) => { band: string; pct: number }[]`. Bands from edges, normalised to % of non-empty points.
  Returns empty for an absent/empty signal.
- **`frontend/src/components/DriveCompare.tsx`** — the Compare section. Takes the `DriveMeta[]` list for
  the dropdowns; imports `getDrive` itself (keeps `App.tsx` wiring untouched). Holds selected A/B ids +
  the two loaded `StoredDrive` records in local state.
- Rendered by **`HistoryView`** above the existing "Drives" list (so History reads: KPIs → Trends →
  Compare → Drives).
- Recharts `BarChart` (grouped), matching existing chart code. Reuse the a11y pattern from the existing
  charts: `role="img"` + descriptive `aria-label`, a visually-hidden `ChartTable` fallback per chart,
  and the colourblind-safe palette (A vs B as the two series).

## Edge cases

- **< 2 saved drives:** show a hint ("Save at least two drives to compare them"), no dropdowns.
- **Same drive picked for A and B:** show a gentle "pick two different drives" note, skip the charts.
- **A drive missing the RPM signal:** render the speed distribution only, with a note that RPM wasn't
  logged for that drive. Likewise if neither has a usable speed signal, show the delta table only.
- **Missing metric values** (e.g. very short drive, `co2PerKmG = 0`): show "—", no colour, no Δ.

## Testing

- `distribution.test.ts` (mirror `history/aggregate.test.ts` style): correct banding & boundary
  handling (value exactly on an edge), normalisation sums to ~100%, empty/absent signal → `[]`,
  single-band drive.
- A small pure helper for delta direction/colour (`better: 'up' | 'down' | 'neutral'`) with a test.
- Manual: `npm run build` clean; visual check that A/B colours are distinguishable and the table colours
  match the "better when" direction.

## Out of scope

Comparing >2 drives; raw trace overlay; server-side distribution; route-shape/map comparison;
exporting the comparison.
