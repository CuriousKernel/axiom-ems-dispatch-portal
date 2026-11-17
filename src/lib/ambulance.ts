/**
 * src/lib/ambulance.ts
 *
 * Pure, deterministic ambulance motion along a Route.
 *
 * Speed depends only on where the ambulance is on the route: cruising speed on
 * open road, easing down near every junction and back up after it. Because the
 * speed is a pure function of position, every demo run is identical, and the
 * ETA to a junction can be computed exactly by walking the same speed profile
 * forward (no guessing from the current speed, so the ETA does not jump when the
 * ambulance enters a slow zone).
 */

import { distanceToJunction, type Route } from "@/lib/route";

// ─── Config ───────────────────────────────────────────────────────────────

export const AMBULANCE_CONFIG = {
  /** Speed on open road (km/h). */
  CRUISE_KMH: 55,
  /** Speed at the junction itself (km/h). */
  JUNCTION_KMH: 25,
  /** Distance before and after a junction over which speed eases (metres). */
  SLOW_ZONE_M: 150,
  /** Step used when integrating the speed profile for ETA (metres). */
  ETA_STEP_M: 10,
  /** Lower bound on speed so ETA can never divide by zero (km/h). */
  MIN_KMH: 5,
} as const;

// ─── Types ────────────────────────────────────────────────────────────────

export type AmbulanceStatus = "idle" | "running" | "paused" | "arrived";

export interface AmbulanceState {
  /** Distance travelled along the route (metres). */
  distanceMeters: number;
  speedKmh: number;
  status: AmbulanceStatus;
}

// ─── State constructors ───────────────────────────────────────────────────

export function createAmbulance(): AmbulanceState {
  return { distanceMeters: 0, speedKmh: 0, status: "idle" };
}

export function startAmbulance(route: Route): AmbulanceState {
  return {
    distanceMeters: 0,
    speedKmh: speedAt(route, 0),
    status: "running",
  };
}

export function pauseAmbulance(state: AmbulanceState): AmbulanceState {
  return state.status === "running" ? { ...state, status: "paused" } : state;
}

export function resumeAmbulance(state: AmbulanceState): AmbulanceState {
  return state.status === "paused" ? { ...state, status: "running" } : state;
}

// ─── Speed profile ────────────────────────────────────────────────────────

/** Speed (km/h) the ambulance drives at a given distance along the route. */
export function speedAt(route: Route, distanceMeters: number): number {
  const { CRUISE_KMH, JUNCTION_KMH, SLOW_ZONE_M } = AMBULANCE_CONFIG;

  let nearest = Infinity;
  for (const at of Object.values(route.junctionDistances)) {
    nearest = Math.min(nearest, Math.abs(at - distanceMeters));
  }
  if (nearest >= SLOW_ZONE_M) return CRUISE_KMH;

  // Linear ease: JUNCTION_KMH at the junction, CRUISE_KMH at the zone edge.
  return JUNCTION_KMH + (CRUISE_KMH - JUNCTION_KMH) * (nearest / SLOW_ZONE_M);
}

// ─── Motion ───────────────────────────────────────────────────────────────

/**
 * Advance the ambulance by `dtSeconds` of SIMULATION time (the caller has
 * already multiplied by the 1x/2x/4x speed setting). Returns a new state.
 *
 * Large steps are split into small ones so a 4x tick cannot jump over a slow
 * zone and change the result.
 */
export function stepAmbulance(
  route: Route,
  state: AmbulanceState,
  dtSeconds: number,
): AmbulanceState {
  if (state.status !== "running" || dtSeconds <= 0) return state;

  const MAX_SUBSTEP_S = 0.25;
  let distance = state.distanceMeters;
  let remaining = dtSeconds;
  let speed = state.speedKmh;

  while (remaining > 1e-9 && distance < route.totalMeters) {
    const dt = Math.min(MAX_SUBSTEP_S, remaining);
    speed = speedAt(route, distance);
    distance = Math.min(route.totalMeters, distance + (speed / 3.6) * dt);
    remaining -= dt;
  }

  if (distance >= route.totalMeters) {
    return { distanceMeters: route.totalMeters, speedKmh: 0, status: "arrived" };
  }
  return { distanceMeters: distance, speedKmh: speed, status: "running" };
}

// ─── ETA ──────────────────────────────────────────────────────────────────

/**
 * Seconds until the ambulance reaches a junction, by walking the speed profile
 * from the current position to the junction. Returns 0 if it is already there
 * or has passed it, so callers should check `hasPassed` separately.
 */
export function etaSeconds(
  route: Route,
  state: AmbulanceState,
  junctionId: string,
): number {
  const remaining = distanceToJunction(route, state.distanceMeters, junctionId);
  if (remaining <= 0) return 0;

  const { ETA_STEP_M, MIN_KMH } = AMBULANCE_CONFIG;
  let seconds = 0;
  let travelled = 0;
  while (travelled < remaining) {
    const stepM = Math.min(ETA_STEP_M, remaining - travelled);
    // Sample speed at the middle of the step for a better estimate.
    const speed = Math.max(MIN_KMH, speedAt(route, state.distanceMeters + travelled + stepM / 2));
    seconds += stepM / (speed / 3.6);
    travelled += stepM;
  }
  return seconds;
}

/** True once the ambulance has reached or passed a junction. */
export function hasPassed(route: Route, state: AmbulanceState, junctionId: string): boolean {
  return distanceToJunction(route, state.distanceMeters, junctionId) <= 0;
}
