import { describe, it, expect } from "vitest";
import { buildRoute, type Route } from "../route";
import {
  AMBULANCE_CONFIG,
  createAmbulance,
  startAmbulance,
  pauseAmbulance,
  resumeAmbulance,
  stepAmbulance,
  speedAt,
  etaSeconds,
  hasPassed,
  type AmbulanceState,
} from "../ambulance";

// A 5.5 km northbound road with a junction at about the halfway mark.
const LINE = [
  { lat: 28.0, lng: 77.0 },
  { lat: 28.05, lng: 77.0 },
];
const route: Route = buildRoute(LINE, [{ id: "mid", lat: 28.025, lng: 77.0 }], 10);
const MID = route.junctionDistances["mid"]!;

/** Run the ambulance for `seconds` of simulation time in 0.5 s ticks. */
function run(state: AmbulanceState, seconds: number, tick = 0.5): AmbulanceState {
  let s = state;
  for (let t = 0; t < seconds; t += tick) s = stepAmbulance(route, s, tick);
  return s;
}

describe("speed profile", () => {
  it("cruises on open road and slows to the junction speed at the junction", () => {
    expect(speedAt(route, 0)).toBe(AMBULANCE_CONFIG.CRUISE_KMH);
    expect(speedAt(route, MID)).toBeCloseTo(AMBULANCE_CONFIG.JUNCTION_KMH, 6);
  });

  it("eases down inside the slow zone and back up after it", () => {
    const z = AMBULANCE_CONFIG.SLOW_ZONE_M;
    const far = speedAt(route, MID - z);
    const halfway = speedAt(route, MID - z / 2);
    const at = speedAt(route, MID);
    expect(far).toBeGreaterThan(halfway);
    expect(halfway).toBeGreaterThan(at);
    // symmetric after the junction
    expect(speedAt(route, MID + z / 2)).toBeCloseTo(halfway, 6);
  });
});

describe("motion", () => {
  it("idle ambulance does not move", () => {
    const s = stepAmbulance(route, createAmbulance(), 10);
    expect(s.distanceMeters).toBe(0);
    expect(s.status).toBe("idle");
  });

  it("is deterministic: same inputs always give the same result", () => {
    const a = run(startAmbulance(route), 120);
    const b = run(startAmbulance(route), 120);
    expect(a).toEqual(b);
  });

  it("step size does not change the outcome (a 4x tick equals four 1x ticks)", () => {
    const one = stepAmbulance(route, startAmbulance(route), 2);
    let four = startAmbulance(route);
    for (let i = 0; i < 4; i++) four = stepAmbulance(route, four, 0.5);
    expect(one.distanceMeters).toBeCloseTo(four.distanceMeters, 6);
  });

  it("travels at cruising speed on open road", () => {
    const s = run(startAmbulance(route), 10);
    // 55 km/h = 15.28 m/s -> about 152.8 m in 10 s
    expect(s.distanceMeters).toBeCloseTo((AMBULANCE_CONFIG.CRUISE_KMH / 3.6) * 10, 0);
  });

  it("slows down as it approaches the junction", () => {
    let s = startAmbulance(route);
    let minSpeed = Infinity;
    while (s.distanceMeters < MID + 20 && s.status === "running") {
      s = stepAmbulance(route, s, 0.5);
      if (s.distanceMeters > MID - 300) minSpeed = Math.min(minSpeed, s.speedKmh);
    }
    expect(minSpeed).toBeLessThan(AMBULANCE_CONFIG.CRUISE_KMH - 10);
  });

  it("pause stops motion and resume continues from the same place", () => {
    const moving = run(startAmbulance(route), 20);
    const paused = pauseAmbulance(moving);
    expect(paused.status).toBe("paused");
    const stillPaused = stepAmbulance(route, paused, 30);
    expect(stillPaused.distanceMeters).toBe(moving.distanceMeters);
    const resumed = resumeAmbulance(stillPaused);
    expect(resumed.status).toBe("running");
    expect(stepAmbulance(route, resumed, 1).distanceMeters).toBeGreaterThan(moving.distanceMeters);
  });

  it("arrives at exactly the end of the route and stops", () => {
    let s = startAmbulance(route);
    let guard = 0;
    while (s.status === "running" && guard++ < 100000) s = stepAmbulance(route, s, 1);
    expect(s.status).toBe("arrived");
    expect(s.distanceMeters).toBe(route.totalMeters);
    expect(s.speedKmh).toBe(0);
    expect(stepAmbulance(route, s, 10)).toEqual(s);
  });

  it("ignores zero and negative time steps", () => {
    const s = startAmbulance(route);
    expect(stepAmbulance(route, s, 0)).toEqual(s);
    expect(stepAmbulance(route, s, -5)).toEqual(s);
  });
});

describe("ETA to a junction", () => {
  it("matches the time the simulation actually takes to get there", () => {
    const start = startAmbulance(route);
    const predicted = etaSeconds(route, start, "mid");

    let s = start;
    let t = 0;
    while (s.distanceMeters < MID && s.status === "running") {
      s = stepAmbulance(route, s, 0.1);
      t += 0.1;
    }
    // within 2% (the ETA integrates in 10 m steps, the sim in ~0.1 s steps)
    expect(Math.abs(predicted - t) / t).toBeLessThan(0.02);
  });

  it("decreases steadily as the ambulance approaches", () => {
    let s = startAmbulance(route);
    let prev = etaSeconds(route, s, "mid");
    // 10 x 10 s at ~15 m/s is ~1.5 km, still short of the junction at ~2.7 km.
    for (let i = 0; i < 10; i++) {
      s = run(s, 10);
      const eta = etaSeconds(route, s, "mid");
      expect(eta).toBeLessThan(prev);
      prev = eta;
    }
  });

  it("is 0 once the junction has been reached or passed", () => {
    const passed: AmbulanceState = { distanceMeters: MID + 100, speedKmh: 55, status: "running" };
    expect(etaSeconds(route, passed, "mid")).toBe(0);
    expect(hasPassed(route, passed, "mid")).toBe(true);
    expect(hasPassed(route, startAmbulance(route), "mid")).toBe(false);
  });
});
