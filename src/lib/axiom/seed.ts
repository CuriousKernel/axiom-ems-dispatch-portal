/**
 * Phase 1 seed + mock snapshot. Static, deterministic values only (no randomness at
 * module scope). Junction coordinates are real; officers and the ambulance are fictional.
 */
import type {
  AlertRecord,
  Ambulance,
  EventRecord,
  Junction,
  JunctionReading,
  Officer,
  OfficerHistoryItem,
} from "./types";

export const JUNCTIONS: Junction[] = [
  { id: "cp", name: "Connaught Place", lat: 28.6315, lng: 77.2167, dischargeRate: 0.5, cameraId: "cam-cp-01" },
  { id: "mandi", name: "Mandi House", lat: 28.6258, lng: 77.2341, dischargeRate: 0.5, cameraId: "cam-mh-01" },
  { id: "ito", name: "ITO", lat: 28.6289, lng: 77.241, dischargeRate: 0.5, cameraId: "cam-ito-01" },
  { id: "pragati", name: "Pragati Maidan", lat: 28.6183, lng: 77.2453, dischargeRate: 0.6, cameraId: null },
  { id: "ashram", name: "Ashram Chowk", lat: 28.5713, lng: 77.2588, dischargeRate: 0.5, cameraId: null },
  { id: "aiims", name: "AIIMS", lat: 28.5672, lng: 77.21, dischargeRate: 0.5, cameraId: "cam-aiims-01" },
];

export const HOSPITAL_ID = "aiims";
export const ORIGIN: Junction = JUNCTIONS[0]!;

export const OFFICERS: Officer[] = [
  { id: "o1", name: "Arjun Malhotra", rank: "Insp.", junctionId: "cp", lat: 28.6322, lng: 77.2178, online: true, activeAlerts: 0 },
  { id: "o2", name: "Kavita Rawat", rank: "SI", junctionId: "mandi", lat: 28.6264, lng: 77.2333, online: true, activeAlerts: 0 },
  { id: "o3", name: "Rohit Sehgal", rank: "ASI", junctionId: "ito", lat: 28.6296, lng: 77.2402, online: true, activeAlerts: 1 },
  { id: "o4", name: "Neha Bisht", rank: "HC", junctionId: "ito", lat: 28.6279, lng: 77.2421, online: true, activeAlerts: 0 },
  { id: "o5", name: "Imran Qureshi", rank: "SI", junctionId: "pragati", lat: 28.6191, lng: 77.2446, online: true, activeAlerts: 0 },
  { id: "o6", name: "Pooja Nair", rank: "ASI", junctionId: "ashram", lat: 28.572, lng: 77.2579, online: false, activeAlerts: 0 },
  { id: "o7", name: "Vikram Tomar", rank: "HC", junctionId: "ashram", lat: 28.5706, lng: 77.2597, online: true, activeAlerts: 0 },
  { id: "o8", name: "Sunil Yadav", rank: "Const.", junctionId: "aiims", lat: 28.568, lng: 77.2112, online: true, activeAlerts: 0 },
];

export const AMBULANCE: Ambulance = {
  id: "amb-1",
  plate: "DL 1CA 0108",
  priority: "P1",
  status: "en_route",
  caseLabel: "Cardiac",
};

/** Officer shown by default on /officer. */
export const DEFAULT_OFFICER_ID = "o2";

/**
 * Mock readings, consistent with the brief's formula
 * (clear_time = queue / discharge_rate; CRITICAL if clear_time + 10 >= eta; WATCH within 20 s).
 */
export const MOCK_READINGS: JunctionReading[] = [
  { junctionId: "cp", queueCount: 4, clearTime: 8, eta: 0, status: "CLEAR", source: "simulator" },
  { junctionId: "mandi", queueCount: 34, clearTime: 68, eta: 95, status: "WATCH", source: "simulator" },
  { junctionId: "ito", queueCount: 75, clearTime: 150, eta: 150, status: "CRITICAL", source: "simulator" },
  { junctionId: "pragati", queueCount: 12, clearTime: 20, eta: 260, status: "CLEAR", source: "simulator" },
  { junctionId: "ashram", queueCount: 22, clearTime: 44, eta: 520, status: "CLEAR", source: "simulator" },
  { junctionId: "aiims", queueCount: 6, clearTime: 12, eta: 760, status: "CLEAR", source: "simulator" },
];

export const MOCK_ALERTS: AlertRecord[] = [
  { id: "al-1", junctionId: "ito", officerId: "o3", state: "SENT", createdAt: 42, escalatesIn: 25 },
];

export const MOCK_EVENTS: EventRecord[] = [
  { id: "e1", t: 0, type: "trip", message: "Trip started: DL 1CA 0108, P1 cardiac, Connaught Place to AIIMS" },
  { id: "e2", t: 12, type: "status", message: "Mandi House moved to WATCH (queue 34, clear in 1:08)" },
  { id: "e3", t: 42, type: "status", message: "ITO moved to CRITICAL (queue 75, clear in 2:30, ETA 2:30)" },
  { id: "e4", t: 42, type: "alert", message: "Alert sent to ASI Rohit Sehgal for ITO" },
  { id: "e5", t: 43, type: "system", message: "Mock mode: data is static in Phase 1" },
];

export const MOCK_OFFICER_HISTORY: OfficerHistoryItem[] = [
  { id: "h1", junctionId: "mandi", date: "16 Nov, 18:42", responseSeconds: 11, outcome: "Verified clear" },
  { id: "h2", junctionId: "mandi", date: "15 Nov, 09:15", responseSeconds: 19, outcome: "Verified clear" },
  { id: "h3", junctionId: "mandi", date: "13 Nov, 21:03", responseSeconds: 34, outcome: "Escalated" },
];

/** Mock clear-time vs ETA series for the selected-junction chart (seconds, last 60 s). */
export function mockTrend(reading: JunctionReading) {
  return Array.from({ length: 13 }, (_, i) => {
    const back = (12 - i) * 5;
    return {
      t: -back,
      eta: reading.eta + back,
      clearTime: Math.max(0, Math.round(reading.clearTime - back * 0.4 + (i % 3) * 2)),
    };
  });
}

export const junctionById = (id: string) => JUNCTIONS.find((j) => j.id === id);
export const officerById = (id: string) => OFFICERS.find((o) => o.id === id);
export const readingFor = (id: string) => MOCK_READINGS.find((r) => r.junctionId === id);
export const officersAt = (junctionId: string) => OFFICERS.filter((o) => o.junctionId === junctionId);
