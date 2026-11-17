/**
 * src/lib/sources/simulated.ts
 *
 * SimulatedSource: a QueueSource backed by per-junction density sliders (0–100).
 *
 * Conversion: vehicleCount = round(density * MAX_VEHICLES_PER_JUNCTION / 100)
 * Queue length: 7.5 m per vehicle (car length + gap, rough estimate for Delhi).
 *
 * Scenario presets let the UI trigger named situations (Jam Mandi House, Jam ITO,
 * Clear all) in one call.
 *
 * The rest of the app only imports `QueueSource` from queue-source.ts and calls
 * `getReading()`. Swapping SimulatedSource for a vision-based implementation is
 * therefore a one-line change in the wiring layer.
 */

import type { QueueSource, QueueReading } from "./queue-source";
import { JUNCTIONS } from "@/lib/axiom/seed";

// ─── Config ───────────────────────────────────────────────────────────────

/** Maximum vehicles in a queue at density 100. */
export const MAX_VEHICLES_PER_JUNCTION = 100;

/** Approximate metres of road per queued vehicle. */
export const METRES_PER_VEHICLE = 7.5;

// ─── Presets ──────────────────────────────────────────────────────────────

export type ScenarioName = "Jam Mandi House" | "Jam ITO" | "Clear all";

/** Density values (0–100) for each junction by preset. Unmentioned junctions keep current density. */
export const SCENARIO_PRESETS: Record<ScenarioName, Partial<Record<string, number>>> = {
  "Jam Mandi House": { mandi: 90, ito: 30 },
  "Jam ITO":        { ito: 92, mandi: 25 },
  "Clear all":      Object.fromEntries(JUNCTIONS.map((j) => [j.id, 0])),
};

// ─── SimulatedSource ──────────────────────────────────────────────────────

export class SimulatedSource implements QueueSource {
  /** Per-junction density, 0–100. */
  private densities: Map<string, number>;

  constructor(initialDensities?: Partial<Record<string, number>>) {
    this.densities = new Map(JUNCTIONS.map((j) => [j.id, 0]));
    if (initialDensities) {
      for (const [id, d] of Object.entries(initialDensities)) {
        this.setDensity(id, d ?? 0);
      }
    }
  }

  /** Set density for one junction (clamped to 0–100). */
  setDensity(junctionId: string, density: number): void {
    this.densities.set(junctionId, Math.max(0, Math.min(100, Math.round(density))));
  }

  /** Get density for one junction. */
  getDensity(junctionId: string): number {
    return this.densities.get(junctionId) ?? 0;
  }

  /**
   * Drain queue by a specific number of vehicles (e.g. when officer is clearing).
   */
  drain(junctionId: string, vehicleCountDelta: number): void {
    const currentDensity = this.getDensity(junctionId);
    const currentVehicles = Math.round((currentDensity * MAX_VEHICLES_PER_JUNCTION) / 100);
    const nextVehicles = Math.max(0, currentVehicles - vehicleCountDelta);
    const nextDensity = (nextVehicles * 100) / MAX_VEHICLES_PER_JUNCTION;
    this.setDensity(junctionId, nextDensity);
  }

  /** Apply a named scenario preset. */
  applyScenario(scenario: ScenarioName): void {
    const patch = SCENARIO_PRESETS[scenario];
    for (const [id, d] of Object.entries(patch)) {
      this.setDensity(id, d ?? 0);
    }
  }

  /** QueueSource contract. */
  getReading(junctionId: string): QueueReading {
    const density = this.getDensity(junctionId);
    const vehicleCount = Math.round((density * MAX_VEHICLES_PER_JUNCTION) / 100);
    return {
      junctionId,
      vehicleCount,
      queueLengthMeters: vehicleCount * METRES_PER_VEHICLE,
      timestamp: Date.now(),
    };
  }

  /** Convenience: get readings for all known junctions at once. */
  getAllReadings(): QueueReading[] {
    return JUNCTIONS.map((j) => this.getReading(j.id));
  }
}
