# Features 30–31 — route places + auto-tags, drive-vs-typical (design)

**Date:** 2026-06-11
**Status:** approved (user: ""Zagreb → Split" would be so cool" + "auto tag … round trip, i think we
can use OSM") → implementation
**Roadmap items:** #30 route place labels + auto-tags · #31 drive-vs-typical compare

**OSM not used — deliberately.** Public Nominatim/Photon would send drive coordinates to a third
party (and is hard-limited to 1 req/s with mandatory caching). The roadmap's deferred-ideas entry
already picked the privacy-correct path: the **offline `reverse_geocoder`** Python package (bundled
cities dataset, **zero network**, nearest-town resolution). Verified locally: Zagreb/Split coords
resolve correctly. The privacy story stays "no other external calls".

## 30a — Route places (analysis service)

- New `analysis/app/places.py`: `route_places(df) -> (fromPlace, toPlace)` — first/last GPS fix,
  coords **rounded to 2 dp (~1.1 km)** before lookup (hygiene), `rg.search(..., mode=1)` (mode 1 =
  single-process; safe in Docker). No GPS → `(None, None)`. The dataset loads lazily on the first
  call (~2 s once per process).
- `models.Drive` gains `fromPlace: str | None` / `toPlace: str | None` (additive; schema stays "1").
  Wired in `build_drive_analysis`. `reverse_geocoder~=1.5` joins `requirements.txt`.
- Resolution is honest **nearest-town** (cities1000): "Zagreb → Split", not street-level.

## 30b — Auto-tags + display (frontend)

- `history/autotag.ts`: `autoTags(analysis): string[]` —
  - lowercase place tags from `fromPlace`/`toPlace` (deduped: a Zagreb→Zagreb drive yields one
    `zagreb` tag);
  - **`round trip`** when the route's first and last GPS points are within **0.5 km** of each other
    AND `distanceKm > 2` (a genuine loop — the distance guard keeps parked logs out; town-equality
    is NOT used, a cross-town errand isn't a round trip).
- `db.toStored`: `tags: autoTags(analysis)` instead of `[]`; meta gains `fromPlace?`/`toPlace?`.
  Users can delete/edit auto-tags like any tag (existing editor). Old drives simply lack them.
- `SummaryCard`: a route line when places exist — `Zagreb → Split` (single `Zagreb` when equal).
- Synergy, free of charge: place tags & `round trip` flow into the tag filter, **Spend by tag**, and
  #31's typical-compare.

## 31 — Drive vs typical (`TypicalCompare.tsx`, after Compare drives)

- Pure helper `history/typical.ts`: for a tag, `latest` = most recent **usable** (non-parked) drive
  carrying it; `typical` = **medians** of the previous usable drives with that tag (needs ≥ 3
  previous). Rows (reusing `CompareRow` + `deltaColor`): Distance km (neutral), Cost € (neutral),
  €/km (down=better), L/100km (down=better, 0→null), Eco (up=better).
- Card: tag picker over qualifying tags (≥ 4 usable drives), default = first qualifying; header
  "Latest vs typical · median of N previous ⟨tag⟩ drives". Hidden when nothing qualifies. Receives
  `shown` (filters apply) + renders nothing rather than judging thin data.

## Honesty constraints

- Place names never leave the device/server pair (offline lookup inside the stateless analysis
  call); PRIVACY.md's "no other external services" stays true.
- "Typical" is a median, labeled with its sample size; no judgment colours on absolute totals.

## Testing

- `analysis/tests/test_places.py`: Zagreb→Split coords resolve; no-GPS frame → Nones; coords are
  rounded before lookup.
- `autotag.test.ts`: place tags lowercase + deduped; round-trip geometry (loop + distance guard);
  no GPS → no tags.
- `db.test.ts`: `toStored` seeds auto-tags + `fromPlace`/`toPlace` meta.
- `SummaryCard.test.tsx`: route line shown / single-place collapse / hidden without places.
- `typical.test.ts`: medians + ≥3-previous gate + parked exclusion; `TypicalCompare.test.tsx`:
  hidden when thin, picker lists qualifying tags only, deltas vs typical render.
