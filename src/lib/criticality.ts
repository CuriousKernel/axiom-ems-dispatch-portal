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
 *
 * Hysteresis (anti-flapping):
 *   A junction only resets from CRITICAL once it has stayed strictly below
 *   CRITICAL for HYSTERESIS_TICKS consecutive ticks. Until then, prevStatus
 *   is kept as CRITICAL so a brief dip to WATCH does not re-arm the trigger.
 *   The engine must call advanceHysteresis() every tick with the raw status.
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
  /**
   * Anti-flapping: number of consecutive non-CRITICAL ticks required before
   * a junction is allowed to re-arm its CRITICAL alert trigger.
   * At TICK_MS=2000 ms, 3 ticks = 6 seconds of sustained recovery.
   */
  HYSTERESIS_TICKS: 3,
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

// ─── Anti-flapping hysteresis state ───────────────────────────────────────

/**
 * Per-junction counter of consecutive ticks spent below CRITICAL.
 * While this count is below HYSTERESIS_TICKS, prevStatus stays "CRITICAL"
 * even if the raw reading recovered to WATCH or CLEAR.
 *
 * The engine holds one HysteresisState per junction and passes it into
 * advanceHysteresis on every tick.
 */
export interface HysteresisState {
  /** The status the alert system actually sees (may differ from raw status). */
  confirmedStatus: JunctionStatus | null;
  /** How many consecutive ticks the raw reading has been non-CRITICAL. */
  recoveryTicks: number;
}

/**
 * Advance hysteresis for one junction.
 *
 * Rules:
 *  - If rawStatus is CRITICAL: reset recoveryTicks to 0, confirmedStatus → CRITICAL.
 *  - If rawStatus is not CRITICAL and confirmedStatus was CRITICAL:
 *      increment recoveryTicks. If recoveryTicks >= HYSTERESIS_TICKS,
 *      confirmedStatus follows rawStatus (junction has genuinely recovered).
 *  - If confirmedStatus was not CRITICAL: just track the raw status.
 *
 * Returns the updated HysteresisState.
 */
export function advanceHysteresis(
  raw: JunctionStatus,
  prev: HysteresisState,
): HysteresisState {
  if (raw === "CRITICAL") {
    return { confirmedStatus: "CRITICAL", recoveryTicks: 0 };
  }

  // Raw is not CRITICAL.
  if (prev.confirmedStatus === "CRITICAL") {
    const ticks = prev.recoveryTicks + 1;
    if (ticks >= CRITICALITY_CONFIG.HYSTERESIS_TICKS) {
      // Genuinely recovered - release the CRITICAL lock.
      return { confirmedStatus: raw, recoveryTicks: ticks };
    }
    // Still in the hysteresis window - stay locked as CRITICAL.
    return { confirmedStatus: "CRITICAL", recoveryTicks: ticks };
  }

  // Was not CRITICAL before, just track.
  return { confirmedStatus: raw, recoveryTicks: 0 };
}

// ─── Pure computation ─────────────────────────────────────────────────────

/**
 * Compute the criticality result for a single junction.
 *
 * @param input         Junction readings and config.
 * @param prevStatus    The hysteresis-confirmed status from the previous tick.
 *                      Pass null on first tick. This is NOT the raw previous status.
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

  // Alert fires only on the transition INTO CRITICAL (using hysteresis-confirmed prev).
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
 * prevStatuses is a map from junctionId -> hysteresis-confirmed JunctionStatus.
 */
export function computeAllCriticality(
  inputs: CriticalityInput[],
  prevStatuses: Readonly<Record<string, JunctionStatus>>,
): CriticalityResult[] {
  return inputs.map((inp) =>
    computeCriticality(inp, prevStatuses[inp.junctionId] ?? null),
  );
}
