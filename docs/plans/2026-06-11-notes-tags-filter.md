# Drive Notes & Tags + History Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag and annotate saved drives, and filter the whole History view by tag — entirely client-side (IndexedDB).

**Architecture:** `DriveMeta` gains `notes?`/`tags?`; `db.updateDriveMeta` persists them; pure `history/tags.ts` (`allTags`, `filterDrivesByTags`) drives a tag-filter bar in `HistoryView` that narrows KPIs+Trends+list; a new `DriveRow` component carries the inline tag/note editor. Spec: `docs/specs/2026-06-11-notes-tags-filter-design.md`.

**Tech Stack:** React + TypeScript, Vitest + @testing-library/react, fake-indexeddb. Run npm from `frontend/`.

---

## File structure

- **Modify** `frontend/src/history/types.ts` — `notes?`/`tags?` on `DriveMeta`.
- **Modify** `frontend/src/history/db.ts` — `toStored` defaults; `updateDriveMeta`.
- **Modify** `frontend/src/history/db.test.ts` — `updateDriveMeta` tests.
- **Create** `frontend/src/history/tags.ts` (+ `tags.test.ts`) — pure helpers.
- **Create** `frontend/src/components/DriveRow.tsx` (+ `DriveRow.test.tsx`) — row + inline editor.
- **Modify** `frontend/src/components/HistoryView.tsx` — filter bar, use `shown` + `DriveRow`, `onChanged` prop.
- **Modify** `frontend/src/App.tsx` — pass `onChanged={refreshHistory}` to `HistoryView`.
- **Modify** `frontend/src/index.css` — tag/editor/filter styles.

---

### Task 1: Data model + `updateDriveMeta`

**Files:** Modify `frontend/src/history/types.ts`, `frontend/src/history/db.ts`, `frontend/src/history/db.test.ts`.

- [ ] **Step 1: Add the fields + failing tests.**

In `frontend/src/history/types.ts`, add to the `DriveMeta` interface (after `eco: number;`):

```ts
  notes?: string;
  tags?: string[];
```

In `frontend/src/history/db.test.ts`, add (the file already has `analysis()` + `fake-indexeddb/auto` + `beforeEach(clearAll)`):

```ts
import { saveDrive, listDrives, getDrive, deleteDrive, clearAll, updateDriveMeta } from './db';
// ^ replace the existing db import line with this one (adds updateDriveMeta)

it('updateDriveMeta persists tags + notes and keeps the analysis', async () => {
  const rec = await saveDrive(analysis(), '2026-01-01 10-00-00.csv');
  await updateDriveMeta(rec.id, { tags: ['commute', 'winter'], notes: 'icy roads' });
  const got = await getDrive(rec.id);
  expect(got?.tags).toEqual(['commute', 'winter']);
  expect(got?.notes).toBe('icy roads');
  expect(got?.analysis.summary.distanceKm).toBe(12); // heavy payload intact
});

it('updateDriveMeta is a no-op on a missing id', async () => {
  await expect(updateDriveMeta('nope', { tags: ['x'] })).resolves.toBeUndefined();
  expect(await listDrives()).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd frontend && npm test -- db`
Expected: FAIL — `updateDriveMeta` is not exported.

- [ ] **Step 3: Implement.**

In `frontend/src/history/db.ts`, in `toStored`'s returned object, add (after `eco: analysis.scores.eco,`):

```ts
    tags: [],
    notes: '',
```

Then add this exported function (after `saveDrive`):

```ts
export async function updateDriveMeta(id: string, patch: { notes?: string; tags?: string[] }): Promise<void> {
  const rec = await getDrive(id);
  if (!rec) return;
  await run('readwrite', (s) => s.put({ ...rec, ...patch }));
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `cd frontend && npm test -- db`
Expected: PASS (existing db tests + the 2 new).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/history/types.ts frontend/src/history/db.ts frontend/src/history/db.test.ts
git commit -m "feat(history): notes/tags on DriveMeta + updateDriveMeta"
```

---

### Task 2: Pure tag helpers `history/tags.ts`

**Files:** Create `frontend/src/history/tags.ts`, `frontend/src/history/tags.test.ts`.

- [ ] **Step 1: Write the failing test** `frontend/src/history/tags.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { allTags, filterDrivesByTags } from './tags';
import type { DriveMeta } from './types';

const d = (id: string, tags?: string[]): DriveMeta => ({
  id, savedAt: 1, startedAtClock: null, label: 'Drive', distanceKm: 1, durationSeconds: 1,
  fuelUsedL: 0, costEur: 0, co2Kg: 0, l100km: 0, eco: 0, tags,
});

describe('history tags', () => {
  it('allTags: distinct, sorted, ignores empty/undefined', () => {
    expect(allTags([d('a', ['b', 'a']), d('b', ['a', '']), d('c')])).toEqual(['a', 'b']);
  });

  it('filterDrivesByTags: empty selection returns all', () => {
    const ds = [d('a', ['x']), d('b')];
    expect(filterDrivesByTags(ds, [])).toEqual(ds);
  });

  it('filterDrivesByTags: OR semantics, untagged excluded when filtering', () => {
    const ds = [d('a', ['commute']), d('b', ['trip']), d('c')];
    expect(filterDrivesByTags(ds, ['commute']).map((x) => x.id)).toEqual(['a']);
    expect(filterDrivesByTags(ds, ['commute', 'trip']).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- tags`
Expected: FAIL — `Cannot find module './tags'`.

- [ ] **Step 3: Implement** `frontend/src/history/tags.ts`:

```ts
import type { DriveMeta } from './types';

export function allTags(drives: DriveMeta[]): string[] {
  const set = new Set<string>();
  for (const d of drives) for (const t of d.tags ?? []) if (t) set.add(t);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterDrivesByTags(drives: DriveMeta[], selected: string[]): DriveMeta[] {
  if (selected.length === 0) return drives;
  return drives.filter((d) => (d.tags ?? []).some((t) => selected.includes(t)));
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- tags`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/history/tags.ts frontend/src/history/tags.test.ts
git commit -m "feat(history): pure allTags + filterDrivesByTags (OR)"
```

---

### Task 3: `DriveRow` component with inline tag/note editor

**Files:** Create `frontend/src/components/DriveRow.tsx`, `frontend/src/components/DriveRow.test.tsx`; Modify `frontend/src/index.css`.

- [ ] **Step 1: Write the failing test** `frontend/src/components/DriveRow.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DriveMeta } from '../history/types';

const updateDriveMeta = vi.fn(() => Promise.resolve());
vi.mock('../history/db', () => ({ updateDriveMeta: (id: string, p: unknown) => updateDriveMeta(id, p) }));

import DriveRow from './DriveRow';

const drive = (over: Partial<DriveMeta> = {}): DriveMeta => ({
  id: 'd1', savedAt: 1, startedAtClock: null, label: 'My car', distanceKm: 10, durationSeconds: 600,
  fuelUsedL: 1, costEur: 2, co2Kg: 2, l100km: 6, eco: 60, ...over,
});

describe('DriveRow', () => {
  beforeEach(() => updateDriveMeta.mockClear());

  it('shows existing tags and note', () => {
    render(<DriveRow drive={drive({ tags: ['commute'], notes: 'rainy' })}
                     onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByText('commute')).toBeInTheDocument();
    expect(screen.getByText('rainy')).toBeInTheDocument();
  });

  it('edits: add a tag, type a note, save -> updateDriveMeta + onChanged', async () => {
    const onChanged = vi.fn();
    render(<DriveRow drive={drive()} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    const tagInput = screen.getByLabelText(/add tag/i);
    fireEvent.change(tagInput, { target: { value: 'errand' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    expect(screen.getByText('errand')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^note$/i), { target: { value: 'quick trip' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await Promise.resolve();
    expect(updateDriveMeta).toHaveBeenCalledWith('d1', { tags: ['errand'], notes: 'quick trip' });
    expect(onChanged).toHaveBeenCalled();
  });

  it('removes a tag chip in the editor', () => {
    render(<DriveRow drive={drive({ tags: ['commute'] })} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.click(screen.getByRole('button', { name: /remove tag commute/i }));
    expect(screen.queryByText('commute')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- DriveRow`
Expected: FAIL — `Cannot find module './DriveRow'`.

- [ ] **Step 3: Implement** `frontend/src/components/DriveRow.tsx`:

```tsx
import { useState } from 'react';
import type { DriveMeta } from '../history/types';
import { updateDriveMeta } from '../history/db';

interface Props {
  drive: DriveMeta;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
}

const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export default function DriveRow({ drive, onOpen, onDelete, onChanged }: Props) {
  const [editing, setEditing] = useState(false);
  const [tags, setTags] = useState<string[]>(drive.tags ?? []);
  const [note, setNote] = useState<string>(drive.notes ?? '');
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, ' ');
    setDraft('');
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) setTags([...tags, t]);
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const save = async () => {
    await updateDriveMeta(drive.id, { tags, notes: note.trim() });
    setEditing(false);
    onChanged();
  };
  const cancel = () => {
    setTags(drive.tags ?? []);
    setNote(drive.notes ?? '');
    setDraft('');
    setEditing(false);
  };

  return (
    <div className="drive-row">
      <div className="drive-row__main">
        <span className="drive-row__date">{fmtDate(drive.driveDate ?? drive.savedAt)} · {drive.label}</span>
        <span className="drive-row__stats">{drive.distanceKm} km · €{drive.costEur} · {drive.l100km} L/100km · eco {drive.eco}</span>

        {!editing && ((drive.tags?.length ?? 0) > 0 || drive.notes) && (
          <span className="drive-row__meta">
            {(drive.tags ?? []).map((t) => <span className="tag" key={t}>{t}</span>)}
            {drive.notes && <span className="drive-row__note">{drive.notes}</span>}
          </span>
        )}

        {editing && (
          <div className="drive-row__editor">
            <div className="tag-input">
              {tags.map((t) => (
                <span className="tag tag--editable" key={t}>{t}
                  <button className="tag__x" aria-label={`remove tag ${t}`} onClick={() => removeTag(t)}>×</button>
                </span>
              ))}
              <input aria-label="add tag" placeholder="add tag…" value={draft}
                     onChange={(e) => setDraft(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(draft); } }} />
            </div>
            <textarea aria-label="note" className="note-input" rows={2} placeholder="note…"
                      value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
      </div>

      <div className="drive-row__actions">
        {editing ? (
          <>
            <button className="pill" onClick={save}>Save</button>
            <button className="pill" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <>
            <button className="pill" onClick={() => setEditing(true)}>Edit</button>
            <button className="pill" onClick={() => onOpen(drive.id)}>Open</button>
            <button className="pill" onClick={() => onDelete(drive.id)}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append styles to the END of `frontend/src/index.css`:**

```css
/* Drive tags / notes */
.drive-row__meta { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 4px; }
.drive-row__note { color: var(--muted); font-size: 12.5px; }
.tag { background: rgba(255, 159, 28, 0.15); color: var(--accent); border-radius: 999px;
  padding: 1px 9px; font-size: 12px; white-space: nowrap; }
.tag--editable { display: inline-flex; align-items: center; gap: 4px; }
.tag__x { background: none; border: none; color: inherit; cursor: pointer; font-size: 14px; line-height: 1; padding: 0; }
.drive-row__editor { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.tag-input { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.tag-input input, .note-input { background: var(--bg); border: 1px solid var(--line); border-radius: 6px;
  color: var(--text); padding: 4px 8px; font: inherit; }
.note-input { width: 100%; resize: vertical; }
```

- [ ] **Step 5: Run + lint**

Run: `cd frontend && npm test -- DriveRow` → PASS (3 tests).
Run: `cd frontend && npx eslint src/components/DriveRow.tsx src/components/DriveRow.test.tsx` → 0 problems.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DriveRow.tsx frontend/src/components/DriveRow.test.tsx frontend/src/index.css
git commit -m "feat(history): DriveRow with inline tag/note editor"
```

---

### Task 4: Filter bar in HistoryView + wire `onChanged`

**Files:** Modify `frontend/src/components/HistoryView.tsx`, `frontend/src/App.tsx`; Test `frontend/src/components/HistoryView.test.tsx` (create).

- [ ] **Step 1: Write the failing test** `frontend/src/components/HistoryView.test.tsx`:

```tsx
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { DriveMeta } from '../history/types';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Line: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, CartesianGrid: () => null,
}));
// getDrive must return a Promise — the rendered DriveCompare calls getDrive(id).then(...)
vi.mock('../history/db', () => ({ getDrive: vi.fn(() => Promise.resolve(undefined)), updateDriveMeta: vi.fn() }));

import HistoryView from './HistoryView';

const d = (id: string, tags: string[]): DriveMeta => ({
  id, savedAt: 1, driveDate: 1, startedAtClock: null, label: id, distanceKm: 10, durationSeconds: 60,
  fuelUsedL: 1, costEur: 2, co2Kg: 2, l100km: 6, eco: 60, tags,
});

describe('HistoryView tag filter', () => {
  it('a tag chip narrows the Drives list; All restores', () => {
    const drives = [d('alpha', ['commute']), d('beta', ['trip'])];
    render(<HistoryView drives={drives} onOpen={vi.fn()} onDelete={vi.fn()} onChanged={vi.fn()} />);
    const list = () => document.querySelector('.drive-list') as HTMLElement;
    expect(within(list()).getByText(/alpha/)).toBeInTheDocument();
    expect(within(list()).getByText(/beta/)).toBeInTheDocument();
    // click the 'commute' filter chip (in the filter bar, not a drive row)
    fireEvent.click(screen.getByRole('button', { name: 'commute' }));
    expect(within(list()).getByText(/alpha/)).toBeInTheDocument();
    expect(within(list()).queryByText(/beta/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^all$/i }));
    expect(within(list()).getByText(/beta/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- HistoryView`
Expected: FAIL — `HistoryView` has no `onChanged` prop / no filter bar / no `commute` chip button.

- [ ] **Step 3: Update `HistoryView.tsx`.**

(a) Add imports below the existing ones:

```tsx
import DriveRow from './DriveRow';
import { allTags, filterDrivesByTags } from '../history/tags';
```

(b) Change the `Props` interface and the function signature to add `onChanged`:

```tsx
interface Props {
  drives: DriveMeta[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onChanged: () => void;
}

export default function HistoryView({ drives, onOpen, onDelete, onChanged }: Props) {
```

(c) Add filter state at the top of the component body (next to `period`/`metric`):

```tsx
  const [selected, setSelected] = useState<string[]>([]);
```

(d) Right after the `if (drives.length === 0) { ... }` block, derive the filtered set + tag list, and switch `totals`/`bucketBy` to use it:

```tsx
  const tags = allTags(drives);
  const shown = filterDrivesByTags(drives, selected);
  const toggle = (tag: string) => setSelected((s) => (s.includes(tag) ? s.filter((x) => x !== tag) : [...s, tag]));
```

Then change `const t = totals(drives);` → `const t = totals(shown);` and `const buckets = bucketBy(drives, period);` → `const buckets = bucketBy(shown, period);`. Delete the now-unused `fmtDate` const (it moved into `DriveRow`).

(e) Render the filter bar as the FIRST child inside the top-level `<div className="dash">` (before the History KPIs card):

```tsx
      {tags.length > 0 && (
        <div className="filter-bar no-print" role="group" aria-label="filter by tag">
          <button className="pill" onClick={() => setSelected([])} disabled={selected.length === 0}>All</button>
          {tags.map((tag) => (
            <button key={tag} className="pill" aria-pressed={selected.includes(tag)}
                    onClick={() => toggle(tag)} disabled={selected.includes(tag)}>{tag}</button>
          ))}
        </div>
      )}
```

(f) Replace the inline drives list `{drives.map((d) => ( <div className="drive-row" ...> ... </div> ))}` with `DriveRow` over `shown`:

```tsx
        <div className="drive-list">
          {shown.map((d) => (
            <DriveRow key={d.id} drive={d} onOpen={onOpen} onDelete={onDelete} onChanged={onChanged} />
          ))}
        </div>
```

(Leave `<DriveCompare drives={drives} />` using the full `drives` — Compare is not tag-filtered.)

- [ ] **Step 4: Pass `onChanged` from `App.tsx`.**

In `frontend/src/App.tsx`, change the History render (currently `<HistoryView drives={history} onOpen={openStored} onDelete={removeStored} />`) to:

```tsx
        <HistoryView drives={history} onOpen={openStored} onDelete={removeStored} onChanged={refreshHistory} />
```

- [ ] **Step 5: Append the filter-bar style to `frontend/src/index.css`:**

```css
.filter-bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
```

- [ ] **Step 6: Run the targeted test, then the full suite + lint + build**

Run: `cd frontend && npm test -- HistoryView` → PASS.
Run: `cd frontend && npm test` → all pass.
Run: `cd frontend && npm run lint && npm run build` → lint 0 problems, build succeeds.

- [ ] **Step 7: Manual smoke check**

`cd frontend && npm run dev`, open History with ≥2 saved drives. Edit a drive → add a tag + note → Save; the chip/note show on the row. The filter bar appears; clicking a tag narrows the KPIs, Trends, and the list; "All" clears.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/HistoryView.tsx frontend/src/components/HistoryView.test.tsx frontend/src/App.tsx frontend/src/index.css
git commit -m "feat(history): tag filter bar narrows the whole History view"
```

---

## Self-review

**Spec coverage:**
- `notes?`/`tags?` on `DriveMeta`, schemaless (no version bump), `toStored` defaults → Task 1. ✓
- `updateDriveMeta(id, patch)` merge+put, no-op on missing id → Task 1. ✓
- Pure `allTags` (distinct/sorted/ignore empty) + `filterDrivesByTags` (OR, empty=all) → Task 2. ✓
- `DriveRow` with tag chips + note + inline editor (Enter/comma add, × remove, Save→update+refresh) → Task 3. ✓
- Filter bar narrows KPIs + Trends + list together; Compare keeps full → Task 4 (totals/bucketBy/list use `shown`). ✓
- `onChanged` threaded App→HistoryView→DriveRow → Tasks 3 & 4. ✓
- Edit-in-list only / OR / on-device → matches scope (no report-view editing added). ✓

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `DriveMeta.tags?: string[]` / `notes?: string` (Task 1) are read by `tags.ts` (Task 2), `DriveRow` (Task 3), and `HistoryView` (Task 4). `updateDriveMeta(id, { notes?, tags? })` signature (Task 1) matches its call in `DriveRow.save` (Task 3) and its mock in tests. `HistoryView` Props `onChanged: () => void` (Task 4) matches App's `refreshHistory` (Task 4) and is passed to `DriveRow` (Task 3 prop). `allTags`/`filterDrivesByTags` names identical across Task 2 and Task 4.
