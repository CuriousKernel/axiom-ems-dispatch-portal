/**
 * src/lib/__tests__/analytics.test.ts
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  calculateMinutesSaved,
  computeDailySummary,
  generateSampleDay,
  useAnalyticsStore,
  type TripRecord,
} from "../analytics-store";

describe("Analytics Store and Aggregations", () => {
  beforeEach(() => {
    useAnalyticsStore.getState().clearTrips();
  });

  it("calculates estimated minutes saved deterministically", () => {
    // 0 junctions cleared, 0 alerts -> 0 min
    expect(calculateMinutesSaved(0, 0, 300)).toBe(0);

    // 2 junctions cleared, 2 alerts:
    // (2 * 105 + 0) = 210s = 3.5 min
    expect(calculateMinutesSaved(2, 2, 400)).toBe(3.5);

    // 4 junctions cleared, 5 alerts:
    // (4 * 105 + 1 * 35) = 455s = 7.6 min
    expect(calculateMinutesSaved(4, 5, 450)).toBe(7.6);
  });

  it("aggregates daily summary accurately across multiple trips", () => {
    const today = new Date().toISOString().slice(0, 10);
    const trips: TripRecord[] = [
      {
        id: "t1",
        startedAt: `${today}T10:00:00.000Z`,
        endedAt: `${today}T10:07:00.000Z`,
        outcome: "arrived",
        simDurationSec: 420,
        routeId: "primary",
        rerouted: false,
        alertsTotal: 4,
        alertsByJunction: { mandi: 2, ito: 2 },
        acknowledgedCount: 4,
        avgAckSeconds: 6.0,
        escalations: 0,
        noAckCount: 0,
        junctionsCleared: 2,
        estimatedMinutesSaved: 3.5,
      },
      {
        id: "t2",
        startedAt: `${today}T11:00:00.000Z`,
        endedAt: `${today}T11:07:00.000Z`,
        outcome: "arrived",
        simDurationSec: 400,
        routeId: "primary",
        rerouted: false,
        alertsTotal: 5,
        alertsByJunction: { mandi: 1, ito: 3, pragati: 1 },
        acknowledgedCount: 4,
        avgAckSeconds: 10.0,
        escalations: 1,
        noAckCount: 1,
        junctionsCleared: 3,
        estimatedMinutesSaved: 5.2,
      },
    ];

    const summary = computeDailySummary(trips, today);
    expect(summary.tripsToday).toBe(2);
    expect(summary.totalAlerts).toBe(9);
    expect(summary.totalEscalations).toBe(1);
    expect(summary.escalationRate).toBeCloseTo(11.1, 1);
    // (4 * 6.0 + 4 * 10.0) / 8 = 8.0s
    expect(summary.avgAckSeconds).toBe(8.0);
    expect(summary.totalMinutesSaved).toBe(8.7);
    expect(summary.junctionsCleared).toBe(5);
    expect(summary.busiestJunction?.id).toBe("ito");
    expect(summary.busiestJunction?.count).toBe(5);
    expect(summary.summarySentence).toContain("Today 2 ambulance trips, 9 alerts, 1 escalated, about 8.7 minutes saved.");
  });

  it("loads sample day with 7 realistic trips", () => {
    useAnalyticsStore.getState().loadSampleDay();
    const stored = useAnalyticsStore.getState().trips;
    expect(stored.length).toBe(7);
    expect(stored.every((t) => t.isSample)).toBe(true);

    const summary = computeDailySummary(stored);
    expect(summary.tripsToday).toBe(7);
    expect(summary.totalAlerts).toBeGreaterThan(20);
    expect(summary.totalMinutesSaved).toBeGreaterThan(25);
  });
});
