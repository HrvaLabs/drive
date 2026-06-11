# HrvaDrive — OBD2 Drive Analysis Platform — Design

- **Status:** Approved design (north star). v1 scope locked; later phases sketched.
- **Date:** 2026-06-05
- **Owner:** Karlo (Java/Spring engineer)
- **One-liner:** Upload an OBD2 drive log, get back a clear, beautiful drive report — summary, map, graphs, driving profile, eco/economy tips, and engine health — readable by anyone, with an expert/debug layer underneath.

---

## 0. How to use this document (read first — esp. for a fresh Claude Code session)

This is the **single source of truth** for the project. This work will be built across **multiple independent Claude Code sessions**, so:

1. **Always read this whole doc before writing code.** It defines the goal, the data, the architecture, the analysis methods, the API contract, and the repo layout.
2. **We build in phases (§8). Only implement the phase you're asked for.** v1 = Phase 0 + Phase 1. Do not pull later-phase work forward unless explicitly told.
3. **The inter-service API contract (§7) is the law.** Spring and Python are built in separate sessions; they must agree on JSON shapes. Change the contract here first, then code.
4. **Analysis definitions (§6) are shared.** Compute metrics exactly as defined so results are consistent no matter who/which session implemented them.
5. When in doubt about scope, prefer **YAGNI** and the thin slice. Add a note to §10 (Open Questions) rather than silently expanding scope.

---

## 1. Goal & vision

People run OBD2 logging apps (e.g. *Car Scanner ELM OBD2*) and end up with huge, opaque CSV files. **HrvaDrive turns one of those logs into an understandable story about a single drive**, and into actionable coaching.

Two audiences, one product (**core principle: friendly by default, expert on demand**):

- **The driver / "any dummy":** plain-language summary, a map of where they went, simple verdicts ("calm, economical drive"), tips in minutes and euros.
- **The expert / debugging:** raw per-signal (PID) time-series, data-coverage/quality view, a signal explorer — everything needed to diagnose the car or the data.

v1 is **stateless**: upload → analyze → show. Nothing is persisted. (Stored history + cross-drive trends is a later, optional phase that introduces a database.)

---

## 2. Context: the data source

Data comes from the **Car Scanner ELM OBD2 & ELM327** app, which exports a recorded drive in **four layouts**. We were given the **same drive exported all four ways** to choose the best one.

Example vehicle for development: a **compact petrol hatchback** (~91 hp, 999 cc 3-cylinder turbo). VIN and engine string are embedded in the binary `.brc` export.

> Note: the catalog of PID columns in the horizontal exports includes signals this car does **not** produce (e.g. Diesel Particulate Filter columns). Treat the column list as "everything the app *can* log", and rely on **which PIDs actually carry values** for a given drive.

### The four export formats

| File | Shape | Notes |
|------|-------|-------|
| `vertical_layout.csv` | **Long / tall**, `;`-delimited: `SECONDS;PID;VALUE;UNITS;LATITUDE;LONGTITUDE` | One reading per row. Fixed schema. Units explicit. GPS on every row. **← our canonical format.** |
| `horizontal_layout.csv` | **Wide**, `,`-delimited: `time` + one column per PID (~69 cols) | Sparse (each PID sampled at different times → many empty cells). Units baked into header strings like `"(L/100km)"`. |
| `horizontal_with_fill_gaps.csv` | Same as above, gaps **forward-filled** | Easiest to load, but **fabricates values between samples** — corrupts integrals/averages. Do not use as the source of truth. |
| `internal_car_scanner.brc` | **Binary**, proprietary | Magic header `\x10CARSCANNERRECORD`, then length-prefixed strings: VIN, nickname, engine/model. Richest metadata; full stream is a reverse-engineering rabbit hole. |

### Why `vertical_layout` is canonical

- **Real timestamps preserved.** Every individual reading keeps its true sample time. The `fill_gaps` variant fabricates intermediate values, which biases exactly what we care about (fuel integrals, idle time, harsh-event detection, true averages).
- **Stable schema across cars/drives.** `SECONDS;PID;VALUE;UNITS;LAT;LON` never changes, regardless of which sensors a car exposes. The horizontal layouts are variable-width.
- **Units are a column,** not a substring to regex out of a header.
- **GPS coordinates are on every row.**

### Key data facts (verified against the sample)

- `SECONDS` is **seconds since local midnight** (e.g. `58138.44` → `16:08:58`, matching the horizontal file's `16:08:58.437` clock). **No date is present.** v1 assumes a **single-day drive**; the parser must assert this and handle (or reject) a midnight rollover.
- Source header misspells longitude as **`LONGTITUDE`** — normalize to `lon` internally.
- The sample vertical file is ~**289k rows**; horizontal ~**34.7k rows**. Files can be tens of MB → stream, don't load naively where avoidable.
- Decimal values use `.`; vertical fields are quoted and `;`-separated.

### Verified signal coverage (sample drive)

Confirmed by inspecting the vertical file — this grounds the feature claims and shows what "real" data looks like:

- **Economy is real:** cumulative `Fuel used` = **2.31 L**, `Fuel used price` = **€3.72** (~11k samples each). The economy/eco-tips value-prop is well-founded.
- **"Best of drive" is real:** top speed **146 km/h**, max power **79.6 hp**, max RPM **3355**, peak `Calculated boost` **0.71 bar**, max `Vehicle acceleration` **0.265 g**.
- **Health present but sparse:** `Engine coolant temperature` reaches **86 ℃** (~531 samples), `OBD Module Voltage` **14.2 V** (**only 1 sample**), `Altitude (GPS)` up to ~222 m (~4.7k samples).
- **Sampling rates vary widely** per PID (speed/fuel/accel ~11k, RPM ~8.7k, coolant/boost ~0.5k, voltage 1). Always degrade gracefully and surface per-PID coverage in `dataQuality`.
- **`Boost pressure` PID is absent** in this drive — boost comes from **`Calculated boost`** (bar). Never assume a specific PID exists; check presence.
- **Threshold reality check:** max acceleration here is **0.265 g**, *below* the 0.30 g hard-accel default in §6 — so that default flags **zero** events on this drive. §6 thresholds are **must-validate-against-real-data**, not final.

---

## 3. Canonical data model

Internal representation after parsing any input format:

```
Reading {
  t:    float    // seconds since local midnight
  pid:  string   // e.g. "Vehicle speed", "Engine RPM"
  value: float
  unit: string   // e.g. "km/h", "rpm", "L/h"
  lat:  float
  lon:  float     // normalized from source "LONGTITUDE"
}
```

A **Drive** = an ordered stream of `Reading`s spanning many PIDs at different sample rates. For most analysis we **resample/pivot** per-PID series onto a common time grid (e.g. 1 Hz) or process each PID series independently — see §6.

### Signals available (the useful subset)

| Domain | PIDs (name → unit) |
|--------|--------------------|
| Position | `Latitude`, `Longitude`, `Altitude (GPS)` (m), `Speed (GPS)` (km/h) |
| Speed | `Vehicle speed` (km/h), `Average speed` (km/h) |
| Engine | `Engine RPM` (rpm), `Calculated engine load value` (%), `Throttle position` (%), `Timing advance` (°) |
| Fuel rate | `Engine fuel rate` (L/h), `Calculated instant fuel rate` (L/h), `Calculated instant fuel consumption` (L/100km) |
| Fuel totals | `Fuel used` (L), `Fuel used price` (€), `Average fuel consumption` (+ Today/Week/total windows) |
| Power | `Instant engine power (based on fuel consumption)` (hp) |
| Boost / turbo | `Boost pressure`, `Calculated boost` (bar), `Commanded Boost Pressure A/B`, `Intake Manifold Pressure` |
| Temps | `Engine coolant temperature` (℃), `Intake air temperature` (℃) |
| Dynamics | `Vehicle acceleration` (g) |
| Electrical | `OBD Module Voltage` (V) |
| Fuel trims | `Short term fuel % trim - Bank 1` (%), `Long term fuel % trim - Bank 1` (%) |
| Distance | `Distance travelled` (km), `Distance to empty` (km) |

> Which of these are present varies per drive. Code must degrade gracefully: compute what the available signals allow, and report what's missing in `dataQuality`.

---

## 4. Feature catalog (the full vision)

Grouped as dashboard panels. Every panel obeys the **friendly-by-default / expert-on-demand** rule.

1. **Drive Summary (KPIs):** distance, duration, moving vs idle time, avg/max speed, total fuel (L), **cost (€)**, avg L/100km, elevation gain/loss, start/end time + place.
2. **Route Map:** GPS polyline, **color-coded** by speed / consumption / RPM, event pins (hard brake, hard accel, idle, high-RPM burst). Elevation profile strip.
3. **Time-series graphs:** speed, RPM, fuel rate, engine load, throttle, **boost** (turbo), coolant warm-up curve, altitude. Plus a **speed-vs-consumption** scatter to find the car's efficiency sweet spot.
4. **Driving Profile & Style Score:** Eco / Normal / Spirited classification + "driver personality" card, from idle %, harsh-event rate, % time in optimal RPM band, speed steadiness.
5. **Eco-Driving Tips:** rule-based, evidence-cited, quantified in € and minutes (e.g. "idled 6 min ≈ 0.2 L ≈ €0.30").
6. **Economy & Cost:** cost/km, projected monthly/yearly cost at this style, "what-if" savings if tips applied.
7. **Engine & Vehicle Health:** warm-up time, battery voltage health, fuel-trim sanity (rich/lean), boost behavior, DTC/MIL flags if present.
8. **"Best of the Drive":** max power (hp), peak boost, hardest acceleration (g), top speed, highest RPM — a hall of fame.
9. **Vehicle Identity:** VIN + engine decoded from the `.brc` header into a car card.
10. **Shareable report:** export the drive as PDF/PNG.

---

## 5. Architecture

```
 ┌─────────────┐    upload     ┌──────────────────┐   analyze    ┌────────────────────┐
 │  Frontend   │ ───────────▶  │   Spring Boot    │ ──────────▶  │   Python FastAPI   │
 │  React SPA  │ ◀───────────  │  (Java 25, Maven)│ ◀──────────  │  pandas / numpy    │
 │ map+charts  │   analysis    │ upload·validate· │   JSON       │  analysis engine   │
 └─────────────┘    JSON       │ detect·orchestr. │              └────────────────────┘
                               └──────────────────┘
        └──────────────── docker-compose (one network) ──────────────┘
        GitHub Actions → build → push to ghcr.io (mirrors url-shortener, multi-arch)
```

### Services & responsibilities

- **`frontend/` — React SPA.** Upload UX, dashboard, map (Leaflet/MapLibre), charts (Recharts), friendly/expert toggle. Talks only to Spring. Built to look polished (use the `frontend-design` skill when implementing).
- **`ingestion/` — Spring Boot (Java 25, Maven).** Owns the HTTP boundary: file upload, **format detection + validation** (sniff delimiter/header, confirm it's a supported layout, count rows, list PIDs present), orchestrate the call to the analysis service, shape/return the merged response. This is the "ingestion" service. As formats grow it also normalizes horizontal→canonical and parses the `.brc` header.
- **`analysis/` — Python FastAPI.** Pure analysis engine: parse (pandas), resample, integrate, score, detect events, generate tips. **No web/UI concerns, no persistence.** Returns JSON only.

### Why this split (and its one real cost)

The user explicitly wants Java for web/ingestion and Python for the math, and this is a portfolio-quality repo where the split is a feature, not overhead. **The one cost we own:** a clean **inter-service contract** (§7) + **docker-compose orchestration**. Accepted deliberately.

### Tech stack

| Layer | Choice | Mirrors |
|-------|--------|---------|
| Frontend | React + Vite, Leaflet/MapLibre, Recharts | existing `URL-Shortener-FE` split |
| Ingestion | Java 25, Spring Boot, Maven | `url-shortener` (`eclipse-temurin:25-jdk`) |
| Analysis | Python 3.12+, FastAPI, pandas, numpy, uvicorn | — |
| Packaging | Docker per service + `docker-compose.yml` | `url-shortener/docker` |
| CI | GitHub Actions → build → push to `ghcr.io`, multi-arch (amd64/arm64) | `url-shortener/.github/workflows/build.yml` |

---

## 6. Analysis methodology (shared definitions — implement exactly)

Engine-specific constants below are **approximate defaults for a 1.0 L 3-cylinder turbo petrol** engine; treat them as **configurable**, not gospel. Verify against spec before quoting hard numbers to users.

- **Speed source:** prefer the OBD `Vehicle speed` (km/h) as the primary speed everywhere (chart, route color, max/avg); fall back to `Speed (GPS)` only when `Vehicle speed` is absent. Record the choice in `dataQuality`.
- **Average / max speed:** **average** = the time-weighted mean of the speed signal (1Hz-resampled) so it matches the speed chart; **max** = the peak sample. Do **not** compute average as distance ÷ moving-time — it skews high (≈102 vs the honest ≈50 km/h on the sample drive) and contradicts the chart.
- **Route construction:** `route` points come from the **GPS readings** (`Latitude`/`Longitude`). GPS and speed are separate PID streams sampled at different times, so attach `speedKmh` to each point by **nearest-timestamp join** (interpolate across large gaps). Downsample the polyline for the map if the point count is very high.
- **Elevation gain/loss (m):** sum of positive (gain) and negative (loss) successive deltas of `Altitude (GPS)`; apply light smoothing first to avoid GPS-noise inflation. Skip if altitude is absent.
- **Distance (prefer the odometer):** use the **`Distance travelled` PID** (a per-trip counter that starts at 0 — take its last value) as the trip distance when present; fall back to **haversine integration of GPS** otherwise. Record `distanceSource` (`odometer`/`gps`); when both exist and disagree by >15%, add a `warnings` entry. *Rationale (verified):* on the sample drive raw GPS-haversine read **55.6 km** vs the odometer's **36.9 km** — GPS position noise inflates the segment sum, so the odometer (the vehicle's own measured distance) is the trustworthy figure. Smooth the GPS track before summing if you must rely on the fallback.
- **Duration:** `last_t − first_t`. v1 assumes a single-day drive; if `t` decreases mid-drive (likely a midnight rollover) add a `warnings` entry rather than mis-reporting.
- **Idle vs moving (independent measures):** **idle** = seconds with `Vehicle speed < 1 km/h` AND `Engine RPM > 0` (stopped, engine on); **moving** = seconds with `Vehicle speed ≥ 1 km/h`. These are measured separately and need **not** sum to duration — the remainder is engine-off / unlogged-RPM time, honestly attributed to neither (don't lump it into "moving").
- **Fuel used (L):** prefer the cumulative `Fuel used` PID when present; else integrate `Engine fuel rate` (L/h) over time. **Cost (€):** prefer cumulative `Fuel used price`; else `fuelUsedL × pricePerL` (price configurable).
- **Avg consumption (L/100km):** `fuelUsedL / distanceKm × 100`.
- **Harsh accel / brake:** from `Vehicle acceleration` (g) magnitude when present (accel > ~0.30 g, brake < ~−0.35 g); else from `Δspeed/Δt` (accel > ~2.5 m/s², brake < ~−3.0 m/s²). Each crossing = one event with timestamp + location (for map pins). **Validate these against real data** — in the sample drive acceleration peaks at only 0.265 g (§2), so the 0.30 g default flags nothing.
- **Coasting / fuel cut-off (reward):** `fuel rate ≈ 0` while `RPM > idle` and the car is **moving** — covers both deceleration fuel cut-off (DFCO) and steady closed-throttle overrun; both save fuel. Time spent here is *good*.
- **Optimal RPM band:** ~**1500–2500 rpm** cruising for this engine. Track **% time in band**; flag frequent high-RPM at steady throttle → "short-shift sooner."
- **Warm-up:** time for `Engine coolant temperature` to reach ~85–90 ℃ from start; penalize high `engine load` while still cold.
- **Eco score (0–100):** weighted blend of idle %, harsh-event rate, % time in RPM band, **speed steadiness** (lower coefficient-of-variation is better), and coasting utilization. Document the weights where implemented; keep them in one place.
- **Battery health:** `OBD Module Voltage` — rough flags: resting < 12.2 V (low), charging should be ~13.5–14.8 V.
- **Fuel trims:** `|STFT + LTFT|` within ±10 % normal; beyond ±25 % flag (running rich/lean).

---

## 7. Inter-service API contract

**Versioned.** Bump `schemaVersion` on breaking changes; update this section first.

### Frontend → Spring

`POST /api/v1/drives:analyze` — `multipart/form-data`, field `file` = the export (v1: `vertical_layout.csv`). Optional `pricePerL` (number, €/L) for cost when the cumulative price PID is absent.

Returns **`DriveAnalysis`** (below).

### Spring → Python

v1: Spring **validates** (sniffs delimiter/header, confirms vertical layout, counts rows, lists PIDs present), then **forwards the file** for the analytical parse — pandas is the right tool for the heavy CSV parse, and this avoids shipping hundreds of thousands of JSON objects between services.

`POST /analyze` — `multipart/form-data`: `file` (the CSV), `format=vertical_layout`, optional `pricePerL`. Returns the analysis body that Spring wraps into `DriveAnalysis`.

> Evolution (later phases): as horizontal/`.brc` support lands, Spring normalizes to the canonical model (§3) and POSTs a **columnar** payload (parallel arrays `t/pid/value/unit/lat/lon`) instead of the raw file. Define that variant here when we get there.

### `DriveAnalysis` (v1 shape — extensible; later phases add fields, never repurpose)

```jsonc
{
  "schemaVersion": "1",
  "drive": {
    "source": "vertical_layout",
    "startedAtClock": "16:08:58.437",   // wall clock; date unknown in v1
    "durationSeconds": 1234.5,
    "vehicle": { "label": "My car", "vin": null, "engine": null }  // filled once .brc parsed
  },
  "summary": {
    "distanceKm": 12.3,
    "movingSeconds": 1000,
    "idleSeconds": 234,
    "avgSpeedKmh": 35.1,
    "maxSpeedKmh": 92.0,
    "fuelUsedL": 0.95,
    "fuelCostEur": 1.42,
    "avgConsumptionL100km": 7.7,
    "elevationGainM": 80.0,
    "elevationLossM": 60.0
  },
  "route": [ { "t": 0.0, "lat": 45.0000000, "lon": 15.0000000, "speedKmh": 0.0 } ],
  "series": {
    "speedKmh": [ { "t": 0.0, "v": 0.0 } ]
  },
  "dataQuality": {
    "rowCount": 288760,
    "pidsPresent": ["Vehicle speed", "Engine RPM", "Speed (GPS)"],
    "distanceSource": "gps",          // "gps" | "obd"
    "warnings": []
  }
}

// Reserved for later phases (documented now so shapes don't churn):
//   "events":  [ { "type": "hard_brake", "t": .., "lat": .., "lon": .., "value": .. } ]
//   "scores":  { "eco": 0..100, "style": "eco|normal|spirited", "rpmBandPct": .. }
//   "tips":    [ { "id": "reduce_idle", "severity": "...", "evidence": {...}, "eurImpact": .. } ]
//   "health":  { "warmupSeconds": .., "batteryVerdict": "...", "fuelTrimVerdict": "..." }
//   "bests":   { "maxHp": .., "peakBoostBar": .., "maxAccelG": .., "topSpeedKmh": .., "maxRpm": .. }
```

---

## 8. Build roadmap

Each phase is independently demoable. **Implement only what the current session is scoped to.**

| Phase | Ships | Demo |
|------|-------|------|
| **0 — Walking skeleton** | 3 services scaffolded, `docker-compose`, GitHub Actions → ghcr.io, health checks, Spring↔Python contract stub | `docker compose up` → FE→Spring→Python round-trip |
| **1 — The spine (v1)** | Upload `vertical_layout` → validate → analyze → **Drive Summary** + route + speed series; FE: map polyline + KPI card + speed chart | Drop the real drive file, see the drive |
| **2 — Analysis depth** | Events (idle/harsh/RPM-band/coasting), style + eco score, "Best of the drive", engine/health metrics → fills `events/scores/health/bests` | Scores & pins appear |
| **3 — Full dashboard + dual-audience** | All graphs, metric-colored map, elevation strip, tips cards, vehicle card, **Expert/Debug mode** (raw per-PID inspector, data coverage, signal explorer) | The "looks nice" milestone |
| **4 — Economy & tips depth** | Full eco-tip ruleset, what-if savings, cost projections, efficiency sweet-spot | Actionable coaching |
| **5 — Formats + report** | Horizontal layouts + `.brc` header (VIN/engine decode), PDF/PNG export; *(optional later)* stored history + cross-drive trends (adds Postgres) | All 4 formats; shareable report |

---

## 9. v1 scope (Phase 0 + Phase 1) — what we implement first

**In scope**
- Monorepo with `frontend/`, `ingestion/`, `analysis/`, `docker-compose.yml`, `.github/workflows/build.yml`, this doc, `AGENTS.md`, `README.md`.
- `docker compose up` brings up all three services on one network with health checks.
- CI builds each service image and pushes to `ghcr.io` (multi-arch), mirroring `url-shortener`.
- **Ingestion (Spring):** `POST /api/v1/drives:analyze`; validate the upload is `vertical_layout`; forward to analysis; return `DriveAnalysis` v1; sane errors (wrong format, empty file, too large).
- **Analysis (Python):** parse vertical CSV (pandas); compute the **`summary`**, **`route`**, **`series.speedKmh`**, and **`dataQuality`** per §6/§7.
- **Frontend (React):** upload control; render the **map polyline**, the **KPI summary card**, and **one speed-vs-time chart**; basic loading/error states.

**Out of scope for v1** (later phases): tips, scores, events, health, "bests", expert/debug mode, horizontal & `.brc` formats, PDF export, persistence/history, auth, multi-drive.

**v1 acceptance:** with the project running via `docker compose up`, uploading the real `vertical_layout` file shows a correct map of the route, a summary card with plausible distance/duration/fuel/€/L-100km, and a speed chart — with CI green.

---

## 10. Open questions & future

- **VIN decode:** local lookup vs external API — decide at Phase 5.
- **`.brc` parsing depth:** header-only (VIN/engine/nickname) is enough; full stream is out of scope indefinitely unless justified.
- **Stored history:** introduces Postgres + per-vehicle identity; revisit after Phase 4. Keep the analysis service stateless regardless.
- **Map tiles:** OSM/Leaflet default vs MapLibre + a tile provider (key management) — decide at Phase 1/3.
- **Time/date:** exports carry clock-only time; if a future export includes a date, relax the single-day assumption.

---

## 11. References (patterns to mirror)

- `../url-shortener/.github/workflows/build.yml` — Java 25 setup, Maven build, Buildx, ghcr login, multi-arch push.
- `../url-shortener/Dockerfile` — `eclipse-temurin:25-jdk`, copy jar, expose 8080.
- `../url-shortener/docker/docker-compose.yml` — compose layout.
- `../URL-Shortener-FE` — existing React frontend split.
