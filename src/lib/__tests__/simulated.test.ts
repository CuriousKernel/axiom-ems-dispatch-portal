/**
 * src/lib/__tests__/simulated.test.ts
 *
 * Unit tests for src/lib/sources/simulated.ts (SimulatedSource and presets).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SimulatedSource, SCENARIO_PRESETS, MAX_VEHICLES_PER_JUNCTION, METRES_PER_VEHICLE } from "../sources/simulated";

describe("SimulatedSource", () => {
  let source: SimulatedSource;

  beforeEach(() => {
    source = new SimulatedSource();
  });

  it("starts all junctions at density 0", () => {
    const reading = source.getReading("cp");
    expect(reading.vehicleCount).toBe(0);
    expect(reading.queueLengthMeters).toBe(0);
  });

  it("converts density to vehicleCount correctly", () => {
    source.setDensity("ito", 50);
    const reading = source.getReading("ito");
    expect(reading.vehicleCount).toBe(Math.round(50 * MAX_VEHICLES_PER_JUNCTION / 100));
  });

  it("density=100 produces MAX_VEHICLES_PER_JUNCTION vehicles", () => {
    source.setDensity("mandi", 100);
    expect(source.getReading("mandi").vehicleCount).toBe(MAX_VEHICLES_PER_JUNCTION);
  });

  it("clamps density above 100 to 100", () => {
    source.setDensity("cp", 150);
    expect(source.getReading("cp").vehicleCount).toBe(MAX_VEHICLES_PER_JUNCTION);
  });

  it("clamps density below 0 to 0", () => {
    source.setDensity("cp", -10);
    expect(source.getReading("cp").vehicleCount).toBe(0);
  });

  it("computes queueLengthMeters correctly", () => {
    source.setDensity("ito", 100);
    const reading = source.getReading("ito");
    expect(reading.queueLengthMeters).toBe(reading.vehicleCount * METRES_PER_VEHICLE);
  });

  it("includes junctionId and timestamp in reading", () => {
    source.setDensity("aiims", 40);
    const reading = source.getReading("aiims");
    expect(reading.junctionId).toBe("aiims");
    expect(typeof reading.timestamp).toBe("number");
    expect(reading.timestamp).toBeGreaterThan(0);
  });

  it("getDensity reflects setDensity", () => {
    source.setDensity("pragati", 72);
    expect(source.getDensity("pragati")).toBe(72);
  });

  it("accepts initialDensities in constructor", () => {
    const s = new SimulatedSource({ cp: 60, ito: 80 });
    expect(s.getReading("cp").vehicleCount).toBe(Math.round(60 * MAX_VEHICLES_PER_JUNCTION / 100));
    expect(s.getReading("ito").vehicleCount).toBe(Math.round(80 * MAX_VEHICLES_PER_JUNCTION / 100));
  });

  it("getAllReadings returns all junctions", () => {
    const readings = source.getAllReadings();
    expect(readings.length).toBeGreaterThan(0);
    // Every reading has a junctionId
    expect(readings.every((r) => typeof r.junctionId === "string")).toBe(true);
  });
});

// ─── Scenario presets ─────────────────────────────────────────────────────

describe("SimulatedSource – scenario presets", () => {
  it("applies 'Jam Mandi House' preset", () => {
    const s = new SimulatedSource();
    s.applyScenario("Jam Mandi House");
    expect(s.getDensity("mandi")).toBe(SCENARIO_PRESETS["Jam Mandi House"]["mandi"]);
  });

  it("applies 'Jam ITO' preset", () => {
    const s = new SimulatedSource();
    s.applyScenario("Jam ITO");
    expect(s.getDensity("ito")).toBe(SCENARIO_PRESETS["Jam ITO"]["ito"]);
  });

  it("'Clear all' sets all junctions to 0", () => {
    const s = new SimulatedSource({ cp: 90, mandi: 80, ito: 70 });
    s.applyScenario("Clear all");
    for (const reading of s.getAllReadings()) {
      expect(reading.vehicleCount).toBe(0);
    }
  });

  it("SCENARIO_PRESETS covers all three scenarios", () => {
    expect(SCENARIO_PRESETS).toHaveProperty("Jam Mandi House");
    expect(SCENARIO_PRESETS).toHaveProperty("Jam ITO");
    expect(SCENARIO_PRESETS).toHaveProperty("Clear all");
  });
});
