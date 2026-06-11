# Refactor — Remove the Java ingestion service (design)

**Date:** 2026-06-11
**Status:** approved (design) → ready for implementation plan
**Why:** the `ingestion/` Spring Boot app is 195 lines of validate-and-forward — a redundant
pass-through. The Python analysis service already sniffs the same CSV header (`parse_drive`), and nginx
already enforces the upload-size limit. Removing it cuts a JVM container (image + cold start + memory +
a network hop) and stops every new request param having to be plumbed in two languages (feature 8's
`pricePerL` had to touch the Java controller *and* client just to pass through).

## Target architecture

`frontend (nginx)` → `analysis (FastAPI)`. Two services. nginx (the public edge) proxies the API path to
the analysis service; analysis keeps its clean `POST /analyze` + `/health`. No gateway replaces
ingestion (it had no auth/state/orchestration to preserve — the multi-file loop is in the frontend).

## Changes

### 1. nginx — `frontend/nginx.conf`
Replace the ingestion proxy block:
```nginx
    location /api/ {
        proxy_pass http://ingestion:8080;
        proxy_set_header Host $host;
    }
```
with an exact-match route mapping the public path to the analysis route:
```nginx
    location = /api/v1/drives:analyze {
        proxy_pass http://analysis:8000/analyze;
        proxy_set_header Host $host;
        proxy_read_timeout 120s;   # large multipart analyses
    }
```
`client_max_body_size 150M` and the SPA `location /` stay. (`frontend/Dockerfile` already
`COPY nginx.conf /etc/nginx/conf.d/default.conf`, so a frontend image rebuild applies this.)

### 2. Port the validator into FastAPI
Add to `analysis/app/parsing.py`:
```python
def is_supported_layout(content: bytes) -> bool:
    """First-line header check (mirrors the old Java validator): vertical = SECONDS+PID+VALUE+';',
    or horizontal = starts with 'TIME,'."""
    if not content:
        return False
    head = content[:512].decode("latin-1", "ignore")
    first = (head.split("\n", 1)[0]).replace('"', "").upper()
    vertical = "SECONDS" in first and "PID" in first and "VALUE" in first and ";" in first
    horizontal = first.startswith("TIME,") and "," in first
    return vertical or horizontal
```
In `analysis/app/main.py` `analyze`, before `parse_drive`, guard (returns the same rejections the Java
layer gave):
```python
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="empty file")
    if not is_supported_layout(content):
        raise HTTPException(status_code=400, detail="not a supported export (vertical or horizontal CSV)")
    df = parse_drive(content)
```
(Add `from fastapi import HTTPException` and import `is_supported_layout`.) CORS is a non-issue —
same-origin via nginx; analysis is never browser-facing.

### 3. docker-compose — both files
- **`docker-compose.yml`** (dev): delete the `ingestion` service; change `frontend.depends_on` from
  `ingestion` to `analysis: { condition: service_healthy }`. Keep `analysis` `ports: ['8000:8000']`
  (handy for hitting the API directly in dev).
- **`docker-compose.prod.yml`**: delete the `ingestion` service; `frontend.depends_on` → `analysis`;
  update the header comment ("proxies /api to the ingestion service" → "to the analysis service").
  Analysis stays internal (no published port).

### 4. CI — `.github/workflows/build.yml`
Delete the entire `ingestion` job (the `setup-java` + `mvn package` + GHCR push). Keep `analysis` and
`frontend`.

### 5. Delete `ingestion/`
Remove the whole directory (Dockerfile, pom.xml, `.classpath`/`.project`/`.settings/`, `src/main`,
`src/test`, resources).

### 6. README
Architecture: 3 services → 2 (drop the `ingestion/` line). "Run it": remove the `Ingestion API:
http://localhost:18080` line. Adjust any "proxies to ingestion" wording.

## Testing

- **`analysis/tests/test_analyze.py`**: add `empty file → 400` and `unsupported header → 400` (e.g. a
  body of `"hello,world\n1,2"` that is neither vertical nor horizontal); the valid-vertical `→ 200`
  happy path already exists. A direct unit test of `parsing.is_supported_layout` (vertical/horizontal
  true; junk/empty false) is also worth adding.
- The deleted Java tests go with `ingestion/`.
- **No frontend code/test change** — `api.ts` still POSTs `/api/v1/drives:analyze`; nginx now routes it.
- **Manual smoke:** `docker compose up --build` → upload a real CSV via the UI → full report returns,
  with no ingestion container running. Confirm an empty/garbage file shows the error.

## Deployment coordination (the one real risk)

The prod redeploy must apply the **new compose** (no ingestion) together with the **new frontend image**
(its nginx now points at `analysis:8000`). If the new compose is applied while the *old* frontend image
is still live, its nginx targets the now-absent `ingestion:8080` → 502. Sequence: merge → let CI publish
`:latest` for frontend + analysis → then Portainer "Pull and redeploy" the updated stack. The analysis
image change (validation guard) is backward-compatible, so only the frontend image + compose must move
together. The old `ghcr.io/.../hrva-drive-ingestion` package lingers until manually deleted from GHCR
(registry cleanup, not code).

## Out of scope

Analysis-perf levers (memoizing `drive_window`, polars) — a separate effort. Any new API endpoints.
Adding a real gateway (no auth/rate-limit need exists; reintroduce later if one does).
