/**
 * src/lib/__tests__/criticality.test.ts
 *
 * Unit tests for src/lib/criticality.ts
 * Tests: clear junction, watch band, critical, transition-only alerting (no duplicate),
 *        late alert, zero queue, very high queue.
 */

import { describe, it, expect } from "vitest";
import { computeCriticality, CRITICALITY_CONFIG, type CriticalityInput } from "../criticality";

const { BUFFER_S, WATCH_WINDOW_S, LEAD_PADDING_S } = CRITICALITY_CONFIG;

function makeInput(overrides: Partial<CriticalityInput> = {}): CriticalityInput {
  return {
    junctionId: "test",
    queueCount: 10,
    eta: 200,
    dischargeRate: 0.5,
    officerTravelTime: 20,
    ...overrides,
  };
}

// ─── Status classification ────────────────────────────────────────────────

describe("computeCriticality – status classification", () => {
  it("returns CLEAR when margin is well above zero", () => {
    // clearTime = 10 / 0.5 = 20 s; margin = 200 - (20 + 10) = 170 s > WATCH_WINDOW
    const result = computeCriticality(makeInput({ queueCount: 10, eta: 200 }), null);
    expect(result.status).toBe("CLEAR");
    expect(result.clearTime).toBe(20);
    expect(result.isNewCritical).toBe(false);
  });

  it("returns WATCH when within the watch window but not yet critical", () => {
    // clearTime = 60 / 0.5 = 120 s
    // margin = eta - (clearTime + BUFFER_S) must satisfy 0 < margin <= WATCH_WINDOW_S (20)
    // So eta = 120 + 10 + 15 = 145 → margin = 15 (inside watch window)
    const result = computeCriticality(
      makeInput({ queueCount: 60, eta: 145, dischargeRate: 0.5 }),
      null,
    );
    expect(result.status).toBe("WATCH");
    expect(result.isNewCritical).toBe(false);
  });

  it("returns CRITICAL when clearTime + buffer >= eta", () => {
    // clearTime = 100 / 0.5 = 200 s; margin = 200 - (200 + 10) = -10 (negative → CRITICAL)
    const result = computeCriticality(makeInput({ queueCount: 100, eta: 200 }), null);
    expect(result.status).toBe("CRITICAL");
  });

  it("returns CRITICAL when margin is exactly 0 (boundary)", () => {
    // clearTime = 100 s; eta = 110 → margin = 110 - (100 + 10) = 0 → CRITICAL
    const result = computeCriticality(
      makeInput({ queueCount: 50, eta: 110, dischargeRate: 0.5 }),
      null,
    );
    expect(result.status).toBe("CRITICAL");
  });

  it("returns WATCH at the outer edge of the watch window", () => {
    // margin = WATCH_WINDOW_S exactly → WATCH
    // clearTime + BUFFER_S + WATCH_WINDOW_S = eta
    // => clearTime = eta - BUFFER_S - WATCH_WINDOW_S
    // eta = 100, clearTime = 100 - 10 - 20 = 70 → queueCount = 70 * 0.5 = 35
    const result = computeCriticality(
      makeInput({ queueCount: 35, eta: 100, dischargeRate: 0.5 }),
      null,
    );
    expect(result.status).toBe("WATCH");
  });
});

// ─── Transition alerting ──────────────────────────────────────────────────

describe("computeCriticality – transition-only alerting", () => {
  it("isNewCritical is true when transitioning from CLEAR to CRITICAL", () => {
    const result = computeCriticality(makeInput({ queueCount: 100, eta: 150 }), "CLEAR");
    expect(result.isNewCritical).toBe(true);
  });

  it("isNewCritical is true when transitioning from WATCH to CRITICAL", () => {
    const result = computeCriticality(makeInput({ queueCount: 100, eta: 150 }), "WATCH");
    expect(result.isNewCritical).toBe(true);
  });

  it("isNewCritical is true when prevStatus is null and status is CRITICAL", () => {
    const result = computeCriticality(makeInput({ queueCount: 100, eta: 150 }), null);
    expect(result.isNewCritical).toBe(true);
  });

  it("isNewCritical is FALSE when already CRITICAL (no duplicate)", () => {
    // Second tick: prevStatus is already CRITICAL → no new alert
    const result = computeCriticality(makeInput({ queueCount: 100, eta: 150 }), "CRITICAL");
    expect(result.isNewCritical).toBe(false);
  });

  it("isNewCritical is false for CLEAR status regardless of prev", () => {
    const result = computeCriticality(makeInput({ queueCount: 5, eta: 300 }), null);
    expect(result.isNewCritical).toBe(false);
  });
});

// ─── Late alert ───────────────────────────────────────────────────────────

describe("computeCriticality – late alert", () => {
  it("isLateAlert is true when eta < officerTravelTime + LEAD_PADDING_S", () => {
    // eta=40, officerTravelTime=20, LEAD_PADDING_S=30 → needed=50, eta=40 → late
    const result = computeCriticality(
      makeInput({ queueCount: 100, eta: 40, officerTravelTime: 20 }),
      "WATCH",
    );
    expect(result.isNewCritical).toBe(true);
    expect(result.isLateAlert).toBe(true);
  });

  it("isLateAlert is false when enough lead time", () => {
    // eta=200, officerTravelTime=20, LEAD_PADDING_S=30 → needed=50, eta=200 → ok
    const result = computeCriticality(
      makeInput({ queueCount: 100, eta: 200, officerTravelTime: 20 }),
      "WATCH",
    );
    expect(result.isNewCritical).toBe(true);
    expect(result.isLateAlert).toBe(false);
  });

  it("isLateAlert is false when not a new critical (no alert fires)", () => {
    // Already CRITICAL → no alert, so late-alert check doesn't apply
    const result = computeCriticality(
      makeInput({ queueCount: 100, eta: 40, officerTravelTime: 20 }),
      "CRITICAL",
    );
    expect(result.isNewCritical).toBe(false);
    expect(result.isLateAlert).toBe(false);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────

describe("computeCriticality – edge cases", () => {
  it("zero queue → clearTime=0, status CLEAR", () => {
    const result = computeCriticality(makeInput({ queueCount: 0, eta: 200 }), null);
    expect(result.clearTime).toBe(0);
    expect(result.status).toBe("CLEAR");
    expect(result.isNewCritical).toBe(false);
  });

  it("very high queue → CRITICAL", () => {
    // 1000 vehicles at 0.5 veh/s = 2000 s clearTime >> eta 300
    const result = computeCriticality(
      makeInput({ queueCount: 1000, eta: 300, dischargeRate: 0.5 }),
      null,
    );
    expect(result.status).toBe("CRITICAL");
    expect(result.clearTime).toBe(2000);
  });

  it("falls back to DEFAULT_DISCHARGE_RATE when dischargeRate is undefined", () => {
    const { DEFAULT_DISCHARGE_RATE } = CRITICALITY_CONFIG;
    const result = computeCriticality(
      { junctionId: "x", queueCount: 10, eta: 200 },
      null,
    );
    expect(result.dischargeRate).toBe(DEFAULT_DISCHARGE_RATE);
    expect(result.clearTime).toBeCloseTo(10 / DEFAULT_DISCHARGE_RATE, 5);
  });

  it("confirms BUFFER_S and WATCH_WINDOW_S are correct defaults from config", () => {
    expect(BUFFER_S).toBe(10);
    expect(WATCH_WINDOW_S).toBe(20);
    expect(LEAD_PADDING_S).toBe(30);
  });
});
