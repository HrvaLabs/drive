# HrvaDrive — roadmap & research backlog

Living doc. Captures the external research (free APIs / analysis / UX) **plus** our internal
triage so nothing gets lost in chat. This is the source of truth for "what next".

**Status legend:** ✅ done · 🔨 in progress · 🟡 strong bet (not started) · 🧊 deferred / skip

---

## Two corrections to the research
- **Fuel price:** we **already derive €/L** from the car's logged `Fuel used price` (manual
  override planned). A HAK/MINGOR scrape would only be a *fallback* when the car didn't log a
  price — low value, and it puts a fragile scraper + network dependency into the otherwise
  stateless server. → **skip.**
- **Date:** the Car Scanner **CSV filename itself** carries the start datetime
  (`YYYY-MM-DD HH-MM-SS`). So the "no calendar date" limitation is fixable **client-side from
  `file.name`** — no `.brc`, no backend change, no sun-elevation guessing.

---

## Do now — free, private, high value — ✅ SHIPPED
1. ✅ **Real drive date from the filename** → history buckets by *actual* date (not upload time);
   enables real day/week/month trends + display "recorded on". Client-side only.
2. ✅ **Fuel-type-aware CO₂** — we hardcode petrol `2.31`; diesel drives currently get the petrol
   factor (should be ~`2.64`). Detect diesel from the `.brc` engine string / a DPF PID → right
   factor. (The petrol 2.31-vs-2.069 debate is minor; the diesel gap is the real bug.)
3. ✅ **Harsh-event min-duration gate (~1 s)** — harsh detection currently can fire on a single
   sample, so a lone sensor spike registers. Require the run to persist ~1 s → kills false
   positives.
4. ✅ **Accessibility pass** — Recharts `accessibilityLayer`, `role="img"` + descriptive
   `aria-label` per chart, **colourblind-safe speed palette** (map + legend + speed chart),
   visually-hidden **data-table fallback** for each chart.

## Strong bets — ✅ RESOLVED (6 & 7 shipped, 5 deferred)
5. 🧊 **Per-engine eco-band calibration** — *investigated 2026-06-08, deferred.* Ran the algorithm on
   real data first: once the band respects an engine-**health** floor (~1500 rpm; low revs under load
   = lugging, which the user requires we never reward), the data-calibrated band clamps back to the
   existing `[1500,2500]` for this diesel — so the "uncalibrated heuristic" gap is small and the code
   doesn't earn its keep yet. Revive for a 2nd/peaky engine or load-aware (BSFC) calibration. Full
   write-up: `docs/specs/2026-06-08-eco-band-calibration-design.md`.
6. ✅ **Drive-to-drive comparison** — *shipped 2026-06-08.* `DriveCompare.tsx` in the History tab:
   metric-delta table (€/km, L/100, eco, CO₂ g/km, idle%) + speed/RPM **distribution histograms**
   (chosen over raw trace overlay — two different routes make distributions the honestly comparable
   view). Client-side. Spec/plan: `docs/specs|plans/2026-06-08-drive-compare-*`.
7. ✅ **Gear inference v2** — *shipped 2026-06-09, reframed.* Data-probed first: the "better
   short-shift" was a proven no-op (v2≈v1, mean |Δ|=0.15pp) and absolute gear numbers are
   unknowable, so it shipped as an **honest gear *visualization*** instead — `analysis/app/gears.py`
   derives gear ratios on the same-instant 1 Hz grid (histogram peaks; the alignment fix that sank
   the earlier attempt), and `GearChart.tsx` (advanced-graphs view) draws an RPM-vs-speed scatter +
   ratio lines + "gears used this drive" with **relative labels only**. Spec/plan:
   `docs/specs|plans/2026-06-09-gear-viz-*`.

## Next batch — agreed 2026-06-09 (do one at a time, fully)
Grounded in the real PID inventory: the logs only continuously capture the economy/dynamics set
(speed, RPM, fuel, distance, accel, GPS). Diesel/health PIDs (DPF regen, coolant temp, EGT, boost,
`Transmission Actual Gear`) are logged **once** per export, and battery voltage not at all — so
Camp-B features need a richer logging profile first (hence #11).
8. ✅ **Manual fuel-price override** — *shipped 2026-06-10.* €/L input in the `Uploader` (remembered in
   localStorage) → `pricePerL` through `api.ts`; an explicit price now OVERRIDES the car's logged
   `Fuel used price` in `metrics.fuel_cost_eur` (one change cascading to cost/€-per-km/projections).
   Affects cost only, not CO₂. Spec/plan: `docs/specs|plans/2026-06-09-fuel-price-override-*`.
9. ✅ **Trim to the driving window** — *shipped 2026-06-10; reframed from leg-segmentation.* Probed
   the gappy logs: they're **not** multi-leg — single drives with a leading/trailing parked diagnostic
   snapshot. So instead of segmenting, `metrics.drive_window` (first→last `RPM>0`) now backs
   `duration_seconds` / `resample_1hz` / `startedAtClock`, fixing the duration/avg-speed/idle inflation
   (~⅓ of drives; e.g. 71→35 min), with a >60 s trim warning. Spec/plan: `docs/specs|plans/2026-06-10-
   drive-window-trim-*`.
10. ✅ **Drive notes & tags + history filter** — *shipped 2026-06-11.* Free-form tags + a note per
    drive (`DriveRow` inline editor → `updateDriveMeta` in IndexedDB); a tag filter bar that narrows
    the whole History view (KPIs + Trends + list together; Compare keeps full). Pure helpers
    `history/tags.ts`. Spec/plan: `docs/specs|plans/2026-06-11-notes-tags-filter-*`.
11. ✅ **PID preset guide** — *shipped 2026-06-11.* A second collapsible in the Landing export guide
    listing optional sensors to log, each mapped to the **existing** (currently-blank) insight it
    unlocks: coolant temp → warm-up time, [ECM] battery voltage → battery health, fuel trim (Bank 1) →
    rich/lean, boost → peak boost. Scoped honestly to built features (DPF-regen / the car's own gear
    stay unmentioned — not built). Spec/plan: `docs/specs|plans/2026-06-11-pid-preset-guide-*`.

## Next batch — proposed 2026-06-11 (user wishlist, triaged; one at a time, fully)
12. ✅ **Batch analyze progress** — *shipped 2026-06-11.* Per-file checklist (waiting/analyzing/✓/✗)
    + overall bar while a multi-file batch analyzes (`BatchProgress.tsx`); **continue past failures**
    (one bad file no longer aborts the rest) + end summary; global error banner only when every file
    fails. Client-side only; no upload-byte %, no parallelism, no server streaming (all considered &
    rejected). Spec/plan: `docs/specs|plans/2026-06-11-batch-progress-*`.
13. ✅ **History multi-select delete** — *shipped 2026-06-11.* Checkbox per drive row + a confirmed
    "Delete selected (N)"; only **visible** checked rows are deleted (tag/car filters can't nuke
    unseen drives); single `refreshHistory` via `App.removeManyStored`.
14. ✅ **Trends average line** — *shipped 2026-06-11.* Dashed `ReferenceLine` at the mean of the
    plotted buckets (equal weight per bucket) + `avg` in the chart's aria/caption text.
15. ✅ **Clear-all-data danger button** — *shipped 2026-06-11.* In the privacy overlay ("your data
    stays here — and here's the delete switch"): confirmed wipe of IndexedDB (drives + cars via the
    existing `clearAll`), `hrvadrive.*` localStorage, and all in-memory state.
16. ✅ **Day/period analysis & compare** — *shipped 2026-06-11.* `Period` gained `'year'`;
    **Spending by period** table (day/week/month/year, latest first — a day row IS the merged "day
    analysis") + **Compare periods** card (A/B buckets, delta table; absolute totals neutral, only
    honest ratios €/km · L/100 · eco judged) — both reuse `bucketBy` and respect the tag/car
    filters. Non-goal kept honest: no merged-day map/charts report (1 Hz series from separate
    drives aren't mergeable). Spec/plan for 13–16: `docs/specs|plans/2026-06-11-history-quad-*`.

## QoL octet — proposed & shipped 2026-06-11 (user: "do all … in one batch")
Spec/plan: `docs/specs|plans/2026-06-11-qol-octet-*`. All client-side, all ✅ shipped 2026-06-11:
17. ✅ **History backup & restore** — privacy-overlay "Download backup" (JSON of drives+cars) +
    "Restore backup" (validated, **merge/upsert — never wipes**). The data-loss guard for the
    browser-only history.
18. ✅ **Duplicate-upload guard** — a file whose filename **recording date** is already in history
    (or earlier in the batch) is `skipped · already in history` in the batch log; no API call, no
    duplicate row. Files without a parseable date are analyzed normally.
19. ✅ **Per-car fuel price** — `Car.pricePerL` (diesel vs petrol differ); selecting a car fills the
    €/L input, a successful analyze persists it (`patchCar`); "No car" keeps the global localStorage
    fallback.
20. ✅ **Drag-and-drop upload** — drop CSVs (or a whole **folder** — recursive entry walk in
    `dnd.ts`) onto the upload box; non-CSVs filtered.
21. ✅ **Retry failed** — `Retry failed (N)` pill in the batch log re-runs only the ✗ files
    (`analyzeFiles` extraction).
22. ✅ **History text search** — `searchDrives` across label/notes/tags; narrows KPIs+Trends+periods
    +list together with the tag/car chips.
23. ✅ **Spend-by-tag** — totals per tag + "(untagged)" row; multi-tagged drives count in each row
    (per-tag view, not a partition — captioned honestly).
24. ✅ **PWA** — vite-plugin-pwa app-shell precache (37 entries), autoUpdate, `/api` excluded from
    the navigate fallback; existing manifest/icons reused. Offline = shell + open report; analysis
    + OSM tiles still need network (already disclosed).

## Round of 2026-06-11 (evening) — direct user asks, all ✅ shipped same day
25. ✅ **Consumption-drift maintenance flag** — probed FIRST on the real 53-drive corpus
    (`scripts/probe_drift.py`): healthy-car rolling drift spanned −15%…+10% winter→summer, so
    **±15%** flags with 0 false alarms. `history/drift.ts` (median last-5 vs baseline-median,
    ≥13 usable drives, per **car** group) + `DriftCard` in History with the maintenance hint and
    honest caveats. Spec: `docs/specs/2026-06-11-consumption-drift-design.md`.
26. ✅ **Select-all** checkbox for the bulk delete (toggles all *visible* rows).
27. ✅ **Parked-log marker** — recordings that never moved (<0.5 km: idle-only/diagnostic) get a
    `parked log · not a real drive` badge + a "Hide parked logs (N)" filter that narrows
    KPIs/trends/periods too. (18 of the user's 53 real files are parked logs.)
28. ✅ **Drive start time in rows + compare picker** (`fmtDriveDateTime`; falls back to the logged
    clock, never the upload moment) and a regression test locking **newest-first** ordering.
29. ✅ **TERMS.md** + in-app terms summary in the privacy overlay; PRIVACY.md refreshed for
    delete-all/backup/per-car-price/PWA-cache. (Template terms — lawyer review before relying on
    them; not legal advice.)

## Places & typical round — 2026-06-11 (late evening), all ✅ shipped
Spec: `docs/specs/2026-06-11-places-typical-design.md`.
30. ✅ **Route place labels + auto-tags** — offline `reverse_geocoder` in the analysis service
    (`app/places.py`, **zero network — OSM deliberately not used**; coords rounded to 2 dp;
    district rows normalised "Zagreb - Centar"→"Zagreb"); `Drive.fromPlace/toPlace` additive.
    Frontend `autotag.ts`: lowercase town tags + **round trip** (route loops within 0.5 km AND
    distance > 2 km); route line on the report's vehicle card. Dup-guard hardened to read
    IndexedDB directly (state-lag race found by a test).
31. ✅ **Latest vs typical** — newest tagged drive vs the **median** of ≥3 previous drives with
    that tag (`history/typical.ts` + `TypicalCompare`); parked logs excluded; only ratio metrics
    judged. Auto-tags qualify, so per-route comparisons work without manual tagging.
32. ✅ **Named places** — user-defined "Home"/"Work" **geo circles** (300 m default) in IndexedDB
    (db v3, `places` store; in `clearAll` and **backups** — old backups still import). Created
    from the open report ("name start/end"), managed in Garage; named places beat towns in tags,
    meta and route labels; matching is fully client-side (privacy bullet added).

## Late-night round — 2026-06-11/12, all ✅ shipped
33. ✅ **Device-to-device sync** — user picked the constraint-preserving option: **QR-paired WebRTC**
    (`docs/specs/2026-06-11-device-sync-design.md`). DataChannel is DTLS (E2E); the server is only a
    transient WS pairing relay (`/sync/{code}`, ≤2 sockets, in-memory, stores nothing; nginx WS
    proxy added); 16 KB chunk framing (`sync/protocol.ts`, tested); merge = existing importAll
    upsert; QR deep link `#sync=CODE`; no STUN/TURN (same-network only — stated in the panel).
    ⚠ Needs a real two-device run post-deploy (WebRTC untestable in jsdom).
Also that night: drive replay (map marker + speed/RPM HUD, 10/30/60×), places overview map in
Garage, place management (rename/radius/move-by-name with additive back-fill `retagDrives`),
map-click place creation, engine-off-gap idle fix (30 s staleness cap — verified on the real
corpus: 941→553 s on the worst drive), real annualised mileage in projections (≥5 drives across
≥14 days, else 15k fallback), backup-download anchor fix.

## Deferred / skip (with reasons)
- 🧊 **Offline vPIC + EEA CO₂ DBs** — heavy infra (67 MB Postgres + registration dataset) for a
  kerb-mass fun-fact and a fuel type we can detect more simply. Revisit only if exact per-car
  mass becomes important. vPIC EU coverage is structurally weak anyway.
- 🧊 **Fuel-price scraping (HAK/MINGOR)** — we already derive €/L; fragile, breaks statelessness.
- 🧊 **Reverse geocoding** — nice ("from X to Y") but adds a dep; if we do it, use offline
  `reverse_geocoder` (zero network) + coarse coord rounding. Optional UX nicety, later.
- 🧊 **VE / air-mass / coast-down road-load physics** — proper expert-view candy, complex; later.
- 🧊 **Heavy gamification (badges / growing tree)** — efficacy is unproven in the literature
  (engagement ≠ behaviour change). A light "beat your best" is fine; don't make it the headline.
- 🧊 **Sun-elevation date inference** — low confidence; the filename date supersedes it.

---

## Reference data worth keeping (from the research — verify before relying)

### CO₂ factors
- **Tailpipe / pure combustion (what we use):** petrol ≈ **2.31**, diesel ≈ **2.64** kg CO₂/L.
- **DEFRA 2025 blend-adjusted (alt, folds in bio blend):** petrol **2.06916**, diesel
  **2.57082** kgCO₂e/L (attribute DEFRA). Diesel ~24 % more per litre than petrol.

### Harsh-event thresholds (industry, for calibration)
- US DOT harsh-brake **0.45 g**; research often **>0.5 g**.
- Telematics (more sensitive): Verizon hard-brake **>0.265 g for ≥1 s**, hard-accel
  **>0.220 g for ≥1 s**, hard-corner **>0.4 g for ≥2 s**. → **require a minimum duration.**
- Ours: 0.30 g accel / −0.35 g brake (between DOT and telematics) + (new) ~1 s min duration.

### Gear inference method (for v2)
- Speed/RPM **ratio** per same-instant sample → **histogram → one peak per gear**
  (US Patent 9,855,842; "continuous adaptation" variants 10,024,685 / 10,436,602 are
  noise-robust by only using short constant-ratio windows).
- Time-align both PIDs onto a common grid **first** (root cause of the earlier revert was
  independent forward-fill smearing RPM↔speed). Gate near-zero speed / idle / clutch-in /
  transients. Smooth: 5 s centred MA + Savitzky–Golay + IQR outlier removal (per Sensors
  PMC12251761). Emit a gear only when the ratio is stable for N consecutive aligned samples.
- Prefer **deterministic histogram peak-detection** over ML (explainable, no training,
  stateless).

### Free APIs / data sources (free, mostly no-key / self-hostable)
- **NHTSA vPIC** — free, no key. Hosted API sends the VIN to a US gov server; the **standalone
  DB** (PostgreSQL ~67 MB, updated monthly) keeps the VIN on-device. Good for *identification*,
  weak for EU configs and exact mass (`GVWR` is a class **range** string; `CurbWeightLB` usually
  empty for cars). Treat blank fields as "no data".
- **EEA CO₂-monitoring dataset** (CC-BY 4.0, attribute EEA) — `m (kg)` = mass in running order
  (closest open EU kerb-mass proxy) + `Ewltp`/`Enedc` CO₂ g/km. **Registration-level, not
  VIN-keyed** → join by make/model/variant; Croatian rows only from mid-2013.
- **Reverse geocoding** — offline **`reverse_geocoder`** (Python, LGPL, **zero network**,
  nearest town) preferred for privacy; self-host **Photon** (Croatia extract, small) for
  street-level. Public Nominatim/Photon: hard **1 req/s + must cache + attribution**, round
  coords first.
- **Elevation** (clean noisy GPS altitude) — **Open-Meteo Elevation** (Copernicus DEM 90 m,
  CC-BY, no key) or self-hosted **OpenTopoData** (SRTM / EU-DTM).
- **Croatian fuel price** — **no official API.** HAK (`hak.hr/info/cijene-goriva`) mirrors the
  MINGOR government-regulated **bi-weekly max price** (scrape). **EU Weekly Oil Bulletin** (EC,
  XLSX, country weekly average) as a coarse cross-check.

---

## Hard constraints (unchanged — respect when building)
Free · no account / no auth · **server stays stateless** (no DB; history = client IndexedDB) ·
**privacy-first** (a drive carries the VIN + home-area GPS — nothing server-side, no PII in the
**public** repo; anything sending VIN/raw GPS to a third party must be self-hostable or coord-
rounded) · single-page, mobile-friendly · small Docker stack (GHCR images, Portainer).
