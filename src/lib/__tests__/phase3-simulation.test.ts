/**
 * src/lib/__tests__/phase3-simulation.test.ts
 *
 * Unit tests for Phase 3 core simulation logic:
 *   - Dynamic ETAs and PASSED junction status.
 *   - Queue draining: IN_POSITION drains 3x faster than normal flow.
 *   - Two-tick verification: Road cleared -> VERIFIED_CLEAR (Path A) vs NOT_CLEARED re-escalation (Path B).
 *   - Simulation-clock driven 30s NO_ACK timeout.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useSimulator } from "../simulator-engine";
import { AlertState } from "../alerts";
import { PRIMARY_ROUTE } from "../route-data";

function resetSimulator() {
  const s = useSimulator.getState();
  s.stopEngine();
  s.restartTrip();
}

describe("Phase 3 Simulation Engine", () => {
  beforeEach(() => {
    resetSimulator();
  });

  afterEach(() => {
    resetSimulator();
  });

  it("calculates dynamic ETAs and marks passed junctions as PASSED", () => {
    const s = useSimulator.getState();
    s.tick(0);

    // Initial state at distance 0 (CP)
    const initialReadings = useSimulator.getState().readings;
    expect(initialReadings["mandi"]?.eta).toBeGreaterThan(0);
    expect(initialReadings["ito"]?.eta).toBeGreaterThan(0);
    expect(initialReadings["mandi"]?.status).not.toBe("PASSED");

    // Manually jump ambulance past Mandi House
    const mandiDist = PRIMARY_ROUTE.junctions["mandi"]!.distanceMeters;
    useSimulator.setState((prev) => ({
      ambulance: {
        ...prev.ambulance,
        distanceMeters: mandiDist + 50, // 50m past Mandi House
        status: "running",
      },
    }));

    useSimulator.getState().tick(0.1);

    const updatedReadings = useSimulator.getState().readings;
    expect(updatedReadings["mandi"]?.status).toBe("PASSED");
    expect(updatedReadings["mandi"]?.eta).toBe(0);

    // Upcoming junction ITO still has a valid ETA
    expect(updatedReadings["ito"]?.status).not.toBe("PASSED");
    expect(updatedReadings["ito"]?.eta).toBeGreaterThan(0);
  });

  it("drains junction queue 3x faster when alert reaches IN_POSITION", () => {
    const s = useSimulator.getState();

    // Position ambulance approaching Mandi House (within ~900m so ETA is ~59s)
    const mandiDist = PRIMARY_ROUTE.junctions["mandi"]!.distanceMeters;
    useSimulator.setState((prev) => ({
      ambulance: {
        ...prev.ambulance,
        distanceMeters: Math.max(0, mandiDist - 900),
        status: "running",
      },
    }));

    // Density 60 -> 60 veh, clearTime = 120s, clearTime + 10 >= 59s -> CRITICAL!
    s.setDensity("mandi", 60);
    s.tick(0.1);

    const alert = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi");
    expect(alert).toBeDefined();

    // Officer acknowledges and reaches position
    s.acknowledgeAlert(alert!.id, "o2");
    s.officerInPosition(alert!.id, "o2");

    const inPosAlert = useSimulator.getState().alerts.find((a) => a.id === alert!.id);
    expect(inPosAlert?.state).toBe(AlertState.IN_POSITION);

    // Normal discharge rate is 0.5 veh/s. In position is 3x = 1.5 veh/s.
    // Over 10 simulation seconds: drains 15 vehicles!
    const vehBefore = useSimulator.getState().readings["mandi"]!.vehicleCount;
    s.tick(10.0);
    const vehAfter = useSimulator.getState().readings["mandi"]!.vehicleCount;

    expect(vehBefore - vehAfter).toBeCloseTo(15, 0);
  });

  it("Road cleared verification Path A: marks VERIFIED_CLEAR when junction is CLEAR for 2 consecutive ticks", () => {
    const s = useSimulator.getState();

    const mandiDist = PRIMARY_ROUTE.junctions["mandi"]!.distanceMeters;
    useSimulator.setState((prev) => ({
      ambulance: {
        ...prev.ambulance,
        distanceMeters: Math.max(0, mandiDist - 900),
        status: "running",
      },
    }));

    s.setDensity("mandi", 60);
    s.tick(0.1);

    const alert = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi");
    expect(alert).toBeDefined();

    s.acknowledgeAlert(alert!.id, "o2");
    s.officerInPosition(alert!.id, "o2");

    // Queue is cleared by officer
    s.setDensity("mandi", 0);
    s.tick(0.1);

    // Officer taps Road Cleared
    s.officerRoadCleared(alert!.id, "o2");
    expect(useSimulator.getState().alerts.find((a) => a.id === alert!.id)?.state).toBe(AlertState.CLEARING);

    // Tick 1 (consecutive clear = 1)
    s.tick(0.1);
    expect(useSimulator.getState().alerts.find((a) => a.id === alert!.id)?.state).toBe(AlertState.CLEARING);

    // Tick 2 (consecutive clear = 2) -> should become VERIFIED_CLEAR
    s.tick(0.1);
    const finalAlert = useSimulator.getState().alerts.find((a) => a.id === alert!.id);
    expect(finalAlert?.state).toBe(AlertState.VERIFIED_CLEAR);
  });

  it("Road cleared verification Path B: re-escalates to NOT_CLEARED when queue is still high after 2 ticks", () => {
    const s = useSimulator.getState();

    const mandiDist = PRIMARY_ROUTE.junctions["mandi"]!.distanceMeters;
    useSimulator.setState((prev) => ({
      ambulance: {
        ...prev.ambulance,
        distanceMeters: Math.max(0, mandiDist - 900),
        status: "running",
      },
    }));

    s.setDensity("mandi", 80);
    s.tick(0.1);

    const alert = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi");
    expect(alert).toBeDefined();

    s.acknowledgeAlert(alert!.id, "o2");
    s.officerInPosition(alert!.id, "o2");

    // Officer prematurely taps Road cleared while queue remains heavy (80% density)
    s.officerRoadCleared(alert!.id, "o2");

    // Tick 1
    s.tick(0.1);
    // Tick 2 (still high queue!) -> should re-escalate to NOT_CLEARED then SENT
    s.tick(0.1);

    const reEscalated = useSimulator.getState().alerts.find((a) => a.id === alert!.id);
    expect(reEscalated).toBeDefined();
    // After re-escalation, alert transitions NOT_CLEARED -> SENT to next officer
    const states = reEscalated!.transitions.map((t) => t.to);
    expect(states).toContain(AlertState.NOT_CLEARED);
    expect(reEscalated!.state).toBe(AlertState.SENT);
  });

  it("30-second NO_ACK timeout is driven by simulation clock", () => {
    const s = useSimulator.getState();

    const mandiDist = PRIMARY_ROUTE.junctions["mandi"]!.distanceMeters;
    useSimulator.setState((prev) => ({
      ambulance: {
        ...prev.ambulance,
        distanceMeters: Math.max(0, mandiDist - 900),
        status: "running",
      },
    }));

    s.setDensity("mandi", 80);
    s.tick(0.1);

    const alert = useSimulator.getState().alerts.find((a) => a.junctionId === "mandi");
    expect(alert?.state).toBe(AlertState.SENT);

    // Step 20 seconds of simulation time: should still be SENT
    s.tick(20);
    expect(useSimulator.getState().alerts.find((a) => a.id === alert!.id)?.state).toBe(AlertState.SENT);

    // Step another 15 seconds (total 35s > 30s timeout): should have timed out and re-sent
    s.tick(15);
    const timedOutAlert = useSimulator.getState().alerts.find((a) => a.id === alert!.id);
    expect(timedOutAlert!.transitions.map((t) => t.to)).toContain(AlertState.NO_ACK_TIMEOUT);
  });
});
