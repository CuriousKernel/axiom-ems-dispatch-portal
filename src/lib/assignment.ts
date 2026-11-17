/**
 * src/lib/assignment.ts
 *
 * Officer assignment: pick the nearest ONLINE officer to a junction by
 * straight-line (haversine) distance. Tie-break by fewer active alerts.
 *
 * The module is pure (no side effects), depending only on the Officer type
 * from the existing seed types.
 */

import type { Officer, LatLng } from "@/lib/axiom/types";

// ─── Haversine distance ────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

/**
 * Returns the great-circle distance in metres between two lat/lng points.
 */
export function haversineMetres(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const sq =
    sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(sq));
}

// ─── Assignment ────────────────────────────────────────────────────────────

export type AssignmentResult =
  | { kind: "assigned"; officer: Officer; distanceM: number }
  | { kind: "none_online" };

/**
 * Find the best officer to assign for a junction at `target`.
 *
 * Rules:
 *  1. Only ONLINE officers are eligible.
 *  2. Among eligible, pick the one with the smallest haversine distance.
 *  3. Tie-break: fewer activeAlerts wins.
 *
 * @param officers   Full officer list (online and offline).
 * @param target     The junction lat/lng.
 * @param excludeIds Officer IDs to skip (e.g., already assigned primary).
 */
export function findNearestOfficer(
  officers: readonly Officer[],
  target: LatLng,
  excludeIds: readonly string[] = [],
): AssignmentResult {
  const candidates = officers.filter((o) => o.online && !excludeIds.includes(o.id));

  if (candidates.length === 0) return { kind: "none_online" };

  const ranked = candidates
    .map((o) => ({ officer: o, distanceM: haversineMetres(o, target) }))
    .sort((a, b) => {
      // Primary: distance ascending
      if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
      // Tie-break: fewer active alerts
      return a.officer.activeAlerts - b.officer.activeAlerts;
    });

  const best = ranked[0]!;
  return { kind: "assigned", officer: best.officer, distanceM: best.distanceM };
}

/**
 * Convenience: return the primary + escalation officer for a junction.
 * Returns `null` entries when no eligible officer exists.
 */
export function assignOfficers(
  officers: readonly Officer[],
  target: LatLng,
): {
  primary: AssignmentResult;
  escalation: AssignmentResult;
} {
  const primary = findNearestOfficer(officers, target);
  const excludePrimary = primary.kind === "assigned" ? [primary.officer.id] : [];
  const escalation = findNearestOfficer(officers, target, excludePrimary);
  return { primary, escalation };
}
