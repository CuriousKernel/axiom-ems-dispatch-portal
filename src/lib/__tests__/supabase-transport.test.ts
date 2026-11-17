/**
 * src/lib/__tests__/supabase-transport.test.ts
 *
 * Tests for Supabase transport and fallback behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createBestTransport,
  SupabaseBroadcastTransport,
  CompositeHostTransport,
} from "../sim-transport-supabase";

describe("sim-transport-supabase", () => {
  beforeEach(() => {
    // Force memory bus fallback for test determinism
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).BroadcastChannel;
  });

  it("createBestTransport falls back to local when env vars are missing", () => {
    let notifiedState = "";
    const transport = createBestTransport((state) => {
      notifiedState = state;
    });

    expect(transport).toBeDefined();
    expect(notifiedState).toBe("local");
    transport.destroy();
  });

  it("SupabaseBroadcastTransport initializes with local state when env vars absent", async () => {
    const states: string[] = [];
    const transport = new SupabaseBroadcastTransport((st) => states.push(st));

    // Wait microtask for async _connect to complete
    await new Promise((r) => setTimeout(r, 10));

    expect(states).toContain("local");
    expect(transport.getConnectionState()).toBe("local");
    transport.destroy();
  });

  it("CompositeHostTransport publishes state and handles commands without errors", () => {
    const host = new CompositeHostTransport();
    const receivedCommands: any[] = [];

    const unsubCmd = host.onCommand((cmd) => {
      receivedCommands.push(cmd);
    });

    // Send a command
    host.sendCommand({ type: "START_TRIP" });
    expect(receivedCommands.length).toBe(1);
    expect(receivedCommands[0].type).toBe("START_TRIP");

    unsubCmd();
    host.destroy();
  });
});
