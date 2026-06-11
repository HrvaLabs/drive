# HrvaDrive — project brief

*A self-contained summary for advising on free improvements & free APIs. No PII included.*

## Mission
A free web app that turns a recorded car drive (from the **Car Scanner ELM OBD2** phone app) into a **readable drive report** — for a layperson *and* a curious/expert user. Upload a drive export → get a summary, route map, eco/cost coaching, engine insights, graphs, and a saved history with trends. Live at **drive.hrva.cc** (deploying soon).

## How it works (data flow)
Browser (React) → nginx (serves the SPA, proxies `/api`) → **Python FastAPI + pandas/numpy** analysis service (validates + all the math) → JSON report back to the browser. The analysis server is **stateless**.

## Tech stack
- **Frontend:** React 19 + Vite + TypeScript, Leaflet (maps), Recharts (charts), Vitest. Client-side history via **IndexedDB**.
- **Analysis:** Python 3.13 + FastAPI + pandas/numpy (the only backend; nginx in the frontend image proxies `/api` to it).
- **Infra:** Docker Compose, GitHub Actions → GHCR images, deployable via Portainer behind a reverse proxy.

## Input data
Car Scanner OBD2 exports: **vertical** or **horizontal** CSV (one drive, ~tens of thousands of rows, ~65 PIDs), plus an optional **`.brc`** binary whose header we decode for **VIN + engine string**. Key gotcha: the CSV timestamp is **seconds-since-midnight only — no calendar date**.

## Signals typically available per drive
GPS lat/lon + **altitude**, vehicle speed, engine RPM, throttle, **MAP/boost**, coolant temp, **battery voltage** (adapter + ECU), fuel rate / fuel used / fuel price, fuel trims, acceleration (g), odometer (`Distance travelled`), plus the **VIN & engine** from the `.brc`.

## What it computes
- **Trustworthy measurements:** distance (from the car's odometer, not GPS), fuel used, €/L (derived), cost/km, idle-fuel waste (uses the car's real idle fuel rate), a speed-vs-consumption **efficiency curve + "sweet spot"**, **CO₂** (kg + g/km), **climb energy** (m·g·Δh), trip-type + stop-and-go %.
- **Directional heuristics (clearly labelled as rough):** an eco-driving score (RPM band + speed steadiness + low idling − harsh events), **gear-aware short-shift** detection (only flags high revs when a taller gear was available — so top-gear highway cruising isn't penalised), idle advice (only long stops, with a start-stop engine-wear caveat).
- Events (idle/hard-brake/hard-accel/high-rpm/coasting), engine health (warm-up time, battery verdict from the **ECU** voltage, fuel trim), "peak readings", €-quantified tips, per-PID signal explorer, route map with speed colouring + event pins, Save-as-PDF report.
- **History:** multi-file upload, per-drive auto-save in the browser, **day/week/month trends**.

## Hard constraints (please respect when advising)
- **Free**, **no account / no auth**, **server stays stateless** (no DB — history is client-side IndexedDB).
- **Privacy-first:** a drive carries the user's VIN and home-area GPS; nothing is stored server-side, no PII in the repo. Anything that sends the VIN or raw GPS to a third party is a hard sell unless self-hostable.
- Single-page, mobile-friendly, deployed as a small Docker stack.

## Known limitations / open ideas
- Logs have **no date** (only time-of-day) → history buckets by *upload* time, and weather/calendar correlation isn't possible without a date.
- **Gear inference** was built but reverted — RPM/speed sampling noise made gear bands unreliable (would need same-instant RPM↔speed alignment).
- Eco-score weights & RPM thresholds are generic, not calibrated per engine.

## What I'm looking for (you have internet access)
1. **Free improvements** — analysis ideas, UX, or features that fit the free/stateless/private constraints.
2. **Free APIs (free tier, ideally no key or self-hostable)** that could add value given our data. Seeds to verify/expand:
   - **NHTSA vPIC** (free VIN decode → make/model/year, fuel type, body, possibly weight) — could auto-pick the petrol vs diesel CO₂ factor and the mass for climb-energy. *(We have the VIN.)*
   - **Reverse geocoding** (e.g., OSM **Nominatim**, self-hostable) — turn start/end GPS into place names. *(Privacy: prefer self-host or coarse rounding.)*
   - **Fuel-price source** (a free Croatian fuel-price feed) — auto-fill €/L instead of relying on the logged price.
   - Anything else genuinely free that maps to OBD2 / automotive / eco data.

For each suggestion, please flag: is it free, does it need a key, and does it keep data private (no VIN/GPS leaving the user's device unless self-hosted)?
