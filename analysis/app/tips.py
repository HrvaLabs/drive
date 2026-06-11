from app.models import Economy, Event, Health, Scores, Summary, Tip

_IDLE_PCT_WARN = 10.0
_SHORT_SHIFT_PCT = 12.0
_SWEET_SPOT_GAP_KMH = 15.0
_ECO_GREAT = 70
_IDLE_OFF_THRESHOLD_S = 60  # only long stops clearly beat a restart once starter/battery wear is counted


def build_tips(events: list[Event], scores: Scores, health: Health, summary: Summary,
               economy: Economy | None = None) -> list[Tip]:
    """Evidence-cited tips; actionable ones carry a € impact from `economy`."""
    eco = economy or Economy()
    tips: list[Tip] = []
    idle_n = sum(1 for e in events if e.type == "idle")
    idle_long = sum(1 for e in events if e.type == "idle" and (e.durationSeconds or 0) >= _IDLE_OFF_THRESHOLD_S)
    coasting_n = sum(1 for e in events if e.type == "coasting")
    high_n = sum(1 for e in events if e.type == "high_rpm")

    if scores.idlePct >= _IDLE_PCT_WARN:
        waste = f" (≈ €{eco.idleWasteEur} of fuel)" if eco.idleWasteEur > 0 else ""
        advice = (f" {idle_long} lasted over a minute — switching off for long stops like those saves fuel. "
                  f"(Brief stops aren't worth it: without auto stop-start, frequent restarts add starter and "
                  f"battery wear.)" if idle_long
                  else " Switching the engine off for genuinely long stops saves fuel.")
        tips.append(Tip(id="reduce_idle", severity="warn", title="Cut idling",
                        eurImpact=eco.idleWasteEur or None,
                        detail=f"You idled {scores.idlePct}% of the drive ({idle_n} stops){waste}.{advice}"))
    if scores.harshEvents > 0:
        tips.append(Tip(id="smoother", severity="warn", title="Smoother inputs",
                        detail=f"{scores.harshEvents} harsh accel/brake events. Anticipating "
                               f"earlier saves fuel and brakes."))
    if scores.shortShiftPct >= _SHORT_SHIFT_PCT:
        tips.append(Tip(id="short_shift", severity="info", title="Short-shift",
                        detail=f"About {scores.shortShiftPct}% of the time you were revving high in a "
                               f"lower gear than needed — upshifting sooner there keeps revs and fuel down. "
                               f"(High revs in top gear at speed don't count.)"))
    if (economy and economy.sweetSpotKmh is not None
            and abs(summary.avgSpeedKmh - economy.sweetSpotKmh) >= _SWEET_SPOT_GAP_KMH):
        tips.append(Tip(id="sweet_spot", severity="info", title="Find the sweet spot",
                        detail=f"This drive was most efficient around {round(economy.sweetSpotKmh)} km/h. "
                               f"Cruising there when you can keeps consumption down."))
    if coasting_n > 0:
        tips.append(Tip(id="coasting_good", severity="good", title="Great coasting",
                        detail=f"You coasted with the fuel cut-off {coasting_n} times — that uses "
                               f"zero fuel. Keep it up."))
    if health.batteryVerdict == "low":
        tips.append(Tip(id="battery_low", severity="warn", title="Check the battery",
                        detail=f"Battery voltage read low ({health.batteryVolts} V). Worth a check "
                               f"if it persists."))
    if health.fuelTrimVerdict in ("lean", "rich"):
        tips.append(Tip(id="fuel_trim", severity="warn", title="Fuel trim looks off",
                        detail=f"Fuel trim is running {health.fuelTrimVerdict} — worth checking for an "
                               f"intake leak or a tired sensor if it keeps showing."))
    if high_n > 0:
        tips.append(Tip(id="high_rpm", severity="info", title="Watch the revs",
                        detail=f"The engine spent {high_n} stretch(es) above 3000 rpm. Short-shifting "
                               f"keeps revs, fuel use and noise down."))
    if eco.potentialSavingsEur and eco.potentialSavingsEur > 0:
        tips.append(Tip(id="potential_savings", severity="info", title="Money on the table",
                        eurImpact=eco.potentialSavingsEur,
                        detail=f"Driving more efficiently could save roughly €{eco.potentialSavingsEur} "
                               f"on a drive like this."))
    if scores.eco >= _ECO_GREAT:
        tips.append(Tip(id="eco_great", severity="good", title="Excellent eco-driving",
                        detail=f"Strong eco score of {scores.eco}/100 — smooth, efficient driving."))
    # Only add the generic "smooth drive" praise when nothing else (warn or good) fired.
    if not any(t.severity == "warn" for t in tips) and not any(t.severity == "good" for t in tips):
        tips.insert(0, Tip(id="all_good", severity="good", title="Smooth drive",
                          detail="No obvious eco issues this drive — nicely done."))
    return tips
