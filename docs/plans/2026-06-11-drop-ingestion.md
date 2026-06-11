# Remove the Java Ingestion Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the stack to `frontend (nginx) → analysis (FastAPI)` by deleting the redundant Java ingestion pass-through.

**Architecture:** Port the 28-line CSV-header validator into FastAPI so the analysis service is self-sufficient; point the frontend's nginx at the analysis service; drop ingestion from both compose files and CI; delete `ingestion/`. Spec: `docs/specs/2026-06-11-drop-ingestion-design.md`.

**Tech Stack:** Python/FastAPI (pytest) for analysis; nginx + docker-compose + GitHub Actions for infra. Backend pytest from `analysis/` via `.venv/bin/python`.

---

## File structure / change map

- **Modify** `analysis/app/parsing.py` — add `is_supported_layout(content)`.
- **Modify** `analysis/app/main.py` — empty/unsupported → `400` before parsing.
- **Modify** `analysis/tests/test_analyze.py` + add `analysis/tests/test_parsing.py` — guard tests.
- **Modify** `frontend/nginx.conf` — proxy the API path to the analysis service.
- **Modify** `docker-compose.yml`, `docker-compose.prod.yml` — drop `ingestion`; `frontend.depends_on → analysis`.
- **Modify** `.github/workflows/build.yml` — drop the `ingestion` job.
- **Delete** `ingestion/` (whole directory).
- **Modify** `README.md` — 3 services → 2.

Order matters: **Task 1 first** (make analysis self-sufficient), then routing (Task 2), then decommission (Task 3).

---

### Task 1: Port the validator into FastAPI

**Files:**
- Modify: `analysis/app/parsing.py`, `analysis/app/main.py`
- Test: `analysis/tests/test_parsing.py` (create), `analysis/tests/test_analyze.py`

- [ ] **Step 1: Write the failing tests.**

Create `analysis/tests/test_parsing.py`:

```python
from app.parsing import is_supported_layout
from tests.conftest import SYNTHETIC_VERTICAL


def test_is_supported_layout_accepts_vertical():
    assert is_supported_layout(SYNTHETIC_VERTICAL.encode("utf-8")) is True


def test_is_supported_layout_accepts_horizontal():
    assert is_supported_layout(b'TIME,Vehicle speed,Engine RPM\n0,0,800\n') is True


def test_is_supported_layout_rejects_junk_and_empty():
    assert is_supported_layout(b"hello,world\n1,2") is False
    assert is_supported_layout(b"") is False
```

Add to `analysis/tests/test_analyze.py` (it already has `client = TestClient(app)`):

```python
def test_analyze_rejects_empty_file():
    files = {"file": ("e.csv", b"", "text/csv")}
    assert client.post("/analyze", files=files).status_code == 400


def test_analyze_rejects_unsupported_layout():
    files = {"file": ("x.csv", b"hello,world\n1,2", "text/csv")}
    assert client.post("/analyze", files=files).status_code == 400
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_parsing.py tests/test_analyze.py -q`
Expected: FAIL — `is_supported_layout` doesn't exist; the analyze guards return 200 (or error) instead of 400.

- [ ] **Step 3: Add `is_supported_layout` to `analysis/app/parsing.py`** (near the top, after the imports):

```python
def is_supported_layout(content: bytes) -> bool:
    """First-line header check (mirrors the removed Java validator): vertical =
    SECONDS+PID+VALUE+';', or horizontal = starts with 'TIME,'."""
    if not content:
        return False
    head = content[:512].decode("latin-1", "ignore")
    first = head.split("\n", 1)[0].replace('"', "").upper()
    vertical = "SECONDS" in first and "PID" in first and "VALUE" in first and ";" in first
    horizontal = first.startswith("TIME,") and "," in first
    return vertical or horizontal
```

- [ ] **Step 4: Add the guards to `analysis/app/main.py`.**

Change the import line `from fastapi import FastAPI, File, Form, UploadFile` to also import `HTTPException`:

```python
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
```

Add `is_supported_layout` to the parsing import (currently `from app.parsing import parse_drive`):

```python
from app.parsing import is_supported_layout, parse_drive
```

In the `analyze` handler, replace `content = await file.read()` / `df = parse_drive(content)` with the guarded version:

```python
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")
    if not is_supported_layout(content):
        raise HTTPException(status_code=400, detail="not a supported export (vertical or horizontal CSV)")
    df = parse_drive(content)
```

- [ ] **Step 5: Run to verify they pass + full suite**

Run: `cd analysis && .venv/bin/python -m pytest tests/test_parsing.py tests/test_analyze.py -q` → PASS.
Then `cd analysis && .venv/bin/python -m pytest -q` → all green (the existing happy-path analyze test still passes — the synthetic vertical fixture is a supported layout).

- [ ] **Step 6: Commit**

```bash
git add analysis/app/parsing.py analysis/app/main.py analysis/tests/test_parsing.py analysis/tests/test_analyze.py
git commit -m "feat(analysis): reject empty/unsupported uploads (ported from the Java validator)"
```

---

### Task 2: Point the frontend at the analysis service

**Files:**
- Modify: `frontend/nginx.conf`, `docker-compose.yml`, `docker-compose.prod.yml`

- [ ] **Step 1: Repoint nginx.** In `frontend/nginx.conf`, replace the ingestion proxy block:

```nginx
    location /api/ {
        proxy_pass http://ingestion:8080;
        proxy_set_header Host $host;
    }
```

with:

```nginx
    location = /api/v1/drives:analyze {
        proxy_pass http://analysis:8000/analyze;
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }
```

(Leave `listen 80;`, `client_max_body_size 150M;`, and the SPA `location /` block unchanged.)

- [ ] **Step 2: Drop ingestion from `docker-compose.yml` (dev).** Remove the entire `ingestion:` service block, and change the `frontend` service's `depends_on` from:

```yaml
    depends_on:
      ingestion:
        condition: service_healthy
```

to:

```yaml
    depends_on:
      analysis:
        condition: service_healthy
```

(Keep the `analysis` service with `ports: ['8000:8000']`.)

- [ ] **Step 3: Drop ingestion from `docker-compose.prod.yml`.** Remove the entire `ingestion:` service block; change `frontend.depends_on` to `analysis: { condition: service_healthy }` (same as above). In the file's top comment, change "it proxies /api to the ingestion service over the internal network, and the analysis service stays fully internal" to "it proxies /api to the analysis service over the internal network".

- [ ] **Step 4: Validate both compose files parse and no longer reference ingestion**

Run: `docker compose -f docker-compose.yml config -q && docker compose -f docker-compose.prod.yml config -q && echo OK`
Expected: prints `OK` (valid YAML, no errors).
Run: `grep -c ingestion docker-compose.yml docker-compose.prod.yml frontend/nginx.conf`
Expected: `0` for each file.

- [ ] **Step 5: Commit**

```bash
git add frontend/nginx.conf docker-compose.yml docker-compose.prod.yml
git commit -m "refactor(infra): route /api straight to the analysis service; drop ingestion from compose"
```

---

### Task 3: Decommission the Java service

**Files:**
- Modify: `.github/workflows/build.yml`, `README.md`
- Delete: `ingestion/`

- [ ] **Step 1: Remove the ingestion CI job.** In `.github/workflows/build.yml`, delete the entire `ingestion:` job (from `  ingestion:` through the end of its `build-push-action` step, i.e. everything between the `analysis:` job and the `frontend:` job). Keep `analysis:` and `frontend:` intact.

- [ ] **Step 2: Verify the workflow no longer references ingestion**

Run: `grep -c ingestion .github/workflows/build.yml`
Expected: `0`.

- [ ] **Step 3: Delete the Java service.**

```bash
git rm -r ingestion
```

- [ ] **Step 4: Update the README.** In `README.md`, under "Architecture", remove the line:

```
- `ingestion/` — Spring Boot (Java 25): upload, validate, orchestrate
```

Under "Run it", remove the line `- Ingestion API: http://localhost:18080`. If any prose says the frontend proxies to "ingestion", change it to "analysis". (The `> Host ports 3000/8080…` note about the ingestion remap can be deleted too.)

- [ ] **Step 5: Confirm the repo is clean of ingestion references**

Run: `git grep -il ingestion -- ':!docs/' || echo "no ingestion refs outside docs"`
Expected: prints `no ingestion refs outside docs` (the only remaining mentions are in `docs/specs|plans|ROADMAP`, which are historical and fine).

- [ ] **Step 6: Backend suite still green**

Run: `cd analysis && .venv/bin/python -m pytest -q`
Expected: all pass (analysis unaffected by the deletion).

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/build.yml README.md
git commit -m "chore: delete the Java ingestion service + its CI job; README to 2 services"
```

---

### Task 4: Full-stack smoke (manual verification)

**Files:** none (verification only).

- [ ] **Step 1: Build & run the 2-service stack**

Run: `docker compose up --build -d`
Expected: `analysis` and `frontend` start; no `ingestion` container. (`docker compose ps` shows 2 services.)

- [ ] **Step 2: Drive it end-to-end**

Open `http://localhost:8090`, upload a real CSV from `data/exported_records/`. Expected: the full report renders — proving the frontend → nginx → analysis path works with no ingestion. Then upload a junk text file and confirm an error is shown (the 400 guard).

If Docker is unavailable in this environment, state that and rely on: Task 1's passing analyze/parsing tests (the 400 + happy path), the `docker compose config` validation (Task 2), and the nginx exact-location syntax — note the live smoke as the user's pre-deploy check.

- [ ] **Step 3: Tear down**

Run: `docker compose down`

---

## Self-review

**Spec coverage:**
- nginx → analysis exact-location → Task 2 Step 1. ✓
- `is_supported_layout` in parsing + main.py 400 guards → Task 1. ✓
- docker-compose dev + prod (drop ingestion, frontend depends_on analysis, prod comment) → Task 2. ✓
- CI `build.yml` drop ingestion job → Task 3 Step 1. ✓
- Delete `ingestion/` → Task 3 Step 3. ✓
- README 3→2 → Task 3 Step 4. ✓
- Tests (empty/unsupported 400, parsing unit, happy path stays) → Task 1. ✓
- Full-stack smoke + deployment-coordination note → Task 4 (and the spec's deploy section is operator guidance, not code). ✓

**Placeholder scan:** none — every code/config step shows the exact content or the exact block to remove.

**Type/name consistency:** `is_supported_layout(content: bytes) -> bool` is defined in Task 1 (parsing.py) and imported/used in `main.py` (Task 1) and the parsing test (Task 1). The public path `/api/v1/drives:analyze` (nginx, Task 2) matches what the frontend `api.ts` already POSTs (unchanged). The analysis route `/analyze` (nginx proxy target) matches `main.py`'s existing route and the analyze tests.
