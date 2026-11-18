/**
 * src/lib/route.ts
 *
 * Pure geometric functions for route interpolation, resampling, and junction distances.
 * No UI, no side-effects, fully deterministic and unit-tested.
 */

import type { LatLng } from "@/lib/axiom/types";

export interface RoutePoint {
  lat: number;
  lng: number;
  cumulativeDistanceMeters: number;
  headingDegrees: number;
}

export interface JunctionOnRoute {
  id: string;
  name?: string | undefined;
  lat: number;
  lng: number;
  distanceMeters: number;
}

export interface PreparedRoute {
  points: RoutePoint[];
  totalLengthMeters: number;
  junctions: Record<string, JunctionOnRoute>;
}

const EARTH_RADIUS_M = 6_371_000;

export function haversineDistance(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const sq =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(sq));
}

export function computeHeading(from: LatLng, to: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

/**
 * Resample a sequence of coordinates into evenly spaced points every stepMeters.
 * Each point gets cumulativeDistanceMeters and headingDegrees.
 */
export function resampleRoute(
  coords: readonly LatLng[],
  stepMeters = 10,
): RoutePoint[] {
  if (coords.length === 0) return [];
  if (coords.length === 1) {
    const single = coords[0]!;
    return [{ lat: single.lat, lng: single.lng, cumulativeDistanceMeters: 0, headingDegrees: 0 }];
  }

  // Pre-calculate cumulative distance along raw segments
  const rawDistances: number[] = [0];
  for (let i = 0; i < coords.length - 1; i++) {
    const d = haversineDistance(coords[i]!, coords[i + 1]!);
    rawDistances.push(rawDistances[i]! + d);
  }

  const totalDist = rawDistances.at(-1)!;
  if (totalDist === 0) {
    const first = coords[0]!;
    return [{ lat: first.lat, lng: first.lng, cumulativeDistanceMeters: 0, headingDegrees: 0 }];
  }

  const resampled: RoutePoint[] = [];
  let currentRawIdx = 0;

  for (let d = 0; d < totalDist; d += stepMeters) {
    // Find enclosing segment
    while (
      currentRawIdx < rawDistances.length - 2 &&
      rawDistances[currentRawIdx + 1]! < d
    ) {
      currentRawIdx++;
    }

    const segStartDist = rawDistances[currentRawIdx]!;
    const segEndDist = rawDistances[currentRawIdx + 1]!;
    const segLen = segEndDist - segStartDist;

    const pA = coords[currentRawIdx]!;
    const pB = coords[currentRawIdx + 1]!;

    let lat = pA.lat;
    let lng = pA.lng;
    if (segLen > 0) {
      const frac = (d - segStartDist) / segLen;
      lat = pA.lat + frac * (pB.lat - pA.lat);
      lng = pA.lng + frac * (pB.lng - pA.lng);
    }

    const heading = computeHeading(pA, pB);
    resampled.push({
      lat,
      lng,
      cumulativeDistanceMeters: d,
      headingDegrees: heading,
    });
  }

  // Always include the exact final coordinate
  const lastRaw = coords.at(-1)!;
  const prevHeading =
    resampled.length > 0 ? resampled.at(-1)!.headingDegrees : 0;

  resampled.push({
    lat: lastRaw.lat,
    lng: lastRaw.lng,
    cumulativeDistanceMeters: totalDist,
    headingDegrees: prevHeading,
  });

  return resampled;
}

/**
 * Return total length in meters.
 */
export function totalLength(route: PreparedRoute | RoutePoint[]): number {
  if ("totalLengthMeters" in route) return route.totalLengthMeters;
  return route.length > 0 ? route.at(-1)!.cumulativeDistanceMeters : 0;
}

/**
 * Interpolate lat/lng and heading at a given cumulative distance.
 * Clamps distance to [0, totalLength].
 */
export function positionAt(
  route: PreparedRoute | RoutePoint[],
  distanceMeters: number,
): { lat: number; lng: number; heading: number } {
  const points = "points" in route ? route.points : route;
  if (points.length === 0) return { lat: 0, lng: 0, heading: 0 };
  if (points.length === 1) {
    const p = points[0]!;
    return { lat: p.lat, lng: p.lng, heading: p.headingDegrees };
  }

  const maxDist = points.at(-1)!.cumulativeDistanceMeters;
  const clampedD = Math.max(0, Math.min(distanceMeters, maxDist));

  // Binary search for point index
  let low = 0;
  let high = points.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid]!.cumulativeDistanceMeters <= clampedD) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const i = Math.max(0, Math.min(high, points.length - 2));
  const pA = points[i]!;
  const pB = points[i + 1]!;

  const segLen = pB.cumulativeDistanceMeters - pA.cumulativeDistanceMeters;
  if (segLen === 0) {
    return { lat: pA.lat, lng: pA.lng, heading: pA.headingDegrees };
  }

  const frac = (clampedD - pA.cumulativeDistanceMeters) / segLen;
  const lat = pA.lat + frac * (pB.lat - pA.lat);
  const lng = pA.lng + frac * (pB.lng - pA.lng);

  return {
    lat,
    lng,
    heading: pA.headingDegrees,
  };
}

/**
 * Distance remaining to a junction in meters.
 * Positive = upcoming; Negative = already passed.
 */
export function distanceToJunction(
  route: PreparedRoute,
  currentDistance: number,
  junctionId: string,
): number | null {
  const j = route.junctions[junctionId];
  if (!j) return null;
  return j.distanceMeters - currentDistance;
}

/**
 * Prepare a route object with resampled points and mapped junction distances.
 */
export function prepareRoute(
  coords: readonly LatLng[],
  junctions: readonly { id: string; name?: string; lat: number; lng: number }[],
  stepMeters = 10,
): PreparedRoute {
  const points = resampleRoute(coords, stepMeters);
  const total = totalLength(points);

  const mappedJunctions: Record<string, JunctionOnRoute> = {};

  for (const j of junctions) {
    // Find closest resampled point
    let closestDist = 0;
    let minD = Infinity;

    for (const p of points) {
      const d = haversineDistance(p, j);
      if (d < minD) {
        minD = d;
        closestDist = p.cumulativeDistanceMeters;
      }
    }

    mappedJunctions[j.id] = {
      id: j.id,
      name: j.name,
      lat: j.lat,
      lng: j.lng,
      distanceMeters: closestDist,
    };
  }

  return {
    points,
    totalLengthMeters: total,
    junctions: mappedJunctions,
  };
}
