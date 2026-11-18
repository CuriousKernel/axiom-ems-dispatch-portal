/**
 * src/lib/use-sim-client.ts
 *
 * Client subscription hook for subscriber views (Officer, Driver).
 * Receives simulation updates from the Control Room host via the best available transport:
 *   - Supabase Broadcast when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set (cross-device)
 *   - BroadcastChannel for same-device multi-tab (local mode)
 *
 * Connection state:
 *   "live"         — messages are flowing
 *   "reconnecting" — no message in 3 s (or Supabase channel error)
 *   "local"        — using BroadcastChannel fallback (no Supabase keys)
 */

import { useEffect, useRef, useState, useMemo } from "react";
import type { SimulationState, SimCommand } from "./sim-transport";
import { createBestTransport, type SupabaseConnectionState } from "./sim-transport-supabase";
import { useSimulator } from "./simulator-engine";

export type ClientConnectionState = SupabaseConnectionState;

// Module-level cached transport so all hook instances share one connection.
// Lazy-initialised on first hook call.
let _sharedTransport: ReturnType<typeof createBestTransport> | null = null;
let _sharedConnState: SupabaseConnectionState = "connecting";
const _connStateListeners = new Set<(s: SupabaseConnectionState) => void>();

function getSharedTransport() {
  if (!_sharedTransport) {
    _sharedTransport = createBestTransport((state) => {
      _sharedConnState = state;
      _connStateListeners.forEach((fn) => fn(state));
    });
  }
  return _sharedTransport;
}

export function useSimClient() {
  const hostSnapshot = useSimulator.getState().getSnapshot();

  const [state, setState] = useState<SimulationState>(() => hostSnapshot);
  const [connectionState, setConnectionState] = useState<ClientConnectionState>(() => _sharedConnState);
  const [isStale, setIsStale] = useState(false);
  const lastMsgTimeRef = useRef(Date.now());

  useEffect(() => {
    const transport = getSharedTransport();

    // Listen to transport-level connection state changes
    const connListener = (s: SupabaseConnectionState) => setConnectionState(s);
    _connStateListeners.add(connListener);

    // Heartbeat: if no state received in 3s and host isn't local, flag stale / reconnecting
    const heartbeatInterval = setInterval(() => {
      const hostRunning = useSimulator.getState()._tickHandle !== null;
      if (hostRunning) {
        // Host is in this tab — always live
        setIsStale(false);
        setConnectionState("live");
        return;
      }
      const stale = Date.now() - lastMsgTimeRef.current > 3000;
      setIsStale(stale);
      if (stale) {
        setConnectionState("reconnecting");
      }
    }, 1000);

    const unsubscribe = transport.subscribe((nextState) => {
      lastMsgTimeRef.current = Date.now();
      setState(nextState);
      setIsStale(false);
      setConnectionState("live");
    });

    return () => {
      clearInterval(heartbeatInterval);
      unsubscribe();
      _connStateListeners.delete(connListener);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sendCommand = useMemo(() => {
    return (cmd: SimCommand) => {
      getSharedTransport().sendCommand(cmd);
    };
  }, []);

  return {
    state,
    connectionState,
    isStale,
    sendCommand,
  };
}
