#!/usr/bin/env python3
"""Dev tool: run the analysis pipeline over a folder of vertical-layout drives and
report a table + anomaly summary. Used as the robustness regression gate.

Usage (from repo root):
    analysis/.venv/bin/python scripts/batch_analyze.py [folder]

Default folder: data/exported_records
"""
import glob
import os
import sys

_REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(_REPO, "analysis"))

from app.analysis import build_drive_analysis  # noqa: E402
from app.parsing import parse_vertical  # noqa: E402


def main() -> int:
    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(_REPO, "data", "exported_records")
    files = sorted(glob.glob(os.path.join(folder, "*.csv")))
    if not files:
        print(f"no CSV files in {folder}")
        return 1

    ok = 0
    errors: list[tuple[str, str]] = []
    anomalies: list[tuple[str, list[str]]] = []
    hdr = f"{'file':<22}{'rows':>9}{'min':>5}{'distKm':>8}{'src':>9}{'avg':>5}{'max':>5}{'L100':>6}{'PIDs':>5}  flags"
    print(hdr)
    print("-" * len(hdr))
    for path in files:
        name = os.path.basename(path).replace(".csv", "")[:21]
        try:
            df = parse_vertical(open(path, "rb").read())
            r = build_drive_analysis(df, "vertical_layout", None)
            s = r.summary
            dur = r.drive.durationSeconds
            flags = []
            if not bool((df["pid"].fillna("").str.casefold() == "vehicle speed").any()):
                flags.append("NO_SPEED")
            if not bool(df["lat"].notna().any()):
                flags.append("NO_GPS")
            if s.distanceKm == 0:
                flags.append("DIST0")
            if s.maxSpeedKmh > 0 and s.avgSpeedKmh > s.maxSpeedKmh:
                flags.append("AVG>MAX")
            if s.avgConsumptionL100km > 30:
                flags.append("L100_HI")
            if r.dataQuality.warnings:
                flags.append(f"warn{len(r.dataQuality.warnings)}")
            print(f"{name:<22}{len(df):>9}{dur / 60:>5.0f}{s.distanceKm:>8.1f}"
                  f"{r.dataQuality.distanceSource:>9}{s.avgSpeedKmh:>5.0f}{s.maxSpeedKmh:>5.0f}"
                  f"{s.avgConsumptionL100km:>6.1f}{len(r.dataQuality.pidsPresent):>5}  {','.join(flags)}")
            ok += 1
            hard = [f for f in flags if f in ("AVG>MAX", "L100_HI")]
            if hard:
                anomalies.append((name, hard))
        except Exception as e:  # noqa: BLE001 — a dev tool: report every failure, keep going
            print(f"{name:<22}  *** ERROR: {type(e).__name__}: {e}"[:110])
            errors.append((name, f"{type(e).__name__}: {e}"[:140]))

    print()
    print(f"=== {ok}/{len(files)} OK | {len(errors)} ERRORS | {len(anomalies)} absurd ===")
    for n, m in errors:
        print(f"  ERROR  {n}: {m}")
    for n, f in anomalies:
        print(f"  ABSURD {n}: {','.join(f)}")
    return 1 if (errors or anomalies) else 0


if __name__ == "__main__":
    raise SystemExit(main())
