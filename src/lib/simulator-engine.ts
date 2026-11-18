/**
 * src/lib/simulator-engine.ts
 *
 * The Phase 3 Simulation Engine.
 * Single source of truth host running in the Control Room.
 *
 * Core capabilities:
 *   1. Shared simulation clock (simTimeSeconds, speed: 1x/2x/4x, paused).
 *   2. Deterministic ambulance motion along PRIMARY_ROUTE with speed profile.
 *   3. Dynamic junction ETAs; passed junctions marked "PASSED".
 *   4. Criticality recomputed with anti-flapping hysteresis (3 ticks).
 *   5. LATE_ALERT rule: < 50s lead time (officerTravelTime 20s + 30s) routes directly to "control-room".
 *   6. 30-second NO_ACK timeout driven by the simulation clock.
 *   7. Queue draining: when an alert reaches IN_POSITION, queue drains 3x faster than normal flow.
 *   8. "Road cleared" verification: transitions to VERIFIED_CLEAR only when junction is CLEAR for
 *      2 consecutive ticks, else NOT_CLEARED and re-escalates.
 *   9. Broadcasts state every 500ms and executes commands from Officer and Driver tabs.
 */

import { create } from "zustand";
import { JUNCTIONS, OFFICERS, AMBULANCE } from "@/lib/axiom/seed";
import {
  computeCriticality,
  advanceHysteresis,
  type HysteresisState,
} from "@/lib/criticality";
import {
  createAlert,
  transitionAlert,
  escalateNoAck,
  escalateNotCleared,
  AlertState,
  ALERT_CONFIG,
} from "@/lib/alerts";
import type { AlertRecord } from "@/lib/alerts";
import { findNearestOfficer } from "@/lib/assignment";
import { SimulatedSource, type ScenarioName } from "@/lib/sources/simulated";
import type { JunctionStatus, Priority } from "@/lib/axiom/types";
import {
  PRIMARY_ROUTE,
  ALT_ROUTE,
} from "@/lib/route-data";
import {
  positionAt,
  distanceToJunction,
} from "@/lib/route";
import {
  isUnclearable,
  shouldReroute,
  projectOntoAlt,
} from "@/lib/reroute";
import {
  createAmbulanceState,
  stepAmbulance,
  computeEtaSeconds,
  type AmbulanceState,
} from "@/lib/ambulance";
import { toast } from "sonner";
import {
  type SimTransport,
  type SimulationState,
  type SimCommand,
  type SimSpeed,
  type JunctionSimReading,
  type SimEvent,
} from "@/lib/sim-transport";
import { createHostTransport } from "@/lib/sim-transport-supabase";

// ─── Verification state for "Road cleared" tap ────────────────────────────

interface RoadClearVerification {
  alertId: string;
  junctionId: string;
  consecutiveClearTicks: number;
  totalVerificationTicks: number;
}

// ─── Sequence counters ────────────────────────────────────────────────────

let eventSeq = 0;
function nextEventId() {
  return `ev-${++eventSeq}`;
}

let alertSeq = 0;
function nextAlertId() {
  return `al-${++alertSeq}`;
}

let lastTickAt = typeof performance !== "undefined" ? performance.now() : Date.now();
let lastBroadcastAt = 0;

export function formatOfficerName(officerId: string): string {
  if (officerId === "control-room") return "Duty Inspector (Control Room)";
  const o = OFFICERS.find((x) => x.id === officerId);
  return o ? `${o.rank} ${o.name}` : officerId;
}

export function formatJunctionName(junctionId: string): string {
  const j = JUNCTIONS.find((x) => x.id === junctionId);
  return j ? j.name : junctionId;
}

// ─── Store Interface ──────────────────────────────────────────────────────

interface SimEngineState {
  simTimeSeconds: number;
  speed: SimSpeed;
  paused: boolean;
  driverPriority: Priority;
  alertTimeoutSeconds: 30 | 15;
  activeRouteId: "primary" | "alt";
  rerouted: boolean;
  rerouteMessage?: string | undefined;
  ambulance: AmbulanceState & { lat: number; lng: number; heading: number };
  source: SimulatedSource;
  readings: Record<string, JunctionSimReading>;
  confirmedStatuses: Record<string, JunctionStatus>;
  hysteresis: Record<string, HysteresisState>;
  alerts: AlertRecord[];
  events: SimEvent[];
  sentAtSimTime: Record<string, number>;
  alertElapsedWallSeconds: Record<string, number>;
  verifications: Record<string, RoadClearVerification>;
  transport: SimTransport;
  _tickHandle: ReturnType<typeof setInterval> | null;
  _broadcastHandle: ReturnType<typeof setInterval> | null;

  // Actions
  startTrip: () => void;
  pauseTrip: () => void;
  resumeTrip: () => void;
  endTrip: () => void;
  togglePaused: () => void;
  restartTrip: () => void;
  setSpeed: (s: SimSpeed) => void;
  setAlertTimeout: (timeout: 30 | 15) => void;
  setDriverPriority: (p: Priority) => void;
  setDensity: (junctionId: string, density: number) => void;
  applyScenario: (name: ScenarioName) => void;
  acknowledgeAlert: (alertId: string, officerId: string) => void;
  officerInPosition: (alertId: string, officerId: string) => void;
  officerRoadCleared: (alertId: string, officerId: string) => void;
  officerCantClear: (alertId: string, officerId: string, reason?: string) => void;
  startEngine: () => void;
  stopEngine: () => void;
  tick: (dtSeconds?: number) => void;
  getSnapshot: () => SimulationState;
}

const JUNCTION_DISTANCES = JUNCTIONS.map((j) => {
  return PRIMARY_ROUTE.junctions[j.id]?.distanceMeters ?? 0;
});

export const useSimulator = create<SimEngineState>((set, get) => {
  const source = new SimulatedSource();
  const transport = createHostTransport();

  const initialAmbState = createAmbulanceState();
  const initialPos = positionAt(PRIMARY_ROUTE, 0);

  // Setup command handler from subscribers
  transport.onCommand((cmd: SimCommand) => {
    const s = get();
    switch (cmd.type) {
      case "START_TRIP":
        s.startTrip();
        break;
      case "END_TRIP":
        s.endTrip();
        break;
      case "PAUSE_TRIP":
        s.pauseTrip();
        break;
      case "RESUME_TRIP":
        s.resumeTrip();
        break;
      case "RESTART_TRIP":
        s.restartTrip();
        break;
      case "SET_SPEED":
        s.setSpeed(cmd.speed);
        break;
      case "SET_ALERT_TIMEOUT":
        s.setAlertTimeout(cmd.timeout);
        break;
      case "SET_PRIORITY":
        s.setDriverPriority(cmd.priority);
        break;
      case "SET_DENSITY":
        s.setDensity(cmd.junctionId, cmd.density);
        break;
      case "APPLY_SCENARIO":
        s.applyScenario(cmd.scenario);
        break;
      case "ACKNOWLEDGE_ALERT":
        s.acknowledgeAlert(cmd.alertId, cmd.officerId);
        break;
      case "IN_POSITION":
        s.officerInPosition(cmd.alertId, cmd.officerId);
        break;
      case "ROAD_CLEARED":
        s.officerRoadCleared(cmd.alertId, cmd.officerId);
        break;
      case "CANT_CLEAR":
        s.officerCantClear(cmd.alertId, cmd.officerId, cmd.reason);
        break;
    }
  });

  function buildSnapshot(): SimulationState {
    const s = get();
    return {
      simTimeSeconds: s.simTimeSeconds,
      speed: s.speed,
      paused: s.paused,
      driverPriority: s.driverPriority,
      alertTimeoutSeconds: s.alertTimeoutSeconds,
      activeRouteId: s.activeRouteId,
      rerouted: s.rerouted,
      rerouteMessage: s.rerouteMessage,
      ambulance: {
        distanceMeters: s.ambulance.distanceMeters,
        speedKmh: s.ambulance.speedKmh,
        smoothedSpeedKmh: s.ambulance.smoothedSpeedKmh,
        status: s.ambulance.status,
        lat: s.ambulance.lat,
        lng: s.ambulance.lng,
        heading: s.ambulance.heading,
      },
      readings: s.readings,
      alerts: s.alerts,
      events: s.events,
      hostTimestamp: Date.now(),
    };
  }

  return {
    simTimeSeconds: 0,
    speed: 1,
    paused: false,
    driverPriority: "P1",
    alertTimeoutSeconds: 30,
    activeRouteId: "primary",
    rerouted: false,
    rerouteMessage: undefined,
    ambulance: {
      ...initialAmbState,
      lat: initialPos.lat,
      lng: initialPos.lng,
      heading: initialPos.heading,
    },
    source,
    readings: {},
    confirmedStatuses: {},
    hysteresis: {},
    alerts: [],
    events: [
      {
        id: nextEventId(),
        at: 0,
        type: "system",
        message: "Simulation host initialized. Corridor: Connaught Place to AIIMS",
      },
    ],
    sentAtSimTime: {},
    alertElapsedWallSeconds: {},
    verifications: {},
    transport,
    _tickHandle: null,
    _broadcastHandle: null,

    getSnapshot: buildSnapshot,

    startTrip() {
      set((s) => ({
        ambulance: { ...s.ambulance, status: "running" },
        paused: false,
        events: [
          {
            id: nextEventId(),
            at: s.simTimeSeconds,
            type: "trip",
            message: `Ambulance ${AMBULANCE.plate} trip started towards AIIMS (${s.driverPriority})`,
          },
          ...s.events,
        ],
      }));
      get().tick(0.01);
    },

    pauseTrip() {
      set({ paused: true });
      get().tick(0);
    },

    resumeTrip() {
      set((s) => ({
        paused: false,
        ambulance:
          s.ambulance.status === "idle"
            ? { ...s.ambulance, status: "running" }
            : s.ambulance,
      }));
      get().tick(0.01);
    },

    endTrip() {
      set((s) => ({
        paused: false,
        ambulance: { ...s.ambulance, status: "arrived", speedKmh: 0, smoothedSpeedKmh: 0 },
        events: [
          {
            id: nextEventId(),
            at: s.simTimeSeconds,
            type: "trip",
            message: "Trip ended.",
          },
          ...s.events,
        ],
      }));
      get().tick(0.01);
    },

    togglePaused() {
      const s = get();
      if (s.ambulance.status === "idle") {
        s.startTrip();
      } else if (s.paused) {
        s.resumeTrip();
      } else {
        s.pauseTrip();
      }
    },

    restartTrip() {
      const pos = positionAt(PRIMARY_ROUTE, 0);
      const baseAmb = createAmbulanceState(0);
      set({
        simTimeSeconds: 0,
        paused: false,
        activeRouteId: "primary",
        rerouted: false,
        rerouteMessage: undefined,
        ambulance: {
          ...baseAmb,
          status: "running", // AUTO-START!
          lat: pos.lat,
          lng: pos.lng,
          heading: pos.heading,
        },
        alerts: [],
        sentAtSimTime: {},
        alertElapsedWallSeconds: {},
        verifications: {},
        confirmedStatuses: {},
        hysteresis: {},
        events: [
          {
            id: nextEventId(),
            at: 0,
            type: "system",
            message: "Simulation restarted from Connaught Place",
          },
        ],
      });
      try {
        toast("Trip restarted from Connaught Place");
      } catch {
        // ignore
      }
      get().tick(0.01);
    },

    setSpeed(speed: SimSpeed) {
      if ([1, 2, 4, 8].includes(speed)) {
        set({ speed });
        transport.publish(buildSnapshot());
      }
    },

    setAlertTimeout(timeout: 30 | 15) {
      set({ alertTimeoutSeconds: timeout });
      transport.publish(buildSnapshot());
    },

    setDriverPriority(driverPriority) {
      set((s) => ({
        driverPriority,
        events: [
          {
            id: nextEventId(),
            at: s.simTimeSeconds,
            type: "trip",
            message: `Priority changed to ${driverPriority}`,
          },
          ...s.events,
        ],
      }));
    },

    setDensity(junctionId, density) {
      source.setDensity(junctionId, density);
      get().tick(0);
    },

    applyScenario(name) {
      source.applyScenario(name);
      set((s) => ({
        events: [
          {
            id: nextEventId(),
            at: s.simTimeSeconds,
            type: "system",
            message: `Scenario applied: "${name}"`,
          },
          ...s.events,
        ],
      }));
      get().tick(0);
    },

    acknowledgeAlert(alertId, officerId) {
      set((s) => {
        let ackJunctionName = "";
        const officerName = formatOfficerName(officerId);
        const wallSec = Math.round(s.alertElapsedWallSeconds[alertId] ?? 0);

        const updated = s.alerts.map((a) => {
          if (a.id !== alertId || a.state !== AlertState.SENT) return a;
          const j = JUNCTIONS.find((x) => x.id === a.junctionId);
          ackJunctionName = j?.name ?? a.junctionId;
          const transitioned = transitionAlert(a, AlertState.ACKNOWLEDGED, `Acknowledged by ${officerId}`, Date.now());
          return {
            ...transitioned,
            escalatesIn: undefined, // countdown stops!
          };
        });

        const newEvents: SimEvent[] = ackJunctionName
          ? [
              {
                id: nextEventId(),
                at: s.simTimeSeconds,
                type: "officer",
                message: `Alert for ${ackJunctionName} acknowledged by ${officerName} in ${wallSec} s`,
              },
            ]
          : [];

        return {
          alerts: updated,
          events: [...newEvents, ...s.events],
        };
      });
      transport.publish(buildSnapshot());
    },

    officerInPosition(alertId, officerId) {
      set((s) => {
        let posJunctionName = "";
        const officerName = formatOfficerName(officerId);
        const updated = s.alerts.map((a) => {
          if (a.id !== alertId || a.state !== AlertState.ACKNOWLEDGED) return a;
          const j = JUNCTIONS.find((x) => x.id === a.junctionId);
          posJunctionName = j?.name ?? a.junctionId;
          return transitionAlert(a, AlertState.IN_POSITION, `Officer in position (${officerId})`, Date.now());
        });

        const newEvents: SimEvent[] = posJunctionName
          ? [
              {
                id: nextEventId(),
                at: s.simTimeSeconds,
                type: "officer",
                message: `Officer ${officerName} in position at ${posJunctionName}. Flow priority clearing active (3x drain).`,
              },
            ]
          : [];

        return {
          alerts: updated,
          events: [...newEvents, ...s.events],
        };
      });
      transport.publish(buildSnapshot());
    },

    officerRoadCleared(alertId, officerId) {
      set((s) => {
        const targetAlert = s.alerts.find((a) => a.id === alertId);
        if (!targetAlert) return s;

        // Transition alert to CLEARING
        let nextAlert = targetAlert;
        if (targetAlert.state === AlertState.IN_POSITION) {
          nextAlert = transitionAlert(targetAlert, AlertState.CLEARING, "Officer reported road cleared, verifying", Date.now());
        }

        const updatedAlerts = s.alerts.map((a) => (a.id === alertId ? nextAlert : a));

        const newVerifications = {
          ...s.verifications,
          [alertId]: {
            alertId,
            junctionId: targetAlert.junctionId,
            consecutiveClearTicks: 0,
            totalVerificationTicks: 0,
          },
        };

        const jName = formatJunctionName(targetAlert.junctionId);
        const officerName = formatOfficerName(officerId);

        return {
          alerts: updatedAlerts,
          verifications: newVerifications,
          events: [
            {
              id: nextEventId(),
              at: s.simTimeSeconds,
              type: "officer",
              message: `Officer ${officerName} tapped 'Road cleared' for ${jName}. Running 2-tick clearance check.`,
            },
            ...s.events,
          ],
        };
      });
      transport.publish(buildSnapshot());
    },

    officerCantClear(alertId, officerId, reason) {
      set((s) => {
        const targetAlert = s.alerts.find((a) => a.id === alertId);
        if (!targetAlert) return s;

        const j = JUNCTIONS.find((x) => x.id === targetAlert.junctionId);
        const nextOfficer = findNearestOfficer(OFFICERS, j ? { lat: j.lat, lng: j.lng } : { lat: 0, lng: 0 }, [officerId]);
        const nextId = nextOfficer.kind === "assigned" ? nextOfficer.officer.id : "control-room";

        let escalated = escalateNotCleared(targetAlert, nextId, Date.now());
        escalated = {
          ...escalated,
          escalatesIn: s.alertTimeoutSeconds,
          escalatedFrom: officerId,
          previousOfficerId: officerId,
          reason: reason ?? "Officer cannot clear",
        };

        const updated = s.alerts.map((a) => (a.id === alertId ? escalated : a));
        const officerName = formatOfficerName(officerId);
        const nextOfficerName = formatOfficerName(nextId);
        const jName = formatJunctionName(targetAlert.junctionId);

        return {
          alerts: updated,
          sentAtSimTime: { ...s.sentAtSimTime, [alertId]: s.simTimeSeconds },
          alertElapsedWallSeconds: { ...s.alertElapsedWallSeconds, [alertId]: 0 },
          events: [
            {
              id: nextEventId(),
              at: s.simTimeSeconds,
              type: "alert",
              message: `Officer ${officerName} cannot clear ${jName}${reason ? ` (${reason})` : ""}. Re-escalated to ${nextOfficerName}`,
            },
            ...s.events,
          ],
        };
      });
      transport.publish(buildSnapshot());
    },

    tick(forcedDt?: number) {
      const state = get();
      const dt = forcedDt !== undefined ? forcedDt : 0.25; // 250ms default step

      const isStepping = !state.paused && state.ambulance.status === "running";
      const simDelta = isStepping ? dt * state.speed : 0;
      const nextSimTime = state.simTimeSeconds + simDelta;

      const activeRoute = state.activeRouteId === "alt" ? ALT_ROUTE : PRIMARY_ROUTE;
      const junctionDistances = JUNCTIONS.map((j) => activeRoute.junctions[j.id]?.distanceMeters ?? 0);

      // 1. Advance ambulance along route
      const nextAmbState = isStepping
        ? stepAmbulance(
            state.ambulance,
            simDelta,
            activeRoute.totalLengthMeters,
            junctionDistances,
          )
        : state.ambulance;

      const pos = positionAt(activeRoute, nextAmbState.distanceMeters);
      let nextAmb = {
        ...nextAmbState,
        lat: pos.lat,
        lng: pos.lng,
        heading: pos.heading,
      };

      // 2. Queue Draining: if alert is in IN_POSITION or CLEARING, drain 3x faster
      const activeClearingJunctions = new Set<string>();
      state.alerts.forEach((a) => {
        if (a.state === AlertState.IN_POSITION || a.state === AlertState.CLEARING) {
          activeClearingJunctions.add(a.junctionId);
        }
      });

      if (isStepping && simDelta > 0) {
        for (const jId of activeClearingJunctions) {
          const j = JUNCTIONS.find((x) => x.id === jId);
          if (j) {
            // normal rate = dischargeRate veh/s; 3x faster = 3 * dischargeRate veh/s
            const drained = j.dischargeRate * 3 * simDelta;
            state.source.drain(jId, drained);
          }
        }
      }

      // 3. Junction criticality and dynamic ETAs
      const nextReadings: Record<string, JunctionSimReading> = {};
      const nextConfirmedStatuses: Record<string, JunctionStatus> = {};
      const nextHysteresis: Record<string, HysteresisState> = {};
      const newAlerts: AlertRecord[] = [];
      const newStatusEvents: SimEvent[] = [];
      const nextSentAt = { ...state.sentAtSimTime };
      const nextAlertWallElapsed = { ...state.alertElapsedWallSeconds };

      for (const j of JUNCTIONS) {
        const queueReading = state.source.getReading(j.id);
        const jDistMeters = activeRoute.junctions[j.id]?.distanceMeters ?? 0;
        const distRemaining = distanceToJunction(activeRoute, nextAmb.distanceMeters, j.id) ?? 0;

        // Check if junction has been passed
        const isPassed = distRemaining <= -30;

        let status: JunctionStatus;
        let eta = 0;
        let clearTime = 0;

        if (isPassed) {
          status = "PASSED";
          eta = 0;
          clearTime = 0;
        } else {
          eta = computeEtaSeconds(nextAmb, Math.max(0, distRemaining));
          const prevConfirmed = state.confirmedStatuses[j.id] ?? null;

          const critResult = computeCriticality(
            {
              junctionId: j.id,
              queueCount: queueReading.vehicleCount,
              eta,
              dischargeRate: j.dischargeRate,
              officerTravelTime: 20,
            },
            prevConfirmed === "PASSED" ? null : prevConfirmed,
          );

          status = critResult.status;
          clearTime = critResult.clearTime < Number.MAX_SAFE_INTEGER ? critResult.clearTime : 9999;

          // Hysteresis calculation
          const prevHyst: HysteresisState = state.hysteresis[j.id] ?? {
            confirmedStatus: null,
            recoveryTicks: 0,
          };
          const nextHyst = advanceHysteresis(status, prevHyst);
          nextHysteresis[j.id] = nextHyst;
          nextConfirmedStatuses[j.id] = nextHyst.confirmedStatus ?? status;

          // Alert creation on genuine CRITICAL transition
          if (critResult.isNewCritical) {
            let officerId: string;
            if (critResult.isLateAlert) {
              officerId = "control-room";
            } else {
              const assigned = findNearestOfficer(OFFICERS, { lat: j.lat, lng: j.lng });
              officerId = assigned.kind === "assigned" ? assigned.officer.id : "control-room";
            }

            const alert = createAlert({
              id: nextAlertId(),
              junctionId: j.id,
              officerId,
              isLateAlert: critResult.isLateAlert,
            });

            const sentAlert = transitionAlert(alert, AlertState.SENT, "auto-sent on critical", Date.now());
            sentAlert.escalatesIn = state.alertTimeoutSeconds;
            newAlerts.push(sentAlert);
            nextSentAt[sentAlert.id] = nextSimTime;
            nextAlertWallElapsed[sentAlert.id] = 0;

            const officerName = formatOfficerName(officerId);
            const lateTag = critResult.isLateAlert ? " [LATE — routed to control room]" : "";
            newStatusEvents.push({
              id: nextEventId(),
              at: nextSimTime,
              type: "alert",
              message: `Alert sent to ${officerName} for ${j.name}${lateTag}. Clear: ${Math.round(clearTime)}s, ETA: ${eta}s`,
            });

            try {
              toast(`Alert → ${officerName}`);
            } catch {
              // ignore
            }
          }

          // Recovery / status change log
          const prev = state.confirmedStatuses[j.id];
          if (prev && prev !== status && !critResult.isNewCritical && prev !== "PASSED") {
            newStatusEvents.push({
              id: nextEventId(),
              at: nextSimTime,
              type: "status",
              message: `${j.name} ${prev} → ${status}`,
            });
          }
        }

        nextReadings[j.id] = {
          junctionId: j.id,
          name: j.name,
          vehicleCount: queueReading.vehicleCount,
          clearTime,
          eta,
          status,
          density: state.source.getDensity(j.id),
          distanceMeters: jDistMeters,
        };
      }

      // 4. "Road cleared" verification logic (2 consecutive ticks CLEAR -> VERIFIED_CLEAR, else NOT_CLEARED)
      let currentAlerts = [...newAlerts, ...state.alerts];
      const nextVerifications = { ...state.verifications };
      const verificationEvents: SimEvent[] = [];

      for (const [alertId, verif] of Object.entries(nextVerifications)) {
        const jReading = nextReadings[verif.junctionId];
        const isClearNow = jReading && jReading.status === "CLEAR";

        verif.totalVerificationTicks += 1;
        if (isClearNow) {
          verif.consecutiveClearTicks += 1;
        } else {
          verif.consecutiveClearTicks = 0;
        }

        const jName = JUNCTIONS.find((x) => x.id === verif.junctionId)?.name ?? verif.junctionId;

        // Path A: 2 consecutive clear ticks -> VERIFIED_CLEAR!
        if (verif.consecutiveClearTicks >= 2) {
          currentAlerts = currentAlerts.map((a) => {
            if (a.id === alertId && a.state === AlertState.CLEARING) {
              return transitionAlert(a, AlertState.VERIFIED_CLEAR, "Verified clear: queue below critical for 2 ticks", Date.now());
            }
            return a;
          });
          delete nextVerifications[alertId];
          verificationEvents.push({
            id: nextEventId(),
            at: nextSimTime,
            type: "alert",
            message: `Junction ${jName} VERIFIED CLEAR (queue confirmed clear for 2 consecutive ticks).`,
          });
        }
        // Path B: totalVerificationTicks >= 2 and still not clear -> NOT_CLEARED and re-escalate!
        else if (verif.totalVerificationTicks >= 2 && !isClearNow) {
          const targetAlert = currentAlerts.find((a) => a.id === alertId);
          if (targetAlert && (targetAlert.state === AlertState.CLEARING || targetAlert.state === AlertState.IN_POSITION)) {
            const j = JUNCTIONS.find((x) => x.id === verif.junctionId);
            const nextOfficer = findNearestOfficer(
              OFFICERS,
              j ? { lat: j.lat, lng: j.lng } : { lat: 0, lng: 0 },
              [targetAlert.officerId],
            );
            const nextId = nextOfficer.kind === "assigned" ? nextOfficer.officer.id : "control-room";

            const escalated = escalateNotCleared(targetAlert, nextId, Date.now());
            currentAlerts = currentAlerts.map((a) => (a.id === alertId ? escalated : a));
            nextSentAt[alertId] = nextSimTime;

            verificationEvents.push({
              id: nextEventId(),
              at: nextSimTime,
              type: "alert",
              message: `Junction ${jName} NOT CLEARED (queue still high). Re-escalated to officer ${nextId}.`,
            });
          }
          delete nextVerifications[alertId];
        }
      }

      // 5. NO_ACK Timeout (driven by real elapsed wall-clock seconds)
      const timeoutEvents: SimEvent[] = [];
      currentAlerts = currentAlerts.map((a) => {
        if (a.state !== AlertState.SENT) return a;

        const currentWall = (nextAlertWallElapsed[a.id] ?? 0) + dt;
        nextAlertWallElapsed[a.id] = currentWall;
        const escalatesIn = Math.max(0, Math.ceil(state.alertTimeoutSeconds - currentWall));
        a = { ...a, escalatesIn };

        if (currentWall >= state.alertTimeoutSeconds) {
          const j = JUNCTIONS.find((x) => x.id === a.junctionId);
          const nextOfficer = findNearestOfficer(
            OFFICERS,
            j ? { lat: j.lat, lng: j.lng } : { lat: 0, lng: 0 },
            [a.officerId, ...(a.previousOfficerId ? [a.previousOfficerId] : [])],
          );
          const nextId = nextOfficer.kind === "assigned" ? nextOfficer.officer.id : "control-room";

          try {
            let escalated = escalateNoAck(a, nextId, Date.now());
            escalated = {
              ...escalated,
              escalatesIn: state.alertTimeoutSeconds,
              escalatedFrom: a.officerId,
              previousOfficerId: a.officerId,
            };
            nextAlertWallElapsed[a.id] = 0;
            nextSentAt[a.id] = nextSimTime;

            const nextName = formatOfficerName(nextId);

            timeoutEvents.push({
              id: nextEventId(),
              at: nextSimTime,
              type: "alert",
              message: `No acknowledgement in ${state.alertTimeoutSeconds} s. Escalated to ${nextName}`,
            });

            try {
              toast(`Alert escalated → ${nextName}`);
            } catch {
              // ignore
            }

            return escalated;
          } catch {
            return a;
          }
        }
        return a;
      });

      // 6. Reroute check (if on primary route and an unclearable jam is ahead)
      let nextActiveRouteId = state.activeRouteId;
      let nextRerouted = state.rerouted;
      let nextRerouteMessage = state.rerouteMessage;
      const rerouteEvents: SimEvent[] = [];

      if (!nextRerouted && isStepping) {
        for (const j of JUNCTIONS) {
          const reading = nextReadings[j.id];
          const isUnclear = isUnclearable(j.id, currentAlerts, reading?.status);
          if (isUnclear && reading) {
            const shouldSwitch = shouldReroute(
              PRIMARY_ROUTE,
              ALT_ROUTE,
              nextAmb.distanceMeters,
              j.id,
              reading.clearTime,
            );
            if (shouldSwitch) {
              const proj = projectOntoAlt(nextAmb.lat, nextAmb.lng, ALT_ROUTE);
              nextAmb = {
                ...nextAmb,
                distanceMeters: proj.distanceMeters,
                heading: proj.heading,
              };
              nextActiveRouteId = "alt";
              nextRerouted = true;
              nextRerouteMessage = `+1 min 10 s — Route changed via Ring Road to avoid ${j.name}`;
              rerouteEvents.push({
                id: nextEventId(),
                at: nextSimTime,
                type: "trip",
                message: `Rerouted via Ring Road (+1:10) — ${j.name} unclearable`,
              });
              break;
            }
          }
        }
      }

      set({
        simTimeSeconds: nextSimTime,
        activeRouteId: nextActiveRouteId,
        rerouted: nextRerouted,
        rerouteMessage: nextRerouteMessage,
        ambulance: nextAmb,
        readings: nextReadings,
        confirmedStatuses: nextConfirmedStatuses,
        hysteresis: nextHysteresis,
        alerts: currentAlerts.slice(0, 50),
        events: [...rerouteEvents, ...timeoutEvents, ...verificationEvents, ...newStatusEvents, ...state.events].slice(0, 100),
        sentAtSimTime: nextSentAt,
        alertElapsedWallSeconds: nextAlertWallElapsed,
        verifications: nextVerifications,
      });

      // Broadcast snapshot after every tick that changed state
      transport.publish(buildSnapshot());
      lastBroadcastAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    },

    startEngine() {
      if (get()._tickHandle !== null) return;

      lastTickAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      lastBroadcastAt = typeof performance !== "undefined" ? performance.now() : Date.now();

      // Real-time tick loop
      const tickH = setInterval(() => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        const dt = Math.min((now - lastTickAt) / 1000, 1.0);
        lastTickAt = now;
        get().tick(dt);
      }, 100);

      // 500ms broadcast heartbeat
      const bcastH = setInterval(() => {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - lastBroadcastAt >= 450) {
          transport.publish(buildSnapshot());
          lastBroadcastAt = now;
        }
      }, 500);

      set({ _tickHandle: tickH, _broadcastHandle: bcastH });
      get().tick(0);
    },

    stopEngine() {
      const { _tickHandle, _broadcastHandle } = get();
      if (_tickHandle !== null) clearInterval(_tickHandle);
      if (_broadcastHandle !== null) clearInterval(_broadcastHandle);
      set({ _tickHandle: null, _broadcastHandle: null });
    },
  };
});
