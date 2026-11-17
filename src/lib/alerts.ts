/**
 * src/lib/alerts.ts
 *
 * Explicit state machine for alert lifecycle.
 * Uses a TypeScript enum + a transition table so illegal transitions are caught
 * at the boundary rather than silently allowed.
 *
 * State graph:
 *
 *   CREATED → SENT → ACKNOWLEDGED → IN_POSITION → CLEARING → VERIFIED_CLEAR
 *                ↓                       ↓
 *         NO_ACK_TIMEOUT           NOT_CLEARED
 *
 * Failure paths:
 *   NO_ACK_TIMEOUT: 30 s without ACK → escalate to next officer, then control room.
 *   NOT_CLEARED:    queue still high after "Road cleared" tap → re-escalate.
 */

// ─── Enum ─────────────────────────────────────────────────────────────────

export enum AlertState {
  CREATED = "CREATED",
  SENT = "SENT",
  ACKNOWLEDGED = "ACKNOWLEDGED",
  IN_POSITION = "IN_POSITION",
  CLEARING = "CLEARING",
  VERIFIED_CLEAR = "VERIFIED_CLEAR",
  NO_ACK_TIMEOUT = "NO_ACK_TIMEOUT",
  NOT_CLEARED = "NOT_CLEARED",
}

// ─── Config ───────────────────────────────────────────────────────────────

export const ALERT_CONFIG = {
  /** Seconds before escalation if no acknowledgement. */
  NO_ACK_TIMEOUT_S: 30,
} as const;

// ─── Transition table ─────────────────────────────────────────────────────

/**
 * Maps each state to the set of states it may legally transition into.
 * Any transition not listed here is illegal.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<AlertState, readonly AlertState[]>> = {
  [AlertState.CREATED]: [AlertState.SENT],
  [AlertState.SENT]: [AlertState.ACKNOWLEDGED, AlertState.NO_ACK_TIMEOUT],
  [AlertState.ACKNOWLEDGED]: [AlertState.IN_POSITION, AlertState.NOT_CLEARED],
  [AlertState.IN_POSITION]: [AlertState.CLEARING, AlertState.NOT_CLEARED],
  [AlertState.CLEARING]: [AlertState.VERIFIED_CLEAR, AlertState.NOT_CLEARED],
  [AlertState.VERIFIED_CLEAR]: [],
  [AlertState.NO_ACK_TIMEOUT]: [AlertState.SENT],      // re-sent after escalation
  [AlertState.NOT_CLEARED]: [AlertState.SENT],          // re-sent after re-escalation
} as const;

// ─── Types ────────────────────────────────────────────────────────────────

export interface AlertTransition {
  from: AlertState;
  to: AlertState;
  /** Unix ms timestamp. */
  at: number;
  note?: string | undefined;
}

export interface AlertRecord {
  id: string;
  junctionId: string;
  officerId: string;
  state: AlertState;
  createdAt: number;
  transitions: AlertTransition[];
  /** True when the alert fires too late for the officer to arrive. */
  isLateAlert: boolean;
}

// ─── State machine ────────────────────────────────────────────────────────

/**
 * Create a fresh alert in CREATED state.
 */
export function createAlert(params: {
  id: string;
  junctionId: string;
  officerId: string;
  createdAt?: number | undefined;
  isLateAlert?: boolean | undefined;
}): AlertRecord {
  const now = params.createdAt ?? Date.now();
  return {
    id: params.id,
    junctionId: params.junctionId,
    officerId: params.officerId,
    state: AlertState.CREATED,
    createdAt: now,
    transitions: [{ from: AlertState.CREATED, to: AlertState.CREATED, at: now, note: "created" }],
    isLateAlert: params.isLateAlert ?? false,
  };
}

/**
 * Attempt a state transition. Returns the updated AlertRecord.
 * Throws if the transition is illegal.
 */
export function transitionAlert(
  record: AlertRecord,
  to: AlertState,
  note?: string | undefined,
  at?: number | undefined,
): AlertRecord {
  const allowed = LEGAL_TRANSITIONS[record.state];
  if (!allowed.includes(to)) {
    throw new Error(
      `Illegal alert transition: ${record.state} → ${to} (id=${record.id}). ` +
        `Allowed from ${record.state}: [${allowed.join(", ")}]`,
    );
  }
  const ts = at ?? Date.now();
  const transition: AlertTransition = { from: record.state, to, at: ts, note };
  return {
    ...record,
    state: to,
    transitions: [...record.transitions, transition],
  };
}

/**
 * Handle NO_ACK_TIMEOUT: escalate to a new officer then re-send.
 * Returns the updated record with the new officerId.
 */
export function escalateNoAck(
  record: AlertRecord,
  nextOfficerId: string,
  at?: number | undefined,
): AlertRecord {
  const ts = at ?? Date.now();
  // First mark it timed-out, then re-send to the escalated officer.
  const timedOut = transitionAlert(record, AlertState.NO_ACK_TIMEOUT, "no ack within 30 s", ts);
  const reSent: AlertRecord = {
    ...timedOut,
    officerId: nextOfficerId,
  };
  return transitionAlert(reSent, AlertState.SENT, `escalated to officer ${nextOfficerId}`, ts);
}

/**
 * Handle NOT_CLEARED: queue still high after officer taps "Road cleared".
 * Re-escalates to a new officer.
 */
export function escalateNotCleared(
  record: AlertRecord,
  nextOfficerId: string,
  at?: number | undefined,
): AlertRecord {
  const ts = at ?? Date.now();
  const notCleared = transitionAlert(record, AlertState.NOT_CLEARED, "queue still high", ts);
  const reSent: AlertRecord = {
    ...notCleared,
    officerId: nextOfficerId,
  };
  return transitionAlert(reSent, AlertState.SENT, `re-escalated to officer ${nextOfficerId}`, ts);
}
