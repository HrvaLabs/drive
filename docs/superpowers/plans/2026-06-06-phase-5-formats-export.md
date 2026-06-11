# Phase 5 — Formats & Report Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out input/output: decode the **`.brc` header** for real vehicle identity (VIN + engine/model) shown on the vehicle card, accept the **horizontal CSV layouts** (not just vertical), and add a **report export** (print-to-PDF) of the dashboard.

**Architecture:** Three independent, additive pieces. (A) A Python `.brc` header parser; `/analyze` accepts an optional second file and fills `drive.vehicle`. (B) A horizontal→tidy parser behind a format-sniffing dispatcher, so the existing pipeline runs unchanged on any layout. (C) A print stylesheet + a "Save as PDF" button (native `window.print()`, no new deps). `schemaVersion` stays **"1"**.

**Tech Stack:** Python 3.13 + pandas (analysis) · Java 25 / Spring Boot 4 (ingestion) · React 19 + TS + Vitest (frontend). No new dependencies.

**Scope:** **Phase 5 only** (design §8). Parse the `.brc` **header only** (VIN/nickname/engine string — NOT the proprietary binary records; that stays out of scope). Horizontal layouts (`horizontal_layout`, `horizontal_with_fill_gaps`). Report export = print-to-PDF (PNG via a screenshot lib is an explicit non-goal here). No persistence/history.

**Builds on:** Phases 0–4 on `main`. The analysis service has `parse_vertical`, `build_drive_analysis(df, source, price_per_l)`, and a `Vehicle` model (`label/vin/engine`). Ingestion forwards the upload to analysis; the frontend has a `VehicleCard` already rendering `drive.vehicle`.

**Verified `.brc` structure** (sample `internal_car_scanner.brc`): length-prefixed strings — `u8 len` + bytes. Layout: `[16]"CARSCANNERRECORD"`, `u32 version (LE)`, `u8`+VIN (`TESTVIN0123456789`), `u8`+nickname (`My car`), `u8`+model (`<vehicle model string>`), then binary records (ignored).

---

## Prerequisites

Same as prior phases: `analysis/.venv` (Python 3.13), JDK 25 via `JAVA_HOME="$(/usr/libexec/java_home -v 25)"`, Node 24. `make test` / `make run`. Commit locally per task, **no co-author trailer** (`git@hrva.cc`). Sample files in `data/` (gitignored): `internal_car_scanner.brc`, `horizontal_layout.csv`, `horizontal_with_fill_gaps.csv`, `vertical_layout (1).csv`.

---

## File Structure

```
analysis/app/
├── brc.py           # NEW: parse_brc_header(bytes) -> {vin,label,engine} | None
├── parsing.py       # MODIFY: add parse_horizontal + parse_drive(content) auto-dispatch
├── main.py          # MODIFY: /analyze accepts optional `brc` file + uses parse_drive
└── analysis.py      # MODIFY: build_drive_analysis accepts an optional vehicle override
ingestion/src/main/java/cc/hrva/drive/ingestion/
├── validation/VerticalLayoutValidator.java   # MODIFY: accept horizontal headers too (rename concept -> "supported layout")
└── web/DriveAnalysisController.java           # MODIFY: forward an optional `brc` file
frontend/src/
├── api.ts                         # MODIFY: analyzeDrive(file, brc?)
├── components/VehicleCard.tsx     # MODIFY: show VIN + engine when present
├── print.css                      # NEW: @media print layout
├── App.tsx                        # MODIFY: optional .brc input + "Save as PDF" button + import print.css
└── (tests updated alongside)
```

---

# Part A — `.brc` vehicle identity

## Task A1: `.brc` header parser

**Files:** Create `analysis/app/brc.py`, `analysis/tests/test_brc.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_brc.py`

```python
from app import brc


def _lp(s: bytes) -> bytes:
    return bytes([len(s)]) + s


def _make_brc() -> bytes:
    return (_lp(b"CARSCANNERRECORD") + (2).to_bytes(4, "little")
            + _lp(b"TESTVIN0123456789") + _lp(b"My car")
            + _lp(b"Test Engine 1.0L") + b"\x0e\x42binaryrest")


def test_parse_brc_header():
    v = brc.parse_brc_header(_make_brc())
    assert v == {"vin": "TESTVIN0123456789", "label": "My car",
                 "engine": "Test Engine 1.0L"}


def test_parse_brc_rejects_non_brc():
    assert brc.parse_brc_header(b"not a brc file at all") is None
    assert brc.parse_brc_header(b"") is None
```

- [ ] **Step 2: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_brc.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.brc'`.

- [ ] **Step 3: Create `analysis/app/brc.py`**

```python
_MAGIC = "CARSCANNERRECORD"


def _read_lp(data: bytes, i: int) -> tuple[str, int]:
    """Read a u8-length-prefixed latin-1 string; returns (text, next_index)."""
    n = data[i]
    i += 1
    return data[i:i + n].decode("latin-1"), i + n


def parse_brc_header(content: bytes) -> dict | None:
    """Parse the Car Scanner .brc header for vehicle identity. Returns
    {vin, label, engine} or None if it isn't a .brc. Only the header is read —
    the proprietary binary records are intentionally ignored."""
    try:
        i = 0
        magic, i = _read_lp(content, i)
        if magic != _MAGIC:
            return None
        i += 4  # u32 version (little-endian) — skip
        vin, i = _read_lp(content, i)
        label, i = _read_lp(content, i)
        engine, i = _read_lp(content, i)
        return {"vin": vin, "label": label, "engine": engine}
    except (IndexError, UnicodeDecodeError):
        return None
```

- [ ] **Step 4: Run it, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_brc.py -q`
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/brc.py analysis/tests/test_brc.py
git commit -m "feat(analysis): parse .brc header for vehicle identity (VIN/label/engine)"
```

---

## Task A2: `/analyze` accepts an optional `.brc` and fills the vehicle

**Files:** Modify `analysis/app/analysis.py`, `analysis/app/main.py`, `analysis/tests/test_analyze.py`

- [ ] **Step 1: Make `build_drive_analysis` accept a vehicle override** — in `analysis/app/analysis.py`, change the signature and the `Vehicle(...)` construction.

Change the signature:
```python
def build_drive_analysis(df: pd.DataFrame, source: str, price_per_l: float | None,
                         vehicle: dict | None = None) -> DriveAnalysis:
```
Replace the existing `vehicle=Vehicle(label="My car")` inside the `Drive(...)` with:
```python
            vehicle=Vehicle(**vehicle) if vehicle else Vehicle(label="My car"),
```

- [ ] **Step 2: Write the failing test** — append to `analysis/tests/test_analyze.py`

```python
def test_analyze_uses_brc_vehicle():
    def lp(s):
        return bytes([len(s)]) + s
    brc = (lp(b"CARSCANNERRECORD") + (2).to_bytes(4, "little")
           + lp(b"TESTVIN0123456789") + lp(b"My car") + lp(b"Test Engine"))
    files = {"file": ("drive.csv", SYNTHETIC_VERTICAL.encode("utf-8"), "text/csv"),
             "brc": ("car.brc", brc, "application/octet-stream")}
    r = client.post("/analyze", files=files, data={"format": "vertical_layout"})
    assert r.status_code == 200
    v = r.json()["drive"]["vehicle"]
    assert v["vin"] == "TESTVIN0123456789"
    assert v["engine"] == "Test Engine"
```

- [ ] **Step 3: Run it, watch it fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_analyze.py -q`
Expected: FAIL — `/analyze` ignores the `brc` file; `vin` is `None`.

- [ ] **Step 4: Update `analysis/app/main.py`** — accept the optional `brc` file and pass the parsed vehicle through. Replace the `analyze` handler:

```python
from fastapi import FastAPI, File, Form, UploadFile

from app import brc as brc_mod
from app.analysis import build_drive_analysis
from app.models import DriveAnalysis
from app.parsing import parse_vertical

app = FastAPI(title="HrvaDrive Analysis")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=DriveAnalysis)
async def analyze(
    file: UploadFile = File(...),
    format: str = Form("vertical_layout"),
    pricePerL: float | None = Form(None),
    brc: UploadFile | None = File(None),
) -> DriveAnalysis:
    content = await file.read()
    df = parse_vertical(content)
    vehicle = brc_mod.parse_brc_header(await brc.read()) if brc is not None else None
    return build_drive_analysis(df, source=format, price_per_l=pricePerL, vehicle=vehicle)
```

> Note: `parse_vertical` is swapped for the auto-dispatching `parse_drive` in Task B1; until then keep `parse_vertical` here.

- [ ] **Step 5: Run the analysis suite, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/analysis.py analysis/app/main.py analysis/tests/test_analyze.py
git commit -m "feat(analysis): /analyze accepts an optional .brc and fills the vehicle"
```

---

## Task A3: Ingestion forwards the optional `.brc`

**Files:** Modify `ingestion/.../web/DriveAnalysisController.java`, `ingestion/.../analysis/AnalysisClient.java`, `ingestion/.../web/DriveAnalysisControllerTest.java`

- [ ] **Step 1: Add a failing controller test** — append inside `DriveAnalysisControllerTest`:

```java
    @org.junit.jupiter.api.Test
    void forwardsOptionalBrcFile() throws Exception {
        given(analysisClient.analyze(any(), eq("vertical_layout"), isNull(), any()))
                .willReturn("{\"schemaVersion\":\"1\"}");
        final org.springframework.web.multipart.MultipartFile file =
                new org.springframework.mock.web.MockMultipartFile("file", "d.csv", "text/csv",
                        "\"SECONDS\";\"PID\";\"VALUE\"\n\"1\";\"x\";\"0\"".getBytes());
        final org.springframework.web.multipart.MultipartFile brc =
                new org.springframework.mock.web.MockMultipartFile("brc", "c.brc",
                        "application/octet-stream", new byte[]{1, 2, 3});
        final org.springframework.http.ResponseEntity<String> r =
                controller.analyze(file, "vertical_layout", null, brc);
        assertThat(r.getStatusCode()).isEqualTo(org.springframework.http.HttpStatus.OK);
    }
```

Also update the EXISTING tests for the now-4-arg method: (1) pass a 4th `null` to every `controller.analyze(file, "vertical_layout", null)` call → `controller.analyze(file, "vertical_layout", null, null)`; and (2) widen the existing Mockito stub in `forwardsUploadAndReturnsAnalysisJson` to four matchers → `given(analysisClient.analyze(any(), eq("vertical_layout"), isNull(), any()))`.

- [ ] **Step 2: Run it, watch it fail**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn -Dtest=DriveAnalysisControllerTest test`
Expected: FAIL — `analyze` takes 3 args / `AnalysisClient.analyze` takes 3 args (compile error).

- [ ] **Step 3: Update `AnalysisClient.java`** — add an optional `brc` part. Change the `analyze` signature and add the part:

```java
    public String analyze(final MultipartFile file, final String format, final String pricePerL,
                          final MultipartFile brc) throws IOException {
        final Resource fileResource = new ByteArrayResource(file.getBytes()) {
            @Override
            public String getFilename() {
                return file.getOriginalFilename();
            }
        };

        final MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", fileResource);
        body.add("format", format);
        if (pricePerL != null) {
            body.add("pricePerL", pricePerL);
        }
        if (brc != null && !brc.isEmpty()) {
            final Resource brcResource = new ByteArrayResource(brc.getBytes()) {
                @Override
                public String getFilename() {
                    return brc.getOriginalFilename();
                }
            };
            body.add("brc", brcResource);
        }

        return restClient.post()
                .uri("/analyze")
                .body(body)
                .retrieve()
                .body(String.class);
    }
```

- [ ] **Step 4: Update `DriveAnalysisController.java`** — accept and forward the optional `brc`:

Change the method signature to add the param, and pass it to the client:
```java
    public ResponseEntity<String> analyze(
            @RequestParam("file") final MultipartFile file,
            @RequestParam(value = "format", defaultValue = "vertical_layout") final String format,
            @RequestParam(value = "pricePerL", required = false) final String pricePerL,
            @RequestParam(value = "brc", required = false) final MultipartFile brc)
            throws IOException {
```
and change the forward call to:
```java
        final String analysisJson = analysisClient.analyze(file, format, pricePerL, brc);
```

- [ ] **Step 5: Run the ingestion suite, watch it pass**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn test`
Expected: PASS (validator + controller, BUILD SUCCESS).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add ingestion/
git commit -m "feat(ingestion): forward an optional .brc file to analysis"
```

---

# Part B — Horizontal layout support

## Task B1: Horizontal parser + auto-dispatch

**Files:** Modify `analysis/app/parsing.py`, `analysis/tests/test_parsing.py`

- [ ] **Step 1: Write the failing tests** — append to `analysis/tests/test_parsing.py`

```python
def test_parse_horizontal_melts_to_tidy():
    content = (
        'time,"Engine RPM (rpm)","Vehicle speed (km/h)",Latitude,Longtitude\n'
        '16:08:58.437,800,0,45.0,15.0\n'
        '16:08:59.000,2000,30,45.001,15.001\n'
    ).encode("utf-8")
    df = parse_horizontal(content)
    assert set(df.columns) == {"t", "pid", "value", "unit", "lat", "lon"}
    # unit stripped from the column name into its own field
    rpm = df[df["pid"] == "Engine RPM"]
    assert rpm["unit"].iloc[0] == "rpm"
    assert rpm["value"].tolist() == [800.0, 2000.0]
    # time -> seconds since midnight (16:08:58.437)
    assert abs(df["t"].min() - (16 * 3600 + 8 * 60 + 58.437)) < 0.01
    # lat/lon carried per row; Latitude/Longtitude are NOT PID rows
    assert "Latitude" not in set(df["pid"])
    assert df[df["pid"] == "Vehicle speed"]["lon"].iloc[-1] == 15.001


def test_parse_drive_dispatches_by_header():
    vertical = ('"SECONDS";"PID";"VALUE";"UNITS";"LATITUDE";"LONGTITUDE";\n'
                '"100.0";"Vehicle speed";"5";"km/h";"45";"15";\n').encode("utf-8")
    horizontal = ('time,"Vehicle speed (km/h)",Latitude,Longtitude\n'
                  '16:00:00.000,5,45,15\n').encode("utf-8")
    assert parse_drive(vertical)["pid"].iloc[0] == "Vehicle speed"
    assert parse_drive(horizontal)["pid"].iloc[0] == "Vehicle speed"
```

- [ ] **Step 2: Run, watch fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_parsing.py -q`
Expected: FAIL — `parse_horizontal` / `parse_drive` not defined.

- [ ] **Step 3: Add to `analysis/app/parsing.py`** — the horizontal parser + dispatcher (add `import re` at the top):

```python
import re

_UNIT_RE = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")


def _clock_to_seconds(value: str) -> float | None:
    try:
        h, m, rest = value.split(":")
        return int(h) * 3600 + int(m) * 60 + float(rest)
    except (ValueError, AttributeError):
        return None


def parse_horizontal(content: bytes) -> pd.DataFrame:
    """Wide layout (time + one column per PID, units in the header) -> tidy rows.
    PID column names like 'Engine RPM (rpm)' split into pid 'Engine RPM' + unit 'rpm'
    so they match the vertical PID names."""
    raw = pd.read_csv(io.BytesIO(content), dtype=str)
    raw.columns = [str(c).strip().strip('"') for c in raw.columns]
    time_col = raw.columns[0]
    t = raw[time_col].map(_clock_to_seconds)
    lat_col = next((c for c in raw.columns if c.lower() == "latitude"), None)
    lon_col = next((c for c in raw.columns if c.lower() in ("longtitude", "longitude")), None)
    lat = pd.to_numeric(raw[lat_col], errors="coerce") if lat_col else pd.Series([float("nan")] * len(raw))
    lon = pd.to_numeric(raw[lon_col], errors="coerce") if lon_col else pd.Series([float("nan")] * len(raw))

    skip = {time_col, lat_col, lon_col}
    frames = []
    for col in raw.columns:
        if col in skip:
            continue
        match = _UNIT_RE.match(col)
        pid, unit = (match.group(1), match.group(2)) if match else (col, "")
        sub = pd.DataFrame({"t": t, "pid": pid,
                            "value": pd.to_numeric(raw[col], errors="coerce"),
                            "unit": unit, "lat": lat, "lon": lon})
        frames.append(sub.dropna(subset=["value"]))
    cols = ["t", "pid", "value", "unit", "lat", "lon"]
    df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame(columns=cols)
    return df.dropna(subset=["t"]).sort_values("t").reset_index(drop=True)


def parse_drive(content: bytes) -> pd.DataFrame:
    """Auto-detect the layout from the header and parse to the tidy form."""
    head = content[:300].decode("latin-1", "ignore")
    first_line = head.splitlines()[0] if head else ""
    if ";" in first_line and "SECONDS" in first_line.upper():
        return parse_vertical(content)
    return parse_horizontal(content)
```

- [ ] **Step 4: Run, watch pass**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_parsing.py -q`
Expected: PASS (all parsing tests).

- [ ] **Step 5: Use the dispatcher in `analysis/app/main.py`** — change the import and the call:
```python
from app.parsing import parse_drive
```
and in `analyze`:
```python
    df = parse_drive(content)
```

- [ ] **Step 6: Run the full analysis suite, watch it pass**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/app/parsing.py analysis/app/main.py analysis/tests/test_parsing.py
git commit -m "feat(analysis): horizontal-layout parser + format auto-dispatch"
```

---

## Task B2: Ingestion accepts horizontal uploads

**Files:** Modify `ingestion/.../validation/VerticalLayoutValidator.java`, its test

- [ ] **Step 1: Add a failing test** — append to `VerticalLayoutValidatorTest`:

```java
    @Test
    void acceptsTheHorizontalHeader() {
        final byte[] content = "time,\"Engine RPM (rpm)\",\"Vehicle speed (km/h)\",Latitude,Longtitude\n".getBytes();
        assertThat(validator.isSupportedLayout(content)).isTrue();
    }
```
And rename the existing assertions from `isVerticalLayout` to `isSupportedLayout` in this test file (the method is being generalised). The `rejectsTheHorizontalHeader` test from Phase 1 is now WRONG (horizontal is supported) — change it to reject genuinely-unsupported content instead:
```java
    @Test
    void rejectsUnsupportedContent() {
        assertThat(validator.isSupportedLayout("just some random text\n".getBytes())).isFalse();
    }
```

- [ ] **Step 2: Run, watch fail**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn -Dtest=VerticalLayoutValidatorTest test`
Expected: FAIL — no `isSupportedLayout`.

- [ ] **Step 3: Update `VerticalLayoutValidator.java`** — add `isSupportedLayout` (keep `isVerticalLayout` delegating for compatibility):

```java
    public boolean isSupportedLayout(final byte[] content) {
        if (content == null || content.length == 0) {
            return false;
        }
        final int end = Math.min(content.length, 512);
        final String head = new String(content, 0, end, StandardCharsets.UTF_8);
        final int newline = head.indexOf('\n');
        final String firstLine = (newline >= 0 ? head.substring(0, newline) : head)
                .replace("\"", "").toUpperCase();
        final boolean vertical = firstLine.contains("SECONDS") && firstLine.contains("PID")
                && firstLine.contains("VALUE") && firstLine.contains(";");
        final boolean horizontal = firstLine.startsWith("TIME,") && firstLine.contains(",");
        return vertical || horizontal;
    }

    public boolean isVerticalLayout(final byte[] content) {
        return isSupportedLayout(content);
    }
```

Update `DriveAnalysisController` to call `validator.isSupportedLayout(content)` and adjust the 400 message to "not a supported export (vertical or horizontal CSV)".

- [ ] **Step 4: Run the ingestion suite, watch it pass**

Run: `cd ingestion && JAVA_HOME="$(/usr/libexec/java_home -v 25)" mvn test`
Expected: PASS, BUILD SUCCESS.

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add ingestion/
git commit -m "feat(ingestion): accept horizontal-layout uploads too"
```

---

# Part C — Report export + vehicle card + frontend wiring

## Task C1: VehicleCard shows VIN + engine

**Files:** Modify `frontend/src/components/VehicleCard.tsx`, its test

- [ ] **Step 1: Add a failing test** — append to `VehicleCard.test.tsx`:

```tsx
it('shows VIN and engine when present', () => {
  const d = { source: 'vertical_layout', startedAtClock: '16:08:58.438', durationSeconds: 1800,
              vehicle: { label: 'My car', vin: 'TESTVIN0123456789', engine: 'Test Engine 1.0L' } };
  const dq = { rowCount: 10, pidsPresent: ['Vehicle speed'], distanceSource: 'odometer', warnings: [] };
  render(<VehicleCard drive={d} dataQuality={dq} />);
  expect(screen.getByText(/Test Engine/)).toBeInTheDocument();
  expect(screen.getByText(/TESTVIN0123456789/)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- VehicleCard`
Expected: FAIL — VIN not rendered (and engine only shows if non-null, which it does, but VIN line is missing).

- [ ] **Step 3: Update `frontend/src/components/VehicleCard.tsx`** — add a VIN line:

```tsx
import type { DriveAnalysis } from '../types';

interface Props {
  drive: DriveAnalysis['drive'];
  dataQuality: DriveAnalysis['dataQuality'];
}

export default function VehicleCard({ drive, dataQuality }: Props) {
  const engine = drive.vehicle.engine ? ` · ${drive.vehicle.engine}` : '';
  return (
    <section style={{ background: '#f4f4f5', borderRadius: 8, padding: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 16 }}>{drive.vehicle.label ?? 'Vehicle'}{engine}</div>
      {drive.vehicle.vin && (
        <div style={{ fontSize: 12, color: '#71717a', fontFamily: 'monospace' }}>VIN {drive.vehicle.vin}</div>
      )}
      <div style={{ color: '#71717a', fontSize: 13 }}>
        {dataQuality.pidsPresent.length} signals · distance from {dataQuality.distanceSource}
        {drive.startedAtClock ? ` · started ${drive.startedAtClock.slice(0, 8)}` : ''}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- VehicleCard` (expect 2).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/components/VehicleCard.tsx frontend/src/components/VehicleCard.test.tsx
git commit -m "feat(frontend): VehicleCard shows VIN + engine"
```

---

## Task C2: API client sends an optional `.brc`

**Files:** Modify `frontend/src/api.ts`, `frontend/src/api.test.ts`

- [ ] **Step 1: Add a failing test** — append to `frontend/src/api.test.ts`:

```ts
it('attaches the optional .brc file', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) } as Response);
  globalThis.fetch = fetchMock;
  const drive = new File(['x'], 'd.csv');
  const brc = new File([new Uint8Array([1, 2, 3])], 'c.brc');
  await analyzeDrive(drive, brc);
  const body = fetchMock.mock.calls[0][1].body as FormData;
  expect(body.get('brc')).toBeInstanceOf(File);
});
```

- [ ] **Step 2: Run, watch fail**

Run: `cd frontend && npm test -- api`
Expected: FAIL — `analyzeDrive` takes one arg / no `brc` in the body.

- [ ] **Step 3: Update `frontend/src/api.ts`**

```ts
import type { DriveAnalysis } from './types';

export async function analyzeDrive(file: File, brc?: File | null): Promise<DriveAnalysis> {
  const form = new FormData();
  form.append('file', file);
  form.append('format', 'vertical_layout');
  if (brc) {
    form.append('brc', brc);
  }
  const res = await fetch('/api/v1/drives:analyze', { method: 'POST', body: form });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as DriveAnalysis;
}
```

- [ ] **Step 4: Run, watch pass**

Run: `cd frontend && npm test -- api` (expect 3).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/api.ts frontend/src/api.test.ts
git commit -m "feat(frontend): analyzeDrive sends an optional .brc file"
```

---

## Task C3: Print-to-PDF + optional `.brc` input in App

**Files:** Create `frontend/src/print.css`; modify `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

- [ ] **Step 1: Create `frontend/src/print.css`**

```css
@media print {
  .no-print { display: none !important; }
  main { max-width: 100% !important; padding: 0 !important; }
  section { break-inside: avoid; }
}
```

- [ ] **Step 2: Add failing assertions to `frontend/src/App.test.tsx`** — after the existing dashboard assertions:

```tsx
    // an optional .brc input and a Save-as-PDF button are present once analysed
    expect(screen.getByLabelText('vehicle file')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save as pdf/i })).toBeInTheDocument();
```

- [ ] **Step 3: Run, watch fail**

Run: `cd frontend && npm test -- App`
Expected: FAIL — no vehicle-file input / Save-as-PDF button.

- [ ] **Step 4: Update `frontend/src/App.tsx`**

(a) add `import './print.css';` at the top (after the other imports).
(b) add a `brc` state: `const [brc, setBrc] = useState<File | null>(null);`
(c) pass it to the API: `setAnalysis(await analyzeDrive(file, brc));`
(d) add the optional `.brc` input next to the drive input (give the upload row the class `no-print`):
```tsx
      <div className="no-print">
        <input type="file" aria-label="drive file" accept=".csv"
               onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <input type="file" aria-label="vehicle file" accept=".brc" style={{ marginLeft: 8 }}
               onChange={(e) => setBrc(e.target.files?.[0] ?? null)} />
        <button onClick={onAnalyze} disabled={!file || phase === 'loading'} style={{ marginLeft: 8 }}>
          {phase === 'loading' ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>
```
(e) add a "Save as PDF" button in the header's view-toggle group (only when `analysis` exists), and give that group the class `no-print`:
```tsx
        {analysis && (
          <div role="group" aria-label="view" className="no-print">
            <button onClick={() => setView('friendly')} disabled={view === 'friendly'}>Friendly</button>
            <button onClick={() => setView('expert')} disabled={view === 'expert'} style={{ marginLeft: 4 }}>Expert</button>
            <button onClick={() => window.print()} style={{ marginLeft: 12 }}>Save as PDF</button>
          </div>
        )}
```

- [ ] **Step 5: Run the whole frontend suite + build, watch pass**

Run: `cd frontend && npm test` then `cd frontend && rm -rf dist && npm run build 2>&1 | tail -3 && ls dist/index.html`
Expected: all pass; build clean. (`window.print` exists in jsdom as a no-op; clicking it in the test is fine but the test only checks the button is present.)

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/print.css frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): optional .brc upload + Save-as-PDF (print) export"
```

---

# Part D — Integration

## Task D1: Full-stack across all formats + .brc

**Files:** none (verification)

- [ ] **Step 1: Bring the stack up** — `cd /Users/karlo/Developer/hrva-drive && make run`

- [ ] **Step 2: Vertical + .brc → real vehicle**

```bash
cd /Users/karlo/Developer/hrva-drive
curl -s --retry 60 --retry-all-errors --retry-connrefused --retry-delay 1 \
  -F "file=@data/vertical_layout (1).csv" -F "format=vertical_layout" -F "brc=@data/internal_car_scanner.brc" \
  http://localhost:8090/api/v1/drives:analyze \
  | python3 -c "import sys,json; v=json.load(sys.stdin)['drive']['vehicle']; print('vehicle', v)"
```
Expected: `drive.vehicle` populated with the decoded `label`, `vin`, and `engine` from the real `.brc` (real values not reproduced here).

- [ ] **Step 3: Horizontal layout → a valid summary**

```bash
cd /Users/karlo/Developer/hrva-drive
curl -s -F "file=@data/horizontal_layout.csv" -F "format=horizontal_layout" \
  http://localhost:8090/api/v1/drives:analyze \
  | python3 -c "import sys,json; b=json.load(sys.stdin); s=b['summary']; print('rows', b['dataQuality']['rowCount'], 'distKm', s['distanceKm'], 'maxSpeed', s['maxSpeedKmh'], 'signals', len(b['signals']))"
```
Expected: a non-zero `rowCount`, a plausible `distanceKm`/`maxSpeed`, and signals present — i.e. the horizontal file analyses just like the vertical one (it's the same drive).

- [ ] **Step 4: Eyeball** — open http://localhost:8090, upload the vertical CSV + the `.brc`; the vehicle card shows the decoded VIN + engine string; click **Save as PDF** → the browser print dialog opens with the upload controls hidden.

- [ ] **Step 5: Tear down** — `make stop`

---

## Phase 5 acceptance

- `make test` — analysis (incl. `test_brc`, horizontal parsing tests), ingestion (supported-layout), frontend (VehicleCard VIN, api .brc, App PDF) all green.
- Uploading a `.brc` alongside a drive shows the real VIN + engine on the vehicle card; horizontal CSVs analyse identically to vertical; **Save as PDF** prints a clean report (controls hidden).
- `schemaVersion` still `"1"`. `.brc` binary records remain unparsed (only the header).

## Self-review notes (done while writing)

- **Spec coverage (design §8 Phase 5):** `.brc` header → vehicle (A1–A3, C1), horizontal layouts (B1–B2), report export (C3). PNG-via-screenshot intentionally excluded; binary `.brc` records excluded.
- **Contract additive:** `drive.vehicle` already exists (vin/engine were always nullable); no schema change. `build_drive_analysis` gains an optional `vehicle` arg; `analyzeDrive`/`AnalysisClient.analyze`/controller gain an optional `brc` (existing callers updated to pass `null`/omit).
- **Consistency:** `parse_brc_header` (A1) used by main (A2); `build_drive_analysis(..., vehicle=)` (A2) ; `parse_drive` (B1) used by main (B1 step 5); `AnalysisClient.analyze(file, format, price, brc)` (A3) matches the controller (A3) and its test (4-arg). Horizontal pid names are unit-stripped to match the vertical/`metrics.series` names.
- **Cross-task note:** A2 temporarily wires `parse_vertical` in main; B1 step 5 swaps it to `parse_drive`. If executing Part A alone, that's fine (vertical still parses).
- **No placeholders:** every code/command step is complete and runnable.
```
