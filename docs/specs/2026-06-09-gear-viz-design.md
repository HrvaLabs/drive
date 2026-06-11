# Feature 7 — Honest gear visualization (design)

**Date:** 2026-06-09
**Status:** approved (design) → ready for implementation plan
**Roadmap item:** Strong bet #7 — "Gear inference v2 … common time grid (same-instant), gate
idle/clutch/transients, require the ratio stable for N samples, then histogram-peak the speed/RPM
ratio. Fallback … report 'shift quality' … instead of absolute gear numbers."

## What the investigation changed (read first)

Before designing, the algorithm was run on real drives (throwaway probes, since removed):

1. **Gears DO separate cleanly.** Steady-state `RPM ÷ speed` ratios peak at tight, *repeatable*
   values across every drive — ≈ **29.4** (top gear) and ≈ **38.1** (one below), occasionally ≈ 54.
   The steps (≈1.30, ≈1.39) are textbook gearbox spacing. These ratios are a **gearbox constant**,
   not per-drive.
2. **But the "better short-shift" half is a proven no-op.** A discrete-gear + health-floor
   short-shift (v2) reproduced today's `quantile(0.05)` method (v1) almost exactly: mean |v2−v1| =
   **0.15 pp**, max 0.4 pp — and v2 has *worse* coverage (highway drives surface only one cluster, so
   no taller gear is in view). The driver also barely short-shifts at all (0.0–1.4% every drive) and
   already cruises in top gear on the highway. So **no short-shift change ships.**
3. **Per-drive can only see the gears you used, and absolute numbering is unknowable.** Low gears
   (1st/2nd) never appear steady; a highway drive surfaces only ≈38 or ≈29 — so per-drive logic can't
   honestly claim "you were in 5th of 6."

**Decision (user-approved):** feature 7 is a **minimal, honest gear *visualization*** — no short-shift
overhaul, no accumulation, no absolute gear numbers. Enthusiast/expert-view candy that shows the raw
gear structure without overclaiming.

## Architecture decision: compute in the backend

The viz is "client-side in spirit," but the stored `signals` are downsampled **independently**
(`signals['Engine RPM']` and `signals['Vehicle speed']` have different timestamps), so pairing RPM with
speed *at the same instant* — the whole basis of a ratio — would need an interpolating time-join on
coarse data. **Same-instant alignment is exactly the hard part the roadmap flagged.** The analysis
service already has `metrics.resample_1hz` (a same-instant 1 Hz grid at full resolution), so the small
ratio computation lives there; the frontend only *draws* a pre-paired result. Per-drive, stateless.

## Backend — new `analysis/app/gears.py`

`build_gears(df) -> Gears` (called from `analysis.py`, like `build_bests`):

1. Build the 1 Hz grid `[speed, "Engine RPM"]`; **moving** = `speed ≥ 6 km/h` and `rpm ≥ 900`.
2. **Detect gear ratios:** from moving samples that are *steady* (s-to-s `|Δspeed| ≤ 1.5` and
   `|Δratio| ≤ 4%` — not mid-shift/clutch), histogram `ratio = rpm/speed` (≈60 bins over the 1st–99th
   pct), peak-detect (local maxima ≥ max(15% of tallest peak, 1% of samples), near-duplicate peaks
   within 6% merged) → `ratios` **ascending (tallest gear first)**.
3. **Assign** each moving sample to the nearest ratio **within 10%**; samples farther than that
   (clutch-in, mid-shift, neutral coast) are **unassigned** (`gear = None`) — never force-fit, which
   would lie about usage.
4. **Usage:** per detected gear, % of moving time assigned to it; plus `unassignedPct`.
5. **Scatter:** downsample the moving samples to ≤ 250 `{speedKmh, rpm, gear}` points for the chart.

**Fallback:** if too little steady data to find any ratio, emit `ratios=[]`, `usage=[]`, and the scatter
points with `gear=None` (the raw scatter is still honest and useful). No exception, no overclaim.

## Data model (`models.py`)

```python
class GearPoint(BaseModel):
    speedKmh: float
    rpm: float
    gear: int | None = None   # index into ratios (0 = tallest used); None = unassigned

class GearUsage(BaseModel):
    label: str                # "tallest used" | "one below" | "two below" | "N below"
    ratio: float              # rpm per km/h
    pct: float                # % of moving time

class Gears(BaseModel):
    ratios: list[float] = Field(default_factory=list)   # ascending, rpm per km/h
    usage: list[GearUsage] = Field(default_factory=list)
    unassignedPct: float = 0.0
    points: list[GearPoint] = Field(default_factory=list)
```

`DriveAnalysis` gains `gears: Gears = Field(default_factory=Gears)`. Bump `schemaVersion` `"1"` → `"2"`
(additive; no migration — app is pre-release, local-only). Labels are **relative** ("tallest used, one
below …"), never absolute gear numbers.

## Frontend — new `components/GearChart.tsx`

Rendered in the existing **advanced-graphs** view (inside the `showExpert` block in `App.tsx`, after
`<ExpertPanel/>`). Prop: `gears: Gears` (new entry in `types.ts`).

- An **RPM-vs-speed scatter** (Recharts `ScatterChart`, x = speedKmh, y = rpm) where gears appear as
  radiating bands. Points coloured by `gear` (assigned gears use the colourblind-safe palette;
  `unassigned` = muted grey). Detected gear **ratio reference lines** (`y = ratio · x`) overlaid via
  `ReferenceLine`/a thin guide series, labelled by their relative name + ratio.
- A small **"N gears used this drive"** breakdown: each detected gear's relative label + ratio + usage
  %, and the unassigned (clutch/shift/coast) share.
- **Honesty:** caption states "this drive only · relative gears, not absolute"; if `ratios=[]`, show the
  raw scatter with a note that gears couldn't be separated for this drive.
- Reuse the a11y trio: `role="img"` + descriptive `aria-label` + visually-hidden `ChartTable` (rows =
  the gear-usage breakdown). Robust to `gears` being undefined (older stored drives).

## Testing

- **Backend** (`analysis/tests`, pytest, mirror existing style): synthetic df with two known ratios
  (speed ramps, `rpm = ratio·speed`) → detects ~2 ratios ascending; off-ratio samples → unassigned;
  usage % split + `unassignedPct` sane; scatter capped ≤ 250; labels "tallest used"/"one below".
  Fallback: flat/insufficient data → `ratios=[]` but scatter still emitted, no exception.
  Regression: `scripts/batch_analyze.py` clean over `data/exported_records`.
- **Frontend** (`GearChart.test.tsx`, mock `recharts`): renders the scatter + "N gears used"; shows the
  no-separation note when `ratios=[]`; a11y role=img + ChartTable present; tolerates `undefined` gears.

## Out of scope / non-goals

Absolute gear numbers; short-shift changes (proven no-op); accumulated cross-drive ratios; gear-shift
quality metric; any driving-advice claims. Pure, honest visualization of one drive's gear structure.
