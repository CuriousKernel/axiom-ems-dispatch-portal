/**
 * src/lib/ambulance.ts
 *
 * Deterministic ambulance motion along the corridor.
 * Speed profile: 55 km/h on open road, easing to 25 km/h within 150m of a junction.
 * Smoothed speed using exponential moving average for steady ETA calculations.
 */

export type AmbulanceStatus = "idle" | "running" | "paused" | "arrived";

export interface AmbulanceState {
  distanceMeters: number;
  speedKmh: number;
  smoothedSpeedKmh: number;
  status: AmbulanceStatus;
}

export const AMBULANCE_CONFIG = {
  OPEN_ROAD_SPEED_KMH: 55,
  JUNCTION_APPROACH_SPEED_KMH: 25,
  JUNCTION_SLOW_ZONE_METERS: 150,
  /** Smoothing factor for exponential moving average (0 < alpha <= 1). */
  EMA_ALPHA: 0.15,
  /** Minimum speed floor for ETA calculation to prevent division by zero. */
  MIN_ETA_SPEED_KMH: 20,
} as const;

/**
 * Compute the deterministic target speed for a given distance along the route
 * based on proximity to junction distance markers.
 */
export function computeSpeedAtDistance(
  distanceMeters: number,
  junctionDistances: readonly number[],
): number {
  const { OPEN_ROAD_SPEED_KMH, JUNCTION_APPROACH_SPEED_KMH, JUNCTION_SLOW_ZONE_METERS } =
    AMBULANCE_CONFIG;

  let minSpeed: number = OPEN_ROAD_SPEED_KMH;

  for (const jDist of junctionDistances) {
    const delta = Math.abs(distanceMeters - jDist);
    if (delta < JUNCTION_SLOW_ZONE_METERS) {
      // Linear ease: at delta=0 speed is 25 km/h, at delta=150 speed is 55 km/h
      const frac = delta / JUNCTION_SLOW_ZONE_METERS;
      const speed =
        JUNCTION_APPROACH_SPEED_KMH +
        (OPEN_ROAD_SPEED_KMH - JUNCTION_APPROACH_SPEED_KMH) * frac;
      if (speed < minSpeed) {
        minSpeed = speed;
      }
    }
  }

  return minSpeed;
}

/**
 * Create a fresh ambulance state.
 */
export function createAmbulanceState(initialDistance = 0): AmbulanceState {
  return {
    distanceMeters: initialDistance,
    speedKmh: 0,
    smoothedSpeedKmh: AMBULANCE_CONFIG.OPEN_ROAD_SPEED_KMH,
    status: "idle",
  };
}

/**
 * Step the ambulance forward by dtSeconds.
 * Pure function: takes current state and parameters, returns the new state.
 */
export function stepAmbulance(
  state: AmbulanceState,
  dtSeconds: number,
  totalRouteLengthMeters: number,
  junctionDistances: readonly number[],
): AmbulanceState {
  if (state.status !== "running" || dtSeconds <= 0) {
    return state;
  }

  // Calculate current speed from position
  const targetSpeedKmh = computeSpeedAtDistance(
    state.distanceMeters,
    junctionDistances,
  );

  // Exponential moving average for smoothed speed
  const alpha = AMBULANCE_CONFIG.EMA_ALPHA;
  const smoothed =
    state.speedKmh === 0 && state.distanceMeters === 0
      ? targetSpeedKmh
      : (1 - alpha) * state.smoothedSpeedKmh + alpha * targetSpeedKmh;

  const speedMs = targetSpeedKmh / 3.6;
  const nextDist = state.distanceMeters + speedMs * dtSeconds;

  if (nextDist >= totalRouteLengthMeters) {
    return {
      distanceMeters: totalRouteLengthMeters,
      speedKmh: 0,
      smoothedSpeedKmh: 0,
      status: "arrived",
    };
  }

  return {
    distanceMeters: nextDist,
    speedKmh: targetSpeedKmh,
    smoothedSpeedKmh: smoothed,
    status: "running",
  };
}

/**
 * Compute ETA in seconds to a point at remainingDistanceMeters.
 */
export function computeEtaSeconds(
  state: AmbulanceState,
  remainingDistanceMeters: number,
): number {
  if (remainingDistanceMeters <= 0 || state.status === "arrived") {
    return 0;
  }

  // Use smoothed speed (or minimum floor) in m/s
  const effectiveKmh = Math.max(
    state.smoothedSpeedKmh,
    AMBULANCE_CONFIG.MIN_ETA_SPEED_KMH,
  );
  const speedMs = effectiveKmh / 3.6;

  return Math.max(0, Math.round(remainingDistanceMeters / speedMs));
}
