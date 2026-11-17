/**
 * src/lib/__tests__/assignment.test.ts
 *
 * Unit tests for src/lib/assignment.ts
 * Tests: nearest wins, offline officers skipped, tie-break, none online.
 */

import { describe, it, expect } from "vitest";
import { findNearestOfficer, assignOfficers, haversineMetres } from "../assignment";
import type { Officer } from "@/lib/axiom/types";

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeOfficer(id: string, lat: number, lng: number, online = true, activeAlerts = 0): Officer {
  return {
    id,
    name: `Officer ${id}`,
    rank: "Const.",
    junctionId: "j1",
    lat,
    lng,
    online,
    activeAlerts,
  };
}

/** ITO junction as target */
const TARGET = { lat: 28.6289, lng: 77.241 };

// ─── haversineMetres ──────────────────────────────────────────────────────

describe("haversineMetres", () => {
  it("returns 0 for the same point", () => {
    expect(haversineMetres(TARGET, TARGET)).toBe(0);
  });

  it("is symmetric", () => {
    const a = { lat: 28.63, lng: 77.21 };
    const b = { lat: 28.57, lng: 77.26 };
    expect(haversineMetres(a, b)).toBeCloseTo(haversineMetres(b, a), 5);
  });

  it("returns a positive value for distinct points", () => {
    expect(haversineMetres({ lat: 28.6315, lng: 77.2167 }, TARGET)).toBeGreaterThan(0);
  });
});

// ─── findNearestOfficer ───────────────────────────────────────────────────

describe("findNearestOfficer – nearest wins", () => {
  it("picks the closest online officer", () => {
    const near = makeOfficer("near", 28.6291, 77.2412);  // very close to TARGET
    const far = makeOfficer("far", 28.5713, 77.2588);    // Ashram Chowk
    const result = findNearestOfficer([far, near], TARGET);
    expect(result.kind).toBe("assigned");
    if (result.kind === "assigned") {
      expect(result.officer.id).toBe("near");
    }
  });

  it("includes distance in result", () => {
    const o = makeOfficer("o1", 28.6291, 77.2412);
    const result = findNearestOfficer([o], TARGET);
    expect(result.kind).toBe("assigned");
    if (result.kind === "assigned") {
      expect(result.distanceM).toBeGreaterThan(0);
      expect(result.distanceM).toBeLessThan(500); // <500 m away
    }
  });
});

describe("findNearestOfficer – offline officers skipped", () => {
  it("skips offline officers even if closer", () => {
    const nearOffline = makeOfficer("close-offline", 28.629, 77.241, false);
    const farOnline = makeOfficer("far-online", 28.5713, 77.2588, true);
    const result = findNearestOfficer([nearOffline, farOnline], TARGET);
    expect(result.kind).toBe("assigned");
    if (result.kind === "assigned") {
      expect(result.officer.id).toBe("far-online");
    }
  });

  it("returns none_online when all officers are offline", () => {
    const officers = [
      makeOfficer("o1", 28.629, 77.241, false),
      makeOfficer("o2", 28.57, 77.26, false),
    ];
    expect(findNearestOfficer(officers, TARGET)).toEqual({ kind: "none_online" });
  });
});

describe("findNearestOfficer – tie-break by fewer active alerts", () => {
  it("picks the officer with fewer active alerts on equal distance", () => {
    // Both at exactly the same location → distance ties → fewer alerts wins
    const o1 = makeOfficer("busy", TARGET.lat, TARGET.lng, true, 3);
    const o2 = makeOfficer("free", TARGET.lat, TARGET.lng, true, 0);
    const result = findNearestOfficer([o1, o2], TARGET);
    expect(result.kind).toBe("assigned");
    if (result.kind === "assigned") {
      expect(result.officer.id).toBe("free");
    }
  });
});

describe("findNearestOfficer – none online", () => {
  it("returns none_online for empty list", () => {
    expect(findNearestOfficer([], TARGET)).toEqual({ kind: "none_online" });
  });

  it("returns none_online when all excluded", () => {
    const o = makeOfficer("o1", TARGET.lat, TARGET.lng);
    expect(findNearestOfficer([o], TARGET, ["o1"])).toEqual({ kind: "none_online" });
  });
});

// ─── assignOfficers ───────────────────────────────────────────────────────

describe("assignOfficers", () => {
  it("returns different officers for primary and escalation", () => {
    const o1 = makeOfficer("o1", 28.629, 77.241);
    const o2 = makeOfficer("o2", 28.6315, 77.2167);
    const { primary, escalation } = assignOfficers([o1, o2], TARGET);
    expect(primary.kind).toBe("assigned");
    expect(escalation.kind).toBe("assigned");
    if (primary.kind === "assigned" && escalation.kind === "assigned") {
      expect(primary.officer.id).not.toBe(escalation.officer.id);
    }
  });

  it("escalation is none_online when only one officer exists", () => {
    const o1 = makeOfficer("o1", 28.629, 77.241);
    const { escalation } = assignOfficers([o1], TARGET);
    expect(escalation.kind).toBe("none_online");
  });

  it("both are none_online when no officers exist", () => {
    const { primary, escalation } = assignOfficers([], TARGET);
    expect(primary.kind).toBe("none_online");
    expect(escalation.kind).toBe("none_online");
  });
});
