import { JUNCTIONS, MOCK_READINGS } from "./seed";
import type { Junction, JunctionStatus } from "./types";

/** Junctions merged with their current (mock) status, in route order. */
export function corridorWithStatus(): (Junction & { status: JunctionStatus })[] {
  return JUNCTIONS.map((j) => ({
    ...j,
    status: MOCK_READINGS.find((r) => r.junctionId === j.id)?.status ?? "CLEAR",
  }));
}

/** Phase 1 placeholder: straight lines between junctions. Real road geometry arrives later. */
export const ROUTE_PREVIEW = JUNCTIONS.map(({ lat, lng }) => ({ lat, lng }));
