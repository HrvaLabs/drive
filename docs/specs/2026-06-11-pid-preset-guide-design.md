# Feature 11 — PID preset guide (design)

**Date:** 2026-06-11
**Status:** approved (design) → ready for implementation plan
**Roadmap item:** Next-batch #11 — "extend the Car-Scanner export guide with a recommended
continuous-log PID set."

## Goal

Tell the user which extra sensors to log in Car Scanner so the app can **fill in engine-health
insights it already computes but currently shows blank** for logs that don't carry those PIDs. Honest:
every listed sensor unlocks an EXISTING feature — no unbuilt features are promised.

## Grounding (verified in code)

The analysis consumes these PIDs that the user's default logs lack continuously:

| Existing insight | Code | PID(s) |
|---|---|---|
| Warm-up time | `health.warmup_seconds` | `Engine coolant temperature` |
| Battery health | `health._battery` | `[ECM] Battery Voltage` (best) / `Control module voltage` / `OBD Module Voltage` |
| Fuel-trim (rich/lean) | `health._fuel_trim` | `Short term fuel % trim - Bank 1` + `Long term fuel % trim - Bank 1` |
| Peak boost | `bests._peak_boost_bar` | `Calculated boost` / `Intake manifold absolute pressure` |

Out of scope: DPF-regen and the car's own gear (`Transmission Actual Gear`) — those analyses are NOT
built, so the guide must not mention them.

## Change — content only, `frontend/src/components/Landing.tsx`

Add a SECOND `<details className="guide__box">` inside the existing `<section className="guide"
aria-label="How to export">`, immediately after the current export-steps `</details>` (before the
`</section>`). Reuse the existing `guide__summary` / list styling; no new CSS expected.

- **Summary:** `⚙️ Get more out of it — optional sensors to log`
- **Body:** a one-line intro, then a list mapping each sensor to the insight it unlocks (wording per the
  table above), and a closing "these are optional — the core report works without them." The "how" is
  kept general ("add these to the data Car Scanner records, same recording profile, full precision") —
  no over-specified menu paths.
- Keep the honest framing: these fill in EXISTING insights; nothing here promises a new feature.

## Testing

Create `frontend/src/components/Landing.test.tsx` (RTL): render `Landing` with stub uploader props and
assert the new section is present — the summary text appears, and at least the distinguishing sensor
words (e.g. `coolant`, `fuel trim`, `boost`) render. (Recharts is not used by Landing, so no mock
needed; `Landing` takes `Uploader` props — pass no-op stubs.)

## Out of scope

In-context "missing sensor" hints on the report cards (a richer UX considered and deferred); any backend
change; any new analysis.
