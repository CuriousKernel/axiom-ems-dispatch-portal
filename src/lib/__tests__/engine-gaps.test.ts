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

    // 'mandi' ETA=95s, officerTravelTime=20, LEAD_PADDING_S=30 -> needs 50s of lead.
    // Density 100 -> 100 vehicles / 0.5 = 200s clear time -> CRITICAL, but 95 >= 50 so NOT late.
    // (aiims can't be used: ETA 760s is unreachable with max 100 vehicles, so it stays CLEAR.)
    setDensity("mandi", 100);
    tick();

    const { alerts } = useSimulator.getState();
    const mandiAlerts = alerts.filter((a) => a.junctionId === "mandi");
    expect(mandiAlerts.length).toBeGreaterThan(0);

    for (const a of mandiAlerts) {
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

    // Create a CRITICAL alert on mandi (ample lead time, routes to a real officer)
    setDensity("mandi", 100);
    tick();

    const afterFirst = useSimulator.getState();
    const mandiAlert = afterFirst.alerts.find((a) => a.junctionId === "mandi");
    expect(mandiAlert).toBeDefined();
    expect(mandiAlert!.state).toBe(AlertState.SENT);

    // The alert was sent at Date.now(). Advance fake time beyond timeout.
    vi.advanceTimersByTime((ALERT_CONFIG.NO_ACK_TIMEOUT_S + 1) * 1000);

    // Run another tick — engine should detect the timeout and escalate.
    tick();

    const afterTimeout = useSimulator.getState();
    const escalated = afterTimeout.alerts.find((a) => a.junctionId === "mandi");
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
    setDensity("mandi", 100);
    tick();

    // Advance time but NOT past the timeout
    vi.advanceTimersByTime((ALERT_CONFIG.NO_ACK_TIMEOUT_S - 5) * 1000);
    tick();

    const { alerts } = useSimulator.getState();
    const a = alerts.find((a) => a.junctionId === "mandi");
    expect(a!.state).toBe(AlertState.SENT);
    // Confirm NO_ACK_TIMEOUT is NOT in transitions
    expect(a!.transitions.map((t) => t.to)).not.toContain(AlertState.NO_ACK_TIMEOUT);
  });

  it("acknowledged alert is NOT escalated even after timeout window", () => {
    const { setDensity, tick, acknowledgeAlert } = useSimulator.getState();
    setDensity("mandi", 100);
    tick();

    const alertId = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi")!.id;
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

  it("exactly one alert for mandi through CRITICAL->WATCH->CRITICAL within hysteresis window", () => {
    const { setDensity, tick } = useSimulator.getState();
    const mandiAlerts = () =>
      useSimulator.getState().alerts.filter((a) => a.junctionId === "mandi");

    // mandi: ETA=95s, discharge 0.5/s, buffer 10s, watch window 20s.
    // density 100 -> 100 veh -> clear 200s -> CRITICAL.
    // density 35  -> 35 veh  -> clear 70s  -> margin 95-(70+10)=15 -> WATCH.
    setDensity("mandi", 100); // setDensity also ticks once
    tick();
    expect(mandiAlerts()).toHaveLength(1);

    // Dip to WATCH for 2 ticks (< HYSTERESIS_TICKS=3): lock must hold.
    setDensity("mandi", 35);
    tick();
    expect(useSimulator.getState().readings.find((r) => r.junctionId === "mandi")?.status).toBe("WATCH");
    expect(mandiAlerts()).toHaveLength(1);

    // Back to CRITICAL inside the window: still exactly one alert.
    setDensity("mandi", 100);
    tick();
    expect(mandiAlerts()).toHaveLength(1);
  });

  it("fires a SECOND alert only after full hysteresis recovery (HYSTERESIS_TICKS non-critical ticks)", () => {
    const { setDensity, tick } = useSimulator.getState();

    // Tick 1: CRITICAL
    setDensity("mandi", 100);
    tick();
    expect(useSimulator.getState().alerts.filter((a) => a.junctionId === "mandi")).toHaveLength(1);

    // Advance through HYSTERESIS_TICKS of CLEAR ticks to release the lock
    setDensity("mandi", 0);
    for (let i = 0; i < CRITICALITY_CONFIG.HYSTERESIS_TICKS; i++) {
      tick();
    }
    // Lock should be released now
    const afterRecovery = useSimulator.getState();
    expect(afterRecovery.hysteresis["mandi"]?.confirmedStatus).toBe("CLEAR");

    // Now CRITICAL again → should fire a 2nd alert
    setDensity("mandi", 100);
    tick();
    expect(useSimulator.getState().alerts.filter((a) => a.junctionId === "mandi")).toHaveLength(2);
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
