/**
 * src/lib/__tests__/route-data.test.ts
 *
 * Tests for route-data loader and routeIsSynthetic detection.
 */

import { describe, it, expect } from "vitest";
import { PRIMARY_ROUTE, routeIsSynthetic } from "../route-data";

describe("route-data", () => {
  it("PRIMARY_ROUTE is prepared with points and junctions", () => {
    expect(PRIMARY_ROUTE).toBeDefined();
    expect(PRIMARY_ROUTE.points.length).toBeGreaterThan(100);
    expect(PRIMARY_ROUTE.totalLengthMeters).toBeGreaterThan(10000);
    expect(PRIMARY_ROUTE.junctions["cp"]).toBeDefined();
    expect(PRIMARY_ROUTE.junctions["aiims"]).toBeDefined();
  });

  it("routeIsSynthetic is false for the real OSRM route (>50 points)", () => {
    // The real route-primary.json has 566 points, so it is NOT synthetic
    expect(routeIsSynthetic).toBe(false);
  });
});
