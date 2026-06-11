import pandas as pd

from app import events


def _df(rows):
    # rows: list of (t, pid, value, lat, lon)
    return pd.DataFrame(
        [{"t": t, "pid": p, "value": v, "unit": "", "lat": la, "lon": lo} for (t, p, v, la, lo) in rows]
    )


def test_idle_event_from_stopped_engine_on():
    rows = [(float(t), "Vehicle speed", 0.0, 45.0, 15.0) for t in range(0, 5)]
    rows += [(float(t), "Engine RPM", 800.0, 45.0, 15.0) for t in range(0, 5)]
    evts = events.detect_events(_df(rows))
    idle = [e for e in evts if e.type == "idle"]
    assert len(idle) == 1
    assert idle[0].durationSeconds >= 3.0


def test_hard_brake_event_from_acceleration():
    # a sustained (>=0.8s) brake, then a sustained accel
    rows = [(0.0, "Vehicle acceleration", 0.05, 45.0, 15.0),
            (1.0, "Vehicle acceleration", -0.5, 45.0, 15.0),  # hard brake run...
            (1.5, "Vehicle acceleration", -0.5, 45.0, 15.0),
            (2.0, "Vehicle acceleration", -0.4, 45.0, 15.0),
            (3.0, "Vehicle acceleration", 0.1, 45.0, 15.0),
            (4.0, "Vehicle acceleration", 0.4, 45.0, 15.0),   # hard accel run...
            (4.5, "Vehicle acceleration", 0.45, 45.0, 15.0),
            (5.0, "Vehicle acceleration", 0.35, 45.0, 15.0)]
    evts = events.detect_events(_df(rows))
    brake = next(e for e in evts if e.type == "hard_brake")
    assert brake.value == -0.5 and brake.durationSeconds >= 0.8  # reports peak g + duration
    assert any(e.type == "hard_accel" for e in evts)


def test_single_sample_spike_is_not_harsh():
    # a lone over-threshold sample (sensor glitch) is ignored — needs >=0.8s
    rows = [(0.0, "Vehicle acceleration", 0.1, 45.0, 15.0),
            (1.0, "Vehicle acceleration", -0.9, 45.0, 15.0),  # single spike
            (2.0, "Vehicle acceleration", 0.1, 45.0, 15.0)]
    evts = events.detect_events(_df(rows))
    assert not any(e.type in ("hard_brake", "hard_accel") for e in evts)


def test_high_rpm_event():
    rows = [(float(t), "Engine RPM", 3200.0, 45.0, 15.0) for t in range(0, 4)]
    rows += [(float(t), "Vehicle speed", 80.0, 45.0, 15.0) for t in range(0, 4)]
    evts = events.detect_events(_df(rows))
    assert any(e.type == "high_rpm" for e in evts)


def test_no_events_on_gentle_data():
    rows = [(float(t), "Vehicle speed", 50.0, 45.0, 15.0) for t in range(0, 5)]
    rows += [(float(t), "Engine RPM", 2000.0, 45.0, 15.0) for t in range(0, 5)]
    rows += [(float(t), "Vehicle acceleration", 0.1, 45.0, 15.0) for t in range(0, 5)]
    evts = events.detect_events(_df(rows))
    assert evts == []


def test_adjacent_accel_then_brake_are_two_events():
    # a sustained accel run immediately followed by a sustained brake run (direction
    # change, no sub-threshold gap) must still yield BOTH events
    rows = [(0.0, "Vehicle acceleration", 0.4, 45.0, 15.0),
            (0.5, "Vehicle acceleration", 0.4, 45.0, 15.0),
            (1.0, "Vehicle acceleration", 0.4, 45.0, 15.0),
            (1.5, "Vehicle acceleration", -0.5, 45.0, 15.0),
            (2.0, "Vehicle acceleration", -0.5, 45.0, 15.0),
            (2.5, "Vehicle acceleration", -0.5, 45.0, 15.0)]
    kinds = [e.type for e in events.detect_events(_df(rows))]
    assert kinds.count("hard_accel") == 1
    assert kinds.count("hard_brake") == 1
