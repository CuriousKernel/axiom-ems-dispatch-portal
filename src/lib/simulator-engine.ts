/**
 * src/lib/simulator-engine.ts
 *
 * The Phase 2 simulator engine: a Zustand store that:
 *   1. Holds a SimulatedSource (density sliders per junction).
 *   2. Runs a 2-second tick (via setInterval) to recompute criticality.
 *   3. Creates exactly one alert per CRITICAL transition (no duplicates).
 *   4. Exposes readings, alerts and event log to the UI.
 *
 * The engine depends only on `QueueSource` interface so a vision source
 * can replace `SimulatedSource` without touching this file.
 */

import { create } from "zustand";
import { JUNCTIONS, OFFICERS } from "@/lib/axiom/seed";
import { computeCriticality } from "@/lib/criticality";
import { createAlert, transitionAlert, AlertState } from "@/lib/alerts";
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
  /** The simulated source (holds density values). */
  source: SimulatedSource;
  /** Live readings computed on each tick. */
  readings: JunctionLiveReading[];
  /** Previous statuses for transition detection. */
  prevStatuses: Record<string, JunctionStatus>;
  /** Active alert records (Phase 2 state machine alerts). */
  alerts: AlertRecord[];
  /** Running event log. */
  events: SimEvent[];
  /** Interval handle, null when stopped. */
  _tickHandle: ReturnType<typeof setInterval> | null;

  // ─── Actions ───────────────────────────────────────────────────────
  setDensity: (junctionId: string, density: number) => void;
  applyScenario: (name: ScenarioName) => void;
  startTicking: () => void;
  stopTicking: () => void;
  /** Force a manual tick (useful for tests or immediate feedback). */
  tick: () => void;
}

// ─── Helper: build event id ───────────────────────────────────────────────

let eventSeq = 0;
function nextEventId() {
  return `ev-${++eventSeq}`;
}

let alertSeq = 0;
function nextAlertId() {
  return `al-${++alertSeq}`;
}

// ─── Store ────────────────────────────────────────────────────────────────

export const useSimulator = create<SimState>((set, get) => {
  const source = new SimulatedSource();

  /** Pure computation of readings from current source state. */
  function computeReadings(
    prevStatuses: Record<string, JunctionStatus>,
  ): { readings: JunctionLiveReading[]; newAlerts: AlertRecord[]; newEvents: SimEvent[] } {
    const readings: JunctionLiveReading[] = [];
    const newAlerts: AlertRecord[] = [];
    const newEvents: SimEvent[] = [];

    for (const j of JUNCTIONS) {
      const queueReading = source.getReading(j.id);
      const eta = DEMO_ETAS[j.id] ?? 999;

      const result = computeCriticality(
        {
          junctionId: j.id,
          queueCount: queueReading.vehicleCount,
          eta,
          dischargeRate: j.dischargeRate,
          officerTravelTime: 20,
        },
        prevStatuses[j.id] ?? null,
      );

      const clearTime = result.clearTime < Number.MAX_SAFE_INTEGER ? result.clearTime : 9999;

      readings.push({
        junctionId: j.id,
        name: j.name,
        vehicleCount: queueReading.vehicleCount,
        clearTime,
        eta,
        status: result.status,
        density: source.getDensity(j.id),
      });

      // Fire alert exactly once on CRITICAL transition.
      if (result.isNewCritical) {
        const assignment = findNearestOfficer(OFFICERS, { lat: j.lat, lng: j.lng });
        const officerId = assignment.kind === "assigned" ? assignment.officer.id : "control";

        const alert = createAlert({
          id: nextAlertId(),
          junctionId: j.id,
          officerId,
          isLateAlert: result.isLateAlert,
        });

        // Immediately advance to SENT.
        const sentAlert = transitionAlert(alert, AlertState.SENT, "auto-sent by simulator");

        newAlerts.push(sentAlert);

        const lateTag = result.isLateAlert ? " [LATE – escalated to control room]" : "";
        newEvents.push({
          id: nextEventId(),
          at: Date.now(),
          type: "alert",
          message: `${j.name} → CRITICAL. Alert sent to ${officerId}${lateTag}. Clear time: ${Math.round(clearTime)}s, ETA: ${eta}s`,
        });
      }

      // Status change events (non-CRITICAL or recovered from CRITICAL).
      const prev = prevStatuses[j.id];
      if (prev && prev !== result.status && !result.isNewCritical) {
        newEvents.push({
          id: nextEventId(),
          at: Date.now(),
          type: "status",
          message: `${j.name} changed ${prev} → ${result.status}`,
        });
      }
    }

    return { readings, newAlerts, newEvents };
  }

  return {
    source,
    readings: [],
    prevStatuses: {},
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
          {
            id: nextEventId(),
            at: Date.now(),
            type: "system",
            message: `Scenario applied: "${name}"`,
          },
          ...s.events,
        ],
      }));
      get().tick();
    },

    tick() {
      const { prevStatuses, alerts, events } = get();
      const { readings, newAlerts, newEvents } = computeReadings(prevStatuses);

      // Build new prevStatuses map from this tick's results.
      const nextStatuses: Record<string, JunctionStatus> = {};
      for (const r of readings) {
        nextStatuses[r.junctionId] = r.status;
      }

      set({
        readings,
        prevStatuses: nextStatuses,
        alerts: [...newAlerts, ...alerts].slice(0, 50), // cap at 50 entries
        events: [...newEvents, ...events].slice(0, 100),
      });
    },

    startTicking() {
      const { _tickHandle } = get();
      if (_tickHandle !== null) return; // already running

      // Run immediately, then every 2 s.
      get().tick();
      const handle = setInterval(() => get().tick(), 2000);
      set({ _tickHandle: handle });
    },

    stopTicking() {
      const { _tickHandle } = get();
      if (_tickHandle !== null) {
        clearInterval(_tickHandle);
        set({ _tickHandle: null });
      }
    },
  };
});
