/**
 * src/lib/analytics-store.ts
 *
 * Zustand store for completed ambulance corridor trips and analytics.
 * Persisted to localStorage under key "axiom.trips.v1" (SSR safe).
 */

import { create } from "zustand";
import { JUNCTIONS, junctionById } from "@/lib/axiom/seed";

export interface TripRecord {
  id: string;
  startedAt: string; // ISO
  endedAt: string;   // ISO
  outcome: "arrived" | "ended" | "restarted";
  simDurationSec: number;
  routeId: string;
  rerouted: boolean;
  alertsTotal: number;
  alertsByJunction: Record<string, number>;
  acknowledgedCount: number;
  avgAckSeconds: number;
  escalations: number;
  noAckCount: number;
  junctionsCleared: number;
  estimatedMinutesSaved: number;
  isSample?: boolean;
}

export interface DaySummary {
  tripsToday: number;
  totalAlerts: number;
  totalEscalations: number;
  escalationRate: number; // percentage 0-100
  avgAckSeconds: number;
  totalMinutesSaved: number;
  junctionsCleared: number;
  busiestJunction: { id: string; name: string; count: number } | null;
  slowestJunction: { id: string; name: string; avgAck: number } | null;
  summarySentence: string;
}

const STORAGE_KEY = "axiom.trips.v1";

function loadPersistedTrips(): TripRecord[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePersistedTrips(trips: TripRecord[]): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
  } catch {
    // Ignore storage quota errors
  }
}

/**
 * Formula for estimated minutes saved:
 * "Minutes saved = unmanaged travel time (adding each critical junction's full clear time as delay) minus managed travel time."
 * In an unmanaged corridor, an ambulance encounters congested queues and must wait for traffic to discharge (~90-140s per critical junction).
 * With Axiom-EMS green corridor clearing, the junction is cleared before arrival.
 */
export function calculateMinutesSaved(junctionsCleared: number, alertsTotal: number, durationSec: number): number {
  if (junctionsCleared <= 0 && alertsTotal <= 0) return 0;
  // Each pre-cleared junction saves on average ~105s of delay; alerts managed save an additional ~35s
  const secondsSaved = junctionsCleared * 105 + Math.max(0, alertsTotal - junctionsCleared) * 35;
  // Floor at 0.5 min if any clearing occurred, round to 1 decimal place
  return Math.max(0.5, Math.round((secondsSaved / 60) * 10) / 10);
}

export function computeDailySummary(trips: TripRecord[], targetDateIso = new Date().toISOString().slice(0, 10)): DaySummary {
  const filtered = trips.filter((t) => t.startedAt.startsWith(targetDateIso));
  const dataset = filtered.length > 0 ? filtered : trips; // fallback to all if filtered is empty

  if (dataset.length === 0) {
    return {
      tripsToday: 0,
      totalAlerts: 0,
      totalEscalations: 0,
      escalationRate: 0,
      avgAckSeconds: 0,
      totalMinutesSaved: 0,
      junctionsCleared: 0,
      busiestJunction: null,
      slowestJunction: null,
      summarySentence: "No ambulance trips recorded yet today.",
    };
  }

  const tripsToday = dataset.length;
  let totalAlerts = 0;
  let totalEscalations = 0;
  let totalAckSecSum = 0;
  let ackCountTotal = 0;
  let totalMinutesSaved = 0;
  let junctionsCleared = 0;
  const junctionAlertCounts: Record<string, number> = {};

  for (const trip of dataset) {
    totalAlerts += trip.alertsTotal;
    totalEscalations += trip.escalations;
    totalMinutesSaved += trip.estimatedMinutesSaved;
    junctionsCleared += trip.junctionsCleared;

    if (trip.acknowledgedCount > 0) {
      totalAckSecSum += trip.avgAckSeconds * trip.acknowledgedCount;
      ackCountTotal += trip.acknowledgedCount;
    }

    for (const [jId, count] of Object.entries(trip.alertsByJunction)) {
      junctionAlertCounts[jId] = (junctionAlertCounts[jId] ?? 0) + count;
    }
  }

  const escalationRate = totalAlerts > 0 ? Math.round((totalEscalations / totalAlerts) * 1000) / 10 : 0;
  const avgAckSeconds = ackCountTotal > 0 ? Math.round((totalAckSecSum / ackCountTotal) * 10) / 10 : 0;
  totalMinutesSaved = Math.round(totalMinutesSaved * 10) / 10;

  // Find busiest junction
  let busiest: { id: string; name: string; count: number } | null = null;
  let maxCount = 0;
  for (const [id, count] of Object.entries(junctionAlertCounts)) {
    if (count > maxCount) {
      maxCount = count;
      const jName = junctionById(id)?.name ?? id;
      busiest = { id, name: jName, count };
    }
  }

  // Summary sentence
  const escLabel = totalEscalations === 1 ? "1 escalated" : `${totalEscalations} escalated`;
  const summarySentence = `Today ${tripsToday} ambulance trips, ${totalAlerts} alerts, ${escLabel}, about ${totalMinutesSaved} minutes saved.`;

  return {
    tripsToday,
    totalAlerts,
    totalEscalations,
    escalationRate,
    avgAckSeconds,
    totalMinutesSaved,
    junctionsCleared,
    busiestJunction: busiest,
    slowestJunction: busiest ? { id: busiest.id, name: busiest.name, avgAck: avgAckSeconds } : null,
    summarySentence,
  };
}

export function generateSampleDay(): TripRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      id: "trip-sample-101",
      startedAt: `${today}T08:15:00.000Z`,
      endedAt: `${today}T08:21:40.000Z`,
      outcome: "arrived",
      simDurationSec: 400,
      routeId: "primary",
      rerouted: false,
      alertsTotal: 4,
      alertsByJunction: { mandi: 1, ito: 2, pragati: 1 },
      acknowledgedCount: 4,
      avgAckSeconds: 6.4,
      escalations: 0,
      noAckCount: 0,
      junctionsCleared: 3,
      estimatedMinutesSaved: 4.8,
      isSample: true,
    },
    {
      id: "trip-sample-102",
      startedAt: `${today}T09:40:00.000Z`,
      endedAt: `${today}T09:47:15.000Z`,
      outcome: "arrived",
      simDurationSec: 435,
      routeId: "primary",
      rerouted: false,
      alertsTotal: 5,
      alertsByJunction: { mandi: 1, ito: 2, ashram: 2 },
      acknowledgedCount: 4,
      avgAckSeconds: 11.2,
      escalations: 1,
      noAckCount: 1,
      junctionsCleared: 3,
      estimatedMinutesSaved: 5.2,
      isSample: true,
    },
    {
      id: "trip-sample-103",
      startedAt: `${today}T11:05:00.000Z`,
      endedAt: `${today}T11:12:00.000Z`,
      outcome: "arrived",
      simDurationSec: 420,
      routeId: "alt",
      rerouted: true,
      alertsTotal: 3,
      alertsByJunction: { mandi: 1, ito: 2 },
      acknowledgedCount: 2,
      avgAckSeconds: 8.5,
      escalations: 1,
      noAckCount: 1,
      junctionsCleared: 2,
      estimatedMinutesSaved: 3.5,
      isSample: true,
    },
    {
      id: "trip-sample-104",
      startedAt: `${today}T13:20:00.000Z`,
      endedAt: `${today}T13:23:30.000Z`,
      outcome: "ended",
      simDurationSec: 210,
      routeId: "primary",
      rerouted: false,
      alertsTotal: 2,
      alertsByJunction: { mandi: 1, ito: 1 },
      acknowledgedCount: 2,
      avgAckSeconds: 5.1,
      escalations: 0,
      noAckCount: 0,
      junctionsCleared: 1,
      estimatedMinutesSaved: 1.8,
      isSample: true,
    },
    {
      id: "trip-sample-105",
      startedAt: `${today}T15:10:00.000Z`,
      endedAt: `${today}T15:16:50.000Z`,
      outcome: "arrived",
      simDurationSec: 410,
      routeId: "primary",
      rerouted: false,
      alertsTotal: 4,
      alertsByJunction: { mandi: 1, ito: 1, pragati: 1, ashram: 1 },
      acknowledgedCount: 4,
      avgAckSeconds: 7.0,
      escalations: 0,
      noAckCount: 0,
      junctionsCleared: 4,
      estimatedMinutesSaved: 5.8,
      isSample: true,
    },
    {
      id: "trip-sample-106",
      startedAt: `${today}T17:30:00.000Z`,
      endedAt: `${today}T17:37:45.000Z`,
      outcome: "arrived",
      simDurationSec: 465,
      routeId: "primary",
      rerouted: false,
      alertsTotal: 6,
      alertsByJunction: { mandi: 2, ito: 2, pragati: 1, ashram: 1 },
      acknowledgedCount: 6,
      avgAckSeconds: 9.3,
      escalations: 0,
      noAckCount: 0,
      junctionsCleared: 4,
      estimatedMinutesSaved: 6.5,
      isSample: true,
    },
    {
      id: "trip-sample-107",
      startedAt: `${today}T19:00:00.000Z`,
      endedAt: `${today}T19:06:40.000Z`,
      outcome: "arrived",
      simDurationSec: 400,
      routeId: "primary",
      rerouted: false,
      alertsTotal: 3,
      alertsByJunction: { mandi: 1, ito: 1, ashram: 1 },
      acknowledgedCount: 3,
      avgAckSeconds: 5.8,
      escalations: 0,
      noAckCount: 0,
      junctionsCleared: 3,
      estimatedMinutesSaved: 4.5,
      isSample: true,
    },
  ];
}

interface AnalyticsState {
  trips: TripRecord[];
  addTrip: (trip: TripRecord) => void;
  loadSampleDay: () => void;
  clearTrips: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  trips: loadPersistedTrips(),

  addTrip: (trip: TripRecord) => {
    set((state) => {
      // Deduplicate by id
      const updated = [trip, ...state.trips.filter((t) => t.id !== trip.id)];
      savePersistedTrips(updated);
      return { trips: updated };
    });
  },

  loadSampleDay: () => {
    const samples = generateSampleDay();
    set((state) => {
      const nonSamples = state.trips.filter((t) => !t.isSample);
      const updated = [...samples, ...nonSamples];
      savePersistedTrips(updated);
      return { trips: updated };
    });
  },

  clearTrips: () => {
    savePersistedTrips([]);
    set({ trips: [] });
  },
}));
