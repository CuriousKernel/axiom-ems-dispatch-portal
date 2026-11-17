/**
 * src/lib/use-sim-client.ts
 *
 * Client subscription hook and store for subscriber views (Officer, Driver).
 * Receives simulation updates from the Control Room host via BroadcastChannelTransport.
 * Tracks heartbeat: if no state is received for 3 seconds, connectionState becomes "reconnecting".
 */

import { useEffect, useState, useMemo } from "react";
import {
  BroadcastChannelTransport,
  type SimulationState,
  type SimCommand,
} from "./sim-transport";
import { useSimulator } from "./simulator-engine";
import type { ConnectionState } from "./axiom/types";

// Shared client transport
const clientTransport = new BroadcastChannelTransport();

export function useSimClient() {
  // If the control room host is running in the same tab / context, we can read directly or via transport
  const hostState = useSimulator.getState().getSnapshot();

  const [state, setState] = useState<SimulationState>(() => hostState);
  const [connectionState, setConnectionState] = useState<ConnectionState>("live");

  useEffect(() => {
    let lastMsgTime = Date.now();

    // Check heartbeat every 1 second
    const interval = setInterval(() => {
      // If host is active in this tab, always live
      const hostRunning = useSimulator.getState()._tickHandle !== null;
      if (hostRunning) {
        setConnectionState("live");
        return;
      }

      if (Date.now() - lastMsgTime > 3000) {
        setConnectionState("reconnecting");
      }
    }, 1000);

    const unsubscribe = clientTransport.subscribe((nextState) => {
      lastMsgTime = Date.now();
      setState(nextState);
      setConnectionState("live");
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, []);

  const sendCommand = useMemo(() => {
    return (cmd: SimCommand) => {
      clientTransport.sendCommand(cmd);
    };
  }, []);

  return {
    state,
    connectionState,
    sendCommand,
  };
}
