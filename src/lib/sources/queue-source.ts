/**
 * src/lib/sources/queue-source.ts
 *
 * The QueueSource interface that the entire app depends on.
 * A vision-based source can replace SimulatedSource here without touching any
 * other module - only this interface needs to be satisfied.
 */

export interface QueueReading {
  junctionId: string;
  vehicleCount: number;
  queueLengthMeters: number;
  timestamp: number;
}

export interface QueueSource {
  /**
   * Return the current reading for a junction.
   * Implementations must be synchronous and pure (no async, no I/O).
   */
  getReading(junctionId: string): QueueReading;
}
