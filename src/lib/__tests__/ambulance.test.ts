/**
 * src/lib/__tests__/ambulance.test.ts
 *
 * Unit tests for src/lib/ambulance.ts
 * Tests: determinism, slowing near junctions, ETA decreasing as it approaches, arrival, pause.
 */

import { describe, it, expect } from "vitest";
import {
  createAmbulanceState,
  stepAmbulance,
  computeSpeedAtDistance,
  computeEtaSeconds,
  AMBULANCE_CONFIG,
  type AmbulanceState,
} from "../ambulance";

describe("Ambulance deterministic speed profile & motion", () => {
  const junctionDistances = [1000, 2500, 5000];
  const totalLength = 6000;

  it("is 55 km/h on open road far from junctions", () => {
    // 500m is far from any junction
    const speed = computeSpeedAtDistance(500, junctionDistances);
    expect(speed).toBe(AMBULANCE_CONFIG.OPEN_ROAD_SPEED_KMH);
  });

  it("slows to 25 km/h right at a junction", () => {
    // Distance exactly at 1000m
    const speedAtJunction = computeSpeedAtDistance(1000, junctionDistances);
    expect(speedAtJunction).toBe(AMBULANCE_CONFIG.JUNCTION_APPROACH_SPEED_KMH);
  });

  it("eases down within 150m of a junction and back up", () => {
    // 100m before junction: distance 900 -> delta 100m (<150m)
    const speedBefore = computeSpeedAtDistance(900, junctionDistances);
    expect(speedBefore).toBeLessThan(AMBULANCE_CONFIG.OPEN_ROAD_SPEED_KMH);
    expect(speedBefore).toBeGreaterThan(AMBULANCE_CONFIG.JUNCTION_APPROACH_SPEED_KMH);

    // 50m after junction: distance 1050 -> delta 50m
    const speedAfter = computeSpeedAtDistance(1050, junctionDistances);
    expect(speedAfter).toBeLessThan(speedBefore); // Closer to 1000m than 900m is
  });

  it("is completely deterministic: identical inputs yield identical states", () => {
    let s1: AmbulanceState = { ...createAmbulanceState(), status: "running" };
    let s2: AmbulanceState = { ...createAmbulanceState(), status: "running" };

    for (let i = 0; i < 20; i++) {
      s1 = stepAmbulance(s1, 1.0, totalLength, junctionDistances);
      s2 = stepAmbulance(s2, 1.0, totalLength, junctionDistances);
      expect(s1.distanceMeters).toBe(s2.distanceMeters);
      expect(s1.speedKmh).toBe(s2.speedKmh);
      expect(s1.smoothedSpeedKmh).toBe(s2.smoothedSpeedKmh);
    }
  });

  it("ETA decreases monotonically as the ambulance approaches a junction", () => {
    let s: AmbulanceState = { ...createAmbulanceState(), status: "running" };
    let prevEta = Infinity;

    // Advance 50 steps of 1 second
    for (let i = 0; i < 30; i++) {
      s = stepAmbulance(s, 1.0, totalLength, junctionDistances);
      const remaining = Math.max(0, 1000 - s.distanceMeters);
      const eta = computeEtaSeconds(s, remaining);

      expect(eta).toBeLessThanOrEqual(prevEta);
      prevEta = eta;
    }
  });

  it("handles pause: position does not change when paused", () => {
    const running = { ...createAmbulanceState(500), status: "running" as const };
    const stepped = stepAmbulance(running, 2.0, totalLength, junctionDistances);
    expect(stepped.distanceMeters).toBeGreaterThan(500);

    const paused = { ...stepped, status: "paused" as const };
    const stepPaused = stepAmbulance(paused, 2.0, totalLength, junctionDistances);
    expect(stepPaused.distanceMeters).toBe(stepped.distanceMeters);
    expect(stepPaused.status).toBe("paused");
  });

  it("handles arrival when reaching totalRouteLength", () => {
    const nearEnd = { ...createAmbulanceState(totalLength - 10), status: "running" as const };
    const arrived = stepAmbulance(nearEnd, 2.0, totalLength, junctionDistances);

    expect(arrived.distanceMeters).toBe(totalLength);
    expect(arrived.status).toBe("arrived");
    expect(arrived.speedKmh).toBe(0);

    // ETA at arrival is 0
    expect(computeEtaSeconds(arrived, 0)).toBe(0);
  });
});
