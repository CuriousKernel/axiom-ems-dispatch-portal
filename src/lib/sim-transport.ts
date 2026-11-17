/**
 * src/lib/sim-transport.ts
 *
 * Cross-tab communication transport interface and BroadcastChannel implementation.
 * Allows the Control Room to act as the single source of truth host, while
 * Officer and Driver tabs act as pure subscribers that dispatch commands back.
 */

import type { AmbulanceStatus } from "./ambulance";
import type { AlertRecord } from "./alerts";
import type { JunctionStatus, Priority } from "./axiom/types";
import type { ScenarioName } from "./sources/simulated";

export interface JunctionSimReading {
  junctionId: string;
  name: string;
  vehicleCount: number;
  clearTime: number;
  eta: number;
  status: JunctionStatus;
  density: number;
  distanceMeters: number;
}

export interface SimEvent {
  id: string;
  at: number;
  type: "status" | "alert" | "system" | "officer" | "trip";
  message: string;
}

export interface SimulationState {
  simTimeSeconds: number;
  speed: 1 | 2 | 4;
  paused: boolean;
  driverPriority: Priority;
  ambulance: {
    distanceMeters: number;
    speedKmh: number;
    smoothedSpeedKmh: number;
    status: AmbulanceStatus;
    lat: number;
    lng: number;
    heading: number;
  };
  readings: Record<string, JunctionSimReading>;
  alerts: AlertRecord[];
  events: SimEvent[];
  hostTimestamp: number;
}

export type SimCommand =
  | { type: "START_TRIP" }
  | { type: "END_TRIP" }
  | { type: "PAUSE_TRIP" }
  | { type: "RESUME_TRIP" }
  | { type: "RESTART_TRIP" }
  | { type: "SET_SPEED"; speed: 1 | 2 | 4 }
  | { type: "SET_PRIORITY"; priority: Priority }
  | { type: "SET_DENSITY"; junctionId: string; density: number }
  | { type: "APPLY_SCENARIO"; scenario: ScenarioName }
  | { type: "ACKNOWLEDGE_ALERT"; alertId: string; officerId: string }
  | { type: "IN_POSITION"; alertId: string; officerId: string }
  | { type: "ROAD_CLEARED"; alertId: string; officerId: string }
  | { type: "CANT_CLEAR"; alertId: string; officerId: string; reason?: string };

export interface SimTransport {
  publish(state: SimulationState): void;
  subscribe(handler: (state: SimulationState) => void): () => void;
  sendCommand(cmd: SimCommand): void;
  onCommand(handler: (cmd: SimCommand) => void): () => void;
  destroy(): void;
}

// In-memory bus fallback for environments without native BroadcastChannel
class MemoryBus {
  private stateSubscribers: Set<(state: SimulationState) => void> = new Set();
  private commandSubscribers: Set<(cmd: SimCommand) => void> = new Set();

  publish(state: SimulationState) {
    const clone = JSON.parse(JSON.stringify(state));
    this.stateSubscribers.forEach((fn) => fn(clone));
  }

  subscribe(fn: (state: SimulationState) => void) {
    this.stateSubscribers.add(fn);
    return () => this.stateSubscribers.delete(fn);
  }

  sendCommand(cmd: SimCommand) {
    const clone = JSON.parse(JSON.stringify(cmd));
    this.commandSubscribers.forEach((fn) => fn(clone));
  }

  onCommand(fn: (cmd: SimCommand) => void) {
    this.commandSubscribers.add(fn);
    return () => this.commandSubscribers.delete(fn);
  }

  clear() {
    this.stateSubscribers.clear();
    this.commandSubscribers.clear();
  }
}

export const globalMemoryBus = new MemoryBus();

type TransportMessage =
  | { kind: "STATE"; payload: SimulationState }
  | { kind: "COMMAND"; payload: SimCommand };

export class BroadcastChannelTransport implements SimTransport {
  private channel: BroadcastChannel | null = null;
  private stateListeners: Set<(state: SimulationState) => void> = new Set();
  private commandListeners: Set<(cmd: SimCommand) => void> = new Set();
  private channelName: string;
  private memoryFallback = false;

  constructor(channelName = "axiom-ems-sim-transport") {
    this.channelName = channelName;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        this.channel = new BroadcastChannel(channelName);
        this.channel.onmessage = (event: MessageEvent<TransportMessage>) => {
          this.handleIncoming(event.data);
        };
      } catch {
        this.memoryFallback = true;
      }
    } else {
      this.memoryFallback = true;
    }
  }

  private handleIncoming(data: TransportMessage) {
    if (!data || typeof data !== "object") return;
    if (data.kind === "STATE") {
      this.stateListeners.forEach((fn) => fn(data.payload));
    } else if (data.kind === "COMMAND") {
      this.commandListeners.forEach((fn) => fn(data.payload));
    }
  }

  publish(state: SimulationState): void {
    if (this.memoryFallback || !this.channel) {
      globalMemoryBus.publish(state);
      return;
    }
    const msg: TransportMessage = { kind: "STATE", payload: state };
    this.channel.postMessage(msg);
  }

  subscribe(handler: (state: SimulationState) => void): () => void {
    this.stateListeners.add(handler);
    let memUnsub: (() => void) | null = null;
    if (this.memoryFallback || !this.channel) {
      memUnsub = globalMemoryBus.subscribe(handler);
    }
    return () => {
      this.stateListeners.delete(handler);
      if (memUnsub) memUnsub();
    };
  }

  sendCommand(cmd: SimCommand): void {
    if (this.memoryFallback || !this.channel) {
      globalMemoryBus.sendCommand(cmd);
      return;
    }
    const msg: TransportMessage = { kind: "COMMAND", payload: cmd };
    this.channel.postMessage(msg);
  }

  onCommand(handler: (cmd: SimCommand) => void): () => void {
    this.commandListeners.add(handler);
    let memUnsub: (() => void) | null = null;
    if (this.memoryFallback || !this.channel) {
      memUnsub = globalMemoryBus.onCommand(handler);
    }
    return () => {
      this.commandListeners.delete(handler);
      if (memUnsub) memUnsub();
    };
  }

  destroy(): void {
    this.stateListeners.clear();
    this.commandListeners.clear();
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}
