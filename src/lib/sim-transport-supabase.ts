/**
 * src/lib/sim-transport-supabase.ts
 *
 * Supabase Realtime Broadcast transport for cross-device communication.
 * Implements the same SimTransport interface as BroadcastChannelTransport,
 * so the rest of the app doesn't need to know which one is in use.
 *
 * Usage:
 *   - Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.
 *   - When those env vars are present, SupabaseBroadcastTransport is used
 *     (enables phone-to-laptop Officer view over real Supabase channels).
 *   - When env vars are absent or the Supabase connection fails, it
 *     automatically falls back to BroadcastChannelTransport (same-device tabs).
 *
 * No database tables or migrations are required — this uses Supabase's
 * ephemeral broadcast-only channels.
 */

import type { SimTransport, SimulationState, SimCommand } from "./sim-transport";
import { BroadcastChannelTransport } from "./sim-transport";

export type SupabaseConnectionState = "connecting" | "live" | "reconnecting" | "local";

type BroadcastPayload =
  | { kind: "STATE"; payload: SimulationState }
  | { kind: "COMMAND"; payload: SimCommand };

/** Callback fired when connection state changes. */
type StateChangeHandler = (state: SupabaseConnectionState) => void;

const CHANNEL_NAME = "axiom-ems-sim";
const STATE_EVENT = "sim:state";
const CMD_EVENT = "sim:command";

/**
 * Creates a Supabase Broadcast transport.
 * Returns `null` if the supabase-js library is not available (e.g., test env without mock).
 */
export class SupabaseBroadcastTransport implements SimTransport {
  private stateListeners = new Set<(state: SimulationState) => void>();
  private commandListeners = new Set<(cmd: SimCommand) => void>();
  private onStateChange: StateChangeHandler;

  // The underlying Supabase channel (typed loosely to avoid hard compile dep when pkg missing)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private channel: any = null;
  private connectionState: SupabaseConnectionState = "connecting";
  private destroyed = false;

  constructor(onStateChange: StateChangeHandler = () => {}) {
    this.onStateChange = onStateChange;
    this._connect();
  }

  private async _connect() {
    try {
      // Dynamic import so that the whole app doesn't break if the package
      // isn't installed or env vars are missing.
      const { createClient } = await import("@supabase/supabase-js");

      const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
      const supabaseKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

      if (!supabaseUrl || !supabaseKey) {
        this._setConnState("local");
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      this.channel = supabase.channel(CHANNEL_NAME);

      this.channel
        .on("broadcast", { event: STATE_EVENT }, ({ payload }: { payload: BroadcastPayload }) => {
          if (payload?.kind === "STATE") {
            this.stateListeners.forEach((fn) => fn(payload.payload as SimulationState));
          }
        })
        .on("broadcast", { event: CMD_EVENT }, ({ payload }: { payload: BroadcastPayload }) => {
          if (payload?.kind === "COMMAND") {
            this.commandListeners.forEach((fn) => fn(payload.payload as SimCommand));
          }
        })
        .subscribe((status: string) => {
          if (this.destroyed) return;
          if (status === "SUBSCRIBED") {
            this._setConnState("live");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            this._setConnState("reconnecting");
          }
        });
    } catch {
      // Package not installed or any other error → local mode
      this._setConnState("local");
    }
  }

  private _setConnState(state: SupabaseConnectionState) {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.onStateChange(state);
  }

  getConnectionState(): SupabaseConnectionState {
    return this.connectionState;
  }

  publish(state: SimulationState): void {
    if (!this.channel || this.connectionState !== "live") return;
    const payload: BroadcastPayload = { kind: "STATE", payload: state };
    this.channel.send({ type: "broadcast", event: STATE_EVENT, payload }).catch(() => {
      this._setConnState("reconnecting");
    });
  }

  subscribe(handler: (state: SimulationState) => void): () => void {
    this.stateListeners.add(handler);
    return () => this.stateListeners.delete(handler);
  }

  sendCommand(cmd: SimCommand): void {
    if (!this.channel || this.connectionState !== "live") return;
    const payload: BroadcastPayload = { kind: "COMMAND", payload: cmd };
    this.channel.send({ type: "broadcast", event: CMD_EVENT, payload }).catch(() => {
      this._setConnState("reconnecting");
    });
  }

  onCommand(handler: (cmd: SimCommand) => void): () => void {
    this.commandListeners.add(handler);
    return () => this.commandListeners.delete(handler);
  }

  destroy(): void {
    this.destroyed = true;
    this.stateListeners.clear();
    this.commandListeners.clear();
    if (this.channel) {
      try {
        this.channel.unsubscribe();
      } catch {
        // ignore
      }
      this.channel = null;
    }
  }
}

/**
 * Picks the best transport for subscriber views (Officer / Driver):
 *   - If VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set → SupabaseBroadcastTransport
 *   - Otherwise → BroadcastChannelTransport (same-device multi-tab)
 *
 * The `onStateChange` callback lets the UI update the connection chip.
 */
export function createBestTransport(
  onStateChange?: (state: SupabaseConnectionState) => void,
): SimTransport & { getConnectionState?: () => SupabaseConnectionState } {
  const hasSupabaseEnv =
    typeof import.meta !== "undefined" &&
    !!import.meta.env?.["VITE_SUPABASE_URL"] &&
    !!import.meta.env?.["VITE_SUPABASE_ANON_KEY"];

  if (hasSupabaseEnv) {
    return new SupabaseBroadcastTransport(onStateChange ?? (() => {}));
  }

  // Fallback: BroadcastChannel for same-device tabs
  if (onStateChange) onStateChange("local");
  return new BroadcastChannelTransport();
}

/**
 * Transport for the Control Room host:
 * Always publishes to local BroadcastChannel (for tabs on the same device).
 * If Supabase env vars are set, also publishes to Supabase Realtime Broadcast (for remote phones).
 * Listens to commands from both.
 */
export class CompositeHostTransport implements SimTransport {
  private local = new BroadcastChannelTransport();
  private supabase: SupabaseBroadcastTransport | null = null;

  constructor(onSupabaseStateChange?: (state: SupabaseConnectionState) => void) {
    const hasSupabaseEnv =
      typeof import.meta !== "undefined" &&
      !!import.meta.env?.["VITE_SUPABASE_URL"] &&
      !!import.meta.env?.["VITE_SUPABASE_ANON_KEY"];
    if (hasSupabaseEnv) {
      this.supabase = new SupabaseBroadcastTransport(onSupabaseStateChange ?? (() => {}));
    }
  }

  publish(state: SimulationState): void {
    this.local.publish(state);
    if (this.supabase) {
      this.supabase.publish(state);
    }
  }

  subscribe(handler: (state: SimulationState) => void): () => void {
    const u1 = this.local.subscribe(handler);
    const u2 = this.supabase ? this.supabase.subscribe(handler) : () => {};
    return () => {
      u1();
      u2();
    };
  }

  sendCommand(cmd: SimCommand): void {
    this.local.sendCommand(cmd);
    if (this.supabase) {
      this.supabase.sendCommand(cmd);
    }
  }

  onCommand(handler: (cmd: SimCommand) => void): () => void {
    const u1 = this.local.onCommand(handler);
    const u2 = this.supabase ? this.supabase.onCommand(handler) : () => {};
    return () => {
      u1();
      u2();
    };
  }

  destroy(): void {
    this.local.destroy();
    if (this.supabase) {
      this.supabase.destroy();
    }
  }
}

export function createHostTransport(
  onSupabaseStateChange?: (state: SupabaseConnectionState) => void,
): SimTransport {
  return new CompositeHostTransport(onSupabaseStateChange);
}

