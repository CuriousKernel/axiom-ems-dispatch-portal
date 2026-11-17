/**
 * src/lib/__tests__/criticality.test.ts
 *
 * Unit tests for src/lib/criticality.ts
 * Tests: clear junction, watch band, critical, transition-only alerting (no duplicate),
 *        late alert, zero queue, very high queue.
 * + Hysteresis (anti-flapping) tests for advanceHysteresis.
 */

import { describe, it, expect } from "vitest";
import {
  computeCriticality,
  advanceHysteresis,
  CRITICALITY_CONFIG,
  type CriticalityInput,
  type HysteresisState,
} from "../criticality";

const { BUFFER_S, WATCH_WINDOW_S, LEAD_PADDING_S, HYSTERESIS_TICKS } = CRITICALITY_CONFIG;

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

function freshHyst(): HysteresisState {
  return { confirmedStatus: null, recoveryTicks: 0 };
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

// ─── Hysteresis (anti-flapping) ───────────────────────────────────────────

describe("advanceHysteresis – anti-flapping", () => {
  it("CRITICAL → confirmedStatus is CRITICAL, recoveryTicks resets to 0", () => {
    const next = advanceHysteresis("CRITICAL", freshHyst());
    expect(next.confirmedStatus).toBe("CRITICAL");
    expect(next.recoveryTicks).toBe(0);
  });

  it("non-CRITICAL with no prior CRITICAL → just tracks the raw status", () => {
    const next = advanceHysteresis("WATCH", freshHyst());
    expect(next.confirmedStatus).toBe("WATCH");
    expect(next.recoveryTicks).toBe(0);
  });

  it("brief WATCH after CRITICAL keeps confirmedStatus CRITICAL (hysteresis window)", () => {
    // Was CRITICAL, now WATCH for 1 tick — still inside hysteresis window
    const afterCritical: HysteresisState = { confirmedStatus: "CRITICAL", recoveryTicks: 0 };
    const next = advanceHysteresis("WATCH", afterCritical);
    expect(next.confirmedStatus).toBe("CRITICAL");
    expect(next.recoveryTicks).toBe(1);
  });

  it("stays locked CRITICAL through HYSTERESIS_TICKS - 1 non-critical ticks", () => {
    let state: HysteresisState = { confirmedStatus: "CRITICAL", recoveryTicks: 0 };
    for (let i = 0; i < HYSTERESIS_TICKS - 1; i++) {
      state = advanceHysteresis("CLEAR", state);
      expect(state.confirmedStatus).toBe("CRITICAL");
    }
  });

  it("releases CRITICAL lock after HYSTERESIS_TICKS non-critical ticks", () => {
    let state: HysteresisState = { confirmedStatus: "CRITICAL", recoveryTicks: 0 };
    for (let i = 0; i < HYSTERESIS_TICKS; i++) {
      state = advanceHysteresis("CLEAR", state);
    }
    expect(state.confirmedStatus).toBe("CLEAR");
    expect(state.recoveryTicks).toBe(HYSTERESIS_TICKS);
  });

  it("CRITICAL resets recoveryTicks mid-recovery", () => {
    // 2 recovery ticks, then CRITICAL again
    let state: HysteresisState = { confirmedStatus: "CRITICAL", recoveryTicks: 0 };
    state = advanceHysteresis("CLEAR", state); // tick 1
    state = advanceHysteresis("CLEAR", state); // tick 2
    expect(state.recoveryTicks).toBe(2);
    state = advanceHysteresis("CRITICAL", state); // back to CRITICAL
    expect(state.confirmedStatus).toBe("CRITICAL");
    expect(state.recoveryTicks).toBe(0); // reset
  });

  it("flapping scenario: CRITICAL→WATCH→CRITICAL does NOT re-arm alert (within window)", () => {
    // Simulate: junction goes CRITICAL (tick 1), drops to WATCH (tick 2),
    // comes back to CRITICAL (tick 3). The hysteresis lock should mean tick 3
    // has confirmedStatus "CRITICAL" on tick 2, so computeCriticality sees
    // prevStatus="CRITICAL" and does NOT fire isNewCritical on tick 3.

    // Tick 1: raw=CRITICAL, prev=null → isNewCritical=true
    const hyst0 = freshHyst();
    const r1 = computeCriticality(makeInput({ queueCount: 100, eta: 150 }), hyst0.confirmedStatus);
    expect(r1.isNewCritical).toBe(true);
    const hyst1 = advanceHysteresis(r1.status, hyst0);
    expect(hyst1.confirmedStatus).toBe("CRITICAL");

    // Tick 2: raw=WATCH (slider lowered briefly), confirmedStatus stays CRITICAL
    const r2 = computeCriticality(
      makeInput({ queueCount: 35, eta: 100 }),
      hyst1.confirmedStatus, // still "CRITICAL"
    );
    expect(r2.status).toBe("WATCH"); // raw is WATCH
    expect(r2.isNewCritical).toBe(false); // but prevStatus was CRITICAL, raw is WATCH, not new critical
    const hyst2 = advanceHysteresis(r2.status, hyst1);
    expect(hyst2.confirmedStatus).toBe("CRITICAL"); // still locked — 1 tick recovery, need HYSTERESIS_TICKS

    // Tick 3: raw=CRITICAL again, confirmedStatus is still CRITICAL → NO new alert
    const r3 = computeCriticality(
      makeInput({ queueCount: 100, eta: 150 }),
      hyst2.confirmedStatus, // "CRITICAL"
    );
    expect(r3.isNewCritical).toBe(false); // correctly suppressed — no duplicate alert
  });

  it("isNewCritical fires again only after full hysteresis recovery", () => {
    // Tick 1: CRITICAL, fires alert
    let hyst = freshHyst();
    const r1 = computeCriticality(makeInput({ queueCount: 100, eta: 150 }), hyst.confirmedStatus);
    expect(r1.isNewCritical).toBe(true);
    hyst = advanceHysteresis(r1.status, hyst);

    // Ticks 2..N: CLEAR — advance through hysteresis window
    for (let i = 0; i < HYSTERESIS_TICKS; i++) {
      const r = computeCriticality(makeInput({ queueCount: 0, eta: 300 }), hyst.confirmedStatus);
      hyst = advanceHysteresis(r.status, hyst);
    }
    expect(hyst.confirmedStatus).toBe("CLEAR"); // lock released

    // Now CRITICAL again — should fire a new alert
    const rFinal = computeCriticality(
      makeInput({ queueCount: 100, eta: 150 }),
      hyst.confirmedStatus,
    );
    expect(rFinal.isNewCritical).toBe(true);
  });
});
