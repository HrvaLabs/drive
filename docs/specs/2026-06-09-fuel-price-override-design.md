# Feature 8 — Manual fuel-price override (design)

**Date:** 2026-06-09
**Status:** approved (design) → ready for implementation plan
**Roadmap item:** Next-batch #8 — "UI to set €/L when the car didn't log `Fuel used price`, so cost +
CO₂ are accurate. Backend already accepts `price_per_l`."

## What the investigation changed

The `pricePerL` plumbing already exists end-to-end: the analysis API (`main.py` `pricePerL` Form field
→ `build_drive_analysis(price_per_l=...)`) and the Java ingestion (`DriveAnalysisController` /
`AnalysisClient` forward it). The **only** gap is the frontend: `api.ts` never appends `pricePerL` and
there is no input for it.

Two corrections to the original framing:
1. **Price affects COST only, not CO₂.** CO₂ is volume-based (`fuel_l × factor`); price changes
   `fuelCostEur`, `costPerKm`, projections, and idle-waste/savings — never CO₂.
2. **This car logs `Fuel used price`**, and `metrics.fuel_cost_eur` currently prefers the logged price,
   so a "fill-only-when-absent" override would be a no-op here. **Decision (user-approved): an explicit
   manual €/L OVERRIDES the logged price** — it lets the user *correct* a stale/wrong configured price
   (the car's logged price is whatever was set in Car Scanner, not necessarily what was paid).

## Backend — one function

Change precedence in `analysis/app/metrics.py` `fuel_cost_eur`:

```python
def fuel_cost_eur(df: pd.DataFrame, fuel_l: float, price_per_l: float | None) -> float:
    if price_per_l:                          # explicit manual override wins
        return round(fuel_l * price_per_l, 2)
    price = series(df, "Fuel used price")    # else the car's own logged total cost
    if not price.empty:
        return float(price["value"].iloc[-1])
    return 0.0
```

Everything downstream cascades from `summary.fuelCostEur` with no further change:
- `economy._price_per_l` back-derives €/L as `fuelCostEur / fuelUsedL` → equals the override.
- `costPerKm`, `projectedMonthly/Yearly`, `idleWasteEur`, `potentialSavingsEur` all recompute from it.

Backward-compatible: when `price_per_l` is `None`/0, the logged price still wins (existing behaviour).

## Frontend

- **`components/Uploader.tsx`**: add an optional number input **"Fuel price · €/L"** (`type="number"`,
  `step="0.01"`, `min="0"`, `aria-label="fuel price per litre"`). New props `pricePerL: string` +
  `setPricePerL: (v: string) => void` (kept as a string for a controlled input; empty = unset).
- **`App.tsx`**: hold `pricePerL` state; on mount, prefill from `localStorage` key `hrvadrive.pricePerL`;
  pass to `Uploader` and to the analyze call. On a successful analyze with a non-empty value, persist it
  to `localStorage` (so the user's typical price is remembered next time).
- **`api.ts`**: `analyzeDrive(file, brc, pricePerL?)` appends `form.append('pricePerL', pricePerL)` only
  when `pricePerL` is a non-empty, parseable positive number; otherwise omit it (server falls back to the
  logged price).
- **Re-pricing flow:** the `Uploader` bar is shown above the dashboard after analysis; to re-price, the
  user edits the €/L and clicks **Analyze** again (the `File`s are still in `App` state → re-analyze, no
  re-upload). No auto-re-analyze on keystroke (user-approved).
- The existing `EconomyCard` already renders `at €{pricePerLEur}/L`, so the price in effect is visible.

## Scope / non-goals

- Override is an **analyze-time** input. **Re-pricing a stored drive** (reopened from history — no raw
  file in the browser) is **out of scope** for v1.
- One price applies to **all files** in a multi-file analyze (same as the optional `.brc`).
- Affects cost fields only; CO₂ untouched.
- No validation UI beyond the numeric input + omit-when-invalid (a blank/0/garbage value just means "use
  the car's logged price").

## Testing

- **Backend** (`analysis/tests`, pytest):
  - `fuel_cost_eur`: with a logged `Fuel used price` present AND `price_per_l` given → returns
    `round(fuel_l × price_per_l, 2)` (override wins); with `price_per_l=None` → returns the logged price;
    with neither → 0.
  - economy: `build_economy` with an override `price_per_l` (and a summary whose `fuelCostEur` was
    computed from it) → `pricePerLEur` ≈ the override, `costPerKm`/projections recompute.
- **Frontend** (vitest + RTL):
  - `Uploader` renders the €/L input and calls `setPricePerL` on change.
  - `api.ts` appends `pricePerL` to the FormData when set, omits it when empty/invalid.
  - `App` prefills the value from `localStorage` and persists it after a successful analyze (mock
    localStorage + the analyze call).
