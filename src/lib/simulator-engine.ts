/**
 * src/lib/simulator-engine.ts
 *
 * The Phase 2 simulator engine. A Zustand store that:
 *   1. Holds a SimulatedSource (density sliders per junction).
 *   2. Runs a 2-second tick (via setInterval) to recompute criticality.
 *   3. Creates exactly one alert per CRITICAL transition (no duplicates).
 *   4. Applies hysteresis: a junction must stay non-CRITICAL for HYSTERESIS_TICKS
 *      consecutive ticks before the trigger re-arms (prevents flapping alerts).
 *   5. Tracks per-alert SENT time and calls escalateNoAck() when NO_ACK_TIMEOUT_S
 *      elapse without acknowledgement — the timeout is a live trigger, not dead code.
 *   6. Routes LATE_ALERTs directly to "control-room" instead of an officer.
 */

import { create } from "zustand";
import { JUNCTIONS, OFFICERS } from "@/lib/axiom/seed";
import { computeCriticality, advanceHysteresis, type HysteresisState } from "@/lib/criticality";
import {
  createAlert,
  transitionAlert,
  escalateNoAck,
  AlertState,
  ALERT_CONFIG,
} from "@/lib/alerts";
import type { AlertRecord } from "@/lib/alerts";
import { findNearestOfficer } from "@/lib/assignment";
import { SimulatedSource, type ScenarioName } from "@/lib/sources/simulated";
import type { JunctionStatus } from "@/lib/axiom/types";

// ─── Demo ETAs (fixed for Phase 2 – moving ambulance arrives in Phase 3) ──

/** Fixed ETA (seconds) per junction for the Phase 2 demo. */
export const DEMO_ETAS: Record<string, number> = {
  cp:      0,
  mandi:   95,
  ito:     150,
  pragati: 260,
  ashram:  520,
  aiims:   760,
};

// ─── Types ────────────────────────────────────────────────────────────────

export interface JunctionLiveReading {
  junctionId: string;
  name: string;
  vehicleCount: number;
  clearTime: number;
  eta: number;
  status: JunctionStatus;
  density: number;
}

export interface SimEvent {
  id: string;
  at: number;
  type: "status" | "alert" | "system";
  message: string;
}

interface SimState {
  source: SimulatedSource;
  readings: JunctionLiveReading[];
  /**
   * Hysteresis-confirmed statuses used to detect genuine CRITICAL transitions.
   * This is what computeCriticality receives as prevStatus — NOT the raw status.
   */
  confirmedStatuses: Record<string, JunctionStatus>;
  /**
   * Per-junction hysteresis state (recovery tick counter).
   */
  hysteresis: Record<string, HysteresisState>;
  alerts: AlertRecord[];
  events: SimEvent[];
  _tickHandle: ReturnType<typeof setInterval> | null;

  // ─── Actions ─────────────────────────────────────────────────────────
  setDensity: (junctionId: string, density: number) => void;
  applyScenario: (name: ScenarioName) => void;
  startTicking: () => void;
  stopTicking: () => void;
  tick: () => void;
  /**
   * Acknowledge an alert (transitions SENT → ACKNOWLEDGED).
   * Called by the officer UI in later phases; exposed here for testability.
   */
  acknowledgeAlert: (alertId: string) => void;
}

// ─── Sequence counters ────────────────────────────────────────────────────

let eventSeq = 0;
function nextEventId() { return `ev-${++eventSeq}`; }

let alertSeq = 0;
function nextAlertId() { return `al-${++alertSeq}`; }

// ─── Store ────────────────────────────────────────────────────────────────

export const useSimulator = create<SimState>((set, get) => {
  const source = new SimulatedSource();

  // ── Timeout escalation ───────────────────────────────────────────────
  /**
   * GAP 2 FIX: scan all alerts in SENT state each tick.
   * If more than NO_ACK_TIMEOUT_S have elapsed since the most recent SENT
   * transition, call escalateNoAck() with the next-nearest available officer.
   *
   * Returns updated alert list and any new log events.
   */
  function processTimeouts(
    alerts: AlertRecord[],
    nowMs: number,
  ): { alerts: AlertRecord[]; events: SimEvent[] } {
    const newEvents: SimEvent[] = [];
    const updated = alerts.map((a) => {
      if (a.state !== AlertState.SENT) return a;

      // Find the timestamp of the last transition that set state to SENT.
      const lastSent = [...a.transitions]
        .reverse()
        .find((t) => t.to === AlertState.SENT);

      if (!lastSent) return a;

      const elapsedS = (nowMs - lastSent.at) / 1000;
      if (elapsedS < ALERT_CONFIG.NO_ACK_TIMEOUT_S) return a;

      // Timed out. Find the junction coordinates for this alert.
      const junction = JUNCTIONS.find((j) => j.id === a.junctionId);
      if (!junction) return a;

      // Find next-nearest officer, excluding the current one (already failed).
      const escalation = findNearestOfficer(OFFICERS, junction, [a.officerId]);
      const nextId =
        escalation.kind === "assigned" ? escalation.officer.id : "control-room";

      try {
        const escalated = escalateNoAck(a, nextId, nowMs);
        newEvents.push({
          id: nextEventId(),
          at: nowMs,
          type: "alert",
          message: `No ACK from ${a.officerId} for ${junction.name} after ${ALERT_CONFIG.NO_ACK_TIMEOUT_S}s — escalated to ${nextId}`,
        });
        return escalated;
      } catch {
        // Escalation failed (e.g., alert already left SENT state between ticks).
        return a;
      }
    });

    return { alerts: updated, events: newEvents };
  }

  // ── Main tick logic ───────────────────────────────────────────────────
  function runTick(): void {
    const { confirmedStatuses, hysteresis, alerts, events } = get();
    const nowMs = Date.now();

    const newReadings: JunctionLiveReading[] = [];
    const newAlerts: AlertRecord[] = [];
    const newStatusEvents: SimEvent[] = [];

    const nextConfirmedStatuses: Record<string, JunctionStatus> = {};
    const nextHysteresis: Record<string, HysteresisState> = {};

    for (const j of JUNCTIONS) {
      const queueReading = source.getReading(j.id);
      const eta = DEMO_ETAS[j.id] ?? 999;

      // prevStatus is the hysteresis-confirmed status (not raw previous tick).
      const prevConfirmed = confirmedStatuses[j.id] ?? null;

      const result = computeCriticality(
        {
          junctionId: j.id,
          queueCount: queueReading.vehicleCount,
          eta,
          dischargeRate: j.dischargeRate,
          officerTravelTime: 20,
        },
        prevConfirmed,
      );

      // GAP 3 FIX: advance hysteresis with the raw result status.
      const prevHyst: HysteresisState = hysteresis[j.id] ?? {
        confirmedStatus: null,
        recoveryTicks: 0,
      };
      const nextHyst = advanceHysteresis(result.status, prevHyst);
      nextHysteresis[j.id] = nextHyst;
      nextConfirmedStatuses[j.id] = nextHyst.confirmedStatus ?? result.status;

      const clearTime =
        result.clearTime < Number.MAX_SAFE_INTEGER ? result.clearTime : 9999;

      newReadings.push({
        junctionId: j.id,
        name: j.name,
        vehicleCount: queueReading.vehicleCount,
        clearTime,
        eta,
        // Show the raw status to the user (hysteresis only guards re-arming).
        status: result.status,
        density: source.getDensity(j.id),
      });

      // Fire alert exactly once on a confirmed CRITICAL transition.
      if (result.isNewCritical) {
        // GAP 1 FIX: LATE_ALERT routes directly to "control-room", not an officer.
        let officerId: string;
        if (result.isLateAlert) {
          officerId = "control-room";
        } else {
          const assignment = findNearestOfficer(OFFICERS, { lat: j.lat, lng: j.lng });
          officerId =
            assignment.kind === "assigned" ? assignment.officer.id : "control-room";
        }

        const alert = createAlert({
          id: nextAlertId(),
          junctionId: j.id,
          officerId,
          isLateAlert: result.isLateAlert,
        });

        const sentAlert = transitionAlert(alert, AlertState.SENT, "auto-sent by simulator", nowMs);
        newAlerts.push(sentAlert);

        const lateTag = result.isLateAlert
          ? ` [LATE — ${ALERT_CONFIG.NO_ACK_TIMEOUT_S}s lead time exhausted, routed to control room]`
          : "";
        newStatusEvents.push({
          id: nextEventId(),
          at: nowMs,
          type: "alert",
          message: `${j.name} → CRITICAL. Alert sent to ${officerId}${lateTag}. Clear: ${Math.round(clearTime)}s, ETA: ${eta}s`,
        });
      }

      // Status-change log entry (recovery / WATCH transitions).
      const prev = confirmedStatuses[j.id];
      if (prev && prev !== result.status && !result.isNewCritical) {
        newStatusEvents.push({
          id: nextEventId(),
          at: nowMs,
          type: "status",
          message: `${j.name} ${prev} → ${result.status}`,
        });
      }
    }

    // GAP 2 FIX: process NO_ACK timeouts on the existing + new alert list.
    const allAlerts = [...newAlerts, ...alerts];
    const { alerts: timedAlerts, events: timeoutEvents } = processTimeouts(allAlerts, nowMs);

    set({
      readings: newReadings,
      confirmedStatuses: nextConfirmedStatuses,
      hysteresis: nextHysteresis,
      alerts: timedAlerts.slice(0, 50),
      events: [...timeoutEvents, ...newStatusEvents, ...events].slice(0, 100),
    });
  }

  return {
    source,
    readings: [],
    confirmedStatuses: {},
    hysteresis: {},
    alerts: [],
    events: [],
    _tickHandle: null,

    setDensity(junctionId, density) {
      source.setDensity(junctionId, density);
      get().tick();
    },

    applyScenario(name) {
      source.applyScenario(name);
      set((s) => ({
        events: [
          { id: nextEventId(), at: Date.now(), type: "system", message: `Scenario applied: "${name}"` },
          ...s.events,
        ],
      }));
      get().tick();
    },

    tick() { runTick(); },

    acknowledgeAlert(alertId) {
      set((s) => ({
        alerts: s.alerts.map((a) => {
          if (a.id !== alertId || a.state !== AlertState.SENT) return a;
          return transitionAlert(a, AlertState.ACKNOWLEDGED, "officer ack", Date.now());
        }),
      }));
    },

    startTicking() {
      if (get()._tickHandle !== null) return;
      get().tick();
      const handle = setInterval(() => get().tick(), 2000);
      set({ _tickHandle: handle });
    },

    stopTicking() {
      const h = get()._tickHandle;
      if (h !== null) {
        clearInterval(h);
        set({ _tickHandle: null });
      }
    },
  };
});
