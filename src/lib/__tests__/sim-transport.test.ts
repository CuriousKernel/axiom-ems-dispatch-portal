/**
 * src/lib/__tests__/sim-transport.test.ts
 *
 * Unit tests for src/lib/sim-transport.ts
 * Tests: host applies commands correctly, subscribers never mutate state,
 * serialization round-trip.
 *
 * We force the memory-bus fallback by deleting globalThis.BroadcastChannel so
 * BroadcastChannelTransport uses the synchronous in-memory bus. The real
 * BroadcastChannel API delivers postMessage asynchronously (and not to the
 * sender), making deterministic unit-tests impractical without a DOM runtime.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  BroadcastChannelTransport,
  globalMemoryBus,
  type SimulationState,
  type SimCommand,
} from "../sim-transport";

// Save and remove BroadcastChannel so transports fall back to globalMemoryBus
const OriginalBC = globalThis.BroadcastChannel;

function makeSampleState(): SimulationState {
  return {
    simTimeSeconds: 42,
    speed: 2,
    paused: false,
    driverPriority: "P1",
    ambulance: {
      distanceMeters: 1250,
      speedKmh: 45,
      smoothedSpeedKmh: 48,
      status: "running",
      lat: 28.6258,
      lng: 77.2341,
      heading: 110,
    },
    readings: {
      mandi: {
        junctionId: "mandi",
        name: "Mandi House",
        vehicleCount: 15,
        clearTime: 30,
        eta: 75,
        status: "WATCH",
        density: 15,
        distanceMeters: 1500,
      },
    },
    alerts: [],
    events: [
      { id: "e1", at: 1000, type: "system", message: "Simulation started" },
    ],
    hostTimestamp: 123456789,
  };
}

describe("SimTransport (Cross-tab communication)", () => {
  let transportHost: BroadcastChannelTransport;
  let transportClient: BroadcastChannelTransport;

  beforeEach(() => {
    // Force synchronous memory-bus path
    // @ts-expect-error – intentionally removing for test isolation
    delete globalThis.BroadcastChannel;
    globalMemoryBus.clear();
    transportHost = new BroadcastChannelTransport("test-sim-channel");
    transportClient = new BroadcastChannelTransport("test-sim-channel");
  });

  afterEach(() => {
    globalThis.BroadcastChannel = OriginalBC;
    globalMemoryBus.clear();
    transportHost.destroy();
    transportClient.destroy();
  });

  it("serialization round-trip preserves all state fields and types", () => {
    const original = makeSampleState();
    const serialized = JSON.stringify(original);
    const deserialized: SimulationState = JSON.parse(serialized);

    expect(deserialized.simTimeSeconds).toBe(original.simTimeSeconds);
    expect(deserialized.ambulance.lat).toBe(original.ambulance.lat);
    expect(deserialized.ambulance.heading).toBe(original.ambulance.heading);
    expect(deserialized.readings["mandi"]?.status).toBe("WATCH");
    expect(deserialized.events[0]?.message).toBe(original.events[0]?.message);
  });

  it("subscriber receives published state from host", () => {
    let receivedState: SimulationState | null = null;
    const unsub = transportClient.subscribe((s) => {
      receivedState = s;
    });

    const sample = makeSampleState();
    transportHost.publish(sample);

    expect(receivedState).not.toBeNull();
    expect(receivedState!.simTimeSeconds).toBe(sample.simTimeSeconds);
    expect(receivedState!.ambulance.speedKmh).toBe(sample.ambulance.speedKmh);

    unsub();
  });

  it("subscribers never mutate host state (deep copy isolation)", () => {
    const original = makeSampleState();
    let received: SimulationState | null = null;

    transportClient.subscribe((s) => {
      received = s;
      // Malicious or buggy subscriber attempts to mutate
      received.ambulance.speedKmh = 999;
      received.readings["mandi"]!.vehicleCount = 0;
    });

    transportHost.publish(original);

    // Host's original object is untouched
    expect(original.ambulance.speedKmh).toBe(45);
    expect(original.readings["mandi"]!.vehicleCount).toBe(15);
  });

  it("host receives commands from client", () => {
    let receivedCmd: SimCommand | null = null;
    const unsub = transportHost.onCommand((cmd) => {
      receivedCmd = cmd;
    });

    const cmd: SimCommand = {
      type: "ACKNOWLEDGE_ALERT",
      alertId: "al-123",
      officerId: "o2",
    };

    transportClient.sendCommand(cmd);

    expect(receivedCmd).not.toBeNull();
    const ack = receivedCmd as unknown as Extract<SimCommand, { type: "ACKNOWLEDGE_ALERT" }>;
    expect(ack.type).toBe("ACKNOWLEDGE_ALERT");
    expect(ack.alertId).toBe("al-123");
    expect(ack.officerId).toBe("o2");

    unsub();
  });
});
