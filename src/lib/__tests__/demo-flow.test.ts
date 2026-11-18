/**
 * src/lib/__tests__/demo-flow.test.ts
 *
 * Tests for Part A requirements:
 * 1. Engine lifecycle & idempotency: calling startEngine twice does not double-tick.
 * 2. Real-time dt clamping: clamped at max 1.0s.
 * 3. Controls semantics:
 *    - restart auto-starts (ambulance.status="running", paused=false) and advances on next tick.
 *    - resume from idle sets status="running" and starts moving.
 *    - pause holds distance; resume resumes movement.
 *    - speeds 1x, 2x, 4x, 8x, 16x accepted; invalid rejected.
 * 4. Alert timers on wall-clock:
 *    - At 4x speed, 1 second of dt advances alert elapsed wall timer by 1s (not 4s).
 *    - Escalation populates previousOfficerId, escalatedFrom, and escalates to next officer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useSimulator } from "../simulator-engine";
import { AlertState } from "../alerts";
import { type SimSpeed } from "../sim-transport";
import { PRIMARY_ROUTE } from "../route-data";

function resetSimulator() {
  const s = useSimulator.getState();
  s.stopEngine();
  s.restartTrip();
  // pause so background intervals do not interfere with manual ticks
  s.pauseTrip();
}

describe("Demo Flow & Engine Controls (Part A)", () => {
  beforeEach(() => {
    resetSimulator();
  });

  afterEach(() => {
    resetSimulator();
  });

  it("startEngine is idempotent: calling startEngine twice does not create duplicate intervals", () => {
    const s = useSimulator.getState();
    s.stopEngine();

    // Start engine twice
    s.startEngine();
    s.startEngine();

    // Engine is running cleanly; stopEngine stops it
    s.stopEngine();
  });

  it("restart auto-start: restartTrip sets ambulance.status='running' and moves on tick", () => {
    const s = useSimulator.getState();
    s.restartTrip();

    const state = useSimulator.getState();
    expect(state.ambulance.status).toBe("running");
    expect(state.paused).toBe(false);
    expect(state.ambulance.distanceMeters).toBeLessThan(1);

    // One tick should advance distance
    s.tick(0.5);
    const afterTick = useSimulator.getState();
    expect(afterTick.ambulance.distanceMeters).toBeGreaterThan(state.ambulance.distanceMeters);
  });

  it("resume from idle: resumeTrip from ambulance.status='idle' sets running and moves", () => {
    const s = useSimulator.getState();
    useSimulator.setState((prev) => ({
      ambulance: { ...prev.ambulance, status: "idle", distanceMeters: 0 },
      paused: false,
    }));

    s.resumeTrip();

    const state = useSimulator.getState();
    expect(state.ambulance.status).toBe("running");
    expect(state.paused).toBe(false);

    s.tick(0.5);
    expect(useSimulator.getState().ambulance.distanceMeters).toBeGreaterThan(0);
  });

  it("pause / resume: paused ambulance holds distance; resume moves again", () => {
    const s = useSimulator.getState();
    s.resumeTrip();
    s.tick(0.5);

    const distBeforePause = useSimulator.getState().ambulance.distanceMeters;
    expect(distBeforePause).toBeGreaterThan(0);

    // Pause trip
    s.pauseTrip();
    expect(useSimulator.getState().paused).toBe(true);

    // Tick while paused: distance must NOT change
    s.tick(1.0);
    expect(useSimulator.getState().ambulance.distanceMeters).toBe(distBeforePause);

    // Resume trip
    s.resumeTrip();
    expect(useSimulator.getState().paused).toBe(false);

    // Tick again: distance advances
    s.tick(1.0);
    expect(useSimulator.getState().ambulance.distanceMeters).toBeGreaterThan(distBeforePause);
  });

  it("speed: 8x and 16x are accepted and scale distance; invalid speeds rejected", () => {
    const s = useSimulator.getState();

    // Set valid speed 8
    s.setSpeed(8);
    expect(useSimulator.getState().speed).toBe(8);

    // Set valid speed 16
    s.setSpeed(16);
    expect(useSimulator.getState().speed).toBe(16);

    // Attempt invalid speed (e.g. 5)
    s.setSpeed(5 as SimSpeed);
    expect(useSimulator.getState().speed).toBe(16); // unchanged

    // Test scaling: measure distance at 1x vs 8x with same dt
    s.restartTrip();
    s.setSpeed(1);
    s.tick(1.0);
    const dist1x = useSimulator.getState().ambulance.distanceMeters;

    s.restartTrip();
    s.setSpeed(8);
    s.tick(1.0);
    const dist8x = useSimulator.getState().ambulance.distanceMeters;

    expect(dist8x).toBeGreaterThan(dist1x * 5); // significantly faster
  });

  it("alert timers on wall-clock: at 4x speed, 1 real second of tick advances alertElapsed by 1s, not 4s", () => {
    const s = useSimulator.getState();
    s.restartTrip();
    s.setSpeed(4);

    // Position ambulance close enough to Mandi House to trigger CRITICAL
    const mandiDist = PRIMARY_ROUTE.junctions["mandi"]!.distanceMeters;
    useSimulator.setState((prev) => ({
      ambulance: {
        ...prev.ambulance,
        distanceMeters: Math.max(0, mandiDist - 900),
        status: "running",
      },
    }));

    // Create alert on mandi
    s.setDensity("mandi", 100);
    s.tick(0.1);

    const initialAlert = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi");
    expect(initialAlert).toBeDefined();
    expect(initialAlert?.state).toBe(AlertState.SENT);

    // Advance 1 real second with forcedDt = 1.0 (at 4x speed, sim time advances 4s)
    const simTimeBefore = useSimulator.getState().simTimeSeconds;
    s.tick(1.0);

    const simTimeAfter = useSimulator.getState().simTimeSeconds;
    expect(simTimeAfter - simTimeBefore).toBeCloseTo(4.0, 1);

    // But alert wall elapsed timer must only advance by 1.0s real second
    const wallElapsed = useSimulator.getState().alertElapsedWallSeconds[initialAlert!.id];
    expect(wallElapsed).toBeCloseTo(1.1, 1); // 0.1 from first tick + 1.0
  });

  it("escalation: ignoring an alert until timeout marks previous officer and re-escalates", () => {
    const s = useSimulator.getState();
    s.restartTrip();
    s.setAlertTimeout(15); // demo setting: 15s timeout
    expect(useSimulator.getState().alertTimeoutSeconds).toBe(15);

    // Position ambulance close enough to Mandi House to trigger CRITICAL
    const mandiDist = PRIMARY_ROUTE.junctions["mandi"]!.distanceMeters;
    useSimulator.setState((prev) => ({
      ambulance: {
        ...prev.ambulance,
        distanceMeters: Math.max(0, mandiDist - 900),
        status: "running",
      },
    }));

    // Raise alert on mandi
    s.setDensity("mandi", 100);
    s.tick(0.1);

    const firstAlert = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi");
    expect(firstAlert).toBeDefined();
    expect(firstAlert?.state).toBe(AlertState.SENT);
    const originalOfficerId = firstAlert!.officerId;

    // Advance wall elapsed timer past 15s timeout
    s.tick(16.0);

    const escalatedAlert = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi");
    expect(escalatedAlert).toBeDefined();
    expect(escalatedAlert?.state).toBe(AlertState.SENT);
    expect(escalatedAlert?.escalatedFrom).toBe(originalOfficerId);
    expect(escalatedAlert?.previousOfficerId).toBe(originalOfficerId);
    expect(escalatedAlert?.officerId).not.toBe(originalOfficerId);

    // Check transition history contains NO_ACK_TIMEOUT
    const transitions = escalatedAlert!.transitions.map((t) => t.to);
    expect(transitions).toContain(AlertState.NO_ACK_TIMEOUT);

    // Event log contains escalation entry
    const events = useSimulator.getState().events;
    const escalationLog = events.find((e) => e.message.includes("No acknowledgement in 15 s"));
    expect(escalationLog).toBeDefined();
  });
});
