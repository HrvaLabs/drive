# Feature 5 — Per-engine eco-band calibration (design)

**Date:** 2026-06-08
**Status:** ⚠️ **INVESTIGATED → DEFERRED** (2026-06-08). The empirical work below is the deliverable;
the code is not worth building right now. See "Decision: deferred" before reading the design as a plan.
**Roadmap item:** Strong bet #5 — "derive the efficient RPM/load window from the car's own
fuel-rate data; replaces the generic 1500–2500 rpm band."

## Decision: deferred (do not implement now)

We ran the candidate algorithm on real data *before* writing code, and it changed the conclusion:

- The roadmap assumed the generic `[1500, 2500]` band was an "uncalibrated heuristic honesty gap."
  **It isn't, for this car.** Once the band is bounded below by an engine-**health** floor — which
  the user explicitly required ("listen to mechanics": keep a diesel above ~1500 rpm under load, since
  low revs = lugging = carbon/LSPI/drivetrain wear) — the data-calibrated band clamps right back to
  `[1500, 2500]`. This engine's raw most-economical revs (~1100–1400) sit *below* the health floor, so
  we deliberately refuse to go there.
- Net: the full calibration machinery (new `Scores` fields, UI provenance, fallback logic) would move
  the eco number ~nothing for the only car we have, while adding code and surface. **YAGNI.**
- The valuable output is the *knowledge*, recorded here and in memory: the existing `[1500,2500]` band
  is a defensible health-floored diesel band, not a mistake. The honesty gap was smaller than assumed.

**Revive when:** a second engine appears (petrol / peaky engine whose economical zone is genuinely
above the floor), or we want UI provenance polish, or we add load-aware (BSFC) calibration that could
*safely* justify a lower band. The algorithm below ([center, center+1000] over min-median-L/100km
bins, single health floor ~1500, calibrates only upward) is ready to lift when that day comes.

---

The original design follows, kept verbatim as the revival blueprint.

## Problem

`scores.py` scores eco-driving partly on `rpmBandPct` — the % of moving time the engine spends
in a **hardcoded** `_RPM_BAND = (1500, 2500)` rpm window, weighted 0.4 in `eco_score`. That window
is petrol-shaped and generic; for a diesel (efficient much lower) it is simply wrong, so the score
penalises economical diesel driving. This is the "uncalibrated heuristic" honesty gap.

## Goal

Replace the fixed band with one derived from **the car's own fuel-rate data in the drive being
analysed**, while keeping the eco score stable and comparable across drives. Stateless, per-drive,
private, free — no new data sources, no server state.

## What "efficient" means (decided)

Efficiency signal = **L/100km per RPM bin**, where `L/100km = fuelRate(L/h) ÷ speed(km/h) × 100`.
Fuel rate (L/h) alone is NOT efficiency — it rises with RPM regardless — so it is rejected. A
load/BSFC metric is the "proper" engine-map approach but needs an Engine-load PID and power
assumptions the roadmap already deferred; rejected for v1.

## Empirical validation (before specing)

Ran the candidate algorithm over ~16 real drives of the same car (`data/exported_records/`, throwaway
`scripts/explore_ecoband.py`, since removed). Findings that shaped the design:

1. **The efficient *center* is rock-stable across trip types.** Center spread = 250 rpm
   (1125→1375), std 111, across drives from 6 km/h (city) to 73 km/h (highway). The advisor's
   worry that the band would track *trip type, not engine* is **refuted** by data — proceed.
2. **A tolerance-derived *width* is too narrow and noisy to score.** Defining the band as
   "contiguous bins within 15% of the min" yielded 1–2 bins → only 2–23% of moving time captured,
   erratic drive-to-drive (2%→39%). Feeding that into a 0.4-weighted score would crater and
   destabilise eco — worse than the generic band.
3. **Fixed-width-recenter fixes it.** A 1000-rpm-wide band (same span as the generic) placed on
   the calibrated center gives band% in a healthy 11–68% range — same magnitude as today's gen%
   (9–56%), stable across drives. This is the chosen construction.
4. **The steady-state filter hurts here.** Filtering to low-acceleration samples starved the bins
   and made the center *noisier* (875→1625). Dropped.
5. **This engine is a diesel; its raw min-L/100km center (~1125) is far below the generic
   1500–2500.** So calibration corrects a real mismatch. Caveat: validated on exactly ONE engine,
   a diesel — see Limitations.
6. **Raw min-L/100km lands in lugging territory and must be floored.** Instantaneous L/100km keeps
   falling as revs drop, so the unconstrained minimum sits at the lowest cruising bin (~1100 rpm).
   But sustained low RPM **under load** is *lugging*: high cylinder pressure, carbon buildup, LSPI
   risk on turbo/GDI engines, drivetrain shudder — and BSFC is actually poor there, so it is not
   even truly efficient. An eco band must **never reward sub-floor revs**. Re-ran with a fuel-type
   health floor + upward band (below): band% stays score-able (11–68%), and 10–41% of time per drive
   sits below the floor — i.e. real lugging/coast/idle time the old band would have wrongly rewarded.

## Health floor (engine-protective lower bound)

A fuel-type **health floor** — the lowest RPM we are willing to call "good" — bounds the band below.
Defaults (configurable, not gospel; matches the codebase's threshold convention):
- **petrol → 1500 rpm**, **diesel → 1300 rpm** (diesels pull from lower revs but still shouldn't be
  lugged). Ceiling for calibration = 3000 rpm.

## Algorithm

In `scores.py`, replace `_RPM_BAND` and `rpm_band_pct` with a calibration step:

1. Build the 1 Hz grid for `[speed, "Engine RPM", fuelRatePid]` (`fuelRatePid` = "Engine fuel rate",
   else "Calculated instant fuel rate"). Resolve `floor` from `detect_fuel_type`.
2. Keep **moving** samples: `speed ≥ 5 km/h`, `fuelRate > 0`. Compute `l100 = fuelRate/speed*100`,
   drop `l100 ≤ 0` or `≥ 40` (implausible).
3. Bin RPM into 250-rpm bins, **≥ 30 samples** per bin. When picking the economical center, consider
   **only bins at/above the health floor** — bins below it are lugging/idle, not a band we endorse.
4. If **≥ 2 qualifying bins** and **≥ 100 moving+fuel samples** total:
   - `raw_center` = RPM bin (center value) with the **minimum median L/100km**.
   - `center = clamp(raw_center, floor, 3000)`.
   - `band = [center, center + 1000]` — anchored **at** the economical center and extending **upward**
     only, width 1000 rpm. **Source = "calibrated".**
   - *Why upward-from-center (not centered, not floor-anchored-below):* the user's correction — low
     RPM is bad for the engine. The band must not dip below the economical center toward lugging/coast
     revs. Calibration therefore only ever moves the band *up* (for an engine whose economical zone is
     genuinely higher than the floor); it can never push it down into lugging territory.
5. Else **fall back** to the **floor band** `[floor, floor + 1000]` (= the degenerate calibration with
   `center = floor`). **Source = "fuel-default".** So petrol → `[1500, 2500]` (unchanged from today),
   diesel → `[1300, 2300]`.
   *Why this fallback (not the old generic):* the center is near-constant per engine, so a calibrated
   diesel lands on ~`[1300,2300]` while a sparse diesel falling back to the petrol generic `[1500,2500]`
   would be a basis shift on the *same car* — poisoning feature 6's eco-delta. Falling back to the same
   fuel-floor band removes that discontinuity. (Fallback is now literally calibration with the center
   pinned to the floor — one code path, two entry points.)

`rpm_band_pct` then = % of moving-RPM grid samples inside `[low, high]`, exactly as today; it feeds
`eco_score` unchanged (weight 0.4).

## Data model changes (`models.py`)

Add to `Scores`:
- `rpmBandLow: float` — band low edge (rpm)
- `rpmBandHigh: float` — band high edge (rpm)
- `rpmBandSource: str` — `"calibrated"` | `"fuel-default"`

Bump `DriveAnalysis.schemaVersion` `"1"` → `"2"` (eco basis changed). No migration code: app is
pre-release, local-only, no real saved drives; the user clears local IndexedDB. Feature 6 may later
read `schemaVersion` to reason about cross-basis comparisons.

## UI (`frontend`)

Where rpmBandPct is shown, surface the band and its provenance:
- calibrated: *"Your engine's economical band: 1300–2300 rpm (from this drive's fuel data)"*
- fuel-default: *"Economical band: 1300–2300 rpm (diesel default — not enough fuel data this drive)"*

Honest provenance line is required (we promised "fixes the uncalibrated-heuristic honesty gap").

## Testing

- Unit (pytest, mirror existing `analysis/tests` style):
  - calibrated band on a synthetic frame whose min-median-L/100km bin is known → `[center, center+1000]`,
    source `"calibrated"`.
  - raw center below the health floor is clamped up to the floor; an economical zone genuinely above
    the floor moves the band up.
  - fallback when <2 qualifying bins / <100 samples / no fuel PID → `[floor, floor+1000]`, source
    `"fuel-default"`; diesel (1300) vs petrol (1500) floors differ.
  - bins below the health floor excluded from center selection.
  - `eco_score` still returns 0–100 and uses the new band%.
- Regression: `scripts/batch_analyze.py` runs clean over `data/exported_records` (no new anomalies).

## Limitations (write down, don't solve)

- Validated on **one engine (diesel)**. The near-constant center means per-drive calibration is
  largely *rediscovering "diesel → low band"* each run; the **fuel-aware fallback and fixed width are
  the load-bearing parts**, not per-drive cleverness. Per-drive recompute is kept because it adapts
  to **gearing** (differs across cars; untestable here) — but the fuel-type-static band is the floor
  it must beat, and is the fallback.
- Per-drive & stateless by design: a drive with no fuel-rate PID or too little moving data uses the
  fallback band (honestly labelled).

## Out of scope

Load/BSFC 2-D calibration; cross-drive accumulated calibration; any server state.
