export type JunctionStatus = "CLEAR" | "WATCH" | "CRITICAL" | "PASSED";

export type AlertState =
  | "CREATED"
  | "SENT"
  | "ACKNOWLEDGED"
  | "IN_POSITION"
  | "CLEARING"
  | "VERIFIED_CLEAR"
  | "NO_ACK_TIMEOUT"
  | "NOT_CLEARED";

export type Priority = "P1" | "P2";
export type QueueSourceKind = "simulator" | "vision";
export type ConnectionState = "mock" | "live" | "reconnecting";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Junction extends LatLng {
  id: string;
  name: string;
  /** Vehicles cleared per second from the approach lane. */
  dischargeRate: number;
  cameraId: string | null;
}

export interface Officer extends LatLng {
  id: string;
  name: string;
  rank: string;
  junctionId: string;
  online: boolean;
  activeAlerts: number;
}

export interface Ambulance {
  id: string;
  plate: string;
  priority: Priority;
  status: "idle" | "en_route" | "arrived";
  caseLabel: string;
}

export interface JunctionReading {
  junctionId: string;
  queueCount: number;
  /** Seconds. */
  clearTime: number;
  /** Seconds until the ambulance arrives. */
  eta: number;
  status: JunctionStatus;
  source: QueueSourceKind;
}

export interface AlertRecord {
  id: string;
  junctionId: string;
  officerId: string;
  state: AlertState;
  createdAt: number;
  /** Seconds left before escalation (mock). */
  escalatesIn: number | null;
}

export interface EventRecord {
  id: string;
  /** Seconds since trip start. */
  t: number;
  type: "trip" | "status" | "alert" | "officer" | "system";
  message: string;
}

export interface OfficerHistoryItem {
  id: string;
  junctionId: string;
  date: string;
  responseSeconds: number;
  outcome: "Verified clear" | "Escalated" | "Not cleared";
}
