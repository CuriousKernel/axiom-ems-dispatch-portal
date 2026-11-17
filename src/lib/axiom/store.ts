import { create } from "zustand";
import type { ConnectionState, Priority, QueueSourceKind } from "./types";

type Speed = 1 | 2 | 4;

interface AxiomUiState {
  connection: ConnectionState;
  source: QueueSourceKind;
  speed: Speed;
  paused: boolean;
  controlDark: boolean;
  selectedJunctionId: string;
  driverTripActive: boolean;
  driverPriority: Priority;
  setSource: (s: QueueSourceKind) => void;
  setSpeed: (s: Speed) => void;
  togglePaused: () => void;
  toggleControlDark: () => void;
  selectJunction: (id: string) => void;
  setDriverTripActive: (v: boolean) => void;
  setDriverPriority: (p: Priority) => void;
}

/** UI-only state for Phase 1. The simulation clock and realtime sync arrive in later phases. */
export const useAxiom = create<AxiomUiState>((set) => ({
  connection: "mock",
  source: "simulator",
  speed: 1,
  paused: false,
  controlDark: false,
  selectedJunctionId: "ito",
  driverTripActive: false,
  driverPriority: "P1",
  setSource: (source) => set({ source }),
  setSpeed: (speed) => set({ speed }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleControlDark: () => set((s) => ({ controlDark: !s.controlDark })),
  selectJunction: (selectedJunctionId) => set({ selectedJunctionId }),
  setDriverTripActive: (driverTripActive) => set({ driverTripActive }),
  setDriverPriority: (driverPriority) => set({ driverPriority }),
}));
