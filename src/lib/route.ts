/**
 * src/lib/route.ts
 *
 * Pure geometry helpers for the ambulance route. No React, no side effects.
 *
 * A route is the road path as a list of points spaced evenly (default 10 m),
 * each carrying its cumulative distance from the start. Everything else in the
 * simulation (ambulance position, ETA to each junction) is expressed as a
 * single number: "distance travelled along the route, in metres".
 */

import type { LatLng } from "@/lib/axiom/types";

// ─── Constants ────────────────────────────────────────────────────────────

export const EARTH_RADIUS_M = 6_371_008.8;

/** Spacing between resampled route points (metres). */
export const DEFAULT_STEP_M = 10;

// ─── Types ────────────────────────────────────────────────────────────────

export interface RoutePoint extends LatLng {
  /** Cumulative distance from the start of the route (metres). */
  dist: number;
}

export interface Route {
  points: RoutePoint[];
  totalMeters: number;
  stepMeters: number;
  /** Distance along the route at which each junction sits (metres). */
  junctionDistances: Record<string, number>;
}

export interface RoutePosition extends LatLng {
  /** Compass heading in degrees: 0 = north, 90 = east. */
  heading: number;
}

// ─── Basic geometry ───────────────────────────────────────────────────────

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance between two points (metres). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing from a to b in degrees (0 = north, 90 = east). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ─── Resampling ───────────────────────────────────────────────────────────

/**
 * Turn an arbitrary path (uneven spacing from a routing service) into points
 * spaced `stepMeters` apart. The final point is the exact end of the path.
 */
export function resampleRoute(coords: LatLng[], stepMeters: number = DEFAULT_STEP_M): RoutePoint[] {
  if (coords.length === 0) return [];
  if (coords.length === 1) return [{ ...coords[0]!, dist: 0 }];
  if (stepMeters <= 0) throw new Error("stepMeters must be positive");

  // Cumulative distance at each raw vertex.
  const cum: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cum.push(cum[i - 1]! + haversineMeters(coords[i - 1]!, coords[i]!));
  }
  const total = cum[cum.length - 1]!;
  if (total === 0) return [{ ...coords[0]!, dist: 0 }];

  const out: RoutePoint[] = [];
  let seg = 0;
  for (let i = 0; i * stepMeters < total; i++) {
    const t = i * stepMeters;
    while (seg < cum.length - 2 && cum[seg + 1]! < t) seg++;
    const a = coords[seg]!;
    const b = coords[seg + 1]!;
    const segLen = cum[seg + 1]! - cum[seg]!;
    const f = segLen > 0 ? (t - cum[seg]!) / segLen : 0;
    out.push({
      lat: a.lat + (b.lat - a.lat) * f,
      lng: a.lng + (b.lng - a.lng) * f,
      dist: t,
    });
  }
  const last = coords[coords.length - 1]!;
  out.push({ lat: last.lat, lng: last.lng, dist: total });
  return out;
}

/**
 * Build a Route: resample the path and locate each junction along it.
 *
 * Junctions must be given in travel order. Each one is matched to the nearest
 * route point that is not before the previous junction, so a road that passes
 * near an earlier junction twice cannot reorder them.
 */
export function buildRoute(
  coords: LatLng[],
  junctions: ReadonlyArray<LatLng & { id: string }>,
  stepMeters: number = DEFAULT_STEP_M,
): Route {
  const points = resampleRoute(coords, stepMeters);
  const junctionDistances: Record<string, number> = {};

  let startIdx = 0;
  for (const j of junctions) {
    let bestIdx = startIdx;
    let bestD = Infinity;
    for (let i = startIdx; i < points.length; i++) {
      const d = haversineMeters(points[i]!, j);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    junctionDistances[j.id] = points[bestIdx]?.dist ?? 0;
    startIdx = bestIdx;
  }

  return {
    points,
    totalMeters: points[points.length - 1]?.dist ?? 0,
    stepMeters,
    junctionDistances,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────

/** Position and heading at `distanceMeters` along the route (clamped to its ends). */
export function positionAt(route: Route, distanceMeters: number): RoutePosition {
  const pts = route.points;
  if (pts.length === 0) throw new Error("route has no points");
  if (pts.length === 1) return { lat: pts[0]!.lat, lng: pts[0]!.lng, heading: 0 };

  const d = Math.max(0, Math.min(route.totalMeters, distanceMeters));

  // Binary search for the segment [lo, lo + 1] containing d.
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid]!.dist <= d) lo = mid;
    else hi = mid;
  }
  const a = pts[lo]!;
  const b = pts[lo + 1]!;
  const segLen = b.dist - a.dist;
  const f = segLen > 0 ? (d - a.dist) / segLen : 0;

  return {
    lat: a.lat + (b.lat - a.lat) * f,
    lng: a.lng + (b.lng - a.lng) * f,
    heading: bearingDegrees(a, b),
  };
}

/** Total route length in metres. */
export function totalLength(route: Route): number {
  return route.totalMeters;
}

/**
 * Metres from the ambulance to a junction. Positive = still ahead,
 * zero or negative = reached or passed.
 */
export function distanceToJunction(
  route: Route,
  currentDistance: number,
  junctionId: string,
): number {
  const at = route.junctionDistances[junctionId];
  if (at === undefined) throw new Error(`unknown junction "${junctionId}" on route`);
  return at - currentDistance;
}

/** The route as plain lat/lng for drawing a polyline, optionally only a slice of it. */
export function pathBetween(route: Route, fromMeters: number, toMeters: number): LatLng[] {
  const from = Math.max(0, Math.min(fromMeters, toMeters));
  const to = Math.min(route.totalMeters, Math.max(fromMeters, toMeters));
  const inside = route.points.filter((p) => p.dist > from && p.dist < to);
  const start = positionAt(route, from);
  const end = positionAt(route, to);
  return [
    { lat: start.lat, lng: start.lng },
    ...inside.map((p) => ({ lat: p.lat, lng: p.lng })),
    { lat: end.lat, lng: end.lng },
  ];
}
