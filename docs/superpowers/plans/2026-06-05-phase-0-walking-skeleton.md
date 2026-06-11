# Phase 0 — Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the three services (React frontend, Spring Boot ingestion, Python FastAPI analysis) so that uploading a file in the browser flows Frontend → Spring → Python and back, all running under one `docker compose up`, with GitHub Actions building and pushing all three images to ghcr.io.

**Architecture:** A monorepo with three independently-built services on one Docker network. The analysis service returns a **stubbed** `DriveAnalysis` (real schema, placeholder values) so the contract and the full round-trip are proven before any real analysis exists (that lands in Phase 1). Spring owns the HTTP boundary and forwards uploads to Python; the frontend talks only to Spring.

**Tech Stack:** React 19 + Vite + TypeScript + Vitest · Java 25 + Spring Boot 4.0.6 + Maven · Python 3.12 + FastAPI + pytest · Docker Compose · GitHub Actions → ghcr.io.

**Scope:** This is **Phase 0 only** (per `docs/superpowers/specs/2026-06-05-hrva-drive-design.md` §8–§9). Do **not** implement real analysis, charts, maps, tips, or extra formats here — those are Phase 1+. Phase 1 gets its own plan written against the scaffolding this plan creates.

---

## Execution outcome (2026-06-05) — read before trusting the snippets below

Phase 0 was **executed and verified end-to-end**: a real sample upload flowed nginx → Spring → Python and returned a stub `DriveAnalysis` with `rowCount: 34686` (the actual line count of `horizontal_layout.csv`). All three test suites pass. **The committed code is authoritative;** several snippets below were corrected during execution (see git history):

- **Spring Boot 4.0 moved the test slices:** `@WebMvcTest` is no longer in `spring-boot-starter-test` (the 4.0.6 `test-autoconfigure` jar ships only `JsonTest`). Task 6 uses a **pure unit test** of the controller; routing is covered by the Task 11 round-trip.
- **`RestClient.Builder` is not auto-configured in Boot 4.0** without the restclient module. `AnalysisClient` builds its client via `RestClient.builder()` + `JdkClientHttpRequestFactory`.
- **Multipart forward fixes:** force **HTTP/1.1** (the JDK client's h2c upgrade breaks uvicorn) and **do not set `Content-Type` explicitly** (that omits the multipart boundary → server parses zero parts → HTTP 422).
- **nginx:** added `client_max_body_size 150M` (the 1MB default rejects the 7–26MB uploads).
- **Ports:** host `3000`/`8080` were occupied, so compose publishes **frontend `8090`**, **ingestion `18080`**, analysis `8000`.
- **Toolchain:** built with **JDK 25** (`/usr/libexec/java_home -v 25`) and **Python 3.13** (`python3.13`); frontend image uses `node:24-alpine`.
- **Smoke tests:** `sleep`-based waits replaced with `curl --retry N --retry-all-errors --retry-connrefused --retry-delay 1` (published ports accept-then-reset during startup).
- Frontend test uses `globalThis.fetch` (not `global`) so `tsc -b` passes.

---

## Prerequisites (verify once, before Task 1)

Run each and confirm it prints a version:

```bash
docker --version          # Docker with Compose v2
java -version             # must be 25
mvn -version              # Maven 3.9+
node --version            # 20 or 22+
python3 --version         # 3.12+
```

**Local toolchain selection (this machine):** the default `java` is 21 and `python3` is 3.9, but JDK 25 and Python 3.13 are installed. Use them explicitly:
- Maven builds: prefix with `JAVA_HOME="$(/usr/libexec/java_home -v 25)"` (or `sdk use java 25-tem`).
- Analysis venv: create with `python3.13 -m venv .venv` and call `.venv/bin/python` / `.venv/bin/pytest` directly (shell `source` doesn't persist across separate command invocations).

**Git & commits:** This plan commits locally after each task. It does **not** push. The final task documents how to push to trigger CI — do that only when you (the human) have created the GitHub repo and are ready. Never `git push` without explicit confirmation.

**Reference repo to mirror:** `../url-shortener` — proven Java 25 + Maven + `eclipse-temurin:25-jdk` Dockerfile + GitHub Actions ghcr pattern.

---

## File Structure

```
hrva-drive/
├── AGENTS.md                         # session orientation → points to design doc + this plan
├── README.md                         # quickstart: docker compose up
├── .gitignore
├── docker-compose.yml                # 3 services, one network, healthchecks
├── .github/workflows/build.yml       # build+push 3 images to ghcr.io
├── docs/superpowers/                 # spec + plans (already exist)
├── data/                             # sample exports (gitignored; kept locally)
│
├── analysis/                         # Python FastAPI — analysis engine
│   ├── app/__init__.py
│   ├── app/main.py                   # FastAPI app: GET /health, POST /analyze (stub)
│   ├── app/models.py                 # Pydantic DriveAnalysis schema (v1, per spec §7)
│   ├── tests/__init__.py
│   ├── tests/test_health.py
│   ├── tests/test_analyze_stub.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── ingestion/                        # Spring Boot — HTTP boundary + orchestration
│   ├── pom.xml
│   ├── Dockerfile
│   ├── src/main/resources/application.yml
│   ├── src/main/java/cc/hrva/drive/ingestion/
│   │   ├── IngestionApplication.java
│   │   ├── analysis/AnalysisClient.java            # calls Python /analyze and /health
│   │   └── web/
│   │       ├── DriveAnalysisController.java         # POST /api/v1/drives:analyze
│   │       └── HealthController.java                # GET /api/health
│   └── src/test/java/cc/hrva/drive/ingestion/web/
│       └── DriveAnalysisControllerTest.java
│
└── frontend/                         # React + Vite + TS
    ├── package.json
    ├── vite.config.ts
    ├── index.html
    ├── nginx.conf                    # prod: proxy /api → ingestion
    ├── Dockerfile
    └── src/
        ├── main.tsx
        ├── App.tsx                   # upload → analyze → show JSON + health badge
        ├── App.test.tsx
        └── setupTests.ts
```

Each service has one responsibility and is built/tested in isolation; `docker-compose.yml` and the round-trip test (Task 11) are what tie them together.

---

## Task 1: Repo bootstrap (structure, git, ignore, README, AGENTS.md)

**Files:**
- Create: `/Users/karlo/Developer/hrva-drive/.gitignore`
- Create: `/Users/karlo/Developer/hrva-drive/README.md`
- Create: `/Users/karlo/Developer/hrva-drive/AGENTS.md`

- [ ] **Step 1: Ensure a clean git repo**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
git rev-parse --is-inside-work-tree 2>/dev/null || git init
git status --short
```
Expected: a git repo exists (init if it didn't). Untracked files may include `data/`, `.idea/`, `docs/`.

- [ ] **Step 2: Create `.gitignore`**

```gitignore
# Java / Maven
target/
*.jar
!.mvn/wrapper/maven-wrapper.jar

# Node
node_modules/
dist/
*.local

# Python
__pycache__/
*.pyc
.venv/
.pytest_cache/

# IDE / OS
.idea/
.DS_Store

# Large sample data (kept locally, not committed)
data/*.csv
data/*.brc
```

- [ ] **Step 3: Create `README.md`**

```markdown
# HrvaDrive

Upload an OBD2 drive log (from the Car Scanner ELM OBD2 app), get back a clear
drive report: summary, map, graphs, driving profile, eco/economy tips, and
engine health.

## Architecture
- `frontend/` — React + Vite SPA (the dashboard)
- `ingestion/` — Spring Boot (Java 25): upload, validate, orchestrate
- `analysis/` — Python FastAPI: the analysis engine (pandas/numpy)

## Run it
```bash
docker compose up --build
```
- Frontend: http://localhost:3000
- Ingestion API: http://localhost:8080
- Analysis API: http://localhost:8000

## Docs
- Design (single source of truth): `docs/superpowers/specs/2026-06-05-hrva-drive-design.md`
- Plans: `docs/superpowers/plans/`
```

- [ ] **Step 4: Create `AGENTS.md` (orientation for every Claude Code session)**

```markdown
# AGENTS.md — start here

This project is built across multiple sessions. Before writing code:

1. **Read the design doc:** `docs/superpowers/specs/2026-06-05-hrva-drive-design.md`.
   It is the single source of truth — goal, data model, architecture, the
   inter-service API contract (§7), the shared analysis definitions (§6), and
   the phased roadmap (§8).
2. **Only implement the phase you're asked for.** v1 = Phase 0 + Phase 1.
   Don't pull later-phase features forward.
3. **The API contract (spec §7) is the law.** Spring and Python are built
   separately; change the contract in the spec first, then code.
4. **Compute metrics exactly as spec §6 defines them** so results are
   consistent across sessions.

## Services
- `frontend/` — React + Vite + TS. `npm run dev`, `npm test`. Talks only to ingestion.
- `ingestion/` — Spring Boot 4 / Java 25 / Maven. `mvn test`. Owns HTTP + orchestration.
- `analysis/` — Python 3.12 / FastAPI. `pytest`. Pure analysis, no web/persistence.

## Run everything
`docker compose up --build` (frontend :3000, ingestion :8080, analysis :8000)

## Conventions
- Java group: `cc.hrva.drive`. Mirror `../url-shortener` for Java/Docker/CI.
- v1 is stateless: no database.
- Friendly-by-default UI with an expert/debug layer (see spec §1).
```

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add .gitignore README.md AGENTS.md docs/
git commit -m "chore: bootstrap repo structure and docs"
```

---

## Task 2: Analysis service — FastAPI app + `/health`

**Files:**
- Create: `analysis/requirements.txt`
- Create: `analysis/app/__init__.py`, `analysis/app/main.py`
- Create: `analysis/tests/__init__.py`, `analysis/tests/test_health.py`

- [ ] **Step 1: Create `analysis/requirements.txt`**

```
fastapi~=0.115
uvicorn[standard]~=0.34
python-multipart~=0.0.9
pytest~=8.3
httpx~=0.28
```

- [ ] **Step 2: Create empty package markers**

```bash
mkdir -p analysis/app analysis/tests
touch analysis/app/__init__.py analysis/tests/__init__.py
```

- [ ] **Step 3: Write the failing test** — `analysis/tests/test_health.py`

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 4: Run it and watch it fail**

Run:
```bash
cd analysis && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
python -m pytest tests/test_health.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 5: Create `analysis/app/main.py` (minimal)**

```python
from fastapi import FastAPI

app = FastAPI(title="HrvaDrive Analysis")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

- [ ] **Step 6: Run it and watch it pass**

Run: `cd analysis && . .venv/bin/activate && python -m pytest tests/test_health.py -v`
Expected: PASS (1 passed).

- [ ] **Step 7: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/
git commit -m "feat(analysis): FastAPI app with /health endpoint"
```

---

## Task 3: Analysis service — `DriveAnalysis` model + `/analyze` stub

**Files:**
- Create: `analysis/app/models.py`
- Modify: `analysis/app/main.py`
- Create: `analysis/tests/test_analyze_stub.py`

- [ ] **Step 1: Write the failing test** — `analysis/tests/test_analyze_stub.py`

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_analyze_returns_schema_v1_stub():
    files = {"file": ("drive.csv", b"row1\nrow2\nrow3\n", "text/csv")}
    response = client.post("/analyze", files=files, data={"format": "vertical_layout"})

    assert response.status_code == 200
    body = response.json()
    assert body["schemaVersion"] == "1"
    assert body["drive"]["source"] == "vertical_layout"
    # Stub proves the upload reached Python: it counts the lines it received.
    assert body["dataQuality"]["rowCount"] == 3
    assert "stub" in body["dataQuality"]["warnings"][0].lower()
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd analysis && . .venv/bin/activate && python -m pytest tests/test_analyze_stub.py -v`
Expected: FAIL — 404 (no `/analyze` route yet).

- [ ] **Step 3: Create `analysis/app/models.py` (the v1 contract, spec §7)**

```python
from pydantic import BaseModel, Field


class Vehicle(BaseModel):
    label: str | None = None
    vin: str | None = None
    engine: str | None = None


class Drive(BaseModel):
    source: str
    startedAtClock: str | None = None
    durationSeconds: float = 0.0
    vehicle: Vehicle = Field(default_factory=Vehicle)


class Summary(BaseModel):
    distanceKm: float = 0.0
    movingSeconds: float = 0.0
    idleSeconds: float = 0.0
    avgSpeedKmh: float = 0.0
    maxSpeedKmh: float = 0.0
    fuelUsedL: float = 0.0
    fuelCostEur: float = 0.0
    avgConsumptionL100km: float = 0.0
    elevationGainM: float = 0.0
    elevationLossM: float = 0.0


class RoutePoint(BaseModel):
    t: float
    lat: float
    lon: float
    speedKmh: float


class SeriesPoint(BaseModel):
    t: float
    v: float


class DataQuality(BaseModel):
    rowCount: int = 0
    pidsPresent: list[str] = Field(default_factory=list)
    distanceSource: str | None = None
    warnings: list[str] = Field(default_factory=list)


class DriveAnalysis(BaseModel):
    schemaVersion: str = "1"
    drive: Drive
    summary: Summary = Field(default_factory=Summary)
    route: list[RoutePoint] = Field(default_factory=list)
    series: dict[str, list[SeriesPoint]] = Field(default_factory=dict)
    dataQuality: DataQuality = Field(default_factory=DataQuality)
```

- [ ] **Step 4: Add the `/analyze` stub to `analysis/app/main.py`**

Replace the whole file with:
```python
from fastapi import FastAPI, File, Form, UploadFile

from app.models import DataQuality, Drive, DriveAnalysis, Vehicle

app = FastAPI(title="HrvaDrive Analysis")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/analyze", response_model=DriveAnalysis)
async def analyze(
    file: UploadFile = File(...),
    format: str = Form("vertical_layout"),
    pricePerL: float | None = Form(None),
) -> DriveAnalysis:
    # Phase 0 STUB: prove the upload reached Python by counting received lines.
    # Real parsing/analysis lands in Phase 1 (spec §6, §9).
    contents = await file.read()
    row_count = contents.count(b"\n")
    return DriveAnalysis(
        drive=Drive(source=format, vehicle=Vehicle(label="My car")),
        dataQuality=DataQuality(
            rowCount=row_count,
            warnings=["stub: analysis not yet implemented (Phase 0)"],
        ),
    )
```

- [ ] **Step 5: Run both tests and watch them pass**

Run: `cd analysis && . .venv/bin/activate && python -m pytest -v`
Expected: PASS (2 passed).

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/
git commit -m "feat(analysis): DriveAnalysis v1 model and /analyze stub"
```

---

## Task 4: Analysis service — Dockerfile

**Files:**
- Create: `analysis/Dockerfile`

- [ ] **Step 1: Create `analysis/Dockerfile`**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Build and smoke-test the image**

Run:
```bash
cd analysis
docker build -t hrva-drive-analysis:dev .
docker run -d --rm -p 8000:8000 --name hrva-analysis hrva-drive-analysis:dev
sleep 3
curl -s http://localhost:8000/health
docker stop hrva-analysis
```
Expected: `curl` prints `{"status":"ok"}`.

- [ ] **Step 3: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add analysis/Dockerfile
git commit -m "build(analysis): containerize FastAPI service"
```

---

## Task 5: Ingestion service — Spring Boot project + `/api/health`

**Files:**
- Create: `ingestion/pom.xml`
- Create: `ingestion/src/main/resources/application.yml`
- Create: `ingestion/src/main/java/cc/hrva/drive/ingestion/IngestionApplication.java`
- Create: `ingestion/src/main/java/cc/hrva/drive/ingestion/analysis/AnalysisClient.java`
- Create: `ingestion/src/main/java/cc/hrva/drive/ingestion/web/HealthController.java`

- [ ] **Step 1: Create `ingestion/pom.xml`** (mirrors `../url-shortener/pom.xml`, trimmed to what Phase 0 needs)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>4.0.6</version>
        <relativePath/>
    </parent>

    <groupId>cc.hrva.drive</groupId>
    <artifactId>ingestion</artifactId>
    <version>0.1.0</version>
    <name>HrvaDrive Ingestion</name>
    <description>OBD2 drive upload, validation, and orchestration</description>

    <properties>
        <java.version>25</java.version>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webmvc</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-actuator</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <configuration>
                    <source>25</source>
                    <target>25</target>
                    <encoding>UTF-8</encoding>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 2: Create `ingestion/src/main/resources/application.yml`**

```yaml
server:
  port: 8080

spring:
  servlet:
    multipart:
      max-file-size: 100MB      # vertical exports can be ~26MB+
      max-request-size: 120MB

analysis:
  base-url: ${ANALYSIS_BASE_URL:http://localhost:8000}

management:
  endpoints:
    web:
      exposure:
        include: health
```

- [ ] **Step 3: Create `IngestionApplication.java`**

```java
package cc.hrva.drive.ingestion;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class IngestionApplication {
    public static void main(final String[] args) {
        SpringApplication.run(IngestionApplication.class, args);
    }
}
```

- [ ] **Step 4: Create `AnalysisClient.java`** (calls the Python service)

```java
package cc.hrva.drive.ingestion.analysis;

import java.io.IOException;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

@Component
public class AnalysisClient {

    private final RestClient restClient;

    public AnalysisClient(final RestClient.Builder builder,
                          @Value("${analysis.base-url}") final String baseUrl) {
        this.restClient = builder.baseUrl(baseUrl).build();
    }

    public String analyze(final MultipartFile file, final String format, final String pricePerL)
            throws IOException {
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

        return restClient.post()
                .uri("/analyze")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(body)
                .retrieve()
                .body(String.class);
    }

    public boolean isReachable() {
        try {
            restClient.get().uri("/health").retrieve().body(String.class);
            return true;
        } catch (final Exception e) {
            return false;
        }
    }
}
```

- [ ] **Step 5: Create `HealthController.java`**

```java
package cc.hrva.drive.ingestion.web;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import cc.hrva.drive.ingestion.analysis.AnalysisClient;

@RestController
public class HealthController {

    private final AnalysisClient analysisClient;

    public HealthController(final AnalysisClient analysisClient) {
        this.analysisClient = analysisClient;
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        return Map.of(
                "status", "ok",
                "analysis", analysisClient.isReachable() ? "up" : "down");
    }
}
```

- [ ] **Step 6: Build to verify it compiles and boots**

Run: `cd ingestion && mvn clean package`
Expected: BUILD SUCCESS (the default Spring Boot context-load test passes).

- [ ] **Step 7: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add ingestion/
git commit -m "feat(ingestion): Spring Boot app with /api/health and analysis client"
```

---

## Task 6: Ingestion service — `POST /api/v1/drives:analyze` (forward to Python)

**Files:**
- Create: `ingestion/src/main/java/cc/hrva/drive/ingestion/web/DriveAnalysisController.java`
- Create: `ingestion/src/test/java/cc/hrva/drive/ingestion/web/DriveAnalysisControllerTest.java`

- [ ] **Step 1: Write the failing test** — `DriveAnalysisControllerTest.java`

```java
package cc.hrva.drive.ingestion.web;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import cc.hrva.drive.ingestion.analysis.AnalysisClient;

@WebMvcTest(DriveAnalysisController.class)
class DriveAnalysisControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AnalysisClient analysisClient;

    @Test
    void forwardsUploadAndReturnsAnalysisJson() throws Exception {
        given(analysisClient.analyze(any(), eq("vertical_layout"), isNull()))
                .willReturn("{\"schemaVersion\":\"1\",\"drive\":{\"source\":\"vertical_layout\"}}");

        final MockMultipartFile file =
                new MockMultipartFile("file", "drive.csv", "text/csv", "row1\nrow2\n".getBytes());

        mockMvc.perform(multipart("/api/v1/drives:analyze")
                        .file(file)
                        .param("format", "vertical_layout"))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"schemaVersion\":\"1\"}"));
    }

    @Test
    void rejectsEmptyFile() throws Exception {
        final MockMultipartFile file =
                new MockMultipartFile("file", "empty.csv", "text/csv", new byte[0]);

        mockMvc.perform(multipart("/api/v1/drives:analyze")
                        .file(file)
                        .param("format", "vertical_layout"))
                .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ingestion && mvn -Dtest=DriveAnalysisControllerTest test`
Expected: FAIL — no `DriveAnalysisController` bean / 404.

- [ ] **Step 3: Create `DriveAnalysisController.java`**

```java
package cc.hrva.drive.ingestion.web;

import java.io.IOException;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import cc.hrva.drive.ingestion.analysis.AnalysisClient;

@RestController
@RequestMapping("/api/v1")
public class DriveAnalysisController {

    private final AnalysisClient analysisClient;

    public DriveAnalysisController(final AnalysisClient analysisClient) {
        this.analysisClient = analysisClient;
    }

    @PostMapping(
            path = "/drives:analyze",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE,
            produces = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<String> analyze(
            @RequestParam("file") final MultipartFile file,
            @RequestParam(value = "format", defaultValue = "vertical_layout") final String format,
            @RequestParam(value = "pricePerL", required = false) final String pricePerL)
            throws IOException {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest()
                    .contentType(MediaType.APPLICATION_JSON)
                    .body("{\"error\":\"empty file\"}");
        }
        final String analysisJson = analysisClient.analyze(file, format, pricePerL);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(analysisJson);
    }
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd ingestion && mvn -Dtest=DriveAnalysisControllerTest test`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add ingestion/
git commit -m "feat(ingestion): POST /api/v1/drives:analyze forwards upload to analysis"
```

---

## Task 7: Ingestion service — Dockerfile

**Files:**
- Create: `ingestion/Dockerfile`

- [ ] **Step 1: Create `ingestion/Dockerfile`** (mirrors `../url-shortener/Dockerfile`)

```dockerfile
FROM eclipse-temurin:25-jdk

WORKDIR /app

COPY target/*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

- [ ] **Step 2: Build the jar and the image, smoke-test it**

Run:
```bash
cd ingestion
mvn clean package
docker build -t hrva-drive-ingestion:dev .
docker run -d --rm -p 8080:8080 --name hrva-ingestion hrva-drive-ingestion:dev
sleep 8
curl -s http://localhost:8080/api/health
docker stop hrva-ingestion
```
Expected: `{"status":"ok","analysis":"down"}` (analysis is "down" because it isn't running here — that's correct in isolation).

- [ ] **Step 3: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add ingestion/Dockerfile
git commit -m "build(ingestion): containerize Spring Boot service"
```

---

## Task 8: Frontend — Vite React TS scaffold + Vitest

**Files:**
- Create: `frontend/` (Vite scaffold), then add `vite.config.ts`, `src/setupTests.ts`
- Modify: `frontend/package.json`

- [ ] **Step 1: Scaffold the app**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```
Expected: `frontend/` created with `src/App.tsx`, `package.json`, etc.

- [ ] **Step 2: Add the test script to `frontend/package.json`**

In the `"scripts"` block, ensure these exist (add `test`):
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

- [ ] **Step 3: Overwrite `frontend/vite.config.ts`** (adds dev proxy + Vitest config)

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
});
```

- [ ] **Step 4: Create `frontend/src/setupTests.ts`**

```ts
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Verify the scaffold builds**

Run: `cd frontend && npm run build`
Expected: a `dist/` folder is produced, no type errors.

- [ ] **Step 6: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/
git commit -m "chore(frontend): scaffold Vite React TS app with Vitest"
```
(The root `.gitignore` and the Vite scaffold's own `frontend/.gitignore` both exclude `node_modules/` and `dist/`, so a plain `git add frontend/` stages only source.)

---

## Task 9: Frontend — upload → analyze → render (TDD)

**Files:**
- Create: `frontend/src/App.test.tsx`
- Overwrite: `frontend/src/App.tsx`

- [ ] **Step 1: Write the failing test** — `frontend/src/App.test.tsx`

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';

describe('App', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uploads a file and renders the returned analysis JSON', async () => {
    const stub = { schemaVersion: '1', dataQuality: { rowCount: 3 } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => stub,
    } as Response);

    render(<App />);

    const input = screen.getByLabelText('drive file') as HTMLInputElement;
    const file = new File(['a\nb\nc\n'], 'drive.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /analyze/i }));

    await waitFor(() =>
      expect(screen.getByTestId('result')).toHaveTextContent('"schemaVersion": "1"'),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/drives:analyze',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test`
Expected: FAIL — current scaffold `App` has no file input / result element.

- [ ] **Step 3: Overwrite `frontend/src/App.tsx`**

```tsx
import { useState } from 'react';

type Phase = 'idle' | 'loading' | 'done' | 'error';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string>('');
  const [phase, setPhase] = useState<Phase>('idle');

  async function analyze() {
    if (!file) return;
    setPhase('loading');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('format', 'vertical_layout');
      const res = await fetch('/api/v1/drives:analyze', { method: 'POST', body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(JSON.stringify(await res.json(), null, 2));
      setPhase('done');
    } catch (err) {
      setResult(String(err));
      setPhase('error');
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 720 }}>
      <h1>HrvaDrive</h1>
      <p>Upload a Car Scanner <code>vertical_layout</code> export.</p>
      <input
        type="file"
        aria-label="drive file"
        accept=".csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button onClick={analyze} disabled={!file || phase === 'loading'} style={{ marginLeft: 8 }}>
        {phase === 'loading' ? 'Analyzing…' : 'Analyze'}
      </button>
      {result && (
        <pre data-testid="result" style={{ marginTop: 16, background: '#f4f4f5', padding: 12 }}>
          {result}
        </pre>
      )}
    </main>
  );
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `cd frontend && npm test`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): upload a drive and render the analysis JSON"
```

---

## Task 10: Frontend — Dockerfile + nginx proxy

**Files:**
- Create: `frontend/nginx.conf`
- Create: `frontend/Dockerfile`

- [ ] **Step 1: Create `frontend/nginx.conf`** (serves the SPA, proxies `/api` to ingestion)

```nginx
server {
    listen 80;

    location /api/ {
        proxy_pass http://ingestion:8080;
        proxy_set_header Host $host;
    }

    location / {
        root /usr/share/nginx/html;
        try_files $uri /index.html;
    }
}
```

- [ ] **Step 2: Create `frontend/Dockerfile`** (multi-stage: build with Node, serve with nginx)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

- [ ] **Step 3: Create `frontend/.dockerignore`** (so `COPY . .` doesn't clobber the container's `node_modules` with the local one)

```
node_modules
dist
.git
```

- [ ] **Step 4: Build the image**

Run: `cd frontend && docker build -t hrva-drive-frontend:dev .`
Expected: image builds (nginx serving the built SPA). Full serving is verified in Task 11 via compose.

- [ ] **Step 5: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add frontend/nginx.conf frontend/Dockerfile frontend/.dockerignore
git commit -m "build(frontend): containerize SPA behind nginx with /api proxy"
```

---

## Task 11: docker-compose + end-to-end round-trip

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
name: hrva-drive
services:
  analysis:
    build: ./analysis
    ports:
      - '8000:8000'
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health').status==200 else 1)"]
      interval: 10s
      timeout: 3s
      retries: 5

  ingestion:
    build: ./ingestion
    ports:
      - '8080:8080'
    environment:
      - ANALYSIS_BASE_URL=http://analysis:8000
    depends_on:
      analysis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "bash", "-c", "echo > /dev/tcp/localhost/8080"]
      interval: 10s
      timeout: 3s
      retries: 5

  frontend:
    build: ./frontend
    ports:
      - '3000:80'
    depends_on:
      ingestion:
        condition: service_healthy
```

- [ ] **Step 2: Bring the whole stack up**

Run:
```bash
cd /Users/karlo/Developer/hrva-drive
docker compose up --build -d
docker compose ps
```
Expected: all three services `running`; `analysis` and `ingestion` show `healthy`.

- [ ] **Step 3: Verify the full round-trip through the frontend's proxy**

Run (uses the real sample file, through nginx → ingestion → analysis):
```bash
curl -s -F "file=@data/horizontal_layout.csv" -F "format=vertical_layout" \
  http://localhost:3000/api/v1/drives:analyze
```
Expected: JSON with `"schemaVersion":"1"`, `"source":"vertical_layout"`, and a non-zero `dataQuality.rowCount` matching the file's line count — proving Frontend(nginx) → Spring → Python end to end.

- [ ] **Step 4: Verify the browser UI**

Open http://localhost:3000, choose `data/horizontal_layout.csv`, click **Analyze**. Expected: the stub `DriveAnalysis` JSON renders on the page.

- [ ] **Step 5: Tear down and commit**

```bash
cd /Users/karlo/Developer/hrva-drive
docker compose down
git add docker-compose.yml
git commit -m "build: docker-compose wiring frontend, ingestion, analysis"
```

---

## Task 12: GitHub Actions — build & push all three images to ghcr.io

**Files:**
- Create: `.github/workflows/build.yml`

> **Prerequisite (human):** a GitHub repo must exist for this project, and its
> **Settings → Actions → Workflow permissions** must allow read/write (so the
> default `GITHUB_TOKEN` can push packages). `github.repository_owner` must be
> lowercase for ghcr (it is for personal accounts).

- [ ] **Step 1: Create `.github/workflows/build.yml`** (mirrors `../url-shortener/.github/workflows/build.yml`, one job per service)

```yaml
name: Build and Publish Docker Images

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./analysis
          push: ${{ github.event_name == 'push' }}
          tags: |
            ghcr.io/${{ github.repository_owner }}/hrva-drive-analysis:latest
            ghcr.io/${{ github.repository_owner }}/hrva-drive-analysis:${{ github.sha }}
          platforms: linux/amd64,linux/arm64

  ingestion:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '25'
          distribution: 'temurin'
          cache: maven
      - name: Build jar
        run: mvn -f ingestion/pom.xml clean package
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./ingestion
          push: ${{ github.event_name == 'push' }}
          tags: |
            ghcr.io/${{ github.repository_owner }}/hrva-drive-ingestion:latest
            ghcr.io/${{ github.repository_owner }}/hrva-drive-ingestion:${{ github.sha }}
          platforms: linux/amd64,linux/arm64

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          context: ./frontend
          push: ${{ github.event_name == 'push' }}
          tags: |
            ghcr.io/${{ github.repository_owner }}/hrva-drive-frontend:latest
            ghcr.io/${{ github.repository_owner }}/hrva-drive-frontend:${{ github.sha }}
          platforms: linux/amd64,linux/arm64
```

- [ ] **Step 2: Commit**

```bash
cd /Users/karlo/Developer/hrva-drive
git add .github/workflows/build.yml
git commit -m "ci: build and push frontend, ingestion, analysis images to ghcr.io"
```

- [ ] **Step 3 (human-gated): Push to trigger CI**

Only when the GitHub repo exists and you're ready:
```bash
git remote add origin git@github.com:<your-account>/hrva-drive.git   # if not already set
git push -u origin main
```
Expected: the Actions run goes green and three packages appear under your account's **Packages**: `hrva-drive-analysis`, `hrva-drive-ingestion`, `hrva-drive-frontend`.

---

## Phase 0 acceptance

- `docker compose up --build` brings up all three services; `analysis` and `ingestion` are `healthy`.
- `POST http://localhost:3000/api/v1/drives:analyze` with a sample file returns a `schemaVersion:"1"` stub whose `dataQuality.rowCount` reflects the uploaded file — proving the Frontend → Spring → Python round-trip.
- `cd analysis && pytest`, `cd ingestion && mvn test`, and `cd frontend && npm test` all pass.
- CI is committed; pushing to `main` builds and pushes three ghcr images.

## Self-review notes (done while writing)

- **Spec coverage:** Covers spec §9 Phase 0 (3 services scaffolded, compose, CI→ghcr, health checks, Spring↔Python contract **stub** matching §7's `DriveAnalysis` shape). Phase 1 analysis is intentionally excluded.
- **Contract consistency:** The Python stub, the `DriveAnalysis` Pydantic model, and the frontend assertion all use the same field names (`schemaVersion`, `drive.source`, `dataQuality.rowCount`) from spec §7.
- **Endpoint consistency:** `/api/v1/drives:analyze` is identical across frontend (`fetch`), Spring (`@PostMapping`), and the nginx proxy. `/analyze` and `/health` are identical across Spring's `AnalysisClient` and FastAPI.
- **No placeholders:** every code/command step is complete and runnable.
```
