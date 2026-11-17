import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  bearingDegrees,
  resampleRoute,
  buildRoute,
  positionAt,
  distanceToJunction,
  totalLength,
  pathBetween,
} from "../route";

// A straight line due north, ~1112 m long (0.01 degrees of latitude).
const NORTH = [
  { lat: 28.0, lng: 77.0 },
  { lat: 28.01, lng: 77.0 },
];
// A straight line due east.
const EAST = [
  { lat: 28.0, lng: 77.0 },
  { lat: 28.0, lng: 77.01 },
];

describe("haversine and bearing", () => {
  it("0.01 degrees of latitude is about 1112 m", () => {
    expect(haversineMeters(NORTH[0]!, NORTH[1]!)).toBeGreaterThan(1100);
    expect(haversineMeters(NORTH[0]!, NORTH[1]!)).toBeLessThan(1125);
  });
  it("bearing is ~0 for north and ~90 for east", () => {
    expect(bearingDegrees(NORTH[0]!, NORTH[1]!)).toBeCloseTo(0, 0);
    expect(bearingDegrees(EAST[0]!, EAST[1]!)).toBeCloseTo(90, 0);
  });
});

describe("resampleRoute", () => {
  it("spaces points 10 m apart and keeps the exact end point", () => {
    const pts = resampleRoute(NORTH, 10);
    for (let i = 1; i < pts.length - 1; i++) {
      expect(pts[i]!.dist - pts[i - 1]!.dist).toBeCloseTo(10, 6);
    }
    const last = pts[pts.length - 1]!;
    expect(last.lat).toBe(NORTH[1]!.lat);
    expect(last.dist - pts[pts.length - 2]!.dist).toBeLessThanOrEqual(10 + 1e-6);
    expect(last.dist).toBeCloseTo(haversineMeters(NORTH[0]!, NORTH[1]!), 3);
  });

  it("starts at the first coordinate with distance 0", () => {
    const pts = resampleRoute(NORTH, 10);
    expect(pts[0]).toEqual({ lat: 28.0, lng: 77.0, dist: 0 });
  });

  it("handles uneven raw spacing and a bend", () => {
    const bent = [
      { lat: 28.0, lng: 77.0 },
      { lat: 28.0005, lng: 77.0 }, // short first leg
      { lat: 28.0005, lng: 77.01 }, // long second leg, east
    ];
    const pts = resampleRoute(bent, 10);
    for (let i = 1; i < pts.length - 1; i++) {
      expect(pts[i]!.dist - pts[i - 1]!.dist).toBeCloseTo(10, 6);
    }
  });

  it("rejects a non-positive step and tolerates degenerate input", () => {
    expect(() => resampleRoute(NORTH, 0)).toThrow();
    expect(resampleRoute([])).toEqual([]);
    expect(resampleRoute([NORTH[0]!])).toHaveLength(1);
  });
});

describe("positionAt", () => {
  const route = buildRoute(NORTH, [], 10);

  it("returns the start at 0 and the end at total length", () => {
    expect(positionAt(route, 0).lat).toBeCloseTo(28.0, 6);
    expect(positionAt(route, totalLength(route)).lat).toBeCloseTo(28.01, 6);
  });

  it("interpolates between resampled points", () => {
    const mid = positionAt(route, totalLength(route) / 2);
    expect(mid.lat).toBeCloseTo(28.005, 4);
    // 5 m is between the points at 0 m and 10 m.
    const quarterStep = positionAt(route, 5);
    expect(quarterStep.lat).toBeGreaterThan(28.0);
    expect(quarterStep.lat).toBeLessThan(positionAt(route, 10).lat);
  });

  it("heading is north for a northbound route and east for an eastbound one", () => {
    expect(positionAt(route, 100).heading).toBeCloseTo(0, 0);
    expect(positionAt(buildRoute(EAST, [], 10), 100).heading).toBeCloseTo(90, 0);
  });

  it("clamps distances outside the route", () => {
    expect(positionAt(route, -50).lat).toBeCloseTo(28.0, 6);
    expect(positionAt(route, 99999).lat).toBeCloseTo(28.01, 6);
  });
});

describe("junction distances", () => {
  // Three junctions along the northbound line at 25%, 50%, 90%.
  const js = [
    { id: "a", lat: 28.0025, lng: 77.0 },
    { id: "b", lat: 28.005, lng: 77.0 },
    { id: "c", lat: 28.009, lng: 77.0 },
  ];
  const route = buildRoute(NORTH, js, 10);

  it("places junctions in travel order", () => {
    const d = route.junctionDistances;
    expect(d["a"]!).toBeLessThan(d["b"]!);
    expect(d["b"]!).toBeLessThan(d["c"]!);
    expect(d["b"]!).toBeCloseTo(totalLength(route) / 2, -1); // within ~10 m
  });

  it("distance to a junction shrinks as the ambulance advances, and goes negative once passed", () => {
    const before = distanceToJunction(route, 100, "b");
    const closer = distanceToJunction(route, 300, "b");
    const after = distanceToJunction(route, route.junctionDistances["b"]! + 50, "b");
    expect(before).toBeGreaterThan(closer);
    expect(closer).toBeGreaterThan(0);
    expect(after).toBeLessThan(0);
  });

  it("throws for an unknown junction", () => {
    expect(() => distanceToJunction(route, 0, "zzz")).toThrow();
  });

  it("a junction that the road passes twice cannot reorder the sequence", () => {
    // Out-and-back path: north then back south. Junction 'x' sits at the far
    // end; 'y' near the start. y listed AFTER x must still be found after x.
    const outAndBack = [
      { lat: 28.0, lng: 77.0 },
      { lat: 28.01, lng: 77.0 },
      { lat: 28.0, lng: 77.0 },
    ];
    const r = buildRoute(
      outAndBack,
      [
        { id: "x", lat: 28.01, lng: 77.0 },
        { id: "y", lat: 28.0, lng: 77.0 },
      ],
      10,
    );
    expect(r.junctionDistances["y"]!).toBeGreaterThan(r.junctionDistances["x"]!);
  });
});

describe("pathBetween", () => {
  const route = buildRoute(NORTH, [], 10);
  it("returns a polyline that starts and ends at the requested distances", () => {
    const path = pathBetween(route, 100, 400);
    expect(path.length).toBeGreaterThan(2);
    expect(path[0]!.lat).toBeCloseTo(positionAt(route, 100).lat, 8);
    expect(path[path.length - 1]!.lat).toBeCloseTo(positionAt(route, 400).lat, 8);
  });
});
