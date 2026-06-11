# Manual Fuel-Price Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user set a fuel price (€/L) that overrides the car's logged price, so cost/€-per-km/projections reflect what they actually paid.

**Architecture:** One backend precedence change in `metrics.fuel_cost_eur` (explicit `price_per_l` wins over the logged `Fuel used price`) cascades to every cost field automatically. The frontend adds the missing €/L input to `Uploader`, threads `pricePerL` through `api.ts` (the Java ingestion + analysis API already accept it), and remembers it in `localStorage`. Spec: `docs/specs/2026-06-09-fuel-price-override-design.md`.

**Tech Stack:** Python (pandas, pytest) for analysis; React + TypeScript + Vitest/RTL for frontend. Backend pytest from `analysis/` via `.venv/bin/python`; frontend npm from `frontend/`.

---

## File structure

- **Modify** `analysis/app/metrics.py` — invert precedence in `fuel_cost_eur` (override wins).
- **Modify** `analysis/tests/test_metrics.py` — the existing `test_fuel_cost_prefers_cumulative_price` encodes the OLD behaviour; replace it with override-wins + a logged-price-when-no-override test.
- **Modify** `frontend/src/api.ts` — `analyzeDrive` accepts an optional `pricePerL` and appends it when valid.
- **Modify** `frontend/src/components/Uploader.tsx` — add the €/L number input + two new props.
- **Modify** `frontend/src/App.tsx` — `pricePerL` state, localStorage prefill/persist, thread into analyze + `Uploader`.
- **Create** `frontend/src/api.test.ts` — assert the FormData contains/omits `pricePerL`.
- **Modify/Create** `frontend/src/components/Uploader.test.tsx` — assert the input renders + calls `setPricePerL` (create if absent).

---

### Task 1: Backend — manual price overrides the logged price

**Files:**
- Modify: `analysis/app/metrics.py` (`fuel_cost_eur`)
- Test: `analysis/tests/test_metrics.py`

- [ ] **Step 1: Update the tests to the new behaviour**

In `analysis/tests/test_metrics.py`, the synthetic fixture logs `Fuel used price = 0.40` (EUR) and `Fuel used = 0.25` (L). Replace the existing test that asserts the logged price wins:

```python
def test_fuel_cost_prefers_cumulative_price(synthetic_df):
    assert metrics.fuel_cost_eur(synthetic_df, fuel_l=0.25, price_per_l=2.0) == 0.40
```

with these two (override now wins; logged price used only when no override):

```python
def test_fuel_cost_manual_price_overrides_logged(synthetic_df):
    # synthetic logs Fuel used price=0.40, but an explicit €/L must win: 0.25 L * 2.0 = 0.50
    assert metrics.fuel_cost_eur(synthetic_df, fuel_l=0.25, price_per_l=2.0) == 0.50


def test_fuel_cost_uses_logged_price_when_no_override(synthetic_df):
    # no manual price -> fall back to the car's logged cumulative cost (0.40)
    assert metrics.fuel_cost_eur(synthetic_df, fuel_l=0.25, price_per_l=None) == 0.40
```

Leave `test_fuel_cost_falls_back_to_price_per_l` (no logged price, `price_per_l=1.5`, fuel 2.0 → 3.0) unchanged — it still holds.

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -q`
Expected: FAIL — `test_fuel_cost_manual_price_overrides_logged` gets `0.40`, expected `0.50` (old precedence still in place).

- [ ] **Step 3: Invert the precedence in `fuel_cost_eur`**

In `analysis/app/metrics.py`, replace the body of `fuel_cost_eur`:

```python
def fuel_cost_eur(df: pd.DataFrame, fuel_l: float, price_per_l: float | None) -> float:
    # An explicit manual €/L wins so the user can correct a stale/wrong logged price.
    if price_per_l:
        return round(fuel_l * price_per_l, 2)
    price = series(df, "Fuel used price")  # else the car's own logged cumulative cost
    if not price.empty:
        return float(price["value"].iloc[-1])
    return 0.0
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_metrics.py -q`
Expected: PASS. Then run the FULL backend suite `cd analysis && .venv/bin/python -m pytest -q` → all green (confirms no other test relied on the old precedence).

- [ ] **Step 5: Commit**

```bash
git add analysis/app/metrics.py analysis/tests/test_metrics.py
git commit -m "feat(economy): manual fuel price overrides the car's logged price"
```

---

### Task 2: Frontend api — send `pricePerL` when set

**Files:**
- Modify: `frontend/src/api.ts`
- Test: `frontend/src/api.test.ts` (create)

- [ ] **Step 1: Write the failing test** `frontend/src/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeDrive } from './api';

function lastFormData(): FormData {
  const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
  return call[1].body as FormData;
}

describe('analyzeDrive', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ schemaVersion: '2' }) }),
    ) as unknown as typeof fetch;
  });

  it('appends pricePerL when a valid positive number is given', async () => {
    await analyzeDrive(new File(['x'], 'd.csv'), null, '1.65');
    expect(lastFormData().get('pricePerL')).toBe('1.65');
  });

  it('omits pricePerL when empty, zero, or non-numeric', async () => {
    for (const v of ['', '0', 'abc', undefined]) {
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
      await analyzeDrive(new File(['x'], 'd.csv'), null, v as string | undefined);
      expect(lastFormData().get('pricePerL')).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- api`
Expected: FAIL — `analyzeDrive` takes only `(file, brc)`, so the 3rd arg is ignored and `pricePerL` is never appended.

- [ ] **Step 3: Add the `pricePerL` parameter**

Replace `frontend/src/api.ts` with:

```ts
import type { DriveAnalysis } from './types';

export async function analyzeDrive(file: File, brc?: File | null, pricePerL?: string): Promise<DriveAnalysis> {
  const form = new FormData();
  form.append('file', file);
  form.append('format', 'vertical_layout');
  if (brc) {
    form.append('brc', brc);
  }
  const price = Number(pricePerL);
  if (pricePerL && Number.isFinite(price) && price > 0) {
    form.append('pricePerL', pricePerL);
  }
  const res = await fetch('/api/v1/drives:analyze', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DriveAnalysis;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- api`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/api.test.ts
git commit -m "feat(api): analyzeDrive forwards an optional pricePerL"
```

---

### Task 3: Frontend — €/L input in the Uploader

**Files:**
- Modify: `frontend/src/components/Uploader.tsx`
- Test: `frontend/src/components/Uploader.test.tsx` (create)

- [ ] **Step 1: Write the failing test** `frontend/src/components/Uploader.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Uploader from './Uploader';

const baseProps = {
  files: [] as File[], brc: null as File | null,
  setFiles: vi.fn(), setBrc: vi.fn(),
  pricePerL: '', setPricePerL: vi.fn(),
  onAnalyze: vi.fn(), loading: false,
};

describe('Uploader', () => {
  it('renders the fuel-price input and reports changes', () => {
    const setPricePerL = vi.fn();
    render(<Uploader {...baseProps} setPricePerL={setPricePerL} />);
    const input = screen.getByLabelText(/fuel price per litre/i);
    fireEvent.change(input, { target: { value: '1.65' } });
    expect(setPricePerL).toHaveBeenCalledWith('1.65');
  });

  it('shows the current pricePerL value', () => {
    render(<Uploader {...baseProps} pricePerL="1.72" />);
    expect(screen.getByLabelText(/fuel price per litre/i)).toHaveValue(1.72);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- Uploader`
Expected: FAIL — no element labelled "fuel price per litre" (and a TS error on the unknown `pricePerL`/`setPricePerL` props).

- [ ] **Step 3: Add the input + props**

Replace `frontend/src/components/Uploader.tsx` with:

```tsx
interface Props {
  files: File[];
  setFiles: (f: File[]) => void;
  setBrc: (f: File | null) => void;
  pricePerL: string;
  setPricePerL: (v: string) => void;
  onAnalyze: () => void;
  loading: boolean;
}

// Shared upload controls — used in the landing hero (before analysis) and in the
// compact bar above the dashboard. Accepts multiple drive CSVs (a whole day at
// once); the optional .brc applies to all of them. `brc` is write-only here.
export default function Uploader({ files, setFiles, setBrc, pricePerL, setPricePerL, onAnalyze, loading }: Props) {
  return (
    <div className="upload no-print">
      <label className="upload__field">
        <span className="upload__caption">Drive log(s) · CSV</span>
        <input type="file" aria-label="drive file" accept=".csv" multiple
               onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      </label>
      <label className="upload__field">
        <span className="upload__caption">Vehicle · .brc (optional)</span>
        <input type="file" aria-label="vehicle file" accept=".brc"
               onChange={(e) => setBrc(e.target.files?.[0] ?? null)} />
      </label>
      <label className="upload__field">
        <span className="upload__caption">Fuel price · €/L (optional)</span>
        <input type="number" aria-label="fuel price per litre" step="0.01" min="0"
               inputMode="decimal" placeholder="e.g. 1.65" value={pricePerL}
               onChange={(e) => setPricePerL(e.target.value)} />
      </label>
      <button className="btn btn--primary upload__go" aria-label="analyze drive"
              onClick={onAnalyze} disabled={!files.length || loading}>
        {loading ? 'Analyzing…' : files.length > 1 ? `Analyze ${files.length}` : 'Analyze'}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- Uploader`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Uploader.tsx frontend/src/components/Uploader.test.tsx
git commit -m "feat(uploader): optional €/L fuel-price input"
```

---

### Task 4: Frontend — wire pricePerL through App (+ localStorage)

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add the state with a localStorage prefill**

In `frontend/src/App.tsx`, beside the other `useState` declarations (after `const [brc, setBrc] = useState<File | null>(null);` around line 29), add:

```tsx
  const [pricePerL, setPricePerL] = useState<string>(() => {
    try { return localStorage.getItem('hrvadrive.pricePerL') ?? ''; } catch { return ''; }
  });
```

- [ ] **Step 2: Pass pricePerL to the analyze call and persist it**

In the `onAnalyze` function, change the analyze call (currently `last = await analyzeDrive(files[i], brc);`) to pass the price:

```tsx
        last = await analyzeDrive(files[i], brc, pricePerL);
```

And immediately after the loop (right after the `for` loop closes, before `setTookMs(...)`), persist a valid price so it prefills next time:

```tsx
      try {
        const p = Number(pricePerL);
        if (pricePerL && Number.isFinite(p) && p > 0) localStorage.setItem('hrvadrive.pricePerL', pricePerL);
      } catch { /* ignore storage errors (private mode) */ }
```

- [ ] **Step 3: Pass the new props to Uploader**

Change the `uploaderProps` line (currently `const uploaderProps = { files, brc, setFiles, setBrc, onAnalyze, loading: phase === 'loading' };`) to include the price props:

```tsx
  const uploaderProps = { files, brc, setFiles, setBrc, pricePerL, setPricePerL, onAnalyze, loading: phase === 'loading' };
```

(`Uploader` ignores the extra `brc` field it already received before; no change needed at the call site `<Uploader {...uploaderProps} />`.)

- [ ] **Step 4: Typecheck, lint, full frontend test, build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: all tests pass (including the new api/Uploader suites), lint 0 problems, `tsc -b` clean, `vite build` succeeds.

- [ ] **Step 5: Manual smoke check**

Run `cd frontend && npm run dev`. Analyze a real drive (`data/exported_records/*.csv`) with the €/L field blank → cost matches the car's logged price. Then type a different €/L (e.g. `1.99`) and click **Analyze** again → the cost, €/km, projections, and the EconomyCard "at €1.99/L" all update; reload the page and confirm the field prefilled to `1.99`.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(app): thread the €/L override into analyze + remember it"
```

---

## Self-review

**Spec coverage:**
- Backend precedence (manual price wins, else logged, else 0) → Task 1. ✓
- Existing `test_fuel_cost_prefers_cumulative_price` (encoded old behaviour) updated → Task 1 Step 1. ✓
- `api.ts` appends `pricePerL` only when valid/positive → Task 2. ✓
- €/L input in Uploader with `aria-label="fuel price per litre"` → Task 3. ✓
- App state, localStorage prefill + persist, pass to analyze + Uploader → Task 4. ✓
- Cascade to costPerKm/projections/pricePerLEur → automatic via `summary.fuelCostEur` (no extra task; covered by the existing economy tests staying green in Task 1 Step 4). ✓
- Cost-only/CO₂-untouched, analyze-time only, one price for all files → no code needed (inherent: CO₂ uses fuel volume; the loop passes the same `pricePerL` to every file). ✓
- Out of scope (re-pricing stored drives) → not implemented, by design. ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `analyzeDrive(file, brc?, pricePerL?: string)` (Task 2) is called with `(files[i], brc, pricePerL)` in Task 4. `Uploader` Props `pricePerL: string` / `setPricePerL: (v: string) => void` (Task 3) match the `useState<string>` and `uploaderProps` in Task 4. localStorage key `hrvadrive.pricePerL` is identical in Tasks 4 Step 1 and Step 2.
