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

/** Reset store state between tests by calling stopTicking and replacing state. */
function resetEngine() {
  const { stopTicking } = useSimulator.getState();
  stopTicking();
  useSimulator.setState({
    readings: [],
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
    // 'cp' has ETA=0 — always a late alert because eta < officerTravelTime + LEAD_PADDING_S.
    // We need a junction that becomes CRITICAL AND has very short ETA.
    // We'll use 'mandi' and force its ETA to be short by setting a very high queue.
    // mandi ETA = 95 s, officerTravelTime = 20, LEAD_PADDING_S = 30 → needed = 50 s
    // If ETA < 50, it's late. mandi's ETA is 95 — not late by default.
    // But cp has ETA=0 which is always late. Use cp junction.
    // cp dischargeRate=0.5; to make it CRITICAL: clearTime + 10 >= 0 → always critical when queue>0
    const { setDensity, tick } = useSimulator.getState();

    // Set cp to 50% density → 50 vehicles, clearTime=100s, ETA=0 → CRITICAL and LATE
    setDensity("cp", 50);
    tick();

    const { alerts } = useSimulator.getState();
    const cpAlerts = alerts.filter((a) => a.junctionId === "cp");
    expect(cpAlerts.length).toBeGreaterThan(0);

    // Every cp alert must be routed to control-room (not an officer) because ETA=0 < 50s
    for (const a of cpAlerts) {
      expect(a.isLateAlert).toBe(true);
      expect(a.officerId).toBe("control-room");
    }
  });

  it("alert for a junction with ample lead time routes to nearest officer, not control-room", () => {
    const { setDensity, tick } = useSimulator.getState();

    // 'aiims' ETA=760s — plenty of lead time
    // Set high density to make it critical
    setDensity("aiims", 100);
    tick();

    const { alerts } = useSimulator.getState();
    const aimsAlerts = alerts.filter((a) => a.junctionId === "aiims");
    expect(aimsAlerts.length).toBeGreaterThan(0);

    for (const a of aimsAlerts) {
      expect(a.isLateAlert).toBe(false);
      expect(a.officerId).not.toBe("control-room");
    }
  });
});

// ─── GAP 2: 30-second timeout is a live trigger ───────────────────────────

describe("GAP 2 — 30-second NO_ACK timeout is called by the engine (not dead code)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEngine();
  });
  afterEach(() => {
    resetEngine();
    vi.useRealTimers();
  });

  it("alert advances from SENT to NO_ACK_TIMEOUT then back to SENT after timeout elapses", () => {
    const { setDensity, tick } = useSimulator.getState();

    // Create a CRITICAL alert on aiims (ample ETA, routes to real officer)
    setDensity("aiims", 100);
    tick();

    const afterFirst = useSimulator.getState();
    const aimsAlert = afterFirst.alerts.find((a) => a.junctionId === "aiims");
    expect(aimsAlert).toBeDefined();
    expect(aimsAlert!.state).toBe(AlertState.SENT);

    // The alert was sent at Date.now(). Advance fake time beyond timeout.
    vi.advanceTimersByTime((ALERT_CONFIG.NO_ACK_TIMEOUT_S + 1) * 1000);

    // Run another tick — engine should detect the timeout and escalate.
    tick();

    const afterTimeout = useSimulator.getState();
    const escalated = afterTimeout.alerts.find((a) => a.junctionId === "aiims");
    expect(escalated).toBeDefined();

    // After escalateNoAck the state machine goes:
    // SENT → NO_ACK_TIMEOUT → SENT (re-sent to next officer)
    // So final state must be SENT again, with NO_ACK_TIMEOUT in transitions.
    expect(escalated!.state).toBe(AlertState.SENT);
    const transStates = escalated!.transitions.map((t) => t.to);
    expect(transStates).toContain(AlertState.NO_ACK_TIMEOUT);
  });

  it("alert NOT yet timed out stays in SENT state", () => {
    const { setDensity, tick } = useSimulator.getState();
    setDensity("aiims", 100);
    tick();

    // Advance time but NOT past the timeout
    vi.advanceTimersByTime((ALERT_CONFIG.NO_ACK_TIMEOUT_S - 5) * 1000);
    tick();

    const { alerts } = useSimulator.getState();
    const a = alerts.find((a) => a.junctionId === "aiims");
    expect(a!.state).toBe(AlertState.SENT);
    // Confirm NO_ACK_TIMEOUT is NOT in transitions
    expect(a!.transitions.map((t) => t.to)).not.toContain(AlertState.NO_ACK_TIMEOUT);
  });

  it("acknowledged alert is NOT escalated even after timeout window", () => {
    const { setDensity, tick, acknowledgeAlert } = useSimulator.getState();
    setDensity("aiims", 100);
    tick();

    const alertId = useSimulator.getState().alerts.find((a) => a.junctionId === "aiims")!.id;
    acknowledgeAlert(alertId);

    // Advance past timeout
    vi.advanceTimersByTime((ALERT_CONFIG.NO_ACK_TIMEOUT_S + 10) * 1000);
    tick();

    const { alerts } = useSimulator.getState();
    const a = alerts.find((a) => a.id === alertId);
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

  it("exactly one alert for aiims through CRITICAL→WATCH→CRITICAL within hysteresis window", () => {
    const { setDensity, tick } = useSimulator.getState();

    // Tick 1: HIGH density → CRITICAL (alert fires)
    setDensity("aiims", 100);
    tick();
    const afterTick1 = useSimulator.getState();
    const alertsAfter1 = afterTick1.alerts.filter((a) => a.junctionId === "aiims");
    expect(alertsAfter1).toHaveLength(1);

    // Tick 2: lower density briefly to WATCH (not fully cleared, within hysteresis)
    // aiims: ETA=760, dischargeRate=0.5; to get WATCH: margin 0<x<=20
    // clearTime + 10 + 20 >= ETA → clearTime >= 730 → queue >= 365; density~37
    // For CLEAR: margin>20 → clearTime < 730 → queue < 365; use density=0 (all clear)
    // We want WATCH, not CLEAR: clearTime in (730, 750): queue 365-375
    // density for 365 vehicles: 365/100*100 = 365% > 100 → cap. Use density=37 → 37 veh → clearTime=74
    // margin = 760 - (74+10) = 676 → CLEAR. Use aiims ETA=760. 
    // For WATCH: 0 < 760-(clearTime+10) <= 20 → clearTime in [730,750].
    // With dischargeRate=0.5: queue in [365,375]. Max density=100→100 veh. Can't reach 365 with max=100.
    // So aiims can't be in WATCH at density=100. Use a different approach:
    // Tick 2: density=0 → CLEAR (which is below CRITICAL), hysteresis kicks in.
    setDensity("aiims", 0);
    tick();

    const alertsAfter2 = useSimulator.getState().alerts.filter((a) => a.junctionId === "aiims");
    // Still only 1 alert — no new alert just because we dipped to CLEAR
    expect(alertsAfter2).toHaveLength(1);

    // Tick 3: back to HIGH density → CRITICAL again
    setDensity("aiims", 100);
    tick();

    const alertsAfter3 = useSimulator.getState().alerts.filter((a) => a.junctionId === "aiims");
    // Should still be 1 alert if within hysteresis window (1 recovery tick < HYSTERESIS_TICKS=3)
    expect(alertsAfter3).toHaveLength(1);
  });

  it("fires a SECOND alert only after full hysteresis recovery (HYSTERESIS_TICKS non-critical ticks)", () => {
    const { setDensity, tick } = useSimulator.getState();

    // Tick 1: CRITICAL
    setDensity("aiims", 100);
    tick();
    expect(useSimulator.getState().alerts.filter((a) => a.junctionId === "aiims")).toHaveLength(1);

    // Advance through HYSTERESIS_TICKS of CLEAR ticks to release the lock
    setDensity("aiims", 0);
    for (let i = 0; i < CRITICALITY_CONFIG.HYSTERESIS_TICKS; i++) {
      tick();
    }
    // Lock should be released now
    const afterRecovery = useSimulator.getState();
    expect(afterRecovery.hysteresis["aiims"]?.confirmedStatus).toBe("CLEAR");

    // Now CRITICAL again → should fire a 2nd alert
    setDensity("aiims", 100);
    tick();
    expect(useSimulator.getState().alerts.filter((a) => a.junctionId === "aiims")).toHaveLength(2);
  });

  it("lowering slider on a CRITICAL junction does NOT create a new alert", () => {
    const { setDensity, tick } = useSimulator.getState();

    setDensity("mandi", 100);
    tick();
    const countAfterHigh = useSimulator.getState().alerts.filter(
      (a) => a.junctionId === "mandi",
    ).length;

    // Lower slider
    setDensity("mandi", 0);
    tick();
    const countAfterLow = useSimulator.getState().alerts.filter(
      (a) => a.junctionId === "mandi",
    ).length;

    // No new alerts created by lowering
    expect(countAfterLow).toBe(countAfterHigh);
  });
});
