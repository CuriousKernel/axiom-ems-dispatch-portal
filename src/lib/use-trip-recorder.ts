/**
 * src/lib/use-trip-recorder.ts
 *
 * Subscribes to the simulation engine and records TripRecords into useAnalyticsStore
 * when a trip arrives, ends, or is restarted after making progress.
 */

import { useEffect, useRef } from "react";
import { useSimulator } from "@/lib/simulator-engine";
import { useAnalyticsStore, calculateMinutesSaved, type TripRecord } from "@/lib/analytics-store";
import { AlertState } from "@/lib/alerts";

export function useTripRecorder() {
  const isTracking = useRef(false);
  const tripStartedAt = useRef<string | null>(null);
  const startSimTime = useRef(0);
  const lastDistance = useRef(0);
  const ackTimes = useRef<number[]>([]);
  const acknowledgedAlertIds = useRef<Set<string>>(new Set());
  const escalatedAlertIds = useRef<Set<string>>(new Set());
  const clearedAlertIds = useRef<Set<string>>(new Set());
  const recordedTripIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = useSimulator.subscribe((state) => {
      const amb = state.ambulance;
      const status = amb.status;
      const dist = amb.distanceMeters;

      // 1. Detect trip start: ambulance starts running with progress
      if ((status === "running" || status === "paused") && dist > 5 && !isTracking.current) {
        isTracking.current = true;
        tripStartedAt.current = new Date().toISOString();
        startSimTime.current = state.simTimeSeconds;
        ackTimes.current = [];
        acknowledgedAlertIds.current = new Set();
        escalatedAlertIds.current = new Set();
        clearedAlertIds.current = new Set();
      }

      // 2. Track alerts while active
      if (isTracking.current) {
        for (const alert of state.alerts) {
          // Check acknowledgements
          if (
            (alert.state === AlertState.ACKNOWLEDGED ||
              alert.state === AlertState.IN_POSITION ||
              alert.state === AlertState.CLEARING ||
              alert.state === AlertState.VERIFIED_CLEAR) &&
            !acknowledgedAlertIds.current.has(alert.id)
          ) {
            acknowledgedAlertIds.current.add(alert.id);
            const ackTrans = alert.transitions.find((t) => t.to === AlertState.ACKNOWLEDGED);
            const createdTrans = alert.transitions.find((t) => t.to === AlertState.CREATED) ?? alert.transitions[0];
            if (ackTrans && createdTrans) {
              const diffSec = Math.max(1, Math.round((ackTrans.at - createdTrans.at) / 1000));
              ackTimes.current.push(diffSec);
            } else {
              ackTimes.current.push(8); // sensible default
            }
          }

          // Check escalations
          const hasTimeout = alert.transitions.some((t) => t.to === AlertState.NO_ACK_TIMEOUT);
          const hasNotCleared = alert.transitions.some((t) => t.to === AlertState.NOT_CLEARED);
          if ((hasTimeout || hasNotCleared || alert.escalatedFrom) && !escalatedAlertIds.current.has(alert.id)) {
            escalatedAlertIds.current.add(alert.id);
          }

          // Check verified clear
          if (alert.state === AlertState.VERIFIED_CLEAR && !clearedAlertIds.current.has(alert.id)) {
            clearedAlertIds.current.add(alert.id);
          }
        }
      }

      // 3. Finalize trip on ARRIVED
      if (status === "arrived" && isTracking.current) {
        finalizeTrip("arrived", state);
        return;
      }

      // 4. Finalize trip on restart after progress (dist dropped significantly)
      if (isTracking.current && lastDistance.current > 100 && dist < 10) {
        finalizeTrip("restarted", state);
        return;
      }

      // 5. Finalize trip on END_TRIP / idle after progress
      if (status === "idle" && isTracking.current && lastDistance.current > 50) {
        finalizeTrip("ended", state);
        return;
      }

      lastDistance.current = dist;
    });

    function finalizeTrip(outcome: "arrived" | "ended" | "restarted", state: ReturnType<typeof useSimulator.getState>) {
      isTracking.current = false;
      const started = tripStartedAt.current ?? new Date().toISOString();
      const ended = new Date().toISOString();
      const durationSec = Math.max(1, Math.round(state.simTimeSeconds - startSimTime.current));

      const alertsByJunction: Record<string, number> = {};
      state.alerts.forEach((a) => {
        alertsByJunction[a.junctionId] = (alertsByJunction[a.junctionId] ?? 0) + 1;
      });

      const ackList = ackTimes.current;
      const avgAck = ackList.length > 0 ? Math.round((ackList.reduce((a, b) => a + b, 0) / ackList.length) * 10) / 10 : 0;
      const junctionsCleared = clearedAlertIds.current.size;
      const alertsTotal = state.alerts.length;
      const escalations = escalatedAlertIds.current.size;
      const minSaved = calculateMinutesSaved(junctionsCleared, alertsTotal, durationSec);

      const tripId = `trip-${Date.now()}`;
      if (recordedTripIds.current.has(tripId)) return;
      recordedTripIds.current.add(tripId);

      const tripRecord: TripRecord = {
        id: tripId,
        startedAt: started,
        endedAt: ended,
        outcome,
        simDurationSec: durationSec,
        routeId: state.activeRouteId,
        rerouted: state.rerouted,
        alertsTotal,
        alertsByJunction,
        acknowledgedCount: acknowledgedAlertIds.current.size,
        avgAckSeconds: avgAck,
        escalations,
        noAckCount: escalations,
        junctionsCleared,
        estimatedMinutesSaved: minSaved,
      };

      useAnalyticsStore.getState().addTrip(tripRecord);
      tripStartedAt.current = null;
    }

    return () => {
      unsubscribe();
    };
  }, []);
}
