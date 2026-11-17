/**
 * src/lib/__tests__/reroute.test.ts
 *
 * Tests for ambulance reroute decision logic, alternate projection, and speech helper.
 */

import { describe, it, expect, vi } from "vitest";
import {
  isUnclearable,
  shouldReroute,
  projectOntoAlt,
  speakRerouteAnnouncement,
} from "../reroute";
import { createAlert, transitionAlert, AlertState } from "../alerts";
import { PRIMARY_ROUTE, ALT_ROUTE } from "../route-data";

describe("reroute module", () => {
  describe("isUnclearable", () => {
    it("returns true when an alert is marked as LATE_ALERT", () => {
      const alert = createAlert({
        id: "al-1",
        junctionId: "ito",
        officerId: "control-room",
        isLateAlert: true,
      });

      expect(isUnclearable("ito", [alert], "CRITICAL")).toBe(true);
    });

    it("returns true when an alert reaches NOT_CLEARED state", () => {
      let alert = createAlert({
        id: "al-2",
        junctionId: "ito",
        officerId: "o3",
      });
      alert = transitionAlert(alert, AlertState.SENT, "sent");
      alert = transitionAlert(alert, AlertState.ACKNOWLEDGED, "ack");
      alert = transitionAlert(alert, AlertState.IN_POSITION, "in position");
      alert = transitionAlert(alert, AlertState.CLEARING, "clearing");
      alert = transitionAlert(alert, AlertState.NOT_CLEARED, "failed to clear");

      expect(isUnclearable("ito", [alert], "CRITICAL")).toBe(true);
    });

    it("returns true when alert reason indicates officer cannot clear", () => {
      let alert = createAlert({
        id: "al-3",
        junctionId: "ito",
        officerId: "o3",
      });
      alert = transitionAlert(alert, AlertState.SENT, "sent");
      alert = { ...alert, reason: "Officer reported cannot clear: VIP convoy" };

      expect(isUnclearable("ito", [alert], "CRITICAL")).toBe(true);
    });

    it("returns false for a normal IN_POSITION alert", () => {
      let alert = createAlert({
        id: "al-4",
        junctionId: "ito",
        officerId: "o3",
      });
      alert = transitionAlert(alert, AlertState.SENT, "sent");
      alert = transitionAlert(alert, AlertState.ACKNOWLEDGED, "ack");
      alert = transitionAlert(alert, AlertState.IN_POSITION, "in pos");

      expect(isUnclearable("ito", [alert], "CRITICAL")).toBe(false);
    });

    it("returns false if junction status is not CRITICAL", () => {
      const alert = createAlert({
        id: "al-5",
        junctionId: "ito",
        officerId: "control-room",
        isLateAlert: true,
      });

      expect(isUnclearable("ito", [alert], "CLEAR" as any)).toBe(false);
    });
  });

  describe("shouldReroute", () => {
    it("returns true when unclearable junction is ahead and clearTime exceeds detour penalty", () => {
      // Ambulance at 1000m (before ITO which is at ~4100m)
      const ambulanceDist = 1000;
      const clearTime = 300; // 5 minutes waiting time

      const decision = shouldReroute(
        PRIMARY_ROUTE,
        ALT_ROUTE,
        ambulanceDist,
        "ito",
        clearTime,
      );

      expect(decision).toBe(true);
    });

    it("returns false if junction has already been passed", () => {
      // Ambulance at 10000m (well past ITO)
      const ambulanceDist = 10000;
      const clearTime = 300;

      const decision = shouldReroute(
        PRIMARY_ROUTE,
        ALT_ROUTE,
        ambulanceDist,
        "ito",
        clearTime,
      );

      expect(decision).toBe(false);
    });

    it("returns false if clearTime is very small (clearing is faster than detour)", () => {
      const ambulanceDist = 1000;
      const clearTime = 10; // only 10s wait, detour takes ~120s

      const decision = shouldReroute(
        PRIMARY_ROUTE,
        ALT_ROUTE,
        ambulanceDist,
        "ito",
        clearTime,
      );

      expect(decision).toBe(false);
    });
  });

  describe("projectOntoAlt", () => {
    it("projects origin (Connaught Place) near distance 0m", () => {
      const cpPoint = PRIMARY_ROUTE.points[0]!;
      const projected = projectOntoAlt(cpPoint.lat, cpPoint.lng, ALT_ROUTE);

      expect(projected.distanceMeters).toBeLessThan(50);
      expect(typeof projected.heading).toBe("number");
    });

    it("projects mid-route point onto alternate route continuously", () => {
      const midPoint = PRIMARY_ROUTE.points[100]!;
      const projected = projectOntoAlt(midPoint.lat, midPoint.lng, ALT_ROUTE);

      expect(projected.distanceMeters).toBeGreaterThan(0);
      expect(projected.distanceMeters).toBeLessThan(ALT_ROUTE.totalLengthMeters);
    });
  });

  describe("speakRerouteAnnouncement", () => {
    it("is safe when speechSynthesis is not available (SSR)", () => {
      expect(() => speakRerouteAnnouncement("Test", false)).not.toThrow();
    });

    it("respects muted flag", () => {
      const speakSpy = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).speechSynthesis = { speak: speakSpy, cancel: vi.fn() };

      speakRerouteAnnouncement("Test", true);
      expect(speakSpy).not.toHaveBeenCalled();

      // Clean up
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).speechSynthesis;
    });
  });
});
