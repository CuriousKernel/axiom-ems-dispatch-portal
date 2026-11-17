/**
 * src/lib/__tests__/engine-gaps.test.ts
 *
 * Tests that directly verify the three gaps identified in review:
 *
 *  GAP 1 — LATE_ALERT routing: when a junction goes critical with insufficient
 *           lead time, the alert's officerId must be "control-room", not an officer.
 *
 *  GAP 2 — 30-second timeout trigger: escalateNoAck is called by the engine
 *           when ALERT_CONFIG.NO_ACK_TIMEOUT_S elapse without acknowledgement.
 *           This proves it is NOT dead code.
 *
 *  GAP 3 — Flapping suppression: a junction that oscillates CRITICAL→WATCH→CRITICAL
 *           within the hysteresis window fires exactly ONE alert, not two.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSimulator } from "../simulator-engine";
import { ALERT_CONFIG, AlertState } from "../alerts";
import { CRITICALITY_CONFIG } from "../criticality";

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Reset store state between tests by calling stopEngine and replacing state. */
function resetEngine() {
  const { stopEngine } = useSimulator.getState();
  stopEngine();
  useSimulator.setState({
    readings: {},
    confirmedStatuses: {},
    hysteresis: {},
    alerts: [],
    events: [],
    _tickHandle: null,
  });
}

// ─── GAP 1: LATE_ALERT routing ────────────────────────────────────────────

describe("GAP 1 — LATE_ALERT routes to control-room, not an officer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEngine();
  });
  afterEach(() => {
    resetEngine();
    vi.useRealTimers();
  });

  it("alert for a short-ETA junction (insufficient lead time) has officerId=control-room", () => {
    // 'cp' has ETA=0 — always a late alert because eta < officerTravelTime + LEAD_PADDING_S (20 + 30 = 50s).
    const { setDensity, tick } = useSimulator.getState();

    setDensity("cp", 50);
    tick(0.1);

    const { alerts } = useSimulator.getState();
    const cpAlerts = alerts.filter((a) => a.junctionId === "cp");
    expect(cpAlerts.length).toBeGreaterThan(0);

    for (const a of cpAlerts) {
      expect(a.isLateAlert).toBe(true);
      expect(a.officerId).toBe("control-room");
    }
  });

  it("alert for a junction with ample lead time routes to nearest officer, not control-room", () => {
    const { setDensity, tick } = useSimulator.getState();

    // 'mandi' default ETA ~95s (from route-data). With density 100 -> clearTime=200s -> CRITICAL.
    // 95 >= 50s lead time -> NOT a late alert.
    setDensity("mandi", 100);
    tick(0.1);

    const { alerts } = useSimulator.getState();
    const mandiAlerts = alerts.filter((a) => a.junctionId === "mandi");
    expect(mandiAlerts.length).toBeGreaterThan(0);

    for (const a of mandiAlerts) {
      expect(a.isLateAlert).toBe(false);
      expect(a.officerId).not.toBe("control-room");
    }
  });
});

// ─── GAP 2: 30-second simulation-clock timeout is a live trigger ───────────────────────────

describe("GAP 2 — 30-second NO_ACK timeout is called by the engine (not dead code)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEngine();
  });
  afterEach(() => {
    resetEngine();
    vi.useRealTimers();
  });

  it("alert advances from SENT to NO_ACK_TIMEOUT then back to SENT after timeout elapses in sim time", () => {
    const { setDensity, tick } = useSimulator.getState();

    // Create a CRITICAL alert on mandi
    setDensity("mandi", 100);
    tick(0.1);

    const afterFirst = useSimulator.getState();
    const mandiAlert = afterFirst.alerts.find((a) => a.junctionId === "mandi");
    expect(mandiAlert).toBeDefined();
    expect(mandiAlert!.state).toBe(AlertState.SENT);

    const alertId = mandiAlert!.id;
    const sentTime = afterFirst.sentAtSimTime[alertId] ?? 0;

    // Directly advance simTimeSeconds past the timeout threshold
    useSimulator.setState({
      simTimeSeconds: sentTime + ALERT_CONFIG.NO_ACK_TIMEOUT_S + 1,
    });

    // Run another tick — engine should detect the sim-clock timeout and escalate.
    tick(0.1);

    const afterTimeout = useSimulator.getState();
    const escalated = afterTimeout.alerts.find((a) => a.junctionId === "mandi");
    expect(escalated).toBeDefined();

    // After escalateNoAck the state machine goes:
    // SENT → NO_ACK_TIMEOUT → SENT (re-sent to next officer)
    expect(escalated!.state).toBe(AlertState.SENT);
    const transStates = escalated!.transitions.map((t) => t.to);
    expect(transStates).toContain(AlertState.NO_ACK_TIMEOUT);
  });

  it("alert NOT yet timed out stays in SENT state", () => {
    const { setDensity, tick } = useSimulator.getState();
    setDensity("mandi", 100);
    tick(0.1);

    const afterFirst = useSimulator.getState();
    const alertId = afterFirst.alerts.find((a) => a.junctionId === "mandi")!.id;
    const sentTime = afterFirst.sentAtSimTime[alertId] ?? 0;

    // Advance just below the timeout
    useSimulator.setState({
      simTimeSeconds: sentTime + ALERT_CONFIG.NO_ACK_TIMEOUT_S - 5,
    });
    tick(0.1);

    const { alerts } = useSimulator.getState();
    const a = alerts.find((a) => a.id === alertId);
    expect(a).toBeDefined();
    expect(a!.state).toBe(AlertState.SENT);
    expect(a!.transitions.map((t) => t.to)).not.toContain(AlertState.NO_ACK_TIMEOUT);
  });

  it("acknowledged alert is NOT escalated even after timeout window", () => {
    const { setDensity, tick, acknowledgeAlert } = useSimulator.getState();
    setDensity("mandi", 100);
    tick(0.1);

    const afterFirst = useSimulator.getState();
    const alertId = afterFirst.alerts.find((a) => a.junctionId === "mandi")!.id;
    const sentTime = afterFirst.sentAtSimTime[alertId] ?? 0;

    acknowledgeAlert(alertId, "o2");

    // Advance past timeout
    useSimulator.setState({
      simTimeSeconds: sentTime + ALERT_CONFIG.NO_ACK_TIMEOUT_S + 10,
    });
    tick(0.1);

    const { alerts } = useSimulator.getState();
    const a = alerts.find((a) => a.id === alertId);
    expect(a).toBeDefined();
    expect(a!.state).toBe(AlertState.ACKNOWLEDGED);
    expect(a!.transitions.map((t) => t.to)).not.toContain(AlertState.NO_ACK_TIMEOUT);
  });
});

// ─── GAP 3: Flapping suppression ─────────────────────────────────────────

describe("GAP 3 — flapping: CRITICAL→WATCH→CRITICAL fires only one alert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEngine();
  });
  afterEach(() => {
    resetEngine();
    vi.useRealTimers();
  });

  it("exactly one alert for mandi through CRITICAL→WATCH/CLEAR→CRITICAL within hysteresis window", () => {
    const { setDensity, tick } = useSimulator.getState();

    // Tick 1: HIGH density → CRITICAL (alert fires)
    setDensity("mandi", 100);
    tick(0.1);
    const afterTick1 = useSimulator.getState();
    const alertsAfter1 = afterTick1.alerts.filter((a) => a.junctionId === "mandi");
    expect(alertsAfter1).toHaveLength(1);

    // Tick 2: lower density briefly to 0 (recovery tick 1 < HYSTERESIS_TICKS=3)
    setDensity("mandi", 0);
    tick(0.1);

    const alertsAfter2 = useSimulator.getState().alerts.filter((a) => a.junctionId === "mandi");
    expect(alertsAfter2).toHaveLength(1);

    // Tick 3: back to HIGH density → CRITICAL again
    setDensity("mandi", 100);
    tick(0.1);

    const alertsAfter3 = useSimulator.getState().alerts.filter((a) => a.junctionId === "mandi");
    // Should still be 1 alert (1 recovery tick < HYSTERESIS_TICKS=3)
    expect(alertsAfter3).toHaveLength(1);
  });

  it("fires a SECOND alert only after full hysteresis recovery (HYSTERESIS_TICKS non-critical ticks)", () => {
    const { setDensity, tick } = useSimulator.getState();

    // Tick 1: CRITICAL
    setDensity("mandi", 100);
    tick(0.1);
    expect(useSimulator.getState().alerts.filter((a) => a.junctionId === "mandi")).toHaveLength(1);

    // Advance through HYSTERESIS_TICKS of CLEAR ticks to release the lock
    setDensity("mandi", 0);
    for (let i = 0; i < CRITICALITY_CONFIG.HYSTERESIS_TICKS; i++) {
      tick(0.1);
    }
    // Lock should be released now
    const afterRecovery = useSimulator.getState();
    expect(afterRecovery.hysteresis["mandi"]?.confirmedStatus).toBe("CLEAR");

    // Now CRITICAL again → should fire a 2nd alert
    setDensity("mandi", 100);
    tick(0.1);
    expect(useSimulator.getState().alerts.filter((a) => a.junctionId === "mandi")).toHaveLength(2);
  });

  it("lowering slider on a CRITICAL junction does NOT create a new alert", () => {
    const { setDensity, tick } = useSimulator.getState();

    setDensity("mandi", 100);
    tick(0.1);
    const countAfterHigh = useSimulator.getState().alerts.filter(
      (a) => a.junctionId === "mandi",
    ).length;

    // Lower slider
    setDensity("mandi", 0);
    tick(0.1);
    const countAfterLow = useSimulator.getState().alerts.filter(
      (a) => a.junctionId === "mandi",
    ).length;

    // No new alerts created by lowering
    expect(countAfterLow).toBe(countAfterHigh);
  });
});
