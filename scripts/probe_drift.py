#!/usr/bin/env python3
"""Dev probe: evaluate a consumption-drift detector on the real drive corpus.

Replicates exactly what the frontend would see (DriveMeta.l100km per drive,
ordered by the filename date), then runs the candidate detector at every point
in time to count flags / false alarms across the year.

Detector candidate (mirrors the planned frontend helper):
  - input: chronological real drives (distance >= 0.5 km, l100 > 0)
  - baseline = median l100 of drives BEFORE the recent window (need >= 8)
  - recent   = median l100 of the last 5 drives
  - drift%   = (recent - baseline) / baseline * 100; flag at >= +15%

Usage (from repo root):
    analysis/.venv/bin/python scripts/probe_drift.py [folder]
"""
import glob
import os
import re
import statistics
import sys

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO, "analysis"))

from app.analysis import build_drive_analysis  # noqa: E402
from app.parsing import parse_vertical  # noqa: E402

BASELINE_MIN = 8
RECENT_N = 5
THRESHOLD_PCT = 15.0


def detect(series: list[float]) -> tuple[float, float, float] | None:
    """(baseline, recent, drift%) or None when there's not enough data."""
    if len(series) < BASELINE_MIN + RECENT_N:
        return None
    baseline = statistics.median(series[:-RECENT_N])
    recent = statistics.median(series[-RECENT_N:])
    if baseline <= 0:
        return None
    return baseline, recent, (recent - baseline) / baseline * 100


def main() -> int:
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(_REPO, "data", "exported_records")
    rows: list[tuple[str, float, float]] = []  # (date, distanceKm, l100)
    for path in sorted(glob.glob(os.path.join(folder, "*.csv"))):
        name = os.path.basename(path)
        if not re.match(r"\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}", name):
            continue
        try:
            df = parse_vertical(open(path, "rb").read())
            r = build_drive_analysis(df, "vertical_layout", None)
            rows.append((name[:19], r.summary.distanceKm, r.summary.avgConsumptionL100km))
        except Exception as e:  # noqa: BLE001
            print(f"  SKIP {name}: {type(e).__name__}: {e}"[:100])

    rows.sort()
    usable = [(d, km, l) for d, km, l in rows if km >= 0.5 and l > 0]
    print(f"{len(rows)} parsed · {len(usable)} usable (moved >=0.5 km, has fuel)\n")
    print(f"{'date':<20}{'km':>7}{'L/100':>7}   rolling-drift")
    series: list[float] = []
    flags = 0
    for d, km, l in usable:
        series.append(l)
        res = detect(series)
        note = ""
        if res:
            base, rec, pct = res
            note = f"base {base:.1f} → recent {rec:.1f} = {pct:+.0f}%"
            if pct >= THRESHOLD_PCT:
                note += "  ⚠ FLAG"
                flags += 1
        print(f"{d:<20}{km:>7.1f}{l:>7.1f}   {note}")
    print(f"\nflag fired at {flags}/{max(0, len(usable) - BASELINE_MIN - RECENT_N + 1)} evaluated points "
          f"(threshold +{THRESHOLD_PCT:.0f}%, baseline n>={BASELINE_MIN}, recent n={RECENT_N})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
