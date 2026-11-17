/**
 * src/lib/__tests__/route.test.ts
 *
 * Unit tests for src/lib/route.ts
 * Tests: resample spacing, interpolation between points, heading,
 * distance to junction before and after passing it, clamping at the end,
 * and loading of the primary corridor route.
 */

import { describe, it, expect } from "vitest";
import {
  resampleRoute,
  positionAt,
  distanceToJunction,
  totalLength,
  computeHeading,
  haversineDistance,
  prepareRoute,
} from "../route";
import { PRIMARY_ROUTE } from "../route-data";

describe("Route geometry utilities", () => {
  // Simple straight line from South to North along longitude 77.0
  const southToNorth = [
    { lat: 28.60, lng: 77.0 },
    { lat: 28.61, lng: 77.0 },
  ];

  it("computes heading due North as ~0 degrees", () => {
    const heading = computeHeading(southToNorth[0]!, southToNorth[1]!);
    expect(heading).toBeCloseTo(0, 0);
  });

  it("computes heading due East as ~90 degrees", () => {
    const heading = computeHeading({ lat: 28.6, lng: 77.0 }, { lat: 28.6, lng: 77.1 });
    expect(heading).toBeCloseTo(90, 0);
  });

  it("computes heading due South as ~180 degrees", () => {
    const heading = computeHeading(southToNorth[1]!, southToNorth[0]!);
    expect(heading).toBeCloseTo(180, 0);
  });

  it("resamples route with even spacing", () => {
    const step = 20; // 20m steps
    const points = resampleRoute(southToNorth, step);
    expect(points.length).toBeGreaterThan(10);

    // Each point distance should be a multiple of step (except possibly the very last one)
    for (let i = 0; i < points.length - 1; i++) {
      expect(points[i]!.cumulativeDistanceMeters).toBeCloseTo(i * step, 1);
    }

    const total = totalLength(points);
    expect(points.at(-1)!.cumulativeDistanceMeters).toBeCloseTo(total, 1);
  });

  it("interpolates position accurately between points", () => {
    const points = resampleRoute(southToNorth, 10);
    const total = totalLength(points);
    const half = total / 2;

    const midPos = positionAt(points, half);
    // At midway, lat should be halfway between 28.60 and 28.61 (approx 28.605)
    expect(midPos.lat).toBeCloseTo(28.605, 3);
    expect(midPos.lng).toBeCloseTo(77.0, 4);
    expect(midPos.heading).toBeCloseTo(0, 0);
  });

  it("clamps at the start (distance <= 0)", () => {
    const points = resampleRoute(southToNorth, 10);
    const pos = positionAt(points, -50);
    expect(pos.lat).toBeCloseTo(southToNorth[0]!.lat, 4);
    expect(pos.lng).toBeCloseTo(southToNorth[0]!.lng, 4);
  });

  it("clamps at the end (distance >= totalLength)", () => {
    const points = resampleRoute(southToNorth, 10);
    const total = totalLength(points);
    const pos = positionAt(points, total + 500);
    expect(pos.lat).toBeCloseTo(southToNorth[1]!.lat, 4);
    expect(pos.lng).toBeCloseTo(southToNorth[1]!.lng, 4);
  });

  it("calculates distanceToJunction before and after passing it", () => {
    const junctions = [
      { id: "j1", lat: 28.605, lng: 77.0 }, // roughly midway
    ];
    const route = prepareRoute(southToNorth, junctions, 10);
    const jDist = route.junctions["j1"]!.distanceMeters;

    // Before passing
    const remainingBefore = distanceToJunction(route, jDist - 100, "j1");
    expect(remainingBefore).toBeCloseTo(100, 1);

    // After passing
    const remainingAfter = distanceToJunction(route, jDist + 80, "j1");
    expect(remainingAfter).toBeCloseTo(-80, 1);

    // Unknown junction
    expect(distanceToJunction(route, 0, "unknown")).toBeNull();
  });

  it("loads PRIMARY_ROUTE correctly with all 6 corridor junctions mapped in order", () => {
    expect(PRIMARY_ROUTE.points.length).toBeGreaterThan(500);
    expect(PRIMARY_ROUTE.totalLengthMeters).toBeGreaterThan(15000); // ~22km

    const jIds = ["cp", "mandi", "ito", "pragati", "ashram", "aiims"];
    let prevDist = -1;
    for (const id of jIds) {
      const j = PRIMARY_ROUTE.junctions[id];
      expect(j).toBeDefined();
      expect(j!.distanceMeters).toBeGreaterThan(prevDist);
      prevDist = j!.distanceMeters;
    }
  });
});
