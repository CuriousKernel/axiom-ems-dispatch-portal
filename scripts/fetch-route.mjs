/**
 * scripts/fetch-route.mjs
 *
 * One-off script: fetches the real road route through the six Delhi junctions
 * from the public OSRM service and saves it to src/data/route-primary.json.
 * The app loads that saved file at runtime, so the demo never needs internet.
 *
 * Usage (needs internet, run on your laptop):
 *   npm run fetch-route
 *
 * Keep WAYPOINTS in sync with the JUNCTIONS list in src/lib/axiom/seed.ts.
 */
import { writeFile, mkdir } from "node:fs/promises";

const WAYPOINTS = [
  { id: "cp", name: "Connaught Place", lat: 28.6315, lng: 77.2167 },
  { id: "mandi", name: "Mandi House", lat: 28.6258, lng: 77.2341 },
  { id: "ito", name: "ITO", lat: 28.6289, lng: 77.241 },
  { id: "pragati", name: "Pragati Maidan", lat: 28.6183, lng: 77.2453 },
  { id: "ashram", name: "Ashram Chowk", lat: 28.5713, lng: 77.2588 },
  { id: "aiims", name: "AIIMS", lat: 28.5672, lng: 77.21 },
];

const coords = WAYPOINTS.map((w) => `${w.lng},${w.lat}`).join(";");
const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;

console.log("Requesting route from OSRM...");
const res = await fetch(url);
if (!res.ok) {
  console.error(`OSRM request failed: HTTP ${res.status}. Nothing was written.`);
  process.exit(1);
}
const data = await res.json();
if (data.code !== "Ok" || !data.routes?.[0]) {
  console.error("OSRM did not return a route:", data.code, data.message ?? "");
  process.exit(1);
}

const route = data.routes[0];
const out = {
  synthetic: false,
  source: "OSRM public demo server (driving profile)",
  fetchedAt: new Date().toISOString(),
  distanceMeters: route.distance,
  durationSeconds: route.duration,
  waypoints: WAYPOINTS,
  // GeoJSON order is [lng, lat]
  coordinates: route.geometry.coordinates,
};

await mkdir("src/data", { recursive: true });
await writeFile("src/data/route-primary.json", JSON.stringify(out));
console.log(
  `Saved src/data/route-primary.json: ${(route.distance / 1000).toFixed(1)} km, ` +
    `${route.geometry.coordinates.length} points.`,
);
