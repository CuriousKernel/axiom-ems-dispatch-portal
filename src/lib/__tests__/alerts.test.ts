/**
 * src/lib/__tests__/alerts.test.ts
 *
 * Unit tests for src/lib/alerts.ts
 * Tests: every legal transition, illegal transitions rejected,
 *        timeout escalation, NOT_CLEARED re-escalation.
 */

import { describe, it, expect } from "vitest";
import {
  AlertState,
  createAlert,
  transitionAlert,
  escalateNoAck,
  escalateNotCleared,
  LEGAL_TRANSITIONS,
  ALERT_CONFIG,
} from "../alerts";

// ─── Helpers ──────────────────────────────────────────────────────────────

function freshAlert(overrides: Partial<Parameters<typeof createAlert>[0]> = {}) {
  return createAlert({
    id: "al-test-1",
    junctionId: "ito",
    officerId: "o3",
    createdAt: 1_000,
    ...overrides,
  });
}

// ─── Creation ─────────────────────────────────────────────────────────────

describe("createAlert", () => {
  it("starts in CREATED state", () => {
    const a = freshAlert();
    expect(a.state).toBe(AlertState.CREATED);
  });

  it("records a creation transition", () => {
    const a = freshAlert({ createdAt: 5000 });
    expect(a.transitions).toHaveLength(1);
    expect(a.transitions[0]?.to).toBe(AlertState.CREATED);
    expect(a.transitions[0]?.at).toBe(5000);
  });

  it("sets isLateAlert from param", () => {
    expect(freshAlert({ isLateAlert: true }).isLateAlert).toBe(true);
    expect(freshAlert({ isLateAlert: false }).isLateAlert).toBe(false);
  });
});

// ─── Legal transitions ────────────────────────────────────────────────────

describe("transitionAlert – legal transitions", () => {
  it("CREATED → SENT", () => {
    const a = transitionAlert(freshAlert(), AlertState.SENT);
    expect(a.state).toBe(AlertState.SENT);
    expect(a.transitions).toHaveLength(2);
  });

  it("SENT → ACKNOWLEDGED", () => {
    const a = transitionAlert(
      transitionAlert(freshAlert(), AlertState.SENT),
      AlertState.ACKNOWLEDGED,
    );
    expect(a.state).toBe(AlertState.ACKNOWLEDGED);
  });

  it("SENT → NO_ACK_TIMEOUT", () => {
    const sent = transitionAlert(freshAlert(), AlertState.SENT);
    const timed = transitionAlert(sent, AlertState.NO_ACK_TIMEOUT);
    expect(timed.state).toBe(AlertState.NO_ACK_TIMEOUT);
  });

  it("ACKNOWLEDGED → IN_POSITION", () => {
    const a = transitionAlert(
      transitionAlert(transitionAlert(freshAlert(), AlertState.SENT), AlertState.ACKNOWLEDGED),
      AlertState.IN_POSITION,
    );
    expect(a.state).toBe(AlertState.IN_POSITION);
  });

  it("ACKNOWLEDGED → NOT_CLEARED", () => {
    const acked = transitionAlert(
      transitionAlert(freshAlert(), AlertState.SENT),
      AlertState.ACKNOWLEDGED,
    );
    const nc = transitionAlert(acked, AlertState.NOT_CLEARED);
    expect(nc.state).toBe(AlertState.NOT_CLEARED);
  });

  it("IN_POSITION → CLEARING", () => {
    const inPos = [AlertState.SENT, AlertState.ACKNOWLEDGED, AlertState.IN_POSITION].reduce(
      (a, s) => transitionAlert(a, s),
      freshAlert(),
    );
    expect(transitionAlert(inPos, AlertState.CLEARING).state).toBe(AlertState.CLEARING);
  });

  it("CLEARING → VERIFIED_CLEAR", () => {
    const clearing = [
      AlertState.SENT,
      AlertState.ACKNOWLEDGED,
      AlertState.IN_POSITION,
      AlertState.CLEARING,
    ].reduce((a, s) => transitionAlert(a, s), freshAlert());
    expect(transitionAlert(clearing, AlertState.VERIFIED_CLEAR).state).toBe(
      AlertState.VERIFIED_CLEAR,
    );
  });

  it("CLEARING → NOT_CLEARED", () => {
    const clearing = [
      AlertState.SENT,
      AlertState.ACKNOWLEDGED,
      AlertState.IN_POSITION,
      AlertState.CLEARING,
    ].reduce((a, s) => transitionAlert(a, s), freshAlert());
    expect(transitionAlert(clearing, AlertState.NOT_CLEARED).state).toBe(AlertState.NOT_CLEARED);
  });

  it("NO_ACK_TIMEOUT → SENT (re-send after escalation)", () => {
    const sent = transitionAlert(freshAlert(), AlertState.SENT);
    const timed = transitionAlert(sent, AlertState.NO_ACK_TIMEOUT);
    const reSent = transitionAlert(timed, AlertState.SENT);
    expect(reSent.state).toBe(AlertState.SENT);
  });

  it("NOT_CLEARED → SENT (re-escalation)", () => {
    const acked = [AlertState.SENT, AlertState.ACKNOWLEDGED].reduce(
      (a, s) => transitionAlert(a, s),
      freshAlert(),
    );
    const nc = transitionAlert(acked, AlertState.NOT_CLEARED);
    expect(transitionAlert(nc, AlertState.SENT).state).toBe(AlertState.SENT);
  });

  it("timestamps each transition correctly", () => {
    const a = transitionAlert(freshAlert(), AlertState.SENT, "sent", 9999);
    expect(a.transitions.at(-1)?.at).toBe(9999);
    expect(a.transitions.at(-1)?.note).toBe("sent");
  });
});

// ─── Illegal transitions ──────────────────────────────────────────────────

describe("transitionAlert – illegal transitions rejected", () => {
  it("CREATED → ACKNOWLEDGED throws", () => {
    expect(() => transitionAlert(freshAlert(), AlertState.ACKNOWLEDGED)).toThrow(/Illegal/);
  });

  it("CREATED → VERIFIED_CLEAR throws", () => {
    expect(() => transitionAlert(freshAlert(), AlertState.VERIFIED_CLEAR)).toThrow(/Illegal/);
  });

  it("ACKNOWLEDGED → VERIFIED_CLEAR throws (must pass through IN_POSITION → CLEARING)", () => {
    const acked = [AlertState.SENT, AlertState.ACKNOWLEDGED].reduce(
      (a, s) => transitionAlert(a, s),
      freshAlert(),
    );
    expect(() => transitionAlert(acked, AlertState.VERIFIED_CLEAR)).toThrow(/Illegal/);
  });

  it("VERIFIED_CLEAR → anything throws (terminal state)", () => {
    const done = [
      AlertState.SENT,
      AlertState.ACKNOWLEDGED,
      AlertState.IN_POSITION,
      AlertState.CLEARING,
      AlertState.VERIFIED_CLEAR,
    ].reduce((a, s) => transitionAlert(a, s), freshAlert());
    expect(() => transitionAlert(done, AlertState.SENT)).toThrow(/Illegal/);
    expect(() => transitionAlert(done, AlertState.CREATED)).toThrow(/Illegal/);
  });

  it("SENT → IN_POSITION throws (must ACK first)", () => {
    const sent = transitionAlert(freshAlert(), AlertState.SENT);
    expect(() => transitionAlert(sent, AlertState.IN_POSITION)).toThrow(/Illegal/);
  });

  it("IN_POSITION → VERIFIED_CLEAR throws (must CLEAR first)", () => {
    const inPos = [AlertState.SENT, AlertState.ACKNOWLEDGED, AlertState.IN_POSITION].reduce(
      (a, s) => transitionAlert(a, s),
      freshAlert(),
    );
    expect(() => transitionAlert(inPos, AlertState.VERIFIED_CLEAR)).toThrow(/Illegal/);
  });
});

// ─── Timeout escalation ───────────────────────────────────────────────────

describe("escalateNoAck", () => {
  it("escalates to next officer and re-sends", () => {
    const sent = transitionAlert(freshAlert(), AlertState.SENT);
    const escalated = escalateNoAck(sent, "o4", 2000);
    expect(escalated.state).toBe(AlertState.SENT);
    expect(escalated.officerId).toBe("o4");
  });

  it("records NO_ACK_TIMEOUT then SENT in transitions", () => {
    const sent = transitionAlert(freshAlert(), AlertState.SENT);
    const escalated = escalateNoAck(sent, "o5");
    const states = escalated.transitions.map((t) => t.to);
    expect(states).toContain(AlertState.NO_ACK_TIMEOUT);
    expect(states.at(-1)).toBe(AlertState.SENT);
  });

  it("throws when escalating from a non-SENT state", () => {
    // escalateNoAck goes SENT → NO_ACK_TIMEOUT; can't do that from CREATED
    expect(() => escalateNoAck(freshAlert(), "o5")).toThrow(/Illegal/);
  });
});

// ─── NOT_CLEARED re-escalation ────────────────────────────────────────────

describe("escalateNotCleared", () => {
  it("re-escalates from ACKNOWLEDGED state", () => {
    const acked = [AlertState.SENT, AlertState.ACKNOWLEDGED].reduce(
      (a, s) => transitionAlert(a, s),
      freshAlert(),
    );
    const result = escalateNotCleared(acked, "o7");
    expect(result.state).toBe(AlertState.SENT);
    expect(result.officerId).toBe("o7");
  });

  it("re-escalates from CLEARING state", () => {
    const clearing = [
      AlertState.SENT,
      AlertState.ACKNOWLEDGED,
      AlertState.IN_POSITION,
      AlertState.CLEARING,
    ].reduce((a, s) => transitionAlert(a, s), freshAlert());
    const result = escalateNotCleared(clearing, "o8");
    expect(result.state).toBe(AlertState.SENT);
    expect(result.officerId).toBe("o8");
  });

  it("records NOT_CLEARED then SENT in transitions", () => {
    const acked = [AlertState.SENT, AlertState.ACKNOWLEDGED].reduce(
      (a, s) => transitionAlert(a, s),
      freshAlert(),
    );
    const result = escalateNotCleared(acked, "o7");
    const states = result.transitions.map((t) => t.to);
    expect(states).toContain(AlertState.NOT_CLEARED);
    expect(states.at(-1)).toBe(AlertState.SENT);
  });
});

// ─── LEGAL_TRANSITIONS sanity ─────────────────────────────────────────────

describe("LEGAL_TRANSITIONS", () => {
  it("covers all AlertState values", () => {
    const allStates = Object.values(AlertState);
    for (const s of allStates) {
      expect(LEGAL_TRANSITIONS[s]).toBeDefined();
    }
  });

  it("VERIFIED_CLEAR has no outgoing transitions", () => {
    expect(LEGAL_TRANSITIONS[AlertState.VERIFIED_CLEAR]).toHaveLength(0);
  });
});

// ─── Config ───────────────────────────────────────────────────────────────

describe("ALERT_CONFIG", () => {
  it("NO_ACK_TIMEOUT_S is 30", () => {
    expect(ALERT_CONFIG.NO_ACK_TIMEOUT_S).toBe(30);
  });
});
