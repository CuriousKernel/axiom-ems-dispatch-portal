/**
 * src/lib/criticality.ts
 *
 * Pure functions for computing junction criticality status.
 * No React, no side effects - safe to call from anywhere.
 *
 * Key formula:
 *   clear_time_j = queue_j / discharge_rate
 *   CRITICAL  if clear_time_j + BUFFER_S >= eta_j
 *   WATCH     if (clear_time_j + BUFFER_S) >= (eta_j - WATCH_WINDOW_S)
 *   CLEAR     otherwise
 *
 * Alert lead-time rule:
 *   Alert must fire at least (officer_travel_time + LEAD_PADDING_S) before ETA.
 *   If not enough time, the alert is LATE_ALERT and escalated immediately.
 */

import type { JunctionStatus } from "@/lib/axiom/types";

// ─── Named config constants ────────────────────────────────────────────────

export const CRITICALITY_CONFIG = {
  /** Buffer added to clear_time before comparing with ETA (seconds). */
  BUFFER_S: 10,
  /** If (clear_time + BUFFER_S) is within this many seconds of becoming critical, status is WATCH. */
  WATCH_WINDOW_S: 20,
  /** Default discharge rate (vehicles/second) if none is specified. */
  DEFAULT_DISCHARGE_RATE: 0.5,
  /** Minimum lead time padding beyond officer_travel_time (seconds). */
  LEAD_PADDING_S: 30,
  /** How often the engine should recompute (milliseconds). */
  TICK_MS: 2000,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────

export interface CriticalityInput {
  junctionId: string;
  /** Vehicles in the approach lane queue. */
  queueCount: number;
  /** Seconds until the ambulance arrives at this junction. */
  eta: number;
  /** Vehicles cleared per second (falls back to DEFAULT_DISCHARGE_RATE). */
  dischargeRate?: number | undefined;
  /** Officer travel time to reach this junction (seconds). Used for lead-time check. */
  officerTravelTime?: number | undefined;
}

export interface CriticalityResult {
  junctionId: string;
  queueCount: number;
  eta: number;
  clearTime: number;
  status: JunctionStatus;
  /** True when this tick is a fresh transition INTO CRITICAL (not a repeat). */
  isNewCritical: boolean;
  /** True when the alert fires too late for the officer to arrive comfortably. */
  isLateAlert: boolean;
  dischargeRate: number;
}

// ─── Pure computation ─────────────────────────────────────────────────────

/**
 * Compute the criticality result for a single junction.
 *
 * @param input         Junction readings and config.
 * @param prevStatus    The status from the previous tick (for transition detection).
 */
export function computeCriticality(
  input: CriticalityInput,
  prevStatus: JunctionStatus | null,
): CriticalityResult {
  const dr = input.dischargeRate ?? CRITICALITY_CONFIG.DEFAULT_DISCHARGE_RATE;

  // Avoid division by zero: if discharge rate is 0 treat queue as infinite.
  const clearTime = dr > 0 ? input.queueCount / dr : input.queueCount > 0 ? Infinity : 0;

  const { BUFFER_S, WATCH_WINDOW_S, LEAD_PADDING_S } = CRITICALITY_CONFIG;

  const margin = input.eta - (clearTime + BUFFER_S);

  let status: JunctionStatus;
  if (margin <= 0) {
    status = "CRITICAL";
  } else if (margin <= WATCH_WINDOW_S) {
    status = "WATCH";
  } else {
    status = "CLEAR";
  }

  // Alert fires only on the transition INTO CRITICAL.
  const isNewCritical = status === "CRITICAL" && prevStatus !== "CRITICAL";

  // Lead-time check: does the officer have enough time to arrive?
  const officerTravelTime = input.officerTravelTime ?? 0;
  const isLateAlert = isNewCritical && input.eta < officerTravelTime + LEAD_PADDING_S;

  return {
    junctionId: input.junctionId,
    queueCount: input.queueCount,
    eta: input.eta,
    clearTime: isFinite(clearTime) ? clearTime : Number.MAX_SAFE_INTEGER,
    status,
    isNewCritical,
    isLateAlert,
    dischargeRate: dr,
  };
}

/**
 * Batch-compute criticality for a list of junctions.
 * prevStatuses is a map from junctionId -> previous JunctionStatus.
 */
export function computeAllCriticality(
  inputs: CriticalityInput[],
  prevStatuses: Readonly<Record<string, JunctionStatus>>,
): CriticalityResult[] {
  return inputs.map((inp) =>
    computeCriticality(inp, prevStatuses[inp.junctionId] ?? null),
  );
}
