/**
 * src/lib/reroute.ts
 *
 * Pure functions for ambulance rerouting logic:
 *   1. `isUnclearable`: determines if a critical junction cannot be cleared in time.
 *   2. `shouldReroute`: decides whether diverting to an alternate route saves time.
 *   3. `projectOntoAlt`: projects the ambulance's current location onto the alternate route.
 *   4. `speakRerouteAnnouncement`: optional Web Speech API voice alert (SSR-guarded).
 */

import type { AlertRecord } from "./alerts";
import { AlertState } from "./alerts";
import type { PreparedRoute } from "./route";
import { haversineDistance, distanceToJunction } from "./route";
import type { JunctionSimReading } from "./sim-transport";

/**
 * Returns true if a junction is CRITICAL AND cannot be cleared in time:
 *   - marked as LATE_ALERT (< 50 s lead time, routed to control room)
 *   - reached NOT_CLEARED state (officer tapped Road Cleared but queue remained high)
 *   - officer explicitly tapped "Can't clear" (or reason contains "cannot clear")
 */
export function isUnclearable(
  junctionId: string,
  alerts: AlertRecord[],
  statusOrReading?: "CRITICAL" | JunctionSimReading | string,
): boolean {
  // If status is provided, it must be CRITICAL
  if (statusOrReading) {
    const status =
      typeof statusOrReading === "string" ? statusOrReading : statusOrReading.status;
    if (status !== "CRITICAL") return false;
  }

  // Find the active alert for this junction
  const alert = alerts.find(
    (a) => a.junctionId === junctionId && a.state !== AlertState.VERIFIED_CLEAR,
  );

  if (!alert) return false;

  // Unclearable conditions:
  // 1. Marked as late alert
  if (alert.isLateAlert) return true;

  // 2. Reached NOT_CLEARED state
  if (alert.state === AlertState.NOT_CLEARED) return true;

  // 3. Officer tapped "Can't clear"
  if (alert.reason && /can'?t clear|cannot clear|refused/i.test(alert.reason)) {
    return true;
  }

  return false;
}

/**
 * Decides whether taking the alternate route saves time compared to waiting on the current route.
 *
 * Rules:
 *   - The unclearable junction must lie AHEAD of the ambulance on the current route.
 *     If the ambulance has already passed it (distanceToJunction <= 0 or null), returns false.
 *   - Expected delay on current route = `clearTimeSeconds`.
 *   - Detour penalty = added travel time of the alternate route (default ~100–180s for Ring Road).
 *   - Returns true if detour penalty < clearTimeSeconds (i.e. diverting is faster than waiting).
 */
export function shouldReroute(
  currentRoute: PreparedRoute,
  altRoute: PreparedRoute,
  ambulanceDistMeters: number,
  unclearableJunctionId: string,
  clearTimeSeconds: number,
  averageSpeedMps = 15, // ~54 km/h
): boolean {
  const distToJunction = distanceToJunction(currentRoute, ambulanceDistMeters, unclearableJunctionId);

  // If junction is not ahead on current route or already passed, no need to reroute
  if (distToJunction === null || distToJunction <= 0) {
    return false;
  }

  // Extra distance of alternate route
  const extraDistanceMeters = Math.max(0, altRoute.totalLengthMeters - currentRoute.totalLengthMeters);
  const detourDelaySeconds = extraDistanceMeters / averageSpeedMps;

  // Diverting saves time if the detour is quicker than waiting for the jam to clear
  return detourDelaySeconds < clearTimeSeconds;
}

/**
 * Projects the ambulance's current location onto the alternate route.
 * Finds the nearest point on the alternate route and returns its cumulative distance
 * and heading, ensuring a smooth and continuous transition.
 */
export function projectOntoAlt(
  currentLat: number,
  currentLng: number,
  altRoute: PreparedRoute,
): { distanceMeters: number; heading: number } {
  let nearestIdx = 0;
  let minDistance = Infinity;

  const currentPos = { lat: currentLat, lng: currentLng };

  for (let i = 0; i < altRoute.points.length; i++) {
    const pt = altRoute.points[i]!;
    const dist = haversineDistance(currentPos, { lat: pt.lat, lng: pt.lng });
    if (dist < minDistance) {
      minDistance = dist;
      nearestIdx = i;
    }
  }

  const nearest = altRoute.points[nearestIdx]!;
  return {
    distanceMeters: nearest.cumulativeDistanceMeters,
    heading: nearest.headingDegrees,
  };
}

/**
 * Optional Web Speech API voice alert for the driver.
 * Safe for SSR and guarded by a mute flag.
 */
export function speakRerouteAnnouncement(
  message = "Route changed. Diverting via Ring Road to avoid ITO.",
  muted = false,
): void {
  if (muted) return;
  if (typeof window === "undefined") return;
  if (!("speechSynthesis" in window)) return;

  try {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.cancel(); // Stop any pending speech
    window.speechSynthesis.speak(utterance);
  } catch {
    // Non-blocking in case audio context is blocked
  }
}
