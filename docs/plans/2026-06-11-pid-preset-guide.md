# PID Preset Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add an optional-sensors collapsible to the Landing export guide, mapping each recommended PID to the existing engine-health insight it unlocks.

**Architecture:** Content-only addition to `frontend/src/components/Landing.tsx` (a second `<details>` in the existing guide section) + a new `Landing.test.tsx`. Spec: `docs/specs/2026-06-11-pid-preset-guide-design.md`.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react. npm from `frontend/`.

---

### Task 1: Add the optional-sensors guide section + test

**Files:**
- Modify: `frontend/src/components/Landing.tsx`
- Create: `frontend/src/components/Landing.test.tsx`

- [ ] **Step 1: Write the failing test** `frontend/src/components/Landing.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Landing from './Landing';

const props = {
  files: [] as File[], brc: null as File | null,
  setFiles: vi.fn(), setBrc: vi.fn(), pricePerL: '', setPricePerL: vi.fn(),
  onAnalyze: vi.fn(), loading: false,
};

describe('Landing', () => {
  it('shows the optional-sensors guide mapping PIDs to existing insights', () => {
    render(<Landing {...props} />);
    expect(screen.getByText(/optional sensors to log/i)).toBeInTheDocument();
    expect(screen.getByText(/coolant temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/battery voltage/i)).toBeInTheDocument();
    expect(screen.getByText(/fuel trim/i)).toBeInTheDocument();
    expect(screen.getByText(/boost/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- Landing`
Expected: FAIL — no "optional sensors to log" text yet.

- [ ] **Step 3: Add the section.** In `frontend/src/components/Landing.tsx`, inside `<section className="guide" aria-label="How to export">`, immediately AFTER the existing export `</details>` and BEFORE the closing `</section>`, insert:

```tsx
        <details className="guide__box">
          <summary className="guide__summary">⚙️ Get more out of it — optional sensors to log</summary>
          <p className="guide__intro">
            By default you get the summary, map, eco/cost, and gear views. To also fill in the
            <strong> engine-health</strong> insights, add these sensors to what Car Scanner records
            (same recording profile, full precision). They’re optional — the core report works without them.
          </p>
          <ul className="guide__steps">
            <li><strong>Engine coolant temperature</strong> → <em>warm-up time</em>: how long the engine takes to
              reach operating temperature. Short cold trips are the least efficient and hardest on the engine.</li>
            <li><strong>Battery voltage</strong> — prefer <strong>[ECM] Battery Voltage</strong> (the adapter’s
              “OBD Module Voltage” can read low) → a <em>battery health</em> check.</li>
            <li><strong>Short + Long term fuel trim (Bank 1)</strong> → a <em>rich/lean</em> fuel-mixture flag.</li>
            <li><strong>Boost</strong> (or Intake manifold pressure) → your <em>peak boost</em> reading.</li>
          </ul>
        </details>
```

Keep the special characters verbatim: `⚙️`, `→`, `—`, `’`, `“`/`”`, `±` (none here), `[ECM]`.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- Landing`
Expected: PASS (1 test).

- [ ] **Step 5: Full suite + lint + build**

Run: `cd frontend && npm test && npm run lint && npm run build`
Expected: all tests pass, lint 0 problems, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/Landing.tsx frontend/src/components/Landing.test.tsx
git commit -m "feat(landing): optional-sensors guide mapping PIDs to existing insights"
```

---

## Self-review

**Spec coverage:** second `<details>` in the guide section with the summary + the four sensor→insight mappings (coolant→warm-up, battery→health, fuel trim→rich/lean, boost→peak boost), honest framing, content-only → Task 1. ✓ DPF-regen/real-gear deliberately absent. ✓ Test asserts the section + distinguishing words. ✓

**Placeholder scan:** none.

**Type consistency:** `Landing` props in the test match the component's `Props` (the same `Uploader`-style props the app passes); no new props introduced.

**Note on `guide__intro`:** if no `.guide__intro` style exists, the `<p>` simply renders with default styling — acceptable; add a one-line CSS rule only if the spacing looks off in the smoke check (optional, not required for the test/build).
